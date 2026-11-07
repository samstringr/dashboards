/* Health DB · food.js
   Turning what Claude read into food items, and the three things built on top of them (7 Nov 2026, Sam's asks):
     • RECENT items: the last week's logged foods, so a repeat ("2 brioche buns" again) or leftovers reuse the
       numbers Sam already confirmed instead of being looked up again. WHY: a lookup is the slow, failure-prone
       step, and re-estimating the same bun twice gives two different answers.
     • presets: "my standard overnight oats are …" saves one serving as a library entry that remembers its parts.
     • how much: "how much of X closes the day?" The arithmetic is done here, not by the model: a figure Sam
       can't re-derive is a figure he can't correct. */
import { esc, r1, fmt, uid, today, addDays, dLong, normName } from './util.js';
import { dayTotals, targets, libMacros } from './model.js';

/* ---------- recent items ---------- */
export function recentItems(ctx, days = 7, at = today()) {
  const from = addDays(at, -(days - 1)), seen = new Set(), out = [];
  const ds = ctx.days.filter(d => d.date >= from && d.date <= at).sort((a, b) => a.date < b.date ? 1 : -1);
  for (const d of ds) for (const it of [...(d.items || [])].reverse()) {
    if (it.lib || !it.id || !(+it.q > 0)) continue;              // library foods are already in LIBRARY
    const k = normName(it.n); if (!k || seen.has(k)) continue;
    seen.add(k); out.push({ ...it, date: d.date });
    if (out.length >= 50) return out;
  }
  return out;
}
export function recentBlock(ctx) {
  return recentItems(ctx).map(x => `${x.id} | ${dLong(x.date)} | ${x.n} | ${r1(x.q)} ${x.u} | ${Math.round(x.kcal)} ${r1(x.p)} ${r1(x.c)} ${r1(x.f)}`).join('\n') || '(none)';
}
export function findItem(ctx, id) {
  if (!id) return null;
  for (const d of ctx.days) for (const it of (d.items || [])) if (it.id === id) return { ...it, date: d.date };
  return null;
}
export const aliasesOf = x => Array.isArray(x.al) ? x.al : [];

/* ---------- items ---------- */
/* Library items get the library's macros; RECENT items (ref) are rescaled from what was logged; anything else
   keeps Claude's estimate and is marked est. */
export function normaliseItems(ctx, items) {
  return (items || []).map(x => {
    const lib = x.libId && ctx.library.find(l => l.id === x.libId);
    const ref = !lib && findItem(ctx, x.ref);
    let qty = +x.qty || (lib ? lib.d || lib.q : ref ? ref.q : 1), unit = x.unit || (lib ? lib.u : ref ? ref.u : 'serving');
    let m = [x.kcal, x.p, x.c, x.f].map(v => +v || 0), name = x.name;
    if (lib) { if (unit !== lib.u && lib.u === 'serving') unit = 'serving'; m = libMacros(lib, qty); name = lib.n; }
    const useRef = ref && +ref.q > 0 && unit === ref.u;
    if (useRef) { const k = qty / ref.q; m = [ref.kcal, ref.p, ref.c, ref.f].map(v => (+v || 0) * k); name = ref.n; }
    return { id: uid(), t: new Date().toISOString(), n: String(name || 'Food').slice(0, 120), q: r1(qty), u: lib ? lib.u : unit,
      kcal: Math.round(m[0]), p: r1(m[1]), c: r1(m[2]), f: r1(m[3]),
      ...(lib ? { lib: lib.id } : useRef ? { ref: ref.id, ...(ref.est ? { est: true } : {}) } : { est: true }), src: 'telegram' };
  });
}
/* Logged without asking only when every number is already known: a library food, or a repeat of something
   Sam has confirmed before. A fresh estimate is always shown first. */
export const allKnown = items => items.length > 0 && items.every(i => i.lib || i.ref);
export const sumItems = items => items.reduce((a, i) => [a[0] + i.kcal, a[1] + i.p, a[2] + i.c, a[3] + i.f], [0, 0, 0, 0]);

