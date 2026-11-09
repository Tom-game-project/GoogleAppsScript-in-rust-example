# GAS Git Server — 技術資料 (アーキテクチャ・最適化・セキュリティ)

使い方は [README](../README.md) を参照してください。本書は内部構造・設計判断・ビルドパイプラインの解説です。
詳細なプロトコル/ストレージ解説は [`GAS_GIT_SERVER_JA.md`](GAS_GIT_SERVER_JA.md) / [`GAS_GIT_SERVER_EN.md`](GAS_GIT_SERVER_EN.md) にもあります。

## 概要

Rust (`wasm32-wasip2` WebAssembly Component) を Google Apps Script (GAS) の V8 ランタイム上で動作させるプロジェクトです。

- **`gitoxide` (`gix-*`) を用いた GAS Git Smart HTTP v1 サーバー実装** (`/<project_name>.git` の URL パスルーティング対応)
- **Google Drive (`DriveApp`) をデフォルトストレージとした複数 Git リポジトリ管理** (`GIT_DRIVE_FOLDER_ID` 内に複数の `<project_name>.git` を格納)
- **GAS オーバーヘッドを極小化する高速化実装** (オブジェクトの一括バンドル保存による Drive API 呼び出し回数削減、Wasm リニアメモリ内での純粋 Rust Base64 処理、Release + LTO 最適化コンパイル)
- **Gleam + Lustre (MVU) によるブラウザ Web UI** (`web/src/gas_git_ui/`)
- **Python 製クライアントヘルパー `git-remote-gas`** (`gas::` プレフィックス)

### 処理の流れ

```text
git ──(gas:: remote helper)──► tools/git-remote-gas ──HTTPS──► GAS doGet/doPost (main.ts)
                                                                   │ JSON.stringify(e)
                                                                   ▼
                                       target/jco/*.js (jco 生成グルー) ──► Rust Wasm Component
                                                                   │ WIT import
                                                                   ▼
                                       js/*.ts (ホスト実装: DriveApp / CacheService / LockService …)
```

---

## ビルドパイプライン

```text
Gleam sources ──► dist/index.html ─────────────────────────────┐
Rust + WIT ──► *.wasm ──► target/jco/*.js ─┬─► dist/main.js ───┼─► make build-pack ─► clasp push
                                           └─► tsc --noEmit ───┤
appsscript.json ──► dist/appsscript.json ──────────────────────┘
```

- `Makefile` の各ターゲットは実ファイルで、前提条件はワイルドカードを使わず全ファイルを明示しています。ソース変更が無ければ 2 回目の `make` は何もしません（以前は `build-pack` が毎回 webpack を再実行していました）。
- 独立したブランチ（cargo / gleam / tsc / webpack）は GNU make 4 以上で自動的に並列実行されます（`make -j1` で無効化）。
- `dist/index.html` は Wasm に `include_str!` で埋め込まず、`clasp push` で GAS の HTML ファイル `index` としてアップロードし、実行時に `HtmlService.createHtmlOutputFromFile("index")` で読み込みます。
  - Wasm が約 95 KB 小さくなり（= 毎リクエストの Base64 デコードと `WebAssembly.Module` コンパイルが軽くなる）、UI の変更で Rust の fat LTO 再リンクが走らなくなりました。
- jco の `--map` はホスト実装を `../../js/*.ts` から直接参照するため、`target/jco` へのコピーは不要です。
- webpack は `ts-loader` の `transpileOnly` を使用し、型検査は `tsc --noEmit` を並列ステップで 1 回だけ実行します（型エラーは従来どおりビルド失敗になります）。webpack の filesystem キャッシュは `gas-webpack-plugin` の依存がシリアライズできず効かないため使用していません。
- webpack / cargo は内容が同じだと出力ファイルを書き換えないため、Makefile で `touch` してタイムスタンプを揃えています（これが無いと毎回再実行＝relink されます）。
- cargo は `--locked`、`make setup` は `pnpm install --frozen-lockfile` を使用し、ロックファイル通りの依存のみでビルドします。

### 計測値 (16 コア Linux, release)

| シナリオ | 変更前 | 変更後 |
| :--- | ---: | ---: |
| 変更なしで `make` | 9.6 s | 0.01 s |
| Gleam (UI) を変更 | ~20 s (Rust 再リンク + jco + webpack) | 2.3 s |
| `main.ts` を変更 | ~10 s | 6.9 s |
| Rust を変更 | ~20 s | 14.8 s |

| 成果物 | 変更前 | 変更後 |
| :--- | ---: | ---: |
| `*.wasm` | 868 KB | 774 KB |
| `dist/main.js` | 1,630 KB | 1,487 KB |

### さらに高速化・小型化する場合の選択肢（未適用）

