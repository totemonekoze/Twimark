# Twimark：ログイン（ID・パスワード・パスキー）、Cloudflare Workers と D1 への移行、サブカテゴリ

- 定義日: 2026-10-21
- 状態: reviewed（拡張と iPhone アプリでの受け入れ条件6・7は未確認）
- 実装: Claude Code（2026-10-21、「実装してください」。D1 の作成、マイグレーション、公開まで行った）
- レビューとコミット: Claude Code（2026-10-21、「003をレビューしてコミットしてください」。push はしない）
- 定義: Claude Code（2026-10-21）
  - 指示: 「私のブックマークにだれでもアクセスできると困るので、アカウントを持つようにして下さい。ID+password+passkey（任意、パスキーが設定されている場合はログイン時にパスキーを求めるように優先する）」「ブックマークにサブカテゴリを持たせるようにしてください」
  - その後の回答: 「手元から私が公開」「自分だけ」「Cloudflare D1」「1段だけ」
  - `2026-10-21-002-cloudflare-deploy.md` をこの定義で置き換える。API トークンの作成と GitHub の Secrets への登録は頼まれたが、安全の決まりで Claude は行わない。代わりに、手元のログイン済みの wrangler から公開する形にした。

## 目的

ブックマークを自分だけが見られ、自分だけが変えられるようにする。あわせて、カテゴリの下にサブカテゴリを1段持てるようにする。

- **データ:** 公開リポジトリの `data/bookmarks.json` をやめ、Cloudflare D1 に置く。読み書きは Cloudflare Workers の API を通し、ログインしていなければ読めない。
  - `data/bookmarks.json` は一度も作られていない（2026-10-21 に 404 を確認）。移し替えるデータはない。
  - GitHub のトークンは使わなくなる。
- **アカウント:** 利用者1人だけ。最初の1人が ID とパスワードで登録すると、登録は閉じる。
  - パスキーは任意で足せる。パスキーがある ID では、ログインのときにパスキーを先に求める。パスキーが使えないときのために、パスワードでのログインも残す。
- **配信:** 一覧の画面と API を、1つの Worker `twimark` で workers.dev に出す。公開は手元のログイン済みの wrangler から行う（Portal と同じ）。GitHub Pages の配信はやめる。
- **サブカテゴリ:** カテゴリの下に1段。ブックマークは、カテゴリを必ず1つ、サブカテゴリを任意で1つ持つ。
- **3つの入口:** 一覧の画面、拡張、iPhone アプリのすべてが、新しい API とログインに移る。

## 前提

- この PC の wrangler は Cloudflare に OAuth でログイン済み（2026-10-21 に `wrangler whoami` で確認）。D1 の作成、マイグレーション、`wrangler deploy` は実装者が行える。
- 最初のアカウントの登録は利用者が画面で行う。パスワードは Claude に渡さない。
- `2026-10-21-001-iphone-app.md` の実機での受け入れ条件4・5は未確認。この定義の実装でアプリの保存先とログインが変わるので、実機での確認はこの定義の受け入れ条件でまとめて行う。

## 対象ファイル

| ファイル | 変更 |
|---|---|
| `wrangler.jsonc`（新規） | Worker `twimark`。`main: src/worker/index.js`、`assets`（`./build/site`、`run_worker_first: ["/api/*"]`）、D1 のバインド `DB`、`workers_dev: true`、`preview_urls: false`。`account_id` は書かない |
| `migrations/0001_init.sql`（新規） | D1 の表 |
| `src/worker/`（新規） | API、ログイン、セッション、パスキー、データの操作 |
| `src/shared/store.js` | 保存先を GitHub から Worker の API に替える。`ops` は、操作の名前と引数を API に送る形にする。サブカテゴリの操作を足す |
| `src/shared/view.js` | サブカテゴリの絞り込みと検索の対象 |
| `src/site/`（`index.html`、`app.js`、`style.css`） | ログインと登録の画面、設定（パスキー、パスワード、端末のトークン、ログアウト）、サブカテゴリの表示・絞り込み・管理、CSP |
| `src/extension/` | 設定を「端末のトークン」と Twimark の URL に替える。追加でサブカテゴリを選べるようにする。`manifest.json` の `host_permissions` から `api.github.com` を外し、Worker の URL を足す |
| `src/mobile/` | ログイン（Web の画面をアプリ内で開く。パスワードだけの画面を予備に持つ）、サブカテゴリ、`github.js` を消す、`WEB_URL` を新しい URL に |
| `package.json` | 依存（`wrangler`、`@simplewebauthn/server`）と、`deploy`・`db:migrate` のスクリプト |
| `.github/workflows/pages.yml` | 消す |
| `.github/workflows/mobile.yml` | `paths` はそのまま。`data/**` の記述があれば消す |
| `.gitignore` | `.wrangler/`、`wrangler-account.json`、`.dev.vars` |
| `scripts/self-test.mjs` | Worker の API を Node の `node:sqlite` の上で試す |
| `AGENTS.md`、`README.md`、`docs/requirements/`、`docs/handbook/` | データの置き場所、ログイン、配信、サブカテゴリ、手順を書き直す |
| `docs/definitions/2026-10-21-002-cloudflare-deploy.md` | 状態を `superseded（2026-10-21-003 に置き換え）` にする |

