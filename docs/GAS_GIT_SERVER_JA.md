# Google Apps Script (GAS) Git Server with `gitoxide`, Google Drive & Gleam/Lustre Web UI — 日本語ガイド

本ドキュメントでは、Rust (`wasm32-wasip2` WebAssembly Component) と **`gitoxide` (`gix-*`)** を用いて Google Apps Script (GAS) を **Git Smart HTTP v1 サーバー** として動作させる方法、**Google Drive をデフォルトストレージとして複数プロジェクトを管理するための環境変数設定**、**Gleam + Lustre で構築されたブラウザ Web UI**、および Python 製 Git リモートヘルパー **`git-remote-gas`** (`gas::` プレフィックス) の使い方を解説します。

---

## 1. システム構成と仕組み

### 1.1 GitHub ライクな URL パスルーティング (`.../exec/<project_name>.git`)
GitHub のリポジトリ URL (`https://github.com/username/project_name.git`) を参考に、GAS サーバーでは単一ユーザーのデプロイメントであるため `username` を省略し、末尾に `<project_name>.git` を取り付ける URL 形式を採用しています。

```bash
git remote add origin gas::https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec/project_name.git
```

サーバー側 (`src/git_server.rs` の `parse_git_path`) とクライアント側 (`tools/git-remote-gas` の `parse_gas_remote_url`) が URL パスを解析し、以下のエンドポイントへルーティングします：
- `GET  /<project_name>.git/info/refs?service=git-upload-pack` (`git ls-remote`, `git clone`, `git fetch`, `git pull`)
- `GET  /<project_name>.git/info/refs?service=git-receive-pack` (`git push` 時の参照解決)
- `POST /<project_name>.git/git-upload-pack` (PACK ストリームの交渉・送信)
- `POST /<project_name>.git/git-receive-pack` (PACK ストリームの展開・参照更新)
- `GET  /` または `GET /<project_name>.git` (ブラウザアクセス時は Gleam + Lustre Web UI を表示)

### 1.2 Google Drive デフォルト保存と複数プロジェクト管理
本サーバーは **Google Drive (`DriveApp`) への保存をデフォルト** としています。
環境変数 **`GIT_DRIVE_FOLDER_ID`**（GAS スクリプトプロパティ）に登録した Google Drive フォルダーの直下に、複数の Git プロジェクトが `<project_name>.git` フォルダーとして格納されます。

```text
<Google Drive Folder (GIT_DRIVE_FOLDER_ID)>/
├── project-alpha.git/
│   ├── HEAD                 ("ref: refs/heads/main\n")
│   ├── refs.json            ({"refs/heads/main": "<sha1-hex>", ...})
│   └── objects/
│       ├── <sha1-hex>       (Base64 エンコードされた Git Loose オブジェクト `<kind> <size>\0<body>`)
│       └── ...
├── project-beta.git/
│   ├── HEAD
│   ├── refs.json
│   └── objects/
└── ...
```

### 1.3 初期コミットの自動生成なし & Gleam + Lustre によるブラウザ Web UI (`web/`)
- サーバー側が勝手に初期コミットを生成することはありません。新規作成されたリポジトリはコミット数 `0` の空リポジトリ (`HEAD -> refs/heads/main`) として作成されます。
- ブラウザから GAS Web アプリの URL (`https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec`) にアクセスすると、**Gleam + Lustre** (`web/src/gas_git_ui.gleam`) で実装された Web UI が表示されます。
  - **純粋な MVU (Elm Architecture) 実装**: `lustre/event.emit` のような副作用を伴う機能は一切使用せず、`lustre.application(init, update, view)` と `lustre/effect.from` のみで状態遷移と通信を管理しています。
  - **npm 依存ゼロ**: フロントエンドは Gleam (`target = "javascript"`) と Lustre のみで構成され、追加の npm パッケージに依存しません。
  - **最小限で実用的なブラウザ機能**:
    1. 登録フォルダー (`GIT_DRIVE_FOLDER_ID`) 内に存在する全 Git プロジェクトの一覧把握（状態・HEAD・ブランチ数・リモート URL）
    2. 新しい空の Git リポジトリ (`<project_name>.git`) の作成と、作成直後にそのままコピペできる `git init` / `git remote add origin` / `git push -u origin main` のクイックセットアップ案内

### 1.4 サーバーサイド (`src/git_server.rs`) における `gitoxide` の役割

| 使用クレート | GAS Git Server (`src/git_server.rs`) での用途 |
| :--- | :--- |
| **`gix-packetline`** | Smart HTTP v1 の pkt-line 形式 (`001e# service=git-upload-pack\n0000...`, 空リポジトリの `capabilities^{}`, `want`/`have`/`done`, `side-band-64k`, `report-status`) のエンコード・デコード |
| **`gix-object`** | Git オブジェクト (`Blob`, `Tree`, `Commit`, `Tag`) の Loose 形式シリアライズ (`WriteTo`) とゼロコピーパース (`ObjectRef::from_loose`) によるコミットグラフ探索 |
| **`gix-hash`** | SHA-1 `ObjectId` の 16 進変換・検証、および `PACK` v2 ストリーム末尾の 20 バイト SHA-1 チェックサム計算 (`gix_hash::hasher(Kind::Sha1)`) |
| **`gix-zlib`** | Pure Rust (`zlib-rs`) による `PACK` v2 エントリの圧縮 (`stream::deflate::Write`) と展開 (`Inflate::once`) |
| **`gix-validate`** | `git push` (`git-receive-pack`) 時のブランチ・タグ参照名 (`refs/heads/*`, `refs/tags/*`) の妥当性検証 (`gix_validate::reference::name`) |

