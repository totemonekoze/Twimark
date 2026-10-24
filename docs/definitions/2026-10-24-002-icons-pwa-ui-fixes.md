# Twimark：アイコンとファビコン、PWA、一覧の画面の直し（追加のボタン、下のメニュー、フィルター、カード、色）

- 定義日: 2026-10-24
- 状態: reviewed
- 定義: Claude Code（2026-10-24）
  - 指示: 「以下修正をまとめてください。」の一覧のうち、拡張機能の項目を除いたもの:
    - 「illustratorを用いて、アプリケーションのアイコン、ファビコンを作成ください。」
    - 「追加ボタンの配置位置ですが、添付１のように変なところに出ています。私の想定としては添付２の箇所に配置される感じでした。」
    - 「下部の画面選択メニューの配置位置をすこし下に変更。また、スクロール中は非表示にすること。（フェードでアニメーションして消えたり出たりします）」
    - 「現在、すべて/X/note/Qiitaのメニューで出ているフィルターを、添付２枚目を参考に、検索バーの右側にフィルターのアイコンを追加し、そこから選択できるようにします。」
    - 「投稿カードは前の仕様の方が見やすかったなと思います。ただし、全文表示するのではなく、5行以降は続きを見るで折りたたむこと。」
    - 「アクセントやカテゴリの色を設定するとき、パレットやスライダーを操作しているとスクロールとみなされ、画面が動いてしまいます。」
    - 「アクセント内に表示されるテキストの色も変更できるようにしてください。」
    - 「safariからのPDW化に対応するように。」（PWA のこと）
  - 添付:
    - 1枚目: アプリの一覧で、「＋」が左寄りの下に出て、メニューのボタンと重なっている。
    - 2枚目: 「＋」を右下、メニューのボタンより一段上に置き、検索バーの中の右端にフィルターのアイコン（≡）を置いたもの。
  - その後の回答: 質問（アクセント内の文字の色の選び方）は「どれでもよい」だったので、推奨の案（自動・白・黒・自由な色）にした。
- 拡張機能の項目は `2026-10-24-003-extension-bookmark-button.md`。

## 目的

- **アイコンを作る:** アプリ・ファビコン・PWA・拡張の印を、Illustrator で1つの絵から作る。
- **ホーム画面から使えるようにする:** Safari の「ホーム画面に追加」で、アプリのように全画面で開けるようにする（PWA）。
- **一覧を使いやすく直す:** 追加のボタンを想定の場所へ、下のメニューを少し下へ（送っている間は隠す）。サイトの絞り込みは検索バーの中のアイコンへ、カードは前の形に戻して5行で折りたたむ。
- **色の設定の直し:** 色を選ぶ部品をなぞっても画面が送られないようにする。アクセントの地の上の文字の色も選べるようにする。

## 前提

- 定義 2026-10-24-001 は実装済みで、レビュー中（コミット・公開はまだ）。この定義の実装は、001 をレビューしてコミットしてから始める。混ぜない。
- この PC に Adobe Illustrator 2026 があり、COM（`Illustrator.Application`）から台本（ExtendScript）を流して操作できる（2026-10-24 に確認）。

## 対象ファイル

| ファイル | 変更 |
|---|---|
| `design/icon/twimark-icon.ai`（新規）、`design/icon/make-icon.jsx`（新規） | Illustrator の元の絵と、それを描いて書き出す台本 |
| `src/site/icons/`（新規） | ファビコン（SVG・32px の PNG）、`apple-touch-icon.png`（180）、PWA の 192・512・512 maskable |
| `src/site/manifest.webmanifest`（新規） | PWA の名前・色・アイコン |
| `src/mobile/assets/icon.png` | 1024 の新しいアイコンに替える |
| `src/extension/icons/`（新規） | 16・32・48・128（拡張の定義 003 が使う。backlog の B-002） |
| `migrations/0005_accent_text.sql`（新規） | `users.accent_on` |
| `src/worker/library.js`、`src/shared/store.js`、`src/shared/theme.js` | アクセントの地の上の文字の色 |
| `src/site/index.html`、`style.css`、`app.js`、`colors.js`、`settings.js` | フィルター、カード、下のボタン、文字の色、PWA の印 |
| `src/mobile/App.js`、`parts.js`、`theme.js`、`ColorSheet.js`、`screens/ListScreen.js`、`screens/SettingsScreen.js` | 同じ |
| `scripts/self-test.mjs` | 下の「テスト」 |
| `README.md`、`docs/requirements/current-mvp.md`、`docs/handbook/spec.md`、`configuration.md`、`docs/backlog.md` | 画面、PWA、アイコンの置き場所。B-002 を消す |

