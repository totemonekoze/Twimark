// ログインしたあとの設定。パスキーの追加・削除、パスワードの変更、拡張・アプリのトークンの発行・取り消し、ログアウト
import { describeError } from './shared/store.js';
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

export function setupSettings(api, login) {
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
  }

  $('[data-settings-login]').textContent = login;
  $('[data-open-settings]').hidden = false;
  $('[data-open-settings]').addEventListener('click', () => {
    tokenValue.hidden = true;
    tokenValue.textContent = '';
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
