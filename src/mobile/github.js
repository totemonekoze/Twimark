// アプリ用の保存先。iOS の URLSession は GitHub API の Cache-Control（max-age=60）を守ってキャッシュから返すので、
// 書き込みの前の読み込みが古い sha になり 409 が続く。読み込み（GET）は毎回違う URL にしてキャッシュを使わせない
import { createStore } from '../shared/store.js';

const fresh = (url, init = {}) => globalThis.fetch(init.method ? url : `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`, init);
export const createAppStore = (token) => createStore(token, fresh);
