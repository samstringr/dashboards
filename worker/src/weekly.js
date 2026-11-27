/* Health DB · weekly.js: the coach's weekly review (Telegram on Sunday evening, /review, and the dashboard's Coach).

   27 Nov 2026, Sam: "every week he would give like feedback… a kind of retrospective of how the week has gone… typical
   coach style advice… to set you up for the next week", and of the retrospective written that day: "this
   justification for maintenance is really cool and important, and it's insights like that that emphasize that I'm
   sticking to the plan and doing it correctly, that I'd like the coach to be able to say in his weekly updates."

   So the review now works out what the numbers MEAN, not only what they were:
   - energy balance: two weeks of intake against the 7-day weight trend. Steady weight on the target = maintenance,
     which a recomp runs on, so the plan is being executed; a trend outside the phase's zone gives the size of the gap
     (1 kg of body tissue taken as about 7,700 kcal, an approximation);
   - which planned sessions were missed this week, not only how many;
   - lift progress with the numbers, and the lifts ready for more load;
   - cardio in WHO-equivalent minutes (vigorous ×2, model.js cardioIntensity) against 150, and steps against 10k.
   Each review is also kept in the 'coach' config document (the last 26), so the dashboard can show it with an unread
   count. Written by code from the log; Claude only writes the coach's paragraph, from these facts and no others. */
import { esc, fmt, mean, uid, addDays, diffDays, dLong, normName, today } from './util.js';
import { dayTotals, targets, weighins, rollAvg, allWorkouts, lastPerf, cardioIntensity, addLoadDue } from './model.js';
import { getConfig, putConfig } from './store.js';
import { awayOn } from './extras.js';
import { coachNote } from './coach.js';

const e1 = s => s && s.r > 0 ? (s.kg > 0 ? s.kg * (1 + s.r / 30) : s.r) : null;   // Epley, as in coach.js
const kgS = k => k == null ? 'BW' : fmt(k, k % 1 ? 1 : 0);
export const CARDIO_TARGET = 150, STEP_TARGET = 10000;
// kg per week each phase aims for (the dashboard's PHASES zones, per 4 weeks, divided by 4)
const ZONE = { recomp: [-0.125, 0.25], gain: [0.125, 0.375], cut: [-0.375, -0.125] };

/* Energy balance over the 14 days to `end`: mean intake on full, non-away days, and the 7-day average weight at each
   end. Needs 7 such days and a weigh-in in both weeks. */
export function energyBalance(ctx, end) {
  const from = addDays(end, -13), td = today(), wl = weighins(ctx.days).filter(x => x.w);
  const food = ctx.days.filter(d => d.date >= from && d.date <= end && d.date < td && !awayOn(ctx, d.date)).map(d => dayTotals(d)).filter(t => t && t.kcal != null && !t.void && !t.partial);
  const w1 = rollAvg(wl, end, 'w'), w0 = rollAvg(wl, addDays(end, -14), 'w');
  if (food.length < 7 || w0 == null || w1 == null) return null;
  const intake = mean(food.map(t => t.kcal)), slope = (w1 - w0) / 2, phase = ZONE[ctx.settings?.phase] ? ctx.settings.phase : 'recomp', z = ZONE[phase];
  return { intake, n: food.length, w0, w1, slope, maint: intake - slope * 7700 / 7, phase, verdict: slope < z[0] ? 'below' : slope > z[1] ? 'above' : 'in' };
}
function creatineDays(ctx, end) {
  const first = ctx.days.filter(d => d.supps?.creatine).map(d => d.date).sort()[0];
  return first && first <= end ? diffDays(first, end) + 1 : null;
}

