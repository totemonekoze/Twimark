# Twimark：カテゴリをドラッグで別のカテゴリの下に入れて、サブカテゴリにする

- 定義日: 2026-10-23
- 状態: reviewed
- 定義: Claude Code（2026-10-23）
  - 指示: 「今カテゴリとして設定されているものを、サブカテゴリ化できるようにしたい。操作は動的に、カテゴリの下にカテゴリを配置することでサブカテゴリになるみたいな感じ」
  - その後の回答:
    - サブカテゴリを持つカテゴリを入れたとき: 「子も同じ段に並べる」
    - 逆の操作（サブカテゴリをカテゴリに戻す）: 「できるようにする」
    - 入れ先に同じ名前のサブカテゴリがあるとき: 「1つに合わせる」

## 目的

- **カテゴリをサブカテゴリにする:** カテゴリの「編集」で、カテゴリをドラッグして別のカテゴリの行に重ねて離すと、そのカテゴリの下のサブカテゴリになる。ブックマークもついて移る。
- **戻す・移す:** サブカテゴリをカテゴリに戻せる。別のカテゴリの下へ移すこともできる。
- 一覧の画面（縦長のカテゴリのタブ、横長のサイドバー）とアプリで、同じ操作にする。

## 前提

- 定義 2026-10-22-001 は公開済み（`d96cd83`）。カテゴリの「編集」と、つまみのドラッグでの並べ替えは、一覧の画面とアプリの両方にある。
- 階層は今と同じく1段まで（カテゴリ › サブカテゴリ）。表の形は変えない（`categories`、`subcategories`、`bookmarks.category`・`subcategory`）。

## 対象ファイル

| ファイル | 変更 |
|---|---|
| `src/worker/library.js` | 操作 `nestCategory`、`promoteSubcategory`、`moveSubcategory` |
| `src/shared/store.js` | `ops` に同じ3つ |
| `src/site/app.js`、`style.css`、`index.html` | ドラッグの入れ先、「カテゴリにする」の置き場、編集中の行のメニュー |
| `src/mobile/screens/CategoriesScreen.js` | 同じ（ドラッグの入れ先、置き場、行のメニュー） |
| `scripts/self-test.mjs` | 下の「テスト」 |
| `README.md`、`docs/requirements/current-mvp.md`、`docs/handbook/spec.md` | 操作とデータの決まり |

## 方法

### 操作（Worker、`POST /api/ops`）

どれも `db.batch` の1回で書く（途中で止まって半分だけ移ることがない）。名前の検査は今の `checkName`、上限は今の `LIMITS`。

- **`nestCategory(name, parent)`**: カテゴリ `name` を、カテゴリ `parent` のサブカテゴリにする。
  - `name` と `parent` はどちらも今あるカテゴリで、別のもの。違えば `invalid_category`。
  - `parent` のサブカテゴリの後ろに、`name`、続けて `name` が持っていたサブカテゴリを、その順で足す（子も同じ段に並べる）。
  - `parent` に同じ名前のサブカテゴリがもうあれば、足さずに合わせる（並びは今のものの位置のまま）。
  - 合わせたあとの数が `LIMITS.subcategories`（30）を超えるなら `too_many` で断り、何も変えない。
  - ブックマーク: `category = name` のもののうち、サブカテゴリなしは `(parent, name)` へ、サブカテゴリ `s` のものは `(parent, s)` へ移す。
  - `name` のカテゴリの行と、そのサブカテゴリの行を消し、カテゴリの `position` を詰め直す。
- **`promoteSubcategory(category, name)`**: サブカテゴリ `category › name` をカテゴリにする。
  - 新しいカテゴリは一番後ろに足す。同じ名前のカテゴリがもうあれば、足さずに合わせる。
  - 合わせないで足すとき、カテゴリが `LIMITS.categories`（30）に達していれば `too_many`。
  - ブックマーク: `(category, name)` のものを `(name, なし)` へ移す。
  - サブカテゴリの行を消し、`category` のサブカテゴリの `position` を詰め直す。
- **`moveSubcategory(from, name, to)`**: サブカテゴリ `from › name` を、カテゴリ `to` のサブカテゴリの後ろへ移す。
  - `from` と `to` は今あるカテゴリで、別のもの。`to` に同じ名前があれば合わせる。上限は `nestCategory` と同じ。
  - ブックマーク: `(from, name)` のものを `(to, name)` へ移す。
