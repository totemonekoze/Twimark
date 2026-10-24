# Twimark：拡張機能が Chrome / Edge に読み込めないのを直す

- 定義日: 2026-10-24
- 状態: reviewed
- 定義: Claude Code（2026-10-24）
  - 指示: 「拡張機能が読み込めません。改善してください。」
  - その後の回答: 症状は「`chrome://extensions` で読み込むときにエラーが出る」。エラーの文と選んだフォルダーは「分からない・記録なし」。

## 目的

- `chrome://extensions`（Edge は `edge://extensions`）の「パッケージ化されていない拡張機能を読み込む」で、エラーなく読み込めるようにする。
- 読み込むフォルダーを迷わないようにし、同じ失敗を自動の試験で見つけられるようにする。

## 前提（定義のときに確かめたこと）

- `node scripts/build.mjs` は `src/extension` と `src/shared` を `build/extension` に写す。手元の `build/extension` には、`manifest.json` が参照するファイル（`popup.html`、`options.html`、`background.js`、`content.js`、`content.css`）と `shared/` がそろっている。
- `build/extension` の全ファイルは UTF-8 として読め、`manifest.json` は JSON として読める。`_` で始まるファイル名もない。
- 定義のときの再現はできなかった。Google Chrome は 137 から `--load-extension` を受け付けない（ログに「not allowed in Google Chrome」）。Edge でも読み込みの記録が取れなかった。
- `src/extension` には `shared/` がない。ここを選ぶと読み込みはできても、ポップアップと設定の `import './shared/…'` が失敗する。
- 定義 `2026-10-24-003`（拡張の連携とアイコン）は未実装。この定義を先に実装する。

## 対象ファイル

| ファイル | 変更 |
|---|---|
| `src/extension/manifest.json` | エラーの文に合わせた直し（下の「原因の候補と直し」） |
| `scripts/build.mjs` | 最後に、読み込むフォルダーの絶対パスを出す |
| `scripts/self-test.mjs` | 下の「テスト」 |
| `README.md`、`docs/handbook/operations.md` | 読み込みの手順（選ぶフォルダー、入れ直し、エラーの見方） |
| `docs/knowledge/`（必要なら新規） | 原因が Chrome / Edge の挙動だったときだけ、その目印を書く |

## 方法

### 1. 原因を確かめる

- 実装者は最初に、利用者に次をもう一度聞く（AskUserQuestion）。エラーの画面を出したままにしてもらうと答えやすい。
  - 読み込むときに出た窓の文（「マニフェスト ファイルが…」など）。窓を閉じたあとなら、拡張のカードの「エラー」ボタンの中身。
  - 選んだフォルダー。
  - Chrome か Edge か、その版（`chrome://version`）。
- 文が分かれば、それに合う直しだけをする。分からなければ、下の候補を順に確かめて、当たるものを直す。

### 2. 原因の候補と直し

| 候補 | 出る文の例 | 直し |
|---|---|---|
| フォルダーの取り違え（`build`、プロジェクトのルート、`src`） | 「マニフェスト ファイルが存在しないか読み取れません」 | `build.mjs` が最後に「拡張は次のフォルダーを読み込む: <絶対パス>」を出す。README と `operations.md` に、選ぶのは `build/extension` で、`src/extension` ではないことを書く |
| `src/extension` を選んだ | 読み込めるが、ポップアップが白い・動かない | 同上（手順の文で防ぐ） |
| ビルドしていない・古い | 参照するファイルが読めない | 手順の最初に `node scripts/build.mjs` を置く。ビルドのたびに `build/` を消して作り直す今の動きは変えない |
| 参照の欠け・名前の違い | 「Could not load …」「Could not load icon …」 | `manifest.json` を直し、下の試験で欠けを見つける |
| 今の Chrome の決まりに合わない項目 | 「… is not allowed」「Invalid value for …」 | 出た項目だけを、今の Manifest V3 の書き方に直す |
| 前の版が別の場所から入ったまま | 同じ名前の拡張が2つ・前のエラーが残る | 手順に「前の Twimark をいったん削除してから読み込む」を書く |

- 当たった原因と直しは、完了報告に書く。Chrome / Edge の挙動に由来するものは `docs/knowledge/` にも残す（`two-layer-knowledge`）。

## テスト

`self-test.mjs` に、`build/extension` と同じ並び（`src/extension` に `src/shared` を `shared/` として足した形）で確かめる試験を足す。試験のために `build/` は書かない。

- `manifest.json` が JSON として読め、`manifest_version` が 3。
- `manifest.json` が参照するファイル（`action.default_popup`、`options_page`、`background.service_worker`、`content_scripts` の `js`・`css`、`icons` があればそれも）が、すべて `build/extension` にある。
- 拡張のページ（`popup.html`・`options.html`）の `<script src>` と、そこから辿る `import` が、すべて `build/extension` の中のファイルを指す（外を指さない、欠けがない）。
- `content.js` と `background.js` は `import` を持たない（コンテンツスクリプトとモジュールでない service worker は `import` できない）。

## 範囲外

- 定義 `2026-10-24-003` の内容（ログインでの連携、投稿の横のアイコン）
- Chrome ウェブストア・Edge アドオンへの公開、パッケージ（`.crx`）の作成
- コミット、プッシュ、公開（この定義の指示にない）

## 受け入れ条件