## 方法

### アイコン（Illustrator）

- **作り方:** `design/icon/make-icon.jsx`（ExtendScript）を、PowerShell から COM の `DoJavaScriptFile` で Illustrator に流す。
  - 台本が 1024×1024 のアートボードに絵を描き、`design/icon/twimark-icon.ai` に保存する。
  - あわせて、下の大きさの PNG と SVG を書き出す（Illustrator の `exportFile`。PNG24、透過なし。ファビコンの SVG は透過あり）。
  - 絵を直すときは台本を直して流し直す（.ai を手で直したら台本にも写す）。
- **絵の考え方:**
  - 角の丸い正方形（iOS のアイコンの形に合わせ、四隅は透過させず、角丸は OS が付ける）の地に、抹茶の黄緑（既定のアクセント `#8DB255` を中心にした、上が少し明るい縦のグラデーション）。
  - 中央に白のしおり（ブックマークのリボン）。リボンの下の切り込みは、Twimark の「T」の縦棒が抜けて見える形にする。
  - 小さな大きさ（16・32）では、グラデーションをやめた単色の地と太めのしおりの版を別に描く（つぶれないように）。
- **確かめ:** 実装の最初に案を PNG で利用者に見せ、よいと言われてから書き出しと置き換えをする。直しを頼まれたら台本を直して見せ直す。
- **書き出すもの:**

| 使い道 | 大きさ | 置き場所 |
|---|---|---|
| アプリ（Expo） | 1024 | `src/mobile/assets/icon.png` |
| ファビコン | SVG、32 | `src/site/icons/favicon.svg`、`favicon-32.png` |
| iPhone のホーム画面（Safari） | 180 | `src/site/icons/apple-touch-icon.png` |
| PWA | 192、512、512（maskable。しおりを中央 80% の内に収めた版） | `src/site/icons/` |
| 拡張 | 16、32、48、128 | `src/extension/icons/` |

### PWA（Safari の「ホーム画面に追加」）

- **`manifest.webmanifest`:**
  - `name: "Twimark"`、`short_name: "Twimark"`、`start_url: "/"`、`scope: "/"`、`display: "standalone"`
  - `background_color` と `theme_color` は既定の地の色
  - アイコンは 192・512・512 maskable
- **`index.html`:**
  - `<link rel="manifest">`、`<link rel="icon">`（SVG と 32px の PNG）、`<link rel="apple-touch-icon">`
  - `<meta name="apple-mobile-web-app-capable" content="yes">`（と `mobile-web-app-capable`）
  - `<meta name="apple-mobile-web-app-title" content="Twimark">`
  - `<meta name="apple-mobile-web-app-status-bar-style" content="default">`
- **CSP:** 今の `default-src 'self'` のままで、同じオリジンのマニフェストとアイコンは読める。変えない。
- **オフライン:** オフラインでの閲覧は今もしないこと（spec の「しないこと」）なので、サービスワーカーは置かない。iOS のホーム画面に置くのにも要らない。
- **ホーム画面から開いたとき:**
  - 全画面（`standalone`）で開く。上の安全領域は今の作り（`env(safe-area-inset-top)`）で空く。
  - iOS では、ホーム画面のものは Safari と Cookie が別なので、最初に一度ログインが要る（README に書く）。
- **アセットの形:** Worker の静的アセットが `.webmanifest` を `application/manifest+json` で返すことを、`wrangler dev` で確かめる。違えば `_headers` で決める。

### 追加のボタンと下のメニュー（Web とアプリ）

