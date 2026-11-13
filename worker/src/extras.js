/* Health DB · extras.js — supplements, away (holiday) mode, voice notes */
import { esc, fmt, today, addDays, diffDays, dLong, b64 } from './util.js';
import { getDay, mutateDay, putConfig, getKV, setKV } from './store.js';
import { weighins, rollAvg } from './model.js';
import { tg, send, chatId } from './bot.js';

/* ============================================================ supplements
   Why these slots (Sam's stack, 3 Nov 2026):
   - Creatine: timing barely matters, daily consistency does → with lunch, the easiest anchor.
   - Zinc: with food (empty-stomach zinc often causes nausea); kept away from magnesium.
   - Omega-3 and D3+K2: fat-soluble / absorb far better with a meal that has fat → dinner, his biggest meal.
   - Magnesium: evening, 30–60 min before bed.
   The day doc stores supps: { id: ISO time ticked }. A new day is a new doc, so it resets itself. */
export const DEFAULT_SUPPS = { remind: true, items: [
  { id: 'creatine', n: 'Creatine', dose: '5 g', slot: 'lunch', why: 'Timing barely matters; taking it every day does. Lunch is the easiest anchor.' },
  { id: 'zinc', n: 'Zinc', dose: '1 tablet', slot: 'dinner', why: 'The label says with your largest meal, usually dinner: food stops it upsetting your stomach. Hours apart from magnesium at bedtime.' },
  { id: 'omega3', n: 'Omega-3', dose: '2 softgels', slot: 'dinner', why: 'Absorbs much better with a meal that contains fat.' },
  { id: 'd3k2', n: 'D3 + K2', dose: '1 capsule', slot: 'dinner', why: 'Fat-soluble: take with your largest meal.' },
  { id: 'magnesium', n: 'Magnesium', dose: '2 tablets', slot: 'bed', why: '30–60 min before bed; may help sleep quality.' }] };
export const SLOTS = { morning: 'Morning', lunch: 'With lunch', dinner: 'With dinner', bed: 'Before bed', any: 'Any time' };
/* First day creatine was ticked: the start of its water-weight bump (about 1–2 kg over 3–4 weeks at 3–5 g a day). */
export const creatineStart = ctx => (ctx.days.find(d => d.supps && d.supps.creatine) || {}).date || null;
export const suppList = ctx => (ctx.config?.supplements?.items?.length ? ctx.config.supplements : DEFAULT_SUPPS);

export function suppsText(list, taken, date, head = '💊 <b>Supplements</b>') {
  const lines = list.items.map(s => `${taken[s.id] ? '✅' : '◻️'} ${esc(s.n)}${s.dose ? ' <i>' + esc(s.dose) + '</i>' : ''} · ${SLOTS[s.slot] || ''}`);
  const n = list.items.filter(s => taken[s.id]).length;
  return `${head} · ${dLong(date)}\n${lines.join('\n')}\n${n === list.items.length ? '<b>All taken.</b>' : `${n} of ${list.items.length} taken. Tap to tick.`}`;
}
export function suppsKeys(list, taken, date, only) {
  const show = list.items.filter(s => !only || only.includes(s.id));
  const rows = []; for (let i = 0; i < show.length; i += 2) rows.push(show.slice(i, i + 2).map(s => ({ text: (taken[s.id] ? '✅ ' : '◻️ ') + s.n, callback_data: `sp:${s.id}:${date}` })));
  if (show.some(s => !taken[s.id])) rows.push([{ text: 'Tick all of these', callback_data: `sa:${show.map(s => list.items.indexOf(s)).join('.')}:${date}` }]);
  return { inline_keyboard: rows };
}
export async function sendSupps(env, ctx, date, only, head) {
  const d = await getDay(env, date), taken = d?.supps || {}, list = suppList(ctx);
  return send(env, suppsText(list, taken, date, head), { reply_markup: suppsKeys(list, taken, date, only) });
}
export async function tickSupps(env, date, ids, on = true) {
  const t = new Date().toISOString();
  return mutateDay(env, date, d => { d.supps = { ...(d.supps || {}) }; for (const id of ids) { if (on) d.supps[id] ||= t; else delete d.supps[id]; } });
}
/* sp:<id>:<date> toggles one; sa:<indexes>:<date> ticks the listed ones. The message is redrawn in place. */
export async function onSuppCallback(env, ctx, cq) {
  const [act, a, date] = String(cq.data).split(':');
  const list = suppList(ctx), cur = (await getDay(env, date))?.supps || {};
  let ids;
  if (act === 'sp') { await tickSupps(env, date, [a], !cur[a]); }
  else { ids = a.split('.').map(i => list.items[+i]?.id).filter(Boolean); await tickSupps(env, date, ids, true); }
  const taken = (await getDay(env, date))?.supps || {};
  const only = cq.message?.reply_markup?.inline_keyboard?.flat().map(b => (b.callback_data || '').split(':')).filter(p => p[0] === 'sp').map(p => p[1]);
  const head = (cq.message?.text || '').startsWith('⏰') ? '⏰ <b>Supplements check</b>' : '💊 <b>Supplements</b>';
  await tg(env, 'editMessageText', { chat_id: chatId(env), message_id: cq.message?.message_id, text: suppsText(list, taken, date, head), parse_mode: 'HTML', reply_markup: suppsKeys(list, taken, date, only?.length ? only : null) });
}
export async function suppReminder(env, ctx, td, slots) {
  const list = suppList(ctx); if (list.remind === false) return false;
  const taken = (await getDay(env, td))?.supps || {};
  const due = list.items.filter(s => slots.includes(s.slot) && !taken[s.id]).map(s => s.id);
  if (!due.length) return false;
  await send(env, suppsText({ ...list, items: list.items.filter(s => due.includes(s.id)) }, taken, td, '⏰ <b>Supplements check</b>'), { reply_markup: suppsKeys(list, taken, td, due) });
  return true;
}

