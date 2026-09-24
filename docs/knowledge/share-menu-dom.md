---
title: X・note・Qiitaの共有メニューの目印
type: knowledge
confidence: medium
created: 2026-09-24
last_verified: 2026-09-24
---

# X・note・Qiitaの共有メニューの目印

`src/extension/content.js` が「Twimarkに追加」を差し込むときに頼っている目印。サイトの画面が変わって差し込みが出なくなったら、まずここを確かめる。

## X（2026-09、ログインしていない表示で確認）

- 共有ボタンは `button[data-engagement-action="share"]`（`aria-haspopup="menu"`、`data-slot="xds-menu-trigger"`）。`aria-label` は言語で変わる（日本語は「共有」）。
- 押すと `div[role="menu"][data-slot="xds-menu-content"]` が出る。`aria-labelledby` が共有ボタンの `id`。項目は `div[role="menuitem"][data-slot="xds-menu-item"]`（`span > svg` とラベルの `div`）。
- ポストの `article` に `data-testid` はない。ポストのURLは、共有ボタンの祖先にある `/<handle>/status/<数字>` のリンク（日時や返信の数）から取る。
- メニューを閉じるには、メニューそのものではなく、フォーカスのある要素（共有ボタン）へ `keydown` の Escape を送る。
- 開くのはスクリプトの `click()` では開かず、実際のクリックが要る。

## note

- 記事の横の共有ボタンは `#shareButton`（`aria-controls="shareMenuDesktop"`）。メニューは `#shareMenuDesktop[role="menu"]` で、`ul > li > button[role="menuitem"]`。先頭のグループが「リンクをコピー」。
- 記事下の共有の並びは `.o-shareBooster__share` の中の `button.o-shareBooster__item`。アイコンは `<i class="a-icon a-icon--x">` のようにCSSで描いている（`svg` がない）。
- メニューは Escape では閉じない。共有ボタンをもう一度押すと閉じる。

## Qiita

- 共有の並びは、左の縦の並びと記事下の2か所。どちらも `button[aria-label="Facebookでシェア"]` を包む `div` が1つのボタンで、その親が並び。はてなブックマークは `a[href*="b.hatena.ne.jp"]`、Xは `aria-label="ポスト"`。
- ボタンの `div` の中の `p[role="tooltip"]` がホバーで出る説明。

## 確かめ方

内蔵ブラウザで対象のページを開き、`content.js` の中身を `const chrome = { runtime: { sendMessage: async (m) => { window.__sent = m; } } };` を先に置いて流し込むと、差し込みと送られるURLを確かめられる。ペインが隠れているとページが止まり、スクリプトが終わらないことがある（スクリーンショットを1枚撮ると動き出す）。
