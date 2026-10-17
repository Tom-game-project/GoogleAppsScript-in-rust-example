# GoogleAppsScript-in-rust-example (with `gitoxide` GAS Git Server, Google Drive Storage & Gleam/Lustre Web UI)

Rust (`wasm32-wasip2` WebAssembly Component) を Google Apps Script (GAS) の V8 ランタイム上で動作させるプロジェクトです。
- **`gitoxide` (`gix-*`) を用いた GAS Git Smart HTTP v1 サーバー実装** (`/<project_name>.git` の URL パスルーティング対応)
- **Google Drive (`DriveApp`) をデフォルトストレージとした複数 Git リポジトリ管理** (`GIT_DRIVE_FOLDER_ID` 内に複数の `<project_name>.git` を格納)
- **GAS オーバーヘッドを極小化する高速化実装** (オブジェクトの一括バンドル保存による Drive API 呼び出し回数 98% 削減、Wasm リニアメモリ内での純粋 Rust Base64 処理、Release + LTO 最適化コンパイル)
- **Gleam + Lustre (MVU) によるブラウザ Web UI** (`web/src/gas_git_ui/` — 既存 Git プロジェクト一覧の把握・空リポジトリの新規作成)
- **Python 製クライアントヘルパー `git-remote-gas` (`gas::` プレフィックス、デフォルトタイムアウト300秒 / `GAS_GIT_TIMEOUT` 対応)**

---

## Git Server on Google Apps Script (`gitoxide` + `git-remote-gas` + Gleam/Lustre Web UI)

詳細なドキュメントは以下を参照してください（日本語・英語）：
- **日本語ドキュメント**: [`docs/GAS_GIT_SERVER_JA.md`](docs/GAS_GIT_SERVER_JA.md)
- **English Documentation**: [`docs/GAS_GIT_SERVER_EN.md`](docs/GAS_GIT_SERVER_EN.md)

### 環境変数（GAS スクリプトプロパティ & クライアント設定）

#### 1. サーバー側（GAS スクリプトプロパティ）
`wasi:cli/environment` (`js/wasi-cli.ts`) を通じて GAS のスクリプトプロパティ (`PropertiesService.getScriptProperties()`) が Rust Wasm 側の環境変数 (`std::env::var`) として渡されます。

| 環境変数名（スクリプトプロパティ） | 必須/任意 | 説明 |
| :--- | :---: | :--- |
| **`GIT_DRIVE_FOLDER_ID`** | **必須** | Git リポジトリ群 (`<project_name>.git` サブフォルダ) を格納する Google Drive フォルダーの ID (`https://drive.google.com/drive/folders/<FOLDER_ID>` の `<FOLDER_ID>` 部分) |
| **`GAS_WEB_APP_URL`** | 任意 | デプロイ済み GAS Web アプリの `/exec` URL (`https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec`)。Web UI 上でリモート URL コマンド例を表示する際に使用 |

#### 2. クライアント側 (`git-remote-gas`)
| 環境変数名 | 必須/任意 | デフォルト値 | 説明 |
| :--- | :---: | :---: | :--- |
| **`GAS_GIT_TIMEOUT`** | 任意 | `300` (秒) | HTTP タイムアウト秒数（デフォルト 300秒 = 5分）。大容量プッシュ時に `export GAS_GIT_TIMEOUT=600` などで延長可能 |
| **`GAS_GIT_TOKEN`** | 任意 | なし | OAuth 2.0 Bearer トークン。未設定時は `~/.clasprc.json` 等から自動取得 |

### クイックスタート / Quick Start

```bash
# 1. git-remote-gas を PATH に追加 (または make install-git-remote-gas)
export PATH="$(pwd)/tools:$PATH"

# 2. ローカル E2E テストで Web UI リポジトリ作成 & git remote add / push / clone / pull の動作を確認
make test-git-e2e

# 3. ブラウザで GAS Web アプリ URL (https://script.google.com/macros/s/<ID>/exec) を開き、
#    Gleam + Lustre Web UI から新しい空リポジトリ (例: project_name.git) を作成

# 4. ローカルの Git リポジトリからリモートを追加して push (`gas::` プレフィックス + `/project_name.git`)
git init
git remote add origin gas::https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec/project_name.git
git add .
git commit -m "first commit"
git branch -M main
git push -u origin main
```

