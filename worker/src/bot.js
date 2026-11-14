/* Health DB · bot.js */
import { text, json, esc, r1, fmt, mean, uid, clamp, today, addDays, dLong, validDate, normName, webhookSecret, b64 } from './util.js';
import { getDay, mutateDay, putConfig, getKV, setKV, delKV } from './store.js';
import { dayTotals, weighins, rollAvg, targets, lastPerf, setsText, planState, addLoadDue, libMacros, loadCtx } from './model.js';
import { parseMessage } from './ai.js';
import { photoRoute, rememberImages, isProgressNote, moveRemembered, photoSessionOpen, openPhotoSession, closePhotoSession, savePhotoFromTelegram, undoBatch } from './photos.js';
import { normaliseItems, allKnown, presetEntry, savePreset, foodsHtml, howMuch, howMuchHtml } from './food.js';
import { closeDay, closeHtml, singleExtras } from './close.js';
import { sendSupps, tickSupps, onSuppCallback, suppList, setAway, endAway, welcomeBack, parseAwayArgs, transcribe } from './extras.js';

/* ============================================================ Telegram */
export async function tg(env, method, body) {
  const base = env.TELEGRAM_API || 'https://api.telegram.org';
  const r = await fetch(`${base}/bot${env.TELEGRAM_TOKEN}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({ ok: false }));
  if (!j.ok) console.error('telegram', method, JSON.stringify(j).slice(0, 300));
  return j;
}
export const chatId = env => Number(env.ALLOWED_TELEGRAM_ID);
export const send = (env, html, extra = {}) => tg(env, 'sendMessage', { chat_id: chatId(env), text: html.slice(0, 4000), parse_mode: 'HTML', link_preview_options: { is_disabled: true }, ...extra });
export const buttons = rows => ({ reply_markup: { inline_keyboard: rows.map(r => r.map(([t, d]) => ({ text: t, callback_data: d }))) } });

export async function telegramWebhook(request, env) {
  if (request.headers.get('x-telegram-bot-api-secret-token') !== await webhookSecret(env)) return text('forbidden', 403);
  const upd = await request.json();
  const ins = await env.DB.prepare('INSERT OR IGNORE INTO seen (update_id, at) VALUES (?, ?)').bind(upd.update_id, Date.now()).run();
  if (!ins.meta || !ins.meta.changes) return text('ok');   // already handled (Telegram retry)
  const from = upd.message?.from || upd.callback_query?.from;
  if (!from || String(from.id) !== String(env.ALLOWED_TELEGRAM_ID)) return text('ok');
  try {
    if (upd.callback_query) await onCallback(env, upd.callback_query);
    else if (upd.message) await onMessage(env, upd.message);
  } catch (e) {
    console.error('handler', e && e.stack || e);
    await logError(env, e).catch(() => {});
    const retry = e.raw ? uid() : null;
    if (retry) await setKV(env, 'retry', { token: retry, raw: e.raw, at: Date.now() }).catch(() => {});
    await send(env, '⚠️ That didn’t work: ' + esc(String(e.message || e)).slice(0, 300) + '\nNothing was saved.' + (retry ? ' Tap to try the same message again.' : ' Try again.'), retry ? buttons([[['🔁 Try again', 'rt:' + retry]]]) : {});
  }
  return text('ok');
}
/* The last 20 failures, so a "that didn't work" can be diagnosed afterwards (MCP get_bot_errors).
   WHY: on 7 Nov a message failed and nothing recorded why; Cloudflare's own logs are not kept. */
export async function logError(env, e) {
  const log = (await getKV(env, 'errlog')) || [];
  log.unshift({ at: new Date().toISOString(), error: String(e?.message || e).slice(0, 300), ...(e?.status ? { status: e.status } : {}), ...(e?.detail ? { detail: e.detail } : {}), ...(e?.raw ? { message: String(e.raw).slice(0, 300) } : {}), where: String(e?.stack || '').split('\n').slice(1, 3).join(' | ').slice(0, 200) });
  await setKV(env, 'errlog', log.slice(0, 20));
}
export const YES = /^(y|yes|yep|yeah|ok|okay|log( it)?|confirm|✅|👍|correct|good|fine|sure)[.! ]*$/i;
export const NO = /^(n|no|nope|cancel|stop|❌|✖️?|discard)[.! ]*$/i;

export async function onMessage(env, msg) {
  let raw = (msg.text || msg.caption || '').trim();
  const voice = msg.voice || msg.audio;
  if (voice) {
    if ((voice.duration || 0) > 300) return send(env, 'That voice note is over 5 minutes. Keep it shorter, or split it.');
    await tg(env, 'sendChatAction', { chat_id: chatId(env), action: 'typing' });
    raw = await transcribe(env, voice.file_id);
    if (!raw) return send(env, 'I couldn’t hear anything in that voice note. Try again, or type it.');
    await send(env, `🎙 <i>“${esc(raw.slice(0, 600))}”</i>`);
  }
  // a progress photo (captioned with a pose or "progress", or sent while a photo session is open) is saved, never parsed
  const isImg = msg.photo?.length || (msg.document && /^image\//.test(msg.document.mime_type || ''));
  const tgFile = (e, id) => tgImage(e, id, 'image/jpeg');
  if (isImg && await photoRoute(env, msg)) return savePhotoFromTelegram(env, msg, tgFile, tg, chatId(env), buttons);
  if (!isImg && isProgressNote(raw)) return moveRemembered(env, tgFile, send);
  if (raw.startsWith('/')) return command(env, raw);
  let image = null;
  if (msg.photo?.length) image = await tgImage(env, msg.photo[msg.photo.length - 1].file_id, 'image/jpeg');
  else if (msg.document && /^image\//.test(msg.document.mime_type || '')) image = await tgImage(env, msg.document.file_id, msg.document.mime_type);
  if (image) await rememberImages(env, msg);
  return readMessage(env, raw, image, msg);
}
/* Food, weigh-ins and workouts: what Claude reads. */
async function readMessage(env, raw, image, msg) {
  await welcomeBack(env, await loadCtx(env), today());
  const pending = await getKV(env, 'pending');
  if (pending && !image && YES.test(raw)) return commitPending(env, pending);
  if (pending && !image && NO.test(raw)) { await clearPending(env, pending); return send(env, 'Cancelled. Nothing logged.'); }
  if (!raw && !image) return;
  await tg(env, 'sendChatAction', { chat_id: chatId(env), action: 'typing' });
  const ctx = await loadCtx(env);
  try {
    const parsed = await parseMessage(env, ctx, raw, image, pending);
    // a physique photo: saved as a progress photo, never logged (14 Nov 2026)
    if (parsed.intent === 'photo' && image) return msg ? savePhotoFromTelegram(env, msg, (e, id) => tgImage(e, id, 'image/jpeg'), tg, chatId(env), buttons, parsed.photo?.pose) : send(env, 'That looks like a progress photo. Send it again and I’ll file it.');
    return await handleParsed(env, ctx, parsed, pending);
  } catch (e) { if (raw && !image) e.raw = raw; throw e; }
}
export async function tgImage(env, fileId, mime) {
  const f = await tg(env, 'getFile', { file_id: fileId });
  if (!f.ok) throw new Error('Couldn’t download the photo from Telegram');
  const base = env.TELEGRAM_API || 'https://api.telegram.org';
  const r = await fetch(`${base}/file/bot${env.TELEGRAM_TOKEN}/${f.result.file_path}`);
  const buf = await r.arrayBuffer();
  const ext = (f.result.file_path.split('.').pop() || '').toLowerCase();
  const media = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : (mime && mime !== 'application/octet-stream' ? mime : 'image/jpeg');
  return { media_type: media, data: b64(buf) };
}
export async function onCallback(env, cq) {
  await tg(env, 'answerCallbackQuery', { callback_query_id: cq.id });
  const [act, token, opt] = String(cq.data || '').split(':');
  const strip = () => tg(env, 'editMessageReplyMarkup', { chat_id: chatId(env), message_id: cq.message?.message_id, reply_markup: { inline_keyboard: [] } });
  if (act === 'ok' || act === 'no') {
    const pending = await getKV(env, 'pending');
    await strip();
    if (!pending || pending.id !== token) return send(env, 'That proposal has expired. Send it again.');
    if (act === 'no') { await delKV(env, 'pending'); return send(env, 'Cancelled. Nothing logged.'); }
    if (pending.options && opt != null && pending.options[+opt]) pending.items = pending.options[+opt].items;   // a numbered option or a closer
    return commitPending(env, pending, true);
  }
  if (act === 'undo') { await strip(); return undoLast(env, token); }
  if (act === 'phs') { await strip(); return openPhotoSession(env, send); }
  if (act === 'phd') { await strip(); return closePhotoSession(env, send); }
  if (act === 'phx') {   // "not progress photos": take the batch back out; a single photo is read as usual
    await strip();
    const u = await undoBatch(env, token);
    if (u.one) { await send(env, 'Taken out of your progress photos; reading it instead.'); return readMessage(env, '', { media_type: u.one.mime, data: u.one.data }); }
    return send(env, u.n ? `Took ${u.n} photos back out of your progress photos. If they were food or a label, send them again with a caption saying what they are.` : 'Those have already gone.');
  }
  if (act === 'rt') {
    await strip();
    const r = await getKV(env, 'retry');
    if (!r || r.token !== token) return send(env, 'That message has expired. Send it again.');
    await delKV(env, 'retry');
    await send(env, `🔁 Trying again: <i>“${esc(r.raw.slice(0, 300))}”</i>`);
    return onMessage(env, { text: r.raw });
  }
  if (act === 'wk') return sendWorkout(env, token || null);
  if (act === 'sp' || act === 'sa') return onSuppCallback(env, await loadCtx(env), cq);
}

/* ---------- acting on what Claude parsed ---------- */
export const qtyTxt = it => it.q == null ? '' : (it.u === 'serving' ? fmt(it.q, it.q % 1 ? 1 : 0) + '×' : fmt(it.q, it.q % 1 ? 1 : 0) + ' ' + it.u);
export function itemsHtml(items) {
  const lines = items.map(i => `• ${esc(i.n)} <i>${esc(qtyTxt(i))}</i>${i.est ? '*' : ''} — ${fmt(i.kcal)} kcal · ${fmt(i.p, 1)} P · ${fmt(i.c)} C · ${fmt(i.f)} F`);
  const t = items.reduce((a, i) => [a[0] + i.kcal, a[1] + i.p, a[2] + i.c, a[3] + i.f], [0, 0, 0, 0]);
  return lines.join('\n') + `\n<b>Total ${fmt(t[0])} kcal · ${fmt(t[1], 1)} g protein</b> · ${fmt(t[2])} C · ${fmt(t[3])} F`;
}
export async function remainingLine(env, ctx, date) {
  const d = await getDay(env, date), t = dayTotals(d), T = targets(ctx, date);
  if (!T.ok || !t) return '';
  const pl = T.protein - t.p, kl = T.kcal - t.kcal;
  let s = `\n\n${date === today() ? 'Today' : dLong(date)}: <b>${fmt(t.kcal)}</b> / ${fmt(T.kcal)} kcal · <b>${fmt(t.p)}</b> / ${T.protein} g protein`;
  if (date === today()) s += pl > 0 ? `\nLeft: ${fmt(pl)} g protein in ${fmt(Math.max(0, kl))} kcal${proteinTip(ctx, pl, kl)}` : `\n✅ Protein floor hit${kl < 0 ? ` · ${fmt(-kl)} kcal over` : ` · ${fmt(kl)} kcal left`}`;
  return s;
}
export function proteinTip(ctx, pl, kl) {
  if (pl > 90 || kl <= 0) return '';
  const best = ctx.library.filter(x => x.u === 'g' && (x.d || 0) >= 100 && x.m[1] / Math.max(1, x.m[0]) >= 0.1).sort((a, b) => b.m[1] / b.m[0] - a.m[1] / a.m[0])[0];
  if (!best) return '';
  const g = Math.min(Math.ceil(pl / best.m[1] * best.q / 10) * 10, Math.floor(kl / best.m[0] * best.q / 10) * 10, (best.d || 100) * 2.5);
  if (g < 50) return '';
  const m = libMacros(best, g);
  return `\nProtein first: ${g} g ${esc(best.n.toLowerCase())} = ${fmt(m[1])} g for ${fmt(m[0])} kcal.`;
}
export async function handleParsed(env, ctx, r, pending) {
  const td = today();
  const ids = new Set(suppList(ctx).items.map(s => s.id));
  const sp = (r.supps?.taken || []).filter(id => ids.has(id));
  if (sp.length) {
    const sd = validDate(r.supps.date, td);
    await tickSupps(env, sd, sp, true);
    if (r.intent === 'supps' || r.intent === 'answer') return sendSupps(env, ctx, sd);
    await send(env, '💊 Ticked: ' + sp.map(id => esc(suppList(ctx).items.find(s => s.id === id).n)).join(', '));
  }
  if (r.intent === 'supps') return sendSupps(env, ctx, validDate(r.supps?.date, td));
  if (r.intent === 'away' && r.away) {
    if (r.away.back) return (await endAway(env, ctx, td)) || send(env, 'You weren’t marked as away. Carry on.');
    const from = /^\d{4}-\d{2}-\d{2}$/.test(r.away.from || '') ? r.away.from : td, to = /^\d{4}-\d{2}-\d{2}$/.test(r.away.to || '') ? r.away.to : null;
    if (to && to < from) return send(env, 'That end date is before the start. Try again.');
    return setAway(env, ctx, from, to, r.away.note);
  }
  if (r.intent === 'food' && r.food?.items?.length) {
    const date = validDate(r.food.date, td), items = normaliseItems(ctx, r.food.items);
    const certain = allKnown(items) && !r.food.ask && !r.food.lookupFailed;
    if (certain && !pending) {
      await mutateDay(env, date, d => { (d.items ||= []).push(...items); });
      const token = uid(); await setKV(env, 'last', { token, kind: 'food', date, ids: items.map(i => i.id) });
      return send(env, `✅ Logged · ${dLong(date)}\n${itemsHtml(items)}${await remainingLine(env, ctx, date)}`, buttons([[['↩️ Undo', 'undo:' + token]]]));
    }
    const p = { id: uid(), kind: 'food', date, payload: { date, items: r.food.items }, items, created: Date.now() };
    const ass = (r.food.assumptions || []).filter(Boolean);
    const msg = await send(env, `🍽 <b>Check this before I log it</b> · ${dLong(date)}\n${itemsHtml(items)}`
      + (items.some(i => i.est) ? '\n<i>* estimated</i>' : '')
      + (ass.length ? '\n\nAssumed: ' + ass.map(esc).join('; ') : '')
      + (r.food.ask ? '\n\n❓ ' + esc(r.food.ask) : '')
      + (r.food.lookupFailed ? `\n\n⚠️ Couldn’t look these up (${esc(String(r.food.lookupFailed).slice(0, 120))}), so the starred ones are my own estimates.` : '')
      + (items.some(i => i.ref) ? '\n<i>Repeats reuse the numbers you logged before.</i>' : '')
      + '\n\nTap ✅, or reply with what to change.', buttons([[['✅ Log it', 'ok:' + p.id], ['✖️ Cancel', 'no:' + p.id]]]));
    p.messageId = msg?.result?.message_id;
    await setKV(env, 'pending', p);
    return;
  }
  if (r.intent === 'preset' && r.preset?.name && r.preset.items?.length) {
    const pr = r.preset, parts = normaliseItems(ctx, pr.items), { entry, old } = presetEntry(ctx, pr, parts);
    if (pending) await clearPending(env, pending);
    const p = { id: uid(), kind: 'preset', payload: pr, entry, created: Date.now() };
    const ass = (pr.assumptions || []).filter(Boolean);
    const msg = await send(env, `📗 <b>${old ? 'Update' : 'Save'} preset “${esc(entry.n)}”?</b>${old && normName(old.n) !== normName(pr.name) ? ` <i>(you called it “${esc(pr.name)}”)</i>` : ''}\n`
      + `${entry.servings > 1 ? `These make ${entry.servings} servings:` : 'One serving is:'}\n${itemsHtml(parts)}`
      + `\n\nPer serving: <b>${fmt(entry.m[0])} kcal · ${fmt(entry.m[1], 1)} g protein</b> · ${fmt(entry.m[2])} C · ${fmt(entry.m[3])} F`
      + (old ? `\nWas ${fmt(old.m[0])} kcal · ${fmt(old.m[1], 1)} g protein${old.u === 'serving' ? '' : ' per ' + fmt(old.q) + ' ' + old.u}.` : '')
      + (parts.some(i => i.est) ? '\n<i>* estimated</i>' : '') + (ass.length ? '\nAssumed: ' + ass.map(esc).join('; ') : '')
      + (pr.lookupFailed ? `\n⚠️ Couldn’t look these up (${esc(String(pr.lookupFailed).slice(0, 120))}), so the starred ones are my own estimates.` : '')
      + `\n\nThen just send “${esc((entry.al[0] || entry.n).toLowerCase())}”, or “half of ${esc((entry.al[0] || entry.n).toLowerCase())}”.`, buttons([[['✅ Save', 'ok:' + p.id], ['✖️ Cancel', 'no:' + p.id]]]));
    p.messageId = msg?.result?.message_id; await setKV(env, 'pending', p); return;
  }
  if (r.intent === 'howmuch' && r.howmuch) {
    if (pending) await clearPending(env, pending);
    const date = validDate(r.howmuch.date, td), id = uid();
    const itemFor = (U, q) => ({ ...U.item, name: U.name, qty: q, unit: U.u, kcal: q * U.m[0] / U.q, p: q * U.m[1] / U.q, c: q * U.m[2] / U.q, f: q * U.m[3] / U.q });
    let html, options, rows;
    const c = closeDay(ctx, r.howmuch, date);
    if (!c.single) {   // two foods: numbered combinations, then closers
      if (c.why) return send(env, closeHtml(c, date));
      options = Object.fromEntries(c.opts.map((o, i) => [i, { items: normaliseItems(ctx, [o.qa > 0 && itemFor(c.A, o.qa), o.qb > 0 && itemFor(c.B, o.qb)].filter(Boolean)) }]));
      html = closeHtml(c, date); rows = [c.opts.map((o, i) => [['1️⃣', '2️⃣', '3️⃣', '4️⃣'][i] + ' Log', `ok:${id}:${i}`])];
    } else {
      const h = howMuch(ctx, { ...r.howmuch, food: (r.howmuch.foods || [])[0] || r.howmuch.food }, date);
      if (h.why || h.q <= 0) return send(env, howMuchHtml(h, date));
      const ex = singleExtras(ctx, h, date);
      options = { 0: { items: normaliseItems(ctx, [itemFor(h.U, h.q)]) } };
      html = howMuchHtml(h, date) + ex.html; rows = [[['✅ Log ' + (h.U.u === 'serving' ? fmt(h.q, h.q % 1 ? 1 : 0) + '×' : fmt(h.q) + ' ' + h.U.u), `ok:${id}:0`]]];
    }
    // 14 Nov 2026: buttons for the numbered options only (Sam: too many buttons). A closer is typed like any food.
    rows.push([['✖️ No thanks', 'no:' + id]]);
    const p = { id, kind: 'food', date, payload: { date, items: options[0].items.map(i => ({ name: i.n, qty: i.q, unit: i.u, libId: i.lib || null, ref: i.ref || null })) }, items: options[0].items, options, created: Date.now() };
    const msg = await send(env, html, buttons(rows));
    p.messageId = msg?.result?.message_id; await setKV(env, 'pending', p); return;
  }
  if (pending) await clearPending(env, pending);
  if (r.intent === 'weight' && r.weight) {
    const w = r.weight, date = validDate(w.date, td);
    const body = {};
    if (+w.weight_kg) body.w = +w.weight_kg;
    if (+w.bf_pct) body.bf = +w.bf_pct;
    if (+w.smm_kg) body.smm = +w.smm_kg; else if (+w.smm_pct && body.w) body.smm = r1(w.smm_pct * body.w / 100);
    if (+w.waist_cm) body.waist = +w.waist_cm;
    if (!Object.keys(body).length) return send(env, 'I couldn’t find any readings in that. Send the numbers or the Fit Profile screenshot.');
    const extra = {}; const map = { muscle_kg: 'muscleKg', ffm_kg: 'ffmKg', visceral: 'visceral', water_pct: 'waterPct', bone_kg: 'boneKg', bmr_kcal: 'bmr', bmi: 'bmi', metabolic_age: 'metAge', protein_pct: 'proteinPct', subq_pct: 'subqPct' };
    for (const [k, n] of Object.entries(map)) if (w.extra && w.extra[k] != null && isFinite(+w.extra[k])) extra[n] = +w.extra[k];
    if (+w.smm_pct) extra.smmPct = +w.smm_pct;
    const prev = (await getDay(env, date))?.body || null;
    await mutateDay(env, date, d => { d.body = { ...(d.body || {}), ...body, ...(Object.keys(extra).length ? { scale: { ...(d.body?.scale || {}), ...extra } } : {}), src: 'telegram' }; });
    const token = uid(); await setKV(env, 'last', { token, kind: 'weight', date, prev });
    const ctx2 = await loadCtx(env), wl = weighins(ctx2.days);
    const avg = rollAvg(wl, date, 'w');
    return send(env, `⚖️ Weigh-in saved · ${dLong(date)}\n${body.w ? `<b>${fmt(body.w, 2)} kg</b>` : ''}${body.bf ? ` · ${fmt(body.bf, 1)}% fat` : ''}${body.smm ? ` · ${fmt(body.smm, 1)} kg skeletal muscle` : ''}${avg && body.w ? `\n7-day average ${fmt(avg, 2)} kg` : ''}`, buttons([[['↩️ Undo', 'undo:' + token]]]));
  }
  if (r.intent === 'workout' && r.workout) {
    const w = r.workout, date = validDate(w.date, td);
    const kind = ['gym', 'football', 'run', 'swim', 'cycle', 'walk', 'other'].includes(w.kind) ? w.kind : 'other';
    const planS = ctx.plan?.sessions.find(s => s.code === w.planCode);
    const ex = (w.exercises || []).map(e => ({ n: String(e.name || '').slice(0, 80), sets: (e.sets || []).filter(s => s.kg != null || s.reps != null).map(s => { const o = { kg: s.kg ?? null, r: s.reps ?? null }; if (s.rpe != null) o.rpe = s.rpe; return o; }) })).filter(e => e.n && e.sets.length);
    const rec = { id: uid(), kind, label: String(w.label || (planS ? planS.code + ' · ' + planS.name : kind)).slice(0, 80), ...(planS ? { planCode: planS.code } : {}),
      ...(w.minutes ? { min: +w.minutes } : {}), ...(w.distance_km ? { km: +w.distance_km } : {}), ...(ex.length ? { ex } : {}), ...(w.note ? { note: String(w.note).slice(0, 280) } : {}), src: 'telegram', ...(ctx.plan?.site && kind === 'gym' ? { site: ctx.plan.site } : {}) };
    await mutateDay(env, date, d => { (d.workouts ||= []).push(rec); });
    const token = uid(); await setKV(env, 'last', { token, kind: 'workout', date, id: rec.id });
    let flags = '';
    if (planS) {
      const ups = planS.ex.filter(pe => addLoadDue(pe, ex.find(x => normName(x.n) === normName(pe.n))));
      if (ups.length) flags = '\n\n⬆️ Add load next time: ' + ups.map(u => esc(u.n)).join(', ');
    }
    const ctx2 = await loadCtx(env), ps = planState(ctx2);
    return send(env, `💪 Session saved · ${dLong(date)}\n<b>${esc(rec.label)}</b>${ex.length ? '\n' + ex.map(e => `• ${esc(e.n)}: ${esc(setsText(e.sets))}`).join('\n') : ''}${rec.min ? `\n${rec.min} min` : ''}${rec.km ? ` · ${rec.km} km` : ''}${flags}${ps && planS ? `\n\nNext in the queue: <b>${esc(ps.next.code)} · ${esc(ps.next.name)}</b>` : ''}`, buttons([[['↩️ Undo', 'undo:' + token]]]));
  }
  if (r.intent === 'recipe' && r.recipe?.per100) {
    const rc = r.recipe, m = rc.per100;
    const p = { id: uid(), kind: 'recipe', payload: rc, created: Date.now() };
    const msg = await send(env, `📗 <b>Save to your foods?</b>\n${esc(rc.name)}: per 100 g ${fmt(m.kcal)} kcal · ${fmt(m.p, 1)} P · ${fmt(m.c, 1)} C · ${fmt(m.f, 1)} F${rc.servingG ? `\nDefault portion ${rc.servingG} g` : ''}${rc.assumptions?.length ? '\nAssumed: ' + rc.assumptions.map(esc).join('; ') : ''}`, buttons([[['✅ Save', 'ok:' + p.id], ['✖️ Cancel', 'no:' + p.id]]]));
    p.messageId = msg?.result?.message_id; await setKV(env, 'pending', p); return;
  }
  return send(env, esc(r.answer || 'I wasn’t sure what to do with that. Try “200 g chicken and rice”, a Fit Profile screenshot, or /workout.'));
}
export async function clearPending(env, p) {
  await delKV(env, 'pending');
  if (p?.messageId) await tg(env, 'editMessageReplyMarkup', { chat_id: chatId(env), message_id: p.messageId, reply_markup: { inline_keyboard: [] } });
}
export async function commitPending(env, p, fromButton) {
  if (!fromButton) await clearPending(env, p); else await delKV(env, 'pending');
  const ctx = await loadCtx(env);
  if (p.kind === 'food') {
    await mutateDay(env, p.date, d => { (d.items ||= []).push(...p.items); });
    const token = uid(); await setKV(env, 'last', { token, kind: 'food', date: p.date, ids: p.items.map(i => i.id) });
    const t = p.items.reduce((a, i) => [a[0] + i.kcal, a[1] + i.p], [0, 0]);
    return send(env, `✅ Logged ${p.items.length} item${p.items.length > 1 ? 's' : ''} · ${fmt(t[0])} kcal · ${fmt(t[1], 1)} g protein${await remainingLine(env, ctx, p.date)}`, buttons([[['↩️ Undo', 'undo:' + token]]]));
  }
  if (p.kind === 'preset') {
    const entry = p.entry, ctx2 = await loadCtx(env);
    await putConfig(env, 'library', savePreset(ctx2, entry));
    return send(env, `📗 Saved <b>${esc(entry.n)}</b>: ${fmt(entry.m[0])} kcal · ${fmt(entry.m[1], 1)} g protein a serving.\nSend “${esc((entry.al[0] || entry.n).toLowerCase())}” to log it. /foods lists your presets.`);
  }
  if (p.kind === 'recipe') {
    const rc = p.payload, lib = ctx.library.slice();
    const id = 'r-' + normName(rc.name).slice(0, 24) + '-' + uid().slice(-4);
    lib.push({ id, n: rc.name, q: 100, u: 'g', m: [rc.per100.kcal, rc.per100.p, rc.per100.c, rc.per100.f].map(v => r1(+v || 0)), d: rc.servingG || 350, v: false, custom: true, note: 'Saved from Telegram ' + today() + (rc.assumptions?.length ? '. ' + rc.assumptions.join('; ') : '') });
    await putConfig(env, 'library', { items: lib });
    return send(env, `📗 Saved <b>${esc(rc.name)}</b>. Next time just send “${rc.servingG || 350} g ${esc(rc.name.toLowerCase())}”.`);
  }
}
export async function undoLast(env, token) {
  const last = await getKV(env, 'last');
  if (!last || (token && last.token !== token)) return send(env, 'Nothing to undo, or that was already undone.');
  if (last.kind === 'food') await mutateDay(env, last.date, d => { d.items = (d.items || []).filter(i => !last.ids.includes(i.id)); });
  if (last.kind === 'workout') await mutateDay(env, last.date, d => { d.workouts = (d.workouts || []).filter(w => w.id !== last.id); });
  if (last.kind === 'weight') await mutateDay(env, last.date, d => { if (last.prev) d.body = last.prev; else delete d.body; });
  await delKV(env, 'last');
  return send(env, '↩️ Undone.');
}

/* ---------- commands ---------- */
export async function command(env, raw) {
  const [cmd, ...rest] = raw.split(/\s+/); const c = cmd.toLowerCase().replace(/@.*/, '');
  if (c === '/start' || c === '/help') return send(env, `<b>Health & Fitness Bot</b>
Just tell me things:
• <i>“2 tins of tuna, 60 g Heinz light mayo, 2 slices of bread”</i>
• <i>“mum’s shepherd’s pie, full plate, with green beans”</i>. I’ll look up anything new and check with you first
• <i>“save mum’s chilli: 500 g beef mince, 2 tins tomatoes…”</i> to add a recipe
• <i>“my standard overnight oats are 100 g oats, 40 g protein powder…”</i> to save a preset; then just send <i>“standard overnight oats”</i>, or <i>“standard protein shake plus 1 extra scoop”</i>
• <i>“how much chilli and white rice closes the day?”</i>, <i>“how much chicken to hit my protein?”</i>
• a Fit Profile screenshot, or <i>“72.4 kg 16.8%”</i>
• <i>“ran 5 km in 28 min”</i>, <i>“football, 60 min”</i>, or a filled-in /workout
• <i>“took creatine and zinc”</i> or <i>“all supplements taken”</i>
• a 🎙 voice note saying any of the above
/today · where you are vs targets
/workout · the next session in your plan
/supps · today’s supplements checklist
/week · the last 7 days
/foods · your presets and saved foods
/photos · progress photos (front, side, back). When a set is due, just send them: no caption, no /done
/away · pause reminders (<i>/away 7</i> or <i>/away 2026-12-28</i>); /back to end
/undo · undo the last thing logged`);
  if (c === '/today') return send(env, await todayHtml(env));
  if (c === '/workout') return sendWorkout(env, rest[0] || null);
  if (c === '/week') return send(env, await weekHtml(env));
  if (c === '/foods' || c === '/presets') return send(env, foodsHtml(await loadCtx(env)));
  if (c === '/photos') return openPhotoSession(env, send);
  if (c === '/done') return (await photoSessionOpen(env)) ? closePhotoSession(env, send) : send(env, 'Nothing to finish.');
  if (c === '/undo') return undoLast(env, null);
  if (c === '/supps') return sendSupps(env, await loadCtx(env), today());
  if (c === '/back') { const ctx = await loadCtx(env); return (await endAway(env, ctx, today())) || send(env, 'You weren’t marked as away. Carry on.'); }
  if (c === '/away') {
    const ctx = await loadCtx(env), a = parseAwayArgs(today(), rest);
    if (a) return a.to && a.to < a.from ? send(env, 'That end date is before today.') : setAway(env, ctx, a.from, a.to, null);
    return handleParsed(env, ctx, await parseMessage(env, ctx, 'I am away: ' + rest.join(' '), null, null), null);
  }
  return send(env, 'I don’t know that command. Try /help.');
}
export async function todayHtml(env) {
  const ctx = await loadCtx(env), td = today(), d = ctx.days.find(x => x.date === td), t = dayTotals(d), T = targets(ctx);
  if (!t) return `📅 ${dLong(td)}\nNothing logged yet.${T.ok ? `\nTargets: ${fmt(T.kcal)} kcal · ${T.protein} g protein.` : ''}`;
  const bar = (v, of) => { const n = clamp(Math.round(v / of * 10), 0, 10); return '▓'.repeat(n) + '░'.repeat(10 - n); };
  return `📅 <b>${dLong(td)}</b>\nProtein <b>${fmt(t.p)}</b> / ${T.protein} g <code>${bar(t.p, T.protein)}</code>\nCalories <b>${fmt(t.kcal)}</b> / ${fmt(T.kcal)} <code>${bar(t.kcal, T.kcal)}</code>\nCarbs ${fmt(t.c)} g · Fat ${fmt(t.f)} g` + (await remainingLine(env, ctx, td)).replace(/^\n\n[^\n]*\n?/, '\n');
}
export async function weekHtml(env) {
  const ctx = await loadCtx(env), td = today(), T = targets(ctx);
  const rows = []; let k = [], p = [];
  for (let i = 6; i >= 0; i--) {
    const ds = addDays(td, -i), d = ctx.days.find(x => x.date === ds), t = dayTotals(d), w = (d?.workouts || []).map(x => x.label || x.kind).join(', ');
    if (t && t.kcal != null && !t.void && ds !== td && !t.partial) { k.push(t.kcal); p.push(t.p); }
    rows.push(`${dLong(ds).padEnd(10)} ${t && t.kcal != null ? String(Math.round(t.kcal)).padStart(5) + ' ' + String(Math.round(t.p)).padStart(4) + 'P' : '    –      '}${w ? ' · ' + w : ''}`);
  }
  const wl = weighins(ctx.days), last = wl.filter(x => x.w).pop();
  return `<b>Last 7 days</b>\n<pre>${esc(rows.join('\n'))}</pre>\nAverage (complete days): ${fmt(mean(k))} kcal · ${fmt(mean(p))} g protein${T.ok ? ` vs ${fmt(T.kcal)} / ${T.protein}` : ''}` + (last ? `\nWeight: ${fmt(rollAvg(wl, last.date, 'w'), 2)} kg 7-day avg (last ${dLong(last.date)})` : '');
}
export async function sendWorkout(env, code) {
  const ctx = await loadCtx(env), ps = planState(ctx);
  if (!ps) { await send(env, 'No training plan loaded yet.'); return { ok: false, reason: 'no plan' }; }
  const s = (code && ctx.plan.sessions.find(x => x.code.toLowerCase() === String(code).toLowerCase())) || ps.next;
  const lines = s.ex.map(e => {
    const lp = lastPerf(ctx.days, e.n);
    return `${e.n} ${e.sets}×${e.reps}${e.rpe ? ' @' + e.rpe : ''} (${lp ? 'last ' + setsText(lp.sets) : e.opener ? 'start ' + e.opener : 'new'}):`;
  });
  await send(env, `🏋️ <b>${esc(s.code)} · ${esc(s.name)}</b> · session ${ps.nextNo}${ctx.plan.length ? ' of ' + ctx.plan.length : ''}${ps.deload ? ' · <b>deload</b>: 60% load, RPE 6' : ''}\nCopy this, fill in after each colon (e.g. <i>30x10, 30x9, 30x8</i>), and send it back.\n<pre>${esc('WORKOUT ' + s.code + '\n' + lines.join('\n'))}</pre>`);
  return { ok: true, session: s.code + ' · ' + s.name };
}