/* ---------- presets ---------- */
export function presetTarget(ctx, pr) {
  const byId = pr.replaces && ctx.library.find(l => l.id === pr.replaces);
  if (byId) return byId;
  const k = normName(pr.name);
  return ctx.library.find(l => normName(l.n) === k || aliasesOf(l).some(a => normName(a) === k)) || null;
}
export function presetEntry(ctx, pr, parts) {
  const servings = Math.max(1, +pr.servings || 1), t = sumItems(parts).map(v => r1(v / servings));
  const old = presetTarget(ctx, pr), date = today();
  const al = [...new Set([...(old ? aliasesOf(old) : []), ...(pr.aliases || []), ...(old && normName(old.n) !== normName(pr.name) ? [pr.name] : [])]
    .map(a => String(a).trim()).filter(a => a && normName(a) !== normName(old ? old.n : pr.name)))].slice(0, 8);
  const entry = { ...(old || {}), id: old ? old.id : 'p-' + normName(pr.name).slice(0, 24) + '-' + uid().slice(-4), n: old ? old.n : String(pr.name).slice(0, 80),
    q: 1, u: 'serving', d: 1, m: [Math.round(t[0]), t[1], t[2], t[3]], al, servings,
    parts: parts.map(i => ({ n: i.n, q: i.q, u: i.u, kcal: i.kcal, p: i.p, c: i.c, f: i.f, ...(i.lib ? { lib: i.lib } : {}) })),
    custom: true, v: false, note: `Preset saved from Telegram ${date}: ${parts.map(i => i.n + ' ' + i.q + (i.u === 'serving' ? '×' : ' ' + i.u)).join(', ')}${servings > 1 ? ` (makes ${servings} servings)` : ''}` };
  return { entry, old };
}
export function savePreset(ctx, entry) {
  const lib = ctx.library.slice(), i = lib.findIndex(l => l.id === entry.id);
  if (i >= 0) lib[i] = entry; else lib.push(entry);
  return { items: lib };
}
export function foodsHtml(ctx) {
  const pre = ctx.library.filter(l => l.parts || l.custom);
  if (!pre.length) return 'No presets or saved foods yet. Send “my standard overnight oats are 100 g oats, 40 g protein powder, …” to make one.';
  const line = l => `• <b>${esc(l.n)}</b> · ${fmt(l.m[0])} kcal · ${fmt(l.m[1], 1)} g protein per ${l.u === 'serving' ? 'serving' : fmt(l.q) + ' ' + l.u}${aliasesOf(l).length ? ` <i>(also: ${aliasesOf(l).map(esc).join(', ')})</i>` : ''}`;
  return `<b>Your presets and saved foods</b>\n${pre.slice(-40).map(line).join('\n')}\n\nSend the name to log one, e.g. “${esc((pre.find(l => l.parts) || pre[0]).n.toLowerCase())}” or “half of it”.`;
}

