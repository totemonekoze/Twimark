# Twimark：下のタブの中央そろえ、下からかぶさる追加のシート、共有シートの「Twimarkへ追加」、拡張のアイコンと動作、Expo の一覧のアイコン

- 定義日: 2026-10-25
- 状態: reviewed
- 定義: Claude Code（2026-10-25）
  - 指示（定義、実装、差分レビューまで）:
    - 「下部タブメニューのアイコン+ページ名を、上下中央揃え、余白を均等にしてレイアウトすること」
    - 「ブックマーク追加は丸々一枚ページをつくるのではなく、一覧ページの下部にかぶさる感じで表示。」
    - 「iOSの共有メニューに"Twimarkへ追加"みたいなボタンを付け足すことは可能ですか？できるなら追加して、ブックマークに追加できるようにします。（X,note,Qiita以外は失敗するようにします）」
    - 「拡張機能にアイコンを設定」
    - 「拡張機能をインポートできるようにはなりましたが、"確認中です…"から進みません。また、共有ボタン押下した先にブックマーク追加リンクの表示もされていません。他拡張機能と競合しない形で実装ください」
    - 「ExpoのApp一覧にもアイコンを適用させる」
  - その後の回答:
    - 共有メニュー: 「ショートカットで出す」（Expo Go のまま。アプリの共有の拡張は作らない）。
    - 止まる画面: 「設定の『接続を確かめる』」（「確かめています…」のまま）。
    - ログインした X の画面を利用者の Chrome で読むこと: 「読んでよい」。ただし Claude in Chrome がつながっていなかったので読めず、共有ボタンの見分け方を広げる形にした。
    - 追加の形: 「アプリと Web の縦長」。

## 目的

1. 下のタブのアイコンと名前を、タブの中で上下の中央にそろえ、上下左右の余白をそろえる。
2. ブックマークの追加を、画面いっぱいのページではなく、一覧の下にかぶさる下からのシートで出す。
3. iOS の共有シートに「Twimarkへ追加」を出し、X・note・Qiita のポストと記事を追加できるようにする。それ以外の URL は失敗として知らせる。
4. 拡張にアイコンを付ける。
5. 拡張の設定の「接続を確かめる」が「確かめています…」で止まらないようにし、X の共有メニューに「Twimarkに追加」が出るようにする。ほかの拡張と取り合わない形にする。
6. Expo Go のプロジェクトの一覧に、Twimark のアイコンを出す。

## 前提（定義のときに確かめたこと）

- **下のタブ（アプリ）:** `Press` は `Pressable` の中の `Animated.View` に `style` を付ける。`Pressable` は帯の高さまで伸びるが、中の `Animated.View` には高さがないので、アイコンと名前が上に寄る。Web の `.tab` は grid の中央そろえで、ずれはない。
- **追加のシート:**
  - アプリの `AddSheet` は `Sheet`（`pageSheet`、画面いっぱい）を使う。
  - Web の追加は `dialog.sheet`（下から、内容の高さ、最大は画面の高さ）。
- **iOS の共有シート:**
  - アプリの共有の拡張（Share Extension）は Expo Go では作れない。独自のビルド（EAS Build）と Apple Developer Program が要るため、今回は作らない。
  - 今は README の手順で、共有シートに出るショートカットを作る。ショートカットはアプリを `…/--/add?url=<URL>` で開き、追加のシートが出る。
  - 追加のシートは、対象外の URL に「追加できるのは X のポストと note・Qiita の記事の URL です。」を出す。
  - アプリの「設定」の「共有シートのショートカット」には「URL をコピー」があり、作り方は README を見る形。
- **拡張:**
  - `src/extension/icons/` に 16・32・48・128 の絵があるが、`manifest.json` は参照していない。
  - Edge 156 のヘッドレスでは、設定の「接続を確かめる」は仮のトークンですぐ「ログインしてください」を返し、止まらなかった。利用者の Chrome で止まる原因は確かめられていない。
  - `store.js` の `call` と `meta.js` の `fetchMeta` には時間切れがない。応答が来なければ、いつまでも待つ。
  - ポップアップは Qiita の記事の取得に 4〜10 秒かかり、その間は「読み込み中…」のまま。
  - X の共有メニューへの差し込み（`content.js`）は、共有ボタンを `data-engagement-action="share"` か、`aria-label` が「共有」「Share」で始まるもので見分ける。ログインしていない X の画面（2026-10-25）では、共有ボタンは今も `data-engagement-action="share"` と「共有」だった。
  - ログインした X の画面は確かめられていない。ログインした画面の共有ボタンの `aria-label` は「ポストを共有」で、「共有」で始まらないので見分けられない、と考えられる。
  - 差し込む項目は、メニューの最後の項目を複製して作る。ほかの拡張が最後に足した項目があると、その項目の印（`data-*`）まで写してしまう。
