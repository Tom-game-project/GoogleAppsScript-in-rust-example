# Google Apps Script (GAS) Git Server with `gitoxide`, Google Drive & Gleam/Lustre Web UI — English Guide

This guide explains how to run a **Git Smart HTTP v1 Server** on Google Apps Script (GAS) powered by a Rust WebAssembly Component (`wasm32-wasip2`) and **`gitoxide` (`gix-*`)**, using **Google Drive (`DriveApp`) as the default multi-project storage backend**, a **Gleam + Lustre browser Web UI**, and the Python client-side Git remote helper **`git-remote-gas`** (`gas::` URL prefix).

---

## 1. Architecture Overview

### 1.1 GitHub-Style URL Path Routing (`.../exec/<project_name>.git`)
Modeled after GitHub's repository URLs (`https://github.com/username/project_name.git`) without the `username` segment, each repository is addressed by appending `/<project_name>.git` to the GAS Web App `/exec` URL:

```bash
git remote add origin gas::https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec/project_name.git
```

Both the Rust server (`parse_git_path` in `src/git_server.rs`) and the client helper (`parse_gas_remote_url` in `tools/git-remote-gas`) parse the URL path and route requests to:
- `GET  /<project_name>.git/info/refs?service=git-upload-pack` (`git ls-remote`, `git clone`, `git fetch`, `git pull`)
- `GET  /<project_name>.git/info/refs?service=git-receive-pack` (`git push` reference discovery)
- `POST /<project_name>.git/git-upload-pack` (packfile negotiation and transfer)
- `POST /<project_name>.git/git-receive-pack` (packfile unpacking and reference updates)
- `GET  /` or `GET /<project_name>.git` (renders the Gleam + Lustre Web UI when accessed from a browser)

### 1.2 Google Drive Storage by Default (Multi-Project Folder Layout)
All repositories are stored by default inside the Google Drive folder specified by the **`GIT_DRIVE_FOLDER_ID`** environment variable (GAS Script Property). Multiple Git projects live side by side inside that folder as `<project_name>.git` subfolders:

```text
<Google Drive Folder (GIT_DRIVE_FOLDER_ID)>/
├── project-alpha.git/
│   ├── HEAD                 ("ref: refs/heads/main\n")
│   ├── refs.json            ({"refs/heads/main": "<sha1-hex>", ...})
│   └── objects/
│       ├── <sha1-hex>       (base64-encoded loose Git object `<kind> <size>\0<body>`)
│       └── ...
├── project-beta.git/
│   ├── HEAD
│   ├── refs.json
│   └── objects/
└── ...
```

### 1.3 No Automatic Initial Commit & Gleam + Lustre Browser Web UI (`web/`)
- **No Unwanted Initial Commits**: The server never fabricates an automatic initial commit behind your back. Newly created repositories start completely empty (`0` commits, unborn `HEAD -> refs/heads/main`), so you can immediately run `git remote add origin ...` and `git push -u origin main` from any local repository without non-fast-forward conflicts.
- **Gleam + Lustre Web UI (`web/src/gas_git_ui.gleam`)**:
  - Opening `https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec` in a browser serves a GitHub-like minimal Web UI implemented in **Gleam + Lustre**.
  - **Pure Elm Architecture (MVU)**: Uses `lustre.application(init, update, view)` and `lustre/effect.from` without impure side-effecting `event.emit` patterns.
  - **Zero npm Frontend Dependencies**: Built purely with Gleam (`target = "javascript"`) and Lustre.
  - **Core Browser Capabilities**:
    1. View all existing Git projects inside the configured Google Drive folder (`GIT_DRIVE_FOLDER_ID`), including repository status, `HEAD` branch/commit, and remote URLs.
    2. Create new empty Git repositories (`<project_name>.git`) in Google Drive and view copy-pasteable `git init` / `git remote add origin` / `git push -u origin main` quick-setup commands.

---

## 2. Environment Variables (GAS Script Properties & Client Variables)