/* ---------- the seven days ending on `end` ---------- */
export function weeklyFacts(ctx, end) {
  const from = addDays(end, -6), prevFrom = addDays(from, -7), T = targets(ctx, end), td = today();
  const inWk = d => d >= from && d <= end, days = ctx.days.filter(d => inWk(d.date));
  /* 15 Nov 2026 (Sam: the week's average food was 2,119 because a holiday day and an unfinished day counted).
     Food counts only days that are over and not away. Gym sessions planned scale down by the days away. */
  const wkDays = Array.from({ length: 7 }, (_, i) => addDays(from, i)), away = wkDays.filter(d => awayOn(ctx, d)), open = wkDays.filter(d => !awayOn(ctx, d) && d < td);
  const food = days.filter(d => open.includes(d.date)).map(d => ({ d, t: dayTotals(d) })).filter(x => x.t && x.t.kcal != null && !x.t.void && !x.t.partial);
  const tots = food.map(x => x.t);
  const kg = T.ok ? T.w : null, ws = allWorkouts(ctx.days).filter(w => inWk(w.date)), gym = ws.filter(w => w.kind === 'gym');
  const card = ws.filter(w => w.kind !== 'gym').map(w => ({ w, I: cardioIntensity(w, kg) })), other = card.filter(x => x.I.band !== 'light'), light = card.filter(x => x.I.band === 'light');
  const wl = weighins(ctx.days).filter(x => x.w), wNow = wl.some(x => inWk(x.date)) ? rollAvg(wl, end, 'w') : null, wPrev = rollAvg(wl, addDays(end, -7), 'w');
  // lifts: the first set of each exercise this week against the last time it was done before this week
  const before = ctx.days.filter(d => d.date < from), ups = [], downs = [], seen = new Set();
  for (const w of gym.slice().reverse()) for (const e of (w.ex || [])) {
    const k = normName(e.n); if (seen.has(k)) continue; seen.add(k);
    const p = lastPerf(before, e.n), a = e1(p?.sets?.[0]), b = e1(e.sets?.[0]); if (a == null || b == null) continue;
    const said = `${e.n} ${kgS(p.sets[0].kg)}×${p.sets[0].r} → ${kgS(e.sets[0].kg)}×${e.sets[0].r}`;
    if (b > a * 1.005) ups.push({ n: e.n, said, gain: b / a }); else if (b < a * 0.995) downs.push({ n: e.n, said });
  }
  ups.sort((p, q) => q.gain - p.gain);
  // the plan's lifts done this week whose first set reached the top of the range
  const loadDue = [];
  for (const w of gym) { const s = ctx.plan?.sessions?.find(x => x.code === w.planCode); if (!s) continue;
    for (const pe of s.ex) { const lg = (w.ex || []).find(x => normName(x.n) === normName(pe.n)); if (addLoadDue(pe, lg) && !loadDue.includes(pe.n)) loadDue.push(pe.n); } }
  const done = new Set(gym.map(w => w.planCode || String(w.label || '').split(' · ')[0]).filter(Boolean)),   // a session logged without its code still carries it in the label ("L · Legs")
    missed = (ctx.plan?.sessions || []).filter(s => !done.has(s.code)).map(s => s.name || s.code);
  const want = ctx.plan?.perWeek ? Math.floor(ctx.plan.perWeek * (7 - away.length) / 7) : null;
  const stepT = +ctx.settings?.stepTarget > 0 ? +ctx.settings.stepTarget : STEP_TARGET, stepD = days.filter(d => d.steps != null && d.stepsAt !== d.date);
  return { from, end, T, open: open.length, away: away.length, awayFrom: away[0], awayTo: away[away.length - 1], logged: tots.length,
    hit: T.ok ? food.filter(x => { const t = targets(ctx, x.d.date); return t.ok && x.t.p >= t.protein - 0.5; }).length : null, kcal: mean(tots.map(t => t.kcal)), prot: mean(tots.map(t => t.p)),
    gym: gym.length, want, codes: gym.map(w => w.planCode || w.label || 'gym').reverse(), missed,
    cardioMin: other.reduce((a, x) => a + (+x.w.min || 0), 0), cardioEq: other.reduce((a, x) => a + x.I.eq, 0), cardioVig: other.filter(x => x.I.band === 'vigorous').reduce((a, x) => a + (+x.w.min || 0), 0),
    cardioN: other.length, cT: +ctx.plan?.cardioMin > 0 ? +ctx.plan.cardioMin : CARDIO_TARGET, lightN: light.length, lightMin: light.reduce((a, x) => a + (+x.w.min || 0), 0),
    steps: mean(stepD.map(d => +d.steps)), stepDays: stepD.length, stepHit: stepD.filter(d => +d.steps >= stepT).length, stepT,
    wNow, wPrev: wNow != null ? wPrev : null, weighed: wl.filter(x => inWk(x.date)).length, ups, downs, loadDue, lifts: seen.size, prevFrom,
    eb: energyBalance(ctx, end), creatine: creatineDays(ctx, end) };
}
// what the energy balance means, in a sentence (null when there isn't enough to say)
export function balanceLine(F) {
  const b = F.eb; if (!b) return null;
  const kgw = v => `${v >= 0 ? '+' : '−'}${fmt(Math.abs(v), 2)} kg a week`, trend = `7-day average ${fmt(b.w0, 2)} → ${fmt(b.w1, 2)} kg over two weeks`;
  const cr = F.creatine && F.creatine <= 28 && b.slope >= -0.05 ? ` Creatine (day ${F.creatine}) holds a little extra water at first, so a steady scale can hide some fat loss.` : '';
  // steady weight says maintenance is what he ATE; that only vouches for the target when he ate about the target
  const off = F.T?.ok ? b.intake - F.T.kcal : 0;
  if (b.verdict === 'in' && b.phase === 'recomp' && Math.abs(off) > 150) return { good: true, text: `Weight steady on ${fmt(b.intake)} kcal a day (${trend}): that's your maintenance, about ${fmt(Math.round(Math.abs(off) / 10) * 10)} ${off < 0 ? 'under' : 'over'} the ${fmt(F.T.kcal)} target. A recomp runs on maintenance, so either eat to the target or let the 4-week check in Targets move it.${cr}` };
  if (b.verdict === 'in') return { good: true, text: b.phase === 'recomp'
    ? `Weight steady on ${fmt(b.intake)} kcal a day (${trend}): that's your maintenance, which is exactly what a recomp runs on. The calorie target is right and you're executing the plan.${cr}`
    : `Weight ${kgw(b.slope)} on ${fmt(b.intake)} kcal a day (${trend}): inside the ${b.phase === 'gain' ? 'lean-gain' : 'cut'} zone, so the target is doing its job.${cr}` };
  const gap = Math.round(Math.abs(b.intake - b.maint) / 10) * 10;
  return { good: false, text: `Weight ${kgw(b.slope)} on ${fmt(b.intake)} kcal a day (${trend}): about ${fmt(gap)} kcal a day ${b.slope < 0 ? 'under' : 'over'} maintenance (≈ ${fmt(Math.round(b.maint / 10) * 10)}), ${b.verdict === 'below' ? 'more of a deficit' : 'more of a surplus'} than ${b.phase === 'recomp' ? 'a recomp wants' : 'this phase wants'}.${F.T.ok ? ` Aim for the full ${fmt(F.T.kcal)}.` : ''}${cr}` };
}
export function weeklyHtml(F) {
  const good = [], fix = [], bl = balanceLine(F), short = F.cT - F.cardioEq;
  if (F.want != null) (F.gym >= F.want ? good : fix).push(F.gym >= F.want ? `Trained ${F.gym} times (plan: ${F.want}–${F.want + 1} a week)` : `${F.gym} gym session${F.gym === 1 ? '' : 's'} against ${F.want}–${F.want + 1} planned${F.gym && F.missed.length ? `; not trained this week: ${F.missed.map(esc).join(', ')}` : ''}`);
  if (bl) (bl.good ? good : fix).push(esc(bl.text));
  if (F.ups.length) good.push(`${F.ups.length} lift${F.ups.length === 1 ? '' : 's'} up on last time: ${F.ups.slice(0, 3).map(u => esc(u.said)).join('; ')}`);
  if (F.loadDue.length) good.push(`Ready for more load next time: ${F.loadDue.slice(0, 4).map(esc).join(', ')}`);
  if (F.open && F.logged >= F.open - 1) good.push(`Food logged on ${F.logged} of ${F.open} days`); else if (F.open) fix.push(`Food logged on ${F.logged} of ${F.open} days: the targets are only as good as the log`);
  if (F.hit != null && F.logged) (F.hit >= Math.max(1, F.logged - 1) ? good : fix).push(`Protein floor (${F.T.protein} g) hit on ${F.hit} of ${F.logged} logged days`);
  if (short <= 0) good.push(`Cardio ${fmt(F.cardioEq)} of ${F.cT} min${F.cardioVig ? ` (${fmt(F.cardioVig)} vigorous, counted twice)` : ''}`);
  else fix.push(`Cardio ${fmt(F.cardioEq)} of ${F.cT} min: ${fmt(short)} more, or ${fmt(Math.ceil(short / 2))} if it's vigorous`);
  // a brisk walk is about 100 steps a minute, so the gap in steps ÷ 100 is the walk that closes it (to the next 5 min, at most 60)
  if (F.steps != null) (F.steps >= F.stepT ? good : fix).push(`Steps ${fmt(F.steps)} a day against ${fmt(F.stepT)}${F.steps < F.stepT ? `: a ${fmt(Math.min(60, Math.ceil((F.stepT - F.steps) / 100 / 5) * 5))}-minute walk a day closes it` : ''}`);
  if (!F.weighed) fix.push('No weigh-in this week: Mon, Wed and Fri mornings keep the trend honest');
  if (F.downs.length && !F.ups.length) fix.push(`${F.downs.length} lift${F.downs.length === 1 ? '' : 's'} down on last time`);
  const focus = F.want != null && F.gym < F.want ? `Get to ${F.want} sessions${F.missed.length ? `, starting with ${esc(F.missed[0])}` : ''}: the plan only works at its frequency.`
    : F.hit != null && F.logged && F.hit < F.logged - 1 ? `Protein: ${F.T.protein} g every day. Front-load it: 40 g by lunch makes the floor easy.`
    : F.open && F.logged < F.open - 1 ? 'Log every day, even roughly.'
    : short > 30 ? `Cardio: ${fmt(Math.ceil(short / 2))} vigorous minutes, about 20 after each of your next sessions.`
    : F.ups.length ? 'Same again: one more rep or the next load on every first set.' : 'One more rep on the first set of each lift.';
  const stats = [`🏋️ <b>${F.gym}</b> gym${F.codes.length ? ' (' + F.codes.map(esc).join(', ') + ')' : ''}${F.cardioN ? ` · ${F.cardioN} cardio or sport${F.cardioMin ? ', ' + fmt(F.cardioMin) + ' min' : ''}` : ''}${F.lightN ? ` · ${F.lightN} light cardio${F.lightMin ? ', ' + fmt(F.lightMin) + ' min (not counted)' : ''}` : ''}`,
    `🏃 <b>${fmt(F.cardioEq)}</b> / ${F.cT} min cardio${F.cardioVig ? ` (vigorous ×2)` : ''}`,
    F.logged ? `🍽 <b>${fmt(F.kcal)}</b> kcal · <b>${fmt(F.prot)}</b> g protein a day${F.T.ok ? ` (targets ${fmt(F.T.kcal)} / ${F.T.protein})` : ''}` : '🍽 Nothing complete logged',
    F.away ? `🏝 Away ${F.away === 1 ? dLong(F.awayFrom) : dLong(F.awayFrom) + ' – ' + dLong(F.awayTo)}: not counted` : '',
    F.steps != null ? `👟 <b>${fmt(F.steps)}</b> steps a day (${F.stepHit} of ${F.stepDays} day${F.stepDays === 1 ? '' : 's'} at ${fmt(F.stepT / 1000)}k)` : '',
    F.wNow != null ? `⚖️ <b>${fmt(F.wNow, 2)} kg</b> 7-day avg${F.wPrev != null ? ` (${F.wNow - F.wPrev >= 0 ? '+' : '−'}${fmt(Math.abs(F.wNow - F.wPrev), 2)} kg on the week before)` : ''}` : ''].filter(Boolean);
  return { head: `📊 <b>Your week</b> · ${dLong(F.from)} – ${dLong(F.end)}`, stats: stats.join('\n'), good: good.length ? '✅ <b>Went well</b>\n' + good.map(x => '• ' + x).join('\n') : '', fix: fix.length ? '🛠 <b>To improve</b>\n' + fix.map(x => '• ' + x).join('\n') : '', focus };
}
// the coach's note and the focus sit at the bottom in a quote block, as in the session review
export const joinWeekly = (H, note) => [H.head, H.stats, H.good, H.fix, `<blockquote>🧭 <b>Coach</b>${note ? '\n' + esc(note) : ''}\n🎯 <b>Next week:</b> ${H.focus}</blockquote>`].filter(Boolean).join('\n\n');
const WEEKLY_SYSTEM = `You are Sam's coach writing the retrospective at the bottom of his weekly review; the numbers are listed above it, so don't repeat them line by line. British English, plain text only (no markdown, lists or emoji), four to six sentences. Open with a one-line verdict on the week. Then say what the numbers MEAN, picking the one or two that matter most: for example weight steady on the target calories means maintenance is confirmed and he is executing the recomp correctly; lifts going up means progressive overload is working; missed sessions mean those muscles got less than the plan needs. Then what to do next week and why, and end with one short line of encouragement, like a good coach: direct, warm, never gushing. Use ONLY the facts given: never state a number, load or target that is not in them, and never contradict them. Sam's aim is muscle growth with strength rising, at about 12% body fat.`;
export async function weeklyReview(env, ctx, end, { store = true } = {}) {
  const F = weeklyFacts(ctx, end), H = weeklyHtml(F);
  const note = await coachNote(env, 'weekly review', [H.stats, H.good, H.fix, 'Focus: ' + H.focus].join('\n').replace(/<[^>]+>/g, ''), WEEKLY_SYSTEM);
  const html = joinWeekly(H, note);
  if (store && env.DB) await saveCoach(env, { kind: 'weekly', from: F.from, end: F.end, title: `${dLong(F.from)} – ${dLong(F.end)}`, html, note, focus: H.focus.replace(/<[^>]+>/g, '') });
  return html;
}
// the 'coach' config document: the last 26 reviews, newest last; a new review of the same week replaces the old one
export async function saveCoach(env, msg) {
  const doc = (await getConfig(env, 'coach')) || { msgs: [] };
  const msgs = (doc.msgs || []).filter(m => !(m.kind === msg.kind && m.end === msg.end));
  msgs.push({ id: uid(), at: Date.now(), ...msg });
  msgs.sort((a, b) => a.end < b.end ? -1 : a.end > b.end ? 1 : a.at - b.at);
  await putConfig(env, 'coach', { ...doc, msgs: msgs.slice(-26) });
}
