/* Health DB · close.js
   "How much chilli and white rice closes the day?" (13 Nov 2026). The first version answered with chilli alone
   and ignored the rice. Sam wants the answer a person would give:
     1. the combination he'd actually eat, at the ratio he has eaten those two foods together before;
     2. the single food on its own, and with less or more of the second, each with where it leaves the day;
     3. closers: the small things he bridges a gap with (a protein shake, a tin of tuna or sardines, Greek
        yoghurt and a banana, digestives and cheese), picked to fit whatever is left.
   All arithmetic is here, not in the model, so every figure can be re-derived from the log and the library. */
import { esc, fmt, r1, today, dLong, addDays, normName } from './util.js';
import { dayTotals, targets } from './model.js';
import { unitOf, findItem, roundQ, howMuch } from './food.js';

const plain = n => String(n || '').replace(/\s*\(.*?\)/g, '').split(',')[0].trim();
const keyOf = it => it.lib ? 'lib:' + it.lib : 'n:' + normName(plain(it.n));
function keyOfU(ctx, U) {
  if (U.item.libId) return 'lib:' + U.item.libId;
  const ref = U.item.ref && findItem(ctx, U.item.ref);
  return ref ? keyOf(ref) : 'n:' + normName(plain(U.name));
}
const label = (f, U) => (f?.said || plain(U.name)).replace(/^./, c => c.toLowerCase());

/* The ratio of B to A (each in its own unit) on the days Sam ate both, most recent six, median. */
export function usualRatio(ctx, A, B, at = today()) {
  const ka = keyOfU(ctx, A), kb = keyOfU(ctx, B), from = addDays(at, -120), seen = [];
  for (const d of [...ctx.days].filter(x => x.date >= from && x.date <= at).sort((a, b) => a.date < b.date ? 1 : -1)) {
    let qa = 0, qb = 0;
    for (const it of (d.items || [])) { if (keyOf(it) === ka && it.u === A.u) qa += +it.q || 0; else if (keyOf(it) === kb && it.u === B.u) qb += +it.q || 0; }
    if (qa > 0 && qb > 0) seen.push({ date: d.date, qa, qb, r: qb / qa });
    if (seen.length >= 6) break;
  }
  if (!seen.length) return null;
  const rs = seen.map(s => s.r).sort((a, b) => a - b), r = rs[Math.floor(rs.length / 2)];
  return { r, ex: seen[0], n: seen.length };
}

/* Things Sam keeps in and reaches for to finish a day. Each closer only shows when its foods are in the library. */
const STAPLES = [
  ['Standard protein shake', 'Shake', [[/protein shake/, 1]]],
  ['A tin of tuna', 'Tuna', [[/^tuna/, 'd']]],
  ['A tin of sardines', 'Sardines', [[/sardine/, 'd']]],
  ['Greek yoghurt and a banana', 'Yoghurt', [[/greek.*yog/, 150], [/^banana$/, 1]]],
  ['A banana', 'Banana', [[/^banana$/, 1]]],
  ['2 digestives and 20 g cheddar', 'Digestives', [[/digestive/, 2], [/cheddar/, 20]]],
  ['For Goodness Shakes', 'FGS', [[/for goodness/, 1]]]
];
const libFind = (ctx, re) => ctx.library.find(l => re.test(l.n.toLowerCase()) || (l.al || []).some(a => re.test(String(a).toLowerCase())));
export function closers(ctx, at = today(), skip = new Set()) {
  const out = [];
  for (const [name, short, parts] of STAPLES) {
    const items = parts.map(([re, q]) => { const l = libFind(ctx, re); return l && { libId: l.id, name: l.n, qty: q === 'd' ? (l.d || l.q) : q, unit: l.u, m: l.m.map(v => v * (q === 'd' ? (l.d || l.q) : q) / l.q) }; });
    if (items.some(x => !x) || items.some(x => skip.has('lib:' + x.libId))) continue;
    out.push({ name, short, items, kcal: items.reduce((a, x) => a + x.m[0], 0), p: items.reduce((a, x) => a + x.m[1], 0) });
  }
  // and whatever he has finished a day with at least twice in the last 60 days
  const last = new Map();
  for (const d of ctx.days.filter(x => x.date >= addDays(at, -60) && x.date < at)) {
    const it = (d.items || []).filter(i => +i.kcal > 0).slice(-1)[0]; if (!it) continue;
    const k = keyOf(it), e = last.get(k) || { it, n: 0 }; e.n++; last.set(k, e);
  }
  for (const [k, e] of last) {
    if (e.n < 2 || skip.has(k) || out.some(c => c.items.length === 1 && keyOf({ lib: c.items[0].libId }) === k)) continue;
    const it = e.it; out.push({ name: `${plain(it.n)} (${fmt(it.q)}${it.u === 'serving' ? '×' : ' ' + it.u})`, short: plain(it.n).slice(0, 14), items: [{ ...(it.lib ? { libId: it.lib } : { ref: it.id }), name: it.n, qty: it.q, unit: it.u, m: [it.kcal, it.p, it.c, it.f] }], kcal: +it.kcal, p: +it.p, learned: e.n });
  }
  return out;
}
/* The closers that fit a gap: protein short → most protein per kcal that doesn't overshoot calories much;
   protein done → closest to the calories left. */
