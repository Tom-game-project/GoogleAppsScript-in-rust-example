# Google Apps Script (GAS) Git Server with `gitoxide`, Google Drive & Gleam/Lustre Web UI — 日本語ガイド

本ドキュメントでは、Rust (`wasm32-wasip2` WebAssembly Component) と **`gitoxide` (`gix-*`)** を用いて Google Apps Script (GAS) を **Git Smart HTTP v1 サーバー** として動作させる仕組みを解説します。対象は、Google Drive 上の保存形式、URL ルーティング、**Gleam + Lustre で構築されたブラウザ Web UI**、Python 製 Git リモートヘルパー **`git-remote-gas`** (`gas::` プレフィックス) です。

セットアップ手順は [README](../README.md)、ビルドパイプラインとセキュリティ対策は [ARCHITECTURE.md](ARCHITECTURE.md) を参照してください。

---

## 1. システム構成と仕組み

### 1.1 GitHub ライクな URL パスルーティング (`.../exec/<project_name>.git`)
GitHub のリポジトリ URL (`https://github.com/username/project_name.git`) を参考にしています。GAS サーバーは単一ユーザーのデプロイメントなので `username` を省略し、`/exec` URL の末尾に `<project_name>.git` を付ける形式です。

```bash
git remote add origin gas::https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec/project_name.git
```

サーバー側 (`src/git_server.rs` の `parse_git_path`) とクライアント側 (`tools/git-remote-gas` の `parse_gas_remote_url`) が URL パスを解析し、以下へルーティングします。

| メソッドとパス (`/exec` 以降) | 用途 |
| :--- | :--- |
| `GET  /<project>.git/info/refs?service=git-upload-pack` | `git ls-remote` / `clone` / `fetch` / `pull` の参照広告 |
| `GET  /<project>.git/info/refs?service=git-receive-pack` | `git push` 時の参照広告 |
| `POST /<project>.git/git-upload-pack` | PACK の交渉・送信 |
| `POST /<project>.git/git-receive-pack` | PACK の展開・参照更新 |
| `GET  /` | Gleam + Lustre Web UI |
| `GET  /<project>.git` | コミット一覧 (`?page=N`, `?per_page=N`、最大 500) |
| `GET  /<project>.git/<commit>` | そのコミットのルートディレクトリ一覧（短縮ハッシュ可） |
| `GET  /<project>.git/<commit>/<path>` | ディレクトリ一覧、またはファイルの生データ（バイナリはダウンロード） |
| `GET  ?action=list_repos` / `get_commits` / `get_commit_detail` | Web UI 用 JSON API（読み取り専用） |
| `POST ?action=create_repo` | 空リポジトリの作成（**GET では受け付けません**。CSRF 対策） |

`/exec` 直下にコミットハッシュを置く形式 (`/exec/<commit>`) は受け付けません。必ず `/<project>.git` を先頭に置いてください。

GAS の `doGet` / `doPost` はテキストしか返せないため、Git のバイナリ応答は Base64 文字列で返します（`format=json` の場合は `body_base64` フィールドを持つ JSON）。`git-remote-gas` はリクエスト本文を `{"service": ..., "git_path": ..., "body_base64": ...}` の JSON エンベロープで送ります。

### 1.2 Google Drive 上の保存形式

本サーバーは **Google Drive (`DriveApp`) への保存をデフォルト** としています。
スクリプトプロパティ **`GIT_DRIVE_FOLDER_ID`** に登録した Google Drive フォルダーの直下に、各 Git プロジェクトが `<project_name>.git` フォルダーとして格納されます。

GAS で最もコストが高いのは Drive API の呼び出しです（1 回あたり数百 ms）。そこで、Git オブジェクトを 1 個ずつファイルにせず、**1 回の push で受け取った PACK の中身を種類別に数個の JSON ファイル（バンドル）へまとめて保存** します。

```text
<Google Drive Folder (GIT_DRIVE_FOLDER_ID)>/
├── project-alpha.git/
│   ├── HEAD                  "ref: refs/heads/main\n"
│   ├── refs.json             {"refs/heads/main": "<sha1-hex>", ...}
│   ├── commits_cache.json    コミット一覧の永続索引（1.3 参照）
│   └── objects/
│       ├── bundle_commit_<pack-sha1>.json   Commit / Tag オブジェクトのみ
│       ├── bundle_meta_<pack-sha1>.json     Tree オブジェクト + Blob のサイズ表
│       ├── bundle_blob_<pack-sha1>.json     Blob（ファイル内容）
│       ├── bundle_blob_<pack-sha1>_1.json   …4 MB を超えると _1, _2, … に分割
│       └── ...
├── project-beta.git/
└── ...
```

