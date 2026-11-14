/* Health DB · coach.js: feedback after a gym session, plan swaps, and the weekly review.

   WHY (14 Nov 2026, Sam): "when I log each session, a quick executive summary from the bot telling me how I did
   and what to work on next time, a bit of rationale as to the numbers… act as a coach", and "every week a
   quick summary: what I did well, what I could improve, what the focus should be".

   WHY the numbers are worked out here and not by Claude: a target Sam can't re-derive is a target he can't
   correct. Every "next time" figure follows the plan's own rule (double progression, below), so the same
   session always gets the same advice. Claude only adds a short opening in plain words (coachNote), is given
   these lines as its only source, and the message is sent without it if that call fails.

   The rule, per exercise, from the FIRST set (the freshest one, so the fairest measure):
   - at or above the top of the rep range → add one step of load, start again at the bottom of the range;
   - inside the range → same load, one more rep on the first set;
   - below the bottom of the range → the load is too heavy for this range: take about 10% off.
   Steps follow the plan's rule: dumbbells +2 kg each, cables +2.5 kg, machines and bars +5 kg. */
import { esc, fmt, mean, addDays, diffDays, dLong, normName } from './util.js';
import { dayTotals, targets, weighins, rollAvg, allWorkouts, lastPerf, setsText, planState } from './model.js';
import { claude } from './ai.js';

export const loadStep = n => /\bdb\b|dumbbell/i.test(n) ? 2 : /\bleg\b|machine|deck|smith|squat|deadlift/i.test(n) ? 5 : /cable|push.?down|pull.?down|pullover|face pull|rope|curl|lateral|crunch/i.test(n) ? 2.5 : 5;
const range = reps => { const m = String(reps || '').match(/(\d+)\s*[-–]\s*(\d+)/); return m ? [+m[1], +m[2]] : null; };
const kgTxt = kg => kg == null ? 'bodyweight' : fmt(kg, kg % 1 ? 1 : 0) + ' kg';
const e1 = s => s && s.r > 0 ? (s.kg > 0 ? s.kg * (1 + s.r / 30) : s.r) : null;   // Epley; reps alone when there is no load

/* One exercise: what was done, how it compares with last time, and what to aim for next. */
export function reviewExercise(planEx, logged, prev) {
  const s1 = logged.sets[0], rg = range(planEx?.reps), step = loadStep(logged.n), out = { n: logged.n, did: setsText(logged.sets), status: 'none', up: null };
  if (prev?.sets?.[0]) {
    const a = e1(prev.sets[0]), b = e1(s1);
    out.up = a != null && b != null ? (b > a * 1.005 ? 1 : b < a * 0.995 ? -1 : 0) : null;
    out.prev = `${setsText(prev.sets)} on ${dLong(prev.date)}`;
  }
  if (!rg || !(s1?.r > 0)) return out;
  const [lo, hi] = rg, kg = s1.kg, last = logged.sets[logged.sets.length - 1];
  if (s1.r >= hi) {
    out.status = 'top';
    out.next = kg == null ? (/\+kg|dip|pull.?up|chin/i.test(logged.n) ? `add 2.5 kg, aim ${lo}–${lo + 2}` : `${hi} on every set, then a slower lowering or added load`) : `${kgTxt(kg + step)}, aim ${lo}–${lo + 2}`;
    out.why = `first set reached the top of ${lo}–${hi}: the load goes up and the reps start again at the bottom`;
  } else if (s1.r < lo) {
    out.status = 'heavy';
    const down = kg == null ? null : Math.max(step, Math.round(kg * 0.9 / step) * step) >= kg ? kg - step : Math.round(kg * 0.9 / step) * step;
    out.next = kg == null ? `same, aim ${lo} on the first set` : `${kgTxt(down)}, aim ${lo}–${Math.min(hi, lo + 2)}`;
    out.why = kg == null ? `under ${lo}–${hi}: build the reps before adding anything` : `${s1.r} is under ${lo}–${hi}, so ${kgTxt(kg)} is too heavy for this range today: about 10% off puts the reps where they build muscle best`;
  } else {
    out.status = 'in';
    out.next = `${kg == null ? 'same' : kgTxt(kg)}, aim ${Math.min(hi, s1.r + 1)}${s1.r + 1 < hi ? '–' + Math.min(hi, s1.r + 2) : ''} on the first set`;
    out.why = `inside ${lo}–${hi}: add a rep before adding load${kg == null ? '' : `; at ${hi} it goes to ${kgTxt(kg + step)}`}`;
  }
  if (logged.sets.length > 1 && s1.r - last.r >= 3) out.rest = true;   // a big drop-off across sets usually means short rests
  return out;
}

/* The whole session against its plan session. ctxBefore is the data BEFORE this session was saved, so
   "last time" is the previous one. Returns the parts; sessionReviewHtml lays them out. */
