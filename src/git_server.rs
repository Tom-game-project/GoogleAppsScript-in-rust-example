//! Git Smart HTTP v1 Server on Google Apps Script powered by `gitoxide`,
//! with Google Drive multi-repository storage and Gleam + Lustre Web UI backend APIs.
//!
//! Supported Git Smart HTTP v1 endpoints (GitHub-style path routing without username):
//! - `GET  /<project_name>.git/info/refs?service=git-upload-pack`  (`git ls-remote`, `git fetch`, `git clone`, `git pull`)
//! - `GET  /<project_name>.git/info/refs?service=git-receive-pack` (`git push` ref discovery)
//! - `POST /<project_name>.git/git-upload-pack`                    (packfile negotiation & transfer)
//! - `POST /<project_name>.git/git-receive-pack`                   (packfile unpack & reference updates)
//!
//! Supported Web UI endpoints (Browser & JSON API):
//! - `GET  /` or `GET /<project_name>.git`                         (Gleam + Lustre Web UI via `HtmlService`)
//! - `GET  ?action=list_repos`                                     (JSON list of repositories in `GIT_DRIVE_FOLDER_ID`)
//! - `POST ?action=create_repo`                                    (Create a new empty `<project_name>.git` repository in Drive)

use std::cell::RefCell;
use std::collections::{BTreeMap, BTreeSet, VecDeque};
use std::io::{Cursor, Write as IoWrite};

use base64::Engine as _;
use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use gix_hash::{Kind as HashKind, ObjectId};
use gix_object::{Kind as ObjectKind, ObjectRef, WriteTo, bstr::ByteSlice};
use gix_packetline::{
    Channel, PacketLineRef,
    blocking_io::{StreamingPeekableIter, encode as pkt_encode},
};
use gix_zlib::{Compression, Inflate, Status as ZlibStatus, stream::deflate};
use serde::{Deserialize, Serialize};

use crate::args::{GasDoGetEvent, GasDoPostEvent};
use crate::bindings::WebResponse;
use crate::bindings::gas::content_service::{
    gas_content_service,
    gas_text_output::{GasTextOutput, MimeType},
};
use crate::bindings::gas::drive_app::{
    gas_drive_app,
    gas_file::{CreateFileInput, GasFile, GasFolder, TextFileSpec},
};
use crate::bindings::gas::html_service::{
    gas_html_output::{GasHtmlOutput, HtmlSource, SandboxMode, XFrameOptionsMode},
    gas_html_service,
};
use crate::bindings::gas::lock_service::gas_lock_service;
use crate::bindings::gas::logger::logger;
use crate::bindings::gas::property::properties_service;

pub const ENV_GIT_DRIVE_FOLDER_ID: &str = "GIT_DRIVE_FOLDER_ID";
pub const ENV_GAS_WEB_APP_URL: &str = "GAS_WEB_APP_URL";
pub const ENV_GIT_COMMIT_PAGE_SIZE: &str = "GIT_COMMIT_PAGE_SIZE";
pub const DEFAULT_COMMIT_PAGE_SIZE: usize = 20;
const DEFAULT_BRANCH: &str = "refs/heads/main";
const MAX_SIDEBAND_CHUNK: usize = 65500;
const HEAD_FILE_NAME: &str = "HEAD";
const REFS_FILE_NAME: &str = "refs.json";
const OBJECTS_FOLDER_NAME: &str = "objects";

/// Escape a string for safe inclusion in HTML text or double/single-quoted attribute contexts.
pub fn escape_html(input: &str) -> String {
    let mut out = String::with_capacity(input.len() + 8);
    for ch in input.chars() {
        match ch {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&#39;"),
            _ => out.push(ch),
        }
    }
    out
}

/// RFC 3986 percent-encode a single URL path segment so special characters (`?`, `#`, `%`, `/`, spaces, UTF-8)
/// never break link navigation.
pub fn encode_uri_segment(segment: &str) -> String {
    let mut out = String::with_capacity(segment.len());
    for &b in segment.as_bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' => {
                out.push(b as char);
            }
            _ => {
                out.push_str(&format!("%{:02X}", b));
            }
        }
    }
    out
}

/// Percent-decode a URL path segment (`%XX` -> byte).
pub fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0usize;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hi = (bytes[i + 1] as char).to_digit(16);
            let lo = (bytes[i + 2] as char).to_digit(16);
            if let (Some(h), Some(l)) = (hi, lo) {
                out.push(((h << 4) | l) as u8);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Format a Unix timestamp (seconds) as `YYYY-MM-DD HH:MM:SS UTC` for nginx autoindex listings.
pub fn format_utc_timestamp(ts: i64) -> String {
    if ts < 0 {
        return "1970-01-01 00:00:00 UTC".to_string();
    }
    let days = ts.div_euclid(86_400);
    let secs_of_day = ts.rem_euclid(86_400);
    let hour = secs_of_day / 3600;
    let minute = (secs_of_day % 3600) / 60;
    let second = secs_of_day % 60;

    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let y = (yoe as i64) + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = if m <= 2 { y + 1 } else { y };

    format!(
        "{:04}-{:02}-{:02} {:02}:{:02}:{:02} UTC",
        year, m, d, hour, minute, second
    )
}

/// Parsed route from the incoming URL path (`/<project_name>.git/...`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum GitRoute {
    /// Root path (`/`) — renders the Gleam + Lustre Web UI dashboard.
    WebUiRoot,
    /// Repository root (`/<project_name>.git`) — renders the Web UI focused on `project_name`
    /// (or handles Git service if explicitly requested via query parameters).
    WebUiRepo { project_name: String },
    /// `GET /<project_name>.git/info/refs`
    InfoRefs { project_name: String },
    /// `POST /<project_name>.git/git-upload-pack`
    UploadPack { project_name: String },
    /// `POST /<project_name>.git/git-receive-pack`
    ReceivePack { project_name: String },
    /// Direct nginx-autoindex-style Commit / Directory / Raw-File Browser under `/<project_name>.git`:
    /// - `GET /<project_name>.git/<commit_hash>`
    /// - `GET /<project_name>.git/<commit_hash>/<dir_path>`
    /// - `GET /<project_name>.git/<commit_hash>/<file_path>`
    CommitBrowser {
        project_name: String,
        commit_ref: String,
        subpath: Vec<String>,
        trailing_slash: bool,
    },
}

/// Validate and normalize a repository path segment (e.g. `"my-project.git"` -> `"my-project"`).
pub fn parse_project_segment(segment: &str) -> Result<String, String> {
    let trimmed = segment.trim();
    if trimmed.is_empty() {
        return Err("Repository name cannot be empty".to_string());
    }
    let name = trimmed.strip_suffix(".git").unwrap_or(trimmed);
    if name.is_empty() || name == "." || name == ".." {
        return Err(format!("Invalid repository name '{}'", segment));
    }
    if !name
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.')
    {
        return Err(format!(
            "Invalid repository name '{}': only ASCII alphanumeric, '-', '_', and '.' are allowed",
            name
        ));
    }
    Ok(name.to_string())
}

/// Parse a URL path (from `e.pathInfo` or `git_path`) into a `GitRoute`.
/// Enforces `/<project_name>.git` as the base segment after `/exec/`; direct `/exec/<commit_hash>` is rejected.
pub fn parse_git_path(raw_path: &str) -> Result<GitRoute, String> {
    let without_query = raw_path.split('?').next().unwrap_or("");
    let trailing_slash = without_query.len() > 1 && without_query.ends_with('/');
    let segments: Vec<&str> = without_query
        .split('/')
        .filter(|s| !s.is_empty())
        .collect();

    let slice: &[&str] = if segments.len() >= 4
        && segments[0] == "macros"
        && segments[1] == "s"
        && (segments[3] == "exec" || segments[3] == "dev")
    {
        &segments[4..]
    } else if !segments.is_empty() && (segments[0] == "exec" || segments[0] == "dev") {
        &segments[1..]
    } else {
        &segments[..]
    };

    match slice {
        [] => Ok(GitRoute::WebUiRoot),
        ["info", "refs"] | ["git-upload-pack"] | ["git-receive-pack"] => Err(
            "Missing repository name in URL path. Expected /<project_name>.git/info/refs, /<project_name>.git/git-upload-pack, or /<project_name>.git/git-receive-pack"
                .to_string(),
        ),
        [repo_seg, ..] if !repo_seg.ends_with(".git") => Err(format!(
            "Invalid URL path '/{}': path after /exec/ must start with /<project_name>.git (direct /exec/<commit_hash> is disabled)",
            slice.join("/")
        )),
        [repo_seg, "info", "refs"] => {
            let project_name = parse_project_segment(repo_seg)?;
            Ok(GitRoute::InfoRefs { project_name })
        }
        [repo_seg, "git-upload-pack"] => {
            let project_name = parse_project_segment(repo_seg)?;
            Ok(GitRoute::UploadPack { project_name })
        }
        [repo_seg, "git-receive-pack"] => {
            let project_name = parse_project_segment(repo_seg)?;
            Ok(GitRoute::ReceivePack { project_name })
        }
        [repo_seg] => {
            let project_name = parse_project_segment(repo_seg)?;
            Ok(GitRoute::WebUiRepo { project_name })
        }
        [repo_seg, commit_seg, rest @ ..] => {
            let project_name = parse_project_segment(repo_seg)?;
            Ok(GitRoute::CommitBrowser {
                project_name,
                commit_ref: percent_decode(commit_seg),
                subpath: rest.iter().map(|s| percent_decode(s)).collect(),
                trailing_slash,
            })
        }
    }
}

/// Combine GAS `e.pathInfo` and `git_path` query/envelope parameter into a single normalized request path.
pub fn extract_request_path(event: &GasDoGetEvent, envelope_git_path: Option<&str>) -> String {
    let git_path_param = envelope_git_path
        .filter(|s| !s.trim().is_empty())
        .or_else(|| {
            event
                .parameter
                .get("git_path")
                .map(|s| s.as_str())
                .filter(|s| !s.trim().is_empty())
        });
    let raw_pi = event.path_info.as_deref().unwrap_or("");
    let raw_gp = git_path_param.unwrap_or("");
    let had_trailing_slash = (raw_gp.len() > 1 && raw_gp.ends_with('/'))
        || (raw_gp.is_empty() && !raw_pi.is_empty() && raw_pi.ends_with('/'));

    let path_info = event
        .path_info
        .as_deref()
        .map(|s| s.trim_matches('/'))
        .filter(|s| !s.is_empty());

    let mut combined = match (path_info, git_path_param) {
        (Some(pi), Some(gp)) => {
            let gp_trimmed = gp.trim_matches('/');
            if gp_trimmed.starts_with(pi) {
                format!("/{}", gp_trimmed)
            } else {
                format!("/{}/{}", pi, gp_trimmed)
            }
        }
        (None, Some(gp)) => format!("/{}", gp.trim_matches('/')),
        (Some(pi), None) => format!("/{}", pi),
        (None, None) => "/".to_string(),
    };
    if had_trailing_slash && combined != "/" && !combined.ends_with('/') {
        combined.push('/');
    }
    combined
}

/// JSON request payload sent by `git-remote-gas` or the Web UI to `doPost(e)`.
#[derive(Deserialize, Debug, Default)]
pub struct GasGitPostEnvelope {
    pub action: Option<String>,
    pub service: Option<String>,
    pub git_path: Option<String>,
    pub repo: Option<String>,
    pub project_name: Option<String>,
    pub commit_oid: Option<String>,
    pub description: Option<String>,
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

/// Metadata summary of a single Git repository stored in Google Drive (`<GIT_DRIVE_FOLDER_ID>/<name>.git`).
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
pub struct RepoSummary {
    pub name: String,
    pub folder_name: String,
    pub folder_id: String,
    pub folder_url: String,
    pub description: String,
    pub default_branch: String,
    pub head_oid: Option<String>,
    pub branch_count: usize,
    pub updated_at_ms: i64,
}

/// JSON payload returned to the Gleam + Lustre Web UI for listing and creating repositories.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct WebUiStateResponse {
    pub ok: bool,
    pub drive_folder_configured: bool,
    pub drive_folder_id: String,
    pub drive_folder_url: String,
    pub base_url: String,
    pub selected_project: Option<String>,
    pub repositories: Vec<RepoSummary>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Read an environment variable via WASI `wasi:cli/environment` (`std::env::var`)
/// with fallback to GAS `PropertiesService.getScriptProperties()`.
pub fn get_env_or_script_property(key: &str) -> Option<String> {
    if let Ok(val) = std::env::var(key) {
        let trimmed = val.trim();
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
        }
    }
    let props = properties_service::get_script_properties();
    props
        .get_property(key)
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
}

/// Retrieve the configured Google Drive Root Folder ID (`GIT_DRIVE_FOLDER_ID`).
pub fn get_root_drive_folder_id() -> Result<String, String> {
    get_env_or_script_property(ENV_GIT_DRIVE_FOLDER_ID).ok_or_else(|| {
        format!(
            "Environment variable '{}' (GAS Script Property) is not configured. \
             Please set '{}' to the Google Drive Folder ID where Git repositories will be stored.",
            ENV_GIT_DRIVE_FOLDER_ID, ENV_GIT_DRIVE_FOLDER_ID
        )
    })
}

/// Open the root Google Drive folder registered in `GIT_DRIVE_FOLDER_ID`.
fn open_root_drive_folder() -> Result<(String, GasFolder), String> {
    let folder_id = get_root_drive_folder_id()?;
    let folder = gas_drive_app::get_folder_by_id(&folder_id).ok_or_else(|| {
        format!(
            "Google Drive folder for {}='{}' was not found or cannot be accessed.",
            ENV_GIT_DRIVE_FOLDER_ID, folder_id
        )
    })?;
    Ok((folder_id, folder))
}

fn find_child_folder_by_name(parent: &GasFolder, name: &str) -> Option<GasFolder> {
    let iter = parent.get_folders_by_name(name);
    while iter.has_next() {
        let f = iter.next();
        if !f.is_trashed() {
            return Some(f);
        }
    }
    None
}

fn find_child_file_by_name(parent: &GasFolder, name: &str) -> Option<GasFile> {
    let iter = parent.get_files_by_name(name);
    while iter.has_next() {
        let f = iter.next();
        if !f.is_trashed() {
            return Some(f);
        }
    }
    None
}

