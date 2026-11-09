# GAS Git Server

Google Apps Script (GAS) を **Git サーバー** として使えるようにするプロジェクトです。
リポジトリは Google Drive のフォルダーに保存され、ローカルからは通常の `git push` / `git clone` / `git pull` で操作できます。
ブラウザからはリポジトリ一覧・コミット履歴・差分・ファイルを閲覧できます。

```bash
git remote add origin gas::https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec/my-project.git
git push -u origin main
```

内部構造・最適化・セキュリティについては [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) を参照してください。

---

## 1. 必要なもの

| ツール | 用途 | 備考 |
| :--- | :--- | :--- |
| Rust (stable) + `wasm32-wasip2` ターゲット | サーバー本体のビルド | `make setup` でターゲットを追加 |
| Node.js + pnpm | jco / webpack / clasp | `make setup` で依存をインストール |
| Gleam | Web UI のビルド | 無い場合は同梱のフォールバックでバンドル |
| Python 3 + git | クライアント (`git-remote-gas`) | push / clone する PC に必要 |
| Google アカウント | GAS / Google Drive | |

## 2. セットアップ（初回のみ）

### 2.1 依存関係のインストール

```bash
make setup                 # rustup target add wasm32-wasip2 && pnpm install --frozen-lockfile
pnpm exec clasp login      # GAS へ push するための Google ログイン
```

### 2.2 GAS プロジェクトの作成

1. <https://script.google.com/> で新しいプロジェクトを作成し、「プロジェクトの設定」から **スクリプト ID** をコピーします。
2. リポジトリ直下に `.clasp.json` を作成します（`.gitignore` 済み）。

   ```json
   {
     "scriptId": "<スクリプト ID>",
     "rootDir": "dist/"
   }
   ```

### 2.3 保存先の Google Drive フォルダーを用意

1. Google Drive でリポジトリを保存するフォルダーを作り、URL `https://drive.google.com/drive/folders/<FOLDER_ID>` の `<FOLDER_ID>` を控えます。
2. GAS エディタの **「プロジェクトの設定」→「スクリプト プロパティ」** に以下を登録します。

| プロパティ | 必須 | 説明 |
| :--- | :---: | :--- |
| `GIT_DRIVE_FOLDER_ID` | **必須** | 上で控えたフォルダー ID。この中に `<project_name>.git` フォルダーが作られます |
| `GAS_WEB_APP_URL` | 任意 | デプロイ後の `/exec` URL。Web UI に表示されるリモート URL の生成に使います（通常は自動取得されます） |
| `GIT_COMMIT_PAGE_SIZE` | 任意 | ブラウザのコミット一覧の 1 ページ件数（既定 20、最大 500） |

## 3. ビルドとデプロイ

```bash
make push      # ビルド (dist/main.js, dist/index.html, dist/appsscript.json) して clasp push
```

初回は GAS エディタで **「デプロイ」→「新しいデプロイ」→ 種類「ウェブアプリ」** を選んでデプロイし、表示された
`https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec` を控えてください。
（`appsscript.json` の設定により「実行ユーザー: 自分」「アクセス: 自分のみ」でデプロイされます。）

> **コードを更新したとき**: `make push` の後、「デプロイを管理」から既存デプロイを **新しいバージョン** に更新しないと `/exec` には反映されません。

> **注意**: `dist/index.html`（Web UI）は GAS の HTML ファイル `index` として push され、サーバーが実行時に読み込みます。`make push` 以外の方法でアップロードする場合も `index.html` を含めてください。

## 4. リポジトリを作る

ブラウザで `/exec` URL を開き、「新規リポジトリ作成」にプロジェクト名（英数字と `-` `_` `.`）を入力して作成します。
空のリポジトリが作られます（初期コミットは作られません）。

スクリプトから作る場合は GAS のグローバル関数 `git_init_repo('my-project')` も使えます。

## 5. ローカルから使う

### 5.1 クライアントのインストール

```bash
make install-git-remote-gas            # ~/.local/bin/git-remote-gas にインストール
# ~/.local/bin が PATH に無い場合は追加してください
```

### 5.2 push / clone / pull

```bash
# 既存のローカルリポジトリを push
git remote add origin gas::https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec/my-project.git
git push -u origin main

# clone / pull
git clone gas::https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec/my-project.git
git pull
```

URL は `gas::` + `/exec` URL + `/<project_name>.git` の形式です。大きなリポジトリは自動的に複数回に分割して push され、途中で失敗しても再実行すれば続きから送信されます。

### 5.3 認証

