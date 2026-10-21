// ログインの前の画面。登録（最初の1人だけ）、ログイン（パスキーがあればパスキーを先に求める）、アプリへのログインの受け渡し。
// パスキーの変換はブラウザの parse…FromJSON と toJSON() を使う。ないブラウザではパスワードだけにする
import { describeError, isAppRedirect } from './shared/store.js';
const $ = (s, root = document) => root.querySelector(s);
const authView = $('[data-auth]');
const show = (name) => {
  authView.hidden = false;
  document.querySelectorAll('[data-auth-state]').forEach((el) => { el.hidden = el.dataset.authState !== name; });
};

export const passkeysSupported = () => typeof PublicKeyCredential !== 'undefined'
  && typeof PublicKeyCredential.parseRequestOptionsFromJSON === 'function'
  && typeof PublicKeyCredential.parseCreationOptionsFromJSON === 'function';

// アプリの戻り先。受け付けるものは shared/store.js の isAppRedirect
function appRedirect() {
  const raw = new URLSearchParams(location.search).get('app');
  return isAppRedirect(raw) ? raw : null;
}
function dropAppParam() {
  const url = new URL(location.href);
  url.searchParams.delete('app');
  history.replaceState(history.state, '', `${url.pathname}${url.search}`);
}

function setupForm(api, done) {
  const form = $('[data-setup-form]');
  const error = $('[data-setup-error]');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = (n) => form.elements.namedItem(n).value;
    error.textContent = '';
    if (v('password') !== v('confirm')) { error.textContent = '確認のパスワードが違います。'; return; }
    try {
      await api.call('/api/setup', { method: 'POST', body: { login: v('login').trim(), password: v('password') } });
      done(v('login').trim());
    } catch (err) {
      error.textContent = describeError(err, '登録できませんでした。');
    }
  });
}

function loginForm(api, done) {
  const form = $('[data-login-form]');
  const error = $('[data-login-error]');
  const passwordStep = $('[data-password-step]');
  const passwordField = form.elements.namedItem('password');
  const loginField = form.elements.namedItem('login');
  const usePassword = $('[data-use-password]');
  const note = $('[data-passkey-note]');
  const submit = $('[data-login-submit]');
  let step = 'id';

  const toPassword = () => {
    step = 'password';
    note.hidden = true;
    usePassword.hidden = true;
    passwordStep.hidden = false;
    passwordField.required = true;
    submit.textContent = 'ログイン';
    passwordField.focus();
  };
  usePassword.addEventListener('click', () => { error.textContent = ''; toPassword(); });
  loginField.addEventListener('input', () => {
    if (step === 'id') return;
    step = 'id';
    passwordStep.hidden = true;
    passwordField.required = false;
    usePassword.hidden = true;
    submit.textContent = '次へ';
  });

  async function withPasskey(start) {
    note.hidden = false;
    usePassword.hidden = false;
    try {
      const credential = await navigator.credentials.get({ publicKey: PublicKeyCredential.parseRequestOptionsFromJSON(start.options) });
      await api.call('/api/login/passkey', { method: 'POST', body: { challengeId: start.challengeId, response: credential.toJSON() } });
      done(loginField.value.trim());
    } catch (err) {
      note.hidden = true;
      // パスキーが使えなかったときは、パスワードでのログインも案内する
      console.error('passkey login failed', err);
      error.textContent = `${describeError(err, 'パスキーでログインできませんでした。')} 「パスワードでログイン」でも入れます。`;
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.textContent = '';
    const login = loginField.value.trim();
    try {
      if (step === 'id') {
        const start = await api.call('/api/login/start', { method: 'POST', body: { login } });
        if (start.passkey && passkeysSupported()) await withPasskey(start);
        else toPassword();
        return;
      }
      await api.call('/api/login/password', { method: 'POST', body: { login, password: passwordField.value } });
      done(login);
    } catch (err) {
      error.textContent = describeError(err, 'ログインできませんでした。');
    }
  });
}

// アプリ（?app=<戻り先>）にログインを渡す。渡したら戻り先へ移るので、この画面には戻らない
function handoff(api, redirect, cancel) {
  show('handoff');
  $('[data-handoff-target]').textContent = `戻り先: ${redirect}`;
  const error = $('[data-handoff-error]');
  $('[data-handoff-ok]').addEventListener('click', async () => {
    error.textContent = '';
    try {
      const { token } = await api.call('/api/tokens', { method: 'POST', body: { device: 'iPhone アプリ' } });
      location.href = `${redirect}#token=${encodeURIComponent(token)}`;
    } catch (err) {
      error.textContent = describeError(err, 'アプリに渡せませんでした。');
    }
  });
  $('[data-handoff-cancel]').addEventListener('click', () => { dropAppParam(); cancel(); });
}

// ログインが済んだら、ログインの ID で解決する
export function signIn(api) {
  return new Promise((resolve) => {
    show('loading');
    const redirect = appRedirect();
    const finish = (login) => {
      if (redirect) { handoff(api, redirect, () => { authView.hidden = true; resolve(login); }); return; }
      authView.hidden = true;
      resolve(login);
    };
    setupForm(api, finish);
    loginForm(api, finish);
    api.call('/api/session').then((s) => {
      if (s.login) finish(s.login);
      else show(s.setup ? 'setup' : 'login');
    }, (err) => {
      show('loading');
      $('[data-auth-state="loading"]').textContent = `読み込めませんでした。${describeError(err)}`;
    });
  });
}
