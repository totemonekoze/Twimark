# Twimark：招待リンクからの登録と、ログインの履歴（30日）

- 定義日: 2026-10-21
- 状態: reviewed
- 定義: Claude Code（2026-10-21）
  - 指示: 「私が招待リンクを生成したら、招待リンクからアカウント作成した人のみ、このアプリケーションを利用できるようにしていただけませんか？ また、ログイン履歴を追跡できるようにしてください。（30日間）」
  - その後の回答: 「人ごとに別」「1回きり、3日」「それぞれ自分の分だけ、設定の画面から。」「成功と失敗、IPと端末」

## 目的

- **利用者を増やせるようにする:** 管理者（最初に登録した利用者）が作った招待リンクから登録した人だけが、Twimark を使える。招待リンクのない登録はできない（今と同じく閉じたまま）。
- **ブックマークは人ごとに別:** 招待された人は、自分だけのブックマーク・カテゴリ・サブカテゴリ・パスキー・端末のトークンを持つ。ほかの人のものは見えない。D1 の行はもともと `user_id` で分けてあるので、データの読み書きの作りはそのまま使う。
- **ログインの履歴を残す:** 30日を過ぎたものは消す。利用者はそれぞれ、自分の履歴だけを「設定」の画面で見られる。

## 前提

- `2026-10-21-003-accounts-d1-subcategories.md` の変更は実装済みで、レビューとコミットがまだ。この定義の実装は、003 をレビューしてコミットしてから始める。混ぜない。
- 本番の D1 には利用者が1人（管理者になる）、パスキーが1件ある（2026-10-21 に確認）。

## 対象ファイル

| ファイル | 変更 |
|---|---|
| `migrations/0002_invites_and_login_events.sql`（新規） | `users.role`、`invites`、`login_events` |
| `src/worker/auth.js` | 招待の作成・一覧・取り消し・使用、招待からの登録、ログインの履歴の書き込みと読み出し |
| `src/worker/index.js` | 新しい API、`/api/session` に `role` を足す |
| `src/site/index.html`、`auth.js`、`settings.js`、`style.css` | 招待からの登録の画面、設定の「招待」（管理者だけ）と「ログインの履歴」 |
| `src/mobile/screens/SettingsScreen.js` | 「ログインの履歴」を Web の設定で見るよう案内するリンク |
| `scripts/self-test.mjs` | 招待と履歴の試験 |
| `README.md`、`docs/requirements/`、`docs/handbook/` | 利用者が増えること、招待、履歴 |

## 方法

### データ（`0002`）

- **`users`:** `role TEXT NOT NULL DEFAULT 'member'` を足す。今いる利用者（`id` が最小の1人）を `owner` にする。`/api/setup`（`users` が0件のときだけ）で作る利用者も `owner` にする。
- **`invites`:**
  - 列は `id`、`token_hash`（SHA-256、一意）、`created_by`、`created_at`、`expires_at`（作ってから3日）、`used_at`、`used_by`、`revoked_at`。
  - リンクに入れる値（32バイトの乱数の base64url）は、作ったときに一度だけ返す。
- **`login_events`:**
  - 列は `id`、`user_id`、`at`、`result`（`success` か `failure`）、`method`（`password` か `passkey`）、`client`（`web` か `app`）、`reason`（失敗の code）、`ip`、`country`、`user_agent`（300文字まで）。
  - 索引は `(user_id, at)`。

### 招待（管理者だけ）

- **API**（管理者の web のセッションだけ。ほかは `forbidden`）:
  - `POST /api/invites`: `{ url, expiresAt }` を返す。`url` は `<オリジン>/?invite=<値>`。
  - `GET /api/invites`: 使われていない・期限内・取り消していないものの一覧（作成日時と期限。値は返さない）と、使われたものの一覧（使った人の ID と日時）。
  - `DELETE /api/invites/:id`: 使われる前のものを取り消す。