- **追加の「＋」:**
  - 画面の右下に置き、下のメニューのボタンより一段上にする（添付2）。右の端から 16、下の安全領域から 76（メニューのボタンの上に 12 空ける）。
  - **アプリの直し:** 今は、`Press`（`Pressable` の中の `Animated.View`）に `position: 'absolute'` を付けているので、外側の `Pressable` が中央寄せの並びに入り、左寄りに出ている（添付1）。下の帯の中央寄せの並びから外し、画面に対して置く。
- **下のメニューのボタン:**
  - 今より下へ寄せる（下の安全領域から 4。安全領域のない画面では 12）。
  - **送っている間は隠す:**
    - 一覧・カテゴリ・設定のどの画面でも、送り始めたら 0.2 秒でフェードで消す。
    - 送りが止まって 0.5 秒たったら、フェードで出す。
    - 消えている間は押せない。「＋」は隠さない。
    - Web は `scroll` で、アプリは送りの `onScrollBeginDrag`・`onMomentumScrollEnd` などで決める。
    - 動きを減らす設定でも、透明度の変化なので同じにする。

### サイトのフィルター（Web とアプリ）

- 今の「すべて／X／note／Qiita」のセグメントをやめる。
- **アイコンを置く:** 検索バーの中の右端に、フィルターのアイコン（3本線の形。Web は `icons.js` に足し、アプリは SF Symbols の `line.3.horizontal.decrease`）を置く。押せる大きさは 44。
- **押すと:** メニュー（Web はアクションシート、アプリは `ActionSheetIOS`）を出す。項目は「すべてのサイト」「X」「note」「Qiita」で、今の項目にチェックを付ける。
- **絞り込んでいるとき:** アイコンをアクセントの文字の色にし、右上に小さな点を付ける。チップの並びの最後に「X ×」のような外すチップを出す（押すと「すべてのサイト」）。
- 絞り込みは今と同じく URL の `?site=` に残す（Web）。

### カード（Web とアプリ）

- 1件1行のリストをやめ、2026-10-22-001 のカードに戻す。
  - 画像は上に大きく。複数は2列、1枚は高さを抑えて全幅。
  - カテゴリの札（`カテゴリ › サブカテゴリ`、押すとカテゴリの変更）、サイト、「…」、タイトル、本文、作者と日付。
- **本文:** 5行を超えたら折りたたみ、「続きを見る」で、その場で全部を出す（もう一度押すと「閉じる」で戻す）。
- 「…」のメニューから「全文を読む」をなくし、全文のシートもなくす（その場で開けるので）。
- 画像のないカードの、カテゴリの色の四角の頭文字もなくす（前の形どおり、画像の欄を出さない）。
- **並び:**
  - 縦長は1列、600px 以上の縦長は2列（前と同じ）。
  - 横長の一覧の画面はメイソンリー（`columns: 4 300px`、前と同じ）。
- 読み込み中の淡い四角は、カードの形に替える。

### 色を選ぶシートでなぞっても送られないようにする（アプリ）

- **送りを止める:** 彩度と明るさの四角・色相の帯・よく使う色の並びを指で触っている間は、シートの送り（`ScrollView`）を止める（`scrollEnabled` を false）。
  - `Sheet` に `scrollEnabled` を渡せるようにする。
  - 四角と帯の `onPanResponderGrant` で止め、`Release`・`Terminate` で戻す。
- **シートが閉じないようにする:** 色を選ぶシートは、下へなぞってシートが閉じる動きも起きないようにする。
  - React Native の `Modal` で使える方法（`presentationStyle` を `fullScreen` に替える、か、使える版なら下へのなぞりで閉じない設定）で止める。
  - Expo Go の SDK 57 で動くほうを実装で選び、完了報告に書く。
- **Web:** OS の色の選び方を使っているので変えない。ただし、シートの上の帯を下へなぞると閉じる動きが、色の欄から始まったときに起きないことを確かめる（帯の中だけで始まる、今の作り）。

### アクセントの地の上の文字の色

- **保存:** `users.accent_on`（`#RRGGBB`。NULL は自動）。`0005` で足す。
- **`accentSet(hex, on)`:**
  - `on` が来たら、`onAccent` をその色にする。来なければ今と同じ自動（白か黒の読みやすいほう）。
  - `accentText` など、面の上の色は今のまま。
