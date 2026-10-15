# GoogleAppsScript-in-rust-example (with `gitoxide` GAS Git Server & WASI 0.3.2)

Rust (`wasm32-wasip2` WebAssembly Component) を Google Apps Script (GAS) の V8 ランタイム上で動作させるテンプレート＆実装プロジェクトです。
**`gitoxide` (`gix-*`) を用いた GAS Git Smart HTTP v1 サーバー実装** と、GAS 特有の 302 リダイレクト・ログイン認証を処理する Python 製クライアントヘルパー **`git-remote-gas` (`gas::` プレフィックス)** を備えています。

---

## Git Server on Google Apps Script (`gitoxide` + `git-remote-gas`)

詳細なドキュメントは以下を参照してください（日本語・英語）：
- **日本語ドキュメント**: [`docs/GAS_GIT_SERVER_JA.md`](docs/GAS_GIT_SERVER_JA.md)
- **English Documentation**: [`docs/GAS_GIT_SERVER_EN.md`](docs/GAS_GIT_SERVER_EN.md)

### クイックスタート / Quick Start

```bash
# 1. git-remote-gas を PATH に追加 (または make install-git-remote-gas)
export PATH="$(pwd)/tools:$PATH"

# 2. ローカル E2E テストで git ls-remote / clone / push / pull の動作を確認
make test-git-e2e

# 3. デプロイ済み GAS Web アプリに対して git コマンドを実行 (`gas::` プレフィックス)
git ls-remote gas::https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec
git clone gas::https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec my-gas-repo
```

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

`wit/deps/wasi-*` には公式 WASI プロポーザル (`0.3.2`) の WIT 定義ファイルをそのまま収録しており、Google Apps Script の同期 V8 ランタイム上で再現可能な機能は実装し、GAS のランタイム制約により再現不可能な機能は呼び出し時に明確な `WasiNotImplementedError` を送出します。

| WASI パッケージ (`wit/deps/`) | インターフェース | GAS での対応状況 | 実装ファイル (`js/`) & 備考 |
| :--- | :--- | :---: | :--- |
| **`wasi:random@0.3.2`** (`wasi-random`) | `random`, `insecure`, `insecure-seed` | **実装済** | `js/wasi-random.ts` — `Utilities.getUuid()` + `Utilities.computeDigest(SHA_256)` による暗号論的擬似乱数生成および `Math.random()` |
| **`wasi:clocks@0.3.2`** (`wasi-clocks`) | `types`, `system-clock`, `timezone` | **実装済** | `js/wasi-clocks.ts` / `js/wasi-wall-clock.ts` — `Date.now()`、`Session.getScriptTimeZone()`、`Utilities.formatDate()` による実タイムゾーン・UTCオフセット計算 |
| **`wasi:clocks@0.3.2`** (`wasi-clocks`) | `monotonic-clock` (`now`, `get-resolution`) | **実装済 (同期部)** | `js/wasi-monotonic-clock.ts` — 非減少モノトニック時刻を提供。非同期タイマー待機 (`wait-for`, `wait-until`) は `WasiNotImplementedError` |
| **`wasi:cli@0.3.2`** (`wasi-cli`) | `environment`, `exit`, `terminal-*` | **実装済** | `js/wasi-cli.ts` — `PropertiesService.getScriptProperties()` を環境変数として提供。Rust 標準の `println!` / `eprintln!` は WASI 0.2 `getStdout`/`getStderr` (`js/wasi-io.ts`) 経由で `Logger.log` / `console.error` に出力 |
| **`wasi:logging`** (`wasi-logging-0.1.0-draft`) | `logging` | **実装済** | `js/log-host.ts` — レベル別に `console.debug` / `info` / `warn` / `error` へ出力 |
| **`wasi:filesystem@0.3.2`** (`wasi-filesystem`) | `types`, `preopens` | **未実装通知** | `js/wasi-filesystem.ts` — GAS にはローカル POSIX ファイルシステムが存在しないため `WasiNotImplementedError` を送出（`gas:drive-app` の利用を案内） |
| **`wasi:sockets@0.3.2`** (`wasi-sockets`) | `types`, `ip-name-lookup` | **未実装通知** | `js/wasi-sockets.ts` — GAS は生の TCP/UDP ソケット・直接 DNS 解決を提供しないため `WasiNotImplementedError` を送出 |
| **`wasi:http@0.3.2`** (`wasi-http`) | `types`, `client`, `handler` | **未実装通知** | `js/wasi-http.ts` — 非同期ストリーム `stream<u8>` 前提のため `WasiNotImplementedError` を送出（`gas:urlfetchapp` / `gas:content-service` の利用を案内） |
