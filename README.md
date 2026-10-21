# Twimark

X・note・Qiitaの投稿と記事を、カテゴリ付きのカードで見るブックマークツール。一覧はGitHub Pagesで開き、追加はChrome/Edgeの拡張機能か、iPhoneアプリ（Expo Go）から行う。ブックマークのデータは、このリポジトリの `data/bookmarks.json` に置く（最初の追加のときに作られる）。

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

## iPhoneアプリ

`src/mobile` の Expo のアプリ。App Store には出さず、iPhone の Expo Go で開く。一覧、カテゴリの変更・削除、カテゴリの追加・並べ替え・削除、追加が、一覧の画面と同じデータでできる。

### はじめに（一度だけ）

1. iPhone に App Store から Expo Go を入れ、Expo のアカウント（無料）でサインインする。Expo Go は、サインインしたアカウントが持つプロジェクトの更新だけを開く。
2. PC で、同じアカウントで EAS のプロジェクトを作る。

   ```bash
   cd src/mobile
   npm ci
   npx eas-cli login
   npx eas-cli init
   ```

   `init` は `app.json` の `expo.extra.eas.projectId` にプロジェクトIDを入れる（`app.config.js` があるので手で入れるよう言われたら、表示されたIDをそこに入れる）。この変更はコミットする。`updates.url` と `runtimeVersion` は `app.config.js` が作る。
3. https://expo.dev の Account settings → Access tokens でトークンを作り、GitHub のリポジトリの Settings → Secrets and variables → Actions に `EXPO_TOKEN` として入れる。
4. main に push すると `.github/workflows/mobile.yml` が EAS Update の `main` チャンネルへ公開する。Expo Go で `exp://u.expo.dev/<プロジェクトID>?channel-name=main` を開く（Safari のアドレス欄に入れるか、Expo Go の Projects に出るものを開く）。
5. アプリの「設定」でトークンを入れて「接続を確かめる」。トークンはこの iPhone のキーチェーンにだけ置かれる。

### Xアプリの共有シートから追加する（ショートカット）

1. アプリの「設定」の「URL をコピー」で、ショートカットに入れる URL をコピーする。EAS Update から開いたアプリでコピーする（開発サーバーから開いたときと URL が違う）。
2. ショートカットアプリで新しいショートカットを作る。
   - 詳細（ⓘ）で「共有シートに表示」をオンにし、受け取るものを「URL」だけにする。名前は「Twimarkに追加」など
   - アクション「URL をエンコード」: 入力は「ショートカットの入力」
   - アクション「テキスト」: コピーした URL を貼り、その直後に「エンコードされたテキスト」をつなぐ
   - アクション「URL を開く」: 入力は「テキスト」
3. X アプリでポストの共有ボタン →「その他の方法でポストを共有」（共有シート）→「Twimarkに追加」。アプリの「追加」が開くので、カテゴリを選んで「追加」を押す。

X の「リンクをコピー」をしてから、アプリの「追加」で「クリップボードから貼り付け」でも追加できる。EAS Update の作り直しなどで共有シートから開かなくなったら、1 からやり直す。

### 開発サーバーで試す

```bash
cd src/mobile
npx expo start
```

PC と iPhone を同じネットワークにつなぎ、出てきた QR コードを iPhone のカメラで読む。

## 開発

```bash
node scripts/self-test.mjs
node scripts/build.mjs
```

```bash
cd src/mobile && npx expo export --platform ios --output-dir ../../build/mobile
```

依存パッケージは `src/mobile` にだけある（一覧の画面と拡張にはない）。アプリは `src/shared` を写さずに読み込む（`src/mobile/metro.config.js`）。画面と拡張の書き込みは `main` へのコミットになるので、手元の変更をpushする前に `git pull` する。詳しい決まりは `docs/requirements/project-rules.md`、要件は `docs/requirements/current-mvp.md`。
