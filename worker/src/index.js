import { text, json, r1, fmt, today, validDate, authorized, webhookSecret } from './util.js';
import { ensureSchema, getDay, mutateDay } from './store.js';
import { targets } from './model.js';
import { tg, send, telegramWebhook, command } from './bot.js';
import { hourly, backup } from './cron.js';
import { mcpHandler } from './mcp.js';

/* Health DB — Sam's own backend.
   One database (Cloudflare D1), three ways in:
     /telegram  the bot: log food, weigh-ins and sessions; get your workout sent to you
     /mcp       the dashboard and Claude chats, through a custom connector
     /health    Apple Health (iOS Shortcut) weigh-in sync
   Plus an hourly cron: weigh-in reminders, an evening protein nudge and a nightly GitHub backup.
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
  if (!body.w && body.bf == null) return json({ ok: false, error: 'no weight or body fat in the request' }, 400);
  const prev = await getDay(env, date);
  await mutateDay(env, date, d => {
    const scale = { ...(d.body?.scale || {}) }; if (lean) scale.ffmKg = lean; if (bmi) scale.bmi = bmi;
    d.body = { ...(d.body || {}), ...body, ...(Object.keys(scale).length ? { scale } : {}), src: d.body?.src || 'apple-health' };
  });
  if (env.TELEGRAM_TOKEN && !prev?.body?.w) await send(env, `⚖️ Synced from Apple Health · <b>${fmt(body.w, 2)} kg</b>${body.bf != null ? ` · ${fmt(body.bf, 1)}% fat` : ''}`);
  return json({ ok: true, date, body });
}

/* ============================================================ setup */
export async function setup(req, env, url) {
  if (url.searchParams.get('key') !== env.API_KEY || !env.API_KEY) return text('Add ?key=<your API_KEY> to the address.', 403);
  const checks = [];
  checks.push(['Database', 'ok']);
  checks.push(['API key for Claude', env.ANTHROPIC_API_KEY ? 'set' : 'MISSING']);
  checks.push(['GitHub backup token', env.GITHUB_TOKEN ? 'set' : 'missing (backups off)']);
  if (!env.TELEGRAM_TOKEN) checks.push(['Telegram', 'MISSING token']);
  else {
    const hook = await tg(env, 'setWebhook', { url: url.origin + '/telegram', secret_token: await webhookSecret(env), allowed_updates: ['message', 'callback_query'], drop_pending_updates: true });
    checks.push(['Telegram webhook', hook.ok ? 'connected' : 'FAILED: ' + (hook.description || '')]);
    await tg(env, 'setMyCommands', { commands: [
      { command: 'today', description: 'Today so far vs targets' }, { command: 'workout', description: 'Send me the next session in my plan' },
      { command: 'week', description: 'The last 7 days' }, { command: 'undo', description: 'Undo the last thing logged' }, { command: 'help', description: 'What you can send me' }] });
    if (hook.ok) await send(env, '✅ <b>Health DB is connected.</b> Send /help to see what I can do.');
  }
  const days = await env.DB.prepare('SELECT COUNT(*) AS n FROM days').first();
  checks.push(['Days stored', String(days?.n ?? 0)]);
  return new Response(`<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><title>Health DB setup</title><body style="font:16px system-ui;background:#0c0c0f;color:#e8e6e1;padding:24px"><h2>Health DB</h2><table cellpadding=6>${checks.map(([a, b]) => `<tr><td>${a}</td><td><b>${b}</b></td></tr>`).join('')}</table></body>`, { headers: { 'content-type': 'text/html; charset=utf-8' } });
}
