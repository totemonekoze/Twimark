// ブックマークとカテゴリ・サブカテゴリの読み書き（D1）。検査の決まりは前の ops（GitHub に置いていた頃）と同じ
import { DEFAULT_CATEGORIES, LIMITS, SITES, StoreError, checkName } from '../shared/store.js';

const MAX = { url: 500, author: 100, title: 300, media: 10, id: 80, posted: 40 };
const https = (s) => typeof s === 'string' && s.length <= MAX.url && /^https:\/\//.test(s);
const str = (s, max) => (typeof s === 'string' ? s.slice(0, max) : '');

export async function seedCategories(db, uid) {
  await db.batch(DEFAULT_CATEGORIES.map((name, i) => db.prepare('INSERT INTO categories (user_id, name, position) VALUES (?, ?, ?)').bind(uid, name, i)));
}

export async function readData(db, uid) {
  const [cats, subs, rows] = await db.batch([
    db.prepare('SELECT name FROM categories WHERE user_id = ? ORDER BY position, name').bind(uid),
    db.prepare('SELECT category, name FROM subcategories WHERE user_id = ? ORDER BY category, position, name').bind(uid),
    db.prepare('SELECT * FROM bookmarks WHERE user_id = ? ORDER BY saved_at DESC').bind(uid),
  ]);
  const categories = cats.results.map((r) => r.name);
  const subcategories = Object.fromEntries(categories.map((c) => [c, []]));
  for (const r of subs.results) subcategories[r.category]?.push(r.name);
  const bookmarks = rows.results.map((r) => ({
    id: r.id,
    site: r.site,
    url: r.url,
    author: { name: r.author_name, handle: r.author_handle },
    postedAt: r.posted_at,
    title: r.title,
    text: r.text,
    photos: JSON.parse(r.photos),
    videos: JSON.parse(r.videos),
    category: r.category,
    subcategory: r.subcategory,
    savedAt: r.saved_at,
  }));
  return { categories, subcategories, bookmarks };
}

const categoryNames = async (db, uid) => (await db.prepare('SELECT name FROM categories WHERE user_id = ? ORDER BY position, name').bind(uid).all()).results.map((r) => r.name);
const subcategoryNames = async (db, uid, category) => (await db.prepare('SELECT name FROM subcategories WHERE user_id = ? AND category = ? ORDER BY position, name').bind(uid, category).all()).results.map((r) => r.name);

async function checkPlace(db, uid, category, subcategory) {
  if (!(await categoryNames(db, uid)).includes(category)) throw new StoreError('invalid_category', 'カテゴリを一覧から選んでください。');
  if (subcategory === null || subcategory === undefined || subcategory === '') return null;
  if (!(await subcategoryNames(db, uid, category)).includes(subcategory)) throw new StoreError('invalid_subcategory', 'サブカテゴリを一覧から選んでください。');
  return subcategory;
}

// 並べ替えは、今と同じ名前の集合の並びだけを受け付ける
function checkOrder(names, list) {
  if (!Array.isArray(names) || names.length !== list.length || new Set(names).size !== names.length || !names.every((n) => list.includes(n))) {
    throw new StoreError('invalid_order', '一覧が変わっています。再読み込みしてやり直してください。');
  }
}

function cleanBookmark(raw) {
  const b = raw && typeof raw === 'object' ? raw : {};
  const ok = typeof b.id === 'string' && b.id.length <= MAX.id && Object.hasOwn(SITES, b.site) && b.id.startsWith(`${b.site}:`) && https(b.url);
  if (!ok) throw new StoreError('invalid_bookmark', 'ブックマークの形が正しくありません。');
  const media = (list, key) => (Array.isArray(list) ? list.filter((m) => https(m?.[key])).slice(0, MAX.media).map((m) => ({ [key]: m[key] })) : []);
  return {
    id: b.id,
    site: b.site,
    url: b.url,
    authorName: str(b.author?.name, MAX.author),
    authorHandle: str(b.author?.handle, MAX.author),
    postedAt: typeof b.postedAt === 'string' && b.postedAt ? b.postedAt.slice(0, MAX.posted) : null,
    title: str(b.title, MAX.title),
    text: str(b.text, LIMITS.text),
    photos: JSON.stringify(media(b.photos, 'url')),
    videos: JSON.stringify(media(b.videos, 'thumbnail')),
  };
}

