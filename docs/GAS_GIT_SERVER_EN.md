# Google Apps Script (GAS) Git Server with `gitoxide`, Google Drive & Gleam/Lustre Web UI — English Guide

This guide explains how this repository runs a **Git Smart HTTP v1 Server** on Google Apps Script (GAS) using a Rust WebAssembly Component (`wasm32-wasip2`) and **`gitoxide` (`gix-*`)**. It covers the Google Drive storage format, URL routing, the **Gleam + Lustre browser Web UI**, and the Python Git remote helper **`git-remote-gas`** (`gas::` URL prefix).

For setup steps see the [README](../README.md) (Japanese). For the build pipeline and security notes see [ARCHITECTURE.md](ARCHITECTURE.md).

---

## 1. Architecture Overview

### 1.1 GitHub-Style URL Path Routing (`.../exec/<project_name>.git`)
The URLs follow GitHub's repository URLs (`https://github.com/username/project_name.git`) but drop the `username` segment, because a GAS deployment serves a single user. Each repository is addressed by appending `/<project_name>.git` to the Web App `/exec` URL:

```bash
git remote add origin gas::https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec/project_name.git
```

Both the Rust server (`parse_git_path` in `src/git_server.rs`) and the client helper (`parse_gas_remote_url` in `tools/git-remote-gas`) parse the URL path and route requests to:

| Method and path (after `/exec`) | Purpose |
| :--- | :--- |
| `GET  /<project>.git/info/refs?service=git-upload-pack` | Ref advertisement for `ls-remote` / `clone` / `fetch` / `pull` |
| `GET  /<project>.git/info/refs?service=git-receive-pack` | Ref advertisement for `push` |
| `POST /<project>.git/git-upload-pack` | Pack negotiation and transfer |
| `POST /<project>.git/git-receive-pack` | Pack unpacking and ref updates |
| `GET  /` | Gleam + Lustre Web UI |
| `GET  /<project>.git` | Commit list (`?page=N`, `?per_page=N`, max 500) |
| `GET  /<project>.git/<commit>` | Root directory listing of that commit (abbreviated hashes accepted) |
| `GET  /<project>.git/<commit>/<path>` | Directory listing, or raw file content (binary files are downloaded) |
| `GET  ?action=list_repos` / `get_commits` / `get_commit_detail` | Read-only JSON API for the Web UI |
| `POST ?action=create_repo` | Create an empty repository (**not accepted over GET**, to prevent CSRF) |

A bare commit hash directly under `/exec` (`/exec/<commit>`) is rejected; the path must start with `/<project>.git`.

GAS `doGet` / `doPost` can only return text, so binary Git responses are returned as Base64 strings (or as JSON with a `body_base64` field when `format=json`). `git-remote-gas` sends request bodies as a JSON envelope `{"service": ..., "git_path": ..., "encoding": "base64", "body_base64": ...}`.

### 1.2 Google Drive Storage Format

Repositories are stored by default inside the Google Drive folder given by the **`GIT_DRIVE_FOLDER_ID`** Script Property. Each project lives in that folder as a `<project_name>.git` subfolder.

Drive API calls are the most expensive operation on GAS (hundreds of milliseconds each). The server therefore does **not** write one file per Git object. Instead, **the objects received in one push are grouped by type into a few JSON files (bundles)**:

```text
<Google Drive Folder (GIT_DRIVE_FOLDER_ID)>/
├── project-alpha.git/
│   ├── HEAD                  "ref: refs/heads/main\n"
│   ├── refs.json             {"refs/heads/main": "<sha1-hex>", ...}
│   ├── commits_cache.json    persistent commit-list index (see 1.3)
│   └── objects/
│       ├── bundle_commit_<pack-sha1>.json   Commit and Tag objects only
│       ├── bundle_meta_<pack-sha1>.json     Tree objects + blob size table
│       ├── bundle_blob_<pack-sha1>.json     Blobs (file contents)
│       ├── bundle_blob_<pack-sha1>_1.json   … split into _1, _2, … beyond 4 MB
│       └── ...
├── project-beta.git/
└── ...
```