## 方法

### データ（D1）

表は利用者ごとに分ける（`user_id`）。利用者は1人だが、行の持ち主をはっきりさせるため。

| 表 | 列 |
|---|---|
| `users` | `id`、`login`（一意）、`password_hash`、`password_salt`、`password_iterations`、`created_at` |
| `passkeys` | `id`（credential ID、base64url）、`user_id`、`public_key`、`counter`、`transports`、`name`、`created_at`、`last_used_at` |
| `sessions` | `token_hash`（SHA-256）、`user_id`、`kind`（`web` か `device`）、`name`、`created_at`、`expires_at`、`last_used_at` |
| `challenges` | `id`、`user_id`、`purpose`（`register` か `login`）、`challenge`、`expires_at` |
| `login_failures` | `login`、`failed_at` |
| `categories` | `user_id`、`name`、`position` |
| `subcategories` | `user_id`、`category`、`name`、`position` |
| `bookmarks` | `user_id`、`id`、`site`、`url`、`author_name`、`author_handle`、`posted_at`、`title`、`text`、`photos`（JSON）、`videos`（JSON）、`category`、`subcategory`（NULL 可）、`saved_at`。主キーは `(user_id, id)` |

- ブックマークは1件1行にする。1つの JSON に詰めると、D1 の1行の上限（1〜2MB）にいずれ当たるため。
- 既定のカテゴリ（今の6つ）は、最初の登録のときに作る。

### サブカテゴリ

- 上限はカテゴリ1つあたり30個、名前は20文字まで（カテゴリと同じ）。
- 名前は同じカテゴリの中で重複させない。別のカテゴリなら同じ名前でよい。
- **カテゴリを消したとき:** 今と同じく、ブックマークは消さず「未分類」に出す。そのカテゴリのサブカテゴリは消す。ブックマークの `subcategory` は残すが、表示では使わない。
- **サブカテゴリを消したとき:** そのサブカテゴリのブックマークは `subcategory` を NULL にし、カテゴリの直下に戻す。
- **表示:**
  - 一覧の画面: サイドメニューで、カテゴリの下にサブカテゴリを字下げして並べ、件数を出す。サブカテゴリを選ぶとその中だけを出す（クエリは `?category=<名前>&sub=<名前>`）。カテゴリを選ぶと、サブカテゴリのものも含めて出す。
  - カード: `カテゴリ › サブカテゴリ` と出す。カテゴリの変更の選択肢は、カテゴリと、その下のサブカテゴリの組（`<optgroup>`）。
  - 検索の対象にサブカテゴリの名前も入れる。
- **管理:**
  - 一覧の画面: サブカテゴリの追加・削除・並べ替え（同じカテゴリの中で、ドラッグと ↑↓ キー）。
  - アプリ: 追加・削除と、↑↓ ボタンでの並べ替え。
- **追加の画面:** 拡張とアプリは、カテゴリを選ぶとサブカテゴリを選べる（「なし」が既定）。前回選んだ組を覚える。

### API（`src/worker`）

