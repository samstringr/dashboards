/* Health DB · edit.js: a day's summary in Telegram, and taking things back out of it.

   27 Nov 2026, Sam: "I'd like to ask it to remove stuff… instead of having to go into the dashboard… asking for a
   summary of the day would also be cool… an option to edit after asking for a summary, or when I ask to remove, it
   gives me everything, and then I can choose what to remove."

   One message does both jobs, edited in place rather than sending new ones:
   - VIEW: the day's totals against target, every food and session, ◀ ▶ to step through days, ✏️ Edit.
   - EDIT: one ✕ button per food and per session, Done to go back. A tap removes it at once and the card redraws
     with "Removed: …" and a ↩ Put back button, so a mis-tap costs one more tap, not a trip to the dashboard.
   - "remove the chocolate from Wednesday": one clear match is removed straight away, shown on the EDIT card with
     Put back. No match, or several equally good, opens the EDIT card for that day so he picks.
   WHY in place: a chat that fills with a new card per tap is harder to read than one card that changes. WHY no
   "are you sure?": everything else in the bot logs first and offers Undo; removing works the same way. */
import { esc, fmt, r1, clamp, uid, today, addDays, dLong, normName } from './util.js';
import { getDay, mutateDay, getKV, setKV } from './store.js';
import { dayTotals, targets, loadCtx } from './model.js';
import { tg, chatId, send, qtyTxt, remainingLine } from './bot.js';

const bar = (v, of) => { const n = clamp(Math.round(v / of * 10), 0, 10); return '▓'.repeat(n) + '░'.repeat(10 - n); };
const kb = rows => ({ inline_keyboard: rows.filter(r => r.length).map(r => r.map(([text, data]) => ({ text, callback_data: data }))) });
// an item or session without an id (old imports) is addressed by its place in the list, prefixed with #
const key = (x, i) => x.id ? String(x.id) : '#' + i;
const find = (list, k) => (list || []).findIndex((x, i) => key(x, i) === k);
const sessLine = w => (w.label || w.kind || 'Session') + (+w.min ? ` · ${fmt(w.min)} min` : '') + (w.ex?.length ? ` · ${w.ex.length} lift${w.ex.length === 1 ? '' : 's'}` : '');
const short = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

