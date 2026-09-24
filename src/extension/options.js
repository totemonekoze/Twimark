// 拡張の設定。データ用リポジトリとトークンを chrome.storage.local に置く
import { createStore } from './shared/store.js';

const form = document.querySelector('[data-form]');
const statusEl = document.querySelector('[data-status]');
const status = (text, kind = '') => { statusEl.textContent = text; statusEl.dataset.kind = kind; };
const values = () => Object.fromEntries(['owner', 'repo', 'token'].map((k) => [k, form.elements.namedItem(k).value.trim()]));

chrome.storage.local.get('settings').then(({ settings }) => {
  for (const k of ['owner', 'repo', 'token']) form.elements.namedItem(k).value = settings?.[k] ?? '';
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  await chrome.storage.local.set({ settings: values() });
  status('保存しました。', 'ok');
});

document.querySelector('[data-test]').addEventListener('click', async () => {
  if (!form.reportValidity()) return;
  status('確かめています…');
  try {
    const { data, sha } = await createStore(values()).load();
    status(sha ? `接続できました（ブックマーク ${data.bookmarks.length}件）。` : '接続できました。最初の追加でデータのファイルを作ります。', 'ok');
  } catch (err) {
    status(err?.message ?? '接続できませんでした。', 'error');
  }
});