- **Expo の一覧のアイコン:** 公開中の EAS Update のマニフェスト（`extra.expoClient`）には `icon: "./assets/icon.png"`（相対パス）しかなく、`iconUrl` がない。Expo Go の一覧は `iconUrl` の https の絵を使う。公開中の `https://twimark.ho-service.workers.dev/icons/icon-512.png` は 200（image/png）で取れる。

## 対象ファイル

| ファイル | 変更 |
|---|---|
| `src/mobile/App.js` | 下のタブの中身を、タブの高さいっぱいで中央にそろえる |
| `src/mobile/parts.js` | 下からかぶさるシート `BottomSheet` |
| `src/mobile/screens/AddScreen.js` | 追加を `BottomSheet` で出す。対象外の URL の失敗に触覚 |
| `src/mobile/screens/SettingsScreen.js` | 共有シートのショートカット「Twimarkへ追加」の作り方を画面に書く |
| `src/mobile/app.config.js` | `iconUrl` |
| `src/site/style.css` | 下のタブの中央そろえ（Web とアプリで同じ数）、追加のシートの最大の高さ |
| `src/extension/manifest.json` | `icons`・`action.default_icon`、版 |
| `src/extension/content.js`、`content.css` | 共有ボタンの見分け方、ほかの拡張と取り合わない複製と印 |
| `src/shared/store.js`、`src/shared/meta.js` | 時間切れ |
| `scripts/self-test.mjs` | 下の「テスト」 |
| `README.md`、`docs/requirements/current-mvp.md`、`docs/handbook/spec.md`、`docs/knowledge/share-menu-dom.md` | 上の変更 |

## 方法

### 1. 下のタブ

- アプリ: タブの `Press` の `style` に `alignSelf: 'stretch'` を足して、タブの高さ（48）いっぱいにする。アイコン（20）と名前を縦に並べ、`justifyContent: 'center'`・`alignItems: 'center'`、間は 2。
- Web: `.tab` を `display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 2px` にする（grid の `align-content` に頼らない）。
- 余白: 帯の内側の余白は上下左右とも 4。3つのタブは同じ幅（80）。選んでいる札（`.tab-ind`）も上下左右 4 の内側に置く。アプリと Web で同じ数にする。

### 2. 下からかぶさる追加のシート

- **アプリ（`BottomSheet`、`parts.js`）:**
  - `Modal`（`transparent`、`animationType="none"`）の中に、薄暗い地（`c.overlay`、押すと閉じる）と、下からせり上がる板を置く。
  - 板は上の角を丸め（`radius.sheet`）、高さは中身の高さ（最大は画面の 85%）。中身は送れる。
  - 上の帯はつまみの印と、左「キャンセル」・真ん中の題・右のボタン（今の `Sheet` と同じ並び）。
  - キーボードが出たら板を持ち上げる（`KeyboardAvoidingView`、`behavior="padding"`）。
  - つまみの帯を下へ 80 以上なぞると閉じる（`PanResponder`）。
  - せり上がりと下がりは `Animated.spring`・`timing`（`useNativeDriver`）。動きを減らす設定では、地のフェードだけにする。
- `AddSheet` を `BottomSheet` に替える（中身は同じ）。
- **Web:** 追加のシート（`dialog[data-add-sheet]`）は今も下から内容の高さで出ているので、最大の高さだけを `85dvh` にして、上に一覧が見えるようにする。

### 3. 共有シートの「Twimarkへ追加」（ショートカット）

- アプリの共有の拡張は作らない（回答）。今のショートカットの名前を「Twimarkへ追加」にそろえ、作り方を「設定」の画面の中に書く。
- 「設定」の「共有シートのショートカット」に、番号付きの手順を出す（README と同じ）。
  1. 下の「URL をコピー」でコピーする。
  2. ショートカットアプリで新しいショートカットを作り、名前を「Twimarkへ追加」にする。詳細で「共有シートに表示」をオンにし、受け取るものを「URL」だけにする。
  3. アクション「URL をエンコード」（入力は「ショートカットの入力」）、「テキスト」（コピーした URL の直後に「エンコードされたテキスト」）、「URL を開く」（入力は「テキスト」）を並べる。
  4. X・note・Qiita のアプリや Safari の共有シートで「Twimarkへ追加」を押すと、アプリの追加のシートが出る。