1. 原因が完了報告に書かれている（利用者のエラーの文か、当たった候補）。
2. `node scripts/self-test.mjs` がすべて成功する（「テスト」に挙げたものを含む）。
3. `node scripts/build.mjs` が、読み込むフォルダーの絶対パスを出す。
4. 利用者が Chrome か Edge で `build/extension` をエラーなく読み込め、ポップアップを開くと追加の画面が出る（トークンを入れていれば、カテゴリが読める）。
5. `check-handbook.mjs` が問題を出さない。

## 検証コマンド

```bash
node scripts/self-test.mjs
node scripts/build.mjs
```

```bash
for f in build/extension/*.js build/extension/shared/*.js; do node --check "$f" || exit 1; done
```

```bash
node C:/Users/SB-315/.claude/skills/project-handbook/scripts/check-handbook.mjs .
```

## 完了報告

- 実装: Claude Code（2026-10-24）
- **原因（受け入れ条件 1）:** 利用者にもう一度聞いたが、エラーの文は「分からない」。そこで候補を順に確かめた。
  - 今の `build/extension` は、Edge 156 のヘッドレス（`--load-extension`）でエラーなく読み込まれ、service worker も動いた（プロファイルの `Secure Preferences` に `disable_reasons: []`、`has_started_service_worker: true`）。Chrome 156 は `--load-extension` を無視するので試せない。Edge と Chrome は同じ Chromium の 156 系で、manifest の読み方は同じ。
  - manifest の参照の欠け、ページの `import` の外れ、文字コード、`_` で始まる名前、ブラウザのポリシー（レジストリの `Policies\Google\Chrome`・`Microsoft\Edge`）のどれもなかった。
  - 残る候補のうち一番ありそうなのは、フォルダーの取り違え（`build`・プロジェクトのフォルダー・`src/extension` を選ぶ）。確定はしていない。
- **直したこと:**
  - `scripts/build.mjs` が最後に「拡張は次のフォルダーを読み込む: <絶対パス>」を出す。
  - `scripts/self-test.mjs` に「拡張: manifest の参照とページの import が、すべて build/extension の中にある」を足した。わざと `popup.js` の `import` を `../shared/` に変えた形と、`content.js` に `import` を足した形で、どちらも失敗することを確かめてから戻した。
  - `README.md` と `docs/handbook/operations.md`（`updated` を 2026-10-24 に）に、選ぶフォルダー、選び間違えたときに出る文、前の Twimark を先に削除すること、エラーの控え方を書いた。
  - `manifest.json` は変えていない（直すべき誤りがなかった）。
- **検証の実行と結果:**
  - `node scripts/self-test.mjs`: 63件すべて成功。
  - `node scripts/build.mjs`: 成功。最後に `build\extension` の絶対パスを出した。
  - `build/extension` の全 JS が `node --check` を通った。
  - `check-handbook.mjs`: 問題なし。
- **定義の外での判断:**
  - 試験は定義のとおり `build/` を書かず、`src/extension` と `src/shared` を合わせた並びで辿る。
  - Edge のヘッドレスで読み込みを確かめる方法を Shared Knowledge（`investigations/verify-unpacked-extension-load-without-chrome-flag.md`）に残した。
- **未確認（受け入れ条件 4）:** 利用者が Chrome か Edge で `build/extension` を読み込み、ポップアップが開くこと。まだエラーが出るなら、その文で原因を絞る。

## レビュー記録

- レビュー: Claude Code（2026-10-24）
- **判定:** 受け入れ条件 1〜5 を満たす。受け入れ条件 4 は、利用者が `build/extension` を読み込めたと答えた（2026-10-24）。
- **差分の確認:**
  - `build.mjs`: 表示する場所は、ビルドが書く `build/extension` と同じ求め方（`import.meta.url` からの相対）。問題なし。
  - `README.md`・`operations.md`: 手順は `build.mjs` の動きと合う。`operations.md` の `updated` は進んでいる。
  - `self-test.mjs`: 試験の並び（`src/extension` に `src/shared` を `shared/` として足した形）は、実際の `build/extension` のファイルの一覧と同じだった（`find` の結果の `diff` で一致）。
- **見つけて直したもの:**
  - import を探す正規表現が、`export const E = '.png'` のような `.` で始まる文字列も import と取り違えていた（今のコードにはないが、足されると誤って失敗する）。`import '…'`・`import … from '…'`・`export … from '…'` だけを拾う形に直した。
  - README のエラーの文は、Chrome の日本語の文を確かめていなかった。英語の原文（「Manifest file is missing or unreadable」）と趣旨で書く形に直した。
- **設計して走らせた試験:**
  - 判定の正規表現を、複数行の import、`export … from`、`import './x'`、`import x from`、`.` で始まる文字列、行の途中の `import()` で試した。前の4つは拾い、後の2つは拾わない。
  - 壊した形で試験が失敗するか（どれも元に戻した）: `popup.js` の import を `../shared/` に、`./shared/nope.js` に、`popup.html` の CSS を無いファイルに、`manifest.json` の `content.css` を無いファイルに。4つとも失敗し、どこが欠けたかを出した。実装者の試した `content.js` への `import` の追加と合わせ、欠け・外れ・置けない import をすべて見つける。
  - `node scripts/self-test.mjs`: 63件すべて成功。`node scripts/build.mjs` と `build/extension` の全 JS の `node --check` が通った。`check-handbook.mjs`: 問題なし。
- **残すもの:**
  - 行の途中の動的な `import()` は辿らない（拡張にはない）。使うときは試験を広げる。
  - 読み込めなかった本当の原因は確定していない。また起きたら、そのときのエラーの文で原因を絞る。
