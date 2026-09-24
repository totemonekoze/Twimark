# Twimark 運用ルール

## 場所

| 場所 | 内容 |
|---|---|
| `src/shared/store.js` | GitHubへの読み書きと一覧の操作。画面と拡張の両方が使う |
| `src/site/` | 一覧の画面 |
| `src/extension/` | 拡張 |
| `scripts/build.mjs` | `build/site` と `build/extension` を作る |
| `scripts/self-test.mjs` | 自己テスト |
| `.github/workflows/pages.yml` | mainへのpushでテスト、ビルド、Pagesへの配信 |

## ビルドとテスト

```bash
node scripts/self-test.mjs
node scripts/build.mjs
```

- 依存パッケージは持たない（Node 22以上）。
- `build/` と `release/` はGitで追跡しない。
- 拡張は `build/extension` を読み込む。`src/extension` を直接読み込むと `shared/store.js` がなく動かない。

## 配信

- 一覧の画面は、mainへのpushでActionsが配信する。初回だけ、リポジトリの Settings → Pages の Source を「GitHub Actions」にする。
- 拡張はストアに出さず、パッケージ化されていない拡張機能として読み込む。

## 安全

- このリポジトリは公開。データ（`bookmarks.json`）、トークン、個人の設定をコミットしない。
- 取得した文字列は `textContent` でだけ描く。リンクと画像は `https:` のものだけを使う。
- 画面の `Content-Security-Policy` は、読み書き先を `api.github.com` だけにしている。読み書き先を増やすときはここも変える。
