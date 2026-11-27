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
   block. Telegram can't colour text, so colour comes from the dots and the grey code spans.

   24 Nov 2026 (Sam, after chest day, incline DB 24 kg × 9 then 5: "base progress off of a number of weeks, not just
   what I did last time… I should be aiming for 2 sets within the rep range. If I'm only hitting 1, does something
   need to be adjusted?"). Two changes:
   - The dot compares the first set with the average of the last three sessions of that lift (within six weeks),
     not with last time alone, so one flat day reads as flat, not as a collapse.
   - Every set has to land in the range. The load goes up only when the first set reaches the top AND the last set
     is still in the range. If set 1 is in range but a later set falls under it, the load holds and the next target
     is "same load, rest 3 minutes, set 2 at least the bottom of the range" (status 'drop'). If that happens two
     sessions running at the same load, set 2 becomes a back-off set about 10% lighter. WHY 3 minutes: in trained men,
     3-minute rests produced more growth and strength than 1-minute rests (Schoenfeld et al. 2016), and a fall of 3+
     reps between sets taken close to failure usually means the rest was short. */
import { esc, fmt, mean, addDays, diffDays, dLong, normName, today } from './util.js';
import { dayTotals, targets, weighins, rollAvg, allWorkouts, lastPerf, recentPerf, setsText, planState } from './model.js';
import { claude } from './ai.js';
import { awayOn } from './extras.js';
/* Light activity (23 Nov 2026): golf, e.g. two hours at the driving range. Measured at 2.3-2.6 MET (Wolkodoff
   2024, range practice), under the 3.0 that counts as moderate, so it is shown and reported but never counted as
   cardio: an hour would otherwise cover 40% of the 150-minute week. */
export const LIGHT = ['golf'];   // light by kind; the band of any session now comes from model.js cardioIntensity (27 Nov 2026)

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

/* One exercise: what was done, how it compares with the last few sessions, and what to aim for next.
   hist = the last few performances before this one (recentPerf), newest first; prev = the newest of them. */
export function reviewExercise(planEx, logged, prev, hist = prev ? [prev] : []) {
  // a lift that isn't in the plan is judged on 8-12, the plan's range for everything but the big compounds
  const s1 = logged.sets[0], rg = range(planEx?.reps || '8-12'), step = loadStep(logged.n), out = { n: logged.n, did: setsText(logged.sets), short: setsShort(logged.sets), status: 'none', up: null };
  if (prev?.sets?.[0]) out.prev = `${setsText(prev.sets)} on ${dLong(prev.date)}`;
  const past = hist.map(h => e1(h.sets?.[0])).filter(v => v != null).slice(0, 3), b = e1(s1);
  if (past.length && b != null) {
    const ref = mean(past); out.up = b > ref * 1.005 ? 1 : b < ref * 0.995 ? -1 : 0;
    out.ref = past.length > 1 ? `the average of the last ${past.length} sessions` : 'last time';
    out.hist = hist.slice(0, 3).map(h => `${setsShort(h.sets)} (${dLong(h.date)})`).join('; ');
  }
  if (!rg || !(s1?.r > 0)) return out;
  const [lo, hi] = rg, kg = s1.kg, n = logged.sets.length, last = logged.sets[n - 1];
  out.setsIn = logged.sets.filter(s => s.r >= lo).length; out.allIn = out.setsIn === n;
  const dropped = n > 1 && s1.r >= lo && last.r < lo;
  const dropBefore = prev?.sets?.length > 1 && prev.sets[0].kg === kg && prev.sets[0].r >= lo && prev.sets[prev.sets.length - 1].r < lo;
  if (s1.r >= hi && !dropped) {
    out.status = 'top';
    out.next = kg == null ? (/\+kg|dip|pull.?up|chin/i.test(logged.n) ? `add 2.5 kg, aim ${lo}–${lo + 2}` : `${hi} on every set, then a slower lowering or added load`) : `${kgTxt(kg + step)}, aim ${lo}–${lo + 2}`;
    out.nextShort = kg == null ? (/\+kg|dip|pull.?up|chin/i.test(logged.n) ? `↑ +2.5×${lo}–${lo + 2}` : `BW×${hi} every set`) : `↑ ${kgS(kg + step)}×${lo}–${lo + 2}`;
    out.why = `first set reached the top of ${lo}–${hi} and every set stayed in range: the load goes up and the reps start again at the bottom`;
  } else if (s1.r < lo) {
    out.status = 'heavy';
    const down = kg == null ? null : Math.max(step, Math.round(kg * 0.9 / step) * step) >= kg ? kg - step : Math.round(kg * 0.9 / step) * step;
    out.next = kg == null ? `same, aim ${lo} on the first set` : `${kgTxt(down)}, aim ${lo}–${Math.min(hi, lo + 2)}`;
    out.nextShort = kg == null ? `BW×${lo}` : `↓ ${kgS(down)}×${lo}–${Math.min(hi, lo + 2)}`;
    out.why = kg == null ? `under ${lo}–${hi}: build the reps before adding anything` : `${s1.r} is under ${lo}–${hi}, so ${kgTxt(kg)} is too heavy for this range today: about 10% off puts the reps where they build muscle best`;
  } else if (dropped) {
    out.status = 'drop';
    const back = kg == null ? null : Math.round(kg * 0.9 / step) * step < kg ? Math.round(kg * 0.9 / step) * step : kg - step;
    if (dropBefore && kg != null) {
      out.next = `${kgTxt(kg)} for set 1, then a back-off set at ${kgTxt(back)}, aim ${lo}+`;
      out.nextShort = `${kgS(kg)}×${Math.min(hi, s1.r)}, then ${kgS(back)}×${lo}+`;
      out.why = `set ${n} fell under ${lo} two sessions running at ${kgTxt(kg)}: a back-off set about 10% lighter keeps both sets in the range that builds muscle`;
    } else {
      out.next = `${kgTxt(kg)} again, every set ${lo}+, 3 minutes' rest between sets`;
      out.nextShort = `${kgS(kg)}×${Math.min(hi, s1.r)}, ${lo}+ · rest 3′`;
      out.why = `set 1 was in ${lo}–${hi} but set ${n} fell to ${last.r}: the target is every set in range, so the load holds and the rest goes to 3 minutes`;
    }
  } else {
    out.status = 'in';
    out.next = `${kg == null ? 'same' : kgTxt(kg)}, aim ${Math.min(hi, s1.r + 1)}${s1.r + 1 < hi ? '–' + Math.min(hi, s1.r + 2) : ''} on the first set`;
    out.nextShort = `${kgS(kg)}×${Math.min(hi, s1.r + 1)}`;
    out.why = `inside ${lo}–${hi} on every set: add a rep before adding load${kg == null ? '' : `; at ${hi} it goes to ${kgTxt(kg + step)}`}`;
  }
  if (n > 1 && s1.r - last.r >= 3) out.rest = true;   // a big drop-off across sets usually means short rests
  return out;
}

/* The whole session against its plan session. ctxBefore is the data BEFORE this session was saved, so
   "last time" is the previous one. Returns the parts; sessionReviewHtml lays them out. */
export function reviewSession(ctxBefore, planS, ex) {
  const P = ctxBefore.plan, ps = planState(ctxBefore), calib = !!P && ps && ps.count < P.sessions.length;
  const rows = ex.map(e => { const h = recentPerf(ctxBefore.days, e.n); return reviewExercise(planS?.ex.find(p => normName(p.n) === normName(e.n)), e, h[0] || null, h); });
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
  const scored = R.rows.filter(r => r.status !== 'none'), inR = scored.filter(r => r.allIn).length;   // every set in range (24 Nov 2026)
  const n = k => R.rows.filter(r => r.up === k).length, tally = [[1, n(1)], [0, n(0)], [-1, n(-1)], [null, n(null)]].filter(([, c]) => c).map(([k, c]) => DOT[k] + ' ' + c).join('  ');
  const head = `🏋️ <b>${esc(label)}</b>${date ? ' · ' + esc(dLong(date)) : ''}${R.count ? ` · session ${R.count}${R.length ? '/' + R.length : ''}` : ''}`;
  const sum = `<b>${inR}/${scored.length}</b> with every set in range${tally ? '   ' + tally : ''}`;
  const lines = R.rows.map(r => `${DOT[r.up]} <b>${esc(r.n)}</b>  ${esc(r.short)}${r.nextShort ? `  →  <code>${esc(r.nextShort)}</code>` : ''}`);
  const heavy = R.rows.filter(r => r.status === 'heavy'), top = R.rows.filter(r => r.status === 'top'), drop = R.rows.filter(r => r.status === 'drop');
  const restTxt = drop.length ? `3 minutes' rest on ${drop.map(r => esc(r.n)).join(' and ')} so the last set stays in range` : '';
  const focus = heavy.length ? `lighter on ${heavy.map(r => esc(r.n)).join(' and ')} to land in range${restTxt ? '; ' + restTxt : ''}; one more rep everywhere else.`
    : restTxt ? `${restTxt}; one more rep everywhere else.`
    : top.length ? `the new load on ${top.map(r => esc(r.n)).join(' and ')}; one more rep everywhere else.` : scored.length ? 'one more rep on the first set of each lift, same loads.' : '';
  const verdict = `${inR} of ${scored.length} lifts with every set in their rep range${n(1) ? `, ${n(1)} up on recent sessions` : ''}${n(-1) ? `, ${n(-1)} down` : ''}.`;
  // the facts Claude writes the feedback from: every figure, its reason, and what the review noticed
  const facts = [`Session: ${label}${R.count ? `, session ${R.count} of ${R.length}` : ''}${R.calib ? '; first rotation of the plan (calibration: finding loads after a break)' : ''}.`, verdict,
    ...R.rows.map(r => `${r.n}: did ${r.did}${r.setsIn != null ? ` (${r.setsIn} of ${r.did.split(',').length} sets in range)` : ''}${r.hist ? `; recent sessions ${r.hist}` : '; first time logged'}; vs ${r.ref || 'last time'} ${r.up === 1 ? 'up' : r.up === -1 ? 'down' : r.up === 0 ? 'same' : 'n/a'}${r.next ? `; next ${r.next} (${r.why})` : ''}${r.rest ? '; reps fell 3+ from the first set to the last (rest may be too short)' : ''}.`),
    R.skipped.length ? `Not logged: ${R.skipped.join(', ')}.` : '', R.extra?.length ? `Done but not in the plan: ${R.extra.join(', ')}.` : '', focus ? `Focus: ${focus}` : ''].filter(Boolean).join('\n');
  return { head, sum, lines, focus, verdict, facts, skipped: R.skipped.length ? `<i>Not logged: ${R.skipped.map(esc).join(', ')}</i>` : '' };
}
export const joinReview = (H, note, next) => [H.head + '\n' + H.sum, H.lines.join('\n') + (H.skipped ? '\n' + H.skipped : ''),
  `<blockquote>🧭 <b>Coach</b>\n${esc(note || H.verdict)}${H.focus ? `\n🎯 <b>Next time:</b> ${H.focus}` : ''}</blockquote>`, next || ''].filter(Boolean).join('\n\n');

/* A short opening in plain words. Claude gets the worked-out lines and nothing else, and is told to add no
   numbers of its own. Returns '' on any failure: the review never depends on it. */
export async function coachNote(env, kind, facts, systemOverride) {
  if (!env.ANTHROPIC_API_KEY) return '';
  try {
    // 15 Nov 2026: the note is now the coach's feedback at the bottom of the message (Sam: "the actual coach's
    // feedback… concise, but with the necessary detail so it's worthwhile")
    const system = `You are Sam's strength coach, writing your feedback at the bottom of a ${kind} in a Telegram message; the numbers are listed above it, so don't repeat them line by line. British English. Three or four short sentences, plain text only (no markdown, no lists, no emoji): how it went overall, what stood out (good and bad), the reasoning behind the main next targets, and anything to change (rest, load, form, order). Honest, direct and encouraging, like a good coach. Use ONLY the facts given: never state a number, load or target that is not in them, and never contradict them. Sam's aim is muscle growth with strength going up session to session.`;
    const t = await claude(env, { model: env.MODEL_FAST || 'claude-haiku-5-5', system: systemOverride || system, max_tokens: 700, budget: 12000, messages: [{ role: 'user', content: facts.replace(/<[^>]+>/g, '') }] });
    return finishNote(t);
  } catch { return ''; }
}

/* 24 Nov 2026 (Sam: the note ended "…the clear MI" mid-word): it had 320 tokens and was sent as it came. Now 700,
   and anything after the last full sentence is dropped, so a note that runs long ends cleanly. */
export function finishNote(t) {
  let s = String(t || '').trim();
  if (!s || /^[{\[]/.test(s)) return '';
  if (!/[.!?…]["')\]]?$/.test(s)) { const m = s.match(/^[\s\S]*[.!?…]["')\]]?(?=\s|$)/); s = m ? m[0].trim() : ''; }
  return s.length <= 1400 ? s : '';
}

/* the weekly review moved to weekly.js (27 Nov 2026); re-exported here for the callers and tests that import it from coach.js */
export { weeklyFacts, weeklyHtml, joinWeekly, weeklyReview } from './weekly.js';