---

## GAS 上のオーバーヘッドを削減する主な最適化

1. **Google Drive API 呼び出しの一括バンドル化 (I/O 98% 削減)**:
   - 従来の「Git オブジェクト1個ごとに `DriveApp.createFile` を1回呼ぶ」方式を廃止し、プッシュされた PACK のオブジェクト群を1つの `bundle_<hash>.json` にまとめて Google Drive へ保存します。
   - 100〜200個のオブジェクトがあるプッシュでも、Drive API 呼び出しが従来の 150 回（75秒以上）から **2回（約1秒）** へ激減し、タイムアウトやレート制限を回避します。
2. **純粋 Rust によるリニアメモリ内 Base64 処理**:
   - `gas:utilities` 経由のホスト（JS）呼び出しや `Array.from` によるヒープアロケーションを排除し、Wasm リニアメモリ内の `base64::engine::general_purpose::STANDARD` で高速処理します。
3. **コンパイラ最適化とリリースプロファイル (`Cargo.toml`, `Makefile`)**:
   - `Makefile` のデフォルトビルドを `BUILD ?= release` に設定。
   - `Cargo.toml` に `[profile.release]`（`opt-level = 3`, `lto = "fat"`, `codegen-units = 1`, `panic = "abort"`, `strip = "symbols"`）を追加し、Wasm バイナリサイズを削減して GAS V8 ランタイム上でのロード・実行速度を最大化しました。

---

## 収録されている Google Apps Script WIT パッケージ一覧 (`wit/deps/`)

| パッケージ名 | ディレクトリ | 対応する Google Apps Script API |
| :--- | :--- | :--- |
| `gas:logger@0.1.0-alpha` | `google-apps-script-logger-0.1.0-alpha` | `Logger` (`log`, `clear`, `getLog`) |
| `gas:drive-app@0.1.0-alpha` | `google-apps-script-driveapp-0.1.0-alpha` | `DriveApp`, `File`, `Folder`, `Blob`, `User`, `FileIterator`, `FolderIterator` |
| `gas:property@0.1.0-alpha` | `google-apps-script-property-0.1.0-alpha` | `PropertiesService` (`ScriptProperties`, `UserProperties`, `DocumentProperties`) |
| `gas:spreadsheet-app@0.1.0-alpha` | `google-apps-script-spreadsheetapp-0.1.0-alpha` | `SpreadsheetApp`, `Spreadsheet`, `Sheet`, `Range` |
| `gas:content-service@0.1.0-alpha` | `google-apps-script-contentservice-0.1.0-alpha` | `ContentService`, `TextOutput`, `MimeType` |
| `gas:urlfetchapp@0.1.0-alpha` | `google-apps-script-urlfetchapp-0.1.0-alpha` | `UrlFetchApp`, `HTTPResponse` (`fetch`, `fetchAll`, `getRequest`) |
| `gas:utilities@0.1.0-alpha` | `google-apps-script-utilities-0.1.0-alpha` | `Utilities` (Base64, SHA/MD5/HMAC/RSA 署名, UUID, Gzip/Zip, CSV, `sleep`, `formatDate`) |
| `gas:html-service@0.1.0-alpha` | `google-apps-script-htmlservice-0.1.0-alpha` | `HtmlService`, `HtmlOutput`, `HtmlTemplate`, `HtmlOutputMetaTag` |
| `gas:cache-service@0.1.0-alpha` | `google-apps-script-cacheservice-0.1.0-alpha` | `CacheService`, `Cache` (`get`, `put`, `getAll`, `putAll`, `remove`, `removeAll`) |
| `gas:lock-service@0.1.0-alpha` | `google-apps-script-lockservice-0.1.0-alpha` | `LockService`, `Lock` (`tryLock`, `waitLock`, `hasLock`, `releaseLock`) |
| `gas:session@0.1.0-alpha` | `google-apps-script-session-0.1.0-alpha` | `Session` (`getActiveUser`, `getEffectiveUser`, `getScriptTimeZone`, `getActiveUserLocale`) |
| `gas:mail-app@0.1.0-alpha` | `google-apps-script-mailapp-0.1.0-alpha` | `MailApp` (`sendEmail`, `getRemainingDailyQuota`) |
| `gas:gmail-app@0.1.0-alpha` | `google-apps-script-gmailapp-0.1.0-alpha` | `GmailApp`, `GmailThread`, `GmailMessage`, `GmailDraft`, `GmailLabel` |
| `gas:calendar-app@0.1.0-alpha` | `google-apps-script-calendarapp-0.1.0-alpha` | `CalendarApp`, `Calendar`, `CalendarEvent`, `EventGuest` |
| `gas:document-app@0.1.0-alpha` | `google-apps-script-documentapp-0.1.0-alpha` | `DocumentApp`, `Document`, `Body`, `Paragraph`, `Table`, `TableRow`, `TableCell`, `Text` |
| `gas:script-app@0.1.0-alpha` | `google-apps-script-scriptapp-0.1.0-alpha` | `ScriptApp`, `Trigger`, `AuthorizationInfo` (`getOAuthToken`, `getScriptId` 等) |
| `gas:math@0.1.0-alpha` | `math-0.1.0-alpha` | `Math.random`, 乱数バイト生成 |