export function reviewSession(ctxBefore, planS, ex) {
  const P = ctxBefore.plan, ps = planState(ctxBefore), calib = !!P && ps && ps.count < P.sessions.length;
  const rows = ex.map(e => reviewExercise(planS?.ex.find(p => normName(p.n) === normName(e.n)), e, lastPerf(ctxBefore.days, e.n)));
  const extra = planS ? ex.filter(e => !planS.ex.some(p => normName(p.n) === normName(e.n))) : [];
  const missing = planS ? planS.ex.filter(p => !ex.some(e => normName(e.n) === normName(p.n))) : [];
  // a swap: an exercise done that isn't in the plan, in the slot of one that was skipped (same position, else the nearest skipped)
  const swaps = [], free = missing.slice();
  for (const e of extra) {
    if (!free.length) break;
    const at = ex.indexOf(e), pick = free.reduce((a, c) => Math.abs(planS.ex.indexOf(c) - at) < Math.abs(planS.ex.indexOf(a) - at) ? c : a);
    swaps.push({ from: pick.n, to: e.n }); free.splice(free.indexOf(pick), 1);
  }
  return { rows, calib, swaps, skipped: free.map(p => p.n), count: ps ? ps.count + 1 : null, length: P?.length || null };
}
export function sessionReviewHtml(R, label) {
  const n = R.rows.length, inR = R.rows.filter(r => r.status === 'in' || r.status === 'top').length, up = R.rows.filter(r => r.up === 1).length, down = R.rows.filter(r => r.up === -1).length, scored = R.rows.filter(r => r.status !== 'none').length;
  const head = `🧭 <b>Coach · ${esc(label)}</b>${R.count ? ` · session ${R.count}${R.length ? ' of ' + R.length : ''}` : ''}`;
  const verdict = `${scored ? `<b>${inR} of ${scored}</b> lifts in their rep range` : `${n} lifts logged`}${up ? ` · <b>${up}</b> up on last time` : ''}${down ? ` · ${down} down` : ''}.`
    + (R.calib ? '\nCalibration rotation: these numbers set your baselines. Being under the old loads after a break is expected, and strength you had before comes back faster than it was first built.' : '');
  const lines = R.rows.map(r => `• <b>${esc(r.n)}</b>: ${esc(r.did)}${r.prev ? ` <i>(last ${esc(r.prev)})</i>` : ''}${r.next ? `\n   → next: <b>${esc(r.next)}</b>\n   <i>${esc(r.why)}${r.rest ? '. Reps fell away across the sets: rest 2–3 minutes between them' : ''}</i>` : ''}`);
  const heavy = R.rows.filter(r => r.status === 'heavy'), top = R.rows.filter(r => r.status === 'top');
  const focus = heavy.length ? `Focus next time: get ${heavy.map(r => esc(r.n)).join(' and ')} into range at the lighter load, and add a rep everywhere else.`
    : top.length ? `Focus next time: the new load on ${top.map(r => esc(r.n)).join(' and ')}; one more rep everywhere else.` : scored ? 'Focus next time: one more rep on the first set of each lift at the same loads.' : '';
  return { head, verdict, lines, focus, skipped: R.skipped.length ? `Not logged: ${R.skipped.map(esc).join(', ')}.` : '' };
}
export const joinReview = (H, note) => [H.head, note ? esc(note) : '', H.verdict, H.lines.join('\n'), H.skipped, H.focus].filter(Boolean).join('\n\n');

/* A short opening in plain words. Claude gets the worked-out lines and nothing else, and is told to add no
   numbers of its own. Returns '' on any failure: the review never depends on it. */