export function pickClosers(list, kl, pl, n = 4) {
  if (pl > 8) return list.filter(c => c.kcal <= kl + 120).sort((a, b) => b.p / b.kcal - a.p / a.kcal).slice(0, n);
  return list.filter(c => c.kcal <= kl + 80).sort((a, b) => Math.abs(kl - a.kcal) - Math.abs(kl - b.kcal)).slice(0, n);
}

/* How much of A (per unit kA kcal, pA protein) closes the day: the protein left or the calories left, whichever
   runs out first; aim narrows it to one. */
const fit = (k, p, kl, pl, aim) => { const qK = kl > 0 && k > 0 ? kl / k : 0, qP = pl > 0 && p > 0 ? pl / p : Infinity; return aim === 'protein' ? (isFinite(qP) ? qP : 0) : aim === 'kcal' ? qK : Math.min(qK, qP); };

export function closeDay(ctx, hm, date = today()) {
  const foods = (hm.foods && hm.foods.length ? hm.foods : [hm.food]).filter(Boolean).slice(0, 2);
  if (foods.length < 2) return { single: true };
  const [A, B] = foods.map(f => unitOf(ctx, f));
  if (!A || !B) return { why: 'I couldn’t tell which foods you meant. Name them, or say which day you logged them.' };
  const T = targets(ctx, date); if (!T.ok) return { why: 'I don’t have your targets yet (they need a weigh-in, height and date of birth).' };
  const t = dayTotals(ctx.days.find(d => d.date === date)) || { kcal: 0, p: 0 }, kl = T.kcal - (t.kcal || 0), pl = T.protein - (t.p || 0);
  if (kl <= 0) return { single: true };
  const aim = ['protein', 'kcal'].includes(hm.aim) ? hm.aim : 'close';
  const per = U => [U.m[0] / U.q, U.m[1] / U.q, U.m[2] / U.q, U.m[3] / U.q], a = per(A), b = per(B);
  const U2 = usualRatio(ctx, A, B, date), r = U2 ? U2.r : (+foods[1].typical > 0 && +foods[0].typical > 0 ? foods[1].typical / foods[0].typical : 0.5);
  const opt = (qa, qb, tag) => { qa = roundQ(Math.max(0, qa), A.u); qb = roundQ(Math.max(0, qb), B.u); const add = [0, 1, 2, 3].map(i => qa * a[i] + qb * b[i]); return { qa, qb, add, tag, nk: (t.kcal || 0) + add[0], np: (t.p || 0) + add[1] }; };
  const atRatio = (rr, tag) => { const q = fit(a[0] + rr * b[0], a[1] + rr * b[1], kl, pl, aim); return opt(q, q * rr, tag); };
  // 1: both targets met exactly, if that needs a ratio within half to double his usual one; else his usual ratio
  let best = null;
  const det = a[0] * b[1] - a[1] * b[0];
  if (aim === 'close' && pl > 0 && Math.abs(det) > 1e-9) {
    const qa = (kl * b[1] - pl * b[0]) / det, qb = (a[0] * pl - a[1] * kl) / det;
    if (qa > 0 && qb > 0 && qb / qa >= r * 0.5 && qb / qa <= r * 2) best = opt(qa, qb, 'both');
  }
  best = best || atRatio(r, 'usual');
  const alone = opt(fit(a[0], a[1], kl, pl, aim), 0, 'alone');
  const less = atRatio(r * 0.5, 'less'), more = atRatio(r * 1.75, 'more');
  const opts = [best];
  for (const o of [alone, less, more]) if (o.qa > 0 && !opts.some(x => Math.abs(x.qa - o.qa) < 20 && Math.abs(x.qb - o.qb) < 20)) opts.push(o);
  const list = closers(ctx, date, new Set([keyOfU(ctx, A), keyOfU(ctx, B)]));
  return { A, B, fa: foods[0], fb: foods[1], T, t, kl, pl, aim, r, U2, opts, closers: pickClosers(list, kl, pl), all: list };
}

