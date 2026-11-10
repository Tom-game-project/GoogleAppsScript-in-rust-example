//! Tests for `upload_pack`: unit tests plus end-to-end tests that serve an in-memory copy of a real
//! repository over HTTP and drive it with real `git` (Smart HTTP / `git fetch-pack`) and with
//! `tools/git-remote-gas` (the GAS-style JSON + Base64 endpoint). The end-to-end tests are skipped
//! when `git` / `python3` are not installed.

use super::*;
use crate::git_server::{CommitItem, apply_git_delta};
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};

// ---------------------------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------------------------

fn pkt(line: &str) -> Vec<u8> {
    let data = format!("{}\n", line);
    let mut out = format!("{:04x}", data.len() + 4).into_bytes();
    out.extend_from_slice(data.as_bytes());
    out
}

#[test]
fn delta_round_trips_through_apply_git_delta() {
    let base: Vec<u8> = (0..4000u32).flat_map(|i| format!("line {}\n", i).into_bytes()).collect();
    let mut target = base.clone();
    target.splice(1000..1010, b"CHANGED!!!".iter().copied());
    target.extend_from_slice(b"appended tail\n");
    target.drain(20000..20500);
    let delta = create_delta(&base, &target, target.len() / 2).expect("delta should be small");
    assert!(delta.len() < target.len() / 20, "delta too large: {}", delta.len());
    assert_eq!(apply_git_delta(&base, &delta).unwrap(), target);
}

#[test]
fn delta_rejects_unrelated_content() {
    let base = vec![b'a'; 1000];
    let target: Vec<u8> = (0..1000u32).map(|i| (i * 7919 % 251) as u8).collect();
    assert!(create_delta(&base, &target, target.len() / 2).is_none());
}

#[test]
fn delta_handles_long_copies_and_large_offsets() {
    let base: Vec<u8> = (0..300_000u32).map(|i| (i.wrapping_mul(2654435761) >> 13) as u8).collect();
    let mut target = base[70_000..].to_vec();
    target.extend_from_slice(&base[..70_000]);
    let delta = create_delta(&base, &target, target.len() / 2).unwrap();
    assert_eq!(apply_git_delta(&base, &delta).unwrap(), target);
}

#[test]
fn parse_request_sections() {
    let a = "1".repeat(40);
    let b = "2".repeat(40);
    let mut body = pkt(&format!("want {} multi_ack side-band-64k ofs-delta", a));
    body.extend(pkt(&format!("shallow {}", b)));
    body.extend(pkt("deepen 3"));
    body.extend(b"0000");
    body.extend(pkt(&format!("have {}", b)));
    body.extend(b"0000");
    let req = UploadRequest::parse(&body).unwrap();
    assert_eq!(req.wants.len(), 1);
    assert_eq!(req.client_shallows.len(), 1);
    assert_eq!(req.deepen, Some(3));
    assert_eq!(req.haves.len(), 1);
    assert!(!req.done);
    assert!(req.has_cap("multi_ack") && req.has_cap("ofs-delta"));

    let mut body = pkt(&format!("want {}", a));
    body.extend(pkt("deepen-since 1700000000"));
    assert!(UploadRequest::parse(&body).is_err());
}

// ---------------------------------------------------------------------------------------------
// In-memory repository loaded from a real git repository
// ---------------------------------------------------------------------------------------------

#[derive(Default)]
struct MemRepo {
    objects: HashMap<ObjectId, Vec<u8>>,
    commits: Vec<CommitItem>,
    refs: BTreeMap<String, ObjectId>,
    head_symref: String,
    head_oid: Option<ObjectId>,
}

impl GitObjectReader for MemRepo {
    fn read_loose(&mut self, oid: &ObjectId) -> Option<Vec<u8>> {
        self.objects.get(oid).cloned()
    }
    fn list_commits(&mut self) -> Vec<CommitItem> {
        self.commits.clone()
    }
}

