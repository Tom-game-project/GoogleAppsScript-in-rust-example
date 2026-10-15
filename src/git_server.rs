//! Git Smart HTTP v1 Server on Google Apps Script powered by `gitoxide`.
//!
//! Supported endpoints via GAS `doGet(e)` / `doPost(e)`:
//! - `GET  ?service=git-upload-pack`  (`/info/refs?service=git-upload-pack` — `git ls-remote`, `git fetch`, `git clone`, `git pull`)
//! - `GET  ?service=git-receive-pack` (`/info/refs?service=git-receive-pack` — `git push` ref discovery)
//! - `POST ?service=git-upload-pack`  (`/git-upload-pack` — packfile negotiation & transfer)
//! - `POST ?service=git-receive-pack` (`/git-receive-pack` — packfile unpack & reference updates)
//!
//! Uses `gitoxide` crates:
//! - `gix_hash`: SHA-1 `ObjectId` parsing, formatting, and streaming `PACK` checksum verification
//! - `gix_object`: Git `Blob`, `Tree`, `Commit`, `Tag` decoding (`ObjectRef::from_loose`) and encoding (`WriteTo`)
//! - `gix_packetline`: Git pkt-line wire format encoding (`blocking_io::encode`) & decoding (`StreamingPeekableIter`)
//! - `gix_actor` & `gix_date`: Commit author/committer signatures and timestamps
//! - `gix_validate`: Reference name validation (`gix_validate::reference::name`)
//! - `gix_zlib`: Zlib deflate (`stream::deflate::Write`) & inflate (`Inflate`) for Git `PACK` v2 streams

use std::collections::{BTreeMap, BTreeSet, VecDeque};
use std::io::{Cursor, Write as IoWrite};

use gix_actor::Signature;
use gix_date::Time;
use gix_hash::{Kind as HashKind, ObjectId};
use gix_object::{
    Blob, Commit, Kind as ObjectKind, ObjectRef, Tree, WriteTo,
    bstr::{BString, ByteSlice},
    tree::{self, EntryKind},
};
use gix_packetline::{
    Channel, PacketLineRef,
    blocking_io::{StreamingPeekableIter, encode as pkt_encode},
};
use gix_zlib::{Compression, Inflate, Status as ZlibStatus, stream::deflate};
use serde::{Deserialize, Serialize};

use crate::args::{GasDoGetEvent, GasDoPostEvent};
use crate::bindings::gas::content_service::{
    gas_content_service,
    gas_text_output::{GasTextOutput, MimeType},
};
use crate::bindings::gas::drive_app::{
    gas_drive_app,
    gas_file::{CreateFileInput, TextFileSpec},
};
use crate::bindings::gas::lock_service::gas_lock_service;
use crate::bindings::gas::logger::logger;
use crate::bindings::gas::property::properties_service;
use crate::bindings::gas::utilities::gas_utilities::{self, BinaryOrStringInput};

const DEFAULT_REPO: &str = "default";
const DEFAULT_BRANCH: &str = "refs/heads/main";
const MAX_SIDEBAND_CHUNK: usize = 65500;
const DRIVE_OFFLOAD_THRESHOLD: usize = 6144;

/// JSON request payload optionally sent by `git-remote-gas` to `doPost(e)`.
#[derive(Deserialize, Debug)]
pub struct GasGitPostEnvelope {
    pub service: Option<String>,
    pub git_path: Option<String>,
    pub repo: Option<String>,
    pub encoding: Option<String>,
    pub body_base64: Option<String>,
}

/// JSON response envelope returned when `format=json` is requested.
#[derive(Serialize, Debug)]
pub struct GasGitResponseEnvelope {
    pub ok: bool,
    pub status: u16,
    pub content_type: String,
    pub body_base64: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Persistent Git Object and Reference Store backed by Google Apps Script
/// `PropertiesService.getScriptProperties()` (with optional `DriveApp` offloading for large objects).
pub struct GasGitStore {
    repo: String,
}

impl GasGitStore {
    pub fn new(repo: &str) -> Self {
        let sanitized: String = repo
            .chars()
            .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
            .collect();
        let repo_name = if sanitized.is_empty() {
            DEFAULT_REPO.to_string()
        } else {
            sanitized
        };
        Self { repo: repo_name }
    }

    fn init_key(&self) -> String {
        format!("git:{}:initialized", self.repo)
    }

    fn head_key(&self) -> String {
        format!("git:{}:HEAD", self.repo)
    }

    fn ref_prefix(&self) -> String {
        format!("git:{}:ref:", self.repo)
    }

    fn ref_key(&self, ref_name: &str) -> String {
        format!("git:{}:ref:{}", self.repo, ref_name)
    }

    fn obj_key(&self, oid: &ObjectId) -> String {
        format!("git:{}:obj:{}", self.repo, oid.to_hex())
    }

    /// Ensure the repository has at least an initial commit on `refs/heads/main` so that
    /// `git ls-remote` and `git clone` work immediately after deploying to GAS.
    pub fn ensure_initialized(&self) -> Result<ObjectId, String> {
        let props = properties_service::get_script_properties();
        if props.get_property(&self.init_key()).as_deref() == Some("true") {
            if let Some(oid) = self.resolve_ref("HEAD") {
                return Ok(oid);
            }
        }

        // Seed initial commit using gitoxide's gix-object, gix-actor, gix-date, and gix-hash
        let readme_text = format!(
            "# GAS Git Server (repository: {})\n\n\
             This Git repository is hosted on **Google Apps Script** using a Rust WebAssembly Component (`wasm32-wasip2`) and **gitoxide** (`gix-*`).\n\n\
             ## Supported Commands\n\
             - `git ls-remote gas::https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec`\n\
             - `git clone gas::https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec`\n\
             - `git pull` / `git fetch`\n\
             - `git push`\n",
            self.repo
        );

        let blob = Blob {
            data: readme_text.into_bytes(),
        };
        let blob_oid = self.write_object(&blob)?;

        let tree = Tree {
            entries: vec![tree::Entry {
                mode: EntryKind::Blob.into(),
                filename: BString::from("README.md"),
                oid: blob_oid,
            }],
        };
        let tree_oid = self.write_object(&tree)?;

        let sig = Signature {
            name: BString::from("GAS Git Server (gitoxide)"),
            email: BString::from("gitoxide-gas@script.google.com"),
            time: Time::new(1_700_000_000, 0),
        };
        let commit = Commit {
            tree: tree_oid,
            parents: Default::default(),
            author: sig.clone(),
            committer: sig,
            encoding: None,
            message: BString::from("Initial commit from gitoxide on Google Apps Script\n"),
            extra_headers: Vec::new(),
        };
        let commit_oid = self.write_object(&commit)?;

        props.set_property(&self.ref_key(DEFAULT_BRANCH), &commit_oid.to_hex().to_string());
        props.set_property(&self.head_key(), &format!("ref: {}", DEFAULT_BRANCH));
        props.set_property(&self.init_key(), "true");

        logger::log(&format!(
            "[gitoxide-gas] Initialized repository '{}' with commit {}",
            self.repo,
            commit_oid.to_hex()
        ));
        Ok(commit_oid)
    }