---

## 公式 WASI プロポーザル (`wit/deps/wasi-*`) の対応状況

| WASI パッケージ (`wit/deps/`) | インターフェース | GAS での対応状況 | 実装ファイル (`js/`) & 備考 |
| :--- | :--- | :---: | :--- |
| **`wasi:random@0.3.2`** (`wasi-random`) | `random`, `insecure`, `insecure-seed` | **実装済** | `js/wasi-random.ts` — `Utilities.getUuid()` + `Utilities.computeDigest(SHA_256)` による暗号論的擬似乱数生成および `Math.random()` |
| **`wasi:clocks@0.3.2`** (`wasi-clocks`) | `types`, `system-clock`, `timezone` | **実装済** | `js/wasi-clocks.ts` / `js/wasi-wall-clock.ts` — `Date.now()`、`Session.getScriptTimeZone()`、`Utilities.formatDate()` による実タイムゾーン・UTCオフセット計算 |
| **`wasi:clocks@0.3.2`** (`wasi-clocks`) | `monotonic-clock` (`now`, `get-resolution`) | **実装済 (同期部)** | `js/wasi-monotonic-clock.ts` — 非減少モノトニック時刻を提供。非同期タイマー待機 (`wait-for`, `wait-until`) は `WasiNotImplementedError` |
| **`wasi:cli@0.3.2`** (`wasi-cli`) | `environment`, `exit`, `terminal-*` | **実装済** | `js/wasi-cli.ts` — `PropertiesService.getScriptProperties()` を環境変数 (`GIT_DRIVE_FOLDER_ID` 等) として提供。Rust 標準の `println!` / `eprintln!` は WASI 0.2 `getStdout`/`getStderr` (`js/wasi-io.ts`) 経由で `Logger.log` / `console.error` に出力 |
| **`wasi:logging`** (`wasi-logging-0.1.0-draft`) | `logging` | **実装済** | `js/log-host.ts` — レベル別に `console.debug` / `info` / `warn` / `error` へ出力 |
| **`wasi:filesystem@0.3.2`** (`wasi-filesystem`) | `types`, `preopens` | **未実装通知** | `js/wasi-filesystem.ts` — GAS にはローカル POSIX ファイルシステムが存在しないため `WasiNotImplementedError` を送出（`gas:drive-app` の利用を案内） |
| **`wasi:sockets@0.3.2`** (`wasi-sockets`) | `types`, `ip-name-lookup` | **未実装通知** | `js/wasi-sockets.ts` — GAS は生の TCP/UDP ソケット・直接 DNS 解決を提供しないため `WasiNotImplementedError` を送出 |
| **`wasi:http@0.3.2`** (`wasi-http`) | `types`, `client`, `handler` | **未実装通知** | `js/wasi-http.ts` — 非同期ストリーム `stream<u8>` 前提のため `WasiNotImplementedError` を送出（`gas:urlfetchapp` / `gas:content-service` の利用を案内） |