- **`<pack-sha1>`**: push された PACK の末尾チェックサム (SHA-1) です。同じ PACK を再送しても同じ名前になります。
- **バンドルの中身**: `{"<オブジェクトの sha1>": "<格納文字列>", ...}` という JSON オブジェクトです。
- **格納文字列**: Git の loose オブジェクト形式 `<kind> <size>\0<body>` をエンコードした文字列で、次のどちらかです。
  - `z:<非圧縮サイズ>:<Base64>`: 128 バイト以上で zlib 圧縮が効く場合。テキスト中心のリポジトリでは 5〜10 分の 1 程度になります。
  - `<Base64>`: 上記以外（圧縮なし）。
- **Blob のサイズ表**: `bundle_meta_*` には `"__sz__:<blob の sha1>": "<バイト数>"` というエントリも入ります。ディレクトリ一覧はファイルサイズを表示するため、この表があれば Blob バンドルを開かずに済みます。
- **分割**: 各種別のバンドルは JSON が 4 MB に達すると分割されます。Drive の読み込みと GAS のメモリの急増を防ぐためです。
- **旧形式との互換**: 以前の形式で保存されたファイルも読めます。`objects/` 直下の 40 桁 16 進名のファイル（オブジェクト 1 個 = ファイル 1 個）と、種別のない `bundle_*.json` です。新しく書き込むのは上記の種別付きバンドルだけです。

### 1.3 読み出しとキャッシュ

オブジェクトの読み出し (`GasGitStore::read_loose_object`) は、速い場所から順に探して見つかった時点で止めます。

1. 同一リクエスト内のメモリ（展開済み、最大 12 MB）
2. 同一リクエスト内のメモリ（読み込んだバンドルの圧縮文字列）
3. GAS `CacheService`（リクエストをまたいで最大 6 時間。32 KB 以下のオブジェクトのみ）
4. `bundle_commit_*` → `bundle_meta_*` を新しい順に 1 つずつ開く
5. 目的が Blob と分かっている場合だけ `bundle_blob_*` を開く

コミット一覧（Web UI のグラフ、`/<project>.git` の一覧）は次の順で取得します。

1. `CacheService` 上の圧縮済み一覧（100 KB 制限のため最大 16 個に分割）
2. `commits_cache.json`: コミット一覧、調査済みバンドル名、HEAD と refs の値を保存した永続索引。HEAD / refs が一致し、グラフが欠けていなければそのまま使います。
3. 未調査のバンドルだけを走査します。200 秒を超えたら途中結果を `commits_cache.json` に保存して打ち切り、次のリクエストで続きを処理します（GAS の 6 分制限対策）。

その他に、`CacheService` へ次の値を保存します。push 時に該当キーを無効化します。
- リポジトリの存在
- HEAD / refs
- リポジトリ一覧

### 1.4 push の処理と整合性

`git-receive-pack` は次の順で処理します。
1. `LockService` のスクリプトロックを最大 30 秒待って取得します。取れなければ push を拒否します。
2. PACK を検証・展開します。
   - 末尾 SHA-1 を照合します。
   - オブジェクトを zlib で展開し、`OFS_DELTA` / `REF_DELTA` は元オブジェクトに適用して復元します。
   - 全オブジェクトの SHA-1 を再計算します。
   - 1 オブジェクトは 64 MiB までです。
3. 1.2 の形式でバンドルを書き込み、新しいコミットを `commits_cache.json` に追記します。
4. ref を更新します。`git receive-pack` と同じ compare-and-swap で、ref の現在値がコマンドの旧値と一致する場合だけ書き換えます。
   - `refs/` 以外は拒否します。
   - 新しい tip オブジェクトが存在しなければ拒否します。
   - `atomic` を要求された場合は、1 つでも失敗すれば全体を拒否します。
   - `refs.json` は 1 回の push につき 1 回だけ書き込みます。
   - HEAD の指すブランチが存在しない場合は、push されたブランチを HEAD にします。

大きなリポジトリは `git-remote-gas` が PACK を数 MB 単位に分割して送ります。区切りごとに第一親のコミットへブランチを進めるので、中断しても再実行すれば続きから送れます。

