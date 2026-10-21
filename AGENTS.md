# Twimark 作業ルール

## 正本

- 現行要件: `docs/requirements/current-mvp.md`
- プロジェクト運用: `docs/requirements/project-rules.md`
- Knowledgeの入口: `docs/INDEX.md`
- 作業記録の目録: `docs/INDEX-records.md`

## 構成

- ソース=`src`、通常ビルド=`build`、リリース=`release`
- `src/worker`（Cloudflare Workers の API）、`src/site`（一覧の画面）、`src/extension`（拡張）、`src/mobile`（iPhoneアプリ、Expo）が `src/shared` を共有する。依存パッケージはルート（Worker）と `src/mobile` にだけある

## このプロジェクトの制約

- このリポジトリは公開。ブックマークは Cloudflare D1 にあり、ログインした利用者（1人）だけが読み書きできる。リポジトリには入らない。
- パスワード、トークン（Twimark、Expo）、個人の設定はコミットしない。wrangler が書く `.wrangler/`（メールアドレスを含む）もコミットしない。アカウントIDは `wrangler.jsonc` に書かない。
- 公開は手元のログイン済みの wrangler から `npm run deploy` で行う。