- **`<pack-sha1>`** is the trailing SHA-1 checksum of the pushed pack, so re-sending the same pack produces the same name.
- **Bundle contents**: a JSON object `{"<object sha1>": "<stored string>", ...}`.
- **Stored string**: an encoding of the loose object `<kind> <size>\0<body>`, in one of two forms:
  - `z:<uncompressed size>:<Base64>`: used when the object is at least 128 bytes and zlib actually shrinks it. Text-heavy repositories typically shrink 5–10x.
  - `<Base64>`: otherwise (uncompressed).
- **Blob size table**: `bundle_meta_*` also contains `"__sz__:<blob sha1>": "<bytes>"` entries. Directory listings show file sizes, and this table lets them do so without opening blob bundles.
- **Splitting**: each bundle type is split when its JSON reaches 4 MB, to avoid Drive and V8 memory spikes.
- **Backward compatibility**: files written by older versions remain readable: 40-hex-character files directly under `objects/` (one file per object) and untyped `bundle_*.json` files. New writes only produce the typed bundles above.

### 1.3 Reads and Caching

`GasGitStore::read_loose_object` looks in the cheapest place first and stops as soon as it finds the object:

1. In-request memory (inflated objects, capped at 12 MB)
2. In-request memory (compressed strings from bundles already read)
3. GAS `CacheService` (across requests, up to 6 hours; objects up to 32 KB only)
4. `bundle_commit_*` then `bundle_meta_*`, opened one at a time, newest first
5. `bundle_blob_*`, opened only when the object is known to be a blob

The commit list (used by the Web UI graph and the `/<project>.git` listing) is resolved in three steps:

1. A compressed list in `CacheService`, split into at most 16 shards because of the 100 KB value limit.
2. `commits_cache.json`, a persistent index holding the commit list, the names of bundles already scanned, and the HEAD/ref values it was built for. It is used directly when HEAD and refs match and the graph has no gaps.
3. A scan of only the bundles not yet indexed. If the scan exceeds 200 seconds, progress is saved to `commits_cache.json` and the next request continues from there (this keeps huge repositories within the 6-minute GAS limit).

The server also caches the following in `CacheService`; the relevant keys are invalidated on push:
- whether a repository exists
- HEAD and refs
- the repository list

### 1.4 Push Processing and Consistency

`git-receive-pack` proceeds as follows:
1. It acquires the `LockService` script lock, waiting up to 30 seconds; if the lock cannot be acquired, the push is rejected.
2. It verifies and unpacks the pack:
   - checks the trailing SHA-1
   - inflates every object and resolves `OFS_DELTA` / `REF_DELTA` against their bases
   - recomputes every object's SHA-1
   - caps each object at 64 MiB
3. It writes the bundles described in 1.2 and appends the new commits to `commits_cache.json`.
4. It updates refs with the same compare-and-swap rule as `git receive-pack`: a ref is changed only if its current value equals the command's old value.
   - Updates outside `refs/` are rejected.
   - Updates whose new tip object does not exist are rejected.
   - When `atomic` is requested, a single failure rejects every update.
   - `refs.json` is written once per push.
   - If HEAD's target branch does not exist, HEAD is pointed at the pushed branch.

For large repositories, `git-remote-gas` splits the push into packs of a few MB each. It advances the branch along first-parent checkpoints, so an interrupted push resumes where it left off when re-run.

### 1.5 Clone / Fetch Processing (`src/upload_pack.rs`)

`git-upload-pack` mirrors `git upload-pack --stateless-rpc`. It lives in a standalone, GAS-independent module tested against real `git`. Each HTTP request is one negotiation round, and only a request containing `done` gets a pack.

| Capability | Behavior |
| :--- | :--- |
| `multi_ack` / `multi_ack_detailed` | `ACK <oid> continue` / `common` for each common commit, then `ready` once every wanted commit has a common ancestor, so the client stops negotiating. Real `git fetch-pack` requires `multi_ack_detailed` over HTTP |
| `shallow` | Supports `deepen <n>` (`--depth`) and `--unshallow`: replies with `shallow` / `unshallow` lines and limits the pack to that depth. Plain fetches into a shallow clone treat the client's shallow commits as boundaries |
| `ofs-delta` | Blobs and trees are stored as deltas against the newer version at the same path (newest stored whole) |
| `thin-pack` | Sends `REF_DELTA`s against the version the client already has at the same path, which greatly reduces incremental fetches (the client completes the pack with `index-pack --fix-thin`) |
| `include-tag` | Adds annotated tags that point at sent objects. `info/refs` also advertises peeled `^{}` lines for tags |
| `side-band` / `side-band-64k` / `no-progress` | Progress / data multiplexing |