- 対象外の URL（X・note・Qiita のポスト・記事でないもの）で開いたときは、今の文に加えて、触覚の警告（`haptic.warning`）を返す。追加のボタンは押せないまま（今と同じ）。

### 4. 拡張のアイコン

- `manifest.json` に `icons`（16・32・48・128）と `action.default_icon`（16・32）を足す。版を `0.2.1` にする。

### 5. 拡張の動作

- **時間切れ:**
  - `store.js` の `call` は 20 秒で打ち切り（`AbortSignal.timeout`）、`StoreError('timeout', 'Twimark から応答がありません。通信の状態を確かめて、やり直してください。')` にする。
  - `fetchMeta` は 8 秒で打ち切り、取れなかったとき（`null`）と同じに扱う。
  - Web とアプリにも同じに効く。
- **設定の「接続を確かめる」:**
  - 押している間はボタンを押せなくする（二重に送らない）。
  - 結果（成功・失敗・時間切れ）を必ず出す。
- **X の共有メニュー:**
  - 共有ボタンの見分け方を広げる。`data-engagement-action="share"`、または `aria-haspopup="menu"` で `aria-label` に「共有」か「Share」を含むもの（「ポストを共有」「Share post」を含む）。
  - 複製の元は、メニューの中で、ほかの拡張が足したものでない項目にする。`data-twimark-item` を持たない最初の `[role="menuitem"]`（サイトの「リンクをコピー」など）。
  - 複製からは、ほかの拡張の印にならないよう、`data-*` を `data-slot` と `data-testid` 以外すべて外す（`data-testid` も今と同じく外す）。
  - 差し込む位置は、元の項目が入っている並びの末尾。
  - 印は `data-twimark-item` にする（今の `data-twimark` から、ほかと重ならない名前に）。CSS も合わせる。
  - クリックはこちらの項目の上だけで受け、今と同じく `stopPropagation` する。
  - ほかの拡張が同じメニューを書き換えても、こちらは毎回 `data-twimark-item` の有無だけで重ねて足さない。
- note・Qiita の差し込みも、同じ複製の作り方（`data-*` を外す、印の名前）にする。

### 6. Expo の一覧のアイコン

- `app.config.js` で `iconUrl` に `https://twimark.ho-service.workers.dev/icons/icon-512.png` を入れる。EAS Update の `extra.expoClient` に入り、Expo Go の一覧で使われる。
- 次の main への push（`src/mobile` の変更）で、ワークフローが公開する。

## テスト

`self-test.mjs` に、次を確かめる試験を足す。

- `createStore` は、応答のない `fetch`（中止の合図で失敗する偽物）で `timeout` の `StoreError` になる。テストでは時間を短くできるよう、時間を引数で渡せるようにする。
- `fetchMeta` は、応答のない `fetch` で `null` を返す（同じく時間を引数で渡す）。
- `manifest.json` の `icons` と `action.default_icon` の絵がある（今の拡張の参照の試験で足りる）。
- `content.js` の共有ボタンの見分けと複製の元の選び方は、関数に分けずに、内蔵ブラウザでログインしていない X の画面に流し込んで確かめる（`share-menu-dom.md` の確かめ方）。ほかの拡張が足した項目（`data-other` 付き）を最後に置いた形でも、複製に `data-other` が写らないことを確かめる。
- `app.config.js` の結果に `iconUrl` があることを、`npx expo config --type public` で確かめる。

## 範囲外

- iOS のアプリの共有の拡張（独自のビルドが要る。回答で選ばなかった）
- 定義 `2026-10-24-003`（拡張のログインでの連携、投稿の横のアイコン）
- ログインした X の画面の確かめ（Claude in Chrome がつながらなかった。利用者が確かめる）
- 公開（この定義の指示にない）、コミット、プッシュ

## 受け入れ条件

1. `node scripts/self-test.mjs` がすべて成功する（「テスト」に挙げたものを含む）。
2. `node scripts/build.mjs` のあと全 JS が `node --check` を通る。`npx wrangler deploy --dry-run`、アプリの `npx expo export --platform ios` と `npx expo-doctor` が通る。
3. 実装者が、内蔵ブラウザで次を確かめる。
   - Web の縦長の下のタブで、アイコンと名前が上下の中央にあり、上下の余白が同じ。
   - 追加のシートの上に一覧が見える。
   - ログインしていない X のポストで、`content.js` を流し込んで共有ボタンを押すと「Twimarkに追加」が出る。ほかの拡張の項目を足した形でも、印が写らない。
