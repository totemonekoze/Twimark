# Twimark 運用ルール

## 場所

| 場所 | 内容 |
|---|---|
| `src/shared/store.js` | GitHubへの読み書きと一覧の操作。画面・拡張・アプリが使う |
| `src/shared/meta.js` | 追加できるURLの判定と、保存する項目の取得。拡張とアプリが使う |
| `src/shared/view.js` | 検索とカテゴリの色の決まり。画面とアプリが使う |
| `src/site/` | 一覧の画面 |
| `src/extension/` | 拡張 |
| `src/mobile/` | iPhoneアプリ（Expo）。`metro.config.js` で `src/shared` を写さずに読む |
| `src/mobile/github.js` | アプリの保存先。iOS が GitHub API の応答を60秒キャッシュするので、読み込みの URL に時刻を付ける |
| `scripts/build.mjs` | `build/site` と `build/extension` を作る |
| `scripts/self-test.mjs` | 自己テスト |
| `.github/workflows/pages.yml` | mainへのpushでテスト、ビルド、Pagesへの配信 |
| `.github/workflows/mobile.yml` | `src/mobile`・`src/shared` が変わったmainへのpushで、テストと EAS Update への公開 |

## ビルドとテスト

```bash
node scripts/self-test.mjs
node scripts/build.mjs
```

- 一覧の画面と拡張は依存パッケージを持たない（Node 22以上）。依存パッケージは `src/mobile` にだけ置き、Expo の SDK に合う版を `npx expo install` で入れる。
- `build/` と `release/` はGitで追跡しない。
- 拡張は `build/extension` を読み込む。`src/extension` を直接読み込むと `shared/store.js` がなく動かない。
- アプリは `src/mobile` で `npx expo export --platform ios --output-dir ../../build/mobile` が通ることと、`npx expo-doctor` に問題がないことを確かめる。動作は iPhone の Expo Go で確かめる。

```bash
cd src/mobile && npx expo export --platform ios --output-dir ../../build/mobile
```

## 配信

- 一覧の画面は、mainへのpushでActionsが配信する。初回だけ、リポジトリの Settings → Pages の Source を「GitHub Actions」にする。
- 拡張はストアに出さず、パッケージ化されていない拡張機能として読み込む。
- アプリは App Store に出さない。`src/mobile`・`src/shared` が変わったmainへのpushで、Actionsが EAS Update の `main` チャンネルへ公開する（`--environment production`）。初回だけ `npx eas-cli init` でプロジェクトIDを `app.json` に入れ、リポジトリの Secrets に `EXPO_TOKEN` を入れる。どちらかがなければ公開をとばす。
- Expo Go は自分の SDK と同じ runtimeVersion（`exposdk:<版>`）の更新だけを開く。SDK を上げるのは、App Store 版の Expo Go がその SDK に上がってから。

## 安全

- このリポジトリは公開。ブックマークのデータ（`data/bookmarks.json`）も公開される。このファイルは画面と拡張がGitHub API経由で書くもので、手で編集してコミットしない。
- トークン（GitHub、Expo）と個人の設定をコミットしない。`app.json` の EAS のプロジェクトIDは秘密ではないのでコミットしてよい。
- 画面と拡張とアプリの書き込みは `main` へのコミットになる。手元の変更をpushする前に `git pull` する。
- `data/` だけの変更では、ワークフローはPagesへ配信しない（`paths-ignore`）。
- 取得した文字列は `textContent`（アプリは `<Text>`）でだけ描く。リンクと画像は `https:` のものだけを使う。
- 画面の `Content-Security-Policy` は、読み書き先を `api.github.com` だけにしている。読み書き先を増やすときはここも変える。
