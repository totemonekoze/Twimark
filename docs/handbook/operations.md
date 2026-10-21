---
title: Twimark 作業書
updated: 2026-10-21
sources:
  - README.md
  - docs/requirements/project-rules.md
  - package.json
  - wrangler.jsonc
  - .github/workflows/mobile.yml
---

## 確かめる・作る

```bash
node scripts/self-test.mjs
node scripts/build.mjs
npx wrangler deploy --dry-run
```

- 一覧の画面と拡張に依存パッケージは無い（Node 24 以上。テストが `node:sqlite` を使う）。Worker の依存はルートの `npm ci` で入る。ビルドは `build/site` と `build/extension` を作る。`build/` と `release/` は Git で追跡しない。
- アプリは `src/mobile` で `npm ci` のあと `npx expo export --platform ios --output-dir ../../build/mobile` が通るかを見る。
- 手元で動かすときは `npx wrangler d1 migrations apply twimark --local` のあと `npx wrangler dev`。止めたら、ポートと `workerd` が残っていないことを確かめる。

## 一覧の画面と API を公開する

1. 手元のログイン済みの wrangler で、D1 の表を変えたときは `npm run db:migrate`
2. `npm run deploy`（自己テスト、ビルド、`wrangler deploy` の順。どれかが失敗したら止まる）
3. 初めての公開のあとは、すぐに利用者が画面で登録し、`wrangler d1 execute twimark --remote --command "SELECT count(*) FROM users"` が 1 であることを確かめる
4. `git status` で `.wrangler/` がコミットの対象に入っていないことを確かめる

## 拡張を入れる・更新する

1. `node scripts/build.mjs`
2. `chrome://extensions`（Edge は `edge://extensions`）でデベロッパーモードをオンにし、「パッケージ化されていない拡張機能を読み込む」で `build/extension` を選ぶ
3. 一覧の画面の「設定」で端末のトークンを発行し、拡張の「オプション」に入れて「接続を確かめる」
4. コードを変えたらビルドし直し、拡張のページで再読み込み。開いていた X・note・Qiita のタブも再読み込みする

## アプリを出す・開く

1. 一度だけ: iPhone の Expo Go に Expo のアカウントでサインインする。`src/mobile` で `npx eas-cli login`、`npx eas-cli init`（プロジェクトIDが `app.json` に入るのでコミット）。Expo のアクセストークンを GitHub の Secrets に `EXPO_TOKEN` で入れる
2. main への push（`src/mobile`・`src/shared` の変更）で `.github/workflows/mobile.yml` が EAS Update の `main` チャンネルへ公開する。準備が無ければ公開をとばす
3. Expo Go で `exp://u.expo.dev/<プロジェクトID>?channel-name=main` を開き、「設定」の「ブラウザでログイン」でログインする
4. 共有シートのショートカットは README の手順で作る。URL はアプリの「設定」からコピーする
5. 手元で試すときは `src/mobile` で `npx expo start` し、iPhone で QR コードを読む

## 気をつけること

- パスワードを変えると、ほかのセッションと端末のトークンはすべて使えなくなる。拡張とアプリはログインし直す。
- 登録やログインが CPU の上限で止まるときは、`wrangler.jsonc` の `vars.PBKDF2_ITERATIONS` を下げて公開し直す。