- **API:**
  - `/api/data` が `accentOn` を返す。
  - 変える操作は `POST /api/ops { op: 'setAccentText', args: ['#RRGGBB' | null] }`。形が違えば `invalid_color`。
- **画面:** 設定の「外観」に「アクセントの文字の色」の行を足す（アクセントの色の行の下）。
  - 押すと色を選ぶシート（新しい種類 `accent-text`）を出す。
  - 中身: 見本（今のアクセントの地に、選んでいる文字の色で「選択中」「ボタン」と「＋」）、「自動」「白」「黒」、自由な色（アクセントと同じ選び方）。
  - 見本の組が 4.5:1 に届かないときは、見本の下に「読みにくいかもしれません（コントラスト 3.2:1）」のように出す。保存はできる。
- アクセントの色を「既定に戻す」でも、文字の色はそのまま残す（別の設定）。

## テスト

`self-test.mjs` に、次を確かめる試験を足す。

- `0005` が当たり、今の行は `accent_on` が NULL。
- `setAccentText`:
  - `#RRGGBB` を保存して `/api/data` の `accentOn` で返す。null で消える。
  - 形の違うものは `invalid_color`。
  - ほかの利用者に触れない。
- `accentSet(hex, on)` は、`on` があればその色、なければ今と同じ値（既定の値の試験はそのまま通る）。
- `manifest.webmanifest`: JSON として読め、`start_url`・`display: standalone`・192 と 512 のアイコン（maskable を含む）があり、指すファイルが `src/site/icons/` にある。
- `index.html` が manifest・favicon・apple-touch-icon を指し、そのファイルがある。
- 拡張のアイコン 16・32・48・128 と、アプリの 1024 のアイコンが PNG として読め、大きさが合う（PNG の頭の IHDR を読む）。

## 範囲外

- サービスワーカー、オフラインでの閲覧、プッシュ通知
- Android 用のアイコンの形（adaptive icon の前景と背景の分け）。Expo の `android` の設定は今のまま
- アプリの起動画面（splash）の絵
- 拡張機能の変更（定義 003）
- コミット、プッシュ、公開、本番の D1 への `0005` の適用（この定義の指示にない）

## 受け入れ条件

1. `node scripts/self-test.mjs` がすべて成功する（「テスト」に挙げたものを含む）。
2. `node scripts/build.mjs` のあと全 JS が `node --check` を通る。`src/mobile` の `npx expo export --platform ios` と `npx expo-doctor`、`npx wrangler deploy --dry-run` が通る。
3. 利用者がアイコンの案を見て、よいと言っている（完了報告に書く）。
4. 手元の `wrangler dev` で、実装者が縦長（390px）と横長（1280px）、ライトとダークで次を確かめる。
   - 「＋」が右下でメニューのボタンの一段上にある。
   - メニューのボタンが下に寄り、送ると消えて、止まると出る。
   - フィルターのアイコンから X・note・Qiita で絞り込め、絞り込んでいるしるしと外すチップが出る。
   - カードが前の形で、5行を超える本文が「続きを見る」で開閉する。
   - アクセントの文字の色を自動・白・黒・自由な色に変えられ、読みにくいときに注意が出る。
   - ファビコンが出て、マニフェストとアイコンが読める。
