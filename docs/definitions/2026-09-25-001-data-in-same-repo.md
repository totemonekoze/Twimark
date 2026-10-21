# データを同じリポジトリの `data/` に置き、閲覧はトークンなしにする

- 定義日: 2026-09-25
- 状態: reviewed
- 定義: Claude Code（2026-09-25、「データ用リポジトリを作らず、同じリポジトリの別フォルダに格納してもらえませんか？」、その後の回答「同じリポジトリにする（ブックマークが公開になること、トークンの対象がコードのリポジトリになることを承知）」「トークンなしで見られる」）
- 実装: Claude Code（2026-09-25、同じ指示）
- レビューとコミット: Claude Code（2026-10-21、「前回の変更をレビューしてコミットしてください」。push はしない）

## 目的

データ用の非公開リポジトリをやめ、ブックマークを公開リポジトリ `totemonekoze/Twimark` の `data/bookmarks.json` に置く。データは公開になるので、一覧はトークンなしで見られるようにし、編集（拡張からの追加、カテゴリの変更、削除など）だけトークンを要るようにする。

`2026-09-24-001-twimark-mvp.md` の「データは別の非公開リポジトリ」「トークンを入れていないブラウザでは中身は何も見えない」をこの定義で置き換える。正本（`AGENTS.md`、`docs/requirements/`）を先に直す。

## 対象ファイル

| ファイル | 変更 |
|---|---|
| `AGENTS.md` | 制約を「データは `data/bookmarks.json` に画面と拡張が書く。公開される。トークンと個人の設定はコミットしない」に直す |
| `docs/requirements/current-mvp.md`、`docs/requirements/project-rules.md`、`README.md` | 置き場所、閲覧、トークン、pushの前のpullを直す |
| `.gitignore` | `bookmarks.json` の行を消す |
| `src/shared/store.js` | 置き場所を `DATA_REPO`（`totemonekoze/Twimark`）の `data/bookmarks.json` に固定する。トークンがなければ認証なしで読む |
| `src/site/index.html`、`app.js`、`style.css` | 設定はトークンだけ。トークンがなければ読み込みだけ行い、編集の操作を隠す |
| `src/extension/options.html`、`options.js`、`popup.html`、`popup.js` | 設定はトークンだけ |
| `.github/workflows/pages.yml` | `data/**` だけの変更では配信しない |
| `scripts/self-test.mjs` | 置き場所とトークンなしの読み込みを確かめる |

## 方法

- `store.js`: `DATA_REPO = { owner: 'totemonekoze', repo: 'Twimark' }`、`DATA_PATH = 'data/bookmarks.json'`。`createStore(token)` にする。トークンが空なら `authorization` を付けずに送る（未認証はIPごとに1時間60回。ページを開くたびに1〜2回）。書き込みはトークンがなければ `StoreError('read_only')`。
- 一覧の画面:
  - `localStorage` の設定はトークンだけを読む（前の形 `{ owner, repo, token }` から `token` を引き継ぐ）。
  - トークンがなくても読み込んで一覧を出す。`<body>` に `read-only` を付け、カードのカテゴリの変更と削除、サイドメニューの並べ替え・削除・カテゴリの追加を隠す。
  - 設定のダイアログはトークンの欄だけ。「このブラウザから消す」は残す。
  - 未設定の案内（`setup` の状態）はなくす。
- 拡張: 設定はトークンだけ。「接続を確かめる」は書き込みの権限までは確かめない（読めるかと件数だけ）。
- ワークフロー: `on.push.paths-ignore: ['data/**']`。
- 画面と拡張の書き込みは `main` へのコミットになるので、手元でコードを変えてpushする前に `git pull` する（`project-rules.md` に書く）。

## 範囲外

- 既存のデータの移行（まだデータはない）
- 書き込み権限の事前確認、トークンの権限をフォルダ単位に絞ること（GitHubのfine-grained tokenはできない）
- コミットとプッシュ（今回の指示にない）

## 受け入れ条件

1. `node scripts/self-test.mjs` がすべて成功する。追加で次を確かめる。
   - 読み書きの先が `https://api.github.com/repos/totemonekoze/Twimark/contents/data/bookmarks.json`。
   - トークンが空なら `authorization` を送らずに読め、書き込みは `read_only` で拒む。
2. `node scripts/build.mjs` のあと、全JSが `node --check` を通り、`manifest.json` がJSONとして読める。
3. 一覧の画面をGitHub APIの偽物で確かめる: トークンなしで一覧が出て編集の操作が出ない、トークンを入れると編集の操作が出て書き込める。
4. 公開リポジトリに入るファイルにトークンと個人のデータを含まない。

## 検証コマンド

```bash
node scripts/self-test.mjs
node scripts/build.mjs
```