- **登録:**
  - `GET /api/invite?token=<値>` は、使えるかどうかだけを返す（`{ valid }`）。
  - `POST /api/register { invite, login, password }` で登録する。
  - 招待は1回きり。先に `UPDATE invites SET used_at = ? WHERE token_hash = ? AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ?` で押さえ、変わった行が1でなければ `invite_invalid` で断る。押さえたあと利用者を作る。ID が重複したら `login_taken` で断り、押さえを戻す（`used_at` を NULL に）。
  - 作れたら `used_by` を入れ、既定のカテゴリを作り、web のセッションを返す（`/api/setup` と同じ）。
  - ID とパスワードの決まりは `/api/setup` と同じ。
- **画面:**
  - `?invite=<値>` で開くと、登録の画面（ID、パスワード、確認）を出す。使えない招待なら「この招待リンクは使えません（期限切れ・使用済み・取り消し）」と出し、登録の画面は出さない。
  - 登録できたらクエリから `invite` を消して一覧を出す。
- **設定の「招待」**（管理者だけ）:
  - 「招待リンクを作る」でリンクを出し、コピーのボタンを付ける。リンクは一度だけ出る。
  - 使われていない招待の一覧と取り消し、使われた招待の一覧を出す。
- **`/api/session`:** `role` を返す。画面は `owner` のときだけ「招待」を出す。

### ログインの履歴

- **残すもの:** パスワードとパスキーのログインの成功と失敗。
  - 失敗の記録の先: パスワードの失敗、パスキーの確かめの失敗、ロック中の試みは、その ID の利用者の履歴に入れる。
  - 存在しない ID への試みは、誰の履歴にも入れない。今の `login_failures` には数える。
  - `client`: `/api/login/*` に `device` が付いていれば `app`、なければ `web`。アプリへの受け渡し（`?app=`）は web のログインのあとなので `web`。
- **取り出すもの:**
  - IP: `CF-Connecting-IP`。
  - 国: `request.cf.country`（なければ空）。
  - 端末: `User-Agent`。画面では、ブラウザと OS の名前に短くして出す（例: 「Chrome / Windows」「Safari / iPhone」「Expo Go」）。元の文字列は詳細として出す。
- **期限:** 30日を過ぎた行は、履歴を書くたびに同じ利用者の分を消す（`DELETE ... WHERE user_id = ? AND at < ?`）。読み出しでも30日より前は返さない。
- **API:** `GET /api/login-events` は、自分の履歴（新しい順、30日分、最大500件）を返す。web のセッションだけ。
- **画面:** 設定の「ログインの履歴」に表を出す。列は日時、結果、方法、Web かアプリか、IP、国、端末。失敗は色を変え、理由の code を出す。
- **アプリ:** 「設定」に「ログインの履歴は Web の一覧の『設定』で見られます」と書き、Web の一覧を開くリンクを付ける。

### テスト

`self-test.mjs` に、次を確かめる試験を足す。

- 管理者だけが招待を作れる（member と端末のトークンは `forbidden`）
- 招待からの登録が1回で使えなくなる
- 3日を過ぎた招待と取り消した招待は `invite_invalid`
- ID が重複したら招待が戻る
- 招待された人のデータが管理者のものと分かれている
- 成功と失敗が自分の履歴にだけ入る
- 存在しない ID の失敗は誰にも入らない
- 30日より前の行が消える
- `client` と IP が記録される

## 範囲外

- 利用者の削除・停止、役割の変更、管理者が他人の履歴を見ること
- 招待のメール送信（リンクは管理者が自分で渡す）
- 新しい場所からのログインの通知
- ログインの履歴に、端末のトークンの使用（アプリと拡張の読み書き）を入れること
- コミットとプッシュ（この定義の指示にない）

## 受け入れ条件

1. `node scripts/self-test.mjs` がすべて成功する（「テスト」に挙げたものを含む）。
2. `node scripts/build.mjs` のあと全 JS が `node --check` を通る。`src/mobile` の `npx expo export --platform ios` と `npx wrangler deploy --dry-run` が通る。
3. 本番の D1 に `0002` を当てたあと、今の利用者が `owner` で、そのブックマークとパスキーが残っている（`wrangler d1 execute` で確かめる）。
4. 公開したあと、利用者が次を確かめる。
   - 管理者で招待リンクを作り、別のブラウザ（シークレットウィンドウなど）で開いて登録できる。
   - 同じリンクはもう使えない。
   - 招待された人には管理者のブックマークが見えず、「招待」も出ない。
   - それぞれの「ログインの履歴」に、自分の成功・失敗・IP・端末だけが出る。