What the client already has is derived from the ancestry of the common commits, plus the trees of the "edge" commits adjacent to the commits being sent. The server never walks every tree in history. `git-remote-gas` sends `have` lines (up to 256 recent local commits) and the capabilities above, so `git pull` transfers only the difference. `git clone --depth N`, `git fetch --depth N` and `--unshallow` are supported, and `$GIT_DIR/shallow` is updated.

### 1.6 No Automatic Initial Commit & Gleam + Lustre Browser Web UI (`web/`)
- **No unwanted initial commits**: the server never creates a commit on its own. New repositories start empty (`0` commits, unborn `HEAD -> refs/heads/main`), so `git push -u origin main` from any local repository works without non-fast-forward conflicts.
- **Gleam + Lustre Web UI (`web/src/gas_git_ui.gleam`)**: opening `https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec` in a browser serves the UI.
  - **Pure Elm Architecture (MVU)**: built on `lustre.application(init, update, view)` and `lustre/effect.from`.
  - **No npm frontend dependencies**: only Gleam (`target = "javascript"`) and Lustre.
  - **Features**:
    1. List all projects in the configured Drive folder (HEAD, branch count, remote URL).
    2. Create empty repositories and show copy-pasteable `git remote add origin` / `git push -u origin main` commands.
    3. An SVG commit graph (a Fossil-style vertical timeline, `graph.gleam`).
    4. Per-commit unified diffs and the file tree.
  - **Browser-side cache**: commit lists and diffs are stored in IndexedDB (falling back to CacheStorage, then localStorage), so repeat views make no server request. Cache keys include the HEAD commit, so data is refetched after a push.
- The Web UI HTML (`dist/index.html`) is **not** embedded into the Wasm binary. `clasp push` uploads it as the GAS HTML file `index`, and the server reads it at runtime with `HtmlService.createHtmlOutputFromFile("index")`, then injects the initial-state JSON.

### 1.7 Role of `gitoxide` in `src/git_server.rs`

| Crate | Usage in GAS Git Server |
| :--- | :--- |
| **`gix-packetline`** | Encoding and decoding Smart HTTP v1 pkt-lines: `# service=…`, the empty-repository `capabilities^{}` line, `want`/`have`/`done`, `side-band-64k`, and `report-status` |
| **`gix-object`** | Building loose-object headers and zero-copy parsing (`ObjectRef::from_loose` / `from_bytes`) to walk commit graphs and trees |
| **`gix-hash`** | SHA-1 `ObjectId` hex conversion and validation, and the 20-byte SHA-1 checksum of `PACK` v2 streams |
| **`gix-zlib`** | Pure-Rust (`zlib-rs`) compression (`stream::deflate::Write`) and decompression (`Inflate::once`) of pack entries and `z:`-encoded stored strings |
| **`gix-validate`** | Validating reference names (`refs/heads/*`, `refs/tags/*`) on `git push` |

Delta application (`apply_git_delta`) and the bundle storage format are implemented specifically for GAS.

---

## 2. Environment Variables (GAS Script Properties & Client Variables)

### 2.1 Server-Side (GAS Script Properties via `wasi:cli/environment`)

`wasi:cli/environment` (`js/wasi-cli.ts`) exposes **`PropertiesService.getScriptProperties()`** as WASI environment variables (`std::env::var`) inside the Rust Wasm component.

| Variable (Script Property key) | Required | Example | Description |
| :--- | :---: | :--- | :--- |
| **`GIT_DRIVE_FOLDER_ID`** | **Required** | `1a2b3c4d5e6f7g8h9i0j...` | ID of the Drive folder that holds the `<project_name>.git` subfolders. Taken from `https://drive.google.com/drive/folders/<FOLDER_ID>`. |
| **`GAS_WEB_APP_URL`** | Optional | `https://script.google.com/macros/s/<ID>/exec` | The deployed `/exec` URL. Normally detected via `ScriptApp.getService().getUrl()`; set it where detection fails so the Web UI and commit-list links use the correct URL. |
| **`GIT_COMMIT_PAGE_SIZE`** | Optional | `20` | Commits per page on `/<project>.git` (default 20, range 1–500). `?per_page=N` overrides it per request. |

