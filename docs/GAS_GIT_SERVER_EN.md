# Google Apps Script (GAS) Git Server with `gitoxide` & `git-remote-gas` — English Guide

This guide explains how to run a **Git Smart HTTP v1 Server** on Google Apps Script (GAS) powered by a Rust WebAssembly Component (`wasm32-wasip2`) and **`gitoxide` (`gix-*`)**, along with the Python client-side Git remote helper **`git-remote-gas`** (`gas::` URL prefix) that transparently handles GAS HTTP 302 redirects and Google authentication.

---

## 1. Architecture Overview

### 1.1 Why Is a Client-Side Helper (`git-remote-gas` / `gas::`) Needed?
Google Apps Script Web App URLs (`https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec`) have three platform behaviors that standard Git HTTP transport (`git-remote-http`) cannot handle out of the box:

1. **HTTP 302 Redirects on Both `GET` and `POST`**
   - Every GAS `doGet(e)` and `doPost(e)` execution that returns a `ContentService.TextOutput` responds with `HTTP 302 Moved Temporarily` pointing to a one-time URL on `https://script.googleusercontent.com/macros/echo?user_content_key=...`.
   - Crucially, for **`POST` requests (`/git-upload-pack` and `/git-receive-pack`)**, GAS executes `doPost(e)` during the initial `POST` request and requires the client to follow the `302` redirect using a **`GET` request** to retrieve the output (re-POSTing to `script.googleusercontent.com/macros/echo` fails with `405 Method Not Allowed`).
2. **Google Account Login & Authentication**
   - When `appsscript.json` configures `webapp.access` as `"MYSELF"`, `"DOMAIN"`, or `"ANYONE"` (requiring Google sign-in), unauthenticated requests are redirected (`302`) to `https://accounts.google.com/ServiceLogin`.
   - `git-remote-gas` automatically attaches OAuth 2.0 Bearer tokens (from `GAS_GIT_TOKEN`, `~/.config/gas-git/token.json`, `~/.clasprc.json` with automatic refresh, or `gcloud auth print-access-token`) or session cookies (`GAS_GIT_COOKIE` / `GAS_GIT_COOKIE_FILE`), and strips the `Authorization` header when crossing domains to `script.googleusercontent.com`.
3. **Binary-Safe Transport over `ContentService.TextOutput`**
   - Because GAS `ContentService` only returns UTF-8 strings, raw binary Git `PACK` v2 streams and sideband channels would be corrupted if returned as plain text.
   - Our server and client use base64 framing (`encoding=base64` and JSON envelopes) backed by GAS `Utilities.base64Encode` / `Utilities.base64Decode` for 100% binary fidelity.

---

### 1.2 How `gitoxide` Powers the GAS Git Server (`src/git_server.rs`)
The Rust Wasm Component (`src/git_server.rs`) implements the Git Smart HTTP v1 protocol using the vendored **`gitoxide`** crates under `crates/gix-*`:

| `gitoxide` Crate (`crates/`) | Role in `src/git_server.rs` |
| :--- | :--- |
| **`gix-packetline`** | Encodes and decodes the Git pkt-line wire format (`# service=git-upload-pack`, `want`/`have`/`done` negotiation, `side-band-64k` multiplexing, and `report-status`) via `StreamingPeekableIter` and `blocking_io::encode`. |
| **`gix-object`** | Serializes (`WriteTo`) and parses (`ObjectRef::from_loose`) Git `Blob`, `Tree`, `Commit`, and `Tag` objects for commit-graph traversal and pack verification. |
| **`gix-hash`** | Parses and formats 20-byte SHA-1 `ObjectId` digests and verifies/computes `PACK` v2 trailers via `gix_hash::hasher(Kind::Sha1)`. |
| **`gix-zlib`** | Compresses (`stream::deflate::Write`) and decompresses (`Inflate::once`) `PACK` v2 entries using pure-Rust `zlib-rs`. |
| **`gix-actor` & `gix-date`** | Constructs author/committer signatures and timestamps when seeding the initial commit (`README.md` on `refs/heads/main`). |
| **`gix-validate`** | Validates reference names (`refs/heads/*`, `refs/tags/*`) during `git push` (`gix_validate::reference::name`). |

---

## 2. Setup Instructions

### 2.1 Building and Deploying the GAS Git Server

#### Prerequisites
- Rust toolchain with the `wasm32-wasip2` target (`rustup target add wasm32-wasip2`)
- Node.js & `pnpm` (`pnpm install`)
- `@google/clasp` (for pushing and deploying to Google Apps Script)

#### Build & Deploy Steps
```bash
# 1. Compile Rust to wasm32-wasip2, transpile via jco, and bundle with Webpack
make build-pack

# 2. Push dist/ bundle and appsscript.json to Google Apps Script
make push

# 3. Deploy as a Web App (or via the GAS Editor: Deploy > New deployment > Web app)
pnpm exec clasp deploy --description "gitoxide Smart HTTP v1 Git Server"
```

