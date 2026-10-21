---
title: Twimark 設定詳細
updated: 2026-10-21
sources:
  - docs/requirements/current-mvp.md
  - docs/requirements/project-rules.md
  - wrangler.jsonc
  - migrations/0001_init.sql
  - src/extension/manifest.json
  - src/site/index.html
  - .github/workflows/mobile.yml
  - src/mobile/app.json
  - src/mobile/app.config.js
  - src/mobile/package.json
---

## 実行環境と配信先

- 一覧の画面と API: Cloudflare Workers の Worker `twimark`（`https://twimark.ho-service.workers.dev`）。静的アセットは `build/site`、`/api/*` だけ Worker（`src/worker/index.js`）を先に通す（`run_worker_first`）。`preview_urls` は切っている。
- データ: Cloudflare D1 の `twimark`（バインド `DB`、表は `migrations/`）。
- 拡張: Chrome / Edge の Manifest V3。ストアには出さない。
- iPhone アプリ: Expo SDK 57（App Store 版 Expo Go に合わせる）、JS。EAS Update の `main` チャンネルへ公開し、Expo Go で開く。`runtimeVersion` は `sdkVersion` の方針（`exposdk:57.0.0`）、`updates.url` は `app.json` の `extra.eas.projectId` から `app.config.js` が作る。
- 共通の処理は `src/shared`（`store.js` は API の呼び出しと操作と名前の決まり、`meta.js` は URL の判定と取得、`view.js` は検索と色）。ビルドで画面と拡張に写し、アプリは `metro.config.js` の `watchFolders` で、Worker は wrangler の束ねで直接読む。

## 認証と秘密

- 利用者は1人。パスワードは PBKDF2-SHA256（反復は `vars.PBKDF2_ITERATIONS`、既定 100000）で D1 に置く。パスキーは `@simplewebauthn/server` で確かめ、rpID はリクエストのホスト名。
- 一覧の画面は Cookie `__Host-twimark`（HttpOnly・Secure・SameSite=Strict、30日）。拡張とアプリは端末のトークン（Bearer、365日）。どちらも D1 には SHA-256 だけを置く。
- 置き場所: 拡張は `chrome.storage.local`、アプリはキーチェーン（`expo-secure-store`、キー `twimark.token`）。
- Worker の Secrets は使わない。`EXPO_TOKEN`（EAS Update へ公開するための Expo のアクセストークン）だけを GitHub のリポジトリの Actions の Secrets に置く。
- アカウントIDは `wrangler.jsonc` に書かない（ログイン済みの wrangler が補う）。`.wrangler/` はコミットしない。

## 拡張の権限（`manifest.json`）

- permissions: `activeTab`、`contextMenus`、`storage`
- host_permissions: `twimark.ho-service.workers.dev`、`api.fxtwitter.com`、`note.com`、`qiita.com`
- content scripts: `x.com`、`twitter.com`、`mobile.twitter.com`、`note.com`、`qiita.com`

## 画面の安全の設定

- `Content-Security-Policy`: 読み書き先は同じオリジン（`'self'`）だけ、画像は `https:` と `data:`、`form-action 'self'`。読み書き先を増やすときはここも変える。
- API の応答はすべて `cache-control: no-store`。Cookie で認証した書き込みと、ログインの前の書き込みは、`Origin` が別なら拒む。
- 取得した文字列は `textContent` でだけ描き、リンクと画像は `https:` のものだけを使う。

## 配信の設定

- `npm run deploy`: 自己テスト、ビルド、`wrangler deploy`。`npm run db:migrate`: `wrangler d1 migrations apply twimark --remote`。手元のログイン済みの wrangler から行う。
- `.github/workflows/mobile.yml`: `src/mobile/**`・`src/shared/**` が変わった main への push と手動の実行で動き、`eas update --auto --channel main --environment production` をする。`EXPO_TOKEN` か `app.json` のプロジェクトIDが無ければとばす。
- アプリの URL の scheme は `twimark`（Expo Go では使われず、`exp://u.expo.dev/...` になる）。