### 2.1 Server-Side Environment Variables (GAS Script Properties via `wasi:cli/environment`)

In this repository, `wasi:cli/environment` (`js/wasi-cli.ts`) maps **Google Apps Script's `PropertiesService.getScriptProperties()`** directly to WASI environment variables (`std::env::var`) inside the Rust Wasm component.

| Environment Variable (Script Property Key) | Required | Example Value | Description |
| :--- | :---: | :--- | :--- |
| **`GIT_DRIVE_FOLDER_ID`** | **Required** | `1a2b3c4d5e6f7g8h9i0j...` | The Google Drive Folder ID where multiple Git repositories (`<project_name>.git` subfolders) are stored. Extract this ID from `https://drive.google.com/drive/folders/<FOLDER_ID>`. |
| **`GAS_WEB_APP_URL`** | Optional | `https://script.google.com/macros/s/<ID>/exec` | The deployed GAS Web App `/exec` URL. Used by the Web UI to display exact `git remote add origin gas::...` commands when rendered inside GAS's `googleusercontent.com` iframe. |

#### How to Configure `GIT_DRIVE_FOLDER_ID` in Google Apps Script
1. Open Google Drive in your browser, create or open the folder where you want to store your Git repositories, and copy `<FOLDER_ID>` from the URL `https://drive.google.com/drive/folders/<FOLDER_ID>`.
2. Open your Google Apps Script project in the browser and navigate to **Project Settings (gear icon) > Script Properties**.
3. Click **Add script property** and set:
   - **Property**: `GIT_DRIVE_FOLDER_ID`
   - **Value**: `<FOLDER_ID>`
4. Save the script properties.

### 2.2 Client-Side Environment Variables (`git-remote-gas`)

| Environment Variable | Required | Default | Description |
| :--- | :---: | :---: | :--- |
| **`GAS_GIT_TIMEOUT`** | Optional | `300` (sec) | HTTP request timeout in seconds (**default: 300s = 5 minutes**). Accommodates Google Apps Script and Google Drive processing times. Increase via `export GAS_GIT_TIMEOUT=600` (10 minutes) for large repositories, or set `export GAS_GIT_TIMEOUT=0` to disable timeouts entirely. |
| **`GAS_GIT_TOKEN`** | Optional | None | OAuth 2.0 Bearer access token for authenticated GAS Web Apps (e.g., `export GAS_GIT_TOKEN="$(gcloud auth print-access-token)"`). If unset, `git-remote-gas` automatically tries anonymous access, cached credentials, and `~/.clasprc.json`. |
| **`GAS_GIT_COOKIE`** | Optional | None | Browser session cookie (`SID=...; HSID=...`) if using cookie authentication instead of OAuth tokens. |

---

## 3. Build, Deploy, and Usage

### 3.1 Build and Deploy to GAS
```bash
# 1. Build Gleam + Lustre Web UI (if gleam is installed), compile Rust to wasm32-wasip2, transpile via jco, and bundle with Webpack
make build-pack

# 2. Push dist/ bundle and appsscript.json to Google Apps Script
make push

# 3. Deploy as a Web App
pnpm exec clasp deploy --description "gitoxide Smart HTTP v1 Git Server on Google Drive"
```

### 3.2 Create a Repository from the Browser Web UI
1. Open `https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec` in your browser.
2. Under **Create a new repository**, enter a project name (e.g. `my-project`) and optional description, then click **Create repository**.
3. The server creates an empty `<GIT_DRIVE_FOLDER_ID>/my-project.git` folder in Google Drive and displays the quick-setup commands.

### 3.3 Push and Clone Using `git-remote-gas`
```bash
# 1. Install or update git-remote-gas (default timeout 300s)
make install-git-remote-gas

# 2. (Optional) Increase timeout for large repositories
export GAS_GIT_TIMEOUT=600

# 3. Initialize a local repository, add the GAS remote with /my-project.git, and push
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
