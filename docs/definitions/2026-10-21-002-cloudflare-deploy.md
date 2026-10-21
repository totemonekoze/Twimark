# Twimark：一覧の画面を Cloudflare Workers で公開し、GitHub Pages をやめる

- 定義日: 2026-10-21
- 状態: superseded（2026-10-21-003-accounts-d1-subcategories.md に置き換え。データを D1 に移し、公開は手元の wrangler から行うことになったため）
- 定義: Claude Code（2026-10-21、「Webアプリケーション側は実装出来たらcloudflareで公開します」、「Cloudflareで公開する定義書を書いてください」、その後の回答「GitHub Actions」「やめる」「workers.dev」「置かない」）

## 目的

一覧の画面（`build/site`）を Cloudflare Workers の静的アセットで公開する。URL は workers.dev。main への push で GitHub Actions が公開する。

- GitHub Pages の配信（`pages.yml`）はやめる。Pages はリポジトリで有効になっておらず、配信は一度も成功していない（2026-10-21 の Actions の記録）。
- Cloudflare Access は置かない。データは公開リポジトリにあって誰でも読めるので、画面だけ守っても意味が薄い。編集はこれまでどおり GitHub のトークンで守る。
- iPhone アプリの「設定」にある Web の一覧へのリンクも、新しい URL に変える。

## 対象ファイル

| ファイル | 変更 |
|---|---|
| `wrangler.jsonc`（新規） | Worker 名 `twimark`、静的アセットだけ（`main` なし）、`assets.directory` は `./build/site`、`workers_dev: true`、`preview_urls: false` |
| `.github/workflows/pages.yml` → `.github/workflows/deploy.yml` | テスト、ビルド、`wrangler deploy` |
| `.gitignore` | `.wrangler/` と `wrangler-account.json` を足す |
| `src/mobile/screens/SettingsScreen.js` | `WEB_URL` を新しい URL に |
| `AGENTS.md`、`README.md`、`docs/requirements/current-mvp.md`、`docs/requirements/project-rules.md` | 配信先、初回の準備、URL を直す |
| `docs/handbook/spec.md`、`operations.md`、`configuration.md` | 同じ内容を要約に反映し、`updated` を進め、`sources` の `pages.yml` を `deploy.yml` と `wrangler.jsonc` に替える |

## 方法

### `wrangler.jsonc`

- `name: "twimark"`。`compatibility_date` は実装する日にする。
- `assets: { directory: "./build/site" }`。Worker のスクリプトは持たない。
  - 画面は `index.html` 1枚で、絞り込みはクエリに持つ。SPA の振り分けは要らないので、`not_found_handling` は付けない（ないパスは 404）。
- `workers_dev: true`、`preview_urls: false`。
- `account_id` は書かない。アカウントIDを公開リポジトリに入れないため。Actions では Secrets の `CLOUDFLARE_ACCOUNT_ID` で渡す。
- 公開される URL は `https://twimark.<アカウントの workers.dev のサブドメイン>.workers.dev`。
  - Portal と同じアカウントなら `https://twimark.ho-service.workers.dev`。
  - 最初の公開で `wrangler deploy` が出す URL を正とし、`WEB_URL` と文書をそれに合わせる。

### `deploy.yml`

- **いつ動くか:** main への push で動く。手動の実行（`workflow_dispatch`）もできる。
  - `paths-ignore: ['data/**', 'src/mobile/**']`。データとアプリだけの変更では配信しない。
  - `concurrency` で、同時に動くのは1つにする。
- **手順:** `actions/checkout`、`actions/setup-node`（Node 24）、`node scripts/self-test.mjs`、`node scripts/build.mjs` のあと、`cloudflare/wrangler-action@v3` で `deploy` する。
  - wrangler の版は `wranglerVersion` で固定する（実装時の 4 系の最新。2026-10-21 は 4.151.3）。
  - ルートの `package.json` には依存を足さない（一覧の画面と拡張は依存パッケージを持たない決まり）。
- **Secrets:** `CLOUDFLARE_API_TOKEN` と `CLOUDFLARE_ACCOUNT_ID` で渡す。
  - どちらかがなければ、`mobile.yml` と同じく `::notice::` を出して配信をとばし、成功で終える。
- **権限:** `permissions` は `contents: read` だけにする。Pages の `pages: write`・`id-token: write` は外す。
- **作られるファイル:** Actions の作業フォルダに `.wrangler/` ができても、コミットはされない（Actions は push しない）。手元で `wrangler` を実行したときのために `.gitignore` に入れる。

### 初回の準備（利用者が一度だけ。README に書く）

1. Cloudflare のダッシュボード → My Profile → API Tokens で、テンプレート「Edit Cloudflare Workers」からトークンを作る。対象のアカウントは1つに絞る。
2. Workers & Pages の画面でアカウントIDを確かめる。
3. GitHub のリポジトリの Settings → Secrets and variables → Actions に、`CLOUDFLARE_API_TOKEN` と `CLOUDFLARE_ACCOUNT_ID` を入れる。
4. main に push するか、Actions の「Deploy」を手動で実行する。

### 画面

- 画面のコードは変えない。CSP（`connect-src https://api.github.com` など）は `index.html` の `<meta>` のまま効く。
- `build/site` に入るのは `src/site` と `src/shared` の写しだけ。秘密は入らない。

## 範囲外

- Cloudflare Access、独自ドメイン
- Portal の変更。`src/data/projects.json` の Twimark の URL（`github.io`）を新しい URL に変えること、Tips の削除は、Portal 側の定義で行う
- 拡張の変更。拡張は Web の一覧の URL を持っていない
- GitHub Pages の設定の掃除（Pages は有効になっていないので要らない）
- コミットとプッシュ（この定義の指示にない）

## 受け入れ条件

1. `node scripts/self-test.mjs` がすべて成功し、`node scripts/build.mjs` のあと全 JS が `node --check` を通る。
2. `npx wrangler@<固定した版> deploy --dry-run` が成功し、アップロードの対象が `build/site` のファイルだけである。
3. `deploy.yml`:
   - YAML として読める。
   - Secrets がなければ配信をとばして成功で終わる（`if` の条件を読んで確かめる）。
   - `paths-ignore` に `data/**` と `src/mobile/**` がある。
4. Secrets を入れたあとの main への push、または手動の実行で、`deploy.yml` が成功する。そのあと公開 URL について次を確かめる。
   - トークンなしで一覧が出る
   - `index.html` に CSP の `<meta>` がある
   - ないパスが 404 になる
5. iPhone アプリの `WEB_URL`、README、要件、要約の URL が公開 URL と一致する。`github.io` と `pages.yml` への言及が、過去の定義書のほかに残らない。
6. リポジトリに入るファイルに、Cloudflare の API トークン、アカウントID、`wrangler-account.json` を含まない。
7. `check-handbook.mjs` が Twimark で問題を出さない。

4 は利用者が Secrets を入れてから確かめる。実装者は、Secrets が入ったかを利用者に尋ねてから、手動の実行を頼むか結果を確かめる。

## 検証コマンド

```bash
node scripts/self-test.mjs
node scripts/build.mjs
```

```bash
for f in build/site/*.js build/site/shared/*.js build/extension/*.js build/extension/shared/*.js; do node --check "$f" || exit 1; done
```

```bash
npx --yes wrangler@4.151.3 deploy --dry-run
```

```bash
npx --yes js-yaml .github/workflows/deploy.yml
```

```bash
node C:/Users/SB-315/.claude/skills/project-handbook/scripts/check-handbook.mjs .
```

## 完了報告

（実装後に書く）

## レビュー記録

（レビュー後に書く）