export async function coachNote(env, kind, facts) {
  if (!env.ANTHROPIC_API_KEY) return '';
  try {
    const system = `You are Sam's strength coach, writing the first lines of a ${kind} in a Telegram message. British English. Two or three short sentences, plain text only (no markdown, no lists, no emoji). Say plainly how it went and what matters most next, in a way that is honest and encouraging. Use ONLY the facts given: never state a number, load or target that is not in them, and never contradict them. Sam's aim is muscle growth with strength going up session to session.`;
    const t = await claude(env, { model: env.MODEL_FAST || 'claude-haiku-5-5', system, max_tokens: 220, budget: 9000, messages: [{ role: 'user', content: facts.replace(/<[^>]+>/g, '') }] });
    const s = String(t || '').trim();
    return s && s.length < 700 && !/^[{\[]/.test(s) ? s : '';
  } catch { return ''; }
}

/* ---------- the weekly review: the seven days ending on `end` (sent on Sunday evening) ---------- */
export function weeklyFacts(ctx, end) {
  const from = addDays(end, -6), prevFrom = addDays(from, -7), T = targets(ctx, end);
  const inWk = d => d >= from && d <= end, days = ctx.days.filter(d => inWk(d.date));
  const tots = days.map(d => dayTotals(d)).filter(t => t && t.kcal != null && !t.void && !t.partial);
  const ws = allWorkouts(ctx.days).filter(w => inWk(w.date)), gym = ws.filter(w => w.kind === 'gym'), other = ws.filter(w => w.kind !== 'gym');
  const wl = weighins(ctx.days).filter(x => x.w), wNow = wl.some(x => inWk(x.date)) ? rollAvg(wl, end, 'w') : null, wPrev = rollAvg(wl, addDays(end, -7), 'w');
  // lifts: the first set of each exercise this week against the last time it was done before this week
  const before = { ...ctx, days: ctx.days.filter(d => d.date < from) }, ups = [], downs = [], seen = new Set();
  for (const w of gym.slice().reverse()) for (const e of (w.ex || [])) {
    const k = normName(e.n); if (seen.has(k)) continue; seen.add(k);
    const p = lastPerf(before.days, e.n), a = e1(p?.sets?.[0]), b = e1(e.sets?.[0]); if (a == null || b == null) continue;
    if (b > a * 1.005) ups.push(e.n); else if (b < a * 0.995) downs.push(e.n);
  }
  const want = ctx.plan?.perWeek ? Math.floor(ctx.plan.perWeek) : null;
  return { from, end, T, logged: tots.length, hit: T.ok ? tots.filter(t => t.p >= T.protein - 0.5).length : null, kcal: mean(tots.map(t => t.kcal)), prot: mean(tots.map(t => t.p)),
    gym: gym.length, want, codes: gym.map(w => w.planCode || w.label || 'gym').reverse(), cardioMin: other.reduce((a, w) => a + (+w.min || 0), 0), cardioN: other.length,
    wNow, wPrev: wNow != null ? wPrev : null, weighed: wl.filter(x => inWk(x.date)).length, ups, downs, lifts: seen.size, prevFrom };
}
export function weeklyHtml(F) {
  const good = [], fix = [];
  if (F.want != null) (F.gym >= F.want ? good : fix).push(F.gym >= F.want ? `Trained ${F.gym} times (plan: ${F.want}–${F.want + 1} a week)` : `${F.gym} gym session${F.gym === 1 ? '' : 's'} against ${F.want}–${F.want + 1} planned`);
  if (F.ups.length) good.push(`${F.ups.length} lift${F.ups.length === 1 ? '' : 's'} up on last time: ${F.ups.slice(0, 4).map(esc).join(', ')}`);
  if (F.logged >= 6) good.push(`Food logged on ${F.logged} of 7 days`); else fix.push(`Food logged on ${F.logged} of 7 days: the targets are only as good as the log`);
  if (F.hit != null && F.logged) (F.hit >= Math.max(1, F.logged - 1) ? good : fix).push(`Protein floor (${F.T.protein} g) hit on ${F.hit} of ${F.logged} logged days`);
  if (!F.weighed) fix.push('No weigh-in this week: Mon, Wed and Fri mornings keep the trend honest');
  if (F.downs.length && !F.ups.length) fix.push(`${F.downs.length} lift${F.downs.length === 1 ? '' : 's'} down on last time`);
  const focus = F.want != null && F.gym < F.want ? `Get to ${F.want} sessions: the plan only works at its frequency.`
    : F.hit != null && F.logged && F.hit < F.logged - 1 ? `Protein: ${F.T.protein} g every day. Front-load it: 40 g by lunch makes the floor easy.`
    : F.logged < 6 ? 'Log every day, even roughly.' : F.ups.length ? 'Same again: one more rep or the next load on every first set.' : 'One more rep on the first set of each lift.';
  const stats = [`Training: <b>${F.gym}</b> gym${F.codes.length ? ' (' + F.codes.map(esc).join(', ') + ')' : ''}${F.cardioN ? ` · ${F.cardioN} cardio or sport${F.cardioMin ? ', ' + fmt(F.cardioMin) + ' min' : ''}` : ''}`,
    F.logged ? `Food: avg <b>${fmt(F.kcal)}</b> kcal · <b>${fmt(F.prot)}</b> g protein${F.T.ok ? ` (targets ${fmt(F.T.kcal)} / ${F.T.protein})` : ''}` : 'Food: nothing complete logged',
    F.wNow != null ? `Weight: <b>${fmt(F.wNow, 2)} kg</b> 7-day avg${F.wPrev != null ? ` (${F.wNow - F.wPrev >= 0 ? '+' : '−'}${fmt(Math.abs(F.wNow - F.wPrev), 2)} kg on the week before)` : ''}` : ''].filter(Boolean);
  return { head: `📊 <b>Your week</b> · ${dLong(F.from)} – ${dLong(F.end)}`, stats: stats.join('\n'), good: good.length ? '<b>Went well</b>\n' + good.map(x => '• ' + x).join('\n') : '', fix: fix.length ? '<b>To improve</b>\n' + fix.map(x => '• ' + x).join('\n') : '', focus: '<b>Focus for next week</b>\n' + focus };
}
export const joinWeekly = (H, note) => [H.head, note ? esc(note) : '', H.stats, H.good, H.fix, H.focus].filter(Boolean).join('\n\n');
export async function weeklyReview(env, ctx, end) {
  const H = weeklyHtml(weeklyFacts(ctx, end));
  return joinWeekly(H, await coachNote(env, 'weekly review', [H.stats, H.good, H.fix, H.focus].join('\n')));
}
