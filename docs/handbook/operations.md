---
title: Twimark 作業書
updated: 2026-09-29
sources:
  - README.md
  - docs/requirements/project-rules.md
  - package.json
  - .github/workflows/pages.yml
---

## 確かめる・作る

```bash
node scripts/self-test.mjs
node scripts/build.mjs
```

- 依存パッケージは無い（Node 22 以上）。ビルドは `build/site` と `build/extension` を作る。`build/` と `release/` は Git で追跡しない。

## 拡張を入れる・更新する

1. `node scripts/build.mjs`
2. `chrome://extensions`（Edge は `edge://extensions`）でデベロッパーモードをオンにし、「パッケージ化されていない拡張機能を読み込む」で `build/extension` を選ぶ（`src/extension` を直接読み込むと `shared/store.js` が無く動かない）
3. 拡張の「オプション」でトークンを入れ、「接続を確かめる」
4. コードを変えたらビルドし直し、拡張のページで再読み込み。開いていた X・note・Qiita のタブも再読み込みする

## 一覧の画面を出す

- main への push で `.github/workflows/pages.yml` がテスト、ビルド、Pages への配信を行う。`data/` だけの変更では配信しない。
- 初回だけ、リポジトリの Settings → Pages の Source を「GitHub Actions」にする。
- 編集するブラウザでは、画面右上の「設定」でトークンを入れる。

## トークンを発行し直す

GitHub の Fine-grained tokens で、リポジトリは Twimark だけ、権限は Contents の Read and write だけ、期限を付けて発行する。切れたら発行し直し、画面と拡張の設定に入れ直す。

## 気をつけること

- 画面と拡張の書き込みは main へのコミット。手元の変更を push する前に `git pull` する。
- `data/bookmarks.json` は手で編集しない。