5. `check-handbook.mjs` が問題を出さない。リポジトリに入るファイルに、招待の値・パスワード・トークン・`.wrangler/` を含まない。

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
cd src/mobile && npx expo export --platform ios --output-dir ../../build/mobile
```

```bash
node C:/Users/SB-315/.claude/skills/project-handbook/scripts/check-handbook.mjs .
```

## 完了報告

- 実装: Claude Code（2026-10-22）。コミット、プッシュ、`npm run deploy`、本番の D1 への `0002` の適用はしていない。受け入れ条件 3・4 は、適用と公開のあとに確かめる。
- 検証（2026-10-22）:
  - `src/mobile` から `node ../../scripts/self-test.mjs`: 34件すべて成功（「テスト」の項目を含む）
  - `node scripts/build.mjs` のあと、build/site・build/extension の全 JS が `node --check` を通った
  - `npx expo export --platform ios`: 成功。`npx wrangler deploy --dry-run`: 成功
  - `check-handbook.mjs`: 問題なし
- 定義の外の判断:
  - 招待の API を断るときの code は `forbidden` でなく、端末のトークンには `web_only`、member には `owner_only`（どちらも 403）にした。
  - 使われた招待の一覧は、使った人の内部の id でなくログインの ID（`login`）を返す。
  - パスキーが登録されていないときの失敗の理由は `passkey_unknown`、確かめの失敗は `passkey_failed`。
  - `invite_invalid` は 410、`login_taken` は 409。
  - 招待の作成・一覧・取り消し・使用は `src/worker/members.js`、履歴は `src/worker/history.js` に分けた（定義では `auth.js`）。
  - ログイン中に招待リンクを開いたときは、招待を使わずに `invite` を消して一覧を出す。
  - アプリの端末の表示名は「Expo Go / iPhone」。

## レビュー記録

- レビュー: Claude Code（2026-10-22）。実装と同じセッションで行った（利用者の指示）。
- 差分のレビュー（直すべき不具合はなし）:
  - 招待の API は `ownerOnly`（web のセッションかつ `owner`）で守られ、端末のトークンと member は 403。`/api/login-events` は web のセッションで自分の `user_id` だけを読む。
  - 書き込みは Cookie なら同じオリジンだけ、ログイン前でも別のオリジンの `Origin` は断る（`/api/register` も含む）。
  - 招待は1つの UPDATE で押さえるので、同時に2回は使えない。ID の重複では押さえを戻す。D1 には値の SHA-256 だけを置く。
  - データの読み書きは `user_id` で分かれ、招待された人から管理者の行は読めず消せない。
  - 履歴と招待の一覧は `textContent` でだけ描く（UA などを HTML として出さない）。
  - `0002` は `node:sqlite` でも当たり、`ALTER TABLE ... ADD COLUMN` の `CHECK` と既定値は SQLite で使える。
- 気づいた点（今回は直さない）:
  - ロック中の試みも1回ごとに履歴の行になるので、ID を知る人は、その人の履歴を30日のあいだ増やせる（読み出しは500件まで）。IP ごとの回数の制限は今もない。
  - 「この招待リンクは使えません」の画面からログインの画面へ移る導線がない（URL から `?invite=` を消せば出る）。
  - 招待を押さえたあと利用者を作るまでの間に Worker が止まると、その招待は使用済みのまま `used_by` が空になり、どちらの一覧にも出ない。
- 試験: 実装の検証と同じ（self-test 34件、ビルドと `node --check`、expo export、wrangler の dry-run、check-handbook）は実装のあとに通った。レビューのあと self-test をもう一度通した（そのあとコードは変えていない）。
