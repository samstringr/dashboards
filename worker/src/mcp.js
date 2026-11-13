/* Health DB · mcp.js */
import { CONFIG_IDS, text, json, r1, mean, uid, clamp, today, addDays, validDate, authorized } from './util.js';
import { getDay, putDay, mutateDay, putConfig, getRev, getKV } from './store.js';
import { dayTotals, targets, loadCtx } from './model.js';
import { sendWorkout } from './bot.js';
import { claude } from './ai.js';
import { photoSets, getPhoto, putPhoto, deletePhotos, photoDue } from './photos.js';

/* ============================================================ MCP (the dashboard + Claude chats) */
export const TOOLS = [
  { name: 'get_rev', description: 'Latest change stamp for the whole database. Cheap; poll it to know when to refetch.', readOnly: true,
    inputSchema: { type: 'object', properties: {} }, run: async env => ({ rev: await getRev(env) }) },
  { name: 'get_snapshot', description: 'Every day document and config document (settings, library, plan, layout, supplements, away). Pass since (a rev) to get only what changed after it.', readOnly: true,
    inputSchema: { type: 'object', properties: { since: { type: 'number' } } },
    run: async (env, a) => {
      const since = +a.since || 0, rev = await getRev(env);
      const { results: dr } = await env.DB.prepare('SELECT doc FROM days WHERE updated > ? ORDER BY date').bind(since).all();
      const { results: cr } = await env.DB.prepare('SELECT id, doc FROM config WHERE updated > ?').bind(since).all();
      const config = {}; for (const r of cr) config[r.id] = JSON.parse(r.doc);
      return { rev, since, days: dr.map(r => JSON.parse(r.doc)), config };
    } },
  { name: 'put_day', description: 'Replace one day document. Pass base (the doc.updated you last saw) to avoid overwriting a newer change; a conflict returns the current doc.',
    inputSchema: { type: 'object', properties: { date: { type: 'string' }, doc: { type: 'object' }, base: { type: ['number', 'null'] } }, required: ['date', 'doc'] },
    run: async (env, a) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(a.date || '')) throw new Error('date must be YYYY-MM-DD');
      const cur = await getDay(env, a.date);
      if (a.base !== undefined && (cur?.updated ?? null) !== (a.base ?? null)) return { ok: false, conflict: true, doc: cur };
      const doc = await putDay(env, { ...a.doc, date: a.date, updated: Math.max(cur?.updated || 0, a.doc.updated || 0) });
      return { ok: true, doc, rev: await getRev(env) };
    } },
  { name: 'put_config', description: 'Replace a config document: settings, library, plan, layout, supplements or away.',
    inputSchema: { type: 'object', properties: { id: { type: 'string', enum: CONFIG_IDS }, doc: { type: 'object' } }, required: ['id', 'doc'] },
    run: async (env, a) => { if (!CONFIG_IDS.includes(a.id)) throw new Error('unknown config id'); await putConfig(env, a.id, a.doc); return { ok: true, rev: await getRev(env) }; } },
  { name: 'import_data', description: 'Bulk import day and config documents (used once, to move data in). mode "missing" only adds what is not already stored.',
    inputSchema: { type: 'object', properties: { days: { type: 'array', items: { type: 'object' } }, config: { type: 'object' }, mode: { type: 'string', enum: ['missing', 'replace'] } }, required: ['days'] },
    run: async (env, a) => {
      const replace = a.mode === 'replace'; let nd = 0, nc = 0; const stmts = [];
      const haveD = new Set((await env.DB.prepare('SELECT date FROM days').all()).results.map(r => r.date));
      const haveC = new Set((await env.DB.prepare('SELECT id FROM config').all()).results.map(r => r.id));
      const now = Date.now();
      for (const d of (a.days || [])) {
        if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d.date || '') || (!replace && haveD.has(d.date))) continue;
        const doc = { ...d, updated: now }; stmts.push(env.DB.prepare('INSERT OR REPLACE INTO days (date, doc, updated) VALUES (?, ?, ?)').bind(d.date, JSON.stringify(doc), now)); nd++;
      }
      for (const [id, doc] of Object.entries(a.config || {})) {
        if (!CONFIG_IDS.includes(id) || !doc || (!replace && haveC.has(id))) continue;
        stmts.push(env.DB.prepare('INSERT OR REPLACE INTO config (id, doc, updated) VALUES (?, ?, ?)').bind(id, JSON.stringify(doc), now)); nc++;
      }
      for (let i = 0; i < stmts.length; i += 50) await env.DB.batch(stmts.slice(i, i + 50));
      return { ok: true, days: nd, config: nc, rev: await getRev(env) };
    } },
  { name: 'send_workout', description: 'Send a plan session to Sam on Telegram (the next one in the queue unless code is given).',
    inputSchema: { type: 'object', properties: { code: { type: 'string' } } }, run: async (env, a) => sendWorkout(env, a.code || null) },
  { name: 'get_day', description: 'One day: food items, totals, body readings, sessions, and the day’s targets. date defaults to today (UK).', readOnly: true,
    inputSchema: { type: 'object', properties: { date: { type: 'string' } } },
    run: async (env, a) => { const ctx = await loadCtx(env), date = validDate(a.date, today()), d = ctx.days.find(x => x.date === date) || { date }; return { day: d, totals: dayTotals(d), targets: targets(ctx, date) }; } },
  { name: 'get_summary', description: 'Daily totals, weigh-ins and sessions for the last N days (default 14), with averages over complete days.', readOnly: true,
    inputSchema: { type: 'object', properties: { days: { type: 'number' } } },
    run: async (env, a) => {
      const ctx = await loadCtx(env), n = clamp(+a.days || 14, 1, 365), td = today(), out = [];
      for (let i = n - 1; i >= 0; i--) { const ds = addDays(td, -i), d = ctx.days.find(x => x.date === ds), t = dayTotals(d); out.push({ date: ds, kcal: t?.kcal ?? null, protein: t?.p ?? null, carbs: t?.c ?? null, fat: t?.f ?? null, partial: !!t?.partial, weight: d?.body?.w ?? null, bf: d?.body?.bf ?? null, sessions: (d?.workouts || []).map(w => w.label || w.kind) }); }
      const full = out.filter(x => x.kcal != null && !x.partial && x.date !== td);
      return { targets: targets(ctx), days: out, averages: { kcal: mean(full.map(x => x.kcal)), protein: mean(full.map(x => x.protein)), completeDays: full.length } };
    } },
  { name: 'list_photos', description: 'Progress photo sets, newest first: date, weight and body fat that morning, and the id of each pose (front, side, back, frontflex, backflex). Images come from get_photo. Also says when the next set is due.', readOnly: true,
    inputSchema: { type: 'object', properties: {} }, run: async env => ({ sets: await photoSets(env), due: await photoDue(env) }) },
  { name: 'get_photo', description: 'One progress photo as base64 JPEG. size: thumb (about 320 px, default) or full.', readOnly: true,
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, size: { type: 'string', enum: ['thumb', 'full'] } }, required: ['id'] },
    run: async (env, a) => (await getPhoto(env, a.id, a.size)) || { error: 'not found' } },
  { name: 'put_photo', description: 'Save a progress photo (base64 JPEG) for a date and pose; replaces that pose. thumb is an optional small copy.',
    inputSchema: { type: 'object', properties: { date: { type: 'string' }, pose: { type: 'string', enum: ['front', 'side', 'back', 'frontflex', 'backflex'] }, full: { type: 'string' }, thumb: { type: 'string' }, w: { type: 'number' }, bf: { type: 'number' } }, required: ['date', 'pose', 'full'] },
    run: async (env, a) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(a.date || '')) throw new Error('date must be YYYY-MM-DD'); return putPhoto(env, { ...a, src: 'dashboard' }); } },
  { name: 'delete_photos', description: 'Delete one progress photo (id) or a whole set (date). Permanent.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, date: { type: 'string' } } }, run: async (env, a) => deletePhotos(env, a) },
  { name: 'get_bot_errors', description: 'The Telegram bot’s last 20 failures (newest first): when, the error, and the message that failed. Use it to work out why the bot said “That didn’t work”.', readOnly: true,
    inputSchema: { type: 'object', properties: {} },
    run: async env => ({ errors: (await getKV(env, 'errlog')) || [] }) },
  { name: 'log_food', description: 'Append food items to a day. Each item: name, qty, unit (g|ml|serving), kcal, p, c, f, estimated (bool).',
    inputSchema: { type: 'object', properties: { date: { type: 'string' }, items: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, qty: { type: 'number' }, unit: { type: 'string' }, kcal: { type: 'number' }, p: { type: 'number' }, c: { type: 'number' }, f: { type: 'number' }, estimated: { type: 'boolean' } }, required: ['name', 'kcal', 'p', 'c', 'f'] } } }, required: ['items'] },
    run: async (env, a) => {
      const date = validDate(a.date, today());
      const items = (a.items || []).map(x => ({ id: uid(), t: new Date().toISOString(), n: String(x.name).slice(0, 120), q: x.qty ?? null, u: x.unit || 'serving', kcal: Math.round(+x.kcal || 0), p: r1(+x.p || 0), c: r1(+x.c || 0), f: r1(+x.f || 0), ...(x.estimated ? { est: true } : {}), src: 'claude' }));
      const d = await mutateDay(env, date, doc => { (doc.items ||= []).push(...items); });
      return { ok: true, date, totals: dayTotals(d) };
    } },
  { name: 'log_weight', description: 'Save a weigh-in: weight_kg, bf_pct, smm_kg (skeletal muscle), waist_cm. date defaults to today.',
    inputSchema: { type: 'object', properties: { date: { type: 'string' }, weight_kg: { type: 'number' }, bf_pct: { type: 'number' }, smm_kg: { type: 'number' }, waist_cm: { type: 'number' } } },
    run: async (env, a) => {
      const date = validDate(a.date, today()), body = {};
      if (a.weight_kg) body.w = +a.weight_kg; if (a.bf_pct) body.bf = +a.bf_pct; if (a.smm_kg) body.smm = +a.smm_kg; if (a.waist_cm) body.waist = +a.waist_cm;
      const d = await mutateDay(env, date, doc => { doc.body = { ...(doc.body || {}), ...body, src: 'claude' }; });
      return { ok: true, date, body: d.body };
    } },
  { name: 'log_workout', description: 'Save a session: kind (gym|run|swim|football|cycle|walk|other), label, planCode, minutes, distance_km, exercises [{name, sets:[{kg, reps, rpe}]}], note.',
    inputSchema: { type: 'object', properties: { date: { type: 'string' }, kind: { type: 'string' }, label: { type: 'string' }, planCode: { type: 'string' }, minutes: { type: 'number' }, distance_km: { type: 'number' }, exercises: { type: 'array', items: { type: 'object' } }, note: { type: 'string' } }, required: ['kind'] },
    run: async (env, a) => {
      const date = validDate(a.date, today());
      const ex = (a.exercises || []).map(e => ({ n: String(e.name || ''), sets: (e.sets || []).map(s => ({ kg: s.kg ?? null, r: s.reps ?? null, ...(s.rpe != null ? { rpe: s.rpe } : {}) })) })).filter(e => e.n && e.sets.length);
      const rec = { id: uid(), kind: a.kind, label: a.label || a.kind, ...(a.planCode ? { planCode: a.planCode } : {}), ...(a.minutes ? { min: a.minutes } : {}), ...(a.distance_km ? { km: a.distance_km } : {}), ...(ex.length ? { ex } : {}), ...(a.note ? { note: a.note } : {}), src: 'claude' };
      await mutateDay(env, date, doc => { (doc.workouts ||= []).push(rec); });
      return { ok: true, date, session: rec };
    } }
];
export async function mcpHandler(req, env) {
  if (!authorized(req, env)) return json({ error: 'unauthorized' }, 401, { 'www-authenticate': 'Bearer' });
  if (req.method === 'GET') return new Response('Use POST', { status: 405, headers: { allow: 'POST' } });
  if (req.method === 'DELETE') return new Response(null, { status: 204 });
  if (req.method !== 'POST') return new Response(null, { status: 405 });
  let body; try { body = await req.json(); } catch { return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, 400); }
  const batch = Array.isArray(body), out = [];
  for (const m of (batch ? body : [body])) { const r = await mcpOne(env, m); if (r) out.push(r); }
  if (!out.length) return new Response(null, { status: 202 });
  return json(batch ? out : out[0]);
}
export async function mcpOne(env, m) {
  if (!m || m.id === undefined || m.id === null) return null;   // notification
  const ok = result => ({ jsonrpc: '2.0', id: m.id, result }), err = (code, message) => ({ jsonrpc: '2.0', id: m.id, error: { code, message } });
  switch (m.method) {
    case 'initialize':
      return ok({ protocolVersion: m.params?.protocolVersion || '2025-06-18', capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'health-db', version: '1.0.0' },
        instructions: 'Sam’s health and fitness database: daily food logs, weigh-ins, training sessions, his food library and training plan. Use get_day or get_summary to read; log_food, log_weight and log_workout to write. Dates are YYYY-MM-DD, UK time.' });
    case 'ping': return ok({});
    case 'tools/list': return ok({ tools: TOOLS.map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema, annotations: { readOnlyHint: !!t.readOnly } })) });
    case 'tools/call': {
      const t = TOOLS.find(x => x.name === m.params?.name);
      if (!t) return err(-32602, 'Unknown tool: ' + m.params?.name);
      try {
        const res = await t.run(env, m.params.arguments || {});
        return ok({ content: [{ type: 'text', text: JSON.stringify(res) }], structuredContent: res });
      } catch (e) { return ok({ isError: true, content: [{ type: 'text', text: String(e.message || e) }] }); }
    }
    default: return err(-32601, 'Method not found: ' + m.method);
  }
}