export function dayCardHtml(ctx, d, date, note, left = '') {
  const t = dayTotals(d), T = targets(ctx, date), items = d?.items || [], ws = d?.workouts || [];
  let h = `📅 <b>${dLong(date)}</b>${date === today() ? ' · today' : ''}`;
  if (note) h += `\n${note}`;
  if (t && t.kcal != null && T.ok) h += `\nProtein <b>${fmt(t.p)}</b> / ${T.protein} g <code>${bar(t.p, T.protein)}</code>\nCalories <b>${fmt(t.kcal)}</b> / ${fmt(T.kcal)} <code>${bar(t.kcal, T.kcal)}</code>\nCarbs ${fmt(t.c)} g · Fat ${fmt(t.f)} g` + left;
  else if (t && t.kcal != null) h += `\n<b>${fmt(t.kcal)}</b> kcal · <b>${fmt(t.p)}</b> g protein`;
  else if (T.ok) h += `\nTargets: ${fmt(T.kcal)} kcal · ${T.protein} g protein`;
  h += items.length ? '\n\n<b>Food</b>\n' + items.map(i => `• ${esc(i.n)} <i>${esc(qtyTxt(i))}</i>${i.est ? '*' : ''} — ${fmt(i.kcal)} kcal · ${fmt(i.p, 1)} P`).join('\n') : '\n\nNo food logged.';
  if (ws.length) h += '\n\n<b>Sessions</b>\n' + ws.map(w => '• ' + esc(sessLine(w))).join('\n');
  if (d?.steps) h += `\n\n${fmt(d.steps)} steps${d.stepsAt === date ? ' so far' : ''}`;
  return h.slice(0, 3900);
}
export function dayCardMarkup(d, date, mode, undoToken) {
  if (mode === 'edit') {
    const rows = [];
    (d?.items || []).forEach((i, n) => {
      rows.push([[`✕ ${short(i.n, 34)}${i.u === 'serving' && +i.q ? ' ×' + fmt(i.q, i.q % 1 ? 1 : 0) : ''} · ${fmt(i.kcal)}`, `rf:${date}:${key(i, n)}`]]);
      // counted items (27 Nov 2026, Sam: "items where I've added more than one… plus minus them"): one more or one fewer
      if (i.u === 'serving' && +i.q >= 1) rows.push([...(+i.q >= 2 ? [[`➖ to ×${fmt(+i.q - 1, i.q % 1 ? 1 : 0)}`, `qm:${date}:${key(i, n)}`]] : []), [`➕ to ×${fmt(+i.q + 1, i.q % 1 ? 1 : 0)}`, `qp:${date}:${key(i, n)}`]]);
    });
    (d?.workouts || []).forEach((w, n) => rows.push([[`✕ ${short(w.label || w.kind, 34)}${+w.min ? ' · ' + fmt(w.min) + '′' : ''}`, `rw:${date}:${key(w, n)}`]]));
    return kb([...rows, [...(undoToken ? [['↩ Put back', `pb:${undoToken}`]] : []), ['✓ Done', `dv:${date}`]]]);
  }
  const td = today();
  return kb([[['◀', `dv:${addDays(date, -1)}`], ['✏️ Edit', `de:${date}`], ...(date < td ? [['▶', `dv:${addDays(date, 1)}`]] : [])]]);
}
// a new card (from /today, "summary of Wednesday" or "remove…")
// today also gets the bot's usual "Left: X g protein in Y kcal" line and protein tip (what /today showed before)
const leftLine = async (env, ctx, date) => date === today() ? (await remainingLine(env, ctx, date)).replace(/^\n\n[^\n]*\n?/, '\n') : '';
export async function sendDayCard(env, date, mode = 'view', note = '', undoToken = null) {
  const ctx = await loadCtx(env), d = await getDay(env, date);
  return send(env, dayCardHtml(ctx, d, date, note, await leftLine(env, ctx, date)), { reply_markup: dayCardMarkup(d, date, mode, undoToken) });
}
// redraw the card a button was pressed on
async function redraw(env, messageId, date, mode, note = '', undoToken = null) {
  const ctx = await loadCtx(env), d = await getDay(env, date);
  return tg(env, 'editMessageText', { chat_id: chatId(env), message_id: messageId, text: dayCardHtml(ctx, d, date, note, await leftLine(env, ctx, date)), parse_mode: 'HTML', link_preview_options: { is_disabled: true }, reply_markup: dayCardMarkup(d, date, mode, undoToken) });
}
// take one food (f) or session (w) out of a day; kept under 'removed' (and as the /undo target) so it can go back
async function removeOne(env, date, kind, k) {
  let gone = null;
  await mutateDay(env, date, d => {
    const list = kind === 'f' ? (d.items = d.items || []) : (d.workouts = d.workouts || []), i = find(list, k);
    if (i >= 0) gone = list.splice(i, 1)[0];
  });
  if (!gone) return null;
  const token = uid().slice(-6);
  await setKV(env, 'removed', { token, date, kind, x: gone });
  await setKV(env, 'last', { kind: 'removed', token, date, what: kind, x: gone });
  const label = kind === 'f' ? `${gone.n} (${fmt(gone.kcal)} kcal)` : sessLine(gone);
  return { token, label };
}
export async function putBack(env, token) {
  const r = await getKV(env, 'removed');
  if (!r || r.token !== token) return null;
  await mutateDay(env, r.date, d => { if (r.kind === 'f') (d.items = d.items || []).push(r.x); else (d.workouts = d.workouts || []).push(r.x); });
  await setKV(env, 'removed', null);
  return r;
}
/* One more or one fewer of a counted item: kcal and macros scale with the count (2 flatbreads at 490 → 1 at 245), so
   it stays the same food at the same per-piece numbers. */
