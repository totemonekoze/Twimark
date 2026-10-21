// 拡張の設定。書き込みに使うトークンを chrome.storage.local に置く（保存先のリポジトリは shared/store.js の DATA_REPO）
import { createStore } from './shared/store.js';

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

// 読めるかと件数だけを確かめる（書き込みの権限までは確かめない）
document.querySelector('[data-test]').addEventListener('click', async () => {
  if (!form.reportValidity()) return;
  status('確かめています…');
  try {
    const { data, sha } = await createStore(field.value.trim()).load();
    status(sha ? `接続できました（ブックマーク ${data.bookmarks.length}件）。` : '接続できました。最初の追加でデータのファイルを作ります。', 'ok');
  } catch (err) {
    status(err?.message ?? '接続できませんでした。', 'error');
  }
});
