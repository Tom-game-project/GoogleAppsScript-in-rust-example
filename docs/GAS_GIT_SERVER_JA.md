# Google Apps Script (GAS) Git Server with `gitoxide` & `git-remote-gas` — 日本語ガイド

本ドキュメントでは、Rust (`wasm32-wasip2` WebAssembly Component) と **`gitoxide` (`gix-*`)** を用いて Google Apps Script (GAS) を **Git Smart HTTP v1 サーバー** として動作させる方法、および GAS 特有の HTTP 302 リダイレクトや Google 認証を透過的に処理する Python 製 Git リモートヘルパー **`git-remote-gas`** (`gas::` プレフィックス) の使い方を解説します。

---

## 1. システム構成と仕組み

### 1.1 なぜクライアント側に `git-remote-gas` (`gas::` プレフィックス) が必要なのか？
Google Apps Script の Web アプリ (`https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec`) には、標準の Git HTTP クライアント (`git-remote-http`) では直接扱いにくい以下の 3 つの制約があります。

1. **HTTP 302 リダイレクト (`script.googleusercontent.com` への転送)**
   - GAS の `doGet(e)` や `doPost(e)` が返す `ContentService.TextOutput` は、一度 `302 Moved Temporarily` を返し、一時 URL (`https://script.googleusercontent.com/macros/echo?user_content_key=...`) へリダイレクトされます。
   - 特に **`POST` リクエスト (`/git-upload-pack`, `/git-receive-pack`)** では、初回の `POST` 時点で GAS 側の `doPost(e)` が実行され、その出力結果を取得するためには **302 リダイレクト先へ `GET` メソッドでアクセス** しなければなりません（リダイレクト先に再度 `POST` すると `405 Method Not Allowed` になります）。
2. **Google アカウント認証 / ログイン処理**
   - `appsscript.json` の `webapp.access` が `"MYSELF"`（自分のみ）や `"DOMAIN"`（組織内）、`"ANYONE"`（Google アカウントを持つ全員）に設定されている場合、未認証アクセスは `https://accounts.google.com/ServiceLogin` の HTML ログイン画面へ 302 リダイレクトされます。
   - `git-remote-gas` は OAuth 2.0 Bearer トークン（`GAS_GIT_TOKEN` 環境変数、`~/.clasprc.json` の自動リフレッシュ、`gcloud auth print-access-token`）や Cookie を自動付与し、さらに `script.googleusercontent.com` へのリダイレクト時には不要な Authorization ヘッダを除去して安全に応答を取得します。
3. **バイナリ PACK ストリームの Base64 フレーミング**
   - GAS の `ContentService.createTextOutput()` は UTF-8 文字列のみを返却するため、Git のバイナリ `PACK` データや sideband チャネルをそのまま文字列化すると UTF-8 変換で破損します。
   - 本実装では `encoding=base64` パラメータおよび JSON エンベロープにより、`gitoxide` が生成したバイナリパケットを GAS `Utilities.base64Encode` / `base64Decode` で無劣化転送します。

---

### 1.2 サーバーサイド (`src/git_server.rs`) における `gitoxide` の役割
Rust Wasm コンポーネント (`src/git_server.rs`) では、`crates/gix-*` にバンドルされた以下の **`gitoxide`** クレートを使用して Git Smart HTTP v1 プロトコルを実装しています。

| 使用クレート (`crates/`) | GAS Git Server (`src/git_server.rs`) での用途 |
| :--- | :--- |
| **`gix-packetline`** | Smart HTTP v1 の pkt-line 形式 (`001e# service=git-upload-pack\n0000...`, `want`/`have`/`done`, `side-band-64k` チャネル多重化, `report-status`) のエンコード・デコード (`StreamingPeekableIter`, `blocking_io::encode`) |
| **`gix-object`** | Git オブジェクト (`Blob`, `Tree`, `Commit`, `Tag`) の Loose 形式シリアライズ (`WriteTo`) とゼロコピーパース (`ObjectRef::from_loose`) によるコミットグラフ探索 |
| **`gix-hash`** | SHA-1 `ObjectId` の 16 進変換・検証、および `PACK` v2 ストリーム末尾の 20 バイト SHA-1 チェックサム計算 (`gix_hash::hasher(Kind::Sha1)`) |
| **`gix-zlib`** | Pure Rust (`zlib-rs`) による `PACK` v2 エントリの圧縮 (`stream::deflate::Write`) と展開 (`Inflate::once`) |
| **`gix-actor` / `gix-date`** | リポジトリ初回アクセス時に自動生成される初期コミット (`README.md`) の Author / Committer 署名生成 |
| **`gix-validate`** | `git push` (`git-receive-pack`) 時のブランチ・タグ参照名 (`refs/heads/*`, `refs/tags/*`) の妥当性検証 (`gix_validate::reference::name`) |

---

## 2. セットアップ手順

### 2.1 GAS サーバー側のビルドとデプロイ

#### 必要なツール
- Rust ツールチェーン + `wasm32-wasip2` ターゲット (`rustup target add wasm32-wasip2`)
- Node.js / `pnpm` (`pnpm install`)
- `@google/clasp` (Google Apps Script へのプッシュ・デプロイ用)

#### ビルドと GAS への反映
```bash
# 1. Rust Wasm コンポーネントのビルド + jco transpile + Webpack バンドル生成
make build-pack

# 2. dist/ 内のバンドルと appsscript.json を GAS プロジェクトへプッシュ
make push

# 3. Web アプリとしてデプロイ (または GAS Web エディタの「デプロイ > 新しいデプロイ」から作成)
pnpm exec clasp deploy --description "gitoxide Smart HTTP v1 Git Server"
```