- `/api/*` だけを Worker が受け、ほかは静的アセットが返す。
- **応答:**
  - すべて JSON で返し、`cache-control: no-store` を付ける。iOS がキャッシュから返さないようにするため。これでアプリの `github.js` の時刻のクエリが要らなくなる。
  - エラーは `{ error: { code, message } }`。`code` は今の `StoreError` と同じ名前をできるだけ使う（`unauthorized`、`duplicate`、`invalid_category` など）。
- **認証:**
  - 一覧の画面は Cookie（`__Host-twimark`、`HttpOnly; Secure; SameSite=Strict; Path=/`、30日、使うたびに延ばす）。
  - 拡張とアプリは `authorization: Bearer <端末のトークン>`。
  - セッションと端末のトークンは、32バイトの乱数を base64url にした値。D1 には SHA-256 だけを置く。
  - Cookie での書き込みは、`Origin` が自分と同じでなければ拒む（CSRF の対策）。
- **登録とログイン:**
  - `GET /api/session`: ログインの状態と、登録できるか（`users` が0件か）を返す。
  - `POST /api/setup`: `users` が0件のときだけ受け付ける。ID は 3〜32 文字の英数字と `_-`、パスワードは10文字以上。
  - `POST /api/login/start { login }`: その ID にパスキーがあるかを返す。あれば認証のオプション（`allowCredentials` 付き）も返す。ID がないときも、あるときと同じ形で返す（ID があるかを知られないため）。
  - `POST /api/login/password`、`POST /api/login/passkey`: パスワードかパスキーでログインする。
  - 失敗が同じ ID で15分に5回を超えたら、15分ログインさせない（パスキーは数えない）。
  - `POST /api/logout`: 今のセッションか端末のトークンを消す。
- **パスキー:** `@simplewebauthn/server` で行う。
  - 登録のオプションと検証は `POST /api/passkeys/options` と `POST /api/passkeys`。一覧は `GET /api/passkeys`、削除は `DELETE /api/passkeys/:id`。
  - rpID はリクエストのホスト名、origin はリクエストのオリジンにする。workers.dev は Public Suffix List にあるので、rpID は `twimark.<サブドメイン>.workers.dev` そのものになる。
  - `userVerification: 'preferred'`。チャレンジは5分で切れ、使ったら消す。
- **パスワード:**
  - PBKDF2-SHA256 で保存する。反復回数は、Workers の `crypto.subtle` が受け付ける最大にする（10万回が上限という情報がある。実装で確かめ、使った回数を `password_iterations` に置く）。比べるときは時間が一定になるようにする。
  - 変更は `POST /api/password { current, next }`。変えたら、ほかのセッションと端末のトークンをすべて消す。
- **端末のトークン:** 一覧の画面の設定から発行する。
  - `POST /api/tokens { name }` が値を1度だけ返す。
  - `GET /api/tokens` で一覧、`DELETE /api/tokens/:id` で取り消す。
- **データ:**
  - `GET /api/data` が `{ categories: [{ name, subcategories: [name] }], bookmarks }` を返す。
  - `POST /api/ops { op, args }` が1つの操作を行い、操作のあとのデータを返す。
  - 操作は今の `ops` と同じ名前にする（`add`、`remove`、`setCategory`、`addCategory`、`removeCategory`、`sortCategories`）。足すのは `addSubcategory`、`removeSubcategory`、`sortSubcategories`。`setCategory` は `(id, category, subcategory)` にする。
  - 検査の決まり（文字数、個数、重複、一覧にないカテゴリ、並びの集合）は今の `ops` と同じにする。1つの操作は `DB.batch` でまとめて書く。
- **テスト:** 自己テストで、D1 の代わりに `node:sqlite` の上に小さな置き換えを作り、Worker の `fetch` を直接呼ぶ。次を確かめる。
  - 登録が1回で閉じること
  - パスワードのログインと、失敗の回数の制限
  - Cookie と Bearer の両方での認証
  - `Origin` の検査
  - 各操作の検査と、サブカテゴリの消し方
  - ログインしていなければ `/api/data` が 401 になること
  - パスキーは、オプションを作れることと、壊れた応答を拒むことまで

### 一覧の画面

