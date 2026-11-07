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
import { today } from '../src/util.js';
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
console.log(fails ? fails + ' FAILED' : 'ALL PASSED (with stubs)');
