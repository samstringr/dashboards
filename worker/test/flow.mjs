// End-to-end flow test against `wrangler dev` + test/mock.mjs. Run: node test/flow.mjs <seed.json>
import crypto from 'crypto';
import fs from 'fs';
const W = 'http://127.0.0.1:8787', M = 'http://127.0.0.1:9999';
const secret = crypto.createHash('sha256').update('tg:123:abc').digest('hex').slice(0, 48);
let uid = 1000; const results = []; let fails = 0;
const check = (name, cond, extra = '') => { results.push((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); if (!cond) fails++; };
process.on('uncaughtException', e => { console.log(results.join('\n')); console.log('\nCRASHED: ' + (e.stack || e)); process.exit(1); });
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
check('import_data', imp.days === seed.days.length && imp.config === Object.keys(seed.config).length, JSON.stringify(imp));
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
check('/today replies', /Protein|Nothing logged yet/.test((await lastMsg()).text), (await lastMsg()).text.split('\n').slice(0, 2).join(' | '));

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
{ const all = (await calls()).filter(x => x.api === 'tg' && x.method === 'sendMessage').map(x => x.body); m = all.find(x => /Session saved/.test(x.text)) || {}; var coachMsg = all.find(x => /Coach ·/.test(x.text)) || { text: '' }; }
check('workout saved + progression flag', /Session saved/.test(m.text) && /Add load next time: Flat DB press/.test(m.text), m.text.replace(/\n/g, ' | ').slice(0, 220));
check('queue advances', /Next in the queue: <b>Pl/.test(m.text));
// 14 Nov 2026: the coach's review follows the save as its own message
check('coach review: opening note, per-lift next target with its reason, focus', /Good work today/.test(coachMsg.text) && /Flat DB press<\/b>: 30 kg × 12, 10/.test(coachMsg.text) && /next: <b>32 kg, aim 8–10<\/b>/.test(coachMsg.text) && /top of 8–12/.test(coachMsg.text) && /Focus next time/.test(coachMsg.text), coachMsg.text.replace(/\n/g, ' | ').slice(0, 600));
// a lift that isn't in the plan, done in place of one that is: the bot offers to change the plan
await reset(); await tgSend({ text: 'WORKOUT SWAP\nSmith machine chest press: 40x8, 40x7' }); m = await lastMsg();
const swTok = (m.reply_markup?.inline_keyboard?.[0]?.[0]?.callback_data || '');
const planBefore = (await tool('get_snapshot', {})).config.plan.sessions.find(s => s.code === 'Ps').ex[0].n;
check('swap offered after the session', /in place of/.test(m.text) && /^swp:/.test(swTok), m.text.replace(/\n/g, ' | ').slice(-200));
await reset(); await tgCb(swTok); m = await lastMsg();
const planAfter = (await tool('get_snapshot', {})).config.plan.sessions.find(s => s.code === 'Ps').ex[0].n;
check('swap applied to the plan', /Plan updated/.test(m.text) && planAfter === 'Smith machine chest press' && planBefore !== planAfter, planBefore + ' → ' + planAfter);
await tool('put_config', { id: 'plan', doc: seed.config.plan });   // put the seed plan back for the checks that follow
await reset(); await tgSend({ text: '/review' }); m = await lastMsg();
check('/review: the week with went well, to improve and a focus', /Your week/.test(m.text) && /Training: <b>\d+<\/b> gym/.test(m.text) && /Focus for next week/.test(m.text), m.text.replace(/\n/g, ' | ').slice(0, 400));
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

// --- voice note → Whisper → parsed like text
await reset();
await tgSend({ voice: { file_id: 'voice1', duration: 6, mime_type: 'audio/ogg' } });
cs = await calls();
check('voice: turbo Whisper called with base64', cs.some(c => c.api === 'ai' && /whisper-large-v3-turbo/.test(c.model) && typeof c.body.audio === 'string' && c.body.language === 'en'));
check('voice: transcript echoed', cs.some(c => c.method === 'sendMessage' && /🎙/.test(c.body.text) && /hines light mayo/.test(c.body.text)));
check('voice: then logged like text', /Logged/.test((await lastMsg()).text));
await tgCb(JSON.stringify((await lastMsg()).reply_markup).match(/undo:[a-z0-9]+/)[0]);
await reset(); await fetch(M + '/turbo-fail');
await tgSend({ voice: { file_id: 'voice2', duration: 6 } });
cs = await calls();
check('voice: falls back to whisper (byte array)', cs.some(c => c.api === 'ai' && /openai\/whisper$/.test(c.model) && typeof c.body.audio === 'number'));
await tgCb(JSON.stringify((await lastMsg()).reply_markup).match(/undo:[a-z0-9]+/)[0]);
await reset();
await tgSend({ voice: { file_id: 'voice3', duration: 400 } });
check('voice: over 5 min refused', /over 5 minutes/.test((await lastMsg()).text));

// --- supplements: checklist, tick by button, tick by text, reminders
const TD = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());
await reset();
await tgSend({ text: '/supps' });
m = await lastMsg();
check('/supps checklist', /Supplements/.test(m.text) && /◻️ Creatine/.test(m.text) && m.reply_markup.inline_keyboard.flat().some(b => b.callback_data === 'sp:creatine:' + TD), m.text.split('\n').slice(0, 2).join(' | '));
await reset();
await fetch(W + '/telegram', { method: 'POST', headers: { 'x-telegram-bot-api-secret-token': secret, 'content-type': 'application/json' }, body: JSON.stringify({ update_id: ++uid, callback_query: { id: 'cb' + uid, from: { id: 5016806156 }, data: 'sp:creatine:' + TD, message: { message_id: 9, text: '💊 Supplements', reply_markup: m.reply_markup } } }) });
cs = await calls();
const ed = cs.find(c => c.method === 'editMessageText');
check('tick button redraws in place', ed && /✅ Creatine/.test(ed.body.text) && /1 of 5/.test(ed.body.text));
day = (await tool('get_day', { date: TD })).day;
check('tick stored on the day', !!day.supps?.creatine);
await reset();
await tgSend({ text: 'took creatine and zinc' });
day = (await tool('get_day', { date: TD })).day;
check('tick by text', !!day.supps?.zinc && !!day.supps?.creatine && /Supplements/.test((await lastMsg()).text));
await reset();
await fetch(W + '/__test/hourly?t=' + TD + 'T14:05:00Z');
check('14:00: nothing due (lunch ones ticked)', (await calls()).filter(c => c.method === 'sendMessage').length === 0);
await reset();
await fetch(W + '/__test/hourly?t=' + TD + 'T21:05:00Z');
const eve = (await calls()).filter(c => c.method === 'sendMessage').map(c => c.body);
check('evening nudge', eve.some(b => /protein|Nothing logged/.test(b.text)), (eve[0]?.text || 'none').slice(0, 80));
m = eve.find(b => /Supplements check/.test(b.text));
check('21:00: reminder lists only the untaken', m && /Omega-3/.test(m.text) && /Magnesium/.test(m.text) && !/Creatine/.test(m.text), m && m.text.replace(/\n/g, ' | '));
await reset();
await fetch(W + '/__test/hourly?t=' + TD + 'T21:30:00Z');
check('reminder only once', (await calls()).filter(c => c.method === 'sendMessage').length === 0);