impl MemRepo {
    fn load(repo: &Path) -> Self {
        let mut me = MemRepo::default();
        let out = Command::new("git")
            .args(["cat-file", "--batch-all-objects", "--batch"])
            .current_dir(repo)
            .envs(git_env(repo))
            .output()
            .expect("git cat-file");
        let data = out.stdout;
        let mut pos = 0;
        while pos < data.len() {
            let nl = pos + data[pos..].iter().position(|&b| b == b'\n').unwrap();
            let header = std::str::from_utf8(&data[pos..nl]).unwrap();
            let mut parts = header.split(' ');
            let oid = ObjectId::from_hex(parts.next().unwrap().as_bytes()).unwrap();
            let kind = ObjectKind::from_bytes(parts.next().unwrap().as_bytes()).unwrap();
            let size: usize = parts.next().unwrap().parse().unwrap();
            let body = &data[nl + 1..nl + 1 + size];
            let mut loose = gix_object::encode::loose_header(kind, size as u64).to_vec();
            loose.extend_from_slice(body);
            if kind == ObjectKind::Commit {
                if let Ok(ObjectRef::Commit(c)) = ObjectRef::from_bytes(kind, body) {
                    me.commits.push(CommitItem {
                        oid: oid.to_hex().to_string(),
                        short_oid: String::new(),
                        parents: c.parents().map(|p| p.to_hex().to_string()).collect(),
                        author_name: String::new(),
                        author_email: String::new(),
                        timestamp: 0,
                        summary: String::new(),
                        body: String::new(),
                        refs: Vec::new(),
                    });
                }
            }
            me.objects.insert(oid, loose);
            pos = nl + 1 + size + 1;
        }
        let refs = git_out(repo, &["for-each-ref", "--format=%(objectname) %(refname)"]);
        for line in refs.lines() {
            let (oid, name) = line.split_once(' ').unwrap();
            me.refs.insert(name.to_string(), ObjectId::from_hex(oid.as_bytes()).unwrap());
        }
        me.head_symref = git_out(repo, &["symbolic-ref", "HEAD"]).trim().to_string();
        me.head_oid = me.refs.get(&me.head_symref).copied();
        me
    }

    fn advertise(&mut self, service: &str) -> Result<Vec<u8>, String> {
        let (sym, head, refs) = (self.head_symref.clone(), self.head_oid, self.refs.clone());
        advertise_refs(self, service, &sym, head, &refs)
    }

    fn upload_pack(&mut self, body: &[u8]) -> Result<Vec<u8>, String> {
        let refs = self.refs.clone();
        handle_upload_pack_request(self, &refs, body)
    }
}

// ---------------------------------------------------------------------------------------------
// git process helpers
// ---------------------------------------------------------------------------------------------

fn tools_available() -> bool {
    let ok = |cmd: &str| Command::new(cmd).arg("--version").output().map(|o| o.status.success()).unwrap_or(false);
    ok("git") && ok("python3")
}

fn git_env(dir: &Path) -> Vec<(String, String)> {
    let home = dir.parent().unwrap_or(dir).join("home");
    let _ = std::fs::create_dir_all(&home);
    let tools = Path::new(env!("CARGO_MANIFEST_DIR")).join("tools");
    let path = format!("{}:{}", tools.display(), std::env::var("PATH").unwrap_or_default());
    vec![
        ("HOME".into(), home.display().to_string()),
        ("GIT_CONFIG_NOSYSTEM".into(), "1".into()),
        ("GIT_CONFIG_GLOBAL".into(), "/dev/null".into()),
        ("GIT_TERMINAL_PROMPT".into(), "0".into()),
        ("GIT_AUTHOR_NAME".into(), "Test".into()),
        ("GIT_AUTHOR_EMAIL".into(), "test@example.com".into()),
        ("GIT_COMMITTER_NAME".into(), "Test".into()),
        ("GIT_COMMITTER_EMAIL".into(), "test@example.com".into()),
        ("PATH".into(), path),
        // No background auto-gc/maintenance: it writes temporary packs that race with `git fsck`.
        ("GIT_CONFIG_COUNT".into(), "2".into()),
        ("GIT_CONFIG_KEY_0".into(), "gc.auto".into()),
        ("GIT_CONFIG_VALUE_0".into(), "0".into()),
        ("GIT_CONFIG_KEY_1".into(), "maintenance.auto".into()),
        ("GIT_CONFIG_VALUE_1".into(), "false".into()),
        ("NO_PROXY".into(), "*".into()),
        ("no_proxy".into(), "*".into()),
    ]
}

fn run_git(dir: &Path, args: &[&str]) -> std::process::Output {
    Command::new("git")
        .args(args)
        .current_dir(dir)
        .envs(git_env(dir))
        .env_remove("http_proxy")
        .env_remove("https_proxy")
        .env_remove("HTTP_PROXY")
        .env_remove("HTTPS_PROXY")
        .output()
        .expect("spawn git")
}