### 1.5 初期コミットの自動生成なし & Gleam + Lustre によるブラウザ Web UI (`web/`)
- サーバー側が勝手に初期コミットを生成することはありません。新規作成されたリポジトリはコミット数 `0` の空リポジトリ (`HEAD -> refs/heads/main`) として作成されます。
- ブラウザから GAS Web アプリの URL (`https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec`) にアクセスすると、**Gleam + Lustre** (`web/src/gas_git_ui.gleam`) で実装された Web UI が表示されます。
  - **純粋な MVU (Elm Architecture) 実装**: `lustre.application(init, update, view)` と `lustre/effect.from` で状態遷移と通信を管理しています。
  - **npm 依存ゼロ**: フロントエンドは Gleam (`target = "javascript"`) と Lustre のみで構成されます。
  - **機能**:
    1. 登録フォルダー (`GIT_DRIVE_FOLDER_ID`) 内の全 Git プロジェクトの一覧（HEAD・ブランチ数・リモート URL）
    2. 新しい空リポジトリの作成と、コピペできる `git remote add origin` / `git push -u origin main` の案内
    3. コミット履歴の SVG グラフ（Fossil 風の縦タイムライン。`graph.gleam`）
    4. コミットごとの差分（行単位の unified diff）とファイルツリーの表示
  - **ブラウザ側キャッシュ**: コミット一覧と差分は IndexedDB に保存し（使えない場合は CacheStorage → localStorage）、2 回目以降はサーバーへ問い合わせません。キーに HEAD のコミット ID を含むため、push 後は自動的に再取得します。
- Web UI の HTML (`dist/index.html`) は Wasm に埋め込まず、`clasp push` で GAS の HTML ファイル `index` としてアップロードします。サーバーは実行時に `HtmlService.createHtmlOutputFromFile("index")` で読み込み、初期状態の JSON を差し込んで返します。

### 1.6 サーバーサイド (`src/git_server.rs`) における `gitoxide` の役割

| 使用クレート | GAS Git Server (`src/git_server.rs`) での用途 |
| :--- | :--- |
| **`gix-packetline`** | Smart HTTP v1 の pkt-line 形式のエンコード・デコード。対象は `# service=…`、空リポジトリの `capabilities^{}`、`want`/`have`/`done`、`side-band-64k`、`report-status` |
| **`gix-object`** | Git オブジェクト (`Blob`, `Tree`, `Commit`, `Tag`) の loose 形式ヘッダの生成と、ゼロコピーパース (`ObjectRef::from_loose` / `from_bytes`) によるコミットグラフ・ツリーの探索 |
| **`gix-hash`** | SHA-1 `ObjectId` の 16 進変換・検証と、`PACK` v2 末尾の 20 バイト SHA-1 チェックサム計算 |
| **`gix-zlib`** | Pure Rust (`zlib-rs`) による `PACK` エントリおよび格納文字列 (`z:` 形式) の圧縮 (`stream::deflate::Write`) と展開 (`Inflate::once`) |
| **`gix-validate`** | `git push` 時の参照名 (`refs/heads/*`, `refs/tags/*`) の妥当性検証 |

PACK の delta 適用 (`apply_git_delta`) とバンドル形式の保存・読み出しは、GAS 向けに独自実装しています。

---

## 2. 環境変数（GAS スクリプトプロパティ & クライアント環境変数）の設定

### 2.1 サーバー側（GAS スクリプトプロパティ / WASI 環境変数）

`wasi:cli/environment` (`js/wasi-cli.ts`) の実装により、**GAS のスクリプトプロパティ (`PropertiesService.getScriptProperties()`) のキーと値が、そのまま Rust Wasm コンポーネント内の環境変数 (`std::env::var`) として参照されます**。

| 環境変数名（スクリプトプロパティのキー） | 必須 | 設定値の形式・例 | 役割と詳細 |
| :--- | :---: | :--- | :--- |
| **`GIT_DRIVE_FOLDER_ID`** | **必須** | `1a2b3c4d5e6f7g8h9i0j...` | Git リポジトリ群 (`<project_name>.git` フォルダー) を格納する親フォルダーの ID。未設定の場合、リポジトリ一覧取得・作成・Git 操作時に設定を促すエラーを返します。 |
| **`GAS_WEB_APP_URL`** | 任意 | `https://script.google.com/macros/s/<ID>/exec` | デプロイした Web アプリの `/exec` URL。通常は `ScriptApp.getService().getUrl()` から自動取得されます。取得できない環境で、Web UI やコミット一覧のリンクを正しい URL にするために設定します。 |
| **`GIT_COMMIT_PAGE_SIZE`** | 任意 | `20` | `/<project>.git` のコミット一覧 1 ページの件数（既定 20、1〜500）。`?per_page=N` で一時的に上書きできます。 |

#### `GIT_DRIVE_FOLDER_ID` の確認と設定手順
1. Google Drive で Git リポジトリ群を保存したいフォルダーを作成（または選択）し、ブラウザでそのフォルダーを開きます。
2. アドレスバーの URL `https://drive.google.com/drive/folders/<FOLDER_ID>` の末尾にある `<FOLDER_ID>` 文字列をコピーします。
3. Google Apps Script エディタを開き、左メニューの **「プロジェクトの設定（歯車アイコン）」 > 「スクリプト プロパティ」** へ移動します。
4. **「スクリプト プロパティを追加」** をクリックし、以下のように登録して保存します。
   - **プロパティ**: `GIT_DRIVE_FOLDER_ID`
   - **値**: コピーした `<FOLDER_ID>`