- ない名前や、今の一覧と合わないときは、今の操作と同じく `invalid_category`・`invalid_subcategory` で断る（画面は「再読み込みしてやり直してください」を出し、読み直す）。

### ドラッグ（一覧の画面とアプリで同じ）

「編集」の間、つまみをドラッグしている間だけ、次の入れ先を出す。

- **カテゴリの行に重ねる:** 動かしている行の中ほどが、ほかのカテゴリの行の上下の真ん中半分に入ったら、その行をアクセントの色の枠と薄い地で光らせ、「〇〇の下に入れる」と出す（アプリは触覚の選択を返す）。そこで離すと:
  - カテゴリを動かしていたら `nestCategory`
  - サブカテゴリを動かしていたら `moveSubcategory`（同じカテゴリに重ねたときは何もしない）
- **「カテゴリにする」の置き場:** サブカテゴリを動かしている間だけ、リストの一番下に点線の枠の置き場を出す（「ここに置くとカテゴリになります」）。重ねて離すと `promoteSubcategory`。
- **それ以外:** 今と同じ並べ替え（カテゴリはカテゴリの間、サブカテゴリは同じカテゴリの中）。
- 入れ先に重なっている間は、並べ替えのためにほかの行をずらさない。
- **確かめ:** サブカテゴリを持つカテゴリを入れるときだけ、離したあとに確認を出す（「〇〇の下に入れますか？ サブカテゴリ N 個も同じ段に並びます」）。区切りがなくなって戻せないため。そのほかはすぐに保存する。
- 保存できたら、行が新しい場所へ動く（Web は View Transitions、アプリは LayoutAnimation）。アプリは触覚の成功を返す。失敗したら文を出し、読み直す。

### ドラッグしない方法（キーボード、読み上げ、指が使いにくいとき）

- 「編集」の間、カテゴリとサブカテゴリの名前を押すと、移し先のメニューを出す（Web はアクションシート、アプリは `ActionSheetIOS`）。
  - カテゴリ: 「〇〇の下に入れる」をほかのカテゴリの数だけ出す。
  - サブカテゴリ: 「カテゴリにする」と、「〇〇へ移す」をほかのカテゴリの数だけ出す。
- アプリの読み上げでは、行に「移す」の操作（`accessibilityActions`）を付け、同じメニューを開く。
- 確かめはドラッグと同じ。

## テスト

`self-test.mjs` に、次を確かめる試験を足す。

- `nestCategory`:
  - ブックマークが `(parent, name)` と `(parent, 子の名前)` へ移る。
  - 子が同じ段に並ぶ。同じ名前は合わせる。
  - 上限を超えると `too_many` で何も変わらない。
  - 自分自身やないカテゴリは断る。
- `promoteSubcategory`:
  - ブックマークがカテゴリの直下へ移る。
  - 同じ名前のカテゴリがあれば合わせる。
  - 上限で断る。
- `moveSubcategory`: ブックマークが移り、同じ名前は合わせる。
- どの操作も、ほかの利用者の行に触れない。

## 範囲外

- 2段より深い階層、サブカテゴリを持ったままの移動（子は同じ段に並べる）
- 移す操作の「元に戻す」（逆の操作で戻す）
- カテゴリ・サブカテゴリの名前の変更
- 拡張の画面
- コミット、プッシュ、公開（この定義の指示にない）

## 受け入れ条件

1. `node scripts/self-test.mjs` がすべて成功する（「テスト」に挙げたものを含む）。
2. `node scripts/build.mjs` のあと全 JS が `node --check` を通る。`src/mobile` の `npx expo export --platform ios` と `npx expo-doctor`、`npx wrangler deploy --dry-run` が通る。
3. 手元の `wrangler dev` で、実装者が縦長（390px）と横長（1280px）の一覧の画面で次を確かめる。
   - カテゴリを別のカテゴリに重ねて入れる（子を持つときは確認が出る）。
   - サブカテゴリを別のカテゴリへ移す。
   - サブカテゴリを置き場でカテゴリに戻す。
   - 編集中のメニューで同じことができる。
   - ブックマークの絞り込みが移った先で合う。
