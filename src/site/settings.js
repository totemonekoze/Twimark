// 設定のタブ。パスキーの追加・削除、パスワードの変更、拡張・アプリのトークンの発行・取り消し、
// 招待リンクの作成・取り消し（管理者だけ）、自分のログインの履歴（30日、?page=history）、ログアウト。
// アプリの「パスキーを追加」から ?passkey=add&app=<戻り先> で開いたときは、パスキーを作ってアプリへ戻る
import { describeError, isAppRedirect, StoreError } from './shared/store.js';
import { deviceLabel } from './shared/view.js';
import { passkeysSupported } from './auth.js';
import { icon } from './icons.js';
import { openColorSheet } from './colors.js';
import { DEFAULT_ACCENT } from './shared/theme.js';
import { $, actionSheet, ask, closeSheet, el, openSheet, sheet, tell } from './ui.js';

const day = (iso) => (iso ? new Date(iso).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', dateStyle: 'short', timeStyle: 'short' }) : 'まだ使っていない');
const METHOD = { password: 'パスワード', passkey: 'パスキー' };
const CLIENT = { web: 'Web', app: 'アプリ' };

// 名前と説明と、右の操作（削除・取り消し）の行
function row(label, detail, actionLabel, onAction) {
  const li = el('li', { className: 'row' }, el('span', { className: 'row-stack' }, el('span', { className: 'row-text', textContent: label }), el('span', { className: 'footnote', textContent: detail })));
  if (onAction) {
    const b = el('button', { type: 'button', className: 'text-btn danger small', textContent: actionLabel });
    b.addEventListener('click', onAction);
    li.append(b);
  }
  return li;
}

// ログインの履歴の1行。押すと IP・国・端末の元の文字列を出す。取得した文字列は textContent でだけ描く
function historyRow(e) {
  const failed = e.result === 'failure';
  const summary = el('summary', { className: 'row' },
    el('span', { className: 'row-stack' },
      el('span', { className: `row-text${failed ? ' danger' : ''}`, textContent: `${failed ? `失敗（${e.reason ?? 'unknown'}）` : '成功'} · ${METHOD[e.method] ?? e.method}` }),
      el('span', { className: 'footnote', textContent: `${day(e.at)} · ${CLIENT[e.client] ?? e.client} · ${deviceLabel(e.userAgent)}` })),
    icon('chevron'));
  const detail = el('dl', { className: 'detail' },
    el('dt', { textContent: 'IP' }), el('dd', { textContent: e.ip || '不明' }),
    el('dt', { textContent: '国' }), el('dd', { textContent: e.country || '不明' }),
    el('dt', { textContent: '端末' }), el('dd', { textContent: e.userAgent || '不明' }));
  return el('li', {}, el('details', {}, summary, detail));
}

export function setupSettings(api, session, { goPage, accent, saveAccent }) {
  const isOwner = session.role === 'owner';
  const passkeyError = $('[data-passkey-error]');
  const tokenError = $('[data-token-error]');
  const inviteError = $('[data-invite-error]');
  const fail = (target) => (err) => { target.textContent = describeError(err, 'できませんでした。'); };

  async function refreshMain() {
    passkeyError.textContent = '';
    tokenError.textContent = '';
    try {
      const [{ passkeys }, { tokens }] = await Promise.all([api.call('/api/passkeys'), api.call('/api/tokens')]);
      $('[data-passkey-list]').replaceChildren(...passkeys.map((p) => row(p.name, `追加 ${day(p.createdAt)} · 最後 ${day(p.lastUsedAt)}`, '削除', () => actionSheet({
        title: `パスキー「${p.name}」を削除しますか？`,
        actions: [{ label: '削除', destructive: true, run: () => api.call(`/api/passkeys/${encodeURIComponent(p.id)}`, { method: 'DELETE' }).then(refreshMain, fail(passkeyError)) }],
      }))));
      $('[data-token-list]').replaceChildren(...tokens.map((t) => row(t.name, `${t.app ? 'アプリ' : '拡張'} · 発行 ${day(t.createdAt)} · 最後 ${day(t.lastUsedAt)}`, '取り消し', () => actionSheet({
        title: `トークン「${t.name}」を取り消しますか？`,
        message: 'その拡張やアプリは、ログインし直しになります。',
        actions: [{ label: '取り消す', destructive: true, run: () => api.call(`/api/tokens/${encodeURIComponent(t.id)}`, { method: 'DELETE' }).then(refreshMain, fail(tokenError)) }],
      }))));
    } catch (err) {
      fail(passkeyError)(err);
    }
    if (isOwner) await refreshInvites();
  }

  async function refreshHistory() {
    const error = $('[data-history-error]');
    error.textContent = '';
    try {
      const { events } = await api.call('/api/login-events');
      $('[data-history]').replaceChildren(...events.map(historyRow));
      $('[data-history]').hidden = events.length === 0;
      $('[data-history-empty]').hidden = events.length > 0;
    } catch (err) {
      error.textContent = describeError(err, '履歴を読み込めませんでした。');
    }
  }

  // 招待（管理者だけ）
  async function refreshInvites() {
    try {
      const { open, used } = await api.call('/api/invites');
      $('[data-invite-open]').replaceChildren(...open.map((i) => row(`作成 ${day(i.createdAt)}`, `使われていない · 期限 ${day(i.expiresAt)}`, '取り消し', () => actionSheet({
        title: 'この招待リンクを取り消しますか？',
        message: '取り消すと、そのリンクでは登録できなくなります。',
        actions: [{ label: '取り消す', destructive: true, run: () => api.call(`/api/invites/${encodeURIComponent(i.id)}`, { method: 'DELETE' }).then(refreshInvites, fail(inviteError)) }],
      }))));
      $('[data-invite-used]').replaceChildren(...used.map((u) => row(u.login, `招待から登録 ${day(u.usedAt)}`)));
    } catch (err) {
      fail(inviteError)(err);
    }
  }
  $('[data-invite-part]').hidden = !isOwner;
  if (isOwner) {
    $('[data-create-invite]').addEventListener('click', async () => {
      inviteError.textContent = '';
      try {
        const { url } = await api.call('/api/invites', { method: 'POST', body: {} });
        $('[data-invite-url]').textContent = url;
        $('[data-invite-box]').hidden = false;
        $('[data-copy-invite]').lastChild.textContent = 'コピー';
        await refreshInvites();
      } catch (err) {
        fail(inviteError)(err);
      }
    });
  }
  const copy = (button, value, error) => navigator.clipboard.writeText(value).then(
    () => { button.lastChild.textContent = 'コピーしました'; },
    (err) => { error.textContent = describeError(err, 'コピーできませんでした。値を選んでコピーしてください。'); },
  );
  $('[data-copy-invite]').addEventListener('click', (e) => copy(e.currentTarget, $('[data-invite-url]').textContent, inviteError));
  $('[data-copy-token]').addEventListener('click', (e) => copy(e.currentTarget, $('[data-token-value]').textContent, tokenError));

  $('[data-settings-login]').textContent = session.login;

  // パスキーの追加。名前は先に聞き、作ったらすぐに送って確かめてもらう。どこで失敗したかを、エラーの文の前に出す
  async function addPasskey(name) {
    let step = '準備';
    try {
      const { challengeId, options } = await api.call('/api/passkeys/options', { method: 'POST', body: {} });
      step = 'パスキーの作成';
      const credential = await navigator.credentials.create({ publicKey: PublicKeyCredential.parseCreationOptionsFromJSON(options) });
      step = 'パスキーの確認と保存';
      await api.call('/api/passkeys', { method: 'POST', body: { challengeId, response: credential.toJSON(), name } });
    } catch (err) {
      console.error('passkey add failed at', step, err);
      throw new StoreError(err?.code ?? err?.name ?? 'unknown', `${step}で失敗しました。${describeError(err, 'パスキーを追加できませんでした。')}`);
    }
  }
  const supported = passkeysSupported();
  $('[data-passkey-unsupported]').hidden = supported;
  $('[data-add-passkey]').hidden = !supported;
  $('[data-add-passkey]').addEventListener('click', () => ask({
    title: 'パスキーを追加',
    message: 'このパスキーの名前（例: iPhone、仕事のPC）',
    value: 'パスキー',
    ok: '続ける',
    run: async (name) => {
      await addPasskey(name || 'パスキー');
      await refreshMain();
      tell('パスキーを追加しました', `「${name || 'パスキー'}」でログインできます。`);
    },
  }));

  // アプリからの依頼。戻り先は受け渡しと同じ決まり（isAppRedirect）で確かめる
  const p = new URLSearchParams(location.search);
  const back = p.get('passkey') === 'add' && isAppRedirect(p.get('app')) ? p.get('app') : null;
  if (back) {
    $('[data-passkey-request]').hidden = false;
    $('[data-passkey-request-ok]').addEventListener('click', async () => {
      passkeyError.textContent = '';
      try {
        await addPasskey('iPhone');
        location.href = `${back}#passkey=added`;
      } catch (err) {
        passkeyError.textContent = err.message;
      }
    });
    $('[data-passkey-request-cancel]').addEventListener('click', () => { location.href = `${back}#passkey=cancel`; });
  }

  const passwordSheet = sheet($('dialog[data-password-sheet]'));
  const passwordForm = $('[data-password-form]');
  $('[data-open-password]').addEventListener('click', () => {
    passwordForm.reset();
    $('[data-password-error]').textContent = '';
    openSheet(passwordSheet);
    passwordForm.elements.namedItem('current').focus();
  });
  passwordForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const error = $('[data-password-error]');
    error.textContent = '';
    const v = (n) => passwordForm.elements.namedItem(n).value;
    try {
      await api.call('/api/password', { method: 'POST', body: { current: v('current'), next: v('next') } });
      closeSheet(passwordSheet);
      tell('パスワードを変えました', 'ほかのログインと、拡張・アプリのトークンは使えなくなりました。');
      await refreshMain();
    } catch (err) {
      error.textContent = describeError(err, '変えられませんでした。');
    }
  });

  $('[data-issue-token]').addEventListener('click', () => ask({
    title: '拡張のトークンを発行',
    message: '見分けるための名前を付けてください。',
    placeholder: '例: 仕事のPCの拡張',
    ok: '発行',
    run: async (name) => {
      if (!name) throw new StoreError('invalid_name', '名前を入れてください。');
      const { token } = await api.call('/api/tokens', { method: 'POST', body: { device: name } });
      $('[data-token-value]').textContent = token;
      $('[data-token-box]').hidden = false;
      $('[data-copy-token]').lastChild.textContent = 'コピー';
      await refreshMain();
    },
  }));

  $('[data-logout]').addEventListener('click', () => actionSheet({
    title: 'ログアウトしますか？',
    actions: [{
      label: 'ログアウト',
      destructive: true,
      run: async () => {
        try { await api.call('/api/logout', { method: 'POST', body: {} }); } catch { /* 失敗しても画面は読み込み直す */ }
        location.reload();
      },
    }],
  }));
  $('[data-back]').addEventListener('click', (e) => { e.preventDefault(); goPage(null); });

  // 外観。アクセントの色（利用者ごと、Web とアプリで共通）
  const refreshAccent = () => {
    const hex = accent() ?? DEFAULT_ACCENT;
    $('.accent-swatch').style.setProperty('--swatch', hex);
    $('[data-accent-value]').textContent = accent() ? hex : `既定（${hex}）`;
  };
  $('[data-open-accent]').addEventListener('click', () => openColorSheet({
    kind: 'accent',
    title: 'アクセントの色',
    value: accent(),
    onSave: (color) => saveAccent(color).then(refreshAccent),
  }));
  refreshAccent();
  $('[data-open-history]').addEventListener('click', (e) => { e.preventDefault(); goPage('history'); });

  return {
    refreshAccent,
    // page: null（設定）か 'history'。開くたびに読み直す。トークンと招待リンクの値は、離れたら消す
    show(page) {
      const history = page === 'history';
      document.querySelectorAll('[data-settings-page]').forEach((s) => { s.hidden = s.dataset.settingsPage !== (history ? 'history' : 'main'); });
      if (history) refreshHistory();
      else {
        $('[data-token-box]').hidden = true;
        $('[data-invite-box]').hidden = true;
        refreshMain();
      }
    },
  };
}
