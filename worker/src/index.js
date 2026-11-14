import { text, json, r1, fmt, today, validDate, authorized, webhookSecret, dLong, diffDays, addDays } from './util.js';
import { ensureSchema, getDay, mutateDay } from './store.js';
import { targets, loadCtx, weighins, rollAvg } from './model.js';
import { creatineStart } from './extras.js';
import { tg, send, telegramWebhook, command } from './bot.js';
import { hourly, backup } from './cron.js';
import { mcpHandler } from './mcp.js';

/* Health DB — Sam's own backend.
   One database (Cloudflare D1), three ways in:
     /telegram  the bot: log food, weigh-ins and sessions; get your workout sent to you
     /mcp       the dashboard and Claude chats, through a custom connector
     /health    Apple Health (iOS Shortcut) weigh-in sync
   Plus an hourly cron: weigh-in reminders, supplement checks, an evening protein nudge and a nightly GitHub backup.
   Reminders go quiet by themselves while Sam is away (see extras.js).
   Data shape matches the dashboard exactly: one JSON doc per day, plus config docs
   (settings, library, plan, layout). */


export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      await ensureSchema(env);
      if (url.pathname === '/telegram' && request.method === 'POST') return await telegramWebhook(request, env);
      if (url.pathname === '/mcp') return await mcpHandler(request, env);
      if (url.pathname === '/health' && request.method === 'POST') return await healthIngest(request, env);
      if (url.pathname === '/setup') return await setup(request, env, url);
      if (url.pathname === '/') return text('Health DB is running.');
      if (env.TEST_MODE && url.pathname === '/__test/hourly') { await hourly(env, new Date(url.searchParams.get('t'))); return json({ ok: true }); }
      if (env.TEST_MODE && url.pathname === '/__test/backup') return json(await backup(env));
      return text('Not found', 404);
    } catch (e) {
      console.error('fatal', e && e.stack || e);
      return json({ error: String(e && e.message || e) }, 500);
    }
  },
  async scheduled(event, env, ctx) {
    await ensureSchema(env);
    ctx.waitUntil(hourly(env, new Date(event.scheduledTime || Date.now())).catch(e => console.error('cron', e)));
  }
};

/* ============================================================ Apple Health (iOS Shortcut) */
export async function healthIngest(req, env) {
  if (!authorized(req, env)) return json({ error: 'unauthorized' }, 401);
  const b = await req.json().catch(() => ({}));
  const num = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isFinite(n) ? n : null; };
  const date = validDate(b.date, today());
  const body = {}; const w = num(b.weight_kg), bf = num(b.bf_pct), lean = num(b.lean_kg), bmi = num(b.bmi);
  if (w) body.w = Math.round(w * 100) / 100;
  if (bf != null) body.bf = bf < 1 ? r1(bf * 100) : r1(bf);
  const steps = parseSteps(b.steps, date);
  if (!body.w && body.bf == null && !steps.length) return json({ ok: false, error: 'no weight, body fat or steps in the request' }, 400);
  const savedSteps = await saveSteps(env, steps);
  if (!body.w && body.bf == null) return json({ ok: true, steps: savedSteps });   // steps on their own: saved quietly, no message
  const prev = (await getDay(env, date))?.body || {};
  // The Shortcut fires every time Fit Profile closes, so the same reading can arrive twice: only acknowledge news.
  const same = prev.w === body.w && (body.bf == null || prev.bf === body.bf) && (!lean || prev.scale?.ffmKg === lean);
  await mutateDay(env, date, d => {
    const scale = { ...(d.body?.scale || {}) }; if (lean) scale.ffmKg = lean; if (bmi) scale.bmi = bmi;
    d.body = { ...(d.body || {}), ...body, ...(Object.keys(scale).length ? { scale } : {}), src: d.body?.src || 'apple-health' };
  });
  if (env.TELEGRAM_TOKEN && !same) await send(env, await weighAck(env, date, body, lean, !!prev.w));
  return json({ ok: true, date, body, acknowledged: !same, steps: savedSteps });
}
/* Steps (14 Nov 2026, Sam: "include it as part of the shortcut… the last few days of step counts"). The Shortcut
   sends one total per day for the last 7 days, as text: "2026-11-14=8432;2026-11-13=10234" (Shortcuts can't
   easily build a JSON list, and a number put into text may come out as "8,432", so commas inside a count are
   dropped). Also accepted: a {date: count} object, a [{date, steps}] list, or a bare number for `date`.
   Each send overwrites those days: Apple Health is the source of truth and its later count is the fuller one.
   stepsAt = the date it was sent; on the day itself the count is still running, so the dashboard shows it as
   "so far" and keeps it out of averages until a later send. Dates must be within the last 60 days. */