// --- Apple Health: acknowledged once per new reading; a missing weigh-in is flagged at 10:00 on weigh days
const wdNow = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'short' }).format(new Date());
await reset();
await fetch(W + '/__test/hourly?t=' + TD + 'T10:05:00Z');
const miss = (await calls()).filter(c => c.method === 'sendMessage').map(c => c.body.text).join(' ');
check('10:00 flags a missing weigh-in on weigh days', ['Mon', 'Wed', 'Fri'].includes(wdNow) ? /No weigh-in has reached me/.test(miss) : !/No weigh-in/.test(miss), wdNow);
const post = b => fetch(W + '/health', { method: 'POST', headers: { authorization: 'Bearer testkey', 'content-type': 'application/json' }, body: JSON.stringify(b) });
await reset();
await post({ weight_kg: '72.40', bf_pct: 0.168, lean_kg: 60.2 });
m = await lastMsg();
check('Shortcut weigh-in acknowledged', /Weigh-in received/.test(m?.text) && /72.40 kg/.test(m.text) && /60.2 kg lean/.test(m.text) && /7-day average/.test(m.text), (m?.text || 'none').replace(/\n/g, ' | ').slice(0, 200));
check('creatine note while it loads', /Creatine since/.test(m?.text || ''));
await reset();
await post({ weight_kg: '72.40', bf_pct: 0.168, lean_kg: 60.2 });
check('identical repeat not re-sent', (await calls()).filter(c => c.method === 'sendMessage').length === 0);
await reset();
await post({ weight_kg: '72.35', bf_pct: 0.168, lean_kg: 60.2 });
check('changed reading → "updated"', /Weigh-in updated/.test((await lastMsg())?.text || ''));