/* ---------- how much of X closes the day ---------- */
export function unitOf(ctx, food) {
  const lib = food?.libId && ctx.library.find(l => l.id === food.libId);
  if (lib) return { name: lib.n, u: lib.u, q: lib.q, m: lib.m.map(Number), item: { libId: lib.id }, known: true };
  const ref = findItem(ctx, food?.ref);
  if (ref && +ref.q > 0) return { name: ref.n, u: ref.u, q: +ref.q, m: [ref.kcal, ref.p, ref.c, ref.f].map(v => +v || 0), item: { ref: ref.id }, known: true, date: ref.date };
  const p = food?.per;
  if (p && +p.qty > 0 && +p.kcal > 0) return { name: food.name || 'it', u: p.unit || 'g', q: +p.qty, m: [p.kcal, p.p, p.c, p.f].map(v => +v || 0), item: { name: food.name }, known: false };
  return null;
}
const roundQ = (q, u) => u === 'serving' ? Math.round(q * 2) / 2 : q < 100 ? Math.round(q / 5) * 5 : Math.round(q / 10) * 10;
/* Returns everything needed for the reply, or { why } when there's no sensible answer. */
export function howMuch(ctx, hm, date = today()) {
  const U = unitOf(ctx, hm?.food); if (!U) return { why: 'I couldn’t tell which food you meant. Name it, or say which day you logged it.' };
  const T = targets(ctx, date); if (!T.ok) return { why: 'I don’t have your targets yet (they need a weigh-in, height and date of birth).' };
  const t = dayTotals(ctx.days.find(d => d.date === date)) || { kcal: 0, p: 0, c: 0, f: 0 };
  const kl = T.kcal - (t.kcal || 0), pl = T.protein - (t.p || 0);
  const kPer = U.m[0] / U.q, pPer = U.m[1] / U.q;
  const aim = ['protein', 'kcal'].includes(hm.aim) ? hm.aim : 'close';
  const qP = pl > 0 && pPer > 0 ? pl / pPer : 0, qK = kl > 0 && kPer > 0 ? kl / kPer : 0;
  let q, bound;
  if (aim === 'protein') { q = qP; bound = 'protein'; }
  else if (aim === 'kcal') { q = qK; bound = 'kcal'; }
  else if (pl > 0) { q = Math.min(qP, qK); bound = qK < qP ? 'kcal' : 'protein'; }
  else { q = qK; bound = 'kcal'; }
  const have = hm.have && +hm.have.qty > 0 && (hm.have.unit || U.u) === U.u ? +hm.have.qty : null;
  let capped = false; if (have != null && q > have) { q = have; capped = true; }
  q = roundQ(q, U.u);
  return { U, T, t, kl, pl, aim, bound, capped, have, q, add: [q * kPer, q * pPer, q * U.m[2] / U.q, q * U.m[3] / U.q] };
}
export function howMuchHtml(h, date = today()) {
  if (h.why) return esc(h.why);
  const { U, T, t, kl, pl, q, add, bound, capped, aim } = h;
  const qs = U.u === 'serving' ? fmt(q, q % 1 ? 1 : 0) + (q === 1 ? ' serving' : ' servings') : fmt(q) + ' ' + U.u;
  const left = `Left ${date === today() ? 'today' : 'on ' + dLong(date)}: ${fmt(Math.max(0, kl))} kcal · ${fmt(Math.max(0, pl))} g protein`;
  if (q <= 0) return `${left}.\n${kl <= 0 ? `You’re at your calories already (${fmt(t.kcal)} / ${fmt(T.kcal)}), so none.` : 'Nothing needed.'}${pl > 0 && kl <= 0 ? ` Protein is ${fmt(pl)} g short: a lean protein (whey, chicken, tuna) is the way to close it.` : ''}`;
  const nk = (t.kcal || 0) + add[0], np = (t.p || 0) + add[1];
  let s = `🍽 <b>${qs}</b> of ${esc(U.name)}${U.date && U.date !== date ? ` <i>(as logged ${dLong(U.date)})</i>` : ''}${aim === 'protein' ? ' hits your protein' : aim === 'kcal' ? ' uses your calories' : ' closes the day'}\n`
    + `+${fmt(add[0])} kcal · +${fmt(add[1], 1)} g protein → <b>${fmt(nk)}</b> / ${fmt(T.kcal)} kcal · <b>${fmt(np)}</b> / ${T.protein} g protein\n${left}.`;
  if (capped) s += `\nThat’s all you have. ${np < T.protein - 2 ? `Still ${fmt(T.protein - np)} g protein short.` : ''}`;
  else if (aim === 'close' && bound === 'kcal' && np < T.protein - 2) s += `\nCalories run out first: you’d still be ${fmt(T.protein - np)} g protein short, so pair it with something lean.`;
  else if (aim === 'protein' && nk > T.kcal + 20) s += `\nThat takes you ${fmt(nk - T.kcal)} kcal over.`;
  if (!U.known) s += `\n<i>Using my estimate: ${fmt(U.m[0])} kcal · ${fmt(U.m[1], 1)} g protein per ${U.u === 'serving' ? 'serving' : fmt(U.q) + ' ' + U.u}.</i>`;
  return s;
}