- `store.js` は `createStore({ base: '', token })` にする（同じオリジンなので `base` は空。Cookie を使う）。`load()` は `GET /api/data`、`update(op)` は `POST /api/ops`。409 での読み直しはなくなる。
- **ログインの画面:**
  - 起動したら `GET /api/session` を読む。`users` が0件なら登録の画面、ログインしていなければログインの画面を出す。
  - ログインの画面は、ID を入れて「次へ」を押す。パスキーがあれば、すぐに `navigator.credentials.get()` でパスキーを求める。
    - 求めた画面の下に「パスワードでログイン」を出す。
    - パスキーがなければパスワードの欄を出す。
  - オプションの変換は、ブラウザの `PublicKeyCredential.parseRequestOptionsFromJSON`・`parseCreationOptionsFromJSON` と `toJSON()` を使う。ブラウザ用のライブラリは入れない。
    - これらがないブラウザではパスキーの操作を出さず、パスワードだけにする。
- **設定:** ダイアログを、ログインしたあとの設定に替える。中身は次のとおり。
  - パスキーの追加・一覧・削除
  - パスワードの変更
  - 端末のトークンの発行・一覧・取り消し
  - ログアウト
  - GitHub のトークンの欄は消す。
- **アプリのログインの受け渡し:** `?app=<戻り先>` 付きでログインの画面を開いたときは、ログインのあとに確認を出す。「この端末の Twimark アプリにログインを渡しますか」と、戻り先を見せる。
  - 「渡す」を押すと、`POST /api/tokens { name: 'iPhone' }` で端末のトークンを作り、`<戻り先>#token=<値>` へ移る。
  - 戻り先は `exp:` と `twimark:` の scheme だけを受け付ける。
- **CSP:** `connect-src 'self'` にする。`api.github.com` は外す。
- 見るだけの表示（`read-only`）はなくす。ログインしていなければ一覧は出ない。

### 拡張

- **設定:** Twimark の URL（既定は公開 URL）と端末のトークン。「接続を確かめる」は `GET /api/data` の件数を出す。
- **追加:** カテゴリとサブカテゴリを選んで、`POST /api/ops` の `add` を送る。
- **`manifest.json`:** `host_permissions` は `api.github.com` を外し、`https://*.workers.dev/*` ではなく公開 URL のホストだけを足す。

### iPhone アプリ

- **ログイン:** 「設定」の「ログイン」で、`WebBrowser.openAuthSessionAsync('<公開 URL>/?app=<Linking.createURL("login")>', <戻り先>)` を開く。
  - Safari と同じ認証の画面になるので、パスキーが使える。
  - 戻ってきた URL の `#token=` をキーチェーンに置く。
- **予備のログイン:** Expo Go で上の受け渡しが動かないときのために、ID とパスワードだけでログインする画面も持つ。その場合は、ログインしたあと `POST /api/tokens` で端末のトークンを作る。
- **保存先:** Worker の API に替え、`github.js` を消す。応答に `no-store` が付くので、キャッシュの対策は要らない。
- **ログアウト:** `POST /api/logout` を送ってから、キーチェーンから消す。
- **サブカテゴリ:** 一覧の絞り込み（カテゴリを選ぶと、その下にサブカテゴリの並びを出す）、カードの表示と変更、管理の画面、追加の画面での選択。
- **その他:** `WEB_URL` を公開 URL に替える。共有シートのショートカットの仕組み（`/--/add?url=`）は変えない。

### 配信

- **初回:** 実装者が次を行う。
  1. `npx wrangler d1 create twimark` で D1 を作り、`database_id` を `wrangler.jsonc` に書く。D1 の ID は秘密ではない。Portal も KV の ID をコミットしている。
  2. `npm run db:migrate`（`wrangler d1 migrations apply twimark --remote`）を実行する。
  3. `npm run deploy` で公開する。中身は `self-test`、`build`、`wrangler deploy` を順に行い、どれかが失敗したら止める。
  4. 公開 URL を README・要件・要約・アプリ・拡張の既定に書く。
- **最初の登録:** 公開したら、すぐに利用者が登録する。
  - 公開から登録までの間は、誰でも最初の1人になれる。実装者は、利用者の登録のあと `wrangler d1 execute twimark --remote --command "SELECT count(*) FROM users"` で1件であることを確かめる。
  - 2件以上か、利用者が登録できなかったときは、`users` とその行をすべて消してやり直す。