fn read_text_file(parent: &GasFolder, name: &str) -> Option<String> {
    let file = find_child_file_by_name(parent, name)?;
    Some(file.get_blob().get_data_as_string(None))
}

fn write_text_file(parent: &GasFolder, name: &str, content: &str, mime_type: &str) -> GasFile {
    if let Some(existing) = find_child_file_by_name(parent, name) {
        existing.set_content(content);
        existing
    } else {
        parent.create_file(CreateFileInput::FromText(TextFileSpec {
            name: name.to_string(),
            content: content.to_string(),
            mime_type: Some(mime_type.to_string()),
        }))
    }
}

/// Persistent Git Object and Reference Store backed by Google Drive (`DriveApp`).
///
/// Optimized for Google Apps Script latency:
/// - Batched object bundle persistence: Unpacked incoming packfiles are stored in a single
///   `bundle_<trailer>.json` file in Google Drive, reducing N separate `DriveApp.createFile`
///   API calls down to 1 call (over 100x speedup on multi-object pushes).
/// - Pure-Rust Base64: Uses `base64::engine::general_purpose::STANDARD` in Wasm linear memory
///   with zero JS host boundary crossing or `Array.from` heap allocation overhead.
/// - In-memory object and ref caching: Subsequent reads within the same request are served in 0ms.
pub struct GasGitStore {
    pub repo: String,
    repo_folder: GasFolder,
    objects_folder: GasFolder,
    head_cache: RefCell<String>,
    refs_cache: RefCell<BTreeMap<String, ObjectId>>,
    object_cache: RefCell<BTreeMap<ObjectId, Vec<u8>>>,
    known_existing_objects: RefCell<BTreeSet<ObjectId>>,
    bundles_loaded: RefCell<bool>,
}

impl GasGitStore {
    /// Open an existing Git repository `<project_name>.git` inside the Google Drive root folder (`GIT_DRIVE_FOLDER_ID`).
    /// Does NOT auto-create the repository or seed an initial commit.
    pub fn open(project_name: &str) -> Result<Self, String> {
        let normalized = parse_project_segment(project_name)?;
        let (_root_id, root_folder) = open_root_drive_folder()?;

        let canonical_folder_name = format!("{}.git", normalized);
        let repo_folder = find_child_folder_by_name(&root_folder, &canonical_folder_name)
            .or_else(|| find_child_folder_by_name(&root_folder, &normalized))
            .ok_or_else(|| {
                format!(
                    "Repository '{}.git' does not exist in the configured Google Drive folder. \
                     Please create it from the Web UI first.",
                    normalized
                )
            })?;

        let objects_folder = find_child_folder_by_name(&repo_folder, OBJECTS_FOLDER_NAME)
            .unwrap_or_else(|| repo_folder.create_folder(OBJECTS_FOLDER_NAME));

        let head_raw = read_text_file(&repo_folder, HEAD_FILE_NAME)
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| format!("ref: {}", DEFAULT_BRANCH));

        let mut refs_map = BTreeMap::new();
        if let Some(refs_json) = read_text_file(&repo_folder, REFS_FILE_NAME) {
            if let Ok(parsed) = serde_json::from_str::<BTreeMap<String, String>>(&refs_json) {
                for (k, v) in parsed {
                    if let Ok(oid) = ObjectId::from_hex(v.trim().as_bytes()) {
                        refs_map.insert(k, oid);
                    }
                }
            }
        }

        Ok(Self {
            repo: normalized,
            repo_folder,
            objects_folder,
            head_cache: RefCell::new(head_raw),
            refs_cache: RefCell::new(refs_map),
            object_cache: RefCell::new(BTreeMap::new()),
            known_existing_objects: RefCell::new(BTreeSet::new()),
            bundles_loaded: RefCell::new(false),
        })
    }

    /// Create a new empty Git repository `<project_name>.git` inside the registered Google Drive folder (`GIT_DRIVE_FOLDER_ID`).
    /// Never generates an automatic initial commit.
    pub fn create_repository(
        project_name: &str,
        description: Option<&str>,
    ) -> Result<RepoSummary, String> {
        let normalized = parse_project_segment(project_name)?;
        let (_root_id, root_folder) = open_root_drive_folder()?;
        let folder_name = format!("{}.git", normalized);

        if find_child_folder_by_name(&root_folder, &folder_name).is_some()
            || find_child_folder_by_name(&root_folder, &normalized).is_some()
        {
            return Err(format!("Repository '{}' already exists.", folder_name));
        }

        let repo_folder = root_folder.create_folder(&folder_name);
        let clean_desc = description.map(|d| d.trim()).unwrap_or("");
        if !clean_desc.is_empty() {
            repo_folder.set_description(clean_desc);
        }

        let head_content = format!("ref: {}\n", DEFAULT_BRANCH);
        write_text_file(&repo_folder, HEAD_FILE_NAME, &head_content, "text/plain");
        write_text_file(&repo_folder, REFS_FILE_NAME, "{}\n", "application/json");
        repo_folder.create_folder(OBJECTS_FOLDER_NAME);

        logger::log(&format!(
            "[gitoxide-gas] Created empty repository '{}' in Google Drive (folder_id={})",
            folder_name,
            repo_folder.get_id()
        ));

        Ok(Self::summarize_folder(&normalized, &repo_folder))
    }

    /// List all Git repositories stored inside the registered Google Drive folder (`GIT_DRIVE_FOLDER_ID`).
    pub fn list_repositories() -> Result<Vec<RepoSummary>, String> {
        let (_root_id, root_folder) = open_root_drive_folder()?;
        let iter = root_folder.get_folders();
        let mut repos = Vec::new();

        while iter.has_next() {
            let folder = iter.next();
            if folder.is_trashed() {
                continue;
            }
            let raw_name = folder.get_name();
            let project_name = if let Some(stripped) = raw_name.strip_suffix(".git") {
                if stripped.is_empty() {
                    continue;
                }
                stripped.to_string()
            } else if find_child_file_by_name(&folder, HEAD_FILE_NAME).is_some()
                || find_child_file_by_name(&folder, REFS_FILE_NAME).is_some()
            {
                raw_name.clone()
            } else {
                continue;
            };

            repos.push(Self::summarize_folder(&project_name, &folder));
        }

        repos.sort_by(|a, b| a.name.cmp(&b.name));
        Ok(repos)
    }

    fn summarize_folder(project_name: &str, folder: &GasFolder) -> RepoSummary {
        let head_raw = read_text_file(folder, HEAD_FILE_NAME)
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| format!("ref: {}", DEFAULT_BRANCH));
        let default_branch = head_raw
            .strip_prefix("ref:")
            .map(|s| s.trim().to_string())
            .unwrap_or_else(|| DEFAULT_BRANCH.to_string());

        let mut refs_map: BTreeMap<String, String> = BTreeMap::new();
        if let Some(refs_json) = read_text_file(folder, REFS_FILE_NAME) {
            if let Ok(parsed) = serde_json::from_str::<BTreeMap<String, String>>(&refs_json) {
                refs_map = parsed;
            }
        }

        let head_oid = refs_map
            .get(&default_branch)
            .cloned()
            .or_else(|| refs_map.values().next().cloned());
        let branch_count = refs_map
            .keys()
            .filter(|k| k.starts_with("refs/heads/"))
            .count();

        RepoSummary {
            name: project_name.to_string(),
            folder_name: folder.get_name(),
            folder_id: folder.get_id(),
            folder_url: folder.get_url(),
            description: folder.get_description().unwrap_or_default(),
            default_branch,
            head_oid,
            branch_count,
            updated_at_ms: folder.get_last_updated(),
        }
    }

    /// Serialize any `gix_object::WriteTo` implementation into loose object format (`<kind> <size>\0<body>`),
    /// compute its SHA-1 `ObjectId` via `gix_object::compute_hash`, and persist it in the repository's Drive `objects/` folder.
    pub fn write_object(&self, object: &dyn WriteTo) -> Result<ObjectId, String> {
        let mut body = Vec::with_capacity(object.size() as usize);
        object
            .write_to(&mut body)
            .map_err(|e| format!("Failed to serialize git object: {}", e))?;
        self.write_raw_object(object.kind(), &body)
    }

    /// Compute SHA-1 `ObjectId` for `(kind, body)` and store the loose object inside `<repo>.git/objects/<oid>` on Google Drive.
    pub fn write_raw_object(&self, kind: ObjectKind, body: &[u8]) -> Result<ObjectId, String> {
        let oid = gix_object::compute_hash(HashKind::Sha1, kind, body)
            .map_err(|e| format!("Failed to compute SHA-1 hash: {}", e))?;

        let header = gix_object::encode::loose_header(kind, body.len() as u64);
        let mut loose_bytes = Vec::with_capacity(header.len() + body.len());
        loose_bytes.extend_from_slice(&header);
        loose_bytes.extend_from_slice(body);

        if self.object_cache.borrow().contains_key(&oid)
            || self.known_existing_objects.borrow().contains(&oid)
        {
            return Ok(oid);
        }

        let oid_hex = oid.to_hex().to_string();
        if find_child_file_by_name(&self.objects_folder, &oid_hex).is_none() {
            let b64 = BASE64_STANDARD.encode(&loose_bytes);
            self.objects_folder
                .create_file(CreateFileInput::FromText(TextFileSpec {
                    name: oid_hex,
                    content: b64,
                    mime_type: Some("text/plain".to_string()),
                }));
        }

        self.known_existing_objects.borrow_mut().insert(oid);
        self.object_cache.borrow_mut().insert(oid, loose_bytes);
        Ok(oid)
    }

    /// Persist a batch of unpacked Git objects into Google Drive in a single batched bundle file (`objects/bundle_<trailer>.json`).
    /// This reduces N separate DriveApp.createFile API calls down to 1 single call, speeding up git push by orders of magnitude on GAS.
    pub fn write_objects_batch(
        &self,
        batch_id: &str,
        objects: &BTreeMap<ObjectId, (ObjectKind, Vec<u8>)>,
    ) -> Result<(), String> {
        if objects.is_empty() {
            return Ok(());
        }

        let mut bundle_map: BTreeMap<String, String> = BTreeMap::new();
        for (oid, (kind, body)) in objects {
            let header = gix_object::encode::loose_header(*kind, body.len() as u64);
            let mut loose_bytes = Vec::with_capacity(header.len() + body.len());
            loose_bytes.extend_from_slice(&header);
            loose_bytes.extend_from_slice(body);

            let b64 = BASE64_STANDARD.encode(&loose_bytes);
            bundle_map.insert(oid.to_hex().to_string(), b64);

            self.known_existing_objects.borrow_mut().insert(*oid);
            self.object_cache.borrow_mut().insert(*oid, loose_bytes);
        }

        let bundle_json = serde_json::to_string(&bundle_map)
            .map_err(|e| format!("Failed to serialize object bundle: {}", e))?;

        let bundle_filename = format!("bundle_{}.json", batch_id);
        self.objects_folder
            .create_file(CreateFileInput::FromText(TextFileSpec {
                name: bundle_filename,
                content: bundle_json,
                mime_type: Some("application/json".to_string()),
            }));

        Ok(())
    }

    /// Read loose object bytes (`<kind> <size>\0<body>`) by `ObjectId` from Google Drive (checking cache, loose files, and object bundles).
    pub fn read_loose_object(&self, oid: &ObjectId) -> Option<Vec<u8>> {
        if let Some(cached) = self.object_cache.borrow().get(oid) {
            return Some(cached.clone());
        }

        let oid_hex = oid.to_hex().to_string();

        // 1. Check if loose file exists
        if let Some(file) = find_child_file_by_name(&self.objects_folder, &oid_hex)
            .or_else(|| find_child_file_by_name(&self.repo_folder, &oid_hex))
        {
            let b64 = file.get_blob().get_data_as_string(None);
            if let Ok(decoded) = BASE64_STANDARD.decode(b64.trim().as_bytes()) {
                self.known_existing_objects.borrow_mut().insert(*oid);
                self.object_cache.borrow_mut().insert(*oid, decoded.clone());
                return Some(decoded);
            }
        }

        // 2. If not found as loose file, scan bundles from objects folder once
        if !*self.bundles_loaded.borrow() {
            self.ensure_bundles_loaded();
            if let Some(cached) = self.object_cache.borrow().get(oid) {
                return Some(cached.clone());
            }
        }

        None
    }

    /// Ensure all batched object bundle files (`bundle_*.json`) in `objects/` are loaded into `object_cache`.
    pub fn ensure_bundles_loaded(&self) {
        if *self.bundles_loaded.borrow() {
            return;
        }
        *self.bundles_loaded.borrow_mut() = true;
        let iter = self.objects_folder.get_files();
        while iter.has_next() {
            let file = iter.next();
            if file.is_trashed() {
                continue;
            }
            let name = file.get_name();
            if name.starts_with("bundle_") && name.ends_with(".json") {
                let json_str = file.get_blob().get_data_as_string(None);
                if let Ok(bundle) = serde_json::from_str::<BTreeMap<String, String>>(&json_str) {
                    for (hex_key, b64_val) in bundle {
                        if let Ok(b_oid) = ObjectId::from_hex(hex_key.as_bytes()) {
                            if let Ok(decoded) = BASE64_STANDARD.decode(b64_val.trim().as_bytes()) {
                                self.known_existing_objects.borrow_mut().insert(b_oid);
                                self.object_cache.borrow_mut().insert(b_oid, decoded);
                            }
                        }
                    }
                }
            }
        }
    }

    /// Load all commits reachable from `HEAD` and `refs` (plus any commit objects in `object_cache`).
    pub fn load_all_commits(&self) -> Vec<CommitItem> {
        let head_sym = self
            .head_symref()
            .unwrap_or_else(|| DEFAULT_BRANCH.to_string());
        let head_oid = self.resolve_ref("HEAD");
        let refs_map = self.list_refs();

        let mut decoration_map: BTreeMap<ObjectId, Vec<String>> = BTreeMap::new();
        for (rname, roid) in &refs_map {
            let mut labels = Vec::new();
            if Some(*roid) == head_oid && rname == &head_sym {
                let short = rname.strip_prefix("refs/heads/").unwrap_or(rname);
                labels.push(format!("HEAD -> {}", short));
            } else if let Some(branch) = rname.strip_prefix("refs/heads/") {
                labels.push(branch.to_string());
            } else if let Some(tag) = rname.strip_prefix("refs/tags/") {
                labels.push(format!("tag: {}", tag));
            } else {
                labels.push(rname.clone());
            }
            decoration_map.entry(*roid).or_default().extend(labels);
        }

        if let Some(h_oid) = head_oid {
            let entry = decoration_map.entry(h_oid).or_default();
            if !entry.iter().any(|s| s.starts_with("HEAD")) {
                entry.insert(0, "HEAD".to_string());
            }
        }

        let mut commits = Vec::new();
        let mut visited: BTreeSet<ObjectId> = BTreeSet::new();
        let mut queue: VecDeque<ObjectId> = VecDeque::new();

        if let Some(h) = head_oid {
            queue.push_back(h);
        }
        for roid in refs_map.values() {
            if !queue.contains(roid) {
                queue.push_back(*roid);
            }
        }

        while let Some(oid) = queue.pop_front() {
            if !visited.insert(oid) {
                continue;
            }
            let Some(loose) = self.read_loose_object(&oid) else {
                continue;
            };
            if let Ok(ObjectRef::Commit(c)) = ObjectRef::from_loose(&loose) {
                let parents: Vec<String> = c.parents().map(|p| p.to_hex().to_string()).collect();
                for p in c.parents() {
                    queue.push_back(p);
                }
                let (author_name, author_email) = match c.author().or_else(|_| c.committer()) {
                    Ok(sig) => (
                        sig.name.to_str_lossy().into_owned(),
                        sig.email.to_str_lossy().into_owned(),
                    ),
                    Err(_) => ("Unknown".to_string(), String::new()),
                };
                let timestamp = match c.time() {
                    Ok(t) => t.seconds,
                    Err(_) => 0,
                };
                let full_msg = c.message.to_str_lossy();
                let summary = full_msg.lines().next().unwrap_or("").to_string();
                let body = full_msg.to_string();
                let refs = decoration_map.get(&oid).cloned().unwrap_or_default();

                let hex = oid.to_hex().to_string();
                let short_oid = hex[..7.min(hex.len())].to_string();

                commits.push(CommitItem {
                    oid: hex,
                    short_oid,
                    parents,
                    author_name,
                    author_email,
                    timestamp,
                    summary,
                    body,
                    refs,
                });
            }
        }

        self.ensure_bundles_loaded();
        let cached_oids: Vec<ObjectId> = self.object_cache.borrow().keys().copied().collect();
        for oid in cached_oids {
            if visited.contains(&oid) {
                continue;
            }
            let Some(loose) = self.read_loose_object(&oid) else {
                continue;
            };
            if let Ok(ObjectRef::Commit(c)) = ObjectRef::from_loose(&loose) {
                visited.insert(oid);
                let parents: Vec<String> = c.parents().map(|p| p.to_hex().to_string()).collect();
                let (author_name, author_email) = match c.author().or_else(|_| c.committer()) {
                    Ok(sig) => (
                        sig.name.to_str_lossy().into_owned(),
                        sig.email.to_str_lossy().into_owned(),
                    ),
                    Err(_) => ("Unknown".to_string(), String::new()),
                };
                let timestamp = match c.time() {
                    Ok(t) => t.seconds,
                    Err(_) => 0,
                };
                let full_msg = c.message.to_str_lossy();
                let summary = full_msg.lines().next().unwrap_or("").to_string();
                let body = full_msg.to_string();
                let refs = decoration_map.get(&oid).cloned().unwrap_or_default();
                let hex = oid.to_hex().to_string();
                let short_oid = hex[..7.min(hex.len())].to_string();

                commits.push(CommitItem {
                    oid: hex,
                    short_oid,
                    parents,
                    author_name,
                    author_email,
                    timestamp,
                    summary,
                    body,
                    refs,
                });
            }
        }

        commits.sort_by(|a, b| b.timestamp.cmp(&a.timestamp).then_with(|| a.oid.cmp(&b.oid)));
        commits
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
        self.refs_cache.borrow().clone()
    }

    /// Return the symbolic target of `HEAD` (e.g. `Some("refs/heads/main")`) if `HEAD` is a symref.
    pub fn head_symref(&self) -> Option<String> {
        let head_val = self.head_cache.borrow().clone();
        head_val
            .strip_prefix("ref:")
            .map(|target| target.trim().to_string())
    }

    /// Resolve a reference name (`HEAD` or `refs/...`) to its `ObjectId`.
    pub fn resolve_ref(&self, name: &str) -> Option<ObjectId> {
        if name == "HEAD" {
            if let Some(sym) = self.head_symref() {
                if let Some(oid) = self.resolve_ref(&sym) {
                    return Some(oid);
                }
            }
            let head_raw = self.head_cache.borrow().clone();
            if let Ok(oid) = ObjectId::from_hex(head_raw.trim().as_bytes()) {
                return Some(oid);
            }
            return self.refs_cache.borrow().values().next().copied();
        }
        self.refs_cache.borrow().get(name).copied()
    }

    /// Update or delete a reference and persist `refs.json` (and `HEAD` if needed) in Google Drive.
    pub fn update_ref(&self, ref_name: &str, new_oid: &ObjectId) -> Result<(), String> {
        gix_validate::reference::name(ref_name.as_bytes().as_bstr())
            .map_err(|e| format!("Invalid reference name '{}': {}", ref_name, e))?;

        let should_update_head = {
            let mut refs = self.refs_cache.borrow_mut();
            if new_oid.is_null() {
                refs.remove(ref_name);
                false
            } else {
                refs.insert(ref_name.to_string(), *new_oid);
                ref_name.starts_with("refs/heads/")
                    && self
                        .head_symref()
                        .map(|sym| !refs.contains_key(&sym))
                        .unwrap_or(true)
            }
        };

        let serialized_map: BTreeMap<String, String> = self
            .refs_cache
            .borrow()
            .iter()
            .map(|(k, v)| (k.clone(), v.to_hex().to_string()))
            .collect();
        let json = serde_json::to_string_pretty(&serialized_map)
            .map_err(|e| format!("Failed to serialize refs.json: {}", e))?;
        write_text_file(&self.repo_folder, REFS_FILE_NAME, &json, "application/json");

        if should_update_head {
            let new_head = format!("ref: {}", ref_name);
            *self.head_cache.borrow_mut() = new_head.clone();
            write_text_file(
                &self.repo_folder,
                HEAD_FILE_NAME,
                &format!("{}\n", new_head),
                "text/plain",
            );
        }

        Ok(())
    }
}