/* ============================================================ away (holiday) mode
   The rule Sam asked for: do nothing, and the system copes.
   - Gaps are just blank days. Averages, streaks and the 4-week check skip them already.
   - After 2 days with nothing logged at all, reminders go quiet by themselves (one message says so).
   - The first thing he sends after a gap of 3+ days gets a short "welcome back" with the gap noted.
   - /away and /back are optional: they only silence reminders up front and label the days. */
export const hasData = d => !!d && ((d.items && d.items.length) || d.legacy?.kcal != null || d.body?.w || d.body?.bf || (d.workouts && d.workouts.length) || (d.supps && Object.keys(d.supps).length));
export const awayRanges = ctx => ctx.config?.away?.ranges || [];
export const awayOn = (ctx, date) => awayRanges(ctx).find(r => r.from <= date && (!r.to || date <= r.to)) || null;
export function lastDataBefore(ctx, date) {
  for (let i = ctx.days.length - 1; i >= 0; i--) { const d = ctx.days[i]; if (d.date < date && hasData(d)) return d.date; }
  return null;
}
export function quietState(ctx, date) {
  const away = awayOn(ctx, date); if (away) return { quiet: true, why: 'away', away };
  if (hasData(ctx.days.find(d => d.date === date))) return { quiet: false };
  const last = lastDataBefore(ctx, date);
  if (last && diffDays(last, date) > 2) return { quiet: true, why: 'gap', last };
  return { quiet: false };
}
export async function setAway(env, ctx, from, to, note) {
  const ranges = awayRanges(ctx).filter(r => !(r.from <= from && (!r.to || from <= r.to)));
  ranges.push({ from, to: to || null, ...(note ? { note: String(note).slice(0, 60) } : {}) });
  ranges.sort((a, b) => a.from < b.from ? -1 : 1);
  await putConfig(env, 'away', { ranges }); ctx.config.away = { ranges };
  const days = to ? diffDays(from, to) + 1 : null;
  return send(env, `🏝 <b>Away${note ? ': ' + esc(note) : ''}</b> · ${dLong(from)}${to ? ' to ' + dLong(to) + ` (${days} day${days > 1 ? 's' : ''})` : ', until you send /back or log something'}\nReminders are off. Log anything you like while you’re away; nothing is required. Those days stay blank and don’t count against you.`);
}
export async function endAway(env, ctx, td, quiet) {
  const r = awayOn(ctx, td) || awayRanges(ctx).find(x => !x.to); if (!r) return false;
  const y = addDays(td, -1);
  const ranges = awayRanges(ctx).filter(x => x !== r);
  if (r.from <= y) ranges.push({ ...r, to: y });
  ranges.sort((a, b) => a.from < b.from ? -1 : 1);
  await putConfig(env, 'away', { ranges }); ctx.config.away = { ranges };
  if (!quiet) await send(env, '👋 <b>Back.</b> Reminders are on again.' + welcomeTail(ctx, td));
  return true;
}
function welcomeTail(ctx, td) {
  const wl = weighins(ctx.days).filter(x => x.w && x.date < td), last = wl[wl.length - 1];
  if (!last) return '';
  const avg = rollAvg(wl, last.date, 'w');
  return `\nTargets carry on from your last weigh-in (${fmt(avg, 1)} kg, ${dLong(last.date)}). Weigh in on your next Mon, Wed or Fri morning. After a holiday expect 0.5–1.5 kg extra, mostly water and glycogen from more carbs and salt. It settles in 3–5 days, so don’t react to the first reading.`;
}
/* Called before a message is handled: if this is the first data after 3+ empty days, note the gap once. */
export async function welcomeBack(env, ctx, td) {
  if (hasData(ctx.days.find(d => d.date === td))) return;
  const last = lastDataBefore(ctx, td); if (!last) return;
  const gap = diffDays(last, td) - 1; if (gap < 3) return;
  const k = 'gap:' + last; if (await getKV(env, k)) return; await setKV(env, k, 1);
  const wasAway = await endAway(env, ctx, td, true);
  await send(env, `👋 <b>Welcome back.</b> ${gap} days with no data (${dLong(addDays(last, 1))} to ${dLong(addDays(td, -1))}).${wasAway ? ' Away mode is off.' : ''} Nothing to fix: those days stay blank and don’t count towards averages or the 4-week check.${welcomeTail(ctx, td)}`);
}
/* Reminders call this instead of sending when quiet: one heads-up per gap, then silence. */
export async function quietNote(env, q) {
  if (q.why !== 'gap') return;
  const k = 'quiet:' + q.last; if (await getKV(env, k)) return; await setKV(env, k, 1);
  await send(env, '🔕 Nothing logged for 2 days, so I’ll stop reminding you. Send anything to pick up again. Going away? /away tells me up front.');
}
export function parseAwayArgs(td, args) {
  const a = args.join(' ').trim();
  if (!a) return { from: td, to: null };
  if (/^\d{1,3}$/.test(a)) return { from: td, to: addDays(td, Math.max(1, +a) - 1) };
  const ds = a.match(/\d{4}-\d{2}-\d{2}/g);
  if (ds?.length === 1) return { from: td, to: ds[0] };
  if (ds?.length >= 2) return { from: ds[0], to: ds[1] };
  return null;   // natural language → let Claude parse it
}

