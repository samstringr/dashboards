/* Health DB · store.js */
let schemaReady = false;
/* ============================================================ storage */
export async function ensureSchema(env) {
  if (schemaReady) return;
  await env.DB.batch([
    env.DB.prepare('CREATE TABLE IF NOT EXISTS days (date TEXT PRIMARY KEY, doc TEXT NOT NULL, updated INTEGER NOT NULL)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS config (id TEXT PRIMARY KEY, doc TEXT NOT NULL, updated INTEGER NOT NULL)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT, updated INTEGER)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS seen (update_id INTEGER PRIMARY KEY, at INTEGER)')
  ]);
  schemaReady = true;
}
export async function getDay(env, date) {
  const r = await env.DB.prepare('SELECT doc FROM days WHERE date = ?').bind(date).first();
  return r ? JSON.parse(r.doc) : null;
}
export async function putDay(env, doc) {
  doc.updated = Math.max(Date.now(), (doc.updated || 0) + 1);
  await env.DB.prepare('INSERT INTO days (date, doc, updated) VALUES (?, ?, ?) ON CONFLICT(date) DO UPDATE SET doc = excluded.doc, updated = excluded.updated')
    .bind(doc.date, JSON.stringify(doc), doc.updated).run();
  return doc;
}
export async function mutateDay(env, date, fn) {
  const doc = (await getDay(env, date)) || { date };
  fn(doc); doc.date = date;
  return putDay(env, doc);
}
export async function allDays(env) {
  const { results } = await env.DB.prepare('SELECT doc FROM days ORDER BY date').all();
  return results.map(r => JSON.parse(r.doc));
}
export async function getConfig(env, id) {
  const r = await env.DB.prepare('SELECT doc, updated FROM config WHERE id = ?').bind(id).first();
  return r ? JSON.parse(r.doc) : null;
}
export async function putConfig(env, id, doc) {
  const updated = Date.now();
  await env.DB.prepare('INSERT INTO config (id, doc, updated) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET doc = excluded.doc, updated = excluded.updated')
    .bind(id, JSON.stringify(doc), updated).run();
  return updated;
}
export async function allConfig(env) {
  const { results } = await env.DB.prepare('SELECT id, doc FROM config').all();
  const o = {}; for (const r of results) o[r.id] = JSON.parse(r.doc); return o;
}
export async function getRev(env) {
  const a = await env.DB.prepare('SELECT MAX(updated) AS m FROM days').first();
  const b = await env.DB.prepare('SELECT MAX(updated) AS m FROM config').first();
  return Math.max(a?.m || 0, b?.m || 0);
}
export async function getKV(env, k) { const r = await env.DB.prepare('SELECT v FROM kv WHERE k = ?').bind(k).first(); return r ? JSON.parse(r.v) : null; }
export async function setKV(env, k, v) { await env.DB.prepare('INSERT INTO kv (k, v, updated) VALUES (?, ?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, updated = excluded.updated').bind(k, JSON.stringify(v), Date.now()).run(); }
export async function delKV(env, k) { await env.DB.prepare('DELETE FROM kv WHERE k = ?').bind(k).run(); }