Once deployed, GAS provides a Web App URL ending in `/exec`:
```text
https://script.google.com/macros/s/AKfycbxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx/exec
```

> **Automatic Initial Commit Seeding**:
> On the first request to a newly deployed repository (or when running `git_init_repo()` in the GAS editor), `gitoxide` automatically seeds an initial commit containing `README.md` on `refs/heads/main` (`HEAD -> refs/heads/main`) in `PropertiesService.getScriptProperties()`. This means `git ls-remote` and `git clone` work immediately after deployment!

---

### 2.2 Installing the Client-Side `git-remote-gas` Helper

Whenever Git encounters a remote URL prefixed with `gas::`, it automatically invokes the **`git-remote-gas`** executable on your `$PATH`.

```bash
# Option A: Install to ~/.local/bin (Recommended)
make install-git-remote-gas
export PATH="$HOME/.local/bin:$PATH"

# Option B: Add the repository's tools/ directory directly to PATH
export PATH="$(pwd)/tools:$PATH"
```

`git-remote-gas` uses only the Python 3 standard library and requires zero external `pip` packages.

---

## 3. Authentication & Login Configuration

Depending on your GAS Web App's access setting (`webapp.access` in `appsscript.json`), `git-remote-gas` supports the following authentication methods in priority order:

### Method 1: Automatic `@google/clasp` Credentials (`~/.clasprc.json`)
If you have already logged in via `npx @google/clasp login`, `git-remote-gas` automatically reads `~/.clasprc.json` and refreshes your OAuth 2.0 access token on the fly. No extra configuration is needed.

### Method 2: Environment Variable `GAS_GIT_TOKEN` or Saved Token
You can provide an OAuth 2.0 access token via environment variable or save it to `~/.config/gas-git/token.json`:
```bash
# Pass via environment variable
export GAS_GIT_TOKEN="$(gcloud auth print-access-token)"

# Or save to ~/.config/gas-git/token.json
git-remote-gas --save-token "$(gcloud auth print-access-token)"

# Or enable automatic gcloud invocation
export GAS_GIT_USE_GCLOUD=1
```

### Method 3: Browser Cookies (`GAS_GIT_COOKIE` / `GAS_GIT_COOKIE_FILE`)
```bash
export GAS_GIT_COOKIE="SID=...; HSID=...; SSID=..."
# Or specify a Netscape-format cookie file
export GAS_GIT_COOKIE_FILE="$HOME/.config/gas-git/cookies.txt"
```

### Method 4: Anonymous Web App Deployment (`ANYONE_ANONYMOUS`)
If you deploy the GAS Web App with **"Who has access: Anyone"**, no authentication token is required and `git-remote-gas` will handle the 302 redirects automatically.

---

## 4. Usage Examples (`gas::` URLs)

Prefix your GAS Web App URL with **`gas::`** to use standard Git commands:

### 4.1 `git ls-remote` (Inspect Remote References)
```bash
git ls-remote gas::https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec
```
Example output:
```text
c46e020074d6334b9332c3f2f6d6693f503e0b7b	HEAD
c46e020074d6334b9332c3f2f6d6693f503e0b7b	refs/heads/main
```

### 4.2 `git clone` (Clone Repository)
```bash
git clone gas::https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec my-gas-repo
cd my-gas-repo
cat README.md
```

### 4.3 `git push` (Commit and Push Changes)
```bash
echo "Hello from gitoxide on GAS!" > hello.txt
git add hello.txt
git commit -m "Add hello.txt"
git push origin main
```

### 4.4 `git fetch` & `git pull` (Fetch and Merge Updates)
```bash
git fetch origin
git pull origin main
```

---

## 5. Advanced Features

### 5.1 Multi-Repository Hosting on a Single GAS Deployment (`?repo=<name>`)
You can host multiple independent Git repositories on a single GAS Web App deployment by appending `?repo=<name>` to the URL:
```bash
git clone "gas::https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec?repo=frontend"
git clone "gas::https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec?repo=backend"
```

### 5.2 Automatic Google Drive Offloading for Large Objects (`GIT_DRIVE_FOLDER_ID`)
Because GAS `PropertiesService` enforces a 9 KB per-key limit, setting the **`GIT_DRIVE_FOLDER_ID`** script property to a Google Drive folder ID causes `GasGitStore` to automatically offload any Git object larger than 6 KB into `DriveApp` while storing a lightweight `drive:<file_id>` pointer in `PropertiesService`.

### 5.3 Running the End-to-End Test Suite (`make test-git-e2e`)
The repository includes an offline E2E test suite (`tools/test_gas_git_e2e.py`) that simulates GAS's exact `302 Found` redirect behavior on `GET` and `POST`, `/macros/echo` `GET`-only enforcement, and `accounts.google.com` login redirects, running real `git ls-remote`, `git clone`, `git push`, and `git pull` commands:

```bash
make test-git-e2e
# or
python3 ./tools/test_gas_git_e2e.py
```
