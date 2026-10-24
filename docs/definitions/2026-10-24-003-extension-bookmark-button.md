# Twimark：拡張機能をアカウントと連携し、投稿・記事にブックマークのアイコンを出す

- 定義日: 2026-10-24
- 状態: defined
- 定義: Claude Code（2026-10-24）
  - 指示: 「ブックマーク追加拡張機能の実装 twimarkのアカウントと連携し、ブックマークを追加できるChrome/egde向けの拡張機能を実装します。ブックマークボタンの追加箇所は各サイトのリンク共有ボタンの中、またはブックマークボタンの隣。投稿ポストや記事内に表示するブックマークボタンはアイコンで表示します。」
  - その後の回答: 連携のしかた・アイコンを押したときの動きの質問は「どれでもよい」だったので、推奨の案にした。
    - 連携のしかた: ログインして連携（トークンの貼り付けは予備に残す）
    - アイコンを押したとき: その場に小さな画面を出す

## 目的

- **アカウントと連携:** 拡張から Twimark にログインして連携できるようにする。今はトークンを一覧の画面で発行し、拡張の設定に貼り付けている。
- **ブックマークのアイコン:** X のポスト、note・Qiita の記事の、サイトのブックマーク（にあたる）ボタンの隣に、Twimark のアイコンを出す。押すとその場でカテゴリを選んで追加できる。
  - 保存済みのものは、アイコンの形で分かるようにする。
  - 今の共有メニューの中の「Twimarkに追加」は残す。

## 前提

- 拡張（`src/extension`、Manifest V3、Chrome/Edge）は、ツールバーのボタン・右クリック・共有メニューの3経路で追加できる（定義 2026-09-24-001 から）。
- 拡張のトークンは `sessions.app = 0`（設定の操作はできない）。これは変えない。
- 拡張のアイコンの絵は、定義 `2026-10-24-002` が書き出す `src/extension/icons/`（16・32・48・128）を使う。002 を先に実装する。

## 対象ファイル

| ファイル | 変更 |
|---|---|
| `src/extension/manifest.json` | アイコン、連携用のコンテンツスクリプト、版を 0.3.0 に |
| `src/extension/link.js`（新規） | Twimark の画面の上で動き、ログインのあとに渡されるトークンを受け取る |
| `src/extension/content.js`、`content.css` | 投稿・記事のアイコンと、その場の小さな画面 |
| `src/extension/background.js` | 追加・保存済みの問い合わせ・カテゴリの読み込みをまとめて受ける |
| `src/extension/options.html`、`options.js`、`popup.js` | 「ログインして連携」、連携の状態、予備のトークンの貼り付け |
| `src/site/auth.js`、`index.html` | 拡張への受け渡しの確認の画面（`?extension=link`） |
| `scripts/self-test.mjs` | 下の「テスト」 |
| `docs/knowledge/share-menu-dom.md` | ブックマークのボタンの目印を足す |
| `README.md`、`docs/requirements/current-mvp.md`、`docs/handbook/spec.md`・`operations.md` | 拡張の連携と、アイコンの出る場所 |

## 方法

### ログインして連携

- **拡張側の入口:** 拡張の設定（`options.html`）とポップアップに「Twimark にログインして連携」のボタンを置く。押すと、Twimark の一覧の画面を新しいタブで `?extension=link` 付きで開く。
- **Twimark の画面に入るスクリプト `link.js`:**
  - `manifest.json` の `content_scripts` に、`https://twimark.ho-service.workers.dev/*` だけを対象として足す。
  - 読み込まれたら、`document.documentElement.dataset.twimarkExtension = 'ready'` で、拡張がいることを画面に知らせる。
- **一覧の画面（`auth.js`）:** `?extension=link` で開かれ、ログインが済み、拡張がいる（上のしるしがある）ときだけ、確認の画面を出す。アプリへの受け渡しと同じ形にする。
  - 文: 「この Chrome / Edge の Twimark 拡張に、ブックマークの読み書きを許しますか？ 拡張の『ログインして連携』から開いたのでなければ、『やめる』を押してください」
  - 「許す」で `POST /api/tokens { device: 'Chrome / Edge 拡張' }`（拡張のトークン。`app` は付けない）。
  - トークンは `window.postMessage({ type: 'twimark-extension-token', token }, location.origin)` で渡す。
  - `link.js` は、`event.source === window`、`event.origin` が Twimark のオリジン、`type` が合うときだけ受け取る。`chrome.storage.local` の `settings.token` に置き、`{ type: 'twimark-extension-linked' }` を返す。
  - 画面は「連携しました。このタブは閉じてかまいません」を出し、`?extension` を URL から消す。
  - 拡張がいない（しるしがない）ときは「拡張機能が見つかりません。拡張を入れて、拡張の『ログインして連携』から開いてください」を出し、トークンは作らない。
- **連携の解除:**
  - 拡張の設定に「連携を解除」を置く。押すとトークンで `POST /api/logout` を送ってから、保存領域から消す。
  - 一覧の画面の「設定」の「拡張・アプリのトークン」からも、今までどおり取り消せる。
- **予備:** 今のトークンの貼り付けの欄は、設定の下の「トークンを貼り付けて連携（予備）」の中に残す。
- **連携の状態:** 設定とポップアップに「連携済み（ID: 〇〇）」か「未連携」を出す。`/api/session` を拡張のトークンで呼んで `login` を出す。

### 投稿・記事のブックマークのアイコン

