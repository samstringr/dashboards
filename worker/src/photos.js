/* Health DB · photos.js
   Progress photos (13 Nov 2026). WHY here and not in the dashboard's own storage: Sam wants to send them to the
   bot and see them in the dashboard, and the bot can only write to Health DB. Kept private on purpose:
   • they live in their own table, outside the day documents, so get_snapshot, the nightly GitHub backup and the
     CSV never carry them;
   • a progress photo is never sent to Claude (no parsing, no estimating): the bot only saves it;
   • the dashboard reads them through the Health DB connector and blurs them until tapped.
   A set is one date with up to five poses. Front, side and back are the ones to compare; the flexed two are optional.
   Cadence: every 4 weeks, on a weigh-in morning (the bot asks on Mon/Wed/Fri at 07:00 when one is due). */
import { esc, uid, today, addDays, dLong, b64 } from './util.js';
import { getKV, setKV, delKV, getDay } from './store.js';

export const POSES = ['front', 'side', 'back', 'frontflex', 'backflex'];
export const POSE_NAME = { front: 'Front', side: 'Side', back: 'Back', frontflex: 'Front, flexed', backflex: 'Back, flexed' };
export const CADENCE_DAYS = 28;
const POSE_WORDS = [['frontflex', /front.*flex|flex.*front|double bi.*front|front double/i], ['backflex', /back.*flex|flex.*back|back double|rear double/i],
  ['front', /\bfront\b/i], ['side', /\bside\b/i], ['back', /\bback\b/i]];
export const poseFromText = t => { for (const [p, re] of POSE_WORDS) if (re.test(t || '')) return p; return null; };
export const isPhotoCaption = t => /progress|physique|\bpose\b/i.test(t || '') || !!poseFromText(t);

export async function ensurePhotoSchema(env) {
  await env.DB.batch([
    env.DB.prepare('CREATE TABLE IF NOT EXISTS photos (id TEXT PRIMARY KEY, date TEXT NOT NULL, pose TEXT NOT NULL, thumb TEXT, full TEXT NOT NULL, mime TEXT, w REAL, bf REAL, src TEXT, created INTEGER)'),
    env.DB.prepare('CREATE UNIQUE INDEX IF NOT EXISTS photos_date_pose ON photos (date, pose)')
  ]);
}
/* Metadata only, newest set first: [{date, w, bf, shots: {pose: id}}]. The images come one at a time from getPhoto. */
export async function photoSets(env) {
  await ensurePhotoSchema(env);
  const { results } = await env.DB.prepare('SELECT id, date, pose, w, bf, src FROM photos ORDER BY date DESC').all();
  const by = new Map();
  for (const r of results) { const s = by.get(r.date) || { date: r.date, shots: {}, src: {} }; s.shots[r.pose] = r.id; s.src[r.pose] = r.src; if (r.w) s.w = r.w; if (r.bf) s.bf = r.bf; by.set(r.date, s); }
  return [...by.values()];
}
export async function getPhoto(env, id, size = 'thumb') {
  await ensurePhotoSchema(env);
  const r = await env.DB.prepare('SELECT id, date, pose, thumb, full, mime FROM photos WHERE id = ?').bind(id).first();
  if (!r) return null;
  return { id: r.id, date: r.date, pose: r.pose, mime: r.mime || 'image/jpeg', data: size === 'full' ? r.full : (r.thumb || r.full) };
}
/* Save one photo. With a pose it replaces that pose for the date; without one it takes the first free pose in order,
   claimed with an insert that can only succeed once per pose, so an album of three sent together lands as front,
   side and back without two messages taking the same slot. */