export function parseSteps(v, date) {
  const out = [], put = (d, n) => { const x = Math.round(parseFloat(String(n).replace(/[,\s]/g, ''))); if (/^\d{4}-\d{2}-\d{2}$/.test(d) && isFinite(x) && x >= 0 && x < 200000) out.push([d, x]); };
  if (v == null || v === '') return out;
  if (typeof v === 'number' || /^\s*[\d,.\s]+\s*$/.test(String(v))) put(date, v);
  else if (Array.isArray(v)) for (const x of v) put(String(x?.date || ''), x?.steps ?? x?.value);
  else if (typeof v === 'object') for (const [d, n] of Object.entries(v)) put(d, n);
  else for (const m of String(v).matchAll(/(\d{4}-\d{2}-\d{2})\s*[=:]\s*([\d][\d,.\s]*)/g)) put(m[1], m[2].trim());
  const td = today(), seen = new Map(); for (const [d, n] of out) if (d <= td && d >= addDays(td, -60)) seen.set(d, Math.max(n, seen.get(d) ?? 0));
  return [...seen].sort();
}
async function saveSteps(env, list) {
  const td = today(); let n = 0;
  for (const [date, steps] of list) {
    const cur = await getDay(env, date);
    // nothing new: the same count, already marked as of today or already complete (sent after its day)
    if (cur?.steps === steps && (cur.stepsAt === td || (cur.stepsAt && cur.stepsAt !== date))) continue;
    await mutateDay(env, date, d => { d.steps = steps; d.stepsAt = td; }); n++;
  }
  return { days: list.length, updated: n };
}
/* "Got it" message for an Apple Health weigh-in: the numbers, the trend, and what might be skewing them. */
async function weighAck(env, date, body, lean, updated) {
  const ctx = await loadCtx(env), wl = weighins(ctx.days).filter(x => x.w);
  const before = wl.filter(x => x.date < date).pop(), avg = rollAvg(wl, date, 'w');
  const leanKg = lean || (body.w && body.bf != null ? body.w * (1 - body.bf / 100) : null);
  let s = `⚖️ <b>Weigh-in ${updated ? 'updated' : 'received'}</b> from Apple Health · ${dLong(date)}\n<b>${fmt(body.w, 2)} kg</b>${body.bf != null ? ` · ${fmt(body.bf, 1)}% fat` : ''}${leanKg ? ` · ${fmt(leanKg, 1)} kg lean` : ''}`;
  if (avg) s += `\n7-day average ${fmt(avg, 2)} kg`;
  if (before && body.w) { const d = body.w - before.w; s += ` · ${d >= 0 ? '+' : '−'}${fmt(Math.abs(d), 2)} kg vs ${dLong(before.date)}`; }
  const cs = creatineStart(ctx);
  if (cs && diffDays(cs, date) >= 0 && diffDays(cs, date) <= 35) s += `\n💧 Creatine since ${dLong(cs)}: expect up to 1–2 kg of extra water this month, and the scale’s body fat % to read a little low. The 4-week check allows for it.`;
  return s + '\nSaved to Health DB.';
}

/* ============================================================ setup */
export async function setup(req, env, url) {
  if (url.searchParams.get('key') !== env.API_KEY || !env.API_KEY) return text('Add ?key=<your API_KEY> to the address.', 403);
  const checks = [];
  checks.push(['Database', 'ok']);
  checks.push(['API key for Claude', env.ANTHROPIC_API_KEY ? 'set' : 'MISSING']);
  checks.push(['GitHub backup token', env.GITHUB_TOKEN ? 'set' : 'missing (backups off)']);
  checks.push(['Voice notes (Workers AI)', env.AI ? 'on' : 'off: add the [ai] binding']);
  if (!env.TELEGRAM_TOKEN) checks.push(['Telegram', 'MISSING token']);
  else {
    const hook = await tg(env, 'setWebhook', { url: url.origin + '/telegram', secret_token: await webhookSecret(env), allowed_updates: ['message', 'callback_query'], drop_pending_updates: true });
    checks.push(['Telegram webhook', hook.ok ? 'connected' : 'FAILED: ' + (hook.description || '')]);
    await tg(env, 'setMyCommands', { commands: [
      { command: 'today', description: 'Today so far vs targets' }, { command: 'workout', description: 'Send me the next session in my plan' },
      { command: 'supps', description: 'Today’s supplements checklist' }, { command: 'week', description: 'The last 7 days' }, { command: 'foods', description: 'My presets and saved foods' }, { command: 'photos', description: 'Send progress photos' }, { command: 'away', description: 'Pause reminders while you’re away' }, { command: 'back', description: 'End away mode' }, { command: 'undo', description: 'Undo the last thing logged' }, { command: 'help', description: 'What you can send me' }] });
    if (hook.ok) await send(env, '✅ <b>Health DB is connected.</b> Send /help to see what I can do.');
  }
  const days = await env.DB.prepare('SELECT COUNT(*) AS n FROM days').first();
  checks.push(['Days stored', String(days?.n ?? 0)]);
  return new Response(`<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><title>Health DB setup</title><body style="font:16px system-ui;background:#0c0c0f;color:#e8e6e1;padding:24px"><h2>Health DB</h2><table cellpadding=6>${checks.map(([a, b]) => `<tr><td>${a}</td><td><b>${b}</b></td></tr>`).join('')}</table></body>`, { headers: { 'content-type': 'text/html; charset=utf-8' } });
}