- **作業フォルダ:** wrangler は作業フォルダの `.wrangler/` にアカウント名（メールアドレス）を書く（共有ナレッジ `pitfalls/wrangler-writes-account-cache-into-cwd.md`）。`.gitignore` に入れ、コミットの前に `git status` で確かめる。
- **Secrets:** 使わない。パスワードはハッシュ、セッションは乱数で、署名の鍵が要らない。

## 範囲外

- **複数の利用者:** 登録を開け続けること、パスワードの再設定のメール
- **アカウントの名前を変えること**（ID の変更）
- **名前の変更:** カテゴリ・サブカテゴリの名前の変更（今もない）
- **GitHub Actions での自動の公開:** API トークンを作って Secrets に入れたくなったら、別の定義で足す
- **Portal 側の変更:** カードの URL の変更と、Tips の削除
- **Expo の開発ビルド:** アプリ内でのネイティブのパスキー（Associated Domains が要り、Expo Go ではできない）
- **データの書き出し・取り込み**
- **コミットとプッシュ**（この定義の指示にない）

## 受け入れ条件

1. `node scripts/self-test.mjs` がすべて成功する。Worker の API の試験（方法の「テスト」に挙げたもの）を含む。
2. `node scripts/build.mjs` のあと全 JS が `node --check` を通る。`src/mobile` で `npx expo export --platform ios` と `npx expo-doctor` が通る。`npx wrangler deploy --dry-run` が通る。
3. 公開した URL で、ログインしていない状態について次を確かめる（`curl` と内蔵のブラウザ）。
   - `/api/data` が 401
   - 画面はログインか登録の画面だけを出す
   - `cache-control: no-store` が付く
4. 利用者が登録したあと、`users` が1件で、`/api/setup` が拒むことを確かめる。
5. 利用者が一覧の画面で次を確かめる。実装者は手順を短く渡す。
   - ID とパスワードでログインできる
   - パスキーを足すと、次のログインでパスキーを先に求められる
   - 「パスワードでログイン」でも入れる
   - サブカテゴリを作り、ブックマークを入れて絞り込める
6. 拡張で、端末のトークンを入れて X のポストをサブカテゴリ付きで追加できる（利用者が確かめる）。
7. iPhone の Expo Go で次ができる（利用者が確かめる）。
   - アプリ内の認証の画面でログインできる（パスキーかパスワード）
   - 一覧・サブカテゴリ・追加・共有シートのショートカットが動く
   - 認証の画面が Expo Go で動かないときは、予備のログインで同じことができる
8. リポジトリに入るファイルに、パスワード、トークン、`.wrangler/`、アカウントID、メールアドレスを含まない。
9. `check-handbook.mjs` が Twimark で問題を出さない。`github.io`、`api.github.com`、`data/bookmarks.json`、`pages.yml` への言及が、過去の定義書のほかに残らない。

## 検証コマンド

```bash
node scripts/self-test.mjs
node scripts/build.mjs
```

```bash
for f in build/site/*.js build/site/shared/*.js build/extension/*.js build/extension/shared/*.js; do node --check "$f" || exit 1; done
```

```bash
npx wrangler deploy --dry-run
```

```bash
cd src/mobile && npx expo export --platform ios --output-dir ../../build/mobile && npx expo-doctor
```

```bash
node C:/Users/SB-315/.claude/skills/project-handbook/scripts/check-handbook.mjs .
```

## 完了報告

### 実行したコマンドと結果

- **`node scripts/self-test.mjs`:** 24件すべて成功した（受け入れ条件1）。Worker の API は、D1 の代わりに `node:sqlite` の上に作った小さな置き換えで試した。確かめたのは次のとおり。
  - 登録が1回で閉じる。Cookie の属性。
  - パスワードのログインと、5回の失敗での停止。ない ID でも同じ文言を返す。
  - Cookie と Bearer の両方での認証。端末のトークンは Cookie では通らない。管理の操作は一覧の画面だけ。
  - `Origin` の検査。ログインの前の書き込みも、別のオリジンからは拒む。
  - アプリの予備のログイン（`device` 付きで端末のトークンを返す）。
  - ログアウトと、パスワードの変更でほかのセッションが消えること。
  - 全操作の検査（名前、重複、一覧にないカテゴリ・サブカテゴリ、`javascript:` の URL、`constructor` などの操作名）。
  - サブカテゴリとカテゴリの消し方。
  - パスキー: オプションの rpID、壊れた応答の拒否、チャレンジの使い回しの拒否、パスキーがある ID の認証のオプション。
  - クライアントの `store`。