export async function putPhoto(env, p) {
  await ensurePhotoSchema(env);
  const date = p.date || today(), body = (await getDay(env, date))?.body || {};
  const row = (pose, id) => [id, date, pose, p.thumb || null, p.full, p.mime || 'image/jpeg', p.w ?? body.w ?? null, p.bf ?? body.bf ?? null, p.src || 'dashboard', Date.now()];
  const sql = verb => `${verb} INTO photos (id, date, pose, thumb, full, mime, w, bf, src, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  if (p.pose) {
    if (!POSES.includes(p.pose)) throw new Error('pose must be one of ' + POSES.join(', '));
    const id = uid(); await env.DB.prepare(sql('INSERT OR REPLACE')).bind(...row(p.pose, id)).run(); return { id, date, pose: p.pose };
  }
  for (const pose of POSES) { const id = uid(), r = await env.DB.prepare(sql('INSERT OR IGNORE')).bind(...row(pose, id)).run(); if (r.meta?.changes) return { id, date, pose }; }
  return { id: null, date, pose: null, full: true };
}
export async function deletePhotos(env, a) {
  await ensurePhotoSchema(env);
  const r = a.id ? await env.DB.prepare('DELETE FROM photos WHERE id = ?').bind(a.id).run() : await env.DB.prepare('DELETE FROM photos WHERE date = ?').bind(a.date).run();
  return { deleted: r.meta?.changes || 0 };
}
export async function photoDue(env, td = today()) {
  await ensurePhotoSchema(env);
  const r = await env.DB.prepare('SELECT MAX(date) AS d FROM photos WHERE pose IN (\'front\', \'side\', \'back\')').first(), last = r?.d || null;
  const next = last ? addDays(last, CADENCE_DAYS) : td;
  return { last, next, due: next <= td };
}

/* ---------- the bot side ----------
   14 Nov 2026, Sam: he takes all the photos first and sends them together, with no caption and no /done. So:
   • when a set is due (the first one, or 4 weeks since the last): on the day the bot asked, any photo without a
     caption is a progress photo; on other days an album of them is (a single photo is still read as food);
   • a caption that says progress (or a pose) on any photo of an album covers the whole album;
   • /photos still opens a 30-minute window for an off-cycle set, and it closes itself once front, side and back
     are in (/done still works, but nothing needs it);
   • "progress photos" typed within 15 minutes of photos that went elsewhere moves them across;
   • one reply per album, edited as each photo lands, instead of one message per photo.
   Food photos and weigh-in screenshots while a set is due: the reply has a single "Not progress photos" button. */
const NEED = ['front', 'side', 'back'];
export async function openPhotoSession(env, send) {
  await setKV(env, 'photoset', { date: today(), until: Date.now() + 30 * 60e3 });
  return send(env, '📸 <b>Progress photos.</b> Send them all together, no caption needed: <b>front</b>, <b>side</b> (arms out in front), <b>back</b>, relaxed, in that order. Flexed front and back are optional extras. A caption like “side” on a photo sets its pose.\n\n<i>Same spot, light in front, phone at chest height about 2 m away, timer on. They go straight to your dashboard → Photos and are never sent to Claude.</i>');
}
export async function photoSessionOpen(env) {
  const s = await getKV(env, 'photoset');
  return s && s.until > Date.now() && s.date === today() ? s : null;
}
export async function closePhotoSession(env, send) {
  await delKV(env, 'photoset');
  const s = (await photoSets(env)).find(x => x.date === today());
  if (!s) return send(env, 'Photo window closed. Nothing saved today.');
  return send(env, `📸 Saved for ${dLong(s.date)}: ${POSES.filter(p => s.shots[p]).map(p => POSE_NAME[p].toLowerCase()).join(', ')}. Next set due ${dLong(addDays(s.date, CADENCE_DAYS))}.`);
}
/* Is this photo a progress photo? */
export async function photoRoute(env, msg) {
  const gid = msg.media_group_id || null;
  if (isPhotoCaption(msg.caption)) { if (gid) await setKV(env, 'phalbum', { gid, until: Date.now() + 5 * 60e3 }); return 'caption'; }
  if (gid) { const a = await getKV(env, 'phalbum'); if (a && a.gid === gid && a.until > Date.now()) return 'album'; }
  if (msg.caption) return null;                     // a caption about something else: food, a label, a screenshot
  if (await photoSessionOpen(env)) return 'session';
  // due: on the day the bot asked, any photo; any other day only an album (food comes one photo at a time)
  if ((await photoDue(env)).due) { const ask = await getKV(env, 'photoask'); if ((ask && Date.now() - ask.t < 24 * 3600e3) || gid) return 'due'; }
  return null;
}
/* Photos that went to the food reader, kept 15 minutes in case "progress photos" follows. */
export async function rememberImages(env, msg) {
  const big = msg.document?.file_id || msg.photo?.[msg.photo.length - 1]?.file_id; if (!big) return;
  const prev = await getKV(env, 'lastimgs'), gid = msg.media_group_id || null, keep = prev && gid && prev.gid === gid ? prev.msgs : [];   // an album, or just the last photo
  await setKV(env, 'lastimgs', { t: Date.now(), gid, msgs: [...keep, { photo: msg.photo || null, document: msg.document || null }].slice(-6) });
}
export const isProgressNote = t => /^\s*(?:(?:these|those|they)(?: are|'re)?|that(?: was|'s)?)?\s*(?:my\s+)?progress\s+(?:photos?|pics?|pictures?|shots?)\b/i.test(t || '');
export async function moveRemembered(env, tgFile, send) {
  const m = await getKV(env, 'lastimgs'); await delKV(env, 'lastimgs');
  if (!m || Date.now() - m.t > 15 * 60e3 || !m.msgs.length) return send(env, 'I don’t have any photos from the last 15 minutes. Send them again; no caption needed while a set is due, or start with /photos.');
  await setKV(env, 'photoset', { date: today(), until: Date.now() + 30 * 60e3 });
  const out = [];
  for (const x of m.msgs) { const r = await storeOne(env, x, tgFile); if (r?.pose) out.push(r.pose); }
  return send(env, `📸 Moved to progress photos: ${out.map(p => POSE_NAME[p].toLowerCase()).join(', ') || 'nothing (all five poses were already in)'}.${await nextNote(env)}`);
}
async function storeOne(env, msg, tgFile) {
  const sizes = msg.photo || [], big = msg.document?.file_id || sizes[sizes.length - 1]?.file_id, small = sizes.find(s => (s.width || 0) >= 240 && (s.width || 0) <= 480) || sizes[Math.max(0, sizes.length - 2)];
  if (!big) return null;
  const full = await tgFile(env, big), thumb = small && small.file_id !== big ? await tgFile(env, small.file_id) : null;
  // D1 keeps rows under 2 MB. A photo is ~0.3 MB; an uncompressed file from the camera can be 4 MB, so it is refused, not cut.
  if (full.data.length + (thumb?.data.length || 0) > 1.9e6) return { tooBig: true };
  return putPhoto(env, { date: today(), pose: poseFromText(msg.caption), full: full.data, thumb: thumb?.data || null, mime: full.media_type, src: 'telegram' });
}
async function nextNote(env) {
  const s = (await photoSets(env)).find(x => x.date === today()), have = POSES.filter(p => s?.shots[p]), left = NEED.filter(p => !have.includes(p));
  if (left.length) return ` Still to come: <b>${left.map(p => POSE_NAME[p].toLowerCase()).join(', ')}</b>.`;
  await delKV(env, 'photoset');   // front, side and back are in: the window closes itself
  return ` That’s the set. Next one due ${dLong(addDays(today(), CADENCE_DAYS))}.`;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
/* Save one photo; reply once per album. Every photo of an album arrives as its own update, often at the same
   moment, so the first one to claim the album's key sends the reply and the rest edit it. Each waits a beat
   first so the reply lists everything that landed. */
export async function savePhotoFromTelegram(env, msg, tgFile, tg, chat, buttons) {
  const r = await storeOne(env, msg, tgFile);
  if (r?.tooBig) return tg(env, 'sendMessage', { chat_id: chat, text: 'That one is too big to keep (sent as a file?). Send it as a photo instead.' });
  if (r && !r.pose) return tg(env, 'sendMessage', { chat_id: chat, text: 'All five poses are already saved for today. Caption a photo with its pose (“front”, “back flexed”) to replace one.' });
  const gid = msg.media_group_id || ('one-' + r.id), key = 'phmsg:' + gid;
  await setKV(env, `phid:${gid}:${r.id}`, 1);   // one key per photo: parallel album updates can't overwrite each other
  if (msg.media_group_id) await sleep(1500);
  const claim = await env.DB.prepare('INSERT OR IGNORE INTO kv (k, v, updated) VALUES (?, ?, ?)').bind(key, JSON.stringify({ mid: null }), Date.now()).run();
  const s = (await photoSets(env)).find(x => x.date === r.date), got = POSES.filter(p => s?.shots[p]);
  const text = `📸 <b>Progress photos, ${dLong(r.date)}</b>: ${got.map(p => POSE_NAME[p].toLowerCase()).join(', ')} saved.${await nextNote(env)}\n<i>In your dashboard → Photos.</i>`;
  const kb = buttons([[['Not progress photos', 'phx:' + gid]]]);
  if (claim.meta?.changes) {
    const sent = await tg(env, 'sendMessage', { chat_id: chat, text, parse_mode: 'HTML', ...kb });
    await setKV(env, key, { mid: sent?.result?.message_id || null }); return sent;
  }
  let mid = null; for (let i = 0; i < 15 && !mid; i++) { mid = (await getKV(env, key))?.mid; if (!mid) await sleep(250); }
  if (mid) return tg(env, 'editMessageText', { chat_id: chat, message_id: mid, text, parse_mode: 'HTML', ...kb }).catch(() => null);
}
/* "Not progress photos": take the batch back out. One photo is read as usual; several, he resends with a caption. */
export async function undoBatch(env, gid) {
  const { results } = await env.DB.prepare('SELECT k FROM kv WHERE k LIKE ?').bind(`phid:${gid}:%`).all(), ids = results.map(x => x.k.split(':').pop());
  const one = ids.length === 1 ? await getPhoto(env, ids[0], 'full') : null;
  for (const id of ids) await deletePhotos(env, { id });
  await env.DB.prepare('DELETE FROM kv WHERE k LIKE ?').bind(`phid:${gid}:%`).run(); await delKV(env, 'photoset'); await delKV(env, 'phalbum');
  return { n: ids.length, one };
}