```bash
for f in build/site/*.js build/site/shared/*.js build/extension/*.js build/extension/shared/*.js; do node --check "$f" || exit 1; done; node -e "JSON.parse(require('fs').readFileSync('build/extension/manifest.json','utf8'))"
```

## 完了報告

### 実行したコマンドと結果

- `node scripts/self-test.mjs`: 18件すべて成功。読み書きの先が `totemonekoze/Twimark` の `data/bookmarks.json` であること、トークンなしでは `authorization` を送らずに読み、書き込みを `read_only` で拒む（GitHubへ送らない）こと、非公開のリポジトリをトークンなしで読むとトークンを入れるよう案内することを確かめた（受け入れ条件1）
- `node scripts/build.mjs` のあと、全JSが `node --check` を通り、`manifest.json` がJSONとして読めた（受け入れ条件2）
- 一覧の画面（一時的に起動した静的サーバー。確認後に停止し、プロセスとポートがないことを確かめた）（受け入れ条件3）
  - 本物のGitHub APIをトークンなしで読むと、リポジトリが見つからないと出た。`gh api` で確かめると、`totemonekoze/Twimark` は非公開（private）になっていた。
  - GitHub APIを画面の中で偽物に差し替えると、トークンなしでは `authorization` なしで読み、一覧を出し、カードのカテゴリの変更・削除とサイドメニューの並べ替え・削除・カテゴリの追加が出なかった。トークンを入れると編集の操作が出て、`Bearer` 付きで書き込めた。`localStorage` には `{ token }` だけが残り、「このブラウザから消す」で消えた。
- 公開リポジトリに入るファイルにトークンの文字列がないことは、前回の検索のあと、トークンを書くコードを足していないことで確かめた（受け入れ条件4）

### 定義の外で決めたこと

- 非公開のリポジトリをトークンなしで読んで404になったときは、「非公開のリポジトリなら、右上の『設定』でトークンを入れてください」と案内する。リポジトリが非公開になっていたことが確認の途中で分かったため。
- 設定のダイアログの上に「見るだけならトークンは要りません」の一文を足した。

### 確かめていないこと

- リポジトリが非公開のままでは、トークンなしの閲覧はできない。またGitHub Pagesを非公開のリポジトリから配信するにはGitHub Proなどの有料プランが要る。どちらにするかは利用者が決める。
- 拡張機能を実際のChrome/Edgeに読み込んでの動作（前回から変わらず）。

## レビュー記録

2026-10-21、Claude Code。判定: 合格（修正なし）。

### 差分のレビュー

16ファイルの差分を、定義の対象ファイルと方法に照らして読んだ。

- `store.js`: 読み書きの先が `DATA_REPO` の `data/bookmarks.json` に固定されている。トークンが空なら `authorization` を送らず、書き込みは GitHub へ送る前に `read_only` で拒む。非公開のリポジトリで 404 になったときの案内もある。定義どおり。
- 一覧の画面:
  - 前の形 `{ owner, repo, token }` の `localStorage` からも `token` を読む。
  - `read-only` で隠す要素のクラス（`.change`、`.delete`、`.side-move`、`.side-del`、`.side-extra`）が、`index.html` と `app.js` で作る要素のクラスと一致する。
  - ドラッグと ↑↓ キーの並べ替えはつまみ（`.side-move`）にだけ付いているので、隠せば操作できない。仮に操作されても `read_only` で止まる。
  - `setup` の状態とその文言は、HTML と JS の両方から消えている。
- 拡張: 設定、ポップアップ、接続の確認がトークンだけを使う。`owner`・`repo`・`Twimark-data` の残りはない（`grep` で確認）。
- `pages.yml` の `paths-ignore: ['data/**']`、`.gitignore` から `bookmarks.json` を外したこと、`AGENTS.md`・`README.md`・`docs/requirements/` の書き換えは、定義の対象ファイルの表と一致する。

### 実行したテストと結果

- `node scripts/self-test.mjs`: 18件すべて成功
- `node scripts/build.mjs` のあと、全 JS の `node --check` と `manifest.json` の JSON 読み込みが成功
- `check-handbook.mjs`: 資料3件、問題なし
- リポジトリに入るファイルに、`github_pat_`・`ghp_` で始まるトークンの文字列はない（`.git` と `build` を除いて `grep`）

### 残ること（修正ではない）

- `totemonekoze/Twimark` は非公開のまま（2026-10-21 に `gh repo view` で確認）。`AGENTS.md` と要件は「公開」と書いている。公開にするか、文書を非公開に合わせるかは利用者が決める。非公開のままだと、トークンなしの閲覧と、無料プランでの GitHub Pages の配信はできない。
- 拡張を実際の Chrome/Edge に読み込んでの動作は、今回も確かめていない。