4. 実装者が、Edge のヘッドレスで拡張を読み込み、アイコンが入り、設定の「接続を確かめる」が結果を出すことを確かめる。
5. 利用者が次を確かめる。
   - Expo Go: 下のタブの中央そろえ、追加のシートが下からかぶさる形、Expo Go の一覧のアイコン（push のあと）。
   - iPhone: 「設定」の手順で作った「Twimarkへ追加」で、X・note・Qiita は追加でき、ほかの URL は失敗と出る。
   - Chrome: 拡張のアイコン、「接続を確かめる」の結果、ログインした X の共有メニューの「Twimarkに追加」。
6. `check-handbook.mjs` が問題を出さない。

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
cd src/mobile && npx expo config --type public && npx expo export --platform ios --output-dir ../../build/mobile && npx expo-doctor
```

```bash
node C:/Users/SB-315/.claude/skills/project-handbook/scripts/check-handbook.mjs .
```

## 完了報告

- 実装: Claude Code（2026-10-25）
- **やったこと:**
  1. 下のタブ:
     - アプリはタブの `Press` の中身に `flex: 1` を足し、タブの高さいっぱいで上下の中央にそろえた。間は 2。
     - Web は `.tab` を flex の縦並びの中央そろえにした。
  2. 追加のシート:
     - アプリに `BottomSheet`（`parts.js`）を作り、`AddSheet` を替えた。薄暗い地、下からせり上がる板（最大 85%）、つまみの帯のなぞりで閉じる、キーボードで持ち上げる。
     - Web は縦長だけ、追加のシートの最大の高さを `85dvh` にした。
  3. 共有シート:
     - 「設定」に「共有シートの『Twimarkへ追加』」の4段の作り方を出した（`SHORTCUT_STEPS`）。
     - 対象外の URL で開いたときに、触覚の警告を足した。
     - README の手順も「Twimarkへ追加」にそろえた。
  4. 拡張のアイコン: `manifest.json` に `icons`・`action.default_icon` を足し、版を 0.2.1 にした。
  5. 拡張の動作:
     - 時間切れ: `store.js` の `call` は 20 秒で `timeout`、`fetchMeta` は 8 秒で `null`。本文の読み込みも含む。
     - 設定の「接続を確かめる」は、確かめている間ボタンを押せない。
     - `content.js`: 共有ボタンをラベルに「共有」「Share」を含むかで見分け、複製の元をメニューの最初の項目にした。複製からは `data-*`（`data-slot` 以外）を外し、印を `data-twimark-item` にした。
  6. Expo の一覧のアイコン: `app.config.js` は、`EXPO_GO_ICON_URL` が渡されたときだけ `iconUrl` を入れる。公開のワークフロー（`mobile.yml`）の `eas update` に、その値を渡す。
- **検証の実行と結果:**
  - `node scripts/self-test.mjs`: 65件すべて成功（時間切れの試験を含む）。
  - `node scripts/build.mjs` のあと全 JS が `node --check` を通り、`npx wrangler deploy --dry-run` も通った。
  - `npx expo export --platform ios` が通り、`npx expo-doctor` は 21/21 成功。
  - `npx expo config --type public` は、`EXPO_GO_ICON_URL` を渡したときだけ `iconUrl` を出す。
  - `check-handbook.mjs`: 問題なし。
- **内蔵ブラウザで確かめたこと（受け入れ条件 3）:**
  - 縦長（375×812）の下のタブ: 3つとも、アイコンの上とラベルの下の余白が同じ（4px）。帯の内側の余白は上下左右とも 5px（余白 4 と枠 0.5）。選んでいる札も同じ内側。
  - 追加のシート: 高さは中身の分（198px）で、最大は 690px（画面の 85%）。
  - ログインしていない X のポストに `content.js` を流し込み、ログインした画面のまね（共有ボタンのラベルを「ポストを共有」にし、`data-engagement-action` を外す）と、ほかの拡張のまね（メニューの最後に `data-other-ext` 付きの項目を足す）をした。
    - 実際のクリックで共有メニューを開くと、「Twimarkに追加」がほかの拡張の項目の後ろに出た。
    - その項目の属性は `role`・`tabindex`・`data-slot`・`class`・`data-twimark-item`・`aria-label`・`title` だけで、`data-other-ext` は写っていなかった。
    - 押すと、そのポストの URL が送られ、メニューが閉じた。
- **Edge のヘッドレスで確かめたこと（受け入れ条件 4）:**
  - 拡張の版は 0.2.1 で、`icons` と `default_icon` が入り、4つの絵が読めた（200）。
  - 設定の「接続を確かめる」は、確かめている間ボタンを押せず、仮のトークンで「ログインしてください（unauthorized）」を出した。
- **定義の外での判断:**
  - `iconUrl` は定義では `app.config.js` に常に入れる予定だった。しかし `expo-doctor` が「app config の型にない項目」として落としたので、公開のワークフローが渡す環境変数のときだけ入れる形にした。合わせて `.github/workflows/mobile.yml` と `docs/handbook/configuration.md` も直した。
  - Expo Go が `iconUrl` を読むことは、`expo-manifests` の `Manifest.swift`（`iosAppIconUrl` が `expoClient.iconUrl` を読む）で確かめた。
  - 拡張の設定が止まる原因は、Edge では再現しなかった。止まる代わりに 20 秒で「応答がありません（timeout）」と出るので、まだ起きるならその文で原因を絞る。
  - ログインした X の画面は、Claude in Chrome がつながらず読めなかった。
- **未確認（受け入れ条件 5）:** 利用者が確かめる。
  - Expo Go: 下のタブ、追加のシート、一覧のアイコン（main への push で公開されてから）。
  - iPhone: 「Twimarkへ追加」での追加と失敗。
  - Chrome: 拡張のアイコン、「接続を確かめる」の結果、ログインした X の共有メニュー。

## レビュー記録

- レビュー: Claude Code（2026-10-25。指示どおり、実装に続けて同じセッションで差分レビューをした）
- **判定:** 受け入れ条件 1〜4・6 を満たす。5（利用者の確認）は未確認。
- **差分の確認:**
  - `App.js`: タブの中身の `flex: 1`。`Press` の `style` は Pressable の中の View に付くため、これで高さいっぱいになる。
  - `parts.js` の `BottomSheet`: 開く・閉じる・なぞりで閉じる・動きを減らす設定。
  - `AddScreen.js`: `BottomSheet` への置き換えと、対象外の URL での触覚。
  - `SettingsScreen.js`: 作り方の文。「上の『URL をコピー』」は、文が行の下に出るので合っている。
  - `app.config.js` と `mobile.yml`: `iconUrl` は公開のときだけ。
  - `store.js`・`meta.js`: 時間切れ。本文の読み込みまで含み、タイマーは `finally` で必ず止める。Worker の `cappedFetch` は `signal` を受け取らないが、自分の 8 秒の時間切れを持つので変わらない。
  - 拡張: `options.js` のボタン、`manifest.json` のアイコン、`content.js` の見分け方と複製、`content.css` の印。
  - Web: `style.css` のタブと追加のシート。
- **見つけて直したもの:**
  - `BottomSheet` は、閉じる動きの途中で開き直すと、止められた閉じる動きの終わりの処理（`setShown(false)`）が走ってシートが消えていた。動きが最後まで終わったとき（`finished`）だけ消す形に直した。
- **設計して走らせた試験:**
  - 時間切れの試験を足した。答えない `fetch`・見出しだけ返して本文が来ない `fetch`・時間内に答える `fetch` の3通りで、`store` は `timeout` か通常の結果を返し、`fetchMeta` は `null` を返す。
  - 共有メニューは、ログインした画面とほかの拡張のまねを入れた形で、実際のクリックで確かめた（完了報告）。
  - 直したあとに、`node scripts/self-test.mjs`（65件成功）、`npx expo export --platform ios`、`npx expo-doctor`（21/21）、`check-handbook.mjs` を走らせ直した。
  - 確かめたあと、`wrangler dev`・`workerd`・ヘッドレスの Edge が残っていないことを確かめた。
- **残すもの:**
  - 書き込み（`/api/ops`）が 20 秒を超えて打ち切られても、サーバーでは保存されていることがある。今の作りは失敗のあとに読み直すので、画面は正しい内容に戻る。
  - ログインした X の画面と、利用者の Chrome で設定が止まる原因は確かめられていない。次に起きたら、出た文（`timeout` などのエラーコード）で絞る。
  - Expo Go の一覧のアイコンは、main への push でワークフローが公開してから出る。