/* ============================================================ voice notes
   Telegram voice notes are OGG/Opus. Workers AI Whisper (large-v3-turbo) takes base64 audio and returns text.
   About $0.0005 per minute of audio, inside Cloudflare's free daily Workers AI allowance.
   If the turbo model rejects the file, fall back to the original Whisper, which takes a byte array. */
const VOICE_PROMPT = 'Food log, gym sets and weigh-ins in British English. Grams, kcal, protein, RPE, reps, kg. Heinz, Tesco, Fit Profile, David Lloyd.';
async function runAI(env, model, input) {
  if (env.AI_API) { const r = await fetch(env.AI_API + '/ai/' + model, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...input, audio: typeof input.audio === 'string' ? input.audio.slice(0, 40) : input.audio.length }) }); if (!r.ok) throw new Error('AI ' + r.status); return r.json(); }
  if (!env.AI) throw new Error('voice notes need the Workers AI binding ([ai] in wrangler.toml)');
  return env.AI.run(model, input);
}
export async function transcribe(env, fileId) {
  const f = await tg(env, 'getFile', { file_id: fileId });
  if (!f.ok) throw new Error('Couldn’t download the voice note from Telegram');
  const base = env.TELEGRAM_API || 'https://api.telegram.org';
  const buf = await (await fetch(`${base}/file/bot${env.TELEGRAM_TOKEN}/${f.result.file_path}`)).arrayBuffer();
  let out, first;
  try { out = await runAI(env, '@cf/openai/whisper-large-v3-turbo', { audio: b64(buf), language: 'en', vad_filter: true, initial_prompt: VOICE_PROMPT }); }
  catch (e) { first = e; }
  if (!out) {
    try { out = await runAI(env, '@cf/openai/whisper', { audio: [...new Uint8Array(buf)] }); }
    catch (e) { console.error('whisper', first, e); throw new Error('I couldn’t transcribe that voice note. For now, use the 🎤 key on the iPhone keyboard: it turns speech into text before sending'); }
  }
  return String(out?.text || out?.transcription_info?.text || '').trim();
}