fn git_ok(dir: &Path, args: &[&str]) -> String {
    let out = run_git(dir, args);
    assert!(
        out.status.success(),
        "git {:?} failed in {}:\n{}\n{}",
        args,
        dir.display(),
        String::from_utf8_lossy(&out.stdout),
        String::from_utf8_lossy(&out.stderr)
    );
    String::from_utf8_lossy(&out.stdout).into_owned()
}

fn git_out(dir: &Path, args: &[&str]) -> String {
    git_ok(dir, args)
}

fn temp_dir(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!(
        "gas-upload-pack-{}-{}-{}",
        name,
        std::process::id(),
        std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()
    ));
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

fn write_file(dir: &Path, rel: &str, content: &str) {
    let p = dir.join(rel);
    std::fs::create_dir_all(p.parent().unwrap()).unwrap();
    std::fs::write(p, content).unwrap();
}

/// Text that changes slightly between versions (so deltas are effective).
fn big_text(seed: usize, changed_line: usize) -> String {
    (0..600)
        .map(|i| {
            if i == changed_line {
                format!("line {} changed in version {}\n", i, seed)
            } else {
                format!("line {} of a reasonably long file used for delta compression tests\n", i)
            }
        })
        .collect()
}

fn commit_all(dir: &Path, msg: &str) -> String {
    git_ok(dir, &["add", "-A"]);
    git_ok(dir, &["-c", "commit.gpgsign=false", "commit", "-q", "-m", msg]);
    git_ok(dir, &["rev-parse", "HEAD"]).trim().to_string()
}

/// Source repository: 6 commits on main, a feature branch, an annotated tag and a lightweight tag.
fn make_source_repo(root: &Path) -> PathBuf {
    let src = root.join("src");
    std::fs::create_dir_all(&src).unwrap();
    git_ok(&src, &["init", "-q", "-b", "main"]);
    write_file(&src, "a.txt", &big_text(0, 1));
    write_file(&src, "b.txt", "short file\n");
    write_file(&src, "dir/c.txt", &big_text(0, 2));
    commit_all(&src, "c1");
    for i in 2..=6 {
        write_file(&src, "a.txt", &big_text(i, i * 10));
        if i % 2 == 0 {
            write_file(&src, "dir/c.txt", &big_text(i, i * 7));
        }
        commit_all(&src, &format!("c{}", i));
        if i == 3 {
            git_ok(&src, &["-c", "tag.gpgsign=false", "tag", "-a", "v1", "-m", "release v1"]);
        }
        if i == 4 {
            git_ok(&src, &["tag", "light"]);
            git_ok(&src, &["branch", "feature"]);
        }
    }
    git_ok(&src, &["checkout", "-q", "feature"]);
    write_file(&src, "feature.txt", "feature work\n");
    commit_all(&src, "f1");
    git_ok(&src, &["checkout", "-q", "main"]);
    src
}

/// Add a commit (and annotated tag `v2`) to the source repository.
fn advance_source_repo(src: &Path) -> String {
    write_file(&src, "a.txt", &big_text(7, 300));
    let c7 = commit_all(src, "c7");
    git_ok(src, &["-c", "tag.gpgsign=false", "tag", "-a", "v2", "-m", "release v2"]);
    c7
}

// ---------------------------------------------------------------------------------------------
// Minimal HTTP server (plain Smart HTTP + GAS-style JSON/Base64 endpoint)
// ---------------------------------------------------------------------------------------------

struct Server {
    port: u16,
    repo: Arc<Mutex<MemRepo>>,
    requests: Arc<Mutex<Vec<Vec<u8>>>>,
}

