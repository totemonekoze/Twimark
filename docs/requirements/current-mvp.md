# Twimark 現行要件

X・note・Qiitaの投稿と記事を、カテゴリ付きのカードで見るブックマークツール。PortalのTipsの使い勝手を単独のツールにしたもの。

## 構成

- 一覧の画面: GitHub Pages（公開リポジトリ `totemonekoze/Twimark`）。素のHTML・JS・CSSで、ビルドは `src/shared` を写すだけ。
- データ: 同じリポジトリの `data/bookmarks.json`。GitHub REST APIで読み書きする。1回の書き込みが `main` への1コミット。データは公開で、誰でも見られる。
- 閲覧: トークンなしで見られる（未認証のGitHub APIで読む。IPごとに1時間60回まで）。
- 編集: 利用者が発行するfine-grained personal access token（`Twimark` リポジトリだけ、Contentsの読み取りと書き込み）が要る。画面は `localStorage`、拡張は `chrome.storage.local` に置く。トークンが漏れるとページのコードも書き換えられるので、期限を付ける。
- 拡張: Chrome/Edge（Manifest V3）。

## データの形

`{ version: 1, categories: string[], bookmarks: Bookmark[] }`。`Bookmark` は `id`（`x:<ID>`・`note:<キー>`・`qiita:<ID>`）、`site`、`url`、`author { name, handle }`、`postedAt`、`title`（記事）、`text`、`photos[{ url }]`、`videos[{ thumbnail }]`、`category`、`savedAt`。

- カテゴリは30個まで、名前は20文字まで。既定はPortalのTipsと同じ6つ。
- 削除したカテゴリのブックマークは消さず、「未分類」に出る。

## 対象のURL

| サイト | URL | 取得元 |
|---|---|---|
| X | `https://x.com/<handle>/status/<ID>`（`twitter.com`、`mobile.twitter.com`、`/i/web/status/<ID>` も） | fxtwitter |
| note | `https://note.com/<ユーザー>/n/<キー>` | 記事のHTMLのJSON-LDとOGP |
| Qiita | `https://qiita.com/<ユーザー>/items/<ID>` | 記事のHTMLのJSON-LDとOGP |

取得できなかったときは本文を貼り付けて保存する。要約は持たない。

## 拡張の追加の入口

1. ツールバーのボタン（開いているタブ）
2. 右クリック（対象のリンク、対象のページ）
3. 共有メニューに差し込んだ「Twimarkに追加」（Xのポストの共有メニュー、noteの記事の共有メニューと記事下の並び、Qiitaの記事の共有の並び）

どれも追加の画面を開き、カテゴリ（前回選んだもの）を選んで追加する。保存済みなら追加させない。

## 一覧の画面

- サイドメニュー: すべて、カテゴリ（件数、色、ドラッグと ↑↓ キーでの並べ替え、削除）、未分類、カテゴリの追加
- 検索（NFKCでそろえ、空白区切りの語をすべて含む）、サイトの絞り込み。絞り込みと検索語はURLのクエリに残す
- カード: カテゴリ、サイト、画像、タイトル、本文（6行で折りたたみ）、作者、日付、元のページへのリンク、カテゴリの変更、削除
- 画面からの追加はない（`docs/backlog.md` の B-001）