// --- away mode: set, reminders paused, back
await reset();
await tgSend({ text: '/away 7' });
m = await lastMsg();
check('/away 7', /Away/.test(m.text) && /7 days/.test(m.text) && /Reminders are off/.test(m.text), m.text.split('\n')[0]);
const away = (await tool('get_snapshot', {})).config.away;
check('away stored as config', away?.ranges?.length === 1 && away.ranges[0].from === TD, JSON.stringify(away));
await reset();
await fetch(W + '/__test/hourly?t=' + TD + 'T07:05:00Z');
await fetch(W + '/__test/hourly?t=' + TD + 'T14:05:00Z');
check('away: no reminders', (await calls()).filter(c => c.method === 'sendMessage').length === 0);
await reset();
await tgSend({ text: '/back' });
check('/back', /Back/.test((await lastMsg()).text));
const away2 = (await tool('get_snapshot', {})).config.away;
check('back removes a same-day range', away2.ranges.length === 0, JSON.stringify(away2));
await reset();
await tgSend({ text: 'going on holiday until the 20th' });
m = await lastMsg();
check('holiday in plain words → away', /Away: Holiday/.test(m.text) && /Fri 20 Nov/.test(m.text), m.text.split('\n')[0]);
await tgSend({ text: '/back' });

// --- 7 Nov 2026 quality of life: Sam's exact burger message, repeats, presets, how much, failures
const YD = new Date(Date.parse(TD + 'T12:00:00Z') - 864e5).toISOString().slice(0, 10);
await tool('put_day', { date: YD, doc: { date: YD, items: [
  { id: 'yb1', n: 'Brioche bun', q: 2, u: 'serving', kcal: 340, p: 10, c: 56, f: 10, est: true, src: 'telegram' },
  { id: 'yp1', n: "Nando's Perinaise peri-peri mayo", q: 25, u: 'g', kcal: 77, p: 0.1, c: 3.3, f: 7, est: true, src: 'telegram' },
  { id: 'yk1', n: 'Homemade Chinese braised pork belly', q: 238, u: 'g', kcal: 922, p: 39.3, c: 11.9, f: 79.7, est: true, src: 'telegram' }] } });