    /// Serialize any `gix_object::WriteTo` implementation into loose object format (`<kind> <size>\0<body>`),
    /// compute its SHA-1 `ObjectId` via `gix_object::compute_hash`, and persist it in GAS storage.
    pub fn write_object(&self, object: &dyn WriteTo) -> Result<ObjectId, String> {
        let mut body = Vec::with_capacity(object.size() as usize);
        object
            .write_to(&mut body)
            .map_err(|e| format!("Failed to serialize git object: {}", e))?;
        self.write_raw_object(object.kind(), &body)
    }

    /// Compute SHA-1 `ObjectId` for `(kind, body)` and store the loose object in GAS storage.
    pub fn write_raw_object(&self, kind: ObjectKind, body: &[u8]) -> Result<ObjectId, String> {
        let oid = gix_object::compute_hash(HashKind::Sha1, kind, body)
            .map_err(|e| format!("Failed to compute SHA-1 hash: {}", e))?;

        let header = gix_object::encode::loose_header(kind, body.len() as u64);
        let mut loose_bytes = Vec::with_capacity(header.len() + body.len());
        loose_bytes.extend_from_slice(&header);
        loose_bytes.extend_from_slice(body);

        let b64 = gas_utilities::base64_encode(&BinaryOrStringInput::Bytes(loose_bytes));
        let props = properties_service::get_script_properties();

        // If the object is large and GIT_DRIVE_FOLDER_ID is configured, offload to DriveApp
        if b64.len() > DRIVE_OFFLOAD_THRESHOLD {
            if let Some(folder_id) = props.get_property("GIT_DRIVE_FOLDER_ID") {
                if !folder_id.is_empty() {
                    if let Some(folder) = gas_drive_app::get_folder_by_id(&folder_id) {
                        let file = folder.create_file(CreateFileInput::FromText(TextFileSpec {
                            name: format!("git_obj_{}_{}.b64", self.repo, oid.to_hex()),
                            content: b64,
                            mime_type: Some("text/plain".to_string()),
                        }));
                        let file_id = file.get_id();
                        props.set_property(&self.obj_key(&oid), &format!("drive:{}", file_id));
                        return Ok(oid);
                    }
                }
            }
        }

        props.set_property(&self.obj_key(&oid), &b64);
        Ok(oid)
    }

    /// Read loose object bytes (`<kind> <size>\0<body>`) by `ObjectId`.
    pub fn read_loose_object(&self, oid: &ObjectId) -> Option<Vec<u8>> {
        let props = properties_service::get_script_properties();
        let val = props.get_property(&self.obj_key(oid))?;
        let b64 = if let Some(file_id) = val.strip_prefix("drive:") {
            let file = gas_drive_app::get_file_by_id(file_id)?;
            file.get_blob().get_data_as_string(None)
        } else {
            val
        };
        Some(gas_utilities::base64_decode(&b64, None))
    }

    /// Read and decode `(ObjectKind, Vec<u8>)` (body without loose header) for `oid`.
    pub fn read_raw_object(&self, oid: &ObjectId) -> Result<Option<(ObjectKind, Vec<u8>)>, String> {
        let Some(loose) = self.read_loose_object(oid) else {
            return Ok(None);
        };
        let (kind, size, offset) = gix_object::decode::loose_header(&loose)
            .map_err(|e| format!("Corrupt loose object header for {}: {}", oid.to_hex(), e))?;
        let end = offset + (size as usize);
        if loose.len() < end {
            return Err(format!(
                "Truncated loose object {}: expected {} bytes, got {}",
                oid.to_hex(),
                end,
                loose.len()
            ));
        }
        Ok(Some((kind, loose[offset..end].to_vec())))
    }

    /// List all references (`refs/...`) in sorted order.
    pub fn list_refs(&self) -> BTreeMap<String, ObjectId> {
        let props = properties_service::get_script_properties();
        let prefix = self.ref_prefix();
        let mut refs = BTreeMap::new();
        for (k, v) in props.get_properties() {
            if let Some(ref_name) = k.strip_prefix(&prefix) {
                if let Ok(oid) = ObjectId::from_hex(v.trim().as_bytes()) {
                    refs.insert(ref_name.to_string(), oid);
                }
            }
        }
        refs
    }

    /// Return the symbolic target of `HEAD` (e.g. `Some("refs/heads/main")`) if `HEAD` is a symref.
    pub fn head_symref(&self) -> Option<String> {
        let props = properties_service::get_script_properties();
        let head_val = props
            .get_property(&self.head_key())
            .unwrap_or_else(|| format!("ref: {}", DEFAULT_BRANCH));
        head_val
            .strip_prefix("ref:")
            .map(|target| target.trim().to_string())
    }

    /// Resolve a reference name (`HEAD` or `refs/...`) to its `ObjectId`.
    pub fn resolve_ref(&self, name: &str) -> Option<ObjectId> {
        let props = properties_service::get_script_properties();
        if name == "HEAD" {
            if let Some(sym) = self.head_symref() {
                if let Some(oid) = self.resolve_ref(&sym) {
                    return Some(oid);
                }
            }
            if let Some(raw) = props.get_property(&self.head_key()) {
                if let Ok(oid) = ObjectId::from_hex(raw.trim().as_bytes()) {
                    return Some(oid);
                }
            }
            // Fallback to first available branch if HEAD target doesn't exist yet
            return self.list_refs().values().next().copied();
        }
        let hex = props.get_property(&self.ref_key(name))?;
        ObjectId::from_hex(hex.trim().as_bytes()).ok()
    }

