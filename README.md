# Twimark

X・note・Qiitaの投稿と記事を、カテゴリ・サブカテゴリ付きのカードで見るブックマークツール。一覧は Cloudflare Workers の画面（`https://twimark.ho-service.workers.dev`）で開き、追加は Chrome/Edge の拡張機能か、iPhone アプリ（Expo Go）から行う。

ブックマークは Cloudflare D1 に置き、ログインした利用者（1人だけ）しか読み書きできない。ログインは ID とパスワードで、パスキーを足すとパスキーを先に求める。

## はじめに（一度だけ）

### 1. 登録する

公開した画面（`https://twimark.ho-service.workers.dev`）を開くと、登録の画面が出る。ID とパスワード（10文字以上）を入れて登録する。最初の1人が登録すると、登録は閉じる。

パスキーを使うときは、右上の「設定」の「パスキーを追加」で足す。次からは、ID を入れて「次へ」を押すとパスキーを求められる。パスキーが使えないときは「パスワードでログイン」を押す。

### 2. 拡張機能を入れる

```bash
node scripts/build.mjs
```

Chromeは `chrome://extensions`、Edgeは `edge://extensions` を開き、デベロッパーモードをオンにして「パッケージ化されていない拡張機能を読み込む」で `build/extension` を選ぶ。

一覧の画面の「設定」の「拡張・アプリのトークン」で名前を入れて「発行する」を押し、出てきた値を拡張機能の「オプション」（設定）に入れて「接続を確かめる」。値は発行したときに一度だけ出る。要らなくなったら、一覧の画面の「設定」で取り消す。

コードを変えたら `node scripts/build.mjs` をやり直し、拡張機能のページで再読み込みする。開いていたX・note・Qiitaのタブも再読み込みする。

## 追加のしかた（拡張）

- ツールバーのTwimarkのボタン: 開いているポストや記事を追加する
- 右クリック: ポストや記事のリンクの上で「Twimarkに追加」、ページの上で「このページをTwimarkに追加」。Xのタイムラインでは、ポストの日時のリンクを右クリックする
- 共有メニュー: Xのポストの共有メニュー、noteの記事の共有メニューと記事下の共有の並び、Qiitaの記事の共有の並びにある「Twimarkに追加」

どれもカテゴリ（とサブカテゴリ）を選んで「追加」を押す。本文を取得できなかったときは、出てくる欄に本文を貼り付けて保存する。

## サブカテゴリ

カテゴリの下に1段持てる（例: AI活用 › Claude）。一覧の画面では、サイドメニューのカテゴリの「＋」で足し、「×」で消し、つまみ（⠿）で同じカテゴリの中を並べ替える。カテゴリを選ぶとサブカテゴリのものも含めて出し、サブカテゴリを選ぶとその中だけを出す。

- カテゴリを消すと、そのブックマークは消えずに「未分類」に出る。サブカテゴリも消える
- サブカテゴリを消すと、そのブックマークはカテゴリの直下に戻る

## iPhoneアプリ

`src/mobile` の Expo のアプリ。App Store には出さず、iPhone の Expo Go で開く。一覧（カテゴリ・サブカテゴリ・サイト・検索の絞り込み）、カードのカテゴリの変更・削除、カテゴリとサブカテゴリの管理、追加が、一覧の画面と同じデータでできる。

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
5. アプリの「設定」で「ブラウザでログイン」を押す。Twimark の画面がアプリの中で開くので、ログイン（パスキーかパスワード）して「渡す」を押す。これが動かないときは、下の「ID とパスワードでログイン」で入る。端末のトークンはこの iPhone のキーチェーンにだけ置かれる。

### Xアプリの共有シートから追加する（ショートカット）

1. アプリの「設定」の「URL をコピー」で、ショートカットに入れる URL をコピーする。EAS Update から開いたアプリでコピーする（開発サーバーから開いたときと URL が違う）。
2. ショートカットアプリで新しいショートカットを作る。
   - 詳細（ⓘ）で「共有シートに表示」をオンにし、受け取るものを「URL」だけにする。名前は「Twimarkに追加」など
   - アクション「URL をエンコード」: 入力は「ショートカットの入力」
   - アクション「テキスト」: コピーした URL を貼り、その直後に「エンコードされたテキスト」をつなぐ
   - アクション「URL を開く」: 入力は「テキスト」
3. X アプリでポストの共有ボタン →「その他の方法でポストを共有」（共有シート）→「Twimarkに追加」。アプリの「追加」が開くので、カテゴリ（とサブカテゴリ）を選んで「追加」を押す。

X の「リンクをコピー」をしてから、アプリの「追加」で「クリップボードから貼り付け」でも追加できる。EAS Update の作り直しなどで共有シートから開かなくなったら、1 からやり直す。

### 開発サーバーで試す

```bash
cd src/mobile
npx expo start
```

PC と iPhone を同じネットワークにつなぎ、出てきた QR コードを iPhone のカメラで読む。

## 公開（Cloudflare）

手元のログイン済みの wrangler から公開する（GitHub Actions では公開しない）。初回は D1 の表を作ってから公開する。

```bash
npm ci
npm run db:migrate
npm run deploy
```

`deploy` は自己テスト、ビルド、`wrangler deploy` の順に行い、どれかが失敗したら止まる。wrangler は作業フォルダの `.wrangler/` にアカウント名（メールアドレス）を書くので、コミットしない（`.gitignore` にある）。

パスワードの PBKDF2 の反復回数は `wrangler.jsonc` の `vars.PBKDF2_ITERATIONS`。Free プランの CPU の上限で登録やログインが止まるときは下げる（使った回数は利用者ごとに残るので、あとで変えても前のパスワードで入れる）。

## 開発

```bash
node scripts/self-test.mjs
node scripts/build.mjs
```

```bash
cd src/mobile && npx expo export --platform ios --output-dir ../../build/mobile
```

手元で Worker と画面を動かすときは、`npx wrangler d1 migrations apply twimark --local` のあと `npx wrangler dev`。

依存パッケージは、ルート（Worker の `@simplewebauthn/server` と `wrangler`）と `src/mobile` にだけある。一覧の画面と拡張は依存を持たない。アプリは `src/shared` を写さずに読み込む（`src/mobile/metro.config.js`）。詳しい決まりは `docs/requirements/project-rules.md`、要件は `docs/requirements/current-mvp.md`。