async function stepQty(env, date, k, by) {
  let out = null;
  await mutateDay(env, date, d => {
    const it = (d.items || [])[find(d.items, k)];
    if (!it || it.u !== 'serving' || !(+it.q > 0)) return;
    const q0 = +it.q, q1 = Math.round((q0 + by) * 10) / 10;
    if (q1 < 1) return;
    const f = q1 / q0;
    for (const m of ['kcal', 'p', 'c', 'f']) if (it[m] != null) it[m] = r1(+it[m] * f);
    it.q = q1;
    out = { n: it.n, q0, q1, dk: it.kcal - it.kcal / f };
  });
  return out;
}
// callbacks: dv view, de edit, rf/rw remove food/session, qm/qp one fewer/more, pb put back. Returns false if the action isn't ours.
export async function onEditCallback(env, cq, act, rest) {
  const mid = cq.message?.message_id;
  if (act === 'dv' || act === 'de') { const date = rest[0]; if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today()) return true; await redraw(env, mid, date, act === 'de' ? 'edit' : 'view'); return true; }
  if (act === 'rf' || act === 'rw') {
    const [date, k] = [rest[0], rest.slice(1).join(':')];
    const r = await removeOne(env, date, act[1], k);
    await redraw(env, mid, date, 'edit', r ? `🗑 Removed: <b>${esc(r.label)}</b>` : 'That was already gone.', r?.token);
    return true;
  }
  if (act === 'qm' || act === 'qp') {
    const [date, k] = [rest[0], rest.slice(1).join(':')];
    const r = await stepQty(env, date, k, act === 'qp' ? 1 : -1);
    await redraw(env, mid, date, 'edit', r ? `✏️ <b>${esc(r.n)}</b>: ×${fmt(r.q0, r.q0 % 1 ? 1 : 0)} → ×${fmt(r.q1, r.q1 % 1 ? 1 : 0)} (${r.dk > 0 ? '+' : '−'}${fmt(Math.abs(r.dk))} kcal)` : 'That can’t go lower: use ✕ to remove it.');
    return true;
  }
  if (act === 'pb') {
    const r = await putBack(env, rest[0]);
    if (!r) { await send(env, 'Nothing to put back, or it’s already back.'); return true; }
    await redraw(env, mid, r.date, 'edit', `↩ Put back: <b>${esc(r.kind === 'f' ? r.x.n : sessLine(r.x))}</b>`);
    return true;
  }
  return false;
}
/* "remove the chocolate from Wednesday": score each food and session on that day by the words they share with what he
   said (whole words count, a word inside a longer one counts half, e.g. "choc" in "chocolate"). Remove only a clear
   winner; otherwise show the EDIT card. */
const words = s => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 1 && !STOP.has(w));
const STOP = new Set(['the', 'and', 'of', 'my', 'a', 'an', 'from', 'on', 'in', 'with', 'to', 'some', 'that', 'this', 'one', 'item', 'entry']);
export function matchScore(said, name) {
  const a = words(said), b = words(name);
  if (!a.length || !b.length) return 0;
  let s = 0;
  for (const w of a) s += b.includes(w) ? 1 : b.some(x => x.startsWith(w) || w.startsWith(x)) && Math.min(w.length, 4) >= 4 ? .5 : 0;
  return s / a.length;
}
export async function removeByWords(env, date, what) {
  const d = await getDay(env, date);
  const all = [...(d?.items || []).map((x, i) => ({ kind: 'f', k: key(x, i), s: matchScore(what, x.n) })), ...(d?.workouts || []).map((x, i) => ({ kind: 'w', k: key(x, i), s: matchScore(what, [x.label, x.kind, x.note].join(' ')) }))].sort((p, q) => q.s - p.s);
  if (!what || !all.length || all[0].s < .5 || (all[1] && all[1].s === all[0].s))
    return sendDayCard(env, date, 'edit', !all.length ? 'Nothing logged that day.' : what ? `Which one? Nothing clearly matched “${esc(what)}”: tap ✕ on it.` : 'Tap ✕ on anything to remove it.');
  const r = await removeOne(env, date, all[0].kind, all[0].k);
  return sendDayCard(env, date, 'edit', `🗑 Removed: <b>${esc(r.label)}</b>`, r.token);
}
