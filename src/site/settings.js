// ログインしたあとの設定。パスキーの追加・削除、パスワードの変更、拡張・アプリのトークンの発行・取り消し、
// 招待リンクの作成・取り消し（管理者だけ）、自分のログインの履歴（30日）、ログアウト
import { describeError } from './shared/store.js';
import { deviceLabel } from './shared/view.js';
import { passkeysSupported } from './auth.js';

const $ = (s, root = document) => root.querySelector(s);
const day = (iso) => (iso ? new Date(iso).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', dateStyle: 'short', timeStyle: 'short' }) : 'まだ使っていない');

// 名前と日付と「削除」ボタンの行
function row(label, detail, onRemove) {
  const li = document.createElement('li');
  li.append(Object.assign(document.createElement('span'), { textContent: label }));
  li.append(Object.assign(document.createElement('span'), { className: 'muted', textContent: detail }));
  const del = Object.assign(document.createElement('button'), { type: 'button', className: 'd-btn danger-text', textContent: '削除' });
  del.addEventListener('click', onRemove);
  li.append(del);
  return li;
}

const METHOD = { password: 'パスワード', passkey: 'パスキー' };
const CLIENT = { web: 'Web', app: 'アプリ' };

// ログインの履歴の1行。取得した文字列は textContent でだけ描く
function historyRow(e) {
  const tr = document.createElement('tr');
  if (e.result === 'failure') tr.className = 'failed';
  const cell = (text, title) => {
    const td = Object.assign(document.createElement('td'), { textContent: text });
    if (title) td.title = title;
    tr.append(td);
  };
  cell(day(e.at));
  cell(e.result === 'success' ? '成功' : `失敗（${e.reason ?? 'unknown'}）`);
  cell(METHOD[e.method] ?? e.method);
  cell(CLIENT[e.client] ?? e.client);
  cell(e.ip || '不明');
  cell(e.country || '不明');
  cell(deviceLabel(e.userAgent), e.userAgent);
  return tr;
}

export function setupSettings(api, session) {
  const { login } = session;
  const isOwner = session.role === 'owner';
  const dialog = $('dialog.settings');
  const passkeyList = $('[data-passkey-list]');
  const passkeyError = $('[data-passkey-error]');
  const tokenList = $('[data-token-list]');
  const tokenError = $('[data-token-error]');
  const tokenValue = $('[data-token-value]');
  const fail = (el) => (err) => { el.textContent = describeError(err, 'できませんでした。'); };

  async function refresh() {
    passkeyError.textContent = '';
    tokenError.textContent = '';
    const [{ passkeys }, { tokens }] = await Promise.all([api.call('/api/passkeys'), api.call('/api/tokens')]);
    passkeyList.replaceChildren(...passkeys.map((p) => row(p.name, `追加 ${day(p.createdAt)}・最後 ${day(p.lastUsedAt)}`, () => {
      if (!confirm(`パスキー「${p.name}」を削除しますか？`)) return;
      api.call(`/api/passkeys/${encodeURIComponent(p.id)}`, { method: 'DELETE' }).then(refresh, fail(passkeyError));
    })));
    tokenList.replaceChildren(...tokens.map((t) => row(t.name, `発行 ${day(t.createdAt)}・最後 ${day(t.lastUsedAt)}`, () => {
      if (!confirm(`トークン「${t.name}」を取り消しますか？ その拡張やアプリはログインし直しになります。`)) return;
      api.call(`/api/tokens/${encodeURIComponent(t.id)}`, { method: 'DELETE' }).then(refresh, fail(tokenError));
    })));
    await Promise.all([refreshHistory(), isOwner ? refreshInvites() : null]);
  }

  const historyError = $('[data-history-error]');
  async function refreshHistory() {
    historyError.textContent = '';
    try {
      const { events } = await api.call('/api/login-events');
      $('[data-history]').replaceChildren(...events.map(historyRow));
      $('[data-history-empty]').hidden = events.length > 0;
    } catch (err) {
      historyError.textContent = describeError(err, '履歴を読み込めませんでした。');
    }
  }

  // 招待（管理者だけ）
  const inviteError = $('[data-invite-error]');
  async function refreshInvites() {
    inviteError.textContent = '';
    try {
      const { open, used } = await api.call('/api/invites');
      $('[data-invite-open]').replaceChildren(...open.map((i) => row(`作成 ${day(i.createdAt)}`, `期限 ${day(i.expiresAt)}`, () => {
        if (!confirm('この招待リンクを取り消しますか？ 取り消すと、そのリンクでは登録できなくなります。')) return;
        api.call(`/api/invites/${encodeURIComponent(i.id)}`, { method: 'DELETE' }).then(refreshInvites, fail(inviteError));
      })));
      $('[data-invite-used]').replaceChildren(...used.map((u) => {
        const li = document.createElement('li');
        li.append(Object.assign(document.createElement('span'), { textContent: u.login }));
        li.append(Object.assign(document.createElement('span'), { className: 'muted', textContent: `登録 ${day(u.usedAt)}` }));
        return li;
      }));
    } catch (err) {
      inviteError.textContent = describeError(err, '招待を読み込めませんでした。');
    }
  }
  $('[data-invite-part]').hidden = !isOwner;
  if (isOwner) {
    const urlField = $('[data-invite-url]');
    $('[data-create-invite]').addEventListener('click', async () => {
      inviteError.textContent = '';
      try {
        const { url, expiresAt } = await api.call('/api/invites', { method: 'POST', body: {} });
        urlField.value = url;
        $('[data-invite-link]').hidden = false;
        await refreshInvites();
        // 一覧を読み直すと文が消えるので、そのあとに出す
        inviteError.textContent = `招待リンクを作りました（期限 ${day(expiresAt)}）。このリンクは今だけ表示されます。`;
        urlField.select();
      } catch (err) {
        inviteError.textContent = describeError(err, '招待リンクを作れませんでした。');
      }
    });
    $('[data-copy-invite]').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(urlField.value);
        $('[data-copy-invite]').textContent = 'コピーしました';
      } catch (err) {
        urlField.select();
        inviteError.textContent = describeError(err, 'コピーできませんでした。リンクを選んでコピーしてください。');
      }
    });
  }

  $('[data-settings-login]').textContent = login;
  $('[data-open-settings]').hidden = false;
  $('[data-open-settings]').addEventListener('click', () => {
    tokenValue.hidden = true;
    tokenValue.textContent = '';
    // 招待リンクは作ったときだけ出す（閉じて開き直したら消す）
    $('[data-invite-link]').hidden = true;
    $('[data-invite-url]').value = '';
    $('[data-copy-invite]').textContent = 'コピー';
    dialog.showModal();
    refresh().catch(fail(passkeyError));
  });
  $('[data-settings-close]').addEventListener('click', () => dialog.close());

  const supported = passkeysSupported();
  $('[data-passkey-unsupported]').hidden = supported;
  $('[data-add-passkey]').hidden = !supported;
  $('[data-add-passkey]').addEventListener('click', async () => {
    passkeyError.textContent = '';
    // 名前は先に聞く。パスキーを作ったら、すぐに送って確かめてもらう
    const asked = prompt('このパスキーの名前（例: iPhone、仕事のPC）', 'パスキー');
    if (asked === null) return;
    const name = asked.trim() || 'パスキー';
    // どこで失敗したかを、エラーの文の前に出す
    let step = '準備';
    try {
      const { challengeId, options } = await api.call('/api/passkeys/options', { method: 'POST', body: {} });
      step = 'パスキーの作成';
      const credential = await navigator.credentials.create({ publicKey: PublicKeyCredential.parseCreationOptionsFromJSON(options) });
      step = 'パスキーの確認と保存';
      await api.call('/api/passkeys', { method: 'POST', body: { challengeId, response: credential.toJSON(), name } });
      await refresh();
      passkeyError.textContent = `パスキー「${name}」を追加しました。`;
    } catch (err) {
      console.error('passkey add failed at', step, err);
      passkeyError.textContent = `${step}で失敗しました。${describeError(err, 'パスキーを追加できませんでした。')}`;
    }
  });

  const passwordForm = $('[data-password-form]');
  passwordForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const error = $('[data-password-error]');
    error.textContent = '';
    const v = (n) => passwordForm.elements.namedItem(n).value;
    try {
      await api.call('/api/password', { method: 'POST', body: { current: v('current'), next: v('next') } });
      passwordForm.reset();
      error.textContent = 'パスワードを変えました。';
      await refresh();
    } catch (err) {
      error.textContent = describeError(err, '変えられませんでした。');
    }
  });

  const tokenForm = $('[data-token-form]');
  tokenForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    tokenError.textContent = '';
    try {
      const { token } = await api.call('/api/tokens', { method: 'POST', body: { device: tokenForm.elements.namedItem('name').value } });
      tokenForm.reset();
      tokenValue.textContent = token;
      tokenValue.hidden = false;
      await refresh();
    } catch (err) {
      tokenError.textContent = describeError(err, '発行できませんでした。');
    }
  });

  $('[data-logout]').addEventListener('click', async () => {
    try { await api.call('/api/logout', { method: 'POST', body: {} }); } catch { /* 失敗しても画面は読み込み直す */ }
    location.reload();
  });
}