- **ビルドと束ね:**（受け入れ条件2）
  - `node scripts/build.mjs` のあと、全 JS の `node --check` が成功した。
  - `src/mobile` で `npx expo export --platform ios` が成功し（617モジュール）、`npx expo-doctor` も21件すべて通った。
  - `npx wrangler deploy --dry-run` が成功した。アップロードの対象は `build/site` の8ファイル（表示は「9」だが、共有ナレッジの落とし穴のとおり1多い）。
- **手元の確認:** `wrangler dev`（ローカルの D1）を、手元だけの使い捨てのテスト用アカウントで、内蔵のブラウザから操作した。
  - 確かめたこと:
    - 登録の画面の表示から登録までできる。
    - サイドメニューにサブカテゴリが字下げして件数付きで出て、選ぶと `?category=&sub=` で絞り込める。
    - カードの `<optgroup>` の選択でサブカテゴリへ移せる。
    - ↑ キーでサブカテゴリを並べ替えられ、移したつまみにフォーカスが残る。
    - 設定でトークンを発行すると値が1度だけ出る。
    - ログアウトのあと、ID を入れると（パスキーがないので）パスワードの欄が出て、ログインできる。
    - `?app=exp://…` ではログインのあとに受け渡しの確認が出る。`?app=https://…` は無視して一覧を出す。
    - コンソールにエラーはなかった。
  - 片付け:
    - 確認のあと `wrangler dev` を Ctrl-C で止め、ポート 8787 と `workerd` が残っていないことを確かめた。
    - ローカルの D1（`.wrangler/state`）とテスト用アカウントのファイルは消した。
- **本番の準備と公開:**
  - `npx wrangler d1 create twimark` で D1 を作った（`database_id` を `wrangler.jsonc` に書いた）。
  - `wrangler d1 migrations apply twimark --remote` と `wrangler deploy` が成功した。
- **公開した URL での確認**（`https://twimark.ho-service.workers.dev`、`curl`）（受け入れ条件3）:
  - 登録の前は `/api/session` が `setup: true`、`/api/data` が 401 で `Cache-Control: no-store`。
  - 画面は 200、ないパスは 404、CSP は `connect-src 'self'`。
- **文書と残りの確認:**
  - `check-handbook.mjs` は資料3件で問題なし。
  - `github.io`・`api.github.com`・`data/bookmarks.json`・`pages.yml` への言及は、過去の定義書と作業記録の目録の題名のほかにない（受け入れ条件9）。
  - `git status` に `.wrangler/` は出ていない（受け入れ条件8）。

### 定義の外で決めたこと

- **データの形:** `GET /api/data` のカテゴリは、定義の `[{ name, subcategories }]` ではなく、`categories: string[]` と `subcategories: { [カテゴリ]: string[] }` に分けた。画面・アプリ・拡張が `data.categories` を名前の並びとして使っているので、書き換えを小さくするため。
- **拡張の URL:** 定義では設定に Twimark の URL の欄を持つとしたが、`PUBLIC_URL` に固定した。`host_permissions` はそのホストだけで、Worker は CORS のヘッダーを返さないので、別の URL を入れても届かないため。
- **PBKDF2 の反復回数:** 10万回が上限という情報があったが、手元の `workerd` では60万回も通った（10万回で約40ms、60万回で約230ms）。
  - 本番の上限と、Free プランの CPU（1リクエスト10ms）に当たるかを確かめるため、使い捨ての Worker を公開しようとした。これは「公開の面を作る」として止められたので行っていない。
  - そこで回数を `wrangler.jsonc` の `vars.PBKDF2_ITERATIONS`（既定100000、1万〜100万）で変えられるようにした。上限に当たると保存の前に止まるので、登録できなければ下げて公開し直す。使った回数は利用者ごとに残る。
