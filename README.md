# Twimark

X・note・Qiitaの投稿と記事を、カテゴリ付きのカードで見るブックマークツール。一覧はGitHub Pagesで開き、追加はChrome/Edgeの拡張機能から行う。ブックマークのデータは、このリポジトリの `data/bookmarks.json` に置く（最初の追加のときに作られる）。

リポジトリが公開なら、ブックマークは誰でも見られる。一覧はトークンなしで見られ、編集（追加、カテゴリの変更、削除など）にだけトークンが要る。

## はじめに（一度だけ）

### 1. トークンを発行する

GitHubの Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token。

- Repository access: Only select repositories で、`Twimark` だけを選ぶ
- Repository permissions: Contents を Read and write（ほかは付けない）
- Expiration: 期限を付ける。切れたら発行し直して、画面と拡張の設定に入れ直す

このトークンはページのコードも書き換えられる。画面（このブラウザの `localStorage`）と拡張（`chrome.storage.local`）にだけ保存し、このリポジトリには入れない。

### 2. 一覧の画面を公開する

このリポジトリの Settings → Pages → Build and deployment の Source を「GitHub Actions」にする。mainにpushすると `.github/workflows/pages.yml` がテストとビルドをして配信する（`data/` だけの変更では配信しない）。公開先は `https://totemonekoze.github.io/Twimark/`。

編集するブラウザでは、画面の右上の「設定」でトークンを入れる。

### 3. 拡張機能を入れる

```bash
node scripts/build.mjs
```

Chromeは `chrome://extensions`、Edgeは `edge://extensions` を開き、デベロッパーモードをオンにして「パッケージ化されていない拡張機能を読み込む」で `build/extension` を選ぶ。拡張機能の「オプション」（設定）でトークンを入れて「接続を確かめる」。

コードを変えたら `node scripts/build.mjs` をやり直し、拡張機能のページで再読み込みする。開いていたX・note・Qiitaのタブも再読み込みする。

## 追加のしかた

- ツールバーのTwimarkのボタン: 開いているポストや記事を追加する
- 右クリック: ポストや記事のリンクの上で「Twimarkに追加」、ページの上で「このページをTwimarkに追加」。Xのタイムラインでは、ポストの日時のリンクを右クリックする
- 共有メニュー: Xのポストの共有メニュー、noteの記事の共有メニューと記事下の共有の並び、Qiitaの記事の共有の並びにある「Twimarkに追加」

どれもカテゴリを選んで「追加」を押す。本文を取得できなかったときは、出てくる欄に本文を貼り付けて保存する。

## 開発

```bash
node scripts/self-test.mjs
node scripts/build.mjs
```

依存パッケージはない。画面と拡張の書き込みは `main` へのコミットになるので、手元の変更をpushする前に `git pull` する。詳しい決まりは `docs/requirements/project-rules.md`、要件は `docs/requirements/current-mvp.md`。