    /// Update or delete a reference.
    pub fn update_ref(&self, ref_name: &str, new_oid: &ObjectId) -> Result<(), String> {
        gix_validate::reference::name(ref_name.as_bytes().as_bstr())
            .map_err(|e| format!("Invalid reference name '{}': {}", ref_name, e))?;

        let props = properties_service::get_script_properties();
        if new_oid.is_null() {
            props.delete_property(&self.ref_key(ref_name));
        } else {
            props.set_property(&self.ref_key(ref_name), &new_oid.to_hex().to_string());
            // If HEAD points to a branch that didn't exist yet, point HEAD to this branch
            if ref_name.starts_with("refs/heads/") {
                if self.resolve_ref("HEAD").is_none() {
                    props.set_property(&self.head_key(), &format!("ref: {}", ref_name));
                }
            }
        }
        Ok(())
    }
}

/// Handle `GET /info/refs?service=git-upload-pack` or `git-receive-pack` using `gix_packetline`.
pub fn handle_info_refs(service: &str, repo: &str) -> Result<Vec<u8>, String> {
    if service != "git-upload-pack" && service != "git-receive-pack" {
        return Err(format!(
            "Unsupported Git Smart HTTP service '{}': expected 'git-upload-pack' or 'git-receive-pack'",
            service
        ));
    }

    let store = GasGitStore::new(repo);
    store.ensure_initialized()?;

    let refs = store.list_refs();
    let head_sym = store
        .head_symref()
        .unwrap_or_else(|| DEFAULT_BRANCH.to_string());
    let head_oid = store.resolve_ref("HEAD");

    let mut out = Vec::with_capacity(512);
    // Smart HTTP v1 service header preamble
    let header_line = format!("# service={}", service);
    pkt_encode::text_to_write(header_line.as_bytes(), &mut out)
        .map_err(|e| format!("pkt-line encode error: {}", e))?;
    pkt_encode::flush_to_write(&mut out).map_err(|e| format!("pkt-line flush error: {}", e))?;

    let capabilities = if service == "git-upload-pack" {
        format!(
            "multi_ack thin-pack side-band side-band-64k ofs-delta shallow no-progress include-tag allow-tip-sha1-in-want allow-reachable-sha1-in-want symref=HEAD:{} object-format=sha1 agent=gitoxide-gas/0.1.0",
            head_sym
        )
    } else {
        "report-status delete-refs side-band-64k quiet atomic ofs-delta object-format=sha1 agent=gitoxide-gas/0.1.0"
            .to_string()
    };

    let mut advertised: Vec<(String, ObjectId)> = Vec::new();
    if let Some(h_oid) = head_oid {
        advertised.push(("HEAD".to_string(), h_oid));
    }
    for (r_name, r_oid) in refs {
        advertised.push((r_name, r_oid));
    }

    if advertised.is_empty() {
        let zero_oid = ObjectId::null(HashKind::Sha1);
        let first_line = format!("{} capabilities^{{}}\0{}", zero_oid.to_hex(), capabilities);
        pkt_encode::text_to_write(first_line.as_bytes(), &mut out)
            .map_err(|e| format!("pkt-line encode error: {}", e))?;
    } else {
        for (idx, (ref_name, oid)) in advertised.iter().enumerate() {
            let line = if idx == 0 {
                format!("{} {}\0{}", oid.to_hex(), ref_name, capabilities)
            } else {
                format!("{} {}", oid.to_hex(), ref_name)
            };
            pkt_encode::text_to_write(line.as_bytes(), &mut out)
                .map_err(|e| format!("pkt-line encode error: {}", e))?;
        }
    }

    pkt_encode::flush_to_write(&mut out).map_err(|e| format!("pkt-line flush error: {}", e))?;
    Ok(out)
}

/// Handle `POST /git-upload-pack` (`git fetch`, `git clone`, `git pull`).
/// Parses `want` and `have` packet-lines via `gix_packetline`, traverses reachable objects via
/// `gix_object::ObjectRef::from_loose`, and builds a zlib-compressed `PACK` v2 stream with `gix_zlib` & `gix_hash`.
pub fn handle_upload_pack(req_body: &[u8], repo: &str) -> Result<Vec<u8>, String> {
    let store = GasGitStore::new(repo);
    store.ensure_initialized()?;

    let mut wants: Vec<ObjectId> = Vec::new();
    let mut haves: BTreeSet<ObjectId> = BTreeSet::new();
    let mut client_caps: BTreeSet<String> = BTreeSet::new();

    let mut cursor = Cursor::new(req_body);
    // Phase 1: Read `want` lines up to Flush (`0000`)
    {
        let mut reader = StreamingPeekableIter::new(&mut cursor, &[PacketLineRef::Flush], false);
        while let Some(line_res) = reader.read_line() {
            let pkt = line_res
                .map_err(|e| format!("upload-pack io error: {}", e))?
                .map_err(|e| format!("upload-pack decode error: {}", e))?;
            if let Some(text) = pkt.as_text() {
                let raw = text.as_slice();
                // First `want` line may contain NUL-separated or space-separated capabilities
                let (main_part, cap_part) = match raw.find_byte(0) {
                    Some(nul_idx) => (&raw[..nul_idx], Some(&raw[nul_idx + 1..])),
                    None => (raw, None),
                };
                let line_str = String::from_utf8_lossy(main_part);
                let mut tokens = line_str.split_whitespace();
                if let Some(cmd) = tokens.next() {
                    if cmd == "want" {
                        if let Some(hex_oid) = tokens.next() {
                            let oid = ObjectId::from_hex(hex_oid.as_bytes())
                                .map_err(|e| format!("Invalid want OID '{}': {}", hex_oid, e))?;
                            if !wants.contains(&oid) {
                                wants.push(oid);
                            }
                        }
                        for cap in tokens {
                            client_caps.insert(cap.to_string());
                        }
                    }
                }
                if let Some(caps_bytes) = cap_part {
                    for cap in String::from_utf8_lossy(caps_bytes).split_whitespace() {
                        client_caps.insert(cap.to_string());
                    }
                }
            }
        }
    }

    // Phase 2: Read `have` and `done` lines
    {
        let mut reader = StreamingPeekableIter::new(&mut cursor, &[], false);
        while let Some(line_res) = reader.read_line() {
            let Ok(Ok(pkt)) = line_res else {
                break;
            };
            if let Some(text) = pkt.as_text() {
                let line_str = String::from_utf8_lossy(text.as_slice());
                let mut tokens = line_str.split_whitespace();
                match tokens.next() {
                    Some("have") => {
                        if let Some(hex_oid) = tokens.next() {
                            if let Ok(oid) = ObjectId::from_hex(hex_oid.as_bytes()) {
                                haves.insert(oid);
                            }
                        }
                    }
                    Some("done") => break,
                    _ => {}
                }
            }
        }
    }

    // Determine common ancestors already known to the client
    let mut excluded_oids: BTreeSet<ObjectId> = BTreeSet::new();
    let mut first_common_have: Option<ObjectId> = None;
    for have_oid in &haves {
        if store.read_loose_object(have_oid).is_some() {
            if first_common_have.is_none() {
                first_common_have = Some(*have_oid);
            }
            collect_reachable_objects(&store, *have_oid, &mut excluded_oids)?;
        }
    }

    // Traverse all objects reachable from `wants` that are not in `excluded_oids`
    let mut objects_to_send: Vec<(ObjectId, ObjectKind, Vec<u8>)> = Vec::new();
    let mut visited: BTreeSet<ObjectId> = excluded_oids;
    let mut queue: VecDeque<ObjectId> = wants.iter().copied().collect();

    while let Some(oid) = queue.pop_front() {
        if !visited.insert(oid) {
            continue;
        }
        let Some(loose_bytes) = store.read_loose_object(&oid) else {
            continue;
        };
        let (kind, size, offset) = gix_object::decode::loose_header(&loose_bytes)
            .map_err(|e| format!("Failed to decode loose header for {}: {}", oid.to_hex(), e))?;
        let body = loose_bytes[offset..offset + (size as usize)].to_vec();

        // Parse object with gitoxide's ObjectRef::from_loose to enqueue referenced child objects
        let obj_ref = ObjectRef::from_loose(&loose_bytes)
            .map_err(|e| format!("Failed to parse object {}: {}", oid.to_hex(), e))?;
        match obj_ref {
            ObjectRef::Commit(commit_ref) => {
                queue.push_back(commit_ref.tree());
                for parent_oid in commit_ref.parents() {
                    queue.push_back(parent_oid);
                }
            }
            ObjectRef::Tree(tree_ref) => {
                for entry in &tree_ref.entries {
                    queue.push_back(entry.oid.to_owned());
                }
            }
            ObjectRef::Tag(tag_ref) => {
                queue.push_back(tag_ref.target());
            }
            ObjectRef::Blob(_) => {}
        }

        objects_to_send.push((oid, kind, body));
    }

    let pack_bytes = build_pack_v2(&objects_to_send)?;

    let mut out = Vec::with_capacity(pack_bytes.len() + 128);
    if let Some(common_oid) = first_common_have {
        let ack_line = format!("ACK {}", common_oid.to_hex());
        pkt_encode::text_to_write(ack_line.as_bytes(), &mut out)
            .map_err(|e| format!("pkt-line ACK error: {}", e))?;
    } else {
        pkt_encode::text_to_write(b"NAK", &mut out)
            .map_err(|e| format!("pkt-line NAK error: {}", e))?;
    }

    let use_sideband =
        client_caps.contains("side-band-64k") || client_caps.contains("side-band");
    let no_progress = client_caps.contains("no-progress");

    if use_sideband {
        if !no_progress {
            let msg = format!(
                "gitoxide-gas: Counting objects: {}, done.\n",
                objects_to_send.len()
            );
            pkt_encode::band_to_write(Channel::Progress, msg.as_bytes(), &mut out)
                .map_err(|e| format!("sideband progress error: {}", e))?;
        }
        let chunk_limit = if client_caps.contains("side-band-64k") {
            MAX_SIDEBAND_CHUNK
        } else {
            999
        };
        for chunk in pack_bytes.chunks(chunk_limit) {
            pkt_encode::band_to_write(Channel::Data, chunk, &mut out)
                .map_err(|e| format!("sideband data error: {}", e))?;
        }
        pkt_encode::flush_to_write(&mut out).map_err(|e| format!("pkt-line flush error: {}", e))?;
    } else {
        out.extend_from_slice(&pack_bytes);
    }

    Ok(out)
}

/// Collect all reachable objects from `root` into `visited` (used for `have` exclusion).
fn collect_reachable_objects(
    store: &GasGitStore,
    root: ObjectId,
    visited: &mut BTreeSet<ObjectId>,
) -> Result<(), String> {
    let mut queue = VecDeque::new();
    queue.push_back(root);
    while let Some(oid) = queue.pop_front() {
        if !visited.insert(oid) {
            continue;
        }
        let Some(loose_bytes) = store.read_loose_object(&oid) else {
            continue;
        };
        if let Ok(obj_ref) = ObjectRef::from_loose(&loose_bytes) {
            match obj_ref {
                ObjectRef::Commit(c) => {
                    queue.push_back(c.tree());
                    for p in c.parents() {
                        queue.push_back(p);
                    }
                }
                ObjectRef::Tree(t) => {
                    for e in &t.entries {
                        queue.push_back(e.oid.to_owned());
                    }
                }
                ObjectRef::Tag(t) => {
                    queue.push_back(t.target());
                }
                ObjectRef::Blob(_) => {}
            }
        }
    }
    Ok(())
}

/// Build a Git `PACK` v2 binary stream using `gix_zlib::stream::deflate::Write` and `gix_hash::hasher`.
fn build_pack_v2(objects: &[(ObjectId, ObjectKind, Vec<u8>)]) -> Result<Vec<u8>, String> {
    let mut pack = Vec::with_capacity(12 + objects.len() * 128 + 20);
    // 12-byte PACK v2 header: "PACK" + version (2) + num_objects
    pack.extend_from_slice(b"PACK");
    pack.extend_from_slice(&2u32.to_be_bytes());
    pack.extend_from_slice(&(objects.len() as u32).to_be_bytes());

    for (_oid, kind, body) in objects {
        let type_id: u8 = match kind {
            ObjectKind::Commit => 1,
            ObjectKind::Tree => 2,
            ObjectKind::Blob => 3,
            ObjectKind::Tag => 4,
        };
        encode_pack_obj_header(type_id, body.len(), &mut pack);

        let mut deflater = deflate::Write::new(Vec::new(), Compression::DEFAULT);
        deflater
            .write_all(body)
            .map_err(|e| format!("zlib deflate write error: {}", e))?;
        deflater
            .flush()
            .map_err(|e| format!("zlib deflate flush error: {}", e))?;
        let compressed = deflater.into_inner();
        pack.extend_from_slice(&compressed);
    }

    // Append 20-byte SHA-1 checksum of the entire pack using gitoxide's gix_hash::hasher
    let mut hasher = gix_hash::hasher(HashKind::Sha1);
    hasher.update(&pack);
    let checksum = hasher
        .try_finalize()
        .map_err(|e| format!("pack SHA-1 finalize error: {}", e))?;
    pack.extend_from_slice(checksum.as_bytes());

    Ok(pack)
}

/// Encode Git PACK variable-length object type and uncompressed size header.
fn encode_pack_obj_header(type_id: u8, mut size: usize, out: &mut Vec<u8>) {
    let mut byte = ((type_id & 0x07) << 4) | ((size & 0x0f) as u8);
    size >>= 4;
    while size > 0 {
        out.push(byte | 0x80);
        byte = (size & 0x7f) as u8;
        size >>= 7;
    }
    out.push(byte);
}

#[derive(Debug)]
struct RefUpdateCommand {
    old_oid: ObjectId,
    new_oid: ObjectId,
    ref_name: String,
}

/// Handle `POST /git-receive-pack` (`git push`).
/// Reads ref update commands via `gix_packetline`, unpacks and verifies incoming `PACK` v2 objects
/// via `gix_zlib` + `gix_object` + `gix_hash`, validates ref names via `gix_validate`, and returns `report-status`.
pub fn handle_receive_pack(req_body: &[u8], repo: &str) -> Result<Vec<u8>, String> {
    let lock = gas_lock_service::get_script_lock();
    let _locked = lock.try_lock(10_000);

    let store = GasGitStore::new(repo);
    store.ensure_initialized()?;

    let mut commands: Vec<RefUpdateCommand> = Vec::new();
    let mut client_caps: BTreeSet<String> = BTreeSet::new();

    let mut cursor = Cursor::new(req_body);
    {
        let mut reader = StreamingPeekableIter::new(&mut cursor, &[PacketLineRef::Flush], false);
        while let Some(line_res) = reader.read_line() {
            let pkt = line_res
                .map_err(|e| format!("receive-pack io error: {}", e))?
                .map_err(|e| format!("receive-pack decode error: {}", e))?;
            if let Some(slice) = pkt.as_slice() {
                let slice = slice.strip_suffix(b"\n").unwrap_or(slice);
                let (cmd_part, cap_part) = match slice.find_byte(0) {
                    Some(nul_idx) => (&slice[..nul_idx], Some(&slice[nul_idx + 1..])),
                    None => (slice, None),
                };
                if let Some(caps_bytes) = cap_part {
                    for cap in String::from_utf8_lossy(caps_bytes).split_whitespace() {
                        client_caps.insert(cap.to_string());
                    }
                }
                let cmd_str = String::from_utf8_lossy(cmd_part);
                let mut parts = cmd_str.split_whitespace();
                if let (Some(old_hex), Some(new_hex), Some(ref_name)) =
                    (parts.next(), parts.next(), parts.next())
                {
                    let old_oid = ObjectId::from_hex(old_hex.as_bytes())
                        .map_err(|e| format!("Invalid old OID '{}': {}", old_hex, e))?;
                    let new_oid = ObjectId::from_hex(new_hex.as_bytes())
                        .map_err(|e| format!("Invalid new OID '{}': {}", new_hex, e))?;
                    commands.push(RefUpdateCommand {
                        old_oid,
                        new_oid,
                        ref_name: ref_name.to_string(),
                    });
                }
            }
        }
    }

    let pack_offset = cursor.position() as usize;
    let pack_slice = if pack_offset <= req_body.len() {
        &req_body[pack_offset..]
    } else {
        &[]
    };

    let unpack_status = if !pack_slice.is_empty() {
        match unpack_pack_v2(pack_slice, &store) {
            Ok(_count) => "unpack ok".to_string(),
            Err(err) => format!("unpack {}", err),
        }
    } else {
        "unpack ok".to_string()
    };

    let unpack_ok = unpack_status == "unpack ok";
    let mut ref_statuses: Vec<String> = Vec::with_capacity(commands.len());

    for cmd in &commands {
        if !unpack_ok {
            ref_statuses.push(format!("ng {} unpacker failed", cmd.ref_name));
            continue;
        }
        // Validate ref name using gitoxide's gix_validate
        if let Err(e) = gix_validate::reference::name(cmd.ref_name.as_bytes().as_bstr()) {
            ref_statuses.push(format!("ng {} invalid refname ({})", cmd.ref_name, e));
            continue;
        }
        // Check old_oid matches current server state (if not zero-oid creation)
        let current_oid = store
            .resolve_ref(&cmd.ref_name)
            .unwrap_or_else(|| ObjectId::null(HashKind::Sha1));
        if !cmd.old_oid.is_null() && current_oid != cmd.old_oid && !current_oid.is_null() {
            ref_statuses.push(format!(
                "ng {} non-fast-forward (current {} != expected {})",
                cmd.ref_name,
                current_oid.to_hex(),
                cmd.old_oid.to_hex()
            ));
            continue;
        }
        match store.update_ref(&cmd.ref_name, &cmd.new_oid) {
            Ok(()) => ref_statuses.push(format!("ok {}", cmd.ref_name)),
            Err(e) => ref_statuses.push(format!("ng {} {}", cmd.ref_name, e)),
        }
    }

    lock.release_lock();

    // Encode report-status lines using gix_packetline
    let mut status_pkt = Vec::with_capacity(256);
    pkt_encode::text_to_write(unpack_status.as_bytes(), &mut status_pkt)
        .map_err(|e| format!("pkt-line encode error: {}", e))?;
    for st in &ref_statuses {
        pkt_encode::text_to_write(st.as_bytes(), &mut status_pkt)
            .map_err(|e| format!("pkt-line encode error: {}", e))?;
    }
    pkt_encode::flush_to_write(&mut status_pkt)
        .map_err(|e| format!("pkt-line flush error: {}", e))?;

    let use_sideband =
        client_caps.contains("side-band-64k") || client_caps.contains("side-band");
    if use_sideband {
        let mut sideband_out = Vec::with_capacity(status_pkt.len() + 16);
        pkt_encode::band_to_write(Channel::Data, &status_pkt, &mut sideband_out)
            .map_err(|e| format!("sideband encode error: {}", e))?;
        pkt_encode::flush_to_write(&mut sideband_out)
            .map_err(|e| format!("sideband flush error: {}", e))?;
        Ok(sideband_out)
    } else {
        Ok(status_pkt)
    }
}

/// Unpack a Git `PACK` v2 stream using `gix_zlib::Inflate`, `gix_hash`, and `gix_object`,
/// resolving both base objects (`Commit`, `Tree`, `Blob`, `Tag`) and delta objects (`OFS_DELTA`, `REF_DELTA`).
fn unpack_pack_v2(pack: &[u8], store: &GasGitStore) -> Result<usize, String> {
    if pack.len() < 32 {
        return Err(format!("pack too short ({} bytes)", pack.len()));
    }
    if &pack[0..4] != b"PACK" {
        return Err("invalid pack magic (expected 'PACK')".to_string());
    }
    let version = u32::from_be_bytes([pack[4], pack[5], pack[6], pack[7]]);
    if version != 2 && version != 3 {
        return Err(format!("unsupported pack version {}", version));
    }
    let num_objects = u32::from_be_bytes([pack[8], pack[9], pack[10], pack[11]]) as usize;

    let data_end = pack.len() - 20;
    let expected_trailer = ObjectId::from_bytes_or_panic(&pack[data_end..]);
    let mut hasher = gix_hash::hasher(HashKind::Sha1);
    hasher.update(&pack[..data_end]);
    let actual_trailer = hasher
        .try_finalize()
        .map_err(|e| format!("pack checksum calculation failed: {}", e))?;
    if actual_trailer != expected_trailer {
        return Err(format!(
            "pack SHA-1 checksum mismatch (expected {}, got {})",
            expected_trailer.to_hex(),
            actual_trailer.to_hex()
        ));
    }

    let mut pos = 12usize;
    let mut inflate = Inflate::default();
    // Map of pack byte offset -> (ObjectKind, Vec<u8>, ObjectId) for OFS_DELTA resolution
    let mut by_offset: BTreeMap<usize, (ObjectKind, Vec<u8>, ObjectId)> = BTreeMap::new();
    let mut by_oid: BTreeMap<ObjectId, (ObjectKind, Vec<u8>)> = BTreeMap::new();

    for idx in 0..num_objects {
        if pos >= data_end {
            return Err(format!(
                "unexpected EOF in pack at object {}/{}",
                idx, num_objects
            ));
        }
        let entry_start = pos;
        let first = pack[pos];
        pos += 1;
        let obj_type = (first >> 4) & 0x07;
        let mut uncompressed_size = (first & 0x0f) as usize;
        let mut shift = 4usize;
        let mut cont = first & 0x80 != 0;
        while cont {
            if pos >= data_end {
                return Err("truncated pack object size header".to_string());
            }
            let b = pack[pos];
            pos += 1;
            uncompressed_size |= ((b & 0x7f) as usize) << shift;
            shift += 7;
            cont = b & 0x80 != 0;
        }

        match obj_type {
            1..=4 => {
                let kind = match obj_type {
                    1 => ObjectKind::Commit,
                    2 => ObjectKind::Tree,
                    3 => ObjectKind::Blob,
                    4 => ObjectKind::Tag,
                    _ => unreachable!(),
                };
                let (decompressed, consumed) =
                    inflate_pack_entry(&mut inflate, &pack[pos..data_end], uncompressed_size)?;
                pos += consumed;

                // Validate with gitoxide ObjectRef::from_bytes and persist
                ObjectRef::from_bytes(kind, &decompressed).map_err(|e| {
                    format!("invalid {} object in pack: {}", kind, e)
                })?;
                let oid = store.write_raw_object(kind, &decompressed)?;
                by_offset.insert(entry_start, (kind, decompressed.clone(), oid));
                by_oid.insert(oid, (kind, decompressed));
            }
            6 => {
                // OBJ_OFS_DELTA: negative byte offset from `entry_start`
                if pos >= data_end {
                    return Err("truncated OFS_DELTA header".to_string());
                }
                let mut b = pack[pos];
                pos += 1;
                let mut neg_offset = (b & 0x7f) as usize;
                while b & 0x80 != 0 {
                    if pos >= data_end {
                        return Err("truncated OFS_DELTA varint".to_string());
                    }
                    b = pack[pos];
                    pos += 1;
                    neg_offset = ((neg_offset + 1) << 7) | ((b & 0x7f) as usize);
                }
                let base_offset = entry_start
                    .checked_sub(neg_offset)
                    .ok_or_else(|| "OFS_DELTA offset underflow".to_string())?;
                let (base_kind, base_data, _) = by_offset
                    .get(&base_offset)
                    .ok_or_else(|| format!("OFS_DELTA base at offset {} not found", base_offset))?
                    .clone();

                let (delta_bytes, consumed) =
                    inflate_pack_entry(&mut inflate, &pack[pos..data_end], uncompressed_size)?;
                pos += consumed;

                let target_data = apply_git_delta(&base_data, &delta_bytes)?;
                ObjectRef::from_bytes(base_kind, &target_data).map_err(|e| {
                    format!("invalid delta-reconstructed {} object: {}", base_kind, e)
                })?;
                let oid = store.write_raw_object(base_kind, &target_data)?;
                by_offset.insert(entry_start, (base_kind, target_data.clone(), oid));
                by_oid.insert(oid, (base_kind, target_data));
            }
            7 => {
                // OBJ_REF_DELTA: 20-byte base ObjectId
                if pos + 20 > data_end {
                    return Err("truncated REF_DELTA base OID".to_string());
                }
                let base_oid = ObjectId::from_bytes_or_panic(&pack[pos..pos + 20]);
                pos += 20;

                let (base_kind, base_data) = if let Some(found) = by_oid.get(&base_oid) {
                    found.clone()
                } else if let Some(stored) = store.read_raw_object(&base_oid)? {
                    stored
                } else {
                    return Err(format!(
                        "REF_DELTA base object {} not found",
                        base_oid.to_hex()
                    ));
                };

                let (delta_bytes, consumed) =
                    inflate_pack_entry(&mut inflate, &pack[pos..data_end], uncompressed_size)?;
                pos += consumed;

                let target_data = apply_git_delta(&base_data, &delta_bytes)?;
                ObjectRef::from_bytes(base_kind, &target_data).map_err(|e| {
                    format!("invalid REF_DELTA {} object: {}", base_kind, e)
                })?;
                let oid = store.write_raw_object(base_kind, &target_data)?;
                by_offset.insert(entry_start, (base_kind, target_data.clone(), oid));
                by_oid.insert(oid, (base_kind, target_data));
            }
            other => {
                return Err(format!("unsupported pack object type {}", other));
            }
        }
    }

    Ok(num_objects)
}

/// Inflate a single zlib-compressed entry from `input` of known `expected_size` using `gix_zlib::Inflate`.
fn inflate_pack_entry(
    inflate: &mut Inflate,
    input: &[u8],
    expected_size: usize,
) -> Result<(Vec<u8>, usize), String> {
    inflate.reset();
    let mut out = vec![0u8; expected_size.max(1)];
    let (status, consumed_in, produced_out) = inflate
        .once(input, &mut out)
        .map_err(|e| format!("zlib inflate error: {}", e))?;
    if status != ZlibStatus::StreamEnd {
        return Err(format!(
            "incomplete zlib stream in pack entry (status={:?}, expected={} bytes, got={})",
            status, expected_size, produced_out
        ));
    }
    out.truncate(expected_size);
    Ok((out, consumed_in))
}

/// Apply a standard Git pack delta instruction stream to `base`.
fn apply_git_delta(base: &[u8], delta: &[u8]) -> Result<Vec<u8>, String> {
    let mut pos = 0usize;
    let src_size = read_delta_varint(delta, &mut pos)?;
    if src_size != base.len() {
        return Err(format!(
            "delta base size mismatch: expected {}, got {}",
            src_size,
            base.len()
        ));
    }
    let dst_size = read_delta_varint(delta, &mut pos)?;
    let mut out = Vec::with_capacity(dst_size);

    while pos < delta.len() {
        let cmd = delta[pos];
        pos += 1;
        if cmd & 0x80 != 0 {
            // Copy from base
            let mut cp_off = 0usize;
            let mut cp_size = 0usize;
            if cmd & 0x01 != 0 {
                cp_off |= delta[pos] as usize;
                pos += 1;
            }
            if cmd & 0x02 != 0 {
                cp_off |= (delta[pos] as usize) << 8;
                pos += 1;
            }
            if cmd & 0x04 != 0 {
                cp_off |= (delta[pos] as usize) << 16;
                pos += 1;
            }
            if cmd & 0x08 != 0 {
                cp_off |= (delta[pos] as usize) << 24;
                pos += 1;
            }
            if cmd & 0x10 != 0 {
                cp_size |= delta[pos] as usize;
                pos += 1;
            }
            if cmd & 0x20 != 0 {
                cp_size |= (delta[pos] as usize) << 8;
                pos += 1;
            }
            if cmd & 0x40 != 0 {
                cp_size |= (delta[pos] as usize) << 16;
                pos += 1;
            }
            if cp_size == 0 {
                cp_size = 0x10000;
            }
            if cp_off + cp_size > base.len() {
                return Err("delta copy out of bounds".to_string());
            }
            out.extend_from_slice(&base[cp_off..cp_off + cp_size]);
        } else if cmd != 0 {
            // Insert literal bytes from delta
            let len = cmd as usize;
            if pos + len > delta.len() {
                return Err("delta literal insert out of bounds".to_string());
            }
            out.extend_from_slice(&delta[pos..pos + len]);
            pos += len;
        } else {
            return Err("invalid delta opcode 0".to_string());
        }
    }

    if out.len() != dst_size {
        return Err(format!(
            "delta result size mismatch: expected {}, got {}",
            dst_size,
            out.len()
        ));
    }
    Ok(out)
}

fn read_delta_varint(data: &[u8], pos: &mut usize) -> Result<usize, String> {
    let mut val = 0usize;
    let mut shift = 0usize;
    loop {
        if *pos >= data.len() {
            return Err("unexpected EOF reading delta varint".to_string());
        }
        let b = data[*pos];
        *pos += 1;
        val |= ((b & 0x7f) as usize) << shift;
        if b & 0x80 == 0 {
            return Ok(val);
        }
        shift += 7;
    }
}

/// Route a GAS `doGet(e)` event if it targets the Git Smart HTTP v1 server.
/// Returns `Some(GasTextOutput)` if `service` or `git_path` is present, or `None` for non-Git `doGet` requests.
pub fn try_handle_do_get(event: &GasDoGetEvent) -> Option<GasTextOutput> {
    let service = event
        .parameter
        .get("service")
        .map(|s| s.as_str())
        .or_else(|| {
            match event.parameter.get("git_path").map(|s| s.as_str()) {
                Some(p) if p.contains("git-upload-pack") => Some("git-upload-pack"),
                Some(p) if p.contains("git-receive-pack") => Some("git-receive-pack"),
                _ => None,
            }
        })?;

    let repo = event
        .parameter
        .get("repo")
        .map(|s| s.as_str())
        .unwrap_or(DEFAULT_REPO);
    let encoding = event
        .parameter
        .get("encoding")
        .map(|s| s.as_str())
        .unwrap_or("raw");
    let format = event
        .parameter
        .get("format")
        .map(|s| s.as_str())
        .unwrap_or("text");

    let content_type = format!("application/x-{}-advertisement", service);
    match handle_info_refs(service, repo) {
        Ok(bytes) => {
            if format == "json" {
                let b64 = gas_utilities::base64_encode(&BinaryOrStringInput::Bytes(bytes));
                let env = GasGitResponseEnvelope {
                    ok: true,
                    status: 200,
                    content_type,
                    body_base64: b64,
                    error: None,
                };
                let json = serde_json::to_string(&env).unwrap_or_default();
                Some(gas_content_service::create_text_output(&json).set_mime_type(MimeType::Json))
            } else if encoding == "base64" {
                let b64 = gas_utilities::base64_encode(&BinaryOrStringInput::Bytes(bytes));
                Some(gas_content_service::create_text_output(&b64).set_mime_type(MimeType::Text))
            } else {
                let text = String::from_utf8_lossy(&bytes);
                Some(gas_content_service::create_text_output(&text).set_mime_type(MimeType::Text))
            }
        }
        Err(err) => {
            if format == "json" {
                let env = GasGitResponseEnvelope {
                    ok: false,
                    status: 400,
                    content_type,
                    body_base64: String::new(),
                    error: Some(err),
                };
                let json = serde_json::to_string(&env).unwrap_or_default();
                Some(gas_content_service::create_text_output(&json).set_mime_type(MimeType::Json))
            } else {
                Some(
                    gas_content_service::create_text_output(&format!("ERR {}", err))
                        .set_mime_type(MimeType::Text),
                )
            }
        }
    }
}

/// Handle a GAS `doPost(e)` event for `/git-upload-pack` and `/git-receive-pack`.
pub fn handle_do_post(event: &GasDoPostEvent) -> GasTextOutput {
    let raw_contents = event
        .post_data
        .as_ref()
        .map(|p| p.contents.as_str())
        .unwrap_or("");

    // Support both JSON envelope (`{"service": "...", "body_base64": "..."}`) and query-param + base64/raw body
    let parsed_env: Option<GasGitPostEnvelope> = serde_json::from_str(raw_contents).ok();

    let service = parsed_env
        .as_ref()
        .and_then(|e| e.service.as_deref())
        .or_else(|| event.parameter.get("service").map(|s| s.as_str()))
        .or_else(|| {
            let path = parsed_env
                .as_ref()
                .and_then(|e| e.git_path.as_deref())
                .or_else(|| event.parameter.get("git_path").map(|s| s.as_str()))
                .or_else(|| event.path_info.as_deref())?;
            if path.contains("git-receive-pack") {
                Some("git-receive-pack")
            } else if path.contains("git-upload-pack") {
                Some("git-upload-pack")
            } else {
                None
            }
        })
        .unwrap_or("git-upload-pack");

    let repo = parsed_env
        .as_ref()
        .and_then(|e| e.repo.as_deref())
        .or_else(|| event.parameter.get("repo").map(|s| s.as_str()))
        .unwrap_or(DEFAULT_REPO);

    let response_encoding = parsed_env
        .as_ref()
        .and_then(|e| e.encoding.as_deref())
        .or_else(|| event.parameter.get("encoding").map(|s| s.as_str()))
        .unwrap_or("base64");

    let format = event
        .parameter
        .get("format")
        .map(|s| s.as_str())
        .unwrap_or("text");

    let req_bytes: Vec<u8> = if let Some(b64) = parsed_env.as_ref().and_then(|e| e.body_base64.as_deref()) {
        gas_utilities::base64_decode(b64.trim(), None)
    } else if event.parameter.get("req_encoding").map(|s| s.as_str()) == Some("raw") {
        raw_contents.as_bytes().to_vec()
    } else {
        // Default: decode base64 body if valid base64, otherwise treat as raw bytes
        let trimmed = raw_contents.trim();
        if !trimmed.is_empty() && !trimmed.starts_with("00") {
            gas_utilities::base64_decode(trimmed, None)
        } else {
            raw_contents.as_bytes().to_vec()
        }
    };

    let result = match service {
        "git-upload-pack" => handle_upload_pack(&req_bytes, repo),
        "git-receive-pack" => handle_receive_pack(&req_bytes, repo),
        other => Err(format!("Unsupported POST service '{}'", other)),
    };

    let content_type = format!("application/x-{}-result", service);
    match result {
        Ok(res_bytes) => {
            let b64 = gas_utilities::base64_encode(&BinaryOrStringInput::Bytes(res_bytes.clone()));
            if format == "json" {
                let env = GasGitResponseEnvelope {
                    ok: true,
                    status: 200,
                    content_type,
                    body_base64: b64,
                    error: None,
                };
                let json = serde_json::to_string(&env).unwrap_or_default();
                gas_content_service::create_text_output(&json).set_mime_type(MimeType::Json)
            } else if response_encoding == "raw" {
                let text = String::from_utf8_lossy(&res_bytes);
                gas_content_service::create_text_output(&text).set_mime_type(MimeType::Text)
            } else {
                gas_content_service::create_text_output(&b64).set_mime_type(MimeType::Text)
            }
        }
        Err(err) => {
            let mut err_pkt = Vec::new();
            let _ = pkt_encode::error_to_write(err.as_bytes(), &mut err_pkt);
            let b64 = gas_utilities::base64_encode(&BinaryOrStringInput::Bytes(err_pkt));
            if format == "json" {
                let env = GasGitResponseEnvelope {
                    ok: false,
                    status: 500,
                    content_type,
                    body_base64: b64,
                    error: Some(err),
                };
                let json = serde_json::to_string(&env).unwrap_or_default();
                gas_content_service::create_text_output(&json).set_mime_type(MimeType::Json)
            } else {
                gas_content_service::create_text_output(&b64).set_mime_type(MimeType::Text)
            }
        }
    }
}