5. iPhone で、利用者が次を確かめる。
   - Safari で「ホーム画面に追加」して全画面で開き、アイコンが出る。
   - Expo Go のアプリで「＋」とメニューの位置。
   - 色を選ぶシートでなぞっても送られず、閉じない。
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
cd src/mobile && npx expo export --platform ios --output-dir ../../build/mobile && npx expo-doctor
```

```bash
node C:/Users/SB-315/.claude/skills/project-handbook/scripts/check-handbook.mjs .
```

## 完了報告

- 実装: Claude Code（2026-10-24）
- **検証の実行と結果:**
  - `node scripts/self-test.mjs`: 57件すべて成功（`setAccentText`、`accentSet(hex, on)`、アイコンの PNG の大きさと favicon.svg、マニフェストと `index.html` の印の試験を含む）。
  - `node scripts/build.mjs` のあと、画面と拡張の全 JS が `node --check` を通った。`npx wrangler deploy --dry-run` も通った。
  - `src/mobile` の `npx expo export --platform ios`（631 モジュール）と `npx expo-doctor`（21/21）が通った。
  - `check-handbook.mjs`: 問題なし。
  - 手元の `wrangler dev`（作業用の新しい D1 に 0001〜0005 を当て、試しの利用者と3件で確かめた。作業のあと消した）:
    - `/manifest.webmanifest` は `application/manifest+json`、`/icons/favicon.svg` は `image/svg+xml` で返る。`_headers` は要らなかった。
    - 390px 相当（375×812）: 「＋」は右端から 16、メニューのボタンとの間が 12。送ると `body.scrolling` でメニューのボタンが消え（押せない）、0.5 秒で戻る。
    - フィルターのアイコンのメニュー（今の項目にチェック）から Qiita で絞ると1件になり、アイコンに点、`?site=qiita`、外すチップが出て、チップで外れる。ダークでも確かめた。
    - 本文12行のカードは5行で切れ、「続きを見る」が出る。画像のないカードは画像の欄を出さない。
    - 横長（1280×800）: カードは `columns: 4 300px`、メニューのボタンは出ず、「＋」は右下。
    - アクセントの文字の色: 白・黒がすぐ決まり、自由な色で組が 4.5:1 に届かないと「読みにくいかもしれません（コントラスト 1.7:1）」が出る。白を保存すると `/api/data` の `accentOn` と `--on-accent` が白になり、アクセントを既定に戻しても残り、「自動」で消える。
  - 利用者はアイコンの案を見て、よいと言った（「これでよいし、かなりいい」）。
  - まだ確かめていないもの（受け入れ条件 5）: iPhone の Safari の「ホーム画面に追加」、Expo Go での「＋」とメニューの位置、色のシートをなぞったときの動き。利用者に確かめてもらう。
- **定義の外で決めたこと:**
  - 色のシートを下へなぞっても閉じないようにするのは、`presentationStyle` を替えず、React Native 0.86 の `Modal` の `allowSwipeDismissal={false}` にした（`Sheet` の `swipeToClose`。ほかのシートは渡さず今のまま）。
  - 送りの合図は `useScroll()` が `hide`（`onScrollBeginDrag`・`onMomentumScrollBegin` で消し、`onScrollEndDrag`・`onMomentumScrollEnd` から 0.5 秒で出す）として返し、一覧・カテゴリ・設定の送りに付けた。アプリの送りの下の余白は、一段上がった「＋」に合わせて広げた。
  - アプリのカードの5行の判定は、同じ本文の見えない写しの `onTextLayout` の行数で測る。Web は `ResizeObserver` で `scrollHeight` と比べる。
  - アプリのフィルターのメニューは `ActionSheetIOS` にチェックの印がないので、今の項目の頭に「✓ 」を付けた。
  - 色のシートの見本のうち、なくなった行の頭文字の四角（カテゴリ）は消し、アクセントの文字のときは「＋」の丸を出す。
  - 拡張のアイコン（`src/extension/icons/`）は書き出したが、`manifest.json` で指すのは定義 003 で行う（この定義の対象ファイルに `manifest.json` がないため）。backlog の B-002 は定義どおり消した。
  - 手元の確かめは、ふだんの `.wrangler` の D1 に前からの利用者がいたので、`--persist-to .wrangler/test-state` の作業用の D1 で行った。

## レビュー記録

- レビュー: Claude Code（2026-10-24）。コミットされていない作業ツリーの差分（追跡されていない `design/icon/`・`src/site/icons/`・`src/extension/icons/`・`manifest.webmanifest`・`0005_accent_text.sql` を含む）と、この定義ファイルを見た。定義 003 は範囲外。コミット、プッシュ、公開、本番の D1 への `0005` の適用はしていない。
- 見たところ:
  - データ: `0005_accent_text.sql`、`library.js` の `readData`・`setAccentText`、`store.js` の `normalize`・`ops`、`theme.js` の `accentSet(hex, on)`
  - Web: `app.js`（カード、`ResizeObserver` の5行の判定、フィルター、外すチップ、`body.scrolling`）、`colors.js`、`settings.js`、`ui.js` の `actionSheet`、`icons.js`、`index.html`、`style.css`、`manifest.webmanifest`
  - アプリ: `App.js`（`BottomBar`、`ScrollHideContext`）、`parts.js`（`useScroll`、`Sheet` の `scrollEnabled`・`swipeToClose`）、`theme.js`、`ColorSheet.js`、`screens/*.js`。`allowSwipeDismissal` は手元の React Native 0.86.3 の `Modal` にあることを確かめた
  - アイコン: `make-icon.jsx`、`.ai`（中の圧縮された流れもほどいて）と PNG・SVG に、利用者名・パス・メールアドレスが入っていないこと
  - 文書: README、`current-mvp.md`、`spec.md`、`configuration.md`、`backlog.md`、`INDEX-records.md`

### 直した不具合

1. **手元の http ではファビコンとアイコンが CSP で止まる。**
   - `index.html` の CSP は `img-src https: data:` で、`'self'` がない。`img-src` があると `default-src 'self'` は画像に効かないので、`http://localhost:8787` では `icons/favicon.svg`・`favicon-32.png`・`apple-touch-icon.png` が読めなかった（コンソールに CSP の違反が出る）。本番は https なので `https:` で通っていた。
   - `img-src 'self' https: data:` にし、`configuration.md` の CSP の行も直した。直したあと、手元で3つとも読めた（32・180 の大きさ）。

### 足した試験（`self-test.mjs` の「レビューで足した試験（定義 2026-10-24-002）」）

- `0005` を当てる前からいる利用者（`0001`〜`0004` のあとに行を足し、それから `0005`）は `accent_on` が NULL で、`accent` はそのまま。
- `normalize` は形の合う `accentOn` だけ通す。`accentSet` は形の違う文字の色（`white`・`#12345`・`0`）を自動にし、小文字は大文字にそろえ、選んだ文字の色は `onAccent` だけを変える（`accentText` など面の上の色はライト・ダークとも同じ）。
- `app.js`・`colors.js`・`settings.js` が指す `[data-…]` の印が、すべて `index.html` にある（全文のシートやセグメントを消したときの指し残しを見る。94 か所）。`index.html` にインラインの `<style>`・`style=`・`on…=`・中身のある `<script>` がなく、CSP の `img-src` に `'self'` がある。
- マニフェストの `background_color`・`theme_color` が既定の地の色（ライトの `bg`）で、`scope` が `/`。

### 流した確かめ

- `node scripts/self-test.mjs`: 61件すべて成功（足した4件を含む）。
- `node scripts/build.mjs` のあと、画面と拡張の全 JS が `node --check` を通った。`npx wrangler deploy --dry-run` も通った。
- `src/mobile` の `npx expo export --platform ios --output-dir ../../build/mobile`（631 モジュール）と `npx expo-doctor`（21/21）が通った。
- `check-handbook.mjs`: 問題なし。
- 手元の `wrangler dev --persist-to .wrangler/test-state`（作業用の D1 に 0001〜0005 を当て、試しの利用者と3件。あとで止め、`workerd` が残らずポート 8787 が空いたことを確かめ、`.wrangler/test-state` を消した）:
  - `/manifest.webmanifest` は `application/manifest+json`、`favicon.svg` は `image/svg+xml`、`apple-touch-icon.png` は `image/png`。
  - 375×812: 「＋」は右端から 16、メニューのボタンとの間が 12。メニューのボタンは下から 16（帯は 12、ボタンは帯の中で 4 上）。送ると `body.scrolling` で透明になり押せず、止まって 0.5 秒で戻る。「＋」は消えない。
  - フィルター: メニューは今の項目にチェック。Qiita で1件になり、`?site=qiita`、アイコンの色と点、「Qiita の絞り込みを外す」チップが出て、チップで外れる。ダークでも見た。
  - 本文12行のカードは5行（113px）で切れ、「続きを見る」で開き（270px、`aria-expanded`）、「閉じる」で戻る。5行以内のカードには出ない。
  - アクセントの文字の色: 自由な色 `#AACC77` で「読みにくいかもしれません（コントラスト 1.3:1）」。白で保存すると `/api/data` の `accentOn` と `--user-on-accent-l` が白、アクセントを既定に戻しても白が残り、「自動」で NULL に戻る。
  - 1280×800: カードは `columns: 4 300px`、メニューのボタンは出ず、「＋」は右下（16・12）。

### 今回は直さない気づき

- **公開の順番:** Worker の `readData` は `users.accent_on` を読むので、`0005` を本番の D1 に当てる前に Worker を公開すると `/api/data` が失敗する。公開の前に `npm run db:migrate` を行う（001 の `0004` と同じ）。
- **「＋」の高さの数字:** 定義の「下の安全領域から 76」は前のメニューのボタンの位置からの数。メニューのボタンを下げたので、実装は「メニューのボタンの上に 12」を守り、下の安全領域から 68（安全領域のない画面では 76）になる。spec も「12 空ける」と書いているので、このままでよい。
- **アプリのメニューのボタンが消えたままになる場合:** 送りの慣性の途中で画面が替わると `onMomentumScrollEnd` が来ず、もう一度送るまで消えたまま。メニューのボタンが消えている間は画面を替えにくいので起きにくく、送れば戻る。
- 小さなもの:
  - Web の文字の色のシートでは、白・黒の上の見出しが「決まった色」のまま（アプリは見出しなし）。
  - 画像が3枚のカードは、Web は2列の3枚目が半分の幅、アプリは3枚目が全幅。
  - Web の画像のリンクは、元の URL が https でなければ `#` を指す（保存されたものは https なので、ふつうは起きない）。
  - 絞り込みを続けて押すと、View Transitions の `Transition was skipped` がコンソールに出る（前からの `transition()` の作り。動きは正しい）。
  - `favicon.svg` に `width`・`height` がない（`viewBox` だけ）。ファビコンとしては問題ない。
- 問題なし:
  - `setAccentText` は `checkColor` で形を見て大文字にそろえ、`users.id` で絞り、ほかの利用者に触れない。
  - CSP: 色は CSSOM の `style.setProperty` で入れ、`<style>` も `style` 属性の文字列も足していない。マニフェストは `manifest-src` がないので `default-src 'self'` で読める。
  - 動きを減らす設定: メニューのボタンは透明度だけ、`.filter-btn` は縮みを止める側に足してある。
  - アプリの hooks の順、`Sheet` の `scrollEnabled`（`scroll` のときだけ渡す）、`swipeToClose` を色のシートだけで渡すこと。
- まだ確かめていないもの（受け入れ条件 5、利用者）: iPhone の Safari の「ホーム画面に追加」、Expo Go の「＋」とメニューの位置、色のシートをなぞったときに送られず閉じないこと。

## 追補: レビューの気づきの直し（2026-10-24）

- 指示: 「直していない気づきも直して、プッシュ、公開まで進めてしてください」（レビュー記録の「今回は直さない気づき」をすべて直し、コミット・プッシュ・公開まで）
- **直すもの:**
  1. **公開の順番:** 公開の前に、本番の D1 に `0005` を当てる（`npm run db:migrate`）。そのあと `npm run deploy`。
  2. **「＋」の高さの数字:** 実装（メニューのボタンの上に 12 空ける。下の安全領域から 68、安全領域のない画面では 76）を正とする。コードは変えず、この追補で定義の「下の安全領域から 76」を置き換える。
  3. **アプリのメニューのボタンが消えたままになる:** `App.js` の `Root` で、画面（`tab`）が替わったら待ちを消し、すぐに出す（押せるようにし、透明度を 1 に）。
  4. **Web の文字の色のシートの見出し:** 白・黒の上の見出しを、アクセントの文字のときは出さない（アプリと同じ）。カテゴリのときは今どおり「決まった色」。
  5. **画像が3枚のカード:** Web もアプリと同じく、3枚目を全幅にする（`.media[data-count='3']` の最後を2列にまたがせる）。
  6. **Web の画像のリンク:** 元の URL が https でないときは、画像をリンクにしない（`#` を指さない）。
  7. **`Transition was skipped`:** `transition()` で、飛ばされた View Transitions の `ready` の失敗を受け止める（動きは今のまま）。
  8. **`favicon.svg` の大きさ:** `make-icon.jsx` で、書き出した SVG に `width="1024" height="1024"` を書き足す。Illustrator は流し直さず、同じ書き足しを今の `favicon.svg` にも行う（絵は変わらない）。
- **試験:** `self-test.mjs` に、`favicon.svg` に幅と高さがあること、`transition()` が `ready` を受け止めていること、画像のリンクが https のときだけ作られることを足す（ソースの形で見る）。
- **確かめ:** 「検証コマンド」をすべて流す。手元の `wrangler dev`（作業用の D1）で、3枚のカード、https でない URL のカード、文字の色のシートの見出し、続けての絞り込みでコンソールに失敗が出ないことを見る。アプリのメニューの戻りは iPhone で利用者が見る。
- **範囲外:** 定義 003（拡張）。コミットには入れない（`INDEX-records.md` の 003 の行も入れない）。

### 追補の完了報告

- 実装: Claude Code（2026-10-24）。レビューをした同じセッションで直した。
- **直したもの:**
  - アプリ: `App.js` の `Root` で、`tab` が替わったら待ちを消し、メニューのボタンを押せるようにして透明度を 1 にする（待ちの値は `showTimer` の ref に移した）。
  - Web: `transition()` が `ready.catch` で、飛ばされた動きを受け止める。画像は元の URL が https のときだけ `<a>`、そうでなければ `<span>`（CSS は `.media > *`）。3枚のカードは3枚目が全幅。文字の色のシートは白・黒の上の見出しを隠す（`data-color-tones-title`）。
  - `make-icon.jsx` が `favicon.svg` に `width="1024" height="1024"` を書き足す。Illustrator は流し直さず、同じ書き足しを今の `favicon.svg` に行った。
  - 公開の順番と「＋」の高さは、上の「直すもの」の 1・2 のとおり（コードは変えない）。
- **検証の実行と結果:**
  - `node scripts/self-test.mjs`: 62件すべて成功（追補の試験を含む）。
  - `node scripts/build.mjs` のあと全 JS が `node --check` を通った。`npx wrangler deploy --dry-run` が通った。
  - `src/mobile` の `npx expo export --platform ios`（631 モジュール）と `npx expo-doctor`（21/21）が通った。`check-handbook.mjs`: 問題なし。
  - 手元の `wrangler dev`（作業用の D1。あとで止め、`workerd` が残らずポート 8787 が空いたことを確かめ、消した）: 3枚のカードは 155・155・311px の幅で3枚目が全幅。URL を `http://` にしたカードの画像は `<span>` でリンクにならない。文字の色のシートは見出しが隠れ、白・黒の2つ。絞り込みを続けて4回押してもコンソールに失敗が出ない。`favicon.svg` は画像として 1024 の大きさで読める。
  - まだ確かめていないもの: アプリで送りの途中に画面を替えたときのメニューのボタン（iPhone で利用者が見る）。
- **公開（2026-10-24）:**
  - コミット `98a2f09` を main にプッシュした。定義 003 と、`INDEX-records.md` の 003 の行は入れていない。
  - `npm run db:migrate` で本番の D1 に `0005_accent_text.sql` を当てた（1回目の `migrations list` は Cloudflare の API が `7403` を返したが、続けて流すと通った）。当てたあと、利用者は1人で `accent_on` は NULL。
  - そのあと `npm run deploy`（自己テスト 62 件成功、Version ID `b68d4260-bd42-4ebc-9f71-b196a88c93fb`）。
  - 公開先で `/` は CSP が `img-src 'self' https: data:` で、マニフェスト・フィルターのアイコン・カードの印がある。`/manifest.webmanifest` は `application/manifest+json`、`/icons/favicon.svg` は `image/svg+xml`、`apple-touch-icon.png`・`icon-512-maskable.png` は `image/png`。ログインなしの `/api/data` は 401（500 ではない）。
  - 残り: iPhone での確かめ（受け入れ条件 5 と、追補のメニューのボタンの戻り）は利用者が行う。