const amt = (q, u) => u === 'serving' ? fmt(q, q % 1 ? 1 : 0) + '×' : fmt(q) + ' ' + u;
const lands = (o, T) => `→ <b>${fmt(o.nk)}</b> / ${fmt(T.kcal)} kcal · <b>${fmt(o.np)}</b> / ${T.protein} g`;
const NUM = ['1️⃣', '2️⃣', '3️⃣', '4️⃣'];
/* After the main food alone: what's still open, and the closer that best fills it. */
function gapNote(o, T, list) {
  const gk = T.kcal - o.nk, gp = T.protein - o.np;
  if (gp > 3 && gk > 60) { const c = pickClosers(list, gk, gp, 1)[0]; return ` ${fmt(gp)} g protein short${c ? `: ${esc(c.name.toLowerCase())} (+${fmt(c.kcal)} kcal, +${fmt(c.p, 1)} g) closes it` : ''}.`; }
  if (gp > 3) return ` Calories run out first: still ${fmt(gp)} g protein short.`;
  if (gk > 80) { const c = pickClosers(list, gk, 0, 1)[0]; return ` Protein done, ${fmt(gk)} kcal left${c ? `: ${esc(c.name.toLowerCase())} (+${fmt(c.kcal)} kcal) fills it` : ''}.`; }
  return '';
}
export function closeHtml(h, date = today()) {
  if (h.why) return esc(h.why);
  const { A, B, fa, fb, T, kl, pl, opts, U2, closers: cl, all } = h, na = label(fa, A), nb = label(fb, B);
  const head = `🍽 <b>Closing ${date === today() ? 'today' : dLong(date)}</b>: ${fmt(kl)} kcal · ${fmt(Math.max(0, pl))} g protein left`;
  const usual = U2 ? `your usual is ${amt(U2.ex.qa, A.u)} ${esc(na)} to ${amt(U2.ex.qb, B.u)} ${esc(nb)} (${dLong(U2.ex.date)}${U2.n > 1 ? `, ${U2.n} meals` : ''})` : `no past meal with both, so about ${fmt(h.r * 100)} ${B.u === A.u ? A.u : B.u} ${esc(nb)} per 100 ${A.u} ${esc(na)}`;
  const line = (o, i) => {
    const what = o.qb > 0 ? `${amt(o.qa, A.u)} ${esc(na)} + ${amt(o.qb, B.u)} ${esc(nb)}` : `${esc(na)} only, ${amt(o.qa, A.u)}`;
    const why = o.tag === 'both' ? 'closes calories and protein' : o.tag === 'usual' ? 'at your usual ratio' : o.tag === 'less' ? `less ${esc(nb)}` : o.tag === 'more' ? `more ${esc(nb)}` : '';
    return `${NUM[i]} <b>${what.replace(/^./, ch => ch.toUpperCase())}</b>${why ? ` <i>(${why})</i>` : ''}\n+${fmt(o.add[0])} kcal · +${fmt(o.add[1], 1)} g ${lands(o, T)}${o.tag === 'alone' ? '.' + gapNote(o, T, all) : ''}`;
  };
  let s = `${head}\n\n${opts.map(line).join('\n\n')}\n<i>Ratio: ${usual}.</i>`;
  if (cl.length) s += `\n\n<b>Or bridge it with a closer</b>\n${cl.map(c => `• ${esc(c.name)}: ${fmt(c.kcal)} kcal · ${fmt(c.p, 1)} g${c.learned ? ` <i>(ended ${c.learned} days)</i>` : ''}`).join('\n')}`;
  if (!A.known || !B.known) s += `\n<i>Using my estimate for ${esc(!A.known ? na : nb)}.</i>`;
  return s;
}
/* The single-food answer (food.js) plus the closers that fit what that food leaves. */
export function singleExtras(ctx, h, date = today()) {
  if (h.why || !(h.q > 0)) return { html: '', closers: [] };
  const list = closers(ctx, date, new Set([keyOfU(ctx, h.U)])), nk = (h.t.kcal || 0) + h.add[0], np = (h.t.p || 0) + h.add[1];
  const gk = h.T.kcal - nk, gp = h.T.protein - np, cl = pickClosers(list, Math.max(gk, 0), Math.max(gp, 0), 3).filter(() => gk > 60 || gp > 3);
  return { closers: cl, html: cl.length ? `\n\n<b>To finish the day after it</b> (${fmt(Math.max(0, gk))} kcal · ${fmt(Math.max(0, gp))} g left)\n${cl.map(c => `• ${esc(c.name)}: ${fmt(c.kcal)} kcal · ${fmt(c.p, 1)} g`).join('\n')}` : '' };
}
export { howMuch };