| 選択肢 | 効果 | 採用しなかった理由 |
| :--- | :--- | :--- |
| `opt-level = "z"` | Wasm -4% (868→834 KB) | inflate / deflate / SHA-1 のループ最適化が弱まり push/clone の CPU 時間が増える。GAS は 6 分制限があるため `"s"` を維持 |
| Babel のターゲットを ES2020 にし JSBI 変換を外す | バンドル縮小・BigInt の高速化・ビルド短縮 | GAS V8 はネイティブ BigInt を持つが、実機での検証が必要なため保留 (`babel.config.json`) |
| `wasm-tools strip` で `component-name` セクション (約 19 KB) を除去 | Wasm -2.5% | jco 出力への影響を実機で検証できていないため保留 |
| 開発中は `make BUILD=debug` | Rust の LTO を省略し反復を高速化 | 既存機能。成果物は大きく遅いので配布には使わない |

---

## セキュリティ対策

| 箇所 | 対策 |
| :--- | :--- |
| PACK / delta 解析 (`unpack_pack_v2`, `apply_git_delta`) | 範囲外読み出し・整数オーバーフロー・可変長整数のシフト溢れをすべてエラー化（以前は panic → Wasm trap）。オブジェクト/delta 結果サイズを 64 MiB に制限し、ヘッダ値による巨大確保を防止。宣言サイズより短い zlib ストリームは拒否（以前は 0 埋め） |
| `git-receive-pack` | LockService の取得失敗時は push を拒否（以前は無視して続行）し RAII で確実に解放。ref 更新は `git receive-pack` と同じ厳密な compare-and-swap（作成時に既存 ref があれば拒否）。`refs/` 以外の更新拒否、新しい tip オブジェクトの存在確認、広告していた `atomic` を実装。`refs.json` 書き込みは 1 push 1 回 |
| Web UI / ブラウザ表示 | `X-Frame-Options` を `ALLOWALL` から既定値に変更（クリックジャッキング対策） |
| `GET ?action=create_repo` | 廃止（`<img src>` 等による CSRF でリポジトリが作成できた）。UI は `google.script.run` / POST を使用 |
| `per_page` | 上限 500 |
| `wasi_showcase_example` | スクリプトプロパティ（秘密情報を含み得る）の値をログに出さない |
| `git-remote-gas` | Bearer トークン / Cookie はリダイレクト先が設定したオリジンか `https://*.google.com` の場合のみ送信（Cookie は `https://*.googleusercontent.com` にも送信）。任意ホストや平文 HTTP への漏洩を防止。認証キャッシュは最初から `0600` で作成 |

Web アプリは `appsscript.json` で `"access": "MYSELF"` としているため、デプロイしたユーザー以外はアクセスできません。公開範囲を広げる場合は、push などの書き込み操作が誰でも行えるようになる点に注意してください。

---

## GAS 上のオーバーヘッドを削減する主な最適化

1. **Google Drive API 呼び出しの一括バンドル化**:
   - 本物の Git のように「Git オブジェクト 1 個ごとに `DriveApp.createFile` を 1 回呼ぶ」方式は採りません。push された PACK のオブジェクト群を種類別に `bundle_commit_<pack-sha1>.json`（Commit / Tag）、`bundle_meta_<pack-sha1>.json`（Tree と Blob サイズ表）、`bundle_blob_<pack-sha1>.json`（Blob）へまとめて保存します。各種別は 4 MB ごとに `_1`, `_2`, … へ分割されます。
   - Drive への書き込み回数はオブジェクト数ではなくバンドル数（通常は数回）で決まるので、数百オブジェクトの push でもタイムアウトやレート制限にかかりにくくなります。
   - 種別ごとに分けているため、コミット履歴の表示は `bundle_commit` だけ、ディレクトリ一覧は `bundle_meta` まで読めば済みます。Blob バンドルは中身が必要なときだけ開きます。
   - 各オブジェクトは 128 バイト以上で圧縮が効く場合に `z:<非圧縮サイズ>:<Base64>` として zlib 圧縮されます。
   - 保存形式とキャッシュの詳細は [`GAS_GIT_SERVER_JA.md` の 1.2〜1.4](GAS_GIT_SERVER_JA.md#12-google-drive-上の保存形式) を参照してください。
2. **純粋 Rust によるリニアメモリ内 Base64 処理**:
   - `gas:utilities` 経由のホスト（JS）呼び出しや `Array.from` によるヒープアロケーションを排除し、Wasm リニアメモリ内の `base64::engine::general_purpose::STANDARD` で高速処理します。
3. **コンパイラ最適化とリリースプロファイル (`Cargo.toml`, `Makefile`)**:
   - `Makefile` のデフォルトビルドを `BUILD ?= release` に設定。
   - `Cargo.toml` に `[profile.release]`（`opt-level = "s"`, `lto = "fat"`, `codegen-units = 1`, `panic = "abort"`, `strip = "symbols"`）を追加し、Wasm バイナリサイズを削減して GAS V8 ランタイム上でのロード・実行速度を最大化しました。

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
