---
title: Twimark 設定詳細
updated: 2026-10-21
sources:
  - docs/requirements/current-mvp.md
  - docs/requirements/project-rules.md
  - src/extension/manifest.json
  - src/site/index.html
  - .github/workflows/pages.yml
  - .github/workflows/mobile.yml
  - src/mobile/app.json
  - src/mobile/app.config.js
  - src/mobile/package.json
---

## 実行環境と配信先

- 一覧の画面: 素の HTML・JS・CSS。GitHub Pages で `https://totemonekoze.github.io/Twimark/` に配信する（公開リポジトリ `totemonekoze/Twimark`）。
- 拡張: Chrome / Edge の Manifest V3。ストアには出さない。
- iPhone アプリ: Expo SDK 57（App Store 版 Expo Go に合わせる）、JS。EAS Update の `main` チャンネルへ公開し、Expo Go で開く。`runtimeVersion` は `sdkVersion` の方針（`exposdk:57.0.0`）、`updates.url` は `app.json` の `extra.eas.projectId` から `app.config.js` が作る。
- 共通の処理は `src/shared`（`store.js` は GitHub への読み書きと一覧の操作、`meta.js` は URL の判定と取得、`view.js` は検索と色）。ビルドで画面と拡張に写し、アプリは `metro.config.js` の `watchFolders` で直接読む。

## 認証と秘密

- 編集用の GitHub fine-grained personal access token（Twimark リポジトリだけ、Contents の読み書き）。
- 置き場所: 画面は `localStorage`、拡張は `chrome.storage.local`、アプリはキーチェーン（`expo-secure-store`、キー `twimark.token`）。リポジトリには入れない。
- `EXPO_TOKEN`: EAS Update へ公開するための Expo のアクセストークン。GitHub のリポジトリの Actions の Secrets にだけ置く。トークンが漏れるとページのコードも書き換えられるので、期限を付ける。

## 拡張の権限（`manifest.json`）

- permissions: `activeTab`、`contextMenus`、`storage`
- host_permissions: `api.github.com`、`api.fxtwitter.com`、`note.com`、`qiita.com`
- content scripts: `x.com`、`twitter.com`、`mobile.twitter.com`、`note.com`、`qiita.com`

## 画面の安全の設定

- `Content-Security-Policy`: 読み書き先は `api.github.com` だけ、画像は `https:` と `data:`。読み書き先を増やすときはここも変える。
- 取得した文字列は `textContent` でだけ描き、リンクと画像は `https:` のものだけを使う。

## 配信の設定

- `.github/workflows/pages.yml`: main への push で動く。`paths-ignore: ['data/**']`。手動の実行（`workflow_dispatch`）もできる。
- `.github/workflows/mobile.yml`: `src/mobile/**`・`src/shared/**` が変わった main への push と手動の実行で動き、`eas update --auto --channel main --environment production` をする。`EXPO_TOKEN` か `app.json` のプロジェクトIDが無ければとばす。
- アプリの URL の scheme は `twimark`（Expo Go では使われず、`exp://u.expo.dev/...` になる）。