- **出す場所:** サイトのブックマーク（にあたる）ボタンの隣（右）に置く。
  - X: ポストの下の操作の並び（返信・リポスト・いいね・表示数・ブックマーク・共有）の、ブックマークのボタン（`data-testid="bookmark"` か `removeBookmark`）の右。タイムラインのポストと、ポストの詳しい表示の両方。
  - note: 記事の「スキ」などの操作の並び（記事の上と下）の、共有のボタンの左。note にはブックマークのボタンがないため、共有のボタンの隣にする。
  - Qiita: 記事の左の縦の並びの「ストック」のボタンの下と、記事下の操作の並びの「ストック」の右。
  - どれも、実際の DOM の目印は実装のときに内蔵ブラウザで確かめ、`docs/knowledge/share-menu-dom.md` に足す。サイトの画面が変わって見つからないときは、何も足さない（今と同じ）。
- **見た目:**
  - Twimark のしおりの形のアイコン（線だけ）。大きさ・色・押せる範囲は、隣のサイトのボタンに合わせる（隣のボタンのアイコンの大きさと色を写す）。
  - 保存済みは、しおりを塗りつぶし、アクセントの色（利用者の `accent`。なければ既定の抹茶の黄緑）にする。
  - `aria-label` と、ホバーの説明（`title`）は「Twimark に追加」か「Twimark に保存済み」。
- **押したとき（未保存）:** アイコンのすぐ下に、小さな画面（Shadow DOM の中。サイトの CSS の影響を受けない）を出す。
  - 中身: カテゴリの選択、サブカテゴリの選択（前回選んだ組）、「追加」、閉じる「×」。
  - 本文の取得は今のポップアップと同じ（拡張が自分で取得する。取れなければ本文の欄を出す）。
  - 追加できたら「追加しました」を1秒出して閉じ、アイコンを保存済みの形にする。
  - 外側を押すか Escape で閉じる。
  - 連携していないときは、「Twimark にログインして連携してください」と、連携のボタンを出す。
- **押したとき（保存済み）:** 小さな画面に、「保存済み（カテゴリ › サブカテゴリ）」と「一覧で開く」（一覧の画面をそのカテゴリで開く）を出す。カテゴリの変更や削除は一覧の画面で行う（ここではしない）。
- **保存済みかどうか:**
  - `background.js` が `/api/data` を読んで、保存済みの `id` と `accent` とカテゴリを覚える。
  - 覚えた内容は5分で読み直す。追加したときと、ポップアップで追加したときにも読み直す。
  - `content.js` は、ページの投稿の `id`（今の URL の判定 `parseUrl`）を `background.js` に問い合わせて形を決める。
- **ポストを送って新しく出たとき:** 今の `MutationObserver` で、新しく出た投稿にもアイコンを足す（重ねて足さない印を付ける）。
- **共有メニューの「Twimarkに追加」:** 今のまま残す（押すと追加の窓を開く）。

### 拡張の権限とアイコン

- `manifest.json`:
  - `icons` と `action.default_icon` に `icons/` の 16・32・48・128。
  - `content_scripts` に Twimark のオリジンの `link.js` を足す。
  - `host_permissions` は今のまま（Twimark のオリジンは入っている）。
- 版を `0.3.0` にする。
- Twimark の画面の CSP は変えない（`postMessage` は CSP に関係しない）。

## テスト

`self-test.mjs` に、次を確かめる試験を足す。

- 拡張への受け渡しで作るトークンは拡張のトークン（`app = 0`）で、データの読み書きはでき、設定の操作は `web_only` になる。
- `manifest.json`:
  - JSON として読める。
  - `link.js` の対象が Twimark のオリジンだけ。
  - `icons` の4つのファイルがある。
  - `content.js` の対象が X・note・Qiita だけ。
- `link.js` の受け取りの判定（オリジン・送り元・`type`）を関数に分け、違うオリジン、違う `type`、トークンの形が違うものを受け取らないことを試す。
- 投稿の `id` の取り出しは、今の `parseUrl` の試験で足りる。足りない URL の形が出たら足す。

画面の差し込みは、実装者が内蔵ブラウザで確かめる（`share-menu-dom.md` の「確かめ方」の形）。

## 範囲外

- Chrome ウェブストア・Edge アドオンへの公開（今と同じく、パッケージ化されていない拡張として読み込む）
- Firefox・Safari の拡張
- 小さな画面からのカテゴリの変更・削除、カテゴリの追加
- note の独自ドメインの記事（backlog の B-004）
- コミット、プッシュ、公開（この定義の指示にない）

## 受け入れ条件

1. `node scripts/self-test.mjs` がすべて成功する（「テスト」に挙げたものを含む）。
2. `node scripts/build.mjs` のあと全 JS が `node --check` を通る。`npx wrangler deploy --dry-run` が通る。
3. 実装者が、内蔵ブラウザで次を確かめる。
   - X のポスト（タイムラインと詳しい表示）、note の記事、Qiita の記事で、ブックマーク（にあたる）ボタンの隣にアイコンが出る。
   - 押すと小さな画面が出る（拡張の API を差し替えた形で。`share-menu-dom.md` の「確かめ方」）。
   - 手元の `wrangler dev` で、`?extension=link` の確認の画面と、拡張がいないときの文が出る。
4. 利用者が Chrome か Edge で、次を確かめる。
   - 拡張の「ログインして連携」から連携できる。
   - 各サイトのアイコンから追加でき、保存済みの形に変わる。
   - 共有メニューの「Twimarkに追加」も今までどおり動く。
5. `check-handbook.mjs` が問題を出さない。

## 検証コマンド

```bash
node scripts/self-test.mjs
node scripts/build.mjs
npx wrangler deploy --dry-run
```

```bash
for f in build/site/*.js build/site/shared/*.js build/extension/*.js build/extension/shared/*.js; do node --check "$f" || exit 1; done
```

```bash
node C:/Users/SB-315/.claude/skills/project-handbook/scripts/check-handbook.mjs .
```

## 完了報告

（実装者が書く）

## レビュー記録

（レビュー者が書く）