await reset();
await tgSend({ text: '2 brioche buns, 2 servings of nandos peri mayo, 4 slices of sliced gherkins, 1 burger patty (1 patty from an 8 pack multipack), 1 nandos boineless chicken thigh, 30g cheddar cheese' });
cs = await calls(); m = await lastMsg();
const rs = cs.filter(c => c.api === 'claude' && c.tools);
check('burger: lookup tried Sonnet, then Haiku, after rate limits', rs.some(c => /sonnet/.test(c.model)) && rs.some(c => /haiku/.test(c.model)), rs.map(c => c.model).join(','));
check('burger: still proposes all 6 items, says the lookup failed', /Check this/.test(m.text) && (m.text.match(/^• /gm) || []).length === 6 && /Couldn’t look these up \(rate limit/.test(m.text), m.text.replace(/\n/g, ' | ').slice(0, 400));
check('burger: repeats reuse yesterday', /Brioche bun <i>2×<\/i>\*? — 340 kcal/.test(m.text) && /Perinaise peri-peri mayo <i>50 g<\/i>\*? — 154 kcal/.test(m.text), (m.text.match(/• [^\n]*(Brioche|Perinaise)[^\n]*/g) || []).join(' / '));
await reset(); await tgSend({ text: 'yes' });
day = (await tool('get_day', { date: TD })).day;
check('burger: logged with refs', day.items.filter(i => i.ref).length === 2 && day.items.length >= 6, day.items.map(i => i.n + (i.ref ? '→' + i.ref : '')).join(', '));
// presets
await reset();
await tgSend({ text: 'my standard overnight oats are 100 g oats, 40 g bulk chocolate powder and 180 ml semi skimmed milk' });
m = await lastMsg();
check('preset: proposes an update of the existing oats entry', /Update preset “Overnight oats \(current build\)”/.test(m.text) && /Per serving: <b>[\d,]+ kcal/.test(m.text), m.text.split('\n').slice(0, 2).join(' | '));
await reset(); await tgSend({ text: 'yes' });
m = await lastMsg();
let plib = (await tool('get_snapshot', {})).config.library.items, oats = plib.find(x => x.id === 'oats');
check('preset: saved with parts and aliases', /Saved/.test(m.text) && oats.parts?.length === 3 && oats.al.includes('standard overnight oats') && oats.al.includes('my oats') && oats.m[0] === Math.round(375 + 156.8 + 90), JSON.stringify({ m: oats.m, al: oats.al }));
await reset(); await tgSend({ text: 'standard overnight oats' });
m = await lastMsg();
check('preset: name logs straight away', /✅ Logged/.test(m.text) && /Overnight oats \(current build\)/.test(m.text), m.text.split('\n').slice(0, 2).join(' | '));
await reset(); await tgSend({ text: '/foods' });
check('/foods lists presets', /Overnight oats \(current build\)/.test((await lastMsg()).text) && /also: /.test((await lastMsg()).text));
// two foods (13 Nov 2026, "how much chilli and white rice closes the day?"): numbered combinations, the first food alone, closers
await reset();
await tgSend({ text: 'how much pork belly and rice should I have to close the day?' });
m = await lastMsg();
const kb2 = JSON.parse(JSON.stringify(m.reply_markup)).inline_keyboard, flat = kb2.flat();
check('two foods: numbered options with both foods, the first alone, closers as text, buttons only for the numbers', /1️⃣/.test(m.text) && /pork belly \+ \d+ g rice/.test(m.text) && /Pork belly only/.test(m.text) && /Ratio:/.test(m.text) && /closer/.test(m.text) && flat.some(b => /^2️⃣ Log/.test(b.text)) && flat.every(b => /^\d️⃣ Log|No thanks/.test(b.text)), m.text.replace(/\n/g, ' | ').slice(0, 400));
const beforeHM = (await tool('get_day', { date: TD })).day.items.length;
await reset(); await tgCb(flat.find(b => /^2️⃣ Log/.test(b.text)).callback_data);
let dayHM = (await tool('get_day', { date: TD })).day;
const addedHM = dayHM.items.slice(beforeHM);
check('two foods: option 2 logs exactly what it said', /Logged/.test((await lastMsg()).text) && addedHM.length >= 1 && addedHM.every(i => i.ref || i.lib), addedHM.map(i => i.n + ' ' + i.q + i.u).join(', '));
await reset(); await tgSend({ text: '/undo' });
// a preset plus an extra scoop logs the preset untouched and the scoop as its own line
await reset();
const libBefore = JSON.stringify((await tool('get_snapshot', {})).config.library);
const nBefore = (await tool('get_day', { date: TD })).day.items.length;
await tgSend({ text: 'standard protein shake plus 1 extra scoop of protein' });
m = await lastMsg();
const libAfter = JSON.stringify((await tool('get_snapshot', {})).config.library), addPE = (await tool('get_day', { date: TD })).day.items.slice(nBefore);
check('preset + extra: the preset and the scoop as two lines, preset unchanged', /Logged/.test(m.text) && addPE.length === 2 && addPE[0].lib === 'oats' && addPE[0].q === 1 && addPE[1].lib === 'powder' && addPE[1].q === 30 && libBefore === libAfter, addPE.map(i => i.n + ' ' + i.q + i.u).join(', '));
await reset(); await tgCb(JSON.parse(JSON.stringify(m.reply_markup)).inline_keyboard[0][0].callback_data);
// how much of the leftovers closes the day
await reset();
await tgSend({ text: 'how much of the leftover pork belly from yesterday should I eat to close the day? I have about 300 g' });
m = await lastMsg();
check('how much: answers with an amount and a log button', /closes the day/.test(m.text) && /→ <b>/.test(m.text) && /ok:/.test(JSON.stringify(m.reply_markup)), m.text.replace(/\n/g, ' | ').slice(0, 300));
const before = (await tool('get_day', { date: TD })).totals;
const amt = +(m.text.match(/<b>([\d,]+) g<\/b>/) || [])[1]?.replace(',', '');
await reset(); await tgCb(JSON.parse(JSON.stringify(m.reply_markup)).inline_keyboard[0][0].callback_data);
const after = (await tool('get_day', { date: TD })).totals;
check('how much: Log adds exactly that amount from the leftovers', amt > 0 && amt <= 300 && Math.abs((after.kcal - before.kcal) - 922 * amt / 238) < 1.5, `${amt} g, +${after.kcal - before.kcal} kcal`);
// failures: a non-JSON reply gets one more go; a real failure is logged and can be retried
await reset(); await tgSend({ text: 'flaky tuna message' });
check('non-JSON reply retried once, then logs', /✅ Logged/.test((await lastMsg()).text), (await lastMsg()).text.split('\n')[0]);
await reset(); await tgSend({ text: 'garbage in' });
m = await lastMsg();
check('failure: says why, offers Try again', /That didn’t work: I couldn’t read that/.test(m.text) && /rt:/.test(JSON.stringify(m.reply_markup)), m.text.split('\n')[0]);
const errs = (await tool('get_bot_errors', {})).errors;
check('failure: recorded for get_bot_errors', errs[0]?.message === 'garbage in' && /couldn’t read/.test(errs[0].error) && /Still not sure/.test(errs[0].detail || ''), JSON.stringify(errs[0]).slice(0, 200));
await reset(); await tgCb(JSON.parse(JSON.stringify(m.reply_markup)).inline_keyboard[0][0].callback_data);
cs = await calls();
check('Try again re-runs the same message', cs.some(c => c.method === 'sendMessage' && /Trying again/.test(c.body.text)) && cs.filter(c => c.api === 'claude').length === 2);

// --- progress photos (13 Nov 2026; 14 Nov: no caption, no /done, one reply per album)
await reset();
await fetch(W + '/__test/hourly?t=2026-11-16T07:05:00Z');
m = (await calls()).filter(c => c.method === 'sendMessage').find(c => /Progress photos are due/.test(c.body.text))?.body;
check('photos: due prompt on a weigh-in morning, says no caption needed', !!m && /no caption/.test(m.text), m?.text?.slice(0, 160));
// a meal photo while a set is due is still read as usual (14 Nov: the reader tells physique from food)
await reset(); await tgSend({ photo: [{ file_id: 'meal1', width: 320 }, { file_id: 'meal2', width: 1280 }], media_group_id: 'meals' });
check('photos: other photos sent while a set is due are read, not filed', (await tool('list_photos', {})).sets.length === 0 && (await calls()).some(c => c.api === 'claude'));
const ph3 = n => ({ photo: [{ file_id: n + 's', width: 90 }, { file_id: n + 'm', width: 320 }, { file_id: n + 'b', width: 1280 }] });
// the whole set at once, no caption: three updates arriving together
await reset();
await Promise.all(['physa1', 'physa2', 'physa3'].map(n => tgSend({ ...ph3(n), media_group_id: 'alb1' })));
cs = await calls();
const sends = cs.filter(c => c.method === 'sendMessage'), edits = cs.filter(c => c.method === 'editMessageText');
const finalTxt = (edits.length ? edits[edits.length - 1] : sends[sends.length - 1])?.body?.text || '';
check('photos: an album of physique photos, no caption → recognised, one reply, edited, nothing logged', sends.length === 1 && cs.filter(c => c.api === 'claude').length === 3 && /front, side, back saved/.test(finalTxt) && /That’s the set/.test(finalTxt), `${sends.length} sent, ${edits.length} edits: ${finalTxt}`);
check('photos: full size and a ~320 px thumbnail downloaded', ['physa1b', 'physa1m'].every(f => cs.some(c => c.method === 'getFile' && c.body.file_id === f)) && !cs.some(c => c.method === 'getFile' && c.body.file_id === 'physa1s'));
let ps = await tool('list_photos', {});
const set0 = ps.sets[0];
check('photos: list_photos shows the set with ids, weight attached', set0?.date === TD && set0.shots.front && set0.shots.back && set0.shots.side && ps.due.due === false, JSON.stringify(ps).slice(0, 220));
const ph = await tool('get_photo', { id: set0.shots.front });
const phf = await tool('get_photo', { id: set0.shots.front, size: 'full' });
check('photos: get_photo returns base64 thumb and full', ph.data && phf.data && ph.mime === 'image/jpeg' && Buffer.from(phf.data, 'base64')[0] === 255);
// "Not progress photos" on an album takes all of it back out
await reset(); await tgCb(sends[0].body.reply_markup.inline_keyboard[0][0].callback_data);
ps = await tool('list_photos', {});
check('photos: "Not progress photos" removes the whole album', ps.sets.length === 0 && /Took 3 photos back out/.test((await lastMsg()).text), (await lastMsg()).text);
// /photos for a set sent one by one: the window closes itself once front, side and back are in
await reset(); await tgSend({ text: '/photos' });
check('photos: /photos explains, no Done button', /Send them all together/.test((await lastMsg()).text) && !(await lastMsg()).reply_markup, (await lastMsg()).text.slice(0, 80));
await reset();
await tgSend(ph3('p1')); await tgSend({ ...ph3('p2'), caption: 'back' }); await tgSend(ph3('p3'));
m = await lastMsg();
check('photos: one by one, front → back (captioned) → side, then the window closes itself', /front, side, back saved/.test(m.text) && /That’s the set/.test(m.text) && (await calls()).filter(c => c.api === 'claude').length === 0, m.text);
// after the set a photo is read as usual; "those are progress photos" moves it across
await reset(); await tgSend(ph3('x1'));
const readIt = (await calls()).some(c => c.api === 'claude');
await reset(); await tgSend({ text: 'those are progress photos' });
ps = await tool('list_photos', {});
check('photos: after the set, photos are read; "those are progress photos" moves the last one across', readIt && ps.sets[0].shots.frontflex && /Moved to progress photos: front, flexed/.test((await lastMsg()).text), (await lastMsg()).text);
// a single photo taken back out is read straight away (a weigh-in screenshot)
await reset(); await tgSend({ text: '/photos' }); await reset(); await tgSend(ph3('s1'));
m = await lastMsg();
await reset(); await tgCb(m.reply_markup.inline_keyboard[0][0].callback_data);
cs = await calls(); ps = await tool('list_photos', {});
check('photos: one photo taken back out is read instead', !ps.sets[0].shots.backflex && cs.some(c => c.api === 'claude'), JSON.stringify(ps.sets[0].shots));
await reset(); await tgSend({ text: 'had 2 tins of tuna' });
check('photos: window closed afterwards, text goes to Claude', (await calls()).some(c => c.api === 'claude'));
// from the dashboard: put, then delete
const put = await tool('put_photo', { date: '2026-10-16', pose: 'front', full: phf.data, thumb: ph.data });
ps = await tool('list_photos', {});
check('photos: put_photo from the dashboard', ps.sets.length === 2 && ps.sets[1].shots.front === put.id);
check('photos: not in get_snapshot', !JSON.stringify(await tool('get_snapshot', {})).includes(phf.data.slice(0, 40)));
await tool('delete_photos', { date: '2026-10-16' });
ps = await tool('list_photos', {});
check('photos: delete_photos removes a set', ps.sets.length === 1);
await reset();
await fetch(W + '/__test/hourly?t=2026-11-18T07:05:00Z');
check('photos: not asked again until 4 weeks on', !(await calls()).some(c => c.method === 'sendMessage' && /Progress photos are due/.test(c.body.text)));
await reset(); await tgSend({ text: '/photos' }); await reset(); await tgSend({ text: '/done' });
check('/done still closes and summarises', /Saved for/.test((await lastMsg()).text) && /front, side, back/.test((await lastMsg()).text), (await lastMsg()).text);

// --- cron: reminders + backup
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
