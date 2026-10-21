// 拡張の設定。一覧の画面で発行した端末のトークンを chrome.storage.local に置く（保存先は shared/store.js の PUBLIC_URL）
import { createStore, describeError, PUBLIC_URL } from './shared/store.js';

const form = document.querySelector('[data-form]');
const field = form.elements.namedItem('token');
const statusEl = document.querySelector('[data-status]');
const status = (text, kind = '') => { statusEl.textContent = text; statusEl.dataset.kind = kind; };

chrome.storage.local.get('settings').then(({ settings }) => { field.value = settings?.token ?? ''; });

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  await chrome.storage.local.set({ settings: { token: field.value.trim() } });
  status('保存しました。', 'ok');
});

// トークンで読めるかと件数を確かめる
document.querySelector('[data-test]').addEventListener('click', async () => {
  if (!form.reportValidity()) return;
  status('確かめています…');
  try {
    const { data } = await createStore({ base: PUBLIC_URL, token: field.value.trim() }).load();
    status(`接続できました（ブックマーク ${data.bookmarks.length}件）。`, 'ok');
  } catch (err) {
    status(describeError(err, '接続できませんでした。'), 'error');
  }
});