- **パスキーがある ID のログインの応答:** パスキーのない ID と、ない ID は同じ形（`{ passkey: false }`）で返す。パスキーがある ID では認証のオプションを返すので、その ID があることは分かる。利用者が1人で、ログインには別にパスキーが要るので、このままにした。
- **保存日:** ブックマークの保存日は、送られた値ではなく Worker の時刻にした。
- **テストの環境:** 自己テストが `node:sqlite` を使うので、Node は24以上にした（`project-rules.md` を直した）。
- **アプリの作り:** `src/mobile/github.js` を消した。`no-store` があるので、キャッシュ対策は要らない。ログインしていないときは、タブを出さずに「設定」のログインだけを出す。
- **公開のスクリプト:** `package.json` に `deploy`（自己テスト、ビルド、`wrangler deploy`）と `db:migrate` を足した。`wrangler` と `@simplewebauthn/server` は版を固定した。
- **npm の install スクリプト:** `esbuild` と `workerd` の install スクリプトは、npm の許可待ちのまま。それでも wrangler は動いた（dry-run、dev、deploy）。

### 確かめていないこと（利用者に頼む）

受け入れ条件4〜7は利用者が行う。

1. いますぐ `https://twimark.ho-service.workers.dev` を開いて登録する（登録が開いている間は、誰でも最初の1人になれる）。登録したら知らせてもらい、実装者が `users` が1件であることを確かめる（受け入れ条件4）。
2. 次を一覧の画面で行う（受け入れ条件5）。
   - 「設定」→「パスキーを追加」
   - ログアウトして、ID →「次へ」でパスキーを求められることを確かめる
   - 「パスワードでログイン」でも入れることを確かめる
   - サブカテゴリを作り、ブックマークを入れて絞り込む
3. 拡張を読み込み直し、「設定」で発行したトークンを「オプション」に入れて、X のポストをサブカテゴリ付きで追加する（受け入れ条件6）。
4. iPhone の Expo Go で、「ブラウザでログイン」→ 一覧・サブカテゴリ・追加・共有シートを確かめる。動かなければ予備のログインで確かめる（受け入れ条件7）。
5. 登録が CPU の上限で失敗したら、`vars.PBKDF2_ITERATIONS` を下げて公開し直す。

## レビュー記録

2026-10-21、Claude Code（実装と同じセッション）。判定: 指摘2件を直して合格。直したものは公開し直した。

### 差分のレビューで見つけて直したもの

1. **重大: アプリへのログインの受け渡しで、端末のトークンを他人のアプリに渡せた。**
   - 原因: `?app=` の戻り先は `exp://` で始まれば何でも通していた。
   - 起こること: 攻撃者が `https://twimark…/?app=exp://<攻撃者の PC>:8081/--/login` を送る。ログイン中の利用者が「渡す」を押すと、Expo Go が攻撃者の PC からアプリを読み込み、URL の `#token=` をそのアプリが受け取れる。
   - 修正: 戻り先を `src/shared/store.js` の `isAppRedirect` に移し、次の3つだけを受け付けるようにした。確認の文も「誰かに送られたリンクで『渡す』を押さないでください」と強めた。
     - `exp://u.expo.dev/…`（Expo Go は、サインインしたアカウントが持つプロジェクトしか開かない）
     - `twimark://`
     - 手元の開発サーバー（`localhost` と家庭内のアドレス）
   - 残る危うさ: 同じネットワークの中の攻撃者は、手元の開発サーバーの形で同じことができる。開発の間だけの道なので受け入れた。
2. **`login_failures` が増え続けた。** 古い行は、成功のログインのときにしか消していなかった。そのため、ない ID で失敗を続けられると増え続けた。失敗を記録するたびに、15分より前の行を消すようにした。

### 攻め方を当てて、問題なしとしたもの

- **別のサイトからの書き込み:**
  - Cookie（SameSite=Strict）での書き込みは、`Origin` が違えば認証の前に拒む。
  - ログインの前の書き込み（登録・ログイン）も、別のオリジンからは拒む。
  - 別のサイトが `Authorization` を付けて送ると、CORS の事前確認で止まる（Worker は CORS を返さない）。
- **登録と ID の扱い:**
  - 登録は1つの文で「0件なら入れる」ので、同時に2人は作れない。
  - パスワードの失敗の時間と文言は、ID があってもなくても同じ。
- **トークンとセッション:**
  - 端末のトークンは Cookie では通らない。トークンの発行・取り消しとパスキーの管理は、一覧の画面のセッションだけ。
  - パスワードを変えると、ほかのセッションと端末のトークンが消える。