const OPS = {
  async add(db, uid, raw) {
    const b = cleanBookmark(raw);
    const subcategory = await checkPlace(db, uid, raw.category, raw.subcategory);
    if (await db.prepare('SELECT 1 FROM bookmarks WHERE user_id = ? AND id = ?').bind(uid, b.id).first()) throw new StoreError('duplicate', 'このページはもう保存されています。');
    await db.prepare(`INSERT INTO bookmarks (user_id, id, site, url, author_name, author_handle, posted_at, title, text, photos, videos, category, subcategory, saved_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(uid, b.id, b.site, b.url, b.authorName, b.authorHandle, b.postedAt, b.title, b.text, b.photos, b.videos, raw.category, subcategory, new Date().toISOString())
      .run();
  },
  async remove(db, uid, id) {
    await db.prepare('DELETE FROM bookmarks WHERE user_id = ? AND id = ?').bind(uid, String(id)).run();
  },
  async setCategory(db, uid, id, category, subcategory = null) {
    if (!(await db.prepare('SELECT 1 FROM bookmarks WHERE user_id = ? AND id = ?').bind(uid, String(id)).first())) throw new StoreError('not_found', 'そのブックマークはもうありません。再読み込みしてください。');
    const sub = await checkPlace(db, uid, category, subcategory);
    await db.prepare('UPDATE bookmarks SET category = ?, subcategory = ? WHERE user_id = ? AND id = ?').bind(category, sub, uid, String(id)).run();
  },
  async addCategory(db, uid, raw) {
    const name = checkName(raw);
    const list = await categoryNames(db, uid);
    if (list.includes(name)) throw new StoreError('duplicate', 'そのカテゴリはもうあります。');
    if (list.length >= LIMITS.categories) throw new StoreError('too_many', `カテゴリは${LIMITS.categories}個までです。`);
    await db.prepare('INSERT INTO categories (user_id, name, position) VALUES (?, ?, ?)').bind(uid, name, list.length).run();
  },
  // 消したカテゴリのブックマークは消さない（「未分類」に出る）。サブカテゴリは消す
  async removeCategory(db, uid, name) {
    await db.batch([
      db.prepare('DELETE FROM categories WHERE user_id = ? AND name = ?').bind(uid, String(name)),
      db.prepare('DELETE FROM subcategories WHERE user_id = ? AND category = ?').bind(uid, String(name)),
    ]);
  },
  async sortCategories(db, uid, names) {
    checkOrder(names, await categoryNames(db, uid));
    await db.batch(names.map((n, i) => db.prepare('UPDATE categories SET position = ? WHERE user_id = ? AND name = ?').bind(i, uid, n)));
  },
  async addSubcategory(db, uid, category, raw) {
    if (!(await categoryNames(db, uid)).includes(category)) throw new StoreError('invalid_category', 'カテゴリを一覧から選んでください。');
    const name = checkName(raw, 'サブカテゴリ');
    const list = await subcategoryNames(db, uid, category);
    if (list.includes(name)) throw new StoreError('duplicate', 'そのサブカテゴリはもうあります。');
    if (list.length >= LIMITS.subcategories) throw new StoreError('too_many', `サブカテゴリは1つのカテゴリに${LIMITS.subcategories}個までです。`);
    await db.prepare('INSERT INTO subcategories (user_id, category, name, position) VALUES (?, ?, ?, ?)').bind(uid, category, name, list.length).run();
  },
  // 消したサブカテゴリのブックマークは、カテゴリの直下に戻す
  async removeSubcategory(db, uid, category, name) {
    await db.batch([
      db.prepare('DELETE FROM subcategories WHERE user_id = ? AND category = ? AND name = ?').bind(uid, String(category), String(name)),
      db.prepare('UPDATE bookmarks SET subcategory = NULL WHERE user_id = ? AND category = ? AND subcategory = ?').bind(uid, String(category), String(name)),
    ]);
  },
  async sortSubcategories(db, uid, category, names) {
    checkOrder(names, await subcategoryNames(db, uid, String(category)));
    await db.batch(names.map((n, i) => db.prepare('UPDATE subcategories SET position = ? WHERE user_id = ? AND category = ? AND name = ?').bind(i, uid, category, n)));
  },
};

// body は { op, args }。操作のあとのデータを返す
export async function applyOp(db, uid, body) {
  const fn = typeof body?.op === 'string' && Object.hasOwn(OPS, body.op) ? OPS[body.op] : null;
  if (!fn || !Array.isArray(body.args)) throw new StoreError('invalid_op', 'その操作はありません。');
  await fn(db, uid, ...body.args);
  return readData(db, uid);
}