/// Handle `GET /<project_name>.git/info/refs?service=git-upload-pack` or `git-receive-pack` using `gix_packetline`.
pub fn handle_info_refs(service: &str, project_name: &str) -> Result<Vec<u8>, String> {
    if service != "git-upload-pack" && service != "git-receive-pack" {
        return Err(format!(
            "Unsupported Git Smart HTTP service '{}': expected 'git-upload-pack' or 'git-receive-pack'",
            service
        ));
    }

    let store = GasGitStore::open(project_name)?;
    let refs = store.list_refs();
    let head_sym = store
        .head_symref()
        .unwrap_or_else(|| DEFAULT_BRANCH.to_string());
    let head_oid = store.resolve_ref("HEAD");

    let mut out = Vec::with_capacity(512);
    let header_line = format!("# service={}", service);
    pkt_encode::text_to_write(header_line.as_bytes(), &mut out)
        .map_err(|e| format!("pkt-line encode error: {}", e))?;
    pkt_encode::flush_to_write(&mut out).map_err(|e| format!("pkt-line flush error: {}", e))?;

    let capabilities = if service == "git-upload-pack" {
        format!(
            "multi_ack thin-pack side-band side-band-64k ofs-delta shallow no-progress include-tag allow-tip-sha1-in-want allow-reachable-sha1-in-want symref=HEAD:{} object-format=sha1 agent=gitoxide-gas/0.2.0",
            head_sym
        )
    } else {
        "report-status delete-refs side-band-64k quiet atomic ofs-delta object-format=sha1 agent=gitoxide-gas/0.2.0"
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

/// Handle `POST /<project_name>.git/git-upload-pack` (`git fetch`, `git clone`, `git pull`).
pub fn handle_upload_pack(req_body: &[u8], project_name: &str) -> Result<Vec<u8>, String> {
    let store = GasGitStore::open(project_name)?;

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

fn build_pack_v2(objects: &[(ObjectId, ObjectKind, Vec<u8>)]) -> Result<Vec<u8>, String> {
    let mut pack = Vec::with_capacity(12 + objects.len() * 128 + 20);
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

    let mut hasher = gix_hash::hasher(HashKind::Sha1);
    hasher.update(&pack);
    let checksum = hasher
        .try_finalize()
        .map_err(|e| format!("pack SHA-1 finalize error: {}", e))?;
    pack.extend_from_slice(checksum.as_bytes());

    Ok(pack)
}

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

/// Handle `POST /<project_name>.git/git-receive-pack` (`git push`).
pub fn handle_receive_pack(req_body: &[u8], project_name: &str) -> Result<Vec<u8>, String> {
    let lock = gas_lock_service::get_script_lock();
    let _locked = lock.try_lock(10_000);

    let store = match GasGitStore::open(project_name) {
        Ok(s) => s,
        Err(e) => {
            lock.release_lock();
            return Err(e);
        }
    };

    let mut commands: Vec<RefUpdateCommand> = Vec::new();
    let mut client_caps: BTreeSet<String> = BTreeSet::new();

    let mut cursor = Cursor::new(req_body);
    {
        let mut reader = StreamingPeekableIter::new(&mut cursor, &[PacketLineRef::Flush], false);
        while let Some(line_res) = reader.read_line() {
            let pkt = match line_res {
                Ok(Ok(p)) => p,
                Ok(Err(e)) => {
                    lock.release_lock();
                    return Err(format!("receive-pack decode error: {}", e));
                }
                Err(e) => {
                    lock.release_lock();
                    return Err(format!("receive-pack io error: {}", e));
                }
            };
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
                    let old_oid = ObjectId::from_hex(old_hex.as_bytes()).map_err(|e| {
                        lock.release_lock();
                        format!("Invalid old OID '{}': {}", old_hex, e)
                    })?;
                    let new_oid = ObjectId::from_hex(new_hex.as_bytes()).map_err(|e| {
                        lock.release_lock();
                        format!("Invalid new OID '{}': {}", new_hex, e)
                    })?;
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
        if let Err(e) = gix_validate::reference::name(cmd.ref_name.as_bytes().as_bstr()) {
            ref_statuses.push(format!("ng {} invalid refname ({})", cmd.ref_name, e));
            continue;
        }
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

/// Unpack a Git `PACK` v2 stream using `gix_zlib::Inflate`, `gix_hash`, and `gix_object`.
/// Stores all unpacked objects in a single batch file in Google Drive (`write_objects_batch`).
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

                ObjectRef::from_bytes(kind, &decompressed)
                    .map_err(|e| format!("invalid {} object in pack: {}", kind, e))?;
                let oid = gix_object::compute_hash(HashKind::Sha1, kind, &decompressed)
                    .map_err(|e| format!("Failed to compute SHA-1 hash: {}", e))?;
                by_offset.insert(entry_start, (kind, decompressed.clone(), oid));
                by_oid.insert(oid, (kind, decompressed));
            }
            6 => {
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
                ObjectRef::from_bytes(base_kind, &target_data)
                    .map_err(|e| format!("invalid delta-reconstructed {} object: {}", base_kind, e))?;
                let oid = gix_object::compute_hash(HashKind::Sha1, base_kind, &target_data)
                    .map_err(|e| format!("Failed to compute SHA-1 hash: {}", e))?;
                by_offset.insert(entry_start, (base_kind, target_data.clone(), oid));
                by_oid.insert(oid, (base_kind, target_data));
            }
            7 => {
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
                ObjectRef::from_bytes(base_kind, &target_data)
                    .map_err(|e| format!("invalid REF_DELTA {} object: {}", base_kind, e))?;
                let oid = gix_object::compute_hash(HashKind::Sha1, base_kind, &target_data)
                    .map_err(|e| format!("Failed to compute SHA-1 hash: {}", e))?;
                by_offset.insert(entry_start, (base_kind, target_data.clone(), oid));
                by_oid.insert(oid, (base_kind, target_data));
            }
            other => {
                return Err(format!("unsupported pack object type {}", other));
            }
        }
    }

    // Persist all unpacked objects into Google Drive in a single batched bundle
    store.write_objects_batch(&actual_trailer.to_hex().to_string(), &by_oid)?;

    Ok(num_objects)
}

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

/// Build the `WebUiStateResponse` containing all existing repositories in `GIT_DRIVE_FOLDER_ID`.
pub fn build_web_ui_state(
    selected_project: Option<String>,
    message: Option<String>,
) -> WebUiStateResponse {
    let base_url = get_env_or_script_property(ENV_GAS_WEB_APP_URL)
        .unwrap_or_else(|| "https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec".to_string());

    match open_root_drive_folder() {
        Ok((folder_id, root_folder)) => {
            let folder_url = root_folder.get_url();
            match GasGitStore::list_repositories() {
                Ok(repos) => WebUiStateResponse {
                    ok: true,
                    drive_folder_configured: true,
                    drive_folder_id: folder_id,
                    drive_folder_url: folder_url,
                    base_url,
                    selected_project,
                    repositories: repos,
                    message,
                    error: None,
                },
                Err(err) => WebUiStateResponse {
                    ok: false,
                    drive_folder_configured: true,
                    drive_folder_id: folder_id,
                    drive_folder_url: folder_url,
                    base_url,
                    selected_project,
                    repositories: Vec::new(),
                    message: None,
                    error: Some(err),
                },
            }
        }
        Err(err) => WebUiStateResponse {
            ok: false,
            drive_folder_configured: false,
            drive_folder_id: String::new(),
            drive_folder_url: String::new(),
            base_url,
            selected_project,
            repositories: Vec::new(),
            message: None,
            error: Some(err),
        },
    }
}

/// Serialize the current repository list state as JSON (used by `git_list_repos` and `?action=list_repos`).
pub fn list_repos_json(selected_project: Option<String>) -> String {
    let state = build_web_ui_state(selected_project, None);
    serde_json::to_string(&state).unwrap_or_else(|_| "{}".to_string())
}

/// Create a new empty repository in Google Drive and return the updated `WebUiStateResponse` as JSON.
pub fn create_repo_json(project_name: &str, description: Option<&str>) -> String {
    match GasGitStore::create_repository(project_name, description) {
        Ok(summary) => {
            let msg = format!(
                "Repository '{}.git' created in Google Drive.",
                summary.name
            );
            let state = build_web_ui_state(Some(summary.name), Some(msg));
            serde_json::to_string(&state).unwrap_or_else(|_| "{}".to_string())
        }
        Err(err) => {
            let mut state = build_web_ui_state(None, None);
            state.ok = false;
            state.error = Some(err);
            serde_json::to_string(&state).unwrap_or_else(|_| "{}".to_string())
        }
    }
}

/// Render the Gleam + Lustre Web UI HTML output with hydrated initial state from `dist/index.html`.
pub fn render_web_ui_html(selected_project: Option<String>) -> GasHtmlOutput {
    let initial_state_json = list_repos_json(selected_project).replace("</", "<\\/");
    let template = include_str!("../dist/index.html");
    let state_script = format!(
        "<script>window.__GAS_GIT_INITIAL_STATE__ = {};</script>\n</head>",
        initial_state_json
    );
    let html_str = template.replacen("</head>", &state_script, 1);
    gas_html_service::create_html_output(Some(HtmlSource::Html(html_str)))
        .set_title("GAS Git Server")
        .set_sandbox_mode(SandboxMode::Iframe)
        .set_x_frame_options_mode(XFrameOptionsMode::Allowall)
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
pub struct CommitItem {
    pub oid: String,
    pub short_oid: String,
    pub parents: Vec<String>,
    pub author_name: String,
    pub author_email: String,
    pub timestamp: i64,
    pub summary: String,
    pub body: String,
    pub refs: Vec<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct RepoCommitsResponse {
    pub ok: bool,
    pub project_name: String,
    pub head_oid: Option<String>,
    pub default_branch: String,
    pub commits: Vec<CommitItem>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

pub fn get_commits_json(project_name: &str) -> String {
    let normalized = match parse_project_segment(project_name) {
        Ok(n) => n,
        Err(e) => {
            let res = RepoCommitsResponse {
                ok: false,
                project_name: project_name.to_string(),
                head_oid: None,
                default_branch: DEFAULT_BRANCH.to_string(),
                commits: Vec::new(),
                error: Some(e),
            };
            return serde_json::to_string(&res).unwrap_or_default();
        }
    };

    let store = match GasGitStore::open(&normalized) {
        Ok(s) => s,
        Err(e) => {
            let res = RepoCommitsResponse {
                ok: false,
                project_name: normalized,
                head_oid: None,
                default_branch: DEFAULT_BRANCH.to_string(),
                commits: Vec::new(),
                error: Some(e),
            };
            return serde_json::to_string(&res).unwrap_or_default();
        }
    };

    let head_sym = store.head_symref().unwrap_or_else(|| DEFAULT_BRANCH.to_string());
    let head_oid = store.resolve_ref("HEAD");
    let refs_map = store.list_refs();

    if head_oid.is_none() && refs_map.is_empty() {
        let res = RepoCommitsResponse {
            ok: true,
            project_name: normalized,
            head_oid: None,
            default_branch: head_sym,
            commits: Vec::new(),
            error: None,
        };
        return serde_json::to_string(&res).unwrap_or_default();
    }

    let mut decoration_map: BTreeMap<ObjectId, Vec<String>> = BTreeMap::new();
    for (rname, roid) in &refs_map {
        let mut labels = Vec::new();
        if Some(*roid) == head_oid && rname == &head_sym {
            let short = rname.strip_prefix("refs/heads/").unwrap_or(rname);
            labels.push(format!("HEAD -> {}", short));
        } else if let Some(branch) = rname.strip_prefix("refs/heads/") {
            labels.push(branch.to_string());
        } else if let Some(tag) = rname.strip_prefix("refs/tags/") {
            labels.push(format!("tag: {}", tag));
        } else {
            labels.push(rname.clone());
        }
        decoration_map.entry(*roid).or_default().extend(labels);
    }

    if let Some(h_oid) = head_oid {
        let entry = decoration_map.entry(h_oid).or_default();
        if !entry.iter().any(|s| s.starts_with("HEAD")) {
            entry.insert(0, "HEAD".to_string());
        }
    }

    let mut commits = Vec::new();
    let mut visited: BTreeSet<ObjectId> = BTreeSet::new();
    let mut queue: VecDeque<ObjectId> = VecDeque::new();

    if let Some(h) = head_oid {
        queue.push_back(h);
    }
    for roid in refs_map.values() {
        if !queue.contains(roid) {
            queue.push_back(*roid);
        }
    }

    while let Some(oid) = queue.pop_front() {
        if !visited.insert(oid) {
            continue;
        }
        if commits.len() >= 100 {
            break;
        }
        let Some(loose) = store.read_loose_object(&oid) else {
            continue;
        };
        if let Ok(obj_ref) = ObjectRef::from_loose(&loose) {
            if let ObjectRef::Commit(c) = obj_ref {
                let parents: Vec<String> = c.parents().map(|p| p.to_hex().to_string()).collect();
                for p in c.parents() {
                    queue.push_back(p);
                }
                let (author_name, author_email) = match c.author().or_else(|_| c.committer()) {
                    Ok(sig) => (
                        sig.name.to_str_lossy().into_owned(),
                        sig.email.to_str_lossy().into_owned(),
                    ),
                    Err(_) => ("Unknown".to_string(), String::new()),
                };
                let timestamp = match c.time() {
                    Ok(t) => t.seconds,
                    Err(_) => 0,
                };
                let full_msg = c.message.to_str_lossy();
                let summary = full_msg.lines().next().unwrap_or("").to_string();
                let body = full_msg.to_string();
                let refs = decoration_map.get(&oid).cloned().unwrap_or_default();

                let hex = oid.to_hex().to_string();
                let short_oid = hex[..7.min(hex.len())].to_string();

                commits.push(CommitItem {
                    oid: hex,
                    short_oid,
                    parents,
                    author_name,
                    author_email,
                    timestamp,
                    summary,
                    body,
                    refs,
                });
            }
        }
    }

    commits.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));

    let res = RepoCommitsResponse {
        ok: true,
        project_name: normalized,
        head_oid: head_oid.map(|h| h.to_hex().to_string()),
        default_branch: head_sym,
        commits,
        error: None,
    };
    serde_json::to_string(&res).unwrap_or_default()
}


#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct CommitFileChange {
    pub path: String,
    pub status: String,
    pub old_oid: String,
    pub new_oid: String,
    pub additions: usize,
    pub deletions: usize,
    pub patch: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct CommitTreeEntry {
    pub path: String,
    pub name: String,
    pub parent_dir: String,
    pub kind: String,
    pub oid: String,
    pub size: usize,
    pub content: String,
    pub is_binary: bool,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct CommitDetailResponse {
    pub ok: bool,
    pub project_name: String,
    pub oid: String,
    pub short_oid: String,
    pub tree_oid: String,
    pub parents: Vec<String>,
    pub author_name: String,
    pub author_email: String,
    pub timestamp: i64,
    pub summary: String,
    pub body: String,
    pub refs: Vec<String>,
    pub changes: Vec<CommitFileChange>,
    pub tree_entries: Vec<CommitTreeEntry>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

fn collect_tree_snapshot(
    store: &GasGitStore,
    tree_oid: ObjectId,
    prefix: &str,
    entries_out: &mut Vec<CommitTreeEntry>,
    blobs_out: &mut BTreeMap<String, (ObjectId, Vec<u8>)>,
    depth: usize,
) {
    if depth > 16 || entries_out.len() >= 500 {
        return;
    }
    let Some(loose) = store.read_loose_object(&tree_oid) else {
        return;
    };
    let Ok(ObjectRef::Tree(tree_ref)) = ObjectRef::from_loose(&loose) else {
        return;
    };

    for entry in &tree_ref.entries {
        if entries_out.len() >= 500 {
            break;
        }
        let name = entry.filename.to_str_lossy().into_owned();
        let path = if prefix.is_empty() {
            name.clone()
        } else {
            format!("{}/{}", prefix, name)
        };
        let child_oid = entry.oid.to_owned();
        let child_hex = child_oid.to_hex().to_string();

        let Some(child_loose) = store.read_loose_object(&child_oid) else {
            continue;
        };
        let Ok((kind, size, offset)) = gix_object::decode::loose_header(&child_loose) else {
            continue;
        };
        let end = (offset + (size as usize)).min(child_loose.len());
        let body = &child_loose[offset..end];

        match kind {
            ObjectKind::Tree => {
                entries_out.push(CommitTreeEntry {
                    path: path.clone(),
                    name,
                    parent_dir: prefix.to_string(),
                    kind: "tree".to_string(),
                    oid: child_hex,
                    size: 0,
                    content: String::new(),
                    is_binary: false,
                });
                collect_tree_snapshot(
                    store,
                    child_oid,
                    &path,
                    entries_out,
                    blobs_out,
                    depth + 1,
                );
            }
            ObjectKind::Blob => {
                let is_binary = body.iter().take(4096).any(|&b| b == 0);
                let max_preview = body.len().min(65536);
                let content = if is_binary {
                    format!("[Binary file ({} bytes)]", body.len())
                } else {
                    String::from_utf8_lossy(&body[..max_preview]).into_owned()
                };
                entries_out.push(CommitTreeEntry {
                    path: path.clone(),
                    name,
                    parent_dir: prefix.to_string(),
                    kind: "blob".to_string(),
                    oid: child_hex,
                    size: body.len(),
                    content,
                    is_binary,
                });
                blobs_out.insert(path, (child_oid, body.to_vec()));
            }
            _ => {}
        }
    }
}

fn compute_unified_diff(old_bytes: &[u8], new_bytes: &[u8]) -> (usize, usize, String) {
    let old_bin = old_bytes.iter().take(4096).any(|&b| b == 0);
    let new_bin = new_bytes.iter().take(4096).any(|&b| b == 0);
    if old_bin || new_bin {
        return (
            0,
            0,
            format!(
                "Binary files differ (old: {} bytes, new: {} bytes)",
                old_bytes.len(),
                new_bytes.len()
            ),
        );
    }

    let old_str = String::from_utf8_lossy(old_bytes);
    let new_str = String::from_utf8_lossy(new_bytes);
    let old_lines: Vec<&str> = if old_str.is_empty() {
        Vec::new()
    } else {
        old_str.lines().collect()
    };
    let new_lines: Vec<&str> = if new_str.is_empty() {
        Vec::new()
    } else {
        new_str.lines().collect()
    };

    if old_lines.is_empty() && !new_lines.is_empty() {
        let mut out = format!("@@ -0,0 +1,{} @@\n", new_lines.len());
        for l in new_lines.iter().take(400) {
            out.push('+');
            out.push_str(l);
            out.push('\n');
        }
        return (new_lines.len(), 0, out);
    }

    if !old_lines.is_empty() && new_lines.is_empty() {
        let mut out = format!("@@ -1,{} +0,0 @@\n", old_lines.len());
        for l in old_lines.iter().take(400) {
            out.push('-');
            out.push_str(l);
            out.push('\n');
        }
        return (0, old_lines.len(), out);
    }

    let mut prefix = 0usize;
    while prefix < old_lines.len()
        && prefix < new_lines.len()
        && old_lines[prefix] == new_lines[prefix]
    {
        prefix += 1;
    }

    let mut suffix = 0usize;
    while suffix + prefix < old_lines.len()
        && suffix + prefix < new_lines.len()
        && old_lines[old_lines.len() - 1 - suffix] == new_lines[new_lines.len() - 1 - suffix]
    {
        suffix += 1;
    }

    let old_mid = &old_lines[prefix..old_lines.len() - suffix];
    let new_mid = &new_lines[prefix..new_lines.len() - suffix];

    let ctx_before_start = prefix.saturating_sub(3);
    let ctx_after_end = (new_lines.len() - suffix + 3).min(new_lines.len());

    let mut patch = format!(
        "@@ -{},{} +{},{} @@\n",
        ctx_before_start + 1,
        old_lines.len().saturating_sub(ctx_before_start),
        ctx_before_start + 1,
        new_lines.len().saturating_sub(ctx_before_start)
    );

    for &l in &old_lines[ctx_before_start..prefix] {
        patch.push(' ');
        patch.push_str(l);
        patch.push('\n');
    }

    let mut additions = 0usize;
    let mut deletions = 0usize;

    if old_mid.len() <= 160 && new_mid.len() <= 160 {
        let n = old_mid.len();
        let m = new_mid.len();
        let mut dp = vec![vec![0u16; m + 1]; n + 1];
        for i in (0..n).rev() {
            for j in (0..m).rev() {
                if old_mid[i] == new_mid[j] {
                    dp[i][j] = dp[i + 1][j + 1] + 1;
                } else {
                    dp[i][j] = dp[i + 1][j].max(dp[i][j + 1]);
                }
            }
        }
        let mut i = 0usize;
        let mut j = 0usize;
        while i < n || j < m {
            if i < n && j < m && old_mid[i] == new_mid[j] {
                patch.push(' ');
                patch.push_str(old_mid[i]);
                patch.push('\n');
                i += 1;
                j += 1;
            } else if j < m && (i == n || dp[i][j + 1] >= dp[i + 1][j]) {
                patch.push('+');
                patch.push_str(new_mid[j]);
                patch.push('\n');
                additions += 1;
                j += 1;
            } else if i < n {
                patch.push('-');
                patch.push_str(old_mid[i]);
                patch.push('\n');
                deletions += 1;
                i += 1;
            }
        }
    } else {
        for &l in old_mid.iter().take(200) {
            patch.push('-');
            patch.push_str(l);
            patch.push('\n');
        }
        for &l in new_mid.iter().take(200) {
            patch.push('+');
            patch.push_str(l);
            patch.push('\n');
        }
        deletions = old_mid.len();
        additions = new_mid.len();
    }

    let suffix_start = new_lines.len() - suffix;
    for &l in &new_lines[suffix_start..ctx_after_end] {
        patch.push(' ');
        patch.push_str(l);
        patch.push('\n');
    }

    (additions, deletions, patch)
}

pub fn get_commit_detail_json(project_name: &str, commit_oid_str: &str) -> String {
    let normalized = match parse_project_segment(project_name) {
        Ok(n) => n,
        Err(e) => {
            let res = CommitDetailResponse {
                ok: false,
                project_name: project_name.to_string(),
                oid: commit_oid_str.to_string(),
                short_oid: String::new(),
                tree_oid: String::new(),
                parents: Vec::new(),
                author_name: String::new(),
                author_email: String::new(),
                timestamp: 0,
                summary: String::new(),
                body: String::new(),
                refs: Vec::new(),
                changes: Vec::new(),
                tree_entries: Vec::new(),
                error: Some(e),
            };
            return serde_json::to_string(&res).unwrap_or_default();
        }
    };

    let store = match GasGitStore::open(&normalized) {
        Ok(s) => s,
        Err(e) => {
            let res = CommitDetailResponse {
                ok: false,
                project_name: normalized,
                oid: commit_oid_str.to_string(),
                short_oid: String::new(),
                tree_oid: String::new(),
                parents: Vec::new(),
                author_name: String::new(),
                author_email: String::new(),
                timestamp: 0,
                summary: String::new(),
                body: String::new(),
                refs: Vec::new(),
                changes: Vec::new(),
                tree_entries: Vec::new(),
                error: Some(e),
            };
            return serde_json::to_string(&res).unwrap_or_default();
        }
    };

    let trimmed_oid = commit_oid_str.trim();
    let target_oid = if trimmed_oid.is_empty() || trimmed_oid == "HEAD" {
        store.resolve_ref("HEAD")
    } else {
        ObjectId::from_hex(trimmed_oid.as_bytes()).ok()
    };

    let Some(commit_oid) = target_oid else {
        let res = CommitDetailResponse {
            ok: false,
            project_name: normalized,
            oid: trimmed_oid.to_string(),
            short_oid: String::new(),
            tree_oid: String::new(),
            parents: Vec::new(),
            author_name: String::new(),
            author_email: String::new(),
            timestamp: 0,
            summary: String::new(),
            body: String::new(),
            refs: Vec::new(),
            changes: Vec::new(),
            tree_entries: Vec::new(),
            error: Some(format!("Invalid or unresolved commit OID '{}'", trimmed_oid)),
        };
        return serde_json::to_string(&res).unwrap_or_default();
    };

    let Some(commit_loose) = store.read_loose_object(&commit_oid) else {
        let res = CommitDetailResponse {
            ok: false,
            project_name: normalized,
            oid: commit_oid.to_hex().to_string(),
            short_oid: String::new(),
            tree_oid: String::new(),
            parents: Vec::new(),
            author_name: String::new(),
            author_email: String::new(),
            timestamp: 0,
            summary: String::new(),
            body: String::new(),
            refs: Vec::new(),
            changes: Vec::new(),
            tree_entries: Vec::new(),
            error: Some(format!("Commit object '{}' not found in store", commit_oid.to_hex())),
        };
        return serde_json::to_string(&res).unwrap_or_default();
    };

    let Ok(ObjectRef::Commit(c)) = ObjectRef::from_loose(&commit_loose) else {
        let res = CommitDetailResponse {
            ok: false,
            project_name: normalized,
            oid: commit_oid.to_hex().to_string(),
            short_oid: String::new(),
            tree_oid: String::new(),
            parents: Vec::new(),
            author_name: String::new(),
            author_email: String::new(),
            timestamp: 0,
            summary: String::new(),
            body: String::new(),
            refs: Vec::new(),
            changes: Vec::new(),
            tree_entries: Vec::new(),
            error: Some(format!("Object '{}' is not a commit", commit_oid.to_hex())),
        };
        return serde_json::to_string(&res).unwrap_or_default();
    };

    let tree_oid = c.tree();
    let parent_oids: Vec<ObjectId> = c.parents().collect();
    let parents: Vec<String> = parent_oids.iter().map(|p| p.to_hex().to_string()).collect();

    let (author_name, author_email) = match c.author().or_else(|_| c.committer()) {
        Ok(sig) => (
            sig.name.to_str_lossy().into_owned(),
            sig.email.to_str_lossy().into_owned(),
        ),
        Err(_) => ("Unknown".to_string(), String::new()),
    };
    let timestamp = match c.time() {
        Ok(t) => t.seconds,
        Err(_) => 0,
    };
    let full_msg = c.message.to_str_lossy();
    let summary = full_msg.lines().next().unwrap_or("").to_string();
    let body = full_msg.to_string();

    let head_sym = store.head_symref().unwrap_or_else(|| DEFAULT_BRANCH.to_string());
    let head_oid = store.resolve_ref("HEAD");
    let refs_map = store.list_refs();
    let mut commit_refs = Vec::new();
    for (rname, roid) in &refs_map {
        if *roid == commit_oid {
            if Some(*roid) == head_oid && rname == &head_sym {
                let short = rname.strip_prefix("refs/heads/").unwrap_or(rname);
                commit_refs.push(format!("HEAD -> {}", short));
            } else if let Some(branch) = rname.strip_prefix("refs/heads/") {
                commit_refs.push(branch.to_string());
            } else if let Some(tag) = rname.strip_prefix("refs/tags/") {
                commit_refs.push(format!("tag: {}", tag));
            } else {
                commit_refs.push(rname.clone());
            }
        }
    }

    let mut tree_entries = Vec::new();
    let mut current_blobs: BTreeMap<String, (ObjectId, Vec<u8>)> = BTreeMap::new();
    collect_tree_snapshot(
        &store,
        tree_oid,
        "",
        &mut tree_entries,
        &mut current_blobs,
        0,
    );

    let mut parent_blobs: BTreeMap<String, (ObjectId, Vec<u8>)> = BTreeMap::new();
    if let Some(&first_parent_oid) = parent_oids.first() {
        if let Some(p_loose) = store.read_loose_object(&first_parent_oid) {
            if let Ok(ObjectRef::Commit(parent_commit)) = ObjectRef::from_loose(&p_loose) {
                let mut dummy_entries = Vec::new();
                collect_tree_snapshot(
                    &store,
                    parent_commit.tree(),
                    "",
                    &mut dummy_entries,
                    &mut parent_blobs,
                    0,
                );
            }
        }
    }

    let mut all_paths: BTreeSet<String> = BTreeSet::new();
    for k in parent_blobs.keys() {
        all_paths.insert(k.clone());
    }
    for k in current_blobs.keys() {
        all_paths.insert(k.clone());
    }

    let mut changes = Vec::new();
    for path in all_paths {
        match (parent_blobs.get(&path), current_blobs.get(&path)) {
            (None, Some((new_oid, new_bytes))) => {
                let (additions, deletions, patch) = compute_unified_diff(&[], new_bytes);
                changes.push(CommitFileChange {
                    path,
                    status: "added".to_string(),
                    old_oid: String::new(),
                    new_oid: new_oid.to_hex().to_string(),
                    additions,
                    deletions,
                    patch,
                });
            }
            (Some((old_oid, old_bytes)), None) => {
                let (additions, deletions, patch) = compute_unified_diff(old_bytes, &[]);
                changes.push(CommitFileChange {
                    path,
                    status: "deleted".to_string(),
                    old_oid: old_oid.to_hex().to_string(),
                    new_oid: String::new(),
                    additions,
                    deletions,
                    patch,
                });
            }
            (Some((old_oid, old_bytes)), Some((new_oid, new_bytes))) if old_oid != new_oid => {
                let (additions, deletions, patch) = compute_unified_diff(old_bytes, new_bytes);
                changes.push(CommitFileChange {
                    path,
                    status: "modified".to_string(),
                    old_oid: old_oid.to_hex().to_string(),
                    new_oid: new_oid.to_hex().to_string(),
                    additions,
                    deletions,
                    patch,
                });
            }
            _ => {}
        }
    }

    let hex = commit_oid.to_hex().to_string();
    let short_oid = hex[..7.min(hex.len())].to_string();

    let res = CommitDetailResponse {
        ok: true,
        project_name: normalized,
        oid: hex,
        short_oid,
        tree_oid: tree_oid.to_hex().to_string(),
        parents,
        author_name,
        author_email,
        timestamp,
        summary,
        body,
        refs: commit_refs,
        changes,
        tree_entries,
        error: None,
    };
    serde_json::to_string(&res).unwrap_or_default()
}

fn format_info_refs_output(
    service: &str,
    project_name: &str,
    encoding: &str,
    format: &str,
) -> GasTextOutput {
    let content_type = format!("application/x-{}-advertisement", service);
    match handle_info_refs(service, project_name) {
        Ok(bytes) => {
            if format == "json" {
                let b64 = BASE64_STANDARD.encode(&bytes);
                let env = GasGitResponseEnvelope {
                    ok: true,
                    status: 200,
                    content_type,
                    body_base64: b64,
                    error: None,
                };
                let json = serde_json::to_string(&env).unwrap_or_default();
                gas_content_service::create_text_output(&json).set_mime_type(MimeType::Json)
            } else if encoding == "base64" {
                let b64 = BASE64_STANDARD.encode(&bytes);
                gas_content_service::create_text_output(&b64).set_mime_type(MimeType::Text)
            } else {
                let text = String::from_utf8_lossy(&bytes);
                gas_content_service::create_text_output(&text).set_mime_type(MimeType::Text)
            }
        }
        Err(err) => {
            if format == "json" {
                let env = GasGitResponseEnvelope {
                    ok: false,
                    status: 404,
                    content_type,
                    body_base64: String::new(),
                    error: Some(err),
                };
                let json = serde_json::to_string(&env).unwrap_or_default();
                gas_content_service::create_text_output(&json).set_mime_type(MimeType::Json)
            } else {
                gas_content_service::create_text_output(&format!("ERR {}", err))
                    .set_mime_type(MimeType::Text)
            }
        }
    }
}

/// Handle GAS `doGet(e)` requests.
pub fn handle_do_get(event: &GasDoGetEvent) -> WebResponse {
    if let Some(action) = event.parameter.get("action").map(|s| s.as_str()) {
        match action {
            "list_repos" => {
                let selected = event.parameter.get("repo").cloned();
                let json = list_repos_json(selected);
                return WebResponse::Text(
                    gas_content_service::create_text_output(&json).set_mime_type(MimeType::Json),
                );
            }
            "get_commits" => {
                let repo = event
                    .parameter
                    .get("repo")
                    .or_else(|| event.parameter.get("project_name"))
                    .map(|s| s.as_str())
                    .unwrap_or("");
                let json = get_commits_json(repo);
                return WebResponse::Text(
                    gas_content_service::create_text_output(&json).set_mime_type(MimeType::Json),
                );
            }
            "get_commit_detail" => {
                let repo = event
                    .parameter
                    .get("repo")
                    .or_else(|| event.parameter.get("project_name"))
                    .map(|s| s.as_str())
                    .unwrap_or("");
                let commit_oid = event
                    .parameter
                    .get("commit")
                    .or_else(|| event.parameter.get("commit_oid"))
                    .or_else(|| event.parameter.get("oid"))
                    .map(|s| s.as_str())
                    .unwrap_or("");
                let json = get_commit_detail_json(repo, commit_oid);
                return WebResponse::Text(
                    gas_content_service::create_text_output(&json).set_mime_type(MimeType::Json),
                );
            }
            "create_repo" => {
                let name = event
                    .parameter
                    .get("project_name")
                    .or_else(|| event.parameter.get("repo"))
                    .map(|s| s.as_str())
                    .unwrap_or("");
                let desc = event.parameter.get("description").map(|s| s.as_str());
                let json = create_repo_json(name, desc);
                return WebResponse::Text(
                    gas_content_service::create_text_output(&json).set_mime_type(MimeType::Json),
                );
            }
            _ => {}
        }
    }

    let req_path = extract_request_path(event, None);
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
    let explicit_service = event.parameter.get("service").map(|s| s.as_str());

    match parse_git_path(&req_path) {
        Ok(GitRoute::InfoRefs { project_name }) => {
            let service = explicit_service.unwrap_or("git-upload-pack");
            WebResponse::Text(format_info_refs_output(
                service,
                &project_name,
                encoding,
                format,
            ))
        }
        Ok(GitRoute::UploadPack { project_name }) => WebResponse::Text(format_info_refs_output(
            "git-upload-pack",
            &project_name,
            encoding,
            format,
        )),
        Ok(GitRoute::ReceivePack { project_name }) => WebResponse::Text(format_info_refs_output(
            "git-receive-pack",
            &project_name,
            encoding,
            format,
        )),
        Ok(GitRoute::WebUiRepo { project_name }) => {
            if let Some(service) = explicit_service {
                WebResponse::Text(format_info_refs_output(
                    service,
                    &project_name,
                    encoding,
                    format,
                ))
            } else {
                WebResponse::Html(render_web_ui_html(Some(project_name)))
            }
        }
        Ok(GitRoute::CommitBrowser {
            project_name,
            commit_ref,
            subpath,
            trailing_slash,
        }) => handle_commit_browser_get(
            event,
            &project_name,
            &commit_ref,
            &subpath,
            trailing_slash,
            encoding,
            format,
        ),
        Ok(GitRoute::WebUiRoot) => {
            if let Some(service) = explicit_service {
                let msg = format!(
                    "ERR Missing repository name in URL path for service '{}'. Use gas::https://script.google.com/macros/s/<ID>/exec/<project_name>.git",
                    service
                );
                WebResponse::Text(
                    gas_content_service::create_text_output(&msg).set_mime_type(MimeType::Text),
                )
            } else {
                WebResponse::Html(render_web_ui_html(None))
            }
        }
        Err(err) => {
            if explicit_service.is_some() || format == "json" {
                WebResponse::Text(
                    gas_content_service::create_text_output(&format!("ERR {}", err))
                        .set_mime_type(MimeType::Text),
                )
            } else {
                let title = "404 Not Found - Invalid URL Path (Not a Raw File)";
                let html = render_not_found_error_document(
                    title,
                    &req_path,
                    &err,
                    None,
                );
                WebResponse::Html(
                    gas_html_service::create_html_output(Some(HtmlSource::Html(html)))
                        .set_title(title)
                        .set_sandbox_mode(SandboxMode::Iframe)
                        .set_x_frame_options_mode(XFrameOptionsMode::Allowall),
                )
            }
        }
    }
}

/// Handle a GAS `doPost(e)` event for Web UI APIs and Git Smart HTTP v1 (`git-upload-pack` / `git-receive-pack`).
pub fn handle_do_post(event: &GasDoPostEvent) -> GasTextOutput {
    let raw_contents = event
        .post_data
        .as_ref()
        .map(|p| p.contents.as_str())
        .unwrap_or("");

    let parsed_env: Option<GasGitPostEnvelope> = serde_json::from_str(raw_contents).ok();

    let action = parsed_env
        .as_ref()
        .and_then(|e| e.action.as_deref())
        .or_else(|| event.parameter.get("action").map(|s| s.as_str()));

    if let Some(act) = action {
        match act {
            "list_repos" => {
                let json = list_repos_json(None);
                return gas_content_service::create_text_output(&json)
                    .set_mime_type(MimeType::Json);
            }
            "get_commits" => {
                let repo = parsed_env
                    .as_ref()
                    .and_then(|e| e.project_name.as_deref().or(e.repo.as_deref()))
                    .or_else(|| {
                        event
                            .parameter
                            .get("project_name")
                            .or_else(|| event.parameter.get("repo"))
                            .map(|s| s.as_str())
                    })
                    .unwrap_or("");
                let json = get_commits_json(repo);
                return gas_content_service::create_text_output(&json)
                    .set_mime_type(MimeType::Json);
            }
            "get_commit_detail" => {
                let repo = parsed_env
                    .as_ref()
                    .and_then(|e| e.project_name.as_deref().or(e.repo.as_deref()))
                    .or_else(|| {
                        event
                            .parameter
                            .get("project_name")
                            .or_else(|| event.parameter.get("repo"))
                            .map(|s| s.as_str())
                    })
                    .unwrap_or("");
                let commit_oid = parsed_env
                    .as_ref()
                    .and_then(|e| e.commit_oid.as_deref())
                    .or_else(|| {
                        event
                            .parameter
                            .get("commit")
                            .or_else(|| event.parameter.get("commit_oid"))
                            .or_else(|| event.parameter.get("oid"))
                            .map(|s| s.as_str())
                    })
                    .unwrap_or("");
                let json = get_commit_detail_json(repo, commit_oid);
                return gas_content_service::create_text_output(&json)
                    .set_mime_type(MimeType::Json);
            }
            "create_repo" => {
                let repo_name = parsed_env
                    .as_ref()
                    .and_then(|e| e.project_name.as_deref().or(e.repo.as_deref()))
                    .or_else(|| {
                        event
                            .parameter
                            .get("project_name")
                            .or_else(|| event.parameter.get("repo"))
                            .map(|s| s.as_str())
                    })
                    .unwrap_or("");
                let description = parsed_env
                    .as_ref()
                    .and_then(|e| e.description.as_deref())
                    .or_else(|| event.parameter.get("description").map(|s| s.as_str()));
                let json = create_repo_json(repo_name, description);
                return gas_content_service::create_text_output(&json)
                    .set_mime_type(MimeType::Json);
            }
            _ => {}
        }
    }

    let req_path = extract_request_path(
        event,
        parsed_env.as_ref().and_then(|e| e.git_path.as_deref()),
    );
    let explicit_service = parsed_env
        .as_ref()
        .and_then(|e| e.service.as_deref())
        .or_else(|| event.parameter.get("service").map(|s| s.as_str()));

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

    let req_bytes: Vec<u8> =
        if let Some(b64) = parsed_env.as_ref().and_then(|e| e.body_base64.as_deref()) {
            BASE64_STANDARD.decode(b64.trim().as_bytes()).unwrap_or_default()
        } else if event.parameter.get("req_encoding").map(|s| s.as_str()) == Some("raw") {
            raw_contents.as_bytes().to_vec()
        } else {
            let trimmed = raw_contents.trim();
            if !trimmed.is_empty() && !trimmed.starts_with("00") {
                BASE64_STANDARD
                    .decode(trimmed.as_bytes())
                    .unwrap_or_else(|_| raw_contents.as_bytes().to_vec())
            } else {
                raw_contents.as_bytes().to_vec()
            }
        };

    let (service, result) = match parse_git_path(&req_path) {
        Ok(GitRoute::UploadPack { project_name }) => (
            "git-upload-pack",
            handle_upload_pack(&req_bytes, &project_name),
        ),
        Ok(GitRoute::ReceivePack { project_name }) => (
            "git-receive-pack",
            handle_receive_pack(&req_bytes, &project_name),
        ),
        Ok(GitRoute::WebUiRepo { project_name }) | Ok(GitRoute::InfoRefs { project_name }) => {
            let svc = explicit_service.unwrap_or("git-upload-pack");
            let res = match svc {
                "git-upload-pack" => handle_upload_pack(&req_bytes, &project_name),
                "git-receive-pack" => handle_receive_pack(&req_bytes, &project_name),
                other => Err(format!("Unsupported POST service '{}'", other)),
            };
            (svc, res)
        }
        Ok(GitRoute::CommitBrowser { .. }) => (
            explicit_service.unwrap_or("git-upload-pack"),
            Err("Unsupported Git POST path".to_string()),
        ),
        Ok(GitRoute::WebUiRoot) => (
            explicit_service.unwrap_or("git-upload-pack"),
            Err(
                "Missing repository name in URL path. Expected /<project_name>.git/git-upload-pack or /<project_name>.git/git-receive-pack"
                    .to_string(),
            ),
        ),
        Err(err) => (explicit_service.unwrap_or("git-upload-pack"), Err(err)),
    };

    let content_type = format!("application/x-{}-result", service);
    match result {
        Ok(res_bytes) => {
            let b64 = BASE64_STANDARD.encode(&res_bytes);
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
            let b64 = BASE64_STANDARD.encode(&err_pkt);
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

/// Abstract reader over a Git repository so `resolve_commit_browser_request`
/// works identically across Google Drive (`GasGitStore`) and in-memory unit tests.
pub trait GitObjectReader {
    fn read_loose(&self, oid: &ObjectId) -> Option<Vec<u8>>;
    fn list_commits(&self) -> Vec<CommitItem>;
}

impl GitObjectReader for GasGitStore {
    fn read_loose(&self, oid: &ObjectId) -> Option<Vec<u8>> {
        self.read_loose_object(oid)
    }

    fn list_commits(&self) -> Vec<CommitItem> {
        self.load_all_commits()
    }
}

/// Output produced by the nginx-autoindex-style commit/directory/file browser.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CommitBrowserOutput {
    /// Standalone HTML page (directory listing, commit hash list, ambiguous candidate list, or 404 error page).
    Html {
        status: u16,
        title: String,
        html: String,
        redirect_to: Option<String>,
    },
    /// Raw file content (`exec/<project_name>.git/<commit hash>/<file path>`).
    /// When `is_binary` is true, GAS `ContentService.TextOutput.downloadAsFile(filename)` is used.
    RawFile {
        status: u16,
        filename: String,
        content: Vec<u8>,
        is_binary: bool,
    },
}

fn format_autoindex_link(
    exec_rel: &str,
    href: &str,
    display_text: &str,
    right_column: Option<&str>,
) -> String {
    let link_html = format!(
        r#"<a target="_top" data-exec-rel="{}" href="{}">{}</a>"#,
        escape_html(exec_rel),
        escape_html(href),
        escape_html(display_text),
    );
    match right_column {
        Some(col) => {
            let char_len = display_text.chars().count();
            let pad = if char_len < 62 { 64 - char_len } else { 2 };
            format!("{}{}{}", link_html, " ".repeat(pad), escape_html(col))
        }
        None => link_html,
    }
}

fn render_autoindex_html_document(
    title: &str,
    heading: &str,
    pre_lines: &[String],
    redirect_target: Option<(&str, &str)>,
) -> String {
    let mut head_extra = String::new();
    if let Some((redirect_href, redirect_rel)) = redirect_target {
        let json_href = serde_json::to_string(redirect_href)
            .unwrap_or_else(|_| "\"\"".to_string())
            .replace("</", "<\\/");
        let json_rel = serde_json::to_string(redirect_rel)
            .unwrap_or_else(|_| "\"\"".to_string())
            .replace("</", "<\\/");
        head_extra.push_str(&format!(
            r#"<meta http-equiv="refresh" content="0; url={}">
<script>
(function() {{
  var targetHref = {};
  var targetRel = {};
  try {{
    if (window.location.hostname.indexOf("googleusercontent.com") !== -1) {{
      var ref = document.referrer || "";
      var m = ref.match(/^(https:\/\/script\.google\.com\/macros\/s\/[^\/?#]+\/(?:exec|dev))/);
      if (m && window.top) {{ window.top.location.replace(m[1] + "/" + targetRel); }}
    }} else {{
      window.location.replace(targetHref);
    }}
  }} catch (e) {{}}
}})();
</script>
"#,
            escape_html(redirect_href),
            json_href,
            json_rel
        ));
    }

    head_extra.push_str(
        r#"<script>
document.addEventListener("DOMContentLoaded", function() {
  if (window.location.hostname.indexOf("googleusercontent.com") === -1) return;
  var ref = document.referrer || "";
  var m = ref.match(/^(https:\/\/script\.google\.com\/macros\/s\/[^\/?#]+\/(?:exec|dev))/);
  if (!m) return;
  var base = m[1];
  var links = document.querySelectorAll("a[data-exec-rel]");
  for (var i = 0; i < links.length; i++) {
    var rel = links[i].getAttribute("data-exec-rel");
    if (rel !== null) links[i].setAttribute("href", base + "/" + rel);
  }
});
</script>
"#,
    );

    let body_pre = pre_lines.join("\n");
    format!(
        r#"<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<base target="_top">
<title>{}</title>
{}</head>
<body>
<h1>{}</h1>
<hr>
<pre>
{}
</pre>
<hr>
</body>
</html>
"#,
        escape_html(title),
        head_extra,
        escape_html(heading),
        body_pre
    )
}

/// Render an unmistakable 404 / Invalid Path HTML error document so that even when Google Apps Script
/// cannot return an HTTP 404 status code, the user or client can clearly see that:
/// 1) The requested file or directory does NOT exist (or the URL path is invalid), and
/// 2) This response is an HTML error page and NOT the raw contents of a repository file.
pub fn render_not_found_error_document(
    title: &str,
    requested_path: &str,
    reason: &str,
    back_link: Option<(&str, &str, &str)>,
) -> String {
    let mut lines = vec![
        "================================================================================".to_string(),
        "[ERROR 404 / NOT A RAW FILE] 指定されたファイルまたはディレクトリは存在しません。".to_string(),
        "※ このレスポンスはエラー通知用の HTML ページであり、リポジトリ内の生のファイルではありません。".to_string(),
        "   (This response is an HTML error page, NOT a raw repository file.)".to_string(),
        "================================================================================".to_string(),
        String::new(),
        format!("Requested Path : {}", escape_html(requested_path)),
        format!("Error Detail   : {}", escape_html(reason)),
    ];
    if let Some((back_rel, back_href, back_label)) = back_link {
        lines.push(String::new());
        lines.push(format_autoindex_link(back_rel, back_href, back_label, None));
    }
    render_autoindex_html_document(title, "404 Not Found (File or Directory Does Not Exist)", &lines, None)
}

/// Core resolver for:
/// - `exec/<project_name>.git/<commit hash>`
/// - `exec/<project_name>.git/<commit hash>/<dir path>`
/// - `exec/<project_name>.git/<commit hash>/<file path>`
/// Uses `?page=1`, `?page=2`, ... query parameters for commit list pagination so page numbers never
/// collide with directory or file names in the repository.
pub fn resolve_commit_browser_request(
    reader: &dyn GitObjectReader,
    project_name: &str,
    commit_ref: &str,
    subpath: &[String],
    trailing_slash: bool,
    page_param: Option<&str>,
    configured_base_url: Option<&str>,
    page_size: usize,
    custom_per_page: Option<usize>,
) -> CommitBrowserOutput {
    let effective_page_size = page_size.max(1);
    let repo_prefix = format!("{}.git/", encode_uri_segment(project_name));

    // Path after `/exec/` has `1 (project_name.git) + 1 (commit_ref) + subpath.len()` segments
    let seg_count = 2 + subpath.len();
    let up_levels = if trailing_slash {
        seg_count
    } else {
        seg_count.saturating_sub(1)
    };
    let rel_prefix = if up_levels == 0 {
        "./".to_string()
    } else {
        "../".repeat(up_levels)
    };

    let base_clean = configured_base_url
        .map(|s| s.trim().trim_end_matches('/'))
        .filter(|s| !s.is_empty() && !s.contains("<DEPLOYMENT_ID>"));

    let make_urls = |target_after_repo: &str| -> (String, String) {
        let exec_rel = format!("{}{}", repo_prefix, target_after_repo);
        let href = match base_clean {
            Some(b) => format!("{}/{}", b, exec_rel),
            None => format!("{}{}", rel_prefix, exec_rel),
        };
        (exec_rel, href)
    };

    let make_page_query = |p: usize| -> String {
        match custom_per_page {
            Some(pp) => format!("?page={}&per_page={}", p, pp),
            None => format!("?page={}", p),
        }
    };

    let mut all_commits = reader.list_commits();
    let q = commit_ref.trim().to_ascii_lowercase();
    let is_hex = !q.is_empty() && q.len() <= 40 && q.chars().all(|c| c.is_ascii_hexdigit());

    if is_hex && q.len() == 40 && !all_commits.iter().any(|c| c.oid.eq_ignore_ascii_case(&q)) {
        if let Ok(oid) = ObjectId::from_hex(q.as_bytes()) {
            if let Some(loose) = reader.read_loose(&oid) {
                if let Ok(ObjectRef::Commit(c)) = ObjectRef::from_loose(&loose) {
                    let parents: Vec<String> = c.parents().map(|p| p.to_hex().to_string()).collect();
                    let (author_name, author_email) = match c.author().or_else(|_| c.committer()) {
                        Ok(sig) => (
                            sig.name.to_str_lossy().into_owned(),
                            sig.email.to_str_lossy().into_owned(),
                        ),
                        Err(_) => ("Unknown".to_string(), String::new()),
                    };
                    let timestamp = match c.time() {
                        Ok(t) => t.seconds,
                        Err(_) => 0,
                    };
                    let full_msg = c.message.to_str_lossy();
                    let summary = full_msg.lines().next().unwrap_or("").to_string();
                    let body = full_msg.to_string();
                    let hex = oid.to_hex().to_string();
                    let short_oid = hex[..7.min(hex.len())].to_string();
                    all_commits.push(CommitItem {
                        oid: hex,
                        short_oid,
                        parents,
                        author_name,
                        author_email,
                        timestamp,
                        summary,
                        body,
                        refs: Vec::new(),
                    });
                }
            }
        }
    }

    let matched_commits: Vec<CommitItem> = if is_hex {
        all_commits
            .iter()
            .filter(|c| c.oid.to_ascii_lowercase().starts_with(&q))
            .cloned()
            .collect()
    } else {
        Vec::new()
    };

    let render_404 = |req_display: &str,
                      reason: &str,
                      back_target: &str,
                      back_label: &str|
     -> CommitBrowserOutput {
        let title = "404 Not Found - Path Does Not Exist (Not a Raw File)".to_string();
        let (back_rel, back_href) = make_urls(back_target);
        let html = render_not_found_error_document(
            &title,
            req_display,
            reason,
            Some((&back_rel, &back_href, back_label)),
        );
        CommitBrowserOutput::Html {
            status: 404,
            title,
            html,
            redirect_to: None,
        }
    };

    let render_commit_list = |list: &[CommitItem],
                              heading_prefix: &str,
                              page: usize,
                              is_redirect: bool|
     -> CommitBrowserOutput {
        let total = list.len();
        let total_pages = (total.max(1) + effective_page_size - 1) / effective_page_size;
        let enc_ref = encode_uri_segment(commit_ref);

        let title = if total_pages > 1 {
            format!("{} (Page {}/{})", heading_prefix, page, total_pages)
        } else {
            heading_prefix.to_string()
        };

        let mut lines: Vec<String> = Vec::new();
        let redirect_pair = if is_redirect {
            let q1 = make_page_query(1);
            let (r_rel, r_href) = make_urls(&format!("{}{}", enc_ref, q1));
            lines.push(format!(
                "Redirecting to {} ...",
                format_autoindex_link(&r_rel, &r_href, &format!("{}{}", commit_ref, q1), None)
            ));
            lines.push(String::new());
            Some((r_href, r_rel))
        } else {
            None
        };

        if list.is_empty() {
            lines.push("(no commits found)".to_string());
        } else {
            let start = (page - 1) * effective_page_size;
            let end = (start + effective_page_size).min(total);
            for c in &list[start..end] {
                let (c_rel, c_href) = make_urls(&encode_uri_segment(&c.oid));
                let ts_str = format_utc_timestamp(c.timestamp);
                let refs_suffix = if c.refs.is_empty() {
                    String::new()
                } else {
                    format!(" ({})", c.refs.join(", "))
                };
                let meta = format!("{}  {}{}", ts_str, c.summary, refs_suffix);
                lines.push(format_autoindex_link(&c_rel, &c_href, &c.oid, Some(&meta)));
            }
        }

        if total_pages > 1 {
            lines.push(String::new());
            let mut page_links: Vec<String> = Vec::with_capacity(total_pages);
            for p in 1..=total_pages {
                let qp = make_page_query(p);
                let (p_rel, p_href) = make_urls(&format!("{}{}", enc_ref, qp));
                let link = format_autoindex_link(&p_rel, &p_href, &p.to_string(), None);
                if p == page {
                    page_links.push(format!("[{}]", link));
                } else {
                    page_links.push(link);
                }
            }
            lines.push(format!("Pages: {}", page_links.join(" ")));
            for p in 1..=total_pages {
                let qp = make_page_query(p);
                let (p_rel, p_href) = make_urls(&format!("{}{}", enc_ref, qp));
                let path_label = format!("{}?page={}", commit_ref, p);
                let status_col = if p == page {
                    format!("page {} (current)", p)
                } else {
                    format!("page {}", p)
                };
                lines.push(format_autoindex_link(
                    &p_rel,
                    &p_href,
                    &path_label,
                    Some(&status_col),
                ));
            }
        }

        let html = match &redirect_pair {
            Some((r_href, r_rel)) => {
                render_autoindex_html_document(&title, &title, &lines, Some((r_href, r_rel)))
            }
            None => render_autoindex_html_document(&title, &title, &lines, None),
        };

        CommitBrowserOutput::Html {
            status: if is_redirect { 302 } else { 200 },
            title,
            html,
            redirect_to: redirect_pair.map(|(r_href, _)| r_href),
        }
    };

    // Case 1: Invalid commit hash (0 matches)
    if matched_commits.is_empty() {
        let total = all_commits.len();
        let total_pages = (total.max(1) + effective_page_size - 1) / effective_page_size;
        let heading = format!(
            "Index of /{}.git commits (invalid commit hash: {})",
            project_name, commit_ref
        );

        if subpath.is_empty() {
            if let Some(raw_p) = page_param {
                if let Ok(p) = raw_p.trim().parse::<usize>() {
                    if p >= 1 && p <= total_pages {
                        return render_commit_list(&all_commits, &heading, p, false);
                    }
                }
                return render_404(
                    &format!("/{}.git/{}?page={}", project_name, commit_ref, raw_p),
                    &format!(
                        "Invalid page number '{}' (valid pages: 1..={})",
                        raw_p, total_pages
                    ),
                    &format!("{}{}", encode_uri_segment(commit_ref), make_page_query(1)),
                    &format!("{}?page=1", commit_ref),
                );
            }
            if total > effective_page_size {
                return render_commit_list(&all_commits, &heading, 1, true);
            } else {
                return render_commit_list(&all_commits, &heading, 1, false);
            }
        }

        let requested_full = format!("/{}.git/{}/{}", project_name, commit_ref, subpath.join("/"));
        return render_404(
            &requested_full,
            &format!(
                "Commit hash '{}' is invalid and path '{}' cannot be resolved.",
                commit_ref, requested_full
            ),
            &encode_uri_segment(commit_ref),
            &format!("View commit list ({})", commit_ref),
        );
    }

    // Case 2: Ambiguous commit hash prefix (> 1 matches)
    if matched_commits.len() > 1 {
        let total = matched_commits.len();
        let total_pages = (total.max(1) + effective_page_size - 1) / effective_page_size;
        let heading = format!(
            "Index of candidate commits in /{}.git for prefix {} ({} matches)",
            project_name, commit_ref, total
        );

        if subpath.is_empty() {
            if let Some(raw_p) = page_param {
                if let Ok(p) = raw_p.trim().parse::<usize>() {
                    if p >= 1 && p <= total_pages {
                        return render_commit_list(&matched_commits, &heading, p, false);
                    }
                }
                return render_404(
                    &format!("/{}.git/{}?page={}", project_name, commit_ref, raw_p),
                    &format!(
                        "Invalid page number '{}' for candidate commits (valid pages: 1..={})",
                        raw_p, total_pages
                    ),
                    &format!("{}{}", encode_uri_segment(commit_ref), make_page_query(1)),
                    &format!("{}?page=1", commit_ref),
                );
            }
            if total > effective_page_size {
                return render_commit_list(&matched_commits, &heading, 1, true);
            } else {
                return render_commit_list(&matched_commits, &heading, 1, false);
            }
        }

        let requested_full = format!("/{}.git/{}/{}", project_name, commit_ref, subpath.join("/"));
        return render_404(
            &requested_full,
            &format!(
                "Commit prefix '{}' is ambiguous ({} candidate commits) for path '{}'",
                commit_ref, total, requested_full
            ),
            &encode_uri_segment(commit_ref),
            &format!("View candidate commits for {}", commit_ref),
        );
    }

    // Case 3: Uniquely resolved commit (`matched_commits.len() == 1`)
    // Always uses the resolved full 40-character commit hash (`resolved_oid_str`).
    let resolved_commit = &matched_commits[0];
    let resolved_oid_str = &resolved_commit.oid;
    let Ok(commit_oid) = ObjectId::from_hex(resolved_oid_str.as_bytes()) else {
        return render_404(
            &format!("/{}.git/{}", project_name, resolved_oid_str),
            &format!("Corrupt commit OID '{}'", resolved_oid_str),
            "",
            "../",
        );
    };
    let Some(commit_loose) = reader.read_loose(&commit_oid) else {
        return render_404(
            &format!("/{}.git/{}", project_name, resolved_oid_str),
            &format!("Commit object '{}' missing", resolved_oid_str),
            "",
            "../",
        );
    };
    let Ok(ObjectRef::Commit(commit_obj)) = ObjectRef::from_loose(&commit_loose) else {
        return render_404(
            &format!("/{}.git/{}", project_name, resolved_oid_str),
            &format!("Object '{}' is not a commit", resolved_oid_str),
            "",
            "../",
        );
    };
    let root_tree_oid = commit_obj.tree();

    let render_directory = |tree_oid: ObjectId, dir_subpath: &[String]| -> CommitBrowserOutput {
        let Some(tree_loose) = reader.read_loose(&tree_oid) else {
            return render_404(
                &format!("/{}.git/{}", project_name, resolved_oid_str),
                &format!("Tree object '{}' missing", tree_oid.to_hex()),
                &encode_uri_segment(resolved_oid_str),
                resolved_oid_str,
            );
        };
        let Ok(ObjectRef::Tree(tree_ref)) = ObjectRef::from_loose(&tree_loose) else {
            return render_404(
                &format!("/{}.git/{}", project_name, resolved_oid_str),
                &format!("Object '{}' is not a directory tree", tree_oid.to_hex()),
                &encode_uri_segment(resolved_oid_str),
                resolved_oid_str,
            );
        };

        let mut dirs: Vec<String> = Vec::new();
        let mut files: Vec<(String, usize)> = Vec::new();

        for entry in &tree_ref.entries {
            let name = entry.filename.to_str_lossy().into_owned();
            let child_oid = entry.oid.to_owned();
            let Some(child_loose) = reader.read_loose(&child_oid) else {
                continue;
            };
            let Ok((kind, size, _offset)) = gix_object::decode::loose_header(&child_loose) else {
                continue;
            };
            match kind {
                ObjectKind::Tree => dirs.push(name),
                ObjectKind::Blob => files.push((name, size as usize)),
                _ => {}
            }
        }

        dirs.sort();
        files.sort_by(|a, b| a.0.cmp(&b.0));

        let enc_oid = encode_uri_segment(resolved_oid_str);
        let dir_rel_display = dir_subpath.join("/");
        let dir_rel_encoded = dir_subpath
            .iter()
            .map(|s| encode_uri_segment(s))
            .collect::<Vec<_>>()
            .join("/");

        let title = if dir_subpath.is_empty() {
            format!("Index of /{}.git/{}/", project_name, resolved_oid_str)
        } else {
            format!(
                "Index of /{}.git/{}/{}/",
                project_name, resolved_oid_str, dir_rel_display
            )
        };

        let mut lines: Vec<String> = Vec::new();

        if !dir_subpath.is_empty() {
            let parent_target = if dir_subpath.len() == 1 {
                enc_oid.clone()
            } else {
                let parent_enc = dir_subpath[..dir_subpath.len() - 1]
                    .iter()
                    .map(|s| encode_uri_segment(s))
                    .collect::<Vec<_>>()
                    .join("/");
                format!("{}/{}", enc_oid, parent_enc)
            };
            let (p_rel, p_href) = make_urls(&parent_target);
            lines.push(format_autoindex_link(&p_rel, &p_href, "../", None));
        }

        for d_name in dirs {
            let display_path = if dir_subpath.is_empty() {
                format!("{}/{}/", resolved_oid_str, d_name)
            } else {
                format!("{}/{}/{}/", resolved_oid_str, dir_rel_display, d_name)
            };
            let target_path = if dir_subpath.is_empty() {
                format!("{}/{}", enc_oid, encode_uri_segment(&d_name))
            } else {
                format!(
                    "{}/{}/{}",
                    enc_oid,
                    dir_rel_encoded,
                    encode_uri_segment(&d_name)
                )
            };
            let (d_rel, d_href) = make_urls(&target_path);
            lines.push(format_autoindex_link(
                &d_rel,
                &d_href,
                &display_path,
                Some("-"),
            ));
        }

        for (f_name, f_size) in files {
            let display_path = if dir_subpath.is_empty() {
                format!("{}/{}", resolved_oid_str, f_name)
            } else {
                format!("{}/{}/{}", resolved_oid_str, dir_rel_display, f_name)
            };
            let target_path = if dir_subpath.is_empty() {
                format!("{}/{}", enc_oid, encode_uri_segment(&f_name))
            } else {
                format!(
                    "{}/{}/{}",
                    enc_oid,
                    dir_rel_encoded,
                    encode_uri_segment(&f_name)
                )
            };
            let (f_rel, f_href) = make_urls(&target_path);
            lines.push(format_autoindex_link(
                &f_rel,
                &f_href,
                &display_path,
                Some(&f_size.to_string()),
            ));
        }

        let html = render_autoindex_html_document(&title, &title, &lines, None);
        CommitBrowserOutput::Html {
            status: 200,
            title,
            html,
            redirect_to: None,
        }
    };

    if subpath.is_empty() {
        return render_directory(root_tree_oid, &[]);
    }

    let full_req_display = format!(
        "/{}.git/{}/{}",
        project_name,
        resolved_oid_str,
        subpath.join("/")
    );

    for seg in subpath {
        if seg.is_empty() || seg == "." || seg == ".." || seg.contains('/') || seg.contains('\0') {
            return render_404(
                &full_req_display,
                &format!("Invalid path segment '{}' in '{}'", seg, full_req_display),
                &encode_uri_segment(resolved_oid_str),
                &format!("{}/", resolved_oid_str),
            );
        }
    }

    let mut current_tree_oid = root_tree_oid;
    for seg in &subpath[..subpath.len() - 1] {
        let Some(tree_loose) = reader.read_loose(&current_tree_oid) else {
            return render_404(
                &full_req_display,
                &format!("Directory tree does not exist along '{}'", full_req_display),
                &encode_uri_segment(resolved_oid_str),
                &format!("{}/", resolved_oid_str),
            );
        };
        let Ok(ObjectRef::Tree(tree_ref)) = ObjectRef::from_loose(&tree_loose) else {
            return render_404(
                &full_req_display,
                &format!("Intermediate object is not a directory along '{}'", full_req_display),
                &encode_uri_segment(resolved_oid_str),
                &format!("{}/", resolved_oid_str),
            );
        };
        let Some(found_entry) = tree_ref
            .entries
            .iter()
            .find(|e| e.filename.to_str_lossy() == seg.as_str())
        else {
            return render_404(
                &full_req_display,
                &format!(
                    "Directory '{}' does not exist in commit {}",
                    seg, resolved_oid_str
                ),
                &encode_uri_segment(resolved_oid_str),
                &format!("{}/", resolved_oid_str),
            );
        };
        let child_oid = found_entry.oid.to_owned();
        let Some(child_loose) = reader.read_loose(&child_oid) else {
            return render_404(
                &full_req_display,
                &format!("Git object for '{}' not found", seg),
                &encode_uri_segment(resolved_oid_str),
                &format!("{}/", resolved_oid_str),
            );
        };
        let Ok((child_kind, _, _)) = gix_object::decode::loose_header(&child_loose) else {
            return render_404(
                &full_req_display,
                &format!("Corrupt Git object for '{}'", seg),
                &encode_uri_segment(resolved_oid_str),
                &format!("{}/", resolved_oid_str),
            );
        };
        if child_kind != ObjectKind::Tree {
            return render_404(
                &full_req_display,
                &format!(
                    "'{}' is a file, not a directory (cannot traverse '{}')",
                    seg, full_req_display
                ),
                &encode_uri_segment(resolved_oid_str),
                &format!("{}/", resolved_oid_str),
            );
        }
        current_tree_oid = child_oid;
    }

    let last_seg = &subpath[subpath.len() - 1];
    let Some(parent_tree_loose) = reader.read_loose(&current_tree_oid) else {
        return render_404(
            &full_req_display,
            &format!("Parent directory does not exist for '{}'", full_req_display),
            &encode_uri_segment(resolved_oid_str),
            &format!("{}/", resolved_oid_str),
        );
    };
    let Ok(ObjectRef::Tree(parent_tree_ref)) = ObjectRef::from_loose(&parent_tree_loose) else {
        return render_404(
            &full_req_display,
            &format!("Parent object is not a directory for '{}'", full_req_display),
            &encode_uri_segment(resolved_oid_str),
            &format!("{}/", resolved_oid_str),
        );
    };
    let Some(target_entry) = parent_tree_ref
        .entries
        .iter()
        .find(|e| e.filename.to_str_lossy() == last_seg.as_str())
    else {
        return render_404(
            &full_req_display,
            &format!(
                "File or directory '{}' does not exist in commit {}",
                subpath.join("/"),
                resolved_oid_str
            ),
            &encode_uri_segment(resolved_oid_str),
            &format!("{}/", resolved_oid_str),
        );
    };

    let target_oid = target_entry.oid.to_owned();
    let Some(target_loose) = reader.read_loose(&target_oid) else {
        return render_404(
            &full_req_display,
            &format!("Git object '{}' is missing", target_oid.to_hex()),
            &encode_uri_segment(resolved_oid_str),
            &format!("{}/", resolved_oid_str),
        );
    };
    let Ok((target_kind, target_size, target_offset)) =
        gix_object::decode::loose_header(&target_loose)
    else {
        return render_404(
            &full_req_display,
            &format!("Corrupt Git object for '{}'", full_req_display),
            &encode_uri_segment(resolved_oid_str),
            &format!("{}/", resolved_oid_str),
        );
    };

    match target_kind {
        ObjectKind::Tree => render_directory(target_oid, subpath),
        ObjectKind::Blob => {
            if trailing_slash {
                return render_404(
                    &format!("{}/", full_req_display),
                    &format!(
                        "'{}' is a regular file, not a directory (trailing '/' is invalid)",
                        subpath.join("/")
                    ),
                    &encode_uri_segment(resolved_oid_str),
                    &format!("{}/", resolved_oid_str),
                );
            }
            let end = (target_offset + (target_size as usize)).min(target_loose.len());
            let body = target_loose[target_offset..end].to_vec();
            let is_binary = body.iter().take(4096).any(|&b| b == 0);
            CommitBrowserOutput::RawFile {
                status: 200,
                filename: last_seg.clone(),
                content: body,
                is_binary,
            }
        }
        _ => render_404(
            &full_req_display,
            &format!("Unsupported Git object kind at '{}'", full_req_display),
            &encode_uri_segment(resolved_oid_str),
            &format!("{}/", resolved_oid_str),
        ),
    }
}

fn handle_commit_browser_get(
    event: &GasDoGetEvent,
    project_name: &str,
    commit_ref: &str,
    subpath: &[String],
    trailing_slash: bool,
    encoding: &str,
    format: &str,
) -> WebResponse {
    let custom_per_page = event
        .parameter
        .get("per_page")
        .and_then(|s| s.parse::<usize>().ok())
        .filter(|&n| n >= 1);

    let page_size = custom_per_page
        .or_else(|| {
            get_env_or_script_property(ENV_GIT_COMMIT_PAGE_SIZE)
                .and_then(|s| s.parse::<usize>().ok())
        })
        .unwrap_or(DEFAULT_COMMIT_PAGE_SIZE)
        .max(1);

    let page_param = event.parameter.get("page").map(|s| s.as_str());
    let configured_base = get_env_or_script_property(ENV_GAS_WEB_APP_URL);

    let store = match GasGitStore::open(project_name) {
        Ok(s) => s,
        Err(err) => {
            let title = "404 Not Found - Repository Does Not Exist (Not a Raw File)";
            let req_display = format!("/{}.git/{}", project_name, commit_ref);
            let html = render_not_found_error_document(title, &req_display, &err, None);
            if format == "json" {
                let env = GasGitResponseEnvelope {
                    ok: false,
                    status: 404,
                    content_type: "text/html; charset=utf-8".to_string(),
                    body_base64: BASE64_STANDARD.encode(html.as_bytes()),
                    error: Some(err),
                };
                let json = serde_json::to_string(&env).unwrap_or_default();
                return WebResponse::Text(
                    gas_content_service::create_text_output(&json).set_mime_type(MimeType::Json),
                );
            }
            return WebResponse::Html(
                gas_html_service::create_html_output(Some(HtmlSource::Html(html)))
                    .set_title(title)
                    .set_sandbox_mode(SandboxMode::Iframe)
                    .set_x_frame_options_mode(XFrameOptionsMode::Allowall),
            );
        }
    };

    let output = resolve_commit_browser_request(
        &store,
        project_name,
        commit_ref,
        subpath,
        trailing_slash,
        page_param,
        configured_base.as_deref(),
        page_size,
        custom_per_page,
    );

    match output {
        CommitBrowserOutput::Html {
            status,
            title,
            html,
            ..
        } => {
            if format == "json" {
                let env = GasGitResponseEnvelope {
                    ok: status < 400,
                    status,
                    content_type: "text/html; charset=utf-8".to_string(),
                    body_base64: BASE64_STANDARD.encode(html.as_bytes()),
                    error: if status >= 400 {
                        Some(title.clone())
                    } else {
                        None
                    },
                };
                let json = serde_json::to_string(&env).unwrap_or_default();
                WebResponse::Text(
                    gas_content_service::create_text_output(&json).set_mime_type(MimeType::Json),
                )
            } else {
                WebResponse::Html(
                    gas_html_service::create_html_output(Some(HtmlSource::Html(html)))
                        .set_title(&title)
                        .set_sandbox_mode(SandboxMode::Iframe)
                        .set_x_frame_options_mode(XFrameOptionsMode::Allowall),
                )
            }
        }
        CommitBrowserOutput::RawFile {
            status,
            filename,
            content,
            is_binary,
        } => {
            if format == "json" {
                let ctype = if is_binary {
                    "application/octet-stream"
                } else {
                    "text/plain; charset=utf-8"
                };
                let env = GasGitResponseEnvelope {
                    ok: true,
                    status,
                    content_type: ctype.to_string(),
                    body_base64: BASE64_STANDARD.encode(&content),
                    error: None,
                };
                let json = serde_json::to_string(&env).unwrap_or_default();
                WebResponse::Text(
                    gas_content_service::create_text_output(&json).set_mime_type(MimeType::Json),
                )
            } else if encoding == "base64" {
                let b64 = BASE64_STANDARD.encode(&content);
                let out =
                    gas_content_service::create_text_output(&b64).set_mime_type(MimeType::Text);
                if is_binary {
                    WebResponse::Text(out.download_as_file(&filename))
                } else {
                    WebResponse::Text(out)
                }
            } else if is_binary {
                // Binary file: use GAS ContentService download feature (`downloadAsFile`)
                let text = String::from_utf8_lossy(&content);
                WebResponse::Text(
                    gas_content_service::create_text_output(&text)
                        .set_mime_type(MimeType::Text)
                        .download_as_file(&filename),
                )
            } else {
                let text = String::from_utf8_lossy(&content);
                WebResponse::Text(
                    gas_content_service::create_text_output(&text).set_mime_type(MimeType::Text),
                )
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{
        CommitBrowserOutput, CommitItem, GitObjectReader, GitRoute, encode_uri_segment,
        escape_html, parse_git_path, parse_project_segment, percent_decode,
        resolve_commit_browser_request,
    };
    use gix_hash::ObjectId;
    use std::collections::BTreeMap;

    #[test]
    fn test_parse_project_segment() {
        assert_eq!(
            parse_project_segment("my-project.git").unwrap(),
            "my-project"
        );
        assert_eq!(parse_project_segment("my_repo").unwrap(), "my_repo");
        assert!(parse_project_segment("").is_err());
        assert!(parse_project_segment(".git").is_err());
        assert!(parse_project_segment("../secret").is_err());
    }

    #[test]
    fn test_escape_and_percent_encoding() {
        assert_eq!(
            escape_html(r#"<script>alert("x" & 'y')</script>"#),
            "&lt;script&gt;alert(&quot;x&quot; &amp; &#39;y&#39;)&lt;/script&gt;"
        );
        let original = "hello world?#%&<>.txt";
        let encoded = encode_uri_segment(original);
        assert!(!encoded.contains('?'));
        assert!(!encoded.contains('#'));
        assert_eq!(percent_decode(&encoded), original);
    }

    #[test]
    fn test_parse_git_path_routes() {
        assert_eq!(parse_git_path("/").unwrap(), GitRoute::WebUiRoot);
        assert_eq!(parse_git_path("").unwrap(), GitRoute::WebUiRoot);
        assert_eq!(
            parse_git_path("/sample-repo.git").unwrap(),
            GitRoute::WebUiRepo {
                project_name: "sample-repo".to_string()
            }
        );
        assert_eq!(
            parse_git_path("/sample-repo.git/info/refs").unwrap(),
            GitRoute::InfoRefs {
                project_name: "sample-repo".to_string()
            }
        );
        assert_eq!(
            parse_git_path("sample-repo.git/git-upload-pack").unwrap(),
            GitRoute::UploadPack {
                project_name: "sample-repo".to_string()
            }
        );
        assert_eq!(
            parse_git_path("/macros/s/AKfycb123/exec/my_project.git/git-receive-pack").unwrap(),
            GitRoute::ReceivePack {
                project_name: "my_project".to_string()
            }
        );
        assert_eq!(
            parse_git_path("/macros/s/AKfycb123/exec/my_project.git/a1b2c3d4").unwrap(),
            GitRoute::CommitBrowser {
                project_name: "my_project".to_string(),
                commit_ref: "a1b2c3d4".to_string(),
                subpath: vec![],
                trailing_slash: false,
            }
        );
        assert_eq!(
            parse_git_path("/macros/s/AKfycb123/exec/my_project.git/a1b2c3d4/src/main.rs").unwrap(),
            GitRoute::CommitBrowser {
                project_name: "my_project".to_string(),
                commit_ref: "a1b2c3d4".to_string(),
                subpath: vec!["src".to_string(), "main.rs".to_string()],
                trailing_slash: false,
            }
        );
        // Direct `/exec/<commit_hash>` without `/<project_name>.git` is invalid
        assert!(parse_git_path("/macros/s/AKfycb123/exec/a1b2c3d4").is_err());
        assert!(parse_git_path("/a1b2c3d4").is_err());
        assert!(parse_git_path("/info/refs").is_err());
        assert!(parse_git_path("/git-upload-pack").is_err());
    }

    struct DummyReader {
        commits: Vec<CommitItem>,
        objects: BTreeMap<ObjectId, Vec<u8>>,
    }

    impl GitObjectReader for DummyReader {
        fn read_loose(&self, oid: &ObjectId) -> Option<Vec<u8>> {
            self.objects.get(oid).cloned()
        }

        fn list_commits(&self) -> Vec<CommitItem> {
            self.commits.clone()
        }
    }

    #[test]
    fn test_commit_browser_invalid_and_ambiguous_commits_with_page_param() {
        let commits = vec![
            CommitItem {
                oid: "a1b2c3d400000000000000000000000000000001".to_string(),
                short_oid: "a1b2c3d".to_string(),
                parents: vec![],
                author_name: "Alice".to_string(),
                author_email: "alice@example.com".to_string(),
                timestamp: 1700000002,
                summary: "Second commit".to_string(),
                body: "Second commit".to_string(),
                refs: vec!["HEAD -> main".to_string()],
            },
            CommitItem {
                oid: "a1b2f99900000000000000000000000000000002".to_string(),
                short_oid: "a1b2f99".to_string(),
                parents: vec![],
                author_name: "Bob".to_string(),
                author_email: "bob@example.com".to_string(),
                timestamp: 1700000001,
                summary: "First commit".to_string(),
                body: "First commit".to_string(),
                refs: vec![],
            },
        ];
        let reader = DummyReader {
            commits,
            objects: BTreeMap::new(),
        };

        // Ambiguous prefix `a1b2` matches both commits (and redirects to `?page=1` when page_size=1)
        let ambig_redir = resolve_commit_browser_request(
            &reader,
            "my-repo",
            "a1b2",
            &[],
            false,
            None,
            None,
            1,
            Some(1),
        );
        match ambig_redir {
            CommitBrowserOutput::Html {
                status,
                html,
                redirect_to,
                ..
            } => {
                assert_eq!(status, 302);
                assert_eq!(
                    redirect_to.as_deref(),
                    Some("../my-repo.git/a1b2?page=1&per_page=1")
                );
                assert!(html.contains("a1b2?page=2"));
            }
            _ => panic!("Expected redirect Html output for ambiguous prefix with page_size=1"),
        }

        // Invalid commit hash with page_size=1 redirects to `?page=1` and links to `?page=2`
        let inv_redir = resolve_commit_browser_request(
            &reader,
            "my-repo",
            "badhash",
            &[],
            false,
            None,
            None,
            1,
            None,
        );
        match inv_redir {
            CommitBrowserOutput::Html {
                status,
                html,
                redirect_to,
                ..
            } => {
                assert_eq!(status, 302);
                assert_eq!(redirect_to.as_deref(), Some("../my-repo.git/badhash?page=1"));
                assert!(html.contains("badhash?page=2"));
            }
            _ => panic!("Expected redirect Html output for invalid hash"),
        }
    }
}
