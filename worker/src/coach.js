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
   Steps follow the plan's rule: dumbbells +2 kg each, cables +2.5 kg, machines and bars +5 kg.

   15 Nov 2026 (Sam, after the first back day: "too long… compact and concise, then an overall feedback at the
   bottom… for each exercise just next, very shorthand… use colours… eye-catching, so you can see the detail at a
   glance"). The review is now one line per lift: a coloured dot for how the first set compares with last time
   (🟢 up, 🟡 same, 🔴 down, ⚪ first time), what was done, and the next target in shorthand (↑ more load,
   ↓ lighter, otherwise the same load with one more rep). The coach's feedback sits at the bottom in a quote
   block. Telegram can't colour text, so colour comes from the dots and the grey code spans. */
import { esc, fmt, mean, addDays, diffDays, dLong, normName, today } from './util.js';
import { dayTotals, targets, weighins, rollAvg, allWorkouts, lastPerf, setsText, planState } from './model.js';
import { claude } from './ai.js';
import { awayOn } from './extras.js';

export const loadStep = n => /\bdb\b|dumbbell/i.test(n) ? 2 : /\bleg\b|machine|deck|smith|squat|deadlift/i.test(n) ? 5 : /cable|push.?down|pull.?down|pullover|face pull|rope|curl|lateral|crunch/i.test(n) ? 2.5 : 5;
const range = reps => { const m = String(reps || '').match(/(\d+)\s*[-–]\s*(\d+)/); return m ? [+m[1], +m[2]] : null; };
const kgTxt = kg => kg == null ? 'bodyweight' : fmt(kg, kg % 1 ? 1 : 0) + ' kg';
const e1 = s => s && s.r > 0 ? (s.kg > 0 ? s.kg * (1 + s.r / 30) : s.r) : null;   // Epley; reps alone when there is no load
const kgS = k => k == null ? 'BW' : fmt(k, k % 1 ? 1 : 0);
/* Sets in shorthand: "42.5×9,8"; mixed loads "40×10, 42.5×8"; bodyweight "BW×8,6". */
export function setsShort(sets) {
  if (!sets?.length) return '';
  const same = sets.every(s => s.kg === sets[0].kg);
  return same ? `${kgS(sets[0].kg)}×${sets.map(s => s.r ?? '?').join(',')}` : sets.map(s => `${kgS(s.kg)}×${s.r ?? '?'}`).join(', ');
}
export const DOT = { 1: '🟢', 0: '🟡', '-1': '🔴', null: '⚪' };

/* One exercise: what was done, how it compares with last time, and what to aim for next. */
export function reviewExercise(planEx, logged, prev) {
  // a lift that isn't in the plan is judged on 8-12, the plan's range for everything but the big compounds
  const s1 = logged.sets[0], rg = range(planEx?.reps || '8-12'), step = loadStep(logged.n), out = { n: logged.n, did: setsText(logged.sets), short: setsShort(logged.sets), status: 'none', up: null };
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
    out.nextShort = kg == null ? (/\+kg|dip|pull.?up|chin/i.test(logged.n) ? `↑ +2.5×${lo}–${lo + 2}` : `BW×${hi} every set`) : `↑ ${kgS(kg + step)}×${lo}–${lo + 2}`;
    out.why = `first set reached the top of ${lo}–${hi}: the load goes up and the reps start again at the bottom`;
  } else if (s1.r < lo) {
    out.status = 'heavy';
    const down = kg == null ? null : Math.max(step, Math.round(kg * 0.9 / step) * step) >= kg ? kg - step : Math.round(kg * 0.9 / step) * step;
    out.next = kg == null ? `same, aim ${lo} on the first set` : `${kgTxt(down)}, aim ${lo}–${Math.min(hi, lo + 2)}`;
    out.nextShort = kg == null ? `BW×${lo}` : `↓ ${kgS(down)}×${lo}–${Math.min(hi, lo + 2)}`;
    out.why = kg == null ? `under ${lo}–${hi}: build the reps before adding anything` : `${s1.r} is under ${lo}–${hi}, so ${kgTxt(kg)} is too heavy for this range today: about 10% off puts the reps where they build muscle best`;
  } else {
    out.status = 'in';
    out.next = `${kg == null ? 'same' : kgTxt(kg)}, aim ${Math.min(hi, s1.r + 1)}${s1.r + 1 < hi ? '–' + Math.min(hi, s1.r + 2) : ''} on the first set`;
    out.nextShort = `${kgS(kg)}×${Math.min(hi, s1.r + 1)}`;
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
  return { rows, calib, swaps, skipped: free.map(p => p.n), extra: extra.filter(e => !swaps.some(s => s.to === e.n)).map(e => e.n), count: ps ? ps.count + 1 : null, length: P?.length || null };
}
/* The session review as Sam sees it: header and a one-line tally, a line per lift, what wasn't logged, then the
   coach's feedback (Claude's note, or a plain fallback) and the focus in a quote block, then what's next. */
export function sessionReviewHtml(R, label, date) {
  const scored = R.rows.filter(r => r.status !== 'none'), inR = scored.filter(r => r.status === 'in' || r.status === 'top').length;
  const n = k => R.rows.filter(r => r.up === k).length, tally = [[1, n(1)], [0, n(0)], [-1, n(-1)], [null, n(null)]].filter(([, c]) => c).map(([k, c]) => DOT[k] + ' ' + c).join('  ');
  const head = `🏋️ <b>${esc(label)}</b>${date ? ' · ' + esc(dLong(date)) : ''}${R.count ? ` · session ${R.count}${R.length ? '/' + R.length : ''}` : ''}`;
  const sum = `<b>${inR}/${scored.length}</b> in range${tally ? '   ' + tally : ''}`;
  const lines = R.rows.map(r => `${DOT[r.up]} <b>${esc(r.n)}</b>  ${esc(r.short)}${r.nextShort ? `  →  <code>${esc(r.nextShort)}</code>` : ''}`);
  const heavy = R.rows.filter(r => r.status === 'heavy'), top = R.rows.filter(r => r.status === 'top');
  const focus = heavy.length ? `lighter on ${heavy.map(r => esc(r.n)).join(' and ')} to land in range; one more rep everywhere else.`
    : top.length ? `the new load on ${top.map(r => esc(r.n)).join(' and ')}; one more rep everywhere else.` : scored.length ? 'one more rep on the first set of each lift, same loads.' : '';
  const verdict = `${inR} of ${scored.length} lifts in their rep range${n(1) ? `, ${n(1)} up on last time` : ''}${n(-1) ? `, ${n(-1)} down` : ''}.`;
  // the facts Claude writes the feedback from: every figure, its reason, and what the review noticed
  const facts = [`Session: ${label}${R.count ? `, session ${R.count} of ${R.length}` : ''}${R.calib ? '; first rotation of the plan (calibration: finding loads after a break)' : ''}.`, verdict,
    ...R.rows.map(r => `${r.n}: did ${r.did}${r.prev ? `; last time ${r.prev}` : '; first time logged'}; vs last time ${r.up === 1 ? 'up' : r.up === -1 ? 'down' : r.up === 0 ? 'same' : 'n/a'}${r.next ? `; next ${r.next} (${r.why})` : ''}${r.rest ? '; reps fell 3+ from the first set to the last (rest may be too short)' : ''}.`),
    R.skipped.length ? `Not logged: ${R.skipped.join(', ')}.` : '', R.extra?.length ? `Done but not in the plan: ${R.extra.join(', ')}.` : '', focus ? `Focus: ${focus}` : ''].filter(Boolean).join('\n');
  return { head, sum, lines, focus, verdict, facts, skipped: R.skipped.length ? `<i>Not logged: ${R.skipped.map(esc).join(', ')}</i>` : '' };
}
export const joinReview = (H, note, next) => [H.head + '\n' + H.sum, H.lines.join('\n') + (H.skipped ? '\n' + H.skipped : ''),
  `<blockquote>🧭 <b>Coach</b>\n${esc(note || H.verdict)}${H.focus ? `\n🎯 <b>Next time:</b> ${H.focus}` : ''}</blockquote>`, next || ''].filter(Boolean).join('\n\n');

/* A short opening in plain words. Claude gets the worked-out lines and nothing else, and is told to add no
   numbers of its own. Returns '' on any failure: the review never depends on it. */
export async function coachNote(env, kind, facts) {
  if (!env.ANTHROPIC_API_KEY) return '';
  try {
    // 15 Nov 2026: the note is now the coach's feedback at the bottom of the message (Sam: "the actual coach's
    // feedback… concise, but with the necessary detail so it's worthwhile")
    const system = `You are Sam's strength coach, writing your feedback at the bottom of a ${kind} in a Telegram message; the numbers are listed above it, so don't repeat them line by line. British English. Three or four short sentences, plain text only (no markdown, no lists, no emoji): how it went overall, what stood out (good and bad), the reasoning behind the main next targets, and anything to change (rest, load, form, order). Honest, direct and encouraging, like a good coach. Use ONLY the facts given: never state a number, load or target that is not in them, and never contradict them. Sam's aim is muscle growth with strength going up session to session.`;
    const t = await claude(env, { model: env.MODEL_FAST || 'claude-haiku-5-5', system, max_tokens: 320, budget: 9000, messages: [{ role: 'user', content: facts.replace(/<[^>]+>/g, '') }] });
    const s = String(t || '').trim();
    return s && s.length < 900 && !/^[{\[]/.test(s) ? s : '';
  } catch { return ''; }
}

/* ---------- the weekly review: the seven days ending on `end` (sent on Sunday evening) ---------- */
export function weeklyFacts(ctx, end) {
  const from = addDays(end, -6), prevFrom = addDays(from, -7), T = targets(ctx, end), td = today();
  const inWk = d => d >= from && d <= end, days = ctx.days.filter(d => inWk(d.date));
  /* 15 Nov 2026 (Sam: the week's average food was 2,119 because a holiday day and an unfinished day counted).
     Food counts only days that are over and not away: away days are holidays, and today is still being eaten
     (the review goes out at 19:00 on Sunday). Gym sessions planned scale down by the days away. */
  const wkDays = Array.from({ length: 7 }, (_, i) => addDays(from, i)), away = wkDays.filter(d => awayOn(ctx, d)), open = wkDays.filter(d => !awayOn(ctx, d) && d < td);
  const food = days.filter(d => open.includes(d.date)).map(d => ({ d, t: dayTotals(d) })).filter(x => x.t && x.t.kcal != null && !x.t.void && !x.t.partial);
  const tots = food.map(x => x.t);
  const ws = allWorkouts(ctx.days).filter(w => inWk(w.date)), gym = ws.filter(w => w.kind === 'gym'), other = ws.filter(w => w.kind !== 'gym');
  const wl = weighins(ctx.days).filter(x => x.w), wNow = wl.some(x => inWk(x.date)) ? rollAvg(wl, end, 'w') : null, wPrev = rollAvg(wl, addDays(end, -7), 'w');
  // lifts: the first set of each exercise this week against the last time it was done before this week
  const before = { ...ctx, days: ctx.days.filter(d => d.date < from) }, ups = [], downs = [], seen = new Set();
  for (const w of gym.slice().reverse()) for (const e of (w.ex || [])) {
    const k = normName(e.n); if (seen.has(k)) continue; seen.add(k);
    const p = lastPerf(before.days, e.n), a = e1(p?.sets?.[0]), b = e1(e.sets?.[0]); if (a == null || b == null) continue;
    if (b > a * 1.005) ups.push(e.n); else if (b < a * 0.995) downs.push(e.n);
  }
  const want = ctx.plan?.perWeek ? Math.floor(ctx.plan.perWeek * (7 - away.length) / 7) : null;
  return { from, end, T, open: open.length, away: away.length, awayFrom: away[0], awayTo: away[away.length - 1], logged: tots.length,
    hit: T.ok ? food.filter(x => { const t = targets(ctx, x.d.date); return t.ok && x.t.p >= t.protein - 0.5; }).length : null, kcal: mean(tots.map(t => t.kcal)), prot: mean(tots.map(t => t.p)),
    gym: gym.length, want, codes: gym.map(w => w.planCode || w.label || 'gym').reverse(), cardioMin: other.reduce((a, w) => a + (+w.min || 0), 0), cardioN: other.length,
    steps: mean(days.filter(d => d.steps != null && d.stepsAt !== d.date).map(d => +d.steps)), stepDays: days.filter(d => d.steps != null && d.stepsAt !== d.date).length,
    wNow, wPrev: wNow != null ? wPrev : null, weighed: wl.filter(x => inWk(x.date)).length, ups, downs, lifts: seen.size, prevFrom };
}
export function weeklyHtml(F) {
  const good = [], fix = [];
  if (F.want != null) (F.gym >= F.want ? good : fix).push(F.gym >= F.want ? `Trained ${F.gym} times (plan: ${F.want}–${F.want + 1} a week)` : `${F.gym} gym session${F.gym === 1 ? '' : 's'} against ${F.want}–${F.want + 1} planned`);
  if (F.ups.length) good.push(`${F.ups.length} lift${F.ups.length === 1 ? '' : 's'} up on last time: ${F.ups.slice(0, 4).map(esc).join(', ')}`);
  if (F.open && F.logged >= F.open - 1) good.push(`Food logged on ${F.logged} of ${F.open} days`); else if (F.open) fix.push(`Food logged on ${F.logged} of ${F.open} days: the targets are only as good as the log`);
  if (F.hit != null && F.logged) (F.hit >= Math.max(1, F.logged - 1) ? good : fix).push(`Protein floor (${F.T.protein} g) hit on ${F.hit} of ${F.logged} logged days`);
  if (!F.weighed) fix.push('No weigh-in this week: Mon, Wed and Fri mornings keep the trend honest');
  if (F.downs.length && !F.ups.length) fix.push(`${F.downs.length} lift${F.downs.length === 1 ? '' : 's'} down on last time`);
  const focus = F.want != null && F.gym < F.want ? `Get to ${F.want} sessions: the plan only works at its frequency.`
    : F.hit != null && F.logged && F.hit < F.logged - 1 ? `Protein: ${F.T.protein} g every day. Front-load it: 40 g by lunch makes the floor easy.`
    : F.open && F.logged < F.open - 1 ? 'Log every day, even roughly.' : F.ups.length ? 'Same again: one more rep or the next load on every first set.' : 'One more rep on the first set of each lift.';
  const stats = [`🏋️ <b>${F.gym}</b> gym${F.codes.length ? ' (' + F.codes.map(esc).join(', ') + ')' : ''}${F.cardioN ? ` · ${F.cardioN} cardio or sport${F.cardioMin ? ', ' + fmt(F.cardioMin) + ' min' : ''}` : ''}`,
    F.logged ? `🍽 <b>${fmt(F.kcal)}</b> kcal · <b>${fmt(F.prot)}</b> g protein a day${F.T.ok ? ` (targets ${fmt(F.T.kcal)} / ${F.T.protein})` : ''}` : '🍽 Nothing complete logged',
    F.away ? `🏝 Away ${F.away === 1 ? dLong(F.awayFrom) : dLong(F.awayFrom) + ' – ' + dLong(F.awayTo)}: not counted` : '',
    F.steps != null ? `👟 <b>${fmt(F.steps)}</b> steps a day (${F.stepDays} day${F.stepDays === 1 ? '' : 's'} counted)` : '',
    F.wNow != null ? `⚖️ <b>${fmt(F.wNow, 2)} kg</b> 7-day avg${F.wPrev != null ? ` (${F.wNow - F.wPrev >= 0 ? '+' : '−'}${fmt(Math.abs(F.wNow - F.wPrev), 2)} kg on the week before)` : ''}` : ''].filter(Boolean);
  return { head: `📊 <b>Your week</b> · ${dLong(F.from)} – ${dLong(F.end)}`, stats: stats.join('\n'), good: good.length ? '✅ <b>Went well</b>\n' + good.map(x => '• ' + x).join('\n') : '', fix: fix.length ? '🛠 <b>To improve</b>\n' + fix.map(x => '• ' + x).join('\n') : '', focus };
}
// the coach's note and the focus sit at the bottom in a quote block, as in the session review
export const joinWeekly = (H, note) => [H.head, H.stats, H.good, H.fix, `<blockquote>🧭 <b>Coach</b>${note ? '\n' + esc(note) : ''}\n🎯 <b>Next week:</b> ${H.focus}</blockquote>`].filter(Boolean).join('\n\n');
export async function weeklyReview(env, ctx, end) {
  const H = weeklyHtml(weeklyFacts(ctx, end));
  return joinWeekly(H, await coachNote(env, 'weekly review', [H.stats, H.good, H.fix, 'Focus: ' + H.focus].join('\n').replace(/<[^>]+>/g, '')));
}
