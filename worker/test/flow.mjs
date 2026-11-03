// End-to-end flow test against `wrangler dev` + test/mock.mjs. Run: node test/flow.mjs <seed.json>
import crypto from 'crypto';
import fs from 'fs';
const W = 'http://127.0.0.1:8787', M = 'http://127.0.0.1:9999';
const secret = crypto.createHash('sha256').update('tg:123:abc').digest('hex').slice(0, 48);
let uid = 1000; const results = []; let fails = 0;
const check = (name, cond, extra = '') => { results.push((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); if (!cond) fails++; };
const mcp = async (method, params, id = 1) => (await (await fetch(W + '/mcp', { method: 'POST', headers: { authorization: 'Bearer testkey', 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id, method, params }) })).json());
const tool = async (name, args) => { const r = await mcp('tools/call', { name, arguments: args }); if (r.result?.isError) throw new Error(name + ': ' + r.result.content[0].text); return r.result.structuredContent; };
const tgSend = async (message) => fetch(W + '/telegram', { method: 'POST', headers: { 'x-telegram-bot-api-secret-token': secret, 'content-type': 'application/json' }, body: JSON.stringify({ update_id: ++uid, message: { message_id: uid, from: { id: 5016806156 }, chat: { id: 5016806156 }, date: 0, ...message } }) });
const tgCb = async (data) => fetch(W + '/telegram', { method: 'POST', headers: { 'x-telegram-bot-api-secret-token': secret, 'content-type': 'application/json' }, body: JSON.stringify({ update_id: ++uid, callback_query: { id: 'cb' + uid, from: { id: 5016806156 }, data, message: { message_id: 5 } } }) });
const calls = async () => (await (await fetch(M + '/calls')).json());
const reset = () => fetch(M + '/reset');
const lastMsg = async () => { const c = (await calls()).filter(x => x.api === 'tg' && x.method === 'sendMessage'); return c[c.length - 1]?.body; };

