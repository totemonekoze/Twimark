# Twimark 作業ルール

## 正本

- 現行要件: `docs/requirements/current-mvp.md`
- プロジェクト運用: `docs/requirements/project-rules.md`
- Knowledgeの入口: `docs/INDEX.md`
- 作業記録の目録: `docs/INDEX-records.md`

## 構成

- ソース=`src`、通常ビルド=`build`、リリース=`release`
- `src/site`（一覧の画面）、`src/extension`（拡張）、`src/mobile`（iPhoneアプリ、Expo）が `src/shared` を共有する。依存パッケージは `src/mobile` にだけある

## このプロジェクトの制約

- このリポジトリは公開（GitHub Pages）。ブックマークのデータは `data/bookmarks.json` にあり、誰でも見られる。このファイルは画面と拡張がGitHub API経由で書くもので、手で編集してコミットしない。
- トークン（GitHub、Expo）と個人の設定はコミットしない。
- 画面と拡張とアプリの書き込みは `main` へのコミットになる。手元の変更をpushする前に `git pull` する。