### 2.2 クライアント側 (`git-remote-gas`) の環境変数

| 環境変数名 | 必須 | デフォルト値 | 説明 |
| :--- | :---: | :---: | :--- |
| **`GAS_GIT_TIMEOUT`** | 任意 | `300` (秒) | HTTP リクエストのタイムアウト秒数。`export GAS_GIT_TIMEOUT=600` で延長、`0` 以下で無制限 |
| **`GAS_GIT_TOKEN`** | 任意 | なし | OAuth 2.0 Bearer アクセストークン（`gcloud auth print-access-token` 等）。未設定時は匿名 → キャッシュ済み認証情報 → `~/.clasprc.json` → 対話プロンプトの順に試行 |
| **`GAS_GIT_COOKIE`** | 任意 | なし | OAuth トークンの代わりにブラウザセッション Cookie (`SID=...; HSID=...`) を使う場合に指定 |
| **`GAS_GIT_CHUNK_OBJECTS`** | 任意 | `2500` | 分割 push 1 回あたりの最大オブジェクト数 |
| **`GAS_GIT_CHUNK_UNCOMPRESSED_MB`** | 任意 | `12` | 分割 push 1 回あたりの最大非圧縮サイズ (MB)。バイト指定は `GAS_GIT_CHUNK_UNCOMPRESSED_BYTES` |
| **`GAS_GIT_CHUNK_PACK_MB`** | 任意 | `5` | 分割 push 1 回あたりの最大 PACK サイズ (MB)。バイト指定は `GAS_GIT_CHUNK_PACK_BYTES` |
| **`GAS_GIT_CHUNK_COMMITS`** | 任意 | `400` | ブランチを進めるチェックポイント間のコミット数 |

認証情報 (`Authorization` / `Cookie`) は、設定したリモート URL のオリジンと `https://*.google.com` にだけ送信されます（Cookie は `https://*.googleusercontent.com` にも送信）。

---

## 3. ビルド・デプロイと基本的な使い方

### 3.1 ビルドと GAS へのデプロイ
```bash
# 1. 初回のみ: wasm32-wasip2 ターゲットと Node 依存のインストール
make setup

# 2. ビルド (Gleam UI + Rust Wasm + jco + webpack) して dist/ を GAS プロジェクトへプッシュ
#    dist/main.js, dist/index.html (Web UI), dist/appsscript.json が送られます
make push

# 3. Web アプリとしてデプロイ（初回は GAS エディタの「デプロイ」→「新しいデプロイ」でも可）
pnpm exec clasp deploy --description "gitoxide Smart HTTP v1 Git Server on Google Drive"
```

コードを更新した場合は、既存デプロイを新しいバージョンに更新しないと `/exec` に反映されません。

### 3.2 ブラウザ Web UI でリポジトリを作成する
1. デプロイされた Web アプリ URL (`https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec`) をブラウザで開きます。
2. **「Create a new repository / 新規リポジトリ作成」** 欄にプロジェクト名（例: `my-project`）と任意の説明を入力し、**「Create repository / リポジトリを作成」** をクリックします。
3. `GIT_DRIVE_FOLDER_ID` のフォルダー内に空のリポジトリ `my-project.git/` (`HEAD`, `refs.json`, `objects/`) が作成され、クイックセットアップ用の Git コマンドが表示されます。

### 3.3 ローカルから Git リモートを追加してプッシュ・クローンする

```bash
# 1. git-remote-gas を ~/.local/bin にインストール
make install-git-remote-gas

# 2. 必要に応じてタイムアウトを延長
export GAS_GIT_TIMEOUT=600

# 3. 新規ローカルリポジトリを初期化してリモートを追加・プッシュ
mkdir my-project && cd my-project
echo "# my-project" >> README.md
git init
git add README.md
git commit -m "first commit"
git branch -M main
git remote add origin gas::https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec/my-project.git
git push -u origin main

# 4. 別のディレクトリへ git clone
git clone gas::https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec/my-project.git my-project-clone
```

### 3.4 ローカル E2E テストの実行 (`make test-git-e2e`)
```bash
make test-git-e2e
# または
python3 ./tools/test_gas_git_e2e.py
```

E2E テストは Python で書かれた模擬サーバーを相手に、`git-remote-gas` 経由の push / clone / pull と Web API を確認します（Rust サーバーそのものは `make check` のユニットテストで確認します）。
