---
title: Twimark 設定詳細
updated: 2026-09-29
sources:
  - docs/requirements/current-mvp.md
  - docs/requirements/project-rules.md
  - src/extension/manifest.json
  - src/site/index.html
  - .github/workflows/pages.yml
---

## 実行環境と配信先

- 一覧の画面: 素の HTML・JS・CSS。GitHub Pages で `https://totemonekoze.github.io/Twimark/` に配信する（公開リポジトリ `totemonekoze/Twimark`）。
- 拡張: Chrome / Edge の Manifest V3。ストアには出さない。
- 共通の処理は `src/shared/store.js`（GitHub への読み書きと一覧の操作）。ビルドで画面と拡張の両方に写す。

## 認証と秘密

- 編集用の GitHub fine-grained personal access token（Twimark リポジトリだけ、Contents の読み書き）。
- 置き場所: 画面は `localStorage`、拡張は `chrome.storage.local`。リポジトリには入れない。トークンが漏れるとページのコードも書き換えられるので、期限を付ける。

## 拡張の権限（`manifest.json`）

- permissions: `activeTab`、`contextMenus`、`storage`
- host_permissions: `api.github.com`、`api.fxtwitter.com`、`note.com`、`qiita.com`
- content scripts: `x.com`、`twitter.com`、`mobile.twitter.com`、`note.com`、`qiita.com`

## 画面の安全の設定

- `Content-Security-Policy`: 読み書き先は `api.github.com` だけ、画像は `https:` と `data:`。読み書き先を増やすときはここも変える。
- 取得した文字列は `textContent` でだけ描き、リンクと画像は `https:` のものだけを使う。

## 配信の設定

- `.github/workflows/pages.yml`: main への push で動く。`paths-ignore: ['data/**']`。手動の実行（`workflow_dispatch`）もできる。
