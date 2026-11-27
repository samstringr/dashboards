/* Health DB · model.js */
import { fmt, mean, r1, today, diffDays, normName } from './util.js';
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
/* The last few times a lift was done (newest first), within `within` days of the newest: the coach compares a session
   with these, not with one session (24 Nov 2026, Sam: "base progress off of a number of weeks, not just what I did
   last time"). */
export function recentPerf(days, name, n = 3, within = 42) {
  const k = normName(name), out = [];
  for (const w of allWorkouts(days)) for (const e of (w.ex || [])) {
    if (normName(e.n) !== k || !e.sets?.length) continue;
    if (out.length && diffDays(w.date, out[0].date) > within) return out;
    out.push({ date: w.date, sets: e.sets }); if (out.length >= n) return out;
  }
  return out;
}
/* Rest between sets (24 Nov 2026, Sam: "add a one-liner if rest should be the same throughout the session, or for
   particular exercises"). The plan's own value wins: e.rest in minutes, s.rest the session's line (its first sentence
   is the one-liner, the rest says why). Without one: 3 min when the rep range starts at 6 or fewer (the heavy
   compounds), else 2. WHY 3: 3-minute rests grew more muscle and strength than 1 minute in trained men (Schoenfeld
   et al. 2016). 2 minutes on isolation lifts is common practice, not a tested optimum. Same rule as the dashboard. */
/* Cardio intensity (27 Nov 2026, Sam: "when I log cardio… an average watt value, or… describe its intensity, and then
   you can work out whether that should be considered light or intense cardio, and then count it accordingly towards
   the goal"; he chose one number in the WHO's terms). The WHO counts a vigorous minute as two moderate ones (150 min
   moderate = 75 vigorous), so the target counts EQUIVALENT minutes: light (under 3 METs) shows but doesn't count,
   moderate (3 to 6) counts once, vigorous (6 or more) twice. METs, from the first of these a session has:
   1. watts on a bike (w.watts, or "110 W" in its label or note): ACSM leg cycling, VO2 = 1.8 × (W × 6 kgm/min) ÷ kg + 7;
   2. speed and incline (w.speed_mph, w.incline_pct, or "12% at 3 mph", "Incline 12, 3 mph", "10 km/h", or a run's km ÷ time): ACSM walking
      up to 3.7 mph, VO2 = 0.1 × m/min + 1.8 × m/min × grade + 3.5; running above it, 0.2 and 0.9 in their place;
   3. how it felt (w.effort, read from his words: "easy", "could chat" moderate; "hard", "out of breath" vigorous);
   4. the kind: football and runs vigorous, golf light (2.3–2.6 METs at the range, Wolkodoff 2024), the rest moderate.
   METs = VO2 ÷ 3.5. Estimates, and only without leaning on the rails or the bars. The dashboard has the same rule. */
export function cardioIntensity(w, kg) {
  const txt = [w.label, w.note].join(' '), num = re => { const m = txt.match(re); return m ? parseFloat(m[1]) : null; };
  const watts = +w.watts || (w.kind === 'cycle' || /bike|cycl|spin|watt/i.test(txt) ? num(/(\d{2,4})\s*(?:w|watts?)\b/i) : null);
  let mph = +w.speed_mph || num(/(\d+(?:\.\d+)?)\s*mph\b/i);
  if (!mph) { const k = num(/(\d+(?:\.\d+)?)\s*(?:km\/?h|kph)\b/i); if (k) mph = k / 1.609; }
  if (!mph && ['run', 'walk'].includes(w.kind) && +w.km > 0 && +w.min > 0) mph = w.km / w.min * 60 / 1.609;   // distance and time give the speed
  const grade = w.incline_pct != null ? +w.incline_pct : (num(/(\d+(?:\.\d+)?)\s*%/) ?? num(/incline\s*(\d+(?:\.\d+)?)/i) ?? 0);
  let met = null, basis;
  // (75 kg stands in only until there's a weigh-in)
  if (watts > 0) { met = (1.8 * watts * 6 / (kg || 75) + 7) / 3.5; basis = Math.round(watts) + ' W'; }
  else if (mph > 0) { const v = mph * 26.8, g = grade / 100; met = (mph <= 3.7 ? .1 * v + 1.8 * v * g + 3.5 : .2 * v + .9 * v * g + 3.5) / 3.5; basis = (grade ? r1(grade) + '% at ' : '') + r1(mph) + ' mph'; }
  const kindBand = w.kind === 'golf' ? 'light' : ['football', 'run'].includes(w.kind) ? 'vigorous' : 'moderate';
  const band = met != null ? (met < 3 ? 'light' : met < 6 ? 'moderate' : 'vigorous') : ['light', 'moderate', 'vigorous'].includes(w.effort) ? w.effort : kindBand;
  if (met == null) basis = w.effort ? 'felt ' + w.effort : w.kind === 'golf' ? 'golf' : ['football', 'run'].includes(w.kind) ? w.kind : 'no detail, so moderate';
  const factor = band === 'light' ? 0 : band === 'vigorous' ? 2 : 1;
  return { met: met == null ? null : r1(met), band, basis, factor, eq: (+w.min || 0) * factor };
}
export function restMin(e) { if (+e?.rest > 0) return +e.rest; const m = String(e?.reps || '').match(/^\s*(\d+)/); return m && +m[1] <= 6 ? 3 : 2; }
export const restLine = s => String(s?.rest || '').split(/(?<=\.)\s+/)[0];
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
/* Double progression: add load when the first logged set reached the top of the plan's rep range at or under
   the plan's effort. Sets planned to failure (RPE 10, Block 04 from 5 Nov 2026) can't come in "under 9", so
   the cap is the plan's own RPE, never below 9. No RPE logged counts as on target. */
export function addLoadDue(planEx, logged) {
  const top = topOfRange(planEx?.reps), s1 = logged?.sets?.[0]; if (!top || !s1) return false;
  return (+s1.r || 0) >= top && (s1.rpe == null || +s1.rpe <= Math.max(9, +planEx.rpe || 0));
}
export function libMacros(item, qty) { const k = (+qty || 0) / (item.q || 1); return item.m.map(v => v * k); }
export async function loadCtx(env) {
  const [days, config] = await Promise.all([allDays(env), allConfig(env)]);
  return { days, settings: config.settings || {}, library: config.library?.items || [], plan: config.plan || null, config };
}
