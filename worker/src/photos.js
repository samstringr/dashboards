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

/* ---------- the bot side ---------- */
const NEED = ['front', 'side', 'back'];
export async function openPhotoSession(env, send, buttons) {
  await setKV(env, 'photoset', { date: today(), until: Date.now() + 30 * 60e3 });
  return send(env, '📸 <b>Progress photos.</b> Send them one at a time or all together: <b>front</b>, <b>side</b> (arms out in front), <b>back</b>, relaxed. Flexed front and back are optional. A caption like “side” sets the pose; otherwise they go in that order.\n\n<i>Same spot, light in front, phone at chest height about 2 m away, timer on. They aren’t sent to Claude; they go straight to your dashboard → Photos. Weigh-in screenshot? Send it before you start, or tap “Not a progress photo” after it.</i>', buttons([[['Done', 'phd:x']]]));
}
export async function photoSessionOpen(env) {
  const s = await getKV(env, 'photoset');
  return s && s.until > Date.now() && s.date === today() ? s : null;
}
export async function closePhotoSession(env, send) {
  await delKV(env, 'photoset');
  const sets = await photoSets(env), s = sets.find(x => x.date === today());
  if (!s) return send(env, 'Photo session closed. Nothing saved today.');
  const got = POSES.filter(p => s.shots[p]);
  return send(env, `📸 Saved for ${dLong(s.date)}: ${got.map(p => POSE_NAME[p].toLowerCase()).join(', ')}. See them in the dashboard → Photos. Next set due ${dLong(addDays(s.date, CADENCE_DAYS))}.`);
}
/* A progress photo from Telegram: the biggest size as the photo, a ~320 px size as the thumbnail. */
export async function savePhotoFromTelegram(env, msg, tgFile, send, buttons) {
  const sizes = msg.photo || [], big = msg.document?.file_id || sizes[sizes.length - 1]?.file_id, small = sizes.find(s => (s.width || 0) >= 240 && (s.width || 0) <= 480) || sizes[Math.max(0, sizes.length - 2)];
  if (!big) return null;
  const full = await tgFile(env, big), thumb = small && small.file_id !== big ? await tgFile(env, small.file_id) : null;
  // D1 keeps rows under 2 MB. A photo is ~0.3 MB; an uncompressed file from the camera can be 4 MB, so it is refused, not cut.
  if (full.data.length + (thumb?.data.length || 0) > 1.9e6) return send(env, 'That one is too big to keep (sent as a file?). Send it as a photo instead.');
  const pose = poseFromText(msg.caption);
  const r = await putPhoto(env, { date: today(), pose, full: full.data, thumb: thumb?.data || null, mime: full.media_type, src: 'telegram' });
  if (!r.pose) return send(env, 'All five poses are already saved for today. Caption a photo with its pose (“front”, “back flexed”) to replace one.');
  await setKV(env, 'photoset', { date: today(), until: Date.now() + 30 * 60e3 });
  const sets = await photoSets(env), s = sets.find(x => x.date === r.date), have = POSES.filter(p => s?.shots[p]), left = NEED.filter(p => !have.includes(p));
  return send(env, `📸 ${esc(POSE_NAME[r.pose])} saved.${left.length ? ` Next: <b>${left.map(p => POSE_NAME[p].toLowerCase()).join(', ')}</b>.` : ' Front, side and back are in. Flexed ones are optional; tap Done when you’re finished.'}`,
    buttons([[['Done', 'phd:x'], ['Not a progress photo', 'phx:' + r.id]]]));
}