fn gunzip(data: &[u8]) -> Vec<u8> {
    let mut child = Command::new("python3")
        .args(["-c", "import gzip,sys;sys.stdout.buffer.write(gzip.decompress(sys.stdin.buffer.read()))"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .unwrap();
    child.stdin.take().unwrap().write_all(data).unwrap();
    child.wait_with_output().unwrap().stdout
}

fn query_param(query: &str, key: &str) -> Option<String> {
    query.split('&').find_map(|kv| {
        let (k, v) = kv.split_once('=')?;
        (k == key).then(|| crate::git_server::percent_decode(&v.replace('+', " ")))
    })
}

impl Server {
    fn start(repo: MemRepo) -> Server {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let repo = Arc::new(Mutex::new(repo));
        let requests = Arc::new(Mutex::new(Vec::new()));
        let (r2, q2) = (repo.clone(), requests.clone());
        std::thread::spawn(move || {
            for stream in listener.incoming().flatten() {
                let (r3, q3) = (r2.clone(), q2.clone());
                std::thread::spawn(move || {
                    let _ = handle_connection(stream, &r3, &q3);
                });
            }
        });
        Server { port, repo, requests }
    }

    fn reload(&self, src: &Path) {
        *self.repo.lock().unwrap() = MemRepo::load(src);
    }

    fn smart_url(&self) -> String {
        format!("http://127.0.0.1:{}/repo.git", self.port)
    }

    fn gas_url(&self) -> String {
        format!("gas::http://127.0.0.1:{}/macros/s/TEST/exec/repo.git", self.port)
    }
}

fn handle_connection(
    mut stream: TcpStream,
    repo: &Arc<Mutex<MemRepo>>,
    requests: &Arc<Mutex<Vec<Vec<u8>>>>,
) -> std::io::Result<()> {
    let mut reader = BufReader::new(stream.try_clone()?);
    loop {
        let mut request_line = String::new();
        if reader.read_line(&mut request_line)? == 0 {
            return Ok(());
        }
        let mut parts = request_line.split_whitespace();
        let method = parts.next().unwrap_or("").to_string();
        let target = parts.next().unwrap_or("").to_string();
        let mut headers: Vec<(String, String)> = Vec::new();
        loop {
            let mut line = String::new();
            reader.read_line(&mut line)?;
            let line = line.trim_end();
            if line.is_empty() {
                break;
            }
            if let Some((k, v)) = line.split_once(':') {
                headers.push((k.trim().to_ascii_lowercase(), v.trim().to_string()));
            }
        }
        let header = |k: &str| headers.iter().find(|(h, _)| h == k).map(|(_, v)| v.clone());
        let mut body = Vec::new();
        if header("transfer-encoding").is_some_and(|v| v.contains("chunked")) {
            loop {
                let mut size_line = String::new();
                reader.read_line(&mut size_line)?;
                let size = usize::from_str_radix(size_line.trim(), 16).unwrap_or(0);
                let mut chunk = vec![0u8; size + 2];
                reader.read_exact(&mut chunk)?;
                if size == 0 {
                    break;
                }
                body.extend_from_slice(&chunk[..size]);
            }
        } else if let Some(len) = header("content-length").and_then(|v| v.parse::<usize>().ok()) {
            body.resize(len, 0);
            reader.read_exact(&mut body)?;
        }
        if header("content-encoding").is_some_and(|v| v.contains("gzip")) {
            body = gunzip(&body);
        }

        let (path, query) = target.split_once('?').unwrap_or((&target, ""));
        let result: Result<(String, Vec<u8>), String> = (|| {
            let mut repo = repo.lock().unwrap();
            if path.contains("/exec") {
                // GAS-style endpoint used by git-remote-gas: Base64 text responses, JSON POST envelope.
                let git_path = query_param(query, "git_path").unwrap_or_default();
                let bytes = if method == "GET" {
                    let service = query_param(query, "service").unwrap_or_else(|| "git-upload-pack".into());
                    repo.advertise(&service)?
                } else {
                    let env: serde_json::Value = serde_json::from_slice(&body).map_err(|e| e.to_string())?;
                    use base64::Engine as _;
                    let req = base64::engine::general_purpose::STANDARD
                        .decode(env["body_base64"].as_str().unwrap_or(""))
                        .map_err(|e| e.to_string())?;
                    requests.lock().unwrap().push(req.clone());
                    if !git_path.ends_with("git-upload-pack") {
                        return Err(format!("unsupported POST path {}", git_path));
                    }
                    repo.upload_pack(&req)?
                };
                use base64::Engine as _;
                Ok(("text/plain".into(), base64::engine::general_purpose::STANDARD.encode(bytes).into_bytes()))
            } else if path.ends_with("/info/refs") {
                let service = query_param(query, "service").unwrap_or_default();
                Ok((format!("application/x-{}-advertisement", service), repo.advertise(&service)?))
            } else if path.ends_with("/git-upload-pack") && method == "POST" {
                requests.lock().unwrap().push(body.clone());
                Ok(("application/x-git-upload-pack-result".into(), repo.upload_pack(&body)?))
            } else {
                Err(format!("not found: {} {}", method, path))
            }
        })();
        let (status, ctype, payload) = match result {
            Ok((ctype, payload)) => ("200 OK", ctype, payload),
            Err(e) => ("500 Internal Server Error", "text/plain".into(), e.into_bytes()),
        };
        write!(
            stream,
            "HTTP/1.1 {}\r\nContent-Type: {}\r\nContent-Length: {}\r\nCache-Control: no-cache\r\n\r\n",
            status,
            ctype,
            payload.len()
        )?;
        stream.write_all(&payload)?;
        stream.flush()?;
    }
}

// ---------------------------------------------------------------------------------------------
// Pack inspection
// ---------------------------------------------------------------------------------------------

/// Return the pack entry type ids (1-4 full objects, 6 OFS_DELTA, 7 REF_DELTA) of a PACK stream.
fn pack_entry_types(pack: &[u8]) -> Vec<u8> {
    assert_eq!(&pack[..4], b"PACK");
    let count = u32::from_be_bytes(pack[8..12].try_into().unwrap()) as usize;
    let mut pos = 12;
    let mut types = Vec::new();
    let mut inflate = gix_zlib::Inflate::default();
    for _ in 0..count {
        let first = pack[pos];
        pos += 1;
        let t = (first >> 4) & 7;
        let mut size = (first & 0x0f) as usize;
        let mut shift = 4;
        let mut b = first;
        while b & 0x80 != 0 {
            b = pack[pos];
            pos += 1;
            size |= ((b & 0x7f) as usize) << shift;
            shift += 7;
        }
        if t == 6 {
            while pack[pos] & 0x80 != 0 {
                pos += 1;
            }
            pos += 1;
        } else if t == 7 {
            pos += 20;
        }
        inflate.reset();
        let mut out = vec![0u8; size.max(1)];
        let (_, consumed, _) = inflate.once(&pack[pos..], &mut out).unwrap();
        pos += consumed;
        types.push(t);
    }
    types
}

/// Extract the PACK from a side-band upload-pack response.
fn extract_sideband_pack(resp: &[u8]) -> Vec<u8> {
    let mut pos = 0;
    let mut pack = Vec::new();
    while pos + 4 <= resp.len() {
        let len = usize::from_str_radix(std::str::from_utf8(&resp[pos..pos + 4]).unwrap(), 16).unwrap();
        if len < 4 {
            pos += 4;
            continue;
        }
        let payload = &resp[pos + 4..pos + len];
        if payload.first() == Some(&1) && !payload.starts_with(b"\x01ACK") {
            pack.extend_from_slice(&payload[1..]);
        }
        pos += len;
    }
    pack
}

// ---------------------------------------------------------------------------------------------
// End-to-end tests
// ---------------------------------------------------------------------------------------------

#[test]
fn incremental_fetch_uses_deltas_and_include_tag() {
    if !tools_available() {
        eprintln!("skipping: git/python3 not available");
        return;
    }
    let root = temp_dir("delta");
    let src = make_source_repo(&root);
    let old_head = git_out(&src, &["rev-parse", "HEAD"]).trim().to_string();
    let new_head = advance_source_repo(&src);
    let mut repo = MemRepo::load(&src);

    let mut body = pkt(&format!("want {} multi_ack side-band-64k ofs-delta thin-pack include-tag no-progress", new_head));
    body.extend(b"0000");
    body.extend(pkt(&format!("have {}", old_head)));
    body.extend(pkt("done"));
    let resp = repo.upload_pack(&body).unwrap();
    let text = String::from_utf8_lossy(&resp);
    assert!(text.contains(&format!("ACK {} continue", old_head)), "{}", text);
    let pack = extract_sideband_pack(&resp);
    let types = pack_entry_types(&pack);
    // commit + root tree + a.txt + annotated tag v2; trees/blobs should be thin REF_DELTAs.
    assert!(types.contains(&7), "expected thin REF_DELTA entries, got {:?}", types);
    assert!(types.contains(&4), "include-tag should add the v2 tag object, got {:?}", types);
    assert!(pack.len() < 1500, "incremental pack unexpectedly large: {} bytes", pack.len());

    // Without thin-pack: no REF_DELTA against client objects (full objects only, no in-pack bases here).
    let mut body = pkt(&format!("want {} multi_ack side-band-64k ofs-delta no-progress", new_head));
    body.extend(b"0000");
    body.extend(pkt(&format!("have {}", old_head)));
    body.extend(pkt("done"));
    let resp = repo.upload_pack(&body).unwrap();
    let types = pack_entry_types(&extract_sideband_pack(&resp));
    assert!(!types.contains(&7) && !types.contains(&4), "{:?}", types);

    // A full clone with ofs-delta stores older versions as OFS_DELTA against newer ones.
    let mut body = pkt(&format!("want {} side-band-64k ofs-delta no-progress", new_head));
    body.extend(b"0000");
    body.extend(pkt("done"));
    let types = pack_entry_types(&extract_sideband_pack(&repo.upload_pack(&body).unwrap()));
    assert!(types.contains(&6), "expected OFS_DELTA entries, got {:?}", types);

    // Negotiation round without `done`: ACK continue + NAK, no pack.
    let mut body = pkt(&format!("want {} multi_ack side-band-64k", new_head));
    body.extend(b"0000");
    body.extend(pkt(&format!("have {}", old_head)));
    body.extend(b"0000");
    let resp = repo.upload_pack(&body).unwrap();
    let text = String::from_utf8_lossy(&resp);
    assert!(text.ends_with("NAK\n") && !text.contains("PACK"), "{}", text);
    let _ = std::fs::remove_dir_all(&root);
}

/// Run the clone / fetch / shallow / tag scenarios with a given remote URL.
fn run_client_scenarios(root: &Path, src: &Path, server: &Server, url: &str, label: &str) {
    let work = root.join(format!("work-{}", label));
    std::fs::create_dir_all(&work).unwrap();
    let src_main = git_out(src, &["rev-parse", "main"]).trim().to_string();

    // 1. Full clone: all branches and tags, history intact.
    git_ok(&work, &["clone", "-q", url, "full"]);
    let full = work.join("full");
    assert_eq!(git_out(&full, &["rev-parse", "HEAD"]).trim(), src_main);
    git_ok(&full, &["fsck", "--strict", "--no-progress"]);
    let tags = git_out(&full, &["tag"]);
    assert!(tags.contains("v1") && tags.contains("light"), "{}", tags);
    assert!(git_out(&full, &["branch", "-r"]).contains("origin/feature"));

    // 2. Shallow clone (--depth 1), deepen to 3, then unshallow. Expected results come from git's own
    //    upload-pack over file:// (the reference implementation), including the exact shallow set.
    let expected = shallow_walk(&work, &format!("file://{}", src.display()), "oracle");
    let actual = shallow_walk(&work, url, "shallow");
    assert_eq!(actual, expected, "shallow clone/deepen/unshallow differs from git upload-pack");
    assert_eq!(actual[0].0, "1", "--depth 1 must give a single commit on main");

    // 3. Incremental fetch after new commits + annotated tag (negotiation, thin pack, tag following).
    let before = server.requests.lock().unwrap().len();
    let new_head = advance_source_repo(src);
    server.reload(src);
    git_ok(&full, &["fetch", "-q", "origin"]);
    assert_eq!(git_out(&full, &["rev-parse", "origin/main"]).trim(), new_head);
    assert!(git_out(&full, &["tag"]).contains("v2"), "annotated tag v2 should be auto-followed");
    git_ok(&full, &["fsck", "--strict", "--no-progress"]);
    let reqs = server.requests.lock().unwrap();
    let fetch_reqs = &reqs[before..];
    assert!(
        fetch_reqs.iter().any(|r| String::from_utf8_lossy(r).contains("have ")),
        "incremental fetch should send have lines"
    );
    drop(reqs);

    // 4. Shallow clone of the advanced repository still works with tags present.
    git_ok(&work, &["clone", "-q", "--depth", "2", url, "shallow2"]);
    let shallow2 = work.join("shallow2");
    assert_eq!(git_out(&shallow2, &["rev-list", "--count", "HEAD"]).trim(), "2");
    git_ok(&shallow2, &["fsck", "--no-progress"]);
}

/// Clone with `--depth 1`, deepen with `--depth 3`, then `--unshallow`; after each step record
/// `(commit count on origin/main, sorted .git/shallow contents)`.
fn shallow_walk(work: &Path, url: &str, name: &str) -> Vec<(String, String)> {
    git_ok(work, &["clone", "-q", "--depth", "1", "--no-single-branch", url, name]);
    let repo = work.join(name);
    let snapshot = |repo: &Path| {
        git_ok(repo, &["fsck", "--no-progress"]);
        let count = git_out(repo, &["rev-list", "--count", "origin/main"]).trim().to_string();
        let mut shallow: Vec<String> = std::fs::read_to_string(repo.join(".git/shallow"))
            .unwrap_or_default()
            .lines()
            .map(str::to_string)
            .collect();
        shallow.sort();
        (count, shallow.join(","))
    };
    let mut steps = vec![snapshot(&repo)];
    git_ok(&repo, &["fetch", "-q", "--depth", "3", "origin"]);
    steps.push(snapshot(&repo));
    git_ok(&repo, &["fetch", "-q", "--unshallow", "origin"]);
    assert_eq!(git_out(&repo, &["rev-parse", "--is-shallow-repository"]).trim(), "false");
    steps.push(snapshot(&repo));
    steps
}

#[test]
fn real_git_over_smart_http() {
    if !tools_available() {
        eprintln!("skipping: git/python3 not available");
        return;
    }
    let root = temp_dir("smart");
    let src = make_source_repo(&root);
    let server = Server::start(MemRepo::load(&src));
    let url = server.smart_url();
    run_client_scenarios(&root, &src, &server, &url, "smart");
    // Real fetch-pack negotiates with multi_ack over several stateless rounds.
    let reqs = server.requests.lock().unwrap();
    assert!(reqs.iter().any(|r| String::from_utf8_lossy(r).contains("multi_ack")));
    assert!(reqs.iter().any(|r| String::from_utf8_lossy(r).contains("deepen ")));
    drop(reqs);
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn git_remote_gas_helper() {
    if !tools_available() {
        eprintln!("skipping: git/python3 not available");
        return;
    }
    let root = temp_dir("helper");
    let src = make_source_repo(&root);
    let server = Server::start(MemRepo::load(&src));
    let url = server.gas_url();
    run_client_scenarios(&root, &src, &server, &url, "helper");
    let reqs = server.requests.lock().unwrap();
    assert!(reqs.iter().any(|r| String::from_utf8_lossy(r).contains("thin-pack")));
    drop(reqs);
    let _ = std::fs::remove_dir_all(&root);
}

// ---------------------------------------------------------------------------------------------
// Conformance with `git upload-pack --stateless-rpc`
// ---------------------------------------------------------------------------------------------

/// Text lines of an upload-pack response before the pack (side-band or raw), with `FLUSH` markers.
/// Lines inside a shallow section are sorted (their order is not significant).
fn negotiation_lines(resp: &[u8]) -> Vec<String> {
    let mut lines = Vec::new();
    let mut pos = 0;
    let mut section: Vec<String> = Vec::new();
    while pos + 4 <= resp.len() {
        let Ok(len) = usize::from_str_radix(std::str::from_utf8(&resp[pos..pos + 4]).unwrap_or("x"), 16) else {
            break; // raw PACK
        };
        if len < 4 {
            section.sort();
            lines.append(&mut section);
            lines.push("FLUSH".to_string());
            pos += 4;
            continue;
        }
        let payload = &resp[pos + 4..pos + len];
        if matches!(payload.first(), Some(1..=3)) {
            break; // side-band pack data / progress
        }
        let text = String::from_utf8_lossy(payload).trim_end().to_string();
        if text.starts_with("shallow ") || text.starts_with("unshallow ") {
            section.push(text);
        } else {
            lines.append(&mut section);
            lines.push(text);
        }
        pos += len;
    }
    lines.append(&mut section);
    lines
}

#[test]
fn negotiation_matches_git_upload_pack() {
    if !tools_available() {
        eprintln!("skipping: git/python3 not available");
        return;
    }
    let root = temp_dir("conformance");
    let src = make_source_repo(&root);
    let mut repo = MemRepo::load(&src);
    let rev = |r: &str| git_out(&src, &["rev-parse", r]).trim().to_string();
    let (w, h, s, f) = (rev("main"), rev("main~2"), rev("main~1"), rev("feature"));
    let unknown = "1".repeat(40);
    let raw = |text: &str| {
        let mut out = format!("{:04x}", text.len() + 4).into_bytes();
        out.extend_from_slice(text.as_bytes());
        out
    };
    let flush = b"0000".to_vec();
    let cat = |parts: Vec<Vec<u8>>| parts.concat();
    let dm = "multi_ack_detailed side-band-64k ofs-delta no-progress";

    let cases: Vec<(&str, Vec<u8>)> = vec![
        ("no haves, flush", cat(vec![pkt(&format!("want {} {}", w, dm)), flush.clone(), flush.clone()])),
        ("want section only", cat(vec![pkt(&format!("want {} {}", w, dm)), flush.clone()])),
        ("common have, flush", cat(vec![pkt(&format!("want {} {}", w, dm)), flush.clone(), pkt(&format!("have {}", h)), flush.clone()])),
        ("unknown have, flush", cat(vec![pkt(&format!("want {} {}", w, dm)), flush.clone(), pkt(&format!("have {}", unknown)), flush.clone()])),
        ("mixed haves, flush", cat(vec![pkt(&format!("want {} {}", w, dm)), flush.clone(), pkt(&format!("have {}", unknown)), pkt(&format!("have {}", h)), flush.clone()])),
        ("plain multi_ack", cat(vec![pkt(&format!("want {} multi_ack side-band-64k", w)), flush.clone(), pkt(&format!("have {}", h)), pkt(&format!("have {}", unknown)), flush.clone()])),
        ("no multi_ack", cat(vec![pkt(&format!("want {} side-band-64k", w)), flush.clone(), pkt(&format!("have {}", h)), pkt(&format!("have {}", s)), flush.clone()])),
        ("multi_ack done", cat(vec![pkt(&format!("want {} multi_ack side-band-64k no-progress", w)), flush.clone(), pkt(&format!("have {}", h)), pkt("done")])),
        ("detailed done", cat(vec![pkt(&format!("want {} {}", w, dm)), flush.clone(), pkt(&format!("have {}", h)), pkt(&format!("have {}", unknown)), pkt("done")])),
        ("no haves done", cat(vec![pkt(&format!("want {} {}", w, dm)), pkt(&format!("want {}", f)), flush.clone(), pkt("done")])),
        ("deepen 1 EOF", cat(vec![pkt(&format!("want {} {}", w, dm)), raw("deepen 1"), flush.clone()])),
        ("deepen 2 + have", cat(vec![pkt(&format!("want {} {}", w, dm)), raw("deepen 2"), flush.clone(), pkt(&format!("have {}", h)), flush.clone()])),
        ("deepen 3 two wants", cat(vec![pkt(&format!("want {} {}", w, dm)), pkt(&format!("want {}", f)), raw("deepen 3"), flush.clone()])),
        ("client shallow, have", cat(vec![pkt(&format!("want {} {}", w, dm)), pkt(&format!("shallow {}", s)), flush.clone(), pkt(&format!("have {}", h)), flush.clone()])),
        ("client shallow, done", cat(vec![pkt(&format!("want {} {}", w, dm)), pkt(&format!("shallow {}", s)), flush.clone(), pkt("done")])),
        ("client shallow + deepen 3", cat(vec![pkt(&format!("want {} {}", w, dm)), pkt(&format!("shallow {}", s)), raw("deepen 3"), flush.clone()])),
        ("unshallow (infinite)", cat(vec![pkt(&format!("want {} {}", w, dm)), pkt(&format!("shallow {}", s)), raw("deepen 2147483647"), flush.clone()])),
        ("deepen + done", cat(vec![pkt(&format!("want {} {}", w, dm)), raw("deepen 2"), flush.clone(), pkt(&format!("have {}", h)), pkt("done")])),
    ];

    for (name, body) in cases {
        let mut child = Command::new("git")
            .args(["upload-pack", "--stateless-rpc", "."])
            .current_dir(&src)
            .envs(git_env(&src))
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .unwrap();
        child.stdin.take().unwrap().write_all(&body).unwrap();
        let expected = child.wait_with_output().unwrap().stdout;
        let actual = repo.upload_pack(&body).unwrap();
        assert_eq!(
            negotiation_lines(&actual),
            negotiation_lines(&expected),
            "case '{}' differs from git upload-pack",
            name
        );
        // When git sends a pack, so must we (and vice versa).
        let has_pack = |r: &[u8]| r.windows(5).any(|w| w == b"\x01PACK") || r.windows(4).any(|w| w == b"PACK");
        assert_eq!(has_pack(&actual), has_pack(&expected), "case '{}': pack presence differs", name);
    }
    let _ = std::fs::remove_dir_all(&root);
}
