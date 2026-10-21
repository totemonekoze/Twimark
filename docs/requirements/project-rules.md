# Twimark 運用ルール

## 場所

| 場所 | 内容 |
|---|---|
| `src/worker/` | Worker の API（`index.js` は振り分けと Origin の検査、`auth.js` は登録・ログイン・パスキー・セッション、`library.js` はブックマークとカテゴリの読み書き） |
| `migrations/` | D1 の表（`wrangler d1 migrations`） |
| `wrangler.jsonc` | Worker `twimark`、静的アセット（`build/site`）、D1 のバインド `DB`、`vars.PBKDF2_ITERATIONS` |
| `src/shared/store.js` | API の呼び出しと操作（`ops`）、名前の決まり。画面・拡張・アプリ・Worker が使う |
| `src/shared/meta.js` | 追加できるURLの判定と、保存する項目の取得。判定は画面・アプリ・拡張・Worker、取得は拡張と Worker（`/api/meta`）が使う |
| `src/shared/view.js` | 検索とカテゴリの色の割り当て。画面とアプリが使う |
| `src/shared/theme.js` | 画面の値（色のライトとダーク、文字、角丸、動き）。画面（`tokens.css`）とアプリ（`src/mobile/theme.js`）が使う |
| `src/site/` | 一覧の画面（`app.js` は一覧・カテゴリ・タブ、`add.js` は追加、`settings.js` は設定、`auth.js` はログインの前、`ui.js` はシートと確認、`icons.js` はアイコン） |
| `src/extension/` | 拡張 |
| `src/mobile/` | iPhoneアプリ（Expo）。`metro.config.js` で `src/shared` を写さずに読む |
| `scripts/build.mjs` | `build/site`（`tokens.css` を書き出す）と `build/extension` を作る |
| `scripts/self-test.mjs` | 自己テスト（Worker の API は、D1 の代わりに Node の `node:sqlite` で試す） |
| `.github/workflows/mobile.yml` | `src/mobile`・`src/shared` が変わったmainへのpushで、テストと EAS Update への公開 |

## ビルドとテスト

```bash
node scripts/self-test.mjs
node scripts/build.mjs
```

- 一覧の画面と拡張は依存パッケージを持たない（Node 24以上。テストが `node:sqlite` を使う）。依存はルート（Worker の `@simplewebauthn/server` と `wrangler`、版は固定）と `src/mobile`（Expo の SDK に合う版を `npx expo install` で入れる）にだけ置く。
- `build/` と `release/` はGitで追跡しない。
- 拡張は `build/extension` を読み込む。`src/extension` を直接読み込むと `shared/store.js` がなく動かない。
- 公開の前に `npx wrangler deploy --dry-run` が通ることを確かめる。
- 手元で動かすときは `npx wrangler d1 migrations apply twimark --local` のあと `npx wrangler dev`。止めるときは `wrangler dev` の対話の画面で `x` か Ctrl-C を押し、ポートと `workerd` が残っていないことを確かめる。
- アプリは `src/mobile` で `npx expo export --platform ios --output-dir ../../build/mobile` が通ることと、`npx expo-doctor` に問題がないことを確かめる。動作は iPhone の Expo Go で確かめる。

```bash
cd src/mobile && npx expo export --platform ios --output-dir ../../build/mobile
```

## 配信

- 一覧の画面と API は、手元のログイン済みの wrangler で `npm run deploy` して公開する（自己テスト、ビルド、`wrangler deploy` の順。どれかが失敗したら止まる）。D1 の表を変えたときは先に `npm run db:migrate`。GitHub Actions では公開しない。
- 拡張はストアに出さず、パッケージ化されていない拡張機能として読み込む。読み書き先は `src/shared/store.js` の `PUBLIC_URL` で、`manifest.json` の `host_permissions` もそのホストだけにしている。URL を変えるときは両方を変える。
- アプリは App Store に出さない。`src/mobile`・`src/shared` が変わったmainへのpushで、Actionsが EAS Update の `main` チャンネルへ公開する（`--environment production`）。初回だけ `npx eas-cli init` でプロジェクトIDを `app.json` に入れ、リポジトリの Secrets に `EXPO_TOKEN` を入れる。どちらかがなければ公開をとばす。
- Expo Go は自分の SDK と同じ runtimeVersion（`exposdk:<版>`）の更新だけを開く。SDK を上げるのは、App Store 版の Expo Go がその SDK に上がってから。

## 安全

- このリポジトリは公開。ブックマークは D1 にあり、リポジトリには入らない。
- パスワード、トークン（Twimark、Expo）、個人の設定をコミットしない。wrangler が作業フォルダに書く `.wrangler/`（アカウント名＝メールアドレスを含む）もコミットしない（`.gitignore`）。D1 の ID と `app.json` の EAS のプロジェクトIDは秘密ではないのでコミットしてよい。アカウントIDは `wrangler.jsonc` に書かない。
- Cookie で認証した書き込みは、`Origin` が自分と同じでなければ拒む。ログインの前の書き込みも、別のオリジンからは拒む。Bearer（拡張とアプリ）は `Origin` を見ない。
- API の応答はすべて `cache-control: no-store`。
- 登録は `users` が0件のときだけ受け付ける。公開してすぐに利用者が登録し、`users` が1件であることを `wrangler d1 execute twimark --remote --command "SELECT count(*) FROM users"` で確かめる。
- パスワードは PBKDF2-SHA256（反復は `vars.PBKDF2_ITERATIONS`、既定10万回）。Free プランの CPU は1リクエスト10msなので、上限に当たって登録やログインが止まるなら下げる。使った回数は利用者ごとに `password_iterations` に残る。
- 取得した文字列は `textContent`（アプリは `<Text>`）でだけ描く。リンクと画像は `https:` のものだけを使う。
- 画面の `Content-Security-Policy` は、読み書き先を同じオリジン（`'self'`）だけにしている。読み書き先を増やすときはここも変える。