- **パスキー:**
  - チャレンジは使ったら消え、期限がある。
  - ログインでは、チャレンジを作った ID のパスキーだけを照らし合わせる。
- **データの検査:**
  - 操作の名前は `Object.hasOwn` で調べるので、`constructor` などは通らない。
  - URL と画像は `https:` だけ。文字数の上限がある。カテゴリとサブカテゴリは一覧にあるものだけを受け付ける。
- **画面の安全:**
  - 取得した文字列は `textContent`（アプリは `<Text>`）でだけ描く。
  - CSP は `connect-src 'self'`・`form-action 'self'` で、インラインのスクリプトはない。
- **リポジトリに入るもの:**
  - パスワード、トークン、アカウントID、メールアドレス、`.wrangler/` はない（`git add -n` と `grep`）。
  - D1 の ID は、秘密ではないので入っている。
- **CPU の上限:** 本番で登録とログインができた（利用者1人、セッション2件、2026-10-21）。PBKDF2 の10万回は、Free プランの上限で止まっていない。

### 実行したテストと結果

- `node scripts/self-test.mjs`: 27件すべて成功した。足した試験は次のとおり。
  - 受け渡しの戻り先: 受け付けるもの6つと、断るもの9つ。断るものは `u.expo.dev.evil…`、`u.expo.dev@evil…`、公開の IP、`#token` 付き、`javascript:` などを含む。
  - 失敗の行の掃除。
- `node scripts/build.mjs` のあと全 JS の `node --check`、`manifest.json` の読み込み、`check-handbook.mjs`、アプリの `expo export`: すべて成功した。
- 公開し直したあと、本番の `shared/store.js` に `isAppRedirect` があることを `curl` で確かめた。

### 残ること

- 受け入れ条件6（拡張でのサブカテゴリ付きの追加）と7（iPhone の Expo Go でのログインと共有シート）は、利用者がまだ確かめていない。
- 実装と同じセッションでのレビューなので、別の目では見ていない。

## 追補: パスキーの追加の失敗とエラーの表示（2026-10-21）

- 指示: 「アカウントは作成できましたが、パスキーの追加に失敗しました。（PCブラウザからログイン、iPhoneでパスキー紐づけ）見直してみてください。また、各エラーにはエラーメッセージとエラーコードを表示するように。」
- 調べたこと:
  - 本番の D1 は `users` 1件、`passkeys` 0件、登録のチャレンジが1件残っていた。チャレンジは確かめの要求で必ず消えるので、パスキーの作成（ブラウザと iPhone の間）で失敗し、確かめの要求は送られていない。
  - ブラウザは、サーバーが作ったオプションを `parseCreationOptionsFromJSON` で受け付けた（内蔵のブラウザで確認）。
  - 待ち時間が60秒と短く、PC から iPhone のパスキーを使う流れ（QR コード、Bluetooth、Face ID）では足りないことがある。時間切れは `NotAllowedError` になるが、画面は「取りやめました」とだけ出していた。
- 直したこと:
  - 待ち時間を5分にし、チャレンジの期限を10分にした。
  - 出す方式を ES256・RS256 だけにした。ライブラリの既定は ML-DSA と Ed25519 を先に並べる。
  - `userDisplayName` に ID を入れた（空だった）。
  - パスキーの名前は作成の前に聞くようにした。失敗したら「準備／パスキーの作成／パスキーの確認と保存」のどこで失敗したかを出す。
  - サーバーの検証の失敗は、ライブラリの理由を文に添える。
  - `src/shared/store.js` に `describeError` を足し、一覧の画面・拡張・アプリのすべてのエラーの表示を「メッセージ（エラーコード: code）」にした。code は Twimark のエラーの code か、ブラウザの例外の name。パスキーのブラウザの例外には日本語の説明とブラウザの詳細を付ける。
- 確かめたこと:
  - 自己テスト25件がすべて成功した（`describeError` のテストを足した）。
  - ビルドと全 JS の構文チェック、アプリの `expo export` が通った。
  - 公開し直し、本番が新しい `settings.js` と `store.js` を返すこと、API のエラーが code 付きで返ることを `curl` で確かめた。
- 利用者の確認: 2026-10-21、PC のブラウザから iPhone のパスキーを追加でき、成功した（利用者の報告）。
