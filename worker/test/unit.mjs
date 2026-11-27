// Pure-function checks for away/quiet logic. Run: node test/unit.mjs
import { quietState, lastDataBefore, parseAwayArgs, awayOn, hasData } from '../src/extras.js';
let fails = 0; const check = (n, c, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); if (!c) fails++; };
const day = (date, o = {}) => ({ date, ...o });
const ctx = { config: {}, days: [day('2026-12-01', { items: [{ kcal: 1 }] }), day('2026-12-02', { body: { w: 72 } }), day('2026-12-03', {}), day('2026-12-04', { supps: {} })] };
check('empty doc is not data', !hasData(ctx.days[2]) && !hasData(ctx.days[3]));
check('last data before', lastDataBefore(ctx, '2026-12-06') === '2026-12-02');
check('1 empty day: not quiet', !quietState(ctx, '2026-12-03').quiet);
check('2 empty days: not quiet yet', !quietState(ctx, '2026-12-04').quiet);
check('3rd day with nothing: quiet (gap)', quietState(ctx, '2026-12-05').quiet && quietState(ctx, '2026-12-05').why === 'gap');
check('logging today ends quiet', !quietState({ ...ctx, days: [...ctx.days, day('2026-12-09', { items: [{}] })] }, '2026-12-09').quiet);
const ctx2 = { ...ctx, config: { away: { ranges: [{ from: '2026-12-03', to: '2026-12-04' }, { from: '2026-12-20', to: null }] } } };
check('away range', quietState(ctx2, '2026-12-03').why === 'away' && !awayOn(ctx2, '2026-12-05') && !!awayOn(ctx2, '2027-01-02'));
check('/away 7', JSON.stringify(parseAwayArgs('2026-12-01', ['7'])) === '{"from":"2026-12-01","to":"2026-12-07"}');
check('/away date', parseAwayArgs('2026-12-01', ['2026-12-28']).to === '2026-12-28');
check('/away open', parseAwayArgs('2026-12-01', []).to === null);
check('/away words → Claude', parseAwayArgs('2026-12-01', ['until', 'the', '28th']) === null);
// 24 Nov 2026: rest between sets: the plan's value wins, else 3 min when the range starts at 6 or fewer, else 2
import { restMin, restLine } from '../src/model.js';
check('rest: plan value wins', restMin({ reps: '8-12', rest: 3 }) === 3 && restMin({ reps: '6-10', rest: 2 }) === 2);
check('rest: rule without one', restMin({ reps: '6-10' }) === 3 && restMin({ reps: '8-12' }) === 2 && restMin({}) === 2);
check('rest: one-liner is the first sentence', restLine({ rest: '3′ on the press, 2′ on everything else. Why it is so.' }) === '3′ on the press, 2′ on everything else.' && restLine({}) === '');
// 27 Nov 2026: "remove the chocolate": which logged thing his words point at
import { matchScore } from '../src/edit.js';
check('remove: whole words match', matchScore('chocolate', 'Milk chocolate, 2 squares') === 1 && matchScore('the golf', 'Golf: driving range') === 1);
check('remove: a 4+ letter start counts half, unrelated words none', matchScore('choc', 'Milk chocolate') === .5 && matchScore('banana', 'Test apple, made up') === 0 && matchScore('', 'Cheddar') === 0);
// 27 Nov 2026: cardio intensity. Vigorous minutes count twice, light ones not at all (WHO: 150 moderate = 75 vigorous)
import { cardioIntensity } from '../src/model.js';
{ const walk = cardioIntensity({ kind: 'walk', label: 'Cardio: incline walk 12% at 3 mph', note: 'Incline 12, 3 mph', min: 21 }, 75);
  const bike = cardioIntensity({ kind: 'cycle', label: 'Cycling', note: 'Average 110 W', min: 45 }, 75);
  const easyBike = cardioIntensity({ kind: 'cycle', label: 'Cycling', watts: 50, min: 30 }, 75);
  check('intensity: 12% at 3 mph ≈ 8.3 METs, vigorous, 21 min counts 42', walk.met === 8.3 && walk.band === 'vigorous' && walk.eq === 42 && walk.basis === '12% at 3 mph', JSON.stringify(walk));
  check('intensity: 110 W at 75 kg ≈ 6.5 METs, vigorous; 50 W moderate', bike.met === 6.5 && bike.band === 'vigorous' && bike.eq === 90 && easyBike.band === 'moderate' && easyBike.eq === 30, JSON.stringify([bike, easyBike]));
  const felt = cardioIntensity({ kind: 'swim', min: 30, effort: 'vigorous' }), none = cardioIntensity({ kind: 'swim', min: 30 }), golf = cardioIntensity({ kind: 'golf', min: 120 }), ball = cardioIntensity({ kind: 'football', min: 60 }), kmh = cardioIntensity({ kind: 'run', label: 'Run', note: '10 km/h, flat', min: 30 });
  check('intensity: by feel, by kind, golf light, km/h converted', felt.eq === 60 && none.band === 'moderate' && none.eq === 30 && golf.eq === 0 && golf.band === 'light' && ball.eq === 120 && kmh.band === 'vigorous' && kmh.met > 9, JSON.stringify({ felt, none, golf, ball, kmh }));
}
// 27 Nov 2026: what the weekly review says the energy balance means (made-up weights and intakes)
import { energyBalance, balanceLine } from '../src/weekly.js';
{ const T0 = today(), D = n => addDaysU(T0, -n), mk = (w, k) => Array.from({ length: 15 }, (_, i) => ({ date: D(i + 1), items: [{ kcal: k, p: 150 }], body: i % 2 ? undefined : { w: w(i) } }));
  const flat = { settings: { phase: 'recomp' }, config: {}, days: mk(() => 72.5, 2600) }, down = { settings: { phase: 'recomp' }, config: {}, days: mk(i => 72 + i * 0.07, 2300) };
  const bf = energyBalance(flat, T0), bd = energyBalance(down, T0), lf = balanceLine({ eb: bf, T: { ok: true, kcal: 2600 } }), ld = balanceLine({ eb: bd, T: { ok: true, kcal: 2600 } });
  check('weekly: steady weight on the target = maintenance, said as the plan working', bf.verdict === 'in' && lf.good && /that's your maintenance/.test(lf.text) && /executing the plan/.test(lf.text), lf.text);
  const lo = balanceLine({ eb: energyBalance({ settings: { phase: 'recomp' }, config: {}, days: mk(() => 72.5, 2200) }, T0), T: { ok: true, kcal: 2600 } });
  check('weekly: steady weight well under the target = maintenance is lower than the target, said so', lo.good && /400 under the 2,600 target/.test(lo.text), lo.text);
  // the 27 Nov case: one high weigh-in alone in an early week doesn't make a flat month read as a deficit
  // made-up weights
  const spike = { settings: { phase: 'recomp' }, config: {}, days: Array.from({ length: 26 }, (_, i) => ({ date: D(i + 1), items: [{ kcal: 2600, p: 155 }], body: i % 2 ? undefined : { w: i === 18 ? 81.2 : [80.1, 79.7, 79.9, 80.3, 80.0, 79.6][i % 6] } })) };
  const bs = energyBalance(spike, T0);
  check('weekly: one odd weigh-in can\'t swing the four-week trend', bs && bs.verdict === 'in' && Math.abs(bs.slope) < 0.125, JSON.stringify(bs && { slope: bs.slope, v: bs.verdict, n: bs.weighins }));
  check('weekly: weight falling on a recomp = a deficit, with its size and the target', bd.verdict === 'below' && !ld.good && /under maintenance/.test(ld.text) && /Aim for the full 2,600/.test(ld.text), ld.text);
}
// double progression with sets to failure
import { addLoadDue } from '../src/model.js';
const pe9 = { reps: '8-12', rpe: 9 }, pe10 = { reps: '10-15', rpe: 10 };
check('add load: top of range at RPE 9', addLoadDue(pe9, { sets: [{ r: 12, rpe: 9 }] }));
check('no add load: RPE 10 on an RPE 9 plan', !addLoadDue(pe9, { sets: [{ r: 12, rpe: 10 }] }));
check('add load: to-failure plan, top of range at RPE 10', addLoadDue(pe10, { sets: [{ r: 15, rpe: 10 }] }));
check('no add load: below the top of the range', !addLoadDue(pe10, { sets: [{ r: 13, rpe: 10 }] }));
check('add load: no RPE logged', addLoadDue(pe10, { sets: [{ r: 15 }] }));
// 7 Nov 2026: food helpers (repeats, presets, how much closes the day)
import { normaliseItems, allKnown, presetEntry, howMuch } from '../src/food.js';
import { targets } from '../src/model.js';
import { today, addDays as addDaysU } from '../src/util.js';
const TDu = today();
const fctx = { settings: { height: 172, dob: '2001-09-17', mult: 1.55, protFloor: 145, protPerKg: 2.15, sex: 'm', phase: 'recomp' }, config: {},
  library: [{ id: 'chick', n: 'Chicken breast, cooked', q: 100, u: 'g', m: [190, 31, 0, 6.4] }, { id: 'oats', n: 'Overnight oats', q: 1, u: 'serving', m: [766, 58.4, 108.7, 11.8], al: ['oats'] }],
  days: [{ date: TDu, body: { w: 72.5 }, items: [{ id: 'k1', n: 'Pork belly', q: 238, u: 'g', kcal: 922, p: 39.3, c: 11.9, f: 79.7, est: true }, { id: 'x1', kcal: 900, p: 60, c: 100, f: 20, q: 1, u: 'serving', n: 'Lunch' }] }] };
const ni = normaliseItems(fctx, [{ name: 'pork', qty: 119, unit: 'g', ref: 'k1' }, { name: 'chicken', qty: 150, unit: 'g', libId: 'chick' }]);
check('ref rescales the logged item', ni[0].kcal === 461 && ni[0].ref === 'k1' && ni[0].est === true, JSON.stringify(ni[0]));
check('repeats + library are known, so no confirm', allKnown(ni) && !allKnown(normaliseItems(fctx, [{ name: 'x', qty: 1, unit: 'serving', kcal: 100 }])));
const pe = presetEntry(fctx, { name: 'standard overnight oats', aliases: ['my oats'], replaces: 'oats', servings: 2 }, normaliseItems(fctx, [{ name: 'chicken', qty: 200, unit: 'g', libId: 'chick' }]));
check('preset replaces in place, halves for 2 servings, keeps aliases', pe.entry.id === 'oats' && pe.entry.m[0] === 190 && pe.entry.al.join() === 'oats,my oats,standard overnight oats', JSON.stringify({ m: pe.entry.m, al: pe.entry.al }));
const T = targets(fctx), kl = T.kcal - 1822, pl = T.protein - 99.3;
const h = howMuch(fctx, { food: { libId: 'chick' }, aim: 'close' });
check('how much: chicken, protein-bound', h.q === Math.round(Math.min(pl / 0.31, kl / 1.9) / 10) * 10 && h.bound === (kl / 1.9 < pl / 0.31 ? 'kcal' : 'protein'), `${h.q} g, kl ${kl}, pl ${pl}`);
const h2 = howMuch(fctx, { food: { ref: 'k1' }, aim: 'close', have: { qty: 100, unit: 'g' } });
check('how much: capped by what is left over', h2.q === 100 && h2.capped);
check('how much: unknown food → a reason', !!howMuch(fctx, { food: { name: 'mystery' } }).why);
// 13 Nov 2026: "how much chilli and white rice closes the day?" → combinations at his usual ratio, chilli alone, closers
import { closeDay, closeHtml, usualRatio } from '../src/close.js';
const cctx = { ...fctx, library: [...fctx.library, { id: 'rice', n: 'White rice, cooked', q: 100, u: 'g', m: [130, 2.7, 28.2, 0.3], d: 150 },
    { id: 'p-shake', n: 'Standard protein shake', q: 1, u: 'serving', m: [406, 35.7, 27.5, 17.3], al: ['protein shake'], parts: [] },
    { id: 'tuna', n: 'Tuna chunks in spring water (drained)', q: 100, u: 'g', m: [109, 24.9, 0, 1], d: 102 }, { id: 'banana', n: 'Banana', q: 1, u: 'serving', m: [105, 1.3, 27, 0.4] },
    { id: 'ched', n: 'Cheddar cheese', q: 100, u: 'g', m: [416, 25.4, 0.1, 34.9] }, { id: 'digestive', n: 'Digestive biscuit (McVitie’s)', q: 1, u: 'serving', m: [71, 1, 9.3, 3.1] }],
  days: [{ date: TDu, body: { w: 72.5 }, items: [{ id: 'c1', n: 'Homemade chilli con carne (beef, beans)', q: 300, u: 'g', kcal: 330, p: 27, c: 26, f: 13, est: true },
    { id: 'r1', n: 'White rice, cooked', q: 140, u: 'g', kcal: 182, p: 3.8, c: 39.5, f: 0.4, lib: 'rice' }, { id: 'l1', n: 'Lunch', q: 1, u: 'serving', kcal: 0, p: 0, c: 60, f: 40 }] }] };
// the rest of the day: 800 kcal and 45 g protein left after the chilli and rice (made-up numbers)
{ const T0 = targets(cctx), l = cctx.days[0].items[2]; l.kcal = T0.kcal - 800 - 512; l.p = T0.protein - 45 - 30.8; }
const cd = closeDay(cctx, { foods: [{ name: 'chilli', said: 'chilli', ref: 'c1' }, { name: 'white rice', said: 'white rice', libId: 'rice' }], aim: 'close' });
const Tc = targets(cctx), o1 = cd.opts[0], alone = cd.opts.find(o => o.tag === 'alone'), less = cd.opts.find(o => o.tag === 'less'), more = cd.opts.find(o => o.tag === 'more');
check('close: usual ratio from the day he ate both', Math.abs(cd.r - 140 / 300) < 1e-9 && cd.U2.ex.qa === 300, String(cd.r));
check('close: #1 closes calories and protein together, at a ratio near his usual', o1.tag === 'both' && Math.abs(o1.nk - Tc.kcal) < 15 && Math.abs(o1.np - Tc.protein) < 2.5 && o1.qb / o1.qa < 2 * cd.r && o1.qb / o1.qa > 0.5 * cd.r, JSON.stringify(o1));
check('close: chilli alone, less rice and more rice are there too', alone && alone.qb === 0 && less && more && less.qb < o1.qb && more.qb > o1.qb, cd.opts.map(o => `${o.tag} ${o.qa}/${o.qb}`).join(' · '));
check('close: closers come from his staples, protein-first while protein is short', cd.closers.length >= 2 && cd.closers[0].name === 'A tin of tuna' && cd.all.some(c => /digestives/.test(c.name)), cd.closers.map(c => c.name).join(', '));
const chtml = closeHtml(cd);
check('close: reply names both foods, the ratio it used and where each option lands', /chilli \+ \d+ g white rice/.test(chtml) && /your usual is 300 g chilli to 140 g white rice/.test(chtml) && /Chilli only/.test(chtml) && /Or bridge it with a closer/.test(chtml), chtml.split('\n').slice(0, 4).join(' | '));
console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
// welcome-back with a stubbed env (D1 + Telegram)
import { welcomeBack } from '../src/extras.js';
const kv = new Map(), sent = [], cfg = {};
const env = { TELEGRAM_TOKEN: 'x', ALLOWED_TELEGRAM_ID: '1', TELEGRAM_API: 'http://stub', DB: { prepare: sql => ({ bind: (...a) => ({
  first: async () => /FROM kv/.test(sql) ? (kv.has(a[0]) ? { v: kv.get(a[0]) } : null) : null,
  run: async () => { if (/INTO kv/.test(sql)) kv.set(a[0], a[1]); if (/INTO config/.test(sql)) cfg[a[0]] = JSON.parse(a[1]); return { meta: { changes: 1 } }; } }) }) } };
globalThis.fetch = async (u, o) => { sent.push(JSON.parse(o.body)); return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } })); };
const gctx = { config: { away: { ranges: [{ from: '2026-12-20', to: null }] } }, days: [day('2026-12-18', { body: { w: 72.6 } }), day('2026-12-19', { items: [{ kcal: 1 }] })] };
await welcomeBack(env, gctx, '2026-12-28');
check('welcome back after 8 empty days', /Welcome back/.test(sent[0]?.text) && /8 days/.test(sent[0].text) && /Sun 20 Dec to Sun 27 Dec/.test(sent[0].text) && /Away mode is off/.test(sent[0].text), (sent[0]?.text || '').slice(0, 140));
check('open away range closed at yesterday', cfg.away?.ranges[0]?.to === '2026-12-27');
await welcomeBack(env, gctx, '2026-12-28');
check('only once per gap', sent.length === 1);
// 14 Nov 2026: the coach (made-up figures)
import { reviewExercise, reviewSession, sessionReviewHtml, joinReview, loadStep, weeklyFacts, weeklyHtml, setsShort } from '../src/coach.js';
{
  const top = reviewExercise({ reps: '6-10' }, { n: 'Incline DB bench', sets: [{ kg: 30, r: 10 }, { kg: 30, r: 8 }] }, { date: '2026-10-01', sets: [{ kg: 30, r: 9 }] });
  check('coach: top of range → next load, bottom of range', top.status === 'top' && /^32 kg, aim 6–8$/.test(top.next) && top.up === 1, JSON.stringify(top));
  const mid = reviewExercise({ reps: '8-12' }, { n: 'Tricep pushdown', sets: [{ kg: 20, r: 9 }, { kg: 20, r: 9 }] }, null);
  check('coach: in range → same load, one more rep', mid.status === 'in' && /^20 kg, aim 10–11 on the first set$/.test(mid.next) && /goes to 22.5 kg/.test(mid.why), JSON.stringify(mid));
  const hv = reviewExercise({ reps: '8-12' }, { n: 'Pec deck', sets: [{ kg: 40, r: 6 }, { kg: 40, r: 5 }, { kg: 40, r: 3 }] }, { date: '2026-10-01', sets: [{ kg: 50, r: 10 }] });
  check('coach: under the range → about 10% off, and the drop-off note', hv.status === 'heavy' && /^35 kg, aim 8–10$/.test(hv.next) && hv.rest === true && hv.up === -1, JSON.stringify(hv));
  // 24 Nov 2026: every set has to land in the range, and the dot compares with the last few sessions (made-up loads)
  const dr = reviewExercise({ reps: '6-10' }, { n: 'Incline DB bench', sets: [{ kg: 24, r: 9 }, { kg: 24, r: 5 }] }, { date: '2026-11-14', sets: [{ kg: 26, r: 8 }, { kg: 26, r: 8 }] });
  check('coach: set 2 under the range → hold the load, 3 minutes rest, not counted as every set in range', dr.status === 'drop' && dr.allIn === false && dr.setsIn === 1 && /^24×9, 6\+ · rest 3′$/.test(dr.nextShort) && /3 minutes/.test(dr.next), JSON.stringify(dr));
  const dr2 = reviewExercise({ reps: '6-10' }, { n: 'Incline DB bench', sets: [{ kg: 24, r: 8 }, { kg: 24, r: 4 }] }, { date: '2026-11-20', sets: [{ kg: 24, r: 9 }, { kg: 24, r: 5 }] });
  check('coach: set 2 under the range twice at the same load → back-off set 10% lighter', dr2.status === 'drop' && /^24×8, then 22×6\+$/.test(dr2.nextShort), JSON.stringify(dr2));
  const tp2 = reviewExercise({ reps: '6-10' }, { n: 'Incline DB bench', sets: [{ kg: 24, r: 10 }, { kg: 24, r: 5 }] }, null);
  check('coach: top on set 1 but set 2 under → no load jump yet', tp2.status === 'drop' && !/↑/.test(tp2.nextShort), JSON.stringify(tp2));
  const hs = [{ date: '2026-11-20', sets: [{ kg: 20, r: 7 }] }, { date: '2026-11-15', sets: [{ kg: 20, r: 10 }] }, { date: '2026-11-10', sets: [{ kg: 20, r: 10 }] }];
  const tr = reviewExercise({ reps: '8-12' }, { n: 'Cable curl', sets: [{ kg: 20, r: 9 }, { kg: 20, r: 9 }] }, hs[0], hs);
  check('coach: the dot compares with the average of the last 3 sessions, not last time alone (up on last time, level on the average)', tr.up === 0 && /average of the last 3/.test(tr.ref) && tr.allIn, JSON.stringify({ up: tr.up, ref: tr.ref }));
  const { finishNote } = await import('../src/coach.js');
  check('coach: a note cut off mid-sentence ends at its last full sentence', finishNote('Strong session overall. Six of seven in range. The clear MI') === 'Strong session overall. Six of seven in range.' && finishNote('All good.') === 'All good.' && finishNote('no stop at all') === '', finishNote('Strong session overall. The clear MI'));
  const bw = reviewExercise({ reps: '6-10' }, { n: 'Weighted dip (+kg)', sets: [{ kg: null, r: 10 }] }, null);
  check('coach: bodyweight at the top → add load', /add 2.5 kg/.test(bw.next), bw.next);
  check('coach: load steps', loadStep('Incline DB bench') === 2 && loadStep('Seated leg curl') === 5 && loadStep('Cable lateral raise') === 2.5 && loadStep('Smith machine chest press') === 5);
  const plan = { start: '2026-12-01', length: 28, perWeek: 5.6, sessions: [{ code: 'A', name: 'Day A', ex: [{ n: 'Incline DB bench', sets: 2, reps: '6-10' }, { n: 'Machine chest press', sets: 2, reps: '6-10' }, { n: 'Pec deck', sets: 3, reps: '8-12' }] }, { code: 'B', name: 'Day B', ex: [] }] };
  const cx = { plan, settings: {}, days: [{ date: '2026-11-20', workouts: [{ kind: 'gym', ex: [{ n: 'Incline DB bench', sets: [{ kg: 30, r: 8 }] }] }] }] };
  const R = reviewSession(cx, plan.sessions[0], [{ n: 'Incline DB bench', sets: [{ kg: 28, r: 8 }] }, { n: 'Smith machine chest press', sets: [{ kg: 40, r: 8 }] }]);
  check('coach: a swap is spotted, the rest is listed as not logged, first rotation is calibration', R.swaps.length === 1 && R.swaps[0].from === 'Machine chest press' && R.swaps[0].to === 'Smith machine chest press' && R.skipped.join() === 'Pec deck' && R.calib, JSON.stringify({ s: R.swaps, k: R.skipped, c: R.calib }));
  // 15 Nov 2026 layout: a line per lift with a dot and a shorthand next target; the coach's note and focus in a quote at the bottom
  const H0 = sessionReviewHtml(R, 'A · Day A', '2026-11-21'), msg = joinReview(H0, 'A note.', '⏭ Next: <b>B · Day B</b>');
  check('coach: one line per lift, dot and shorthand next, note and focus at the bottom, calibration in the facts', /🔴 <b>Incline DB bench<\/b>  28×8  →  <code>28×9<\/code>/.test(msg) && /⚪ <b>Smith machine chest press<\/b>  40×8  →  <code>40×9<\/code>/.test(msg)
    && /<blockquote>🧭 <b>Coach<\/b>\nA note\.\n🎯 <b>Next time:<\/b>/.test(msg) && /Not logged: Pec deck/.test(msg) && msg.indexOf('blockquote') > msg.indexOf('Smith') && /calibration/.test(H0.facts) && /⏭ Next/.test(msg), msg.replace(/\n/g, ' | ').slice(0, 500));
  check('coach: shorthand next targets', top.nextShort === '↑ 32×6–8' && mid.nextShort === '20×10' && hv.nextShort === '↓ 35×8–10' && bw.nextShort === '↑ +2.5×6–8', [top.nextShort, mid.nextShort, hv.nextShort, bw.nextShort].join(' | '));
  check('coach: sets in shorthand', setsShort([{ kg: 42.5, r: 9 }, { kg: 42.5, r: 8 }]) === '42.5×9,8' && setsShort([{ kg: null, r: 8 }, { kg: null, r: 6 }]) === 'BW×8,6' && setsShort([{ kg: 40, r: 10 }, { kg: 42.5, r: 8 }]) === '40×10, 42.5×8');
  // the week ending today (made-up figures): today and away days don't count towards food (15 Nov 2026)
  const T0 = today(), D = n => addDaysU(T0, -n);
  const wk = { plan, settings: {}, config: { away: { ranges: [{ from: D(5), to: D(4) }] } }, days: [
    { date: D(6), items: [{ kcal: 2000, p: 100 }], workouts: [{ kind: 'gym', planCode: 'A', ex: [{ n: 'Incline DB bench', sets: [{ kg: 32, r: 8 }] }] }] },
    { date: D(5), items: [{ kcal: 900, p: 40 }] }, { date: D(3), items: [{ kcal: 2200, p: 120 }], workouts: [{ kind: 'walk', min: 25 }, { kind: 'golf', min: 120 }] },
    { date: T0, items: [{ kcal: 600, p: 30 }] }, { date: D(20), workouts: [{ kind: 'gym', ex: [{ n: 'Incline DB bench', sets: [{ kg: 30, r: 8 }] }] }] }] };
  const F = weeklyFacts(wk, T0), H = weeklyHtml(F);
  check('weekly: away days and today left out of food; sessions planned scale with the days away', F.logged === 2 && F.open === 4 && F.away === 2 && Math.round(F.kcal) === 2100 && F.want === 4 && F.gym === 1 && F.cardioMin === 25 && F.ups.map(u => u.n).join() === 'Incline DB bench' && /Incline DB bench 30×8 → 32×8/.test(H.good) && /Get to 4 sessions/.test(H.focus) && /Away/.test(H.stats), JSON.stringify({ l: F.logged, o: F.open, a: F.away, k: F.kcal, w: F.want, f: H.focus }));
  check('weekly: golf is reported as light activity, not cardio (23 Nov 2026)', F.cardioMin === 25 && F.cardioN === 1 && F.lightN === 1 && F.lightMin === 120 && /1 light cardio, 120 min/.test(H.stats || JSON.stringify(H)), JSON.stringify({ c: F.cardioMin, n: F.cardioN, l: F.lightN, lm: F.lightMin }));
}
// 14 Nov 2026: steps from the Shortcut (made-up counts)
import { parseSteps } from '../src/index.js';
{
  const td = today(), y = addDaysU(td, -1), y2 = addDaysU(td, -2);
  const a = parseSteps(`${td}=1,234;${y}=8,432;${y2} = 10234.0`, td);
  check('steps: text pairs, commas and decimals', JSON.stringify(a) === JSON.stringify([[y2, 10234], [y, 8432], [td, 1234]]), JSON.stringify(a));
  check('steps: a bare number is for the date', JSON.stringify(parseSteps('7,500', y)) === JSON.stringify([[y, 7500]]));
  check('steps: object and list forms', parseSteps({ [y]: 9000 }, td)[0][1] === 9000 && parseSteps([{ date: y, steps: 9100 }], td)[0][1] === 9100);
  check('steps: future, too old and nonsense dropped', parseSteps(`${addDaysU(td, 1)}=5;2020-01-01=5;hello`, td).length === 0);
  check('steps: 400-day window for the one-off import (18 Nov 2026)', parseSteps(`${addDaysU(td, -200)}=6000;${addDaysU(td, -399)}=5;${addDaysU(td, -401)}=5`, td).length === 2);
}
console.log(fails ? fails + ' FAILED' : 'ALL PASSED (with stubs)');