---

## 2. 環境変数（GAS スクリプトプロパティ & クライアント環境変数）の設定

### 2.1 サーバー側（GAS スクリプトプロパティ / WASI 環境変数）

本プロジェクトでは `wasi:cli/environment` (`js/wasi-cli.ts`) の実装により、**Google Apps Script のスクリプトプロパティ (`PropertiesService.getScriptProperties()`) に設定したキーと値が、そのまま Rust Wasm コンポーネント内の環境変数 (`std::env::var`) として参照されます**。

| 環境変数名（スクリプトプロパティのキー） | 必須 | 設定値の形式・例 | 役割と詳細 |
| :--- | :---: | :--- | :--- |
| **`GIT_DRIVE_FOLDER_ID`** | **必須** | `1a2b3c4d5e6f7g8h9i0j...` | 複数の Git リポジトリ (`<project_name>.git` フォルダ) を格納する親 Google Drive フォルダーの ID。未設定の場合はリポジトリ一覧取得・作成・Git 操作時に設定を促すエラーメッセージを返します。 |
| **`GAS_WEB_APP_URL`** | 任意 | `https://script.google.com/macros/s/<ID>/exec` | デプロイした GAS Web アプリの `/exec` URL。設定しておくと、GAS の iframe サンドボックス (`googleusercontent.com`) 内で Web UI を開いた際にも正確な `git remote add origin gas::...` URL が表示されます。 |

#### `GIT_DRIVE_FOLDER_ID` の確認と設定手順
1. Google Drive で Git リポジトリ群を保存したいフォルダーを作成（または選択）し、ブラウザでそのフォルダーを開きます。
2. ブラウザのアドレスバーの URL `https://drive.google.com/drive/folders/<FOLDER_ID>` の末尾にある `<FOLDER_ID>` 文字列をコピーします。
3. Google Apps Script エディタを開き、左メニューの **「プロジェクトの設定（歯車アイコン）」 > 「スクリプト プロパティ」** へ移動します。
4. **「スクリプト プロパティを追加」** をクリックし、以下のように登録して保存します：
   - **プロパティ**: `GIT_DRIVE_FOLDER_ID`
   - **値**: コピーした `<FOLDER_ID>`

### 2.2 クライアント側 (`git-remote-gas`) の環境変数

| 環境変数名 | 必須 | デフォルト値 | 説明 |
| :--- | :---: | :---: | :--- |
| **`GAS_GIT_TIMEOUT`** | 任意 | `300` (秒) | HTTP リクエストのタイムアウト秒数（**デフォルト: 300秒 = 5分**）。Google Drive への書き込み処理や大容量プッシュ時に `export GAS_GIT_TIMEOUT=600`（10分）のように延長、または `export GAS_GIT_TIMEOUT=0` で無制限に設定できます。 |
| **`GAS_GIT_TOKEN`** | 任意 | なし | GAS Web アプリへアクセスする際の OAuth 2.0 Bearer アクセストークン (`gcloud auth print-access-token` 等で取得)。未設定時は匿名アクセス → キャッシュ済みトークン → `~/.clasprc.json` の順で自動試行します。 |
| **`GAS_GIT_COOKIE`** | 任意 | なし | OAuth トークンの代わりにブラウザセッション Cookie (`SID=...; HSID=...`) を直接指定する場合に使用します。 |

---

## 3. ビルド・デプロイと基本的な使い方

### 3.1 ビルドと GAS へのデプロイ
```bash
# 1. (任意) Gleam + Lustre Web UI のビルド + Rust Wasm コンポーネントビルド + jco transpile + Webpack バンドル
make build-pack

# 2. dist/ 内のバンドルと appsscript.json を GAS プロジェクトへプッシュ
make push

# 3. Web アプリとしてデプロイ
pnpm exec clasp deploy --description "gitoxide Smart HTTP v1 Git Server on Google Drive"
```

### 3.2 ブラウザ Web UI でリポジトリを作成する
1. デプロイされた Web アプリ URL (`https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec`) をブラウザで開きます。
2. **「Create a new repository / 新規リポジトリ作成」** 欄にプロジェクト名（例: `my-project`）と任意の説明を入力し、**「Create repository / リポジトリを作成」** をクリックします。
3. `GIT_DRIVE_FOLDER_ID` の Google Drive フォルダー内に空のリポジトリ `my-project.git/` (`HEAD`, `refs.json`, `objects/`) が作成され、画面下部にクイックセットアップ用の Git コマンドが表示されます。

### 3.3 ローカルから Git リモートを追加してプッシュ・クローンする

```bash
# 1. git-remote-gas を PATH に追加 (タイムアウトはデフォルト300秒)
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