Web アプリは「自分のみ」アクセス可能なため、`git-remote-gas` は次の順に認証情報を試します。

1. 環境変数 `GAS_GIT_TOKEN`（OAuth アクセストークン）/ `GAS_GIT_COOKIE`
2. 匿名アクセス
3. `~/.config/git-remote-gas/auth.json`（過去に入力した認証情報のキャッシュ）
4. `~/.clasprc.json`（`clasp login` のトークン、期限切れなら自動更新）
5. 対話プロンプト（ブラウザでログイン / `gcloud` / 手入力）

通常は `pnpm exec clasp login` 済みであれば追加設定は不要です。

### 5.4 クライアントの環境変数

| 変数 | 既定値 | 説明 |
| :--- | :---: | :--- |
| `GAS_GIT_TIMEOUT` | `300` | HTTP タイムアウト秒数。`0` 以下で無制限 |
| `GAS_GIT_TOKEN` | なし | OAuth Bearer トークン（例: `gcloud auth print-access-token`） |
| `GAS_GIT_COOKIE` | なし | Bearer トークンの代わりに使うブラウザ Cookie |
| `GAS_GIT_CHUNK_OBJECTS` | `2500` | 1 回の push で送る最大オブジェクト数 |
| `GAS_GIT_CHUNK_UNCOMPRESSED_MB` | `12` | 1 回の push の最大非圧縮サイズ (MB) |
| `GAS_GIT_CHUNK_PACK_MB` | `5` | 1 回の push の最大 PACK サイズ (MB) |
| `GAS_GIT_CHUNK_COMMITS` | `400` | ブランチを進めるチェックポイント間のコミット数 |

GAS のメモリやタイムアウトのエラーが出る場合は、チャンクの値を小さくするか `GAS_GIT_TIMEOUT` を延ばしてください。

## 6. ブラウザで閲覧する

| URL (`/exec` 以降) | 内容 |
| :--- | :--- |
| `/` | Web UI（リポジトリ一覧・作成・コミットグラフ・差分） |
| `/<project>.git` | コミット一覧（`?page=N`, `?per_page=N`） |
| `/<project>.git/<commit>` | そのコミットのルートディレクトリ（コミットは短縮ハッシュでも可） |
| `/<project>.git/<commit>/<path>` | ディレクトリ一覧、またはファイルの生データ（バイナリはダウンロード） |

## 7. make ターゲット

| コマンド | 内容 |
| :--- | :--- |
| `make` / `make build-pack` | すべてビルド（変更があった部分だけ。並列実行） |
| `make push` | ビルドして `clasp push` |
| `make check` | Rust のユニットテストと TypeScript の型検査 |
| `make test-git-e2e` | ローカルの模擬サーバーで `git-remote-gas` の E2E テスト |
| `make build-ui` / `make build-wasm` / `make typecheck` | 個別ビルド |
| `make BUILD=debug ...` | Rust を非最適化でビルド（開発時の高速反復用） |
| `make clean` / `make rebuild` / `make rebuild-push` | 成果物の削除 / クリーンビルド / クリーンビルドして push |
| `make install-git-remote-gas` | クライアントを `~/.local/bin` にインストール |

並列数は `make NPROC=4`、逐次実行は `make -j1` で指定できます。

## 8. トラブルシューティング

| 症状 | 対処 |
| :--- | :--- |
| `GIT_DRIVE_FOLDER_ID ... is not configured` | スクリプトプロパティに `GIT_DRIVE_FOLDER_ID` を設定 |
| `Repository 'x.git' does not exist` | 先に Web UI か `git_init_repo` でリポジトリを作成 |
| Web UI に「Web UI is not deployed」 | `make push` で `index.html` をアップロード |
| `Another push is in progress` | 別の push の完了を待って再実行 |
| `stale info` / `already exists` で push が拒否される | リモートが更新されています。`git pull`（または `git fetch`）してから再度 push |
| ログイン画面が返る / 401・403 | `pnpm exec clasp login` をやり直すか `GAS_GIT_TOKEN` を設定 |
| タイムアウト・メモリ不足 | `GAS_GIT_TIMEOUT` を延ばす、`GAS_GIT_CHUNK_*` を小さくする |

## ドキュメント

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — 内部構造・ビルドパイプライン・最適化・セキュリティ・WIT/WASI 対応表
- [docs/GAS_GIT_SERVER_JA.md](docs/GAS_GIT_SERVER_JA.md) / [docs/GAS_GIT_SERVER_EN.md](docs/GAS_GIT_SERVER_EN.md) — プロトコル・ストレージの詳細
