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