#### How to Configure `GIT_DRIVE_FOLDER_ID`
1. Open or create the Drive folder for your repositories and copy `<FOLDER_ID>` from `https://drive.google.com/drive/folders/<FOLDER_ID>`.
2. In the GAS editor, open **Project Settings (gear icon) > Script Properties**.
3. Click **Add script property** and set:
   - **Property**: `GIT_DRIVE_FOLDER_ID`
   - **Value**: `<FOLDER_ID>`
4. Save the script properties.

### 2.2 Client-Side (`git-remote-gas`)

| Variable | Required | Default | Description |
| :--- | :---: | :---: | :--- |
| **`GAS_GIT_TIMEOUT`** | Optional | `300` (sec) | HTTP timeout in seconds. Increase with `export GAS_GIT_TIMEOUT=600`; `0` or negative disables it. |
| **`GAS_GIT_TOKEN`** | Optional | None | OAuth 2.0 Bearer token (e.g. `gcloud auth print-access-token`). If unset, the helper tries anonymous access, cached credentials, `~/.clasprc.json`, then an interactive prompt. |
| **`GAS_GIT_COOKIE`** | Optional | None | Browser session cookie (`SID=...; HSID=...`) as an alternative to a token. |
| **`GAS_GIT_CHUNK_OBJECTS`** | Optional | `2500` | Max objects per push chunk |
| **`GAS_GIT_CHUNK_UNCOMPRESSED_MB`** | Optional | `12` | Max uncompressed size per chunk (MB); `GAS_GIT_CHUNK_UNCOMPRESSED_BYTES` for bytes |
| **`GAS_GIT_CHUNK_PACK_MB`** | Optional | `5` | Max pack size per chunk (MB); `GAS_GIT_CHUNK_PACK_BYTES` for bytes |
| **`GAS_GIT_CHUNK_COMMITS`** | Optional | `400` | Commits between branch checkpoints |

Credentials (`Authorization` / `Cookie`) are sent only to the configured remote's origin and to `https://*.google.com` (the cookie also to `https://*.googleusercontent.com`).

---

## 3. Build, Deploy, and Usage

### 3.1 Build and Deploy to GAS
```bash
# 1. First time only: install the wasm32-wasip2 target and Node dependencies
make setup

# 2. Build (Gleam UI + Rust Wasm + jco + webpack) and push dist/ to the GAS project
#    Uploads dist/main.js, dist/index.html (Web UI) and dist/appsscript.json
make push

# 3. Deploy as a Web App (or use Deploy > New deployment in the GAS editor)
pnpm exec clasp deploy --description "gitoxide Smart HTTP v1 Git Server on Google Drive"
```

After updating the code, update the existing deployment to a new version; otherwise `/exec` keeps serving the old one.

### 3.2 Create a Repository from the Browser Web UI
1. Open `https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec` in your browser.
2. Under **Create a new repository**, enter a project name (e.g. `my-project`) and an optional description, then click **Create repository**.
3. The server creates an empty `my-project.git/` folder (`HEAD`, `refs.json`, `objects/`) in the configured Drive folder and shows the quick-setup commands.

### 3.3 Push and Clone Using `git-remote-gas`
```bash
# 1. Install git-remote-gas into ~/.local/bin
make install-git-remote-gas

# 2. (Optional) Increase the timeout for large repositories
export GAS_GIT_TIMEOUT=600

# 3. Initialize a local repository, add the GAS remote, and push
mkdir my-project && cd my-project
echo "# my-project" >> README.md
git init
git add README.md
git commit -m "first commit"
git branch -M main
git remote add origin gas::https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec/my-project.git
git push -u origin main

# 4. Clone the repository into another directory
git clone gas::https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec/my-project.git my-project-clone
```

### 3.4 Run the End-to-End Test Suite (`make test-git-e2e`)
```bash
make test-git-e2e
# or
python3 ./tools/test_gas_git_e2e.py
```

The E2E suite exercises push / clone / pull through `git-remote-gas` and the Web APIs against a mock server written in Python. The Rust server itself is covered by the unit tests run with `make check`.