const seed = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
// --- auth + MCP basics
check('mcp rejects missing key', (await fetch(W + '/mcp', { method: 'POST', body: '{}' })).status === 401);
const init = await mcp('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } });
check('mcp initialize', init.result?.serverInfo?.name === 'health-db');
const notif = await fetch(W + '/mcp', { method: 'POST', headers: { authorization: 'Bearer testkey', 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) });
check('mcp notification → 202', notif.status === 202);
const list = await mcp('tools/list', {});
check('tools/list', list.result.tools.length >= 10, list.result.tools.map(t => t.name).join(','));
check('get_rev readOnly', list.result.tools.find(t => t.name === 'get_rev').annotations.readOnlyHint === true);
const imp = await tool('import_data', { days: seed.days, config: seed.config, mode: 'missing' });
check('import_data', imp.days === seed.days.length && imp.config === 4, JSON.stringify(imp));
const imp2 = await tool('import_data', { days: seed.days, config: seed.config, mode: 'missing' });
check('import_data idempotent', imp2.days === 0 && imp2.config === 0);
const snap = await tool('get_snapshot', {});
check('snapshot', snap.days.length === seed.days.length && snap.config.library.items.length > 40);
const rev0 = snap.rev;

// --- Telegram: wrong secret, wrong user
check('webhook rejects bad secret', (await fetch(W + '/telegram', { method: 'POST', body: '{}' })).status === 403);
await reset();
await fetch(W + '/telegram', { method: 'POST', headers: { 'x-telegram-bot-api-secret-token': secret, 'content-type': 'application/json' }, body: JSON.stringify({ update_id: ++uid, message: { from: { id: 1 }, chat: { id: 1 }, text: 'hi' } }) });
check('ignores strangers', (await calls()).length === 0);

// --- library-matched food → logged straight away with undo
await reset();
await tgSend({ text: '2 tins of tuna and 60g heinz light mayo' });
let m = await lastMsg();
check('certain food auto-logged', /Logged/.test(m?.text) && /Undo/.test(JSON.stringify(m?.reply_markup)), (m?.text || '').split('\n')[0]);
let day = (await tool('get_day', { date: '2026-11-02' })).day;
const tunaItems = day.items.filter(i => i.src === 'telegram');
check('library macros recomputed server-side', tunaItems.length === 2 && tunaItems[0].kcal === 222 && tunaItems[1].kcal === 160, tunaItems.map(i => i.n + ' ' + i.kcal).join(' / '));
// undo via button
const undoTok = JSON.parse(JSON.stringify(m.reply_markup)).inline_keyboard[0][0].callback_data;
await tgCb(undoTok);
day = (await tool('get_day', { date: '2026-11-02' })).day;
check('undo removes them', day.items.filter(i => i.src === 'telegram').length === 0);

// --- dedupe: same update twice
await reset();
const u = { update_id: 777777, message: { message_id: 1, from: { id: 5016806156 }, chat: { id: 5016806156 }, text: '/today' } };
for (let i = 0; i < 2; i++) await fetch(W + '/telegram', { method: 'POST', headers: { 'x-telegram-bot-api-secret-token': secret, 'content-type': 'application/json' }, body: JSON.stringify(u) });
check('duplicate update processed once', (await calls()).filter(c => c.method === 'sendMessage').length === 1);
check('/today shows totals', /Protein/.test((await lastMsg()).text), (await lastMsg()).text.split('\n').slice(0, 2).join(' | '));

// --- unknown dish → research → proposal → correction → confirm
await reset();
await tgSend({ text: "shepherd's pie, full plate, with green beans and gravy" });
let cs = await calls();
check('research uses Sonnet with web search', cs.some(c => c.api === 'claude' && c.model === 'claude-sonnet-5-5' && c.tools), cs.filter(c => c.api === 'claude').map(c => c.model).join(','));
m = await lastMsg();
check('proposal asks first', /Check this/.test(m.text) && /ok:/.test(JSON.stringify(m.reply_markup)), m.text.split('\n').slice(0, 3).join(' | '));
await reset();
await tgSend({ text: 'it was beef not lamb' });
m = await lastMsg();
check('correction produces new proposal', /beef/i.test(m.text) && /Check this/.test(m.text), m.text.split('\n')[1]);
await reset();
await tgSend({ text: 'yes' });
m = await lastMsg();
check('yes commits', /Logged 3 items/.test(m.text), m.text.split('\n').join(' | ').slice(0, 160));
day = (await tool('get_day', { date: '2026-11-02' })).day;
check('pie in the day', day.items.some(i => /beef/i.test(i.n) && i.est), String(day.items.length));

// --- weight from text, then from a photo (smm % → kg)
await reset();
await tgSend({ text: 'weighed 72.4kg 16.8% this morning' });
check('weight text saved', /Weigh-in saved/.test((await lastMsg()).text));
await reset();
await tgSend({ photo: [{ file_id: 'small' }, { file_id: 'big' }] });
cs = await calls();
check('photo downloaded', cs.some(c => c.method === 'getFile' && c.body.file_id === 'big'));
day = (await tool('get_day', { date: '2026-11-02' })).day;
check('screenshot: smm% converted, extras kept', day.body.w === 72.5 && day.body.smm === 38.9 && day.body.scale.smmPct === 53.7 && day.body.scale.muscleKg === 57.3, JSON.stringify(day.body));

// --- /workout then filled-in workout
await reset();
await tgSend({ text: '/workout' });
m = await lastMsg();
check('/workout sends next session with copy block', /<pre>WORKOUT U/.test(m.text), m.text.split('\n')[0]);
await reset();
await tgSend({ text: 'WORKOUT Ps\nFlat DB press 3×8-12 @8 (new): 30x12, 30x10\nPec deck: 45x13' });
m = await lastMsg();
check('workout saved + progression flag', /Session saved/.test(m.text) && /Add load next time: Flat DB press/.test(m.text), m.text.replace(/\n/g, ' | ').slice(0, 220));
check('queue advances', /Next in the queue: <b>Pl/.test(m.text));
await reset();
await tgSend({ text: 'ran 5k in 28 min' });
check('run saved', /Easy run/.test((await lastMsg()).text));

// --- recipe save
await reset();
await tgSend({ text: "save mum's chilli: 500g beef mince, 2 tins tomatoes, kidney beans" });
m = await lastMsg();
check('recipe proposal', /Save to your foods/.test(m.text));
const pid = JSON.stringify(m.reply_markup).match(/ok:([a-z0-9]+)/)[1];
await reset();
await tgCb('ok:' + pid);
check('recipe saved', /Saved <b>Mum/.test((await lastMsg()).text));
const lib = (await tool('get_snapshot', { since: 0 })).config.library.items;
check('library has chilli', lib.some(x => x.n === "Mum's chilli" && x.m[0] === 128));

// --- Apple Health ingest
const h = await (await fetch(W + '/health', { method: 'POST', headers: { authorization: 'Bearer testkey', 'content-type': 'application/json' }, body: JSON.stringify({ weight_kg: '72.30', bf_pct: 0.169, lean_kg: 60.1, date: '2026-11-01' }) })).json();
check('health ingest (bf fraction → %)', h.ok && h.body.w === 72.3 && h.body.bf === 16.9, JSON.stringify(h));
check('health rejects missing key', (await fetch(W + '/health', { method: 'POST', body: '{}' })).status === 401);

// --- MCP: conflict-safe put_day, incremental snapshot, send_workout
const cur = (await tool('get_day', { date: '2026-11-02' })).day;
const stale = await tool('put_day', { date: '2026-11-02', doc: { ...cur, partial: true }, base: cur.updated - 5 });
check('put_day conflict detected', stale.ok === false && stale.conflict === true);
const good = await tool('put_day', { date: '2026-11-02', doc: { ...cur, partial: false, note: 'from dashboard' }, base: cur.updated });
check('put_day with right base', good.ok && good.doc.note === 'from dashboard');
const inc = await tool('get_snapshot', { since: rev0 });
check('incremental snapshot', inc.days.length >= 2 && inc.days.length < seed.days.length, inc.days.map(d => d.date).join(','));
await reset();
const sw = await tool('send_workout', {});
check('send_workout via MCP', sw.ok && /WORKOUT Pl/.test((await lastMsg()).text), sw.session);
const sum = await tool('get_summary', { days: 7 });
check('get_summary', sum.days.length === 7 && sum.targets.ok, 'targets ' + sum.targets.kcal + ' / ' + sum.targets.protein);

// --- cron: reminders + backup
await reset();
await fetch(W + '/__test/hourly?t=2026-11-04T21:05:00Z');
check('evening nudge', /protein|Nothing logged/.test((await lastMsg())?.text || ''), ((await lastMsg())?.text || 'none').slice(0, 80));
await reset();
await fetch(W + '/__test/hourly?t=2026-11-04T21:35:00Z');
check('nudge only once a day', (await calls()).filter(c => c.method === 'sendMessage').length === 0);
await reset();
const bk = await (await fetch(W + '/__test/backup')).json();
cs = await calls();
check('backup writes json + csv to GitHub', bk.ok && cs.filter(c => c.api === 'github' && c.method === 'PUT').length === 2, JSON.stringify(bk));
await reset();
const bk2 = await (await fetch(W + '/__test/backup')).json();
check('backup skips when unchanged', bk2.skipped === true);
// setup page
const st = await fetch(W + '/setup?key=testkey'); const stt = await st.text();
check('setup registers webhook', st.status === 200 && /connected/.test(stt));
check('setup rejects wrong key', (await fetch(W + '/setup?key=nope')).status === 403);
console.log(results.join('\n')); console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