デプロイが完了すると、以下のような Web アプリ URL が発行されます。
```text
https://script.google.com/macros/s/AKfycbxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx/exec
```

> **初期コミットの自動生成について**:
> デプロイ直後の空の状態でも、初回アクセス時（`git ls-remote` や `git clone` 実行時、または GAS エディタ上で `git_init_repo()` 関数を実行した際）に `gitoxide` が自動的に初期コミット（`README.md` を含む `refs/heads/main` と `HEAD`）を `PropertiesService.getScriptProperties()` に生成するため、設定直後からすぐに `git ls-remote` や `git clone` が動作します。

---

### 2.2 クライアント側 (`git-remote-gas`) のセットアップ

Git は URL が `gas::` で始まる場合、環境変数 `PATH` 上から自動的に **`git-remote-gas`** という名前の実行ファイルを探して呼び出します。

```bash
# 方法 A: ~/.local/bin にインストールする (推奨)
make install-git-remote-gas
export PATH="$HOME/.local/bin:$PATH"

# 方法 B: リポジトリ内の tools/ ディレクトリを直接 PATH に追加する
export PATH="$(pwd)/tools:$PATH"
```

Python 3 標準ライブラリのみ（外部 pip パッケージ不要）で動作します。

---

## 3. 認証（GAS ログイン処理）の設定方法

GAS Web アプリの公開範囲（`appsscript.json` の `webapp.access`）に応じて、`git-remote-gas` は以下の認証方式を順番に自動検出します。

### 方法 1: `@google/clasp` のログイン情報をそのまま使う（最も簡単）
すでに `npx @google/clasp login` でログイン済みであれば、`~/.clasprc.json` に保存されている OAuth リフレッシュトークンを使って `git-remote-gas` が自動的にアクセストークンを取得・更新します。追加設定は不要です。

### 方法 2: 環境変数 `GAS_GIT_TOKEN` またはトークン保存機能を使う
`gcloud` CLI などで取得した OAuth 2.0 アクセストークンを設定します。
```bash
# 環境変数で渡す場合
export GAS_GIT_TOKEN="$(gcloud auth print-access-token)"

# または ~/.config/gas-git/token.json に保存する場合
git-remote-gas --save-token "$(gcloud auth print-access-token)"

# または gcloud 自動呼び出しを有効にする場合
export GAS_GIT_USE_GCLOUD=1
```

### 方法 3: ブラウザ Cookie を使用する (`GAS_GIT_COOKIE` / `GAS_GIT_COOKIE_FILE`)
OAuth トークンの代わりにブラウザのセッション Cookie を渡すことも可能です。
```bash
export GAS_GIT_COOKIE="SID=...; HSID=...; SSID=..."
# または Netscape 形式の Cookie ファイルを指定
export GAS_GIT_COOKIE_FILE="$HOME/.config/gas-git/cookies.txt"
```

### 方法 4: 匿名アクセス (`ANYONE_ANONYMOUS`) でデプロイする
GAS のデプロイ設定で「アクセスできるユーザー: 全員 (Anyone)」を選択した場合は、トークン設定なしでリダイレクト処理のみを介してそのままアクセスできます。

---

## 4. 基本的な Git 操作の使い方 (`gas::` URL)

Web アプリ URL の先頭に **`gas::`** を付けるだけで、標準の `git` コマンドがすべてそのまま使えます。

### 4.1 `git ls-remote`（リモート参照一覧の取得）
```bash
git ls-remote gas::https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec
```
出力例:
```text
c46e020074d6334b9332c3f2f6d6693f503e0b7b	HEAD
c46e020074d6334b9332c3f2f6d6693f503e0b7b	refs/heads/main
```

### 4.2 `git clone`（リポジトリのクローン）
```bash
git clone gas::https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec my-gas-repo
cd my-gas-repo
cat README.md
```

### 4.3 `git push`（変更のコミットとプッシュ）
```bash
echo "Hello from gitoxide on GAS!" > hello.txt
git add hello.txt
git commit -m "Add hello.txt"
git push origin main
```

### 4.4 `git fetch` / `git pull`（差分の取得とマージ）
```bash
git fetch origin
git pull origin main
```

---

## 5. 応用機能

### 5.1 1つの GAS デプロイで複数の Git リポジトリをホストする (`?repo=<name>`)
URL クエリパラメータ `?repo=<リポジトリ名>` を付与することで、同一の GAS Web アプリ上で名前空間を分けて複数の独立した Git リポジトリを運用できます。
```bash
git clone "gas::https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec?repo=frontend"
git clone "gas::https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec?repo=backend"
```

### 5.2 Google Drive への大容量オブジェクト自動オフロード (`GIT_DRIVE_FOLDER_ID`)
GAS の `PropertiesService` には 1 プロパティあたり 9 KB のサイズ上限があります。
GAS のスクリプトプロパティに **`GIT_DRIVE_FOLDER_ID`**（保存先 Google Drive フォルダの ID）を設定しておくと、6 KB を超える Git オブジェクトは自動的に `DriveApp` 上のファイルとして保存され、`PropertiesService` には参照 ID (`drive:<file_id>`) のみが記録されます。

### 5.3 ローカル E2E テストの実行 (`make test-git-e2e`)
GAS Web アプリ特有の挙動（`GET`/`POST` 時の `302 Found` リダイレクト、`/macros/echo` での `GET` 強制、未認証時の `accounts.google.com` リダイレクト）をローカルで忠実に再現し、実際の `git ls-remote` / `git clone` / `git push` / `git pull` を検証するテストスイートを同梱しています。

```bash
make test-git-e2e
# または
python3 ./tools/test_gas_git_e2e.py
```
