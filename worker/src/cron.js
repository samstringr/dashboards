/* Health DB · cron.js */
import { json, r1, fmt, today, localParts, sha256hex, b64utf8 } from './util.js';
import { allDays, allConfig, getKV, setKV } from './store.js';
import { dayTotals, targets, loadCtx } from './model.js';
import { send, qtyTxt, proteinTip } from './bot.js';
import { quietState, quietNote, suppReminder } from './extras.js';
import { photoDue } from './photos.js';

/* ============================================================ cron */
export async function hourly(env, now) {
  const { hour, wd } = localParts(now), td = today();
  const once = async (key, fn) => { const k = 'sent:' + key + ':' + td; if (await getKV(env, k)) return; await setKV(env, k, 1); await fn(); };
  const remindHours = [7, 10, 14, 21];
  if (env.TELEGRAM_TOKEN && remindHours.includes(hour)) {
    const ctx = await loadCtx(env), q = quietState(ctx, td);
    if (q.quiet) await quietNote(env, q);      // away, or 2+ empty days: no reminders (one heads-up per gap)
    else {
      if (hour === 7 && ['Mon', 'Wed', 'Fri'].includes(wd)) {
        // progress photos every 4 weeks, on a weigh-in morning; asked again on the next one until a set arrives
        const pd = await photoDue(env, td);
        if (pd.due) await once('photos', () => setKV(env, 'photoask', { t: Date.now() }).then(() => send(env, `📸 <b>Progress photos are due</b>${pd.last ? ' (last set ' + pd.last.slice(8) + '/' + pd.last.slice(5, 7) + ')' : ' (your first set: the baseline)'}. After the weigh-in: front, side and back, relaxed, same spot and light as last time. Send them all together whenever you're ready; no caption or /done needed.`)));
        const d = ctx.days.find(x => x.date === td);
        if (!d?.body?.w) await once('weigh', () => send(env, '⚖️ <b>Weigh-in morning.</b> On waking, after the toilet, before food or water. Step on the scale; Apple Health syncs it, or send me the Fit Profile screenshot.'));
      }
      // If the morning weigh-in hasn't arrived by 10:00, say so: it's how you find out the Shortcut didn't fire.
      if (hour === 10 && ['Mon', 'Wed', 'Fri'].includes(wd) && !ctx.days.find(x => x.date === td)?.body?.w)
        await once('weigh-miss', () => send(env, '⚖️ No weigh-in has reached me yet today. If you stepped on the scale, the Shortcut didn’t send it: open Shortcuts and run <b>Send weigh-in to H&amp;F</b> by hand, or send me the Fit Profile screenshot. Skipping today is fine too.'));
      if (hour === 14) await once('supps-lunch', () => suppReminder(env, ctx, td, ['morning', 'lunch', 'any']));
      if (hour === 21) {
        const t = dayTotals(ctx.days.find(x => x.date === td)), T = targets(ctx);
        if (T.ok && (!t || t.kcal == null)) await once('nudge', () => send(env, '🍽 Nothing logged today. Send me what you ate, even roughly. A partial day is still data.'));
        else if (T.ok && t.p < T.protein - 15) await once('nudge', () => send(env, `🍗 You’re at <b>${fmt(t.p)} g</b> of ${T.protein} g protein and ${fmt(t.kcal)} of ${fmt(T.kcal)} kcal.${proteinTip(ctx, T.protein - t.p, T.kcal - t.kcal)}`));
        await once('supps-eve', () => suppReminder(env, ctx, td, ['morning', 'lunch', 'any', 'post', 'dinner', 'bed']));
      }
    }
  }
  if (hour === 3 && env.GITHUB_TOKEN && env.GITHUB_REPO) await once('backup', () => backup(env));
  if (hour === 4) await env.DB.prepare('DELETE FROM seen WHERE at < ?').bind(Date.now() - 14 * 864e5).run();
}
export async function backup(env) {
  const days = await allDays(env), config = await allConfig(env);
  const data = JSON.stringify({ exportedAt: new Date().toISOString(), days, config }, null, 1);
  const hash = await sha256hex(data.replace(/"exportedAt":\s*"[^"]*"/, ''));
  if (hash === await getKV(env, 'backup:hash')) return { ok: true, skipped: true };
  const rows = [['date', 'kcal', 'protein_g', 'carbs_g', 'fat_g', 'source', 'partial', 'weight_kg', 'bf_pct', 'smm_kg', 'waist_cm', 'sessions', 'training', 'supplements', 'items']];
  for (const d of days) {
    const t = dayTotals(d), b = d.body || {}, ws = d.workouts || [];
    rows.push([d.date, t?.kcal != null ? Math.round(t.kcal) : '', t?.p != null ? r1(t.p) : '', t?.c != null ? r1(t.c) : '', t?.f != null ? r1(t.f) : '', t?.src || '', t?.partial ? 'yes' : '', b.w ?? '', b.bf ?? '', b.smm ?? '', b.waist ?? '', ws.length || '', ws.map(w => w.label || w.kind).join(' / '), Object.keys(d.supps || {}).join(' / '), (d.items || []).map(i => i.n + ' ' + qtyTxt(i)).join('; ')]);
  }
  const csv = rows.map(r => r.map(v => /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : v).join(',')).join('\n') + '\n';
  const msg = 'Nightly backup ' + today();
  await ghPut(env, 'backup/health-data.json', data, msg);
  await ghPut(env, 'backup/health-daily-log.csv', csv, msg);
  await setKV(env, 'backup:hash', hash); await setKV(env, 'backup:last', { at: new Date().toISOString(), days: days.length });
  return { ok: true, days: days.length };
}
export async function ghPut(env, path, content, message) {
  const api = `${env.GITHUB_API || 'https://api.github.com'}/repos/${env.GITHUB_REPO}/contents/${path}`;
  const h = { authorization: `Bearer ${env.GITHUB_TOKEN}`, 'user-agent': 'health-db-worker', accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' };
  let sha; const g = await fetch(api, { headers: h }); if (g.ok) sha = (await g.json()).sha;
  const p = await fetch(api, { method: 'PUT', headers: { ...h, 'content-type': 'application/json' }, body: JSON.stringify({ message, content: b64utf8(content), ...(sha ? { sha } : {}) }) });
  if (!p.ok) throw new Error('GitHub backup failed: ' + p.status + ' ' + (await p.text()).slice(0, 200));
}
