/* Health DB · model.js */
import { fmt, mean, today, diffDays, normName } from './util.js';
import { allDays, allConfig } from './store.js';

/* ============================================================ the same maths as the dashboard */
export function dayTotals(d) {
  if (!d) return null;
  const items = Array.isArray(d.items) ? d.items : [];
  if (items.length) {
    const t = items.reduce((a, x) => ({ kcal: a.kcal + (+x.kcal || 0), p: a.p + (+x.p || 0), c: a.c + (+x.c || 0), f: a.f + (+x.f || 0) }), { kcal: 0, p: 0, c: 0, f: 0 });
    return { ...t, src: 'log', partial: !!d.partial, void: false };
  }
  const L = d.legacy;
  if (L && (L.kcal != null || L.conf === 'void')) return { kcal: L.kcal, p: L.p, c: L.c, f: L.f, src: 'legacy', partial: L.conf === 'partial' || !!d.partial, void: L.conf === 'void' };
  return null;
}
export function weighins(days) {
  return days.filter(d => d.body && (d.body.w || d.body.bf)).map(d => ({ date: d.date, ...d.body }));
}
export function rollAvg(list, date, key, span = 7) {
  return mean(list.filter(x => x[key] != null && x.date <= date && diffDays(x.date, date) < span).map(x => +x[key]));
}
export function ageAt(dob, date) {
  const [by, bm, bd] = dob.split('-').map(Number), [y, m, d] = date.split('-').map(Number);
  let a = y - by; if (m < bm || (m === bm && d < bd)) a--; return a;
}
export const PHASES = { recomp: { label: 'Recomp', off: 0 }, gain: { label: 'Lean gain', off: 200 }, cut: { label: 'Cut', off: -300 } };
export function targets(ctx, at = today()) {
  const st = ctx.settings || {}; const wl = weighins(ctx.days).filter(x => x.w && x.date <= at);
  if (!st.height || !st.dob || !wl.length) return { ok: false };
  const last = wl[wl.length - 1], w = rollAvg(wl, last.date, 'w');
  const bmr = 10 * w + 6.25 * st.height - 5 * ageAt(st.dob, at) + (st.sex === 'f' ? -161 : 5);
  const ph = PHASES[st.phase] || PHASES.recomp;
  const kcal = Math.round((bmr * (st.mult || 1.55) + ph.off + (+st.adjust || 0)) / 10) * 10;
  const protein = Math.max(+st.protFloor || 0, Math.round((st.protPerKg || 2.15) * w / 5) * 5);
  return { ok: true, w, kcal, protein, ph, last: last.date };
}
export function allWorkouts(days) {
  const out = []; for (const d of days) for (const w of (d.workouts || [])) out.push({ ...w, date: d.date });
  return out.sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : 0);
}
export function lastPerf(days, name) {
  const k = normName(name);
  for (const w of allWorkouts(days)) for (const e of (w.ex || [])) if (normName(e.n) === k && e.sets?.length) return { date: w.date, sets: e.sets };
  return null;
}
export function setsText(sets) {
  if (!sets?.length) return '';
  const kgs = [...new Set(sets.map(s => s.kg))];
  const k = v => v == null ? 'BW' : fmt(v, v % 1 ? 1 : 0);
  if (kgs.length === 1) return k(kgs[0]) + (kgs[0] == null ? ' × ' : ' kg × ') + sets.map(s => s.r ?? '?').join(', ');
  return sets.map(s => k(s.kg) + '×' + (s.r ?? '?')).join(', ');
}
export function planState(ctx) {
  const P = ctx.plan; if (!P || !P.sessions?.length) return null;
  const codes = P.sessions.map(s => s.code);
  const done = allWorkouts(ctx.days).filter(w => w.planCode && codes.includes(w.planCode) && (!P.start || w.date >= P.start));
  const idx = done[0] ? (codes.indexOf(done[0].planCode) + 1) % codes.length : 0;
  const nextNo = done.length + 1;
  const deload = !!P.deloadEvery && ((nextNo - 1) % P.deloadEvery) >= P.deloadEvery - codes.length;
  return { next: P.sessions[idx], idx, count: done.length, nextNo, deload };
}
export const topOfRange = reps => { const m = String(reps || '').match(/(\d+)\s*[-–]\s*(\d+)/); return m ? +m[2] : null; };
export function libMacros(item, qty) { const k = (+qty || 0) / (item.q || 1); return item.m.map(v => v * k); }
export async function loadCtx(env) {
  const [days, config] = await Promise.all([allDays(env), allConfig(env)]);
  return { days, settings: config.settings || {}, library: config.library?.items || [], plan: config.plan || null, config };
}