4. iPhone の Expo Go で、利用者が同じ操作を確かめる。
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
cd src/mobile && npx expo export --platform ios --output-dir ../../build/mobile && npx expo-doctor
```

```bash
node C:/Users/SB-315/.claude/skills/project-handbook/scripts/check-handbook.mjs .
```

## 完了報告

- 実装: Claude Code（2026-10-23）。コミット、プッシュ、公開はしていない（表の形は変えていないので、D1 に当てるものはない）。
- 公開（2026-10-23）: `1bde3e3` を push し、`npm run deploy` で公開した（自己テスト・ビルド・`wrangler deploy` の順、版の ID `d69710db-33f9-4e56-b140-3d3dff6205cb`）。
  - 本番の `app.js`・`style.css` に新しい処理（`nestCategory`、`promote-zone`）があることと、ログインなしの `/api/ops` が 401 のままであることを確かめた。
  - push で動いた Mobile のワークフロー（EAS Update の `main` チャンネルへの公開）は成功した。
  - ログインしたあとの画面と、iPhone の Expo Go での確認（受け入れ条件 4）はまだ。
- 検証（2026-10-23）:
  - `node scripts/self-test.mjs`: 47件すべて成功（「テスト」の項目の4件を足した）
  - `node scripts/build.mjs` のあと、build の全 JS が `node --check` を通った
  - `npx wrangler deploy --dry-run`: 成功
  - `src/mobile` の `npx expo export --platform ios`: 成功。`npx expo-doctor`: 21/21
  - `check-handbook.mjs`: 問題なし
- 受け入れ条件 3（手元の `wrangler dev`、内蔵ブラウザ、テスト用の ID と見本のデータ）:
  - 縦長 390px のライト:
    - 「その他」を「ツール」の行へ実際にドラッグして離すと、「ツール › その他」になり、ブックマークもついて移った。
    - サブカテゴリを動かす途中で、重ねた行が光り「「Cloudflare」の下に入れる」と出ること、画面の下に置き場が出ることを見た。途中で元の位置に戻して離すと、何も変わらなかった。
    - 置き場で離すと、「CLI」がカテゴリに戻り、ブックマークは直下へ移った。
    - 編集中に「AI活用」の名前を押すとメニューが出た。「Cloudflare」の下へ入れると、子が2つあるので確認が出た。入れると子も同じ段に並び、ブックマーク3件がそれぞれ移った。
    - 絞り込み（`?category=AI活用&sub=プロンプト`）は `Cloudflare › プロンプト` に変わった。
  - 横長 1280px のダーク: サイドバーで、サブカテゴリを別のカテゴリへ移した（行が光り、離すと移る）。
  - 途中の様子は合成のポインターの操作で止めて見た。そのあとで離した。
- まだ確かめていないもの: 受け入れ条件 4（iPhone の Expo Go。アプリの画面はこのセッションで動かしていない）。
- 定義の外の判断:
  - 「カテゴリにする」の置き場は、リストの一番下でなく、縦長では画面の下（タブバーの上）、横長ではサイドバーの下に留めて出す。リストが長いと一番下が画面の外になり、ドラッグの間は送れないため（Web とアプリの両方）。
  - アプリの並べ替えは、ほかの行をずらす形から、入る位置に線を出す形に替えた。入れ先の行の画面の位置を持ち上げたときに測るので、ドラッグの間に行が動くと位置がずれるため。
  - Web は、移した先を絞り込みが指していたら、移った先を指すように直す（例: `AI活用 › プロンプト` → `Cloudflare › プロンプト`）。アプリは今の決まりのとおり、消えたカテゴリなら「すべて」に戻る。
  - Web の一覧の画面でカテゴリを動かす間は、今と同じくサブカテゴリの行を隠すので、入れ先の行は詰まった位置に出る。
  - Web の編集中は、名前の押下をメニューにした（前は編集中の名前は押せなかった）。アクションシートが長くなるので、上の段は画面の 70% で送れるようにした。
  - 3つの操作のエラーの文は「カテゴリが変わっています。再読み込みしてやり直してください。」にした（code は定義のとおり `invalid_category`・`invalid_subcategory`）。

## レビュー記録

- レビュー: Claude Code（2026-10-23）。コミットされていない作業ツリーの差分と、この定義ファイルを見た。コミット、プッシュ、公開はしていない。
- 見たところ: `src/worker/library.js` の3つの操作、`src/shared/store.js` の `ops`、`src/site/app.js`（`startDrag`、`moved`・`nestTo`・`moveSubTo`・`promote`・`moveMenu`、絞り込みの直し）、`src/site/style.css`、`src/mobile/screens/CategoriesScreen.js`（`useReorder`、`dropsFor`、確認とメニュー）、README・`current-mvp.md`・`spec.md`。

### 直した不具合

1. **アプリ: つまみを押して動かさずに離すと、画面の上に隠れたカテゴリへ入ることがある。** 離したときの入れ先を `gestureState.moveY` から求め直していた。しかし React Native の PanResponder は、動きがないまま離すと `moveY` が 0 のままにする（`PanResponder.js` のコメントで「無効」とされている）。一覧を送っていて、カテゴリの行の真ん中半分が画面の上端（y = 0）にかかっていると、その行への `nestCategory`（子がなければ確認なし）や `moveSubcategory` が走る。`useReorder` で最後に重なった入れ先を `hovered` の ref に持ち、離したときはそれを使うように直した（光っていた行と、入る先が必ず一致する）。
2. **`docs/handbook/spec.md` の `updated` を進めていなかった。** 本文を変えたので、2026-10-23 にした。

### 今回は直さない気づき

- **ドラッグが打ち切られたときにも入れる:** Web の `pointercancel` と、アプリの `onPanResponderTerminate` でも、重なっていた入れ先へ移す。並べ替えと同じ扱いで、つまみは `touch-action: none`、終わらせる要求も断っているので、起きるのはまれ。打ち切りのときは入れない形にしてもよい。
- **入れ先の判定は縦の位置だけ:** Web の `startDrag` は y だけを見る。横長のサイドバーから一覧の側へ指を外しても、同じ高さなら入れ先が光り、置き場にもなる（並べ替えも前から y だけ）。
- **詰め直していない並びに足すと、末尾にならないことがある:** 前からの `removeCategory`・`removeSubcategory` は `position` を詰め直さない。そのあとの `promoteSubcategory`（`cats.length`）と、`nestCategory`・`moveSubcategory` の入れ先（`target.length`）は、残った位置とぶつかり、名前の順で前に出ることがある。`addCategory`・`addSubcategory` と同じ前からのくせで、この変更が増やしたものではない（移した元は詰め直している）。
- **カテゴリが1つだけのときのメニュー:** 編集中にその名前を押すと、選べる項目のないメニュー（キャンセルだけ）が出る。
- **アプリでメニューから確認へ続けて出すとき:** `moveMenu` の `ActionSheetIOS` の選択から、子を持つカテゴリの確認の `ActionSheetIOS` をすぐ出す。Web では確かめてある。iPhone では受け入れ条件 4 のときに、確認が出ることを見てほしい。
- データの正しさは問題なし: 3つの操作はどれも読んだあとに `db.batch` を1回だけ使い、どの文も `user_id` で絞っている。`nestCategory` の上限は「足す数＋今の数 > 30」で、ちょうど30は入る。消えたサブカテゴリを指すブックマークは、`CASE ... IN (今のサブカテゴリ)` で `(入れ先, 名前)` へ移る。バインドの数は最大で30余りで、D1 の上限（100）の内。

### 設計して足した試験（`scripts/self-test.mjs`）

- `nestCategory`:
  - 消えたサブカテゴリを指すブックマーク（カテゴリを消して足し直したもの）が `(入れ先, 名前)` へ移る。
  - 自分と同じ名前の子（`AI活用 › AI活用`）は1つにまとまる。
  - 移したあとに足したカテゴリは末尾になる（カテゴリの並びを詰め直している）。
  - 招待された利用者の同じ名前のカテゴリ・サブカテゴリ・ブックマークは変わらない。
- `promoteSubcategory`:
  - 親と同じ名前のサブカテゴリ（`ツール › ツール`）は、カテゴリを増やさずに親の直下へ合わさる。
  - 残りのサブカテゴリを詰め直している。詰め直さないと、あとから足した D が前に出る形で確かめた。
  - ほかの利用者の行は変わらない。
- `moveSubcategory`:
  - 移し先が30個なら `too_many` で、何も変わらない。
  - 同じ名前があって合わせるなら、30個でも移せる。

### 試験の結果（2026-10-23、直したあと）

- `node scripts/self-test.mjs`: 49件すべて成功（上の2件を足した）
- `node scripts/build.mjs` のあと、build の全 JS が `node --check` を通った
- `npx wrangler deploy --dry-run`: 成功
- `src/mobile` の `npx expo export --platform ios --output-dir ../../build/mobile`: 成功。`npx expo-doctor`: 21/21
- `check-handbook.mjs`: 問題なし
- Web の画面は動かしていない（実装者が受け入れ条件 3 で確かめていて、レビューで Web のコードは変えていない）。アプリの直しは Expo Go で動かせないので、コードを読んで確かめた。iPhone での確認（受け入れ条件 4）は利用者が行う。
