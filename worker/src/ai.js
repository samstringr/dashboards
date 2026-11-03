/* Health DB · ai.js */
import { TZ, text, json, r1, today, dLong, normName } from './util.js';
import { dayTotals, targets, allWorkouts, planState } from './model.js';
import { send } from './bot.js';

/* ---------- Claude ---------- */
export async function claude(env, { model, system, messages, tools, max_tokens = 1500 }) {
  const base = env.ANTHROPIC_API || 'https://api.anthropic.com';
  let msgs = messages;
  for (let turn = 0; turn < 4; turn++) {
    const r = await fetch(base + '/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model, max_tokens, system, messages: msgs, ...(tools ? { tools } : {}) })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const m = j.error?.message || ('HTTP ' + r.status);
      if (/credit balance/i.test(m)) throw new Error('your Anthropic credit has run out. Top up in the Console, then resend');
      throw new Error('Claude API: ' + m);
    }
    if (j.stop_reason === 'pause_turn') { msgs = [...msgs, { role: 'assistant', content: j.content }]; continue; }
    return (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  }
  throw new Error('Claude took too long. Try again');
}
export function parseJSON(t) {
  if (!t) return null;
  try { return JSON.parse(t); } catch {}
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/); if (fence) { try { return JSON.parse(fence[1]); } catch {} }
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch {} }
  return null;
}
export function libraryBlock(ctx) {
  return ctx.library.map(x => `${x.id} | ${x.n} | per ${x.q} ${x.u} | ${x.m.map(v => r1(v)).join(' ')}`).join('\n') || '(empty)';
}
export function exerciseNames(ctx) {
  const m = new Map();
  for (const w of allWorkouts(ctx.days)) for (const e of (w.ex || [])) if (e.n) m.set(normName(e.n), e.n);
  for (const s of (ctx.plan?.sessions || [])) for (const e of s.ex) m.set(normName(e.n), e.n);
  return [...m.values()];
}
export const SCHEMA = `{"intent":"food"|"weight"|"workout"|"recipe"|"answer",
 "food":{"date":"YYYY-MM-DD","items":[{"name":str,"qty":num,"unit":"g"|"ml"|"serving","kcal":num,"p":num,"c":num,"f":num,"libId":str|null,"estimated":bool,"research":bool}],"assumptions":[str],"ask":str|null},
 "weight":{"date":"YYYY-MM-DD","weight_kg":num|null,"bf_pct":num|null,"smm_kg":num|null,"smm_pct":num|null,"waist_cm":num|null,"extra":{"muscle_kg":num,"ffm_kg":num,"visceral":num,"water_pct":num,"bone_kg":num,"bmr_kcal":num,"bmi":num,"metabolic_age":num,"protein_pct":num,"subq_pct":num}},
 "workout":{"date":"YYYY-MM-DD","kind":"gym"|"football"|"run"|"swim"|"cycle"|"walk"|"other","label":str,"planCode":str|null,"minutes":num|null,"distance_km":num|null,"exercises":[{"name":str,"sets":[{"kg":num|null,"reps":num|null,"rpe":num|null}]}],"note":str|null},
 "recipe":{"name":str,"per100":{"kcal":num,"p":num,"c":num,"f":num},"servingG":num|null,"assumptions":[str]},
 "answer":str}`;
export async function parseMessage(env, ctx, raw, image, pending) {
  const T = targets(ctx), td = today(), tt = dayTotals(ctx.days.find(d => d.date === td));
  const ps = planState(ctx);
  const system = `You are the logging parser for Sam's health and fitness bot. Sam is in the UK; assume UK products, UK portion sizes and cooked weights unless he says raw. Today is ${dLong(td)} (${td}). Reply with ONLY one JSON object, no prose, in this shape (include "intent" and only the key for that intent):
${SCHEMA}
Rules:
- food: one item per food. If an item clearly IS a LIBRARY entry, set libId and qty in that entry's unit; the server recomputes macros from the library. Otherwise give your best per-item numbers for the amount eaten (kcal whole number, macros 1 decimal), estimated true, libId null. Set research true for anything not in the LIBRARY whose numbers could easily be 20%+ off: home-cooked or family dishes, restaurant or takeaway meals, branded products you don't know the panel for. A plain single ingredient (boiled cabbage, a banana) needs no research. "a full standard plate" of a main is roughly 350-450 g. Put short, specific assumptions in "assumptions" (portion, which meat, oil). Use "ask" only for one question that would change the total by more than ~150 kcal.
- If a PENDING PROPOSAL is shown and the message corrects it ("it was beef", "make it 300 g", "add a yoghurt"), return the full corrected food object, keeping unchanged items.
- recipe: when Sam gives a recipe to save ("save mum's chilli: ..."), work out per-100 g macros of the FINISHED dish. Raw ingredient totals divided by the cooked weight; estimate the cooked yield if not given (stews ~85-90% of raw weight, mash-topped bakes ~90%).
- weight: from text or a Fit Profile screenshot (dates in the app are US format MM/DD/YYYY). "Skeletal Muscle" as % → smm_pct; in kg → smm_kg. "Muscle Mass" is a different number (extra.muscle_kg).
- workout: "3x8 at 60" = three sets of 8 at 60 kg. Bodyweight sets: kg null. Reuse EXERCISE names when they match. A message starting "WORKOUT <code>" is a filled-in session from the plan: planCode = that code, kind gym, and parse each line's text after the colon into sets; skip lines with nothing after the colon. Runs/swims: kind run/swim with minutes or distance.
- answer: for questions or chat. Max 80 words, numbers first, British English, direct. Use CONTEXT only.
- Dates: "yesterday", weekday names etc. are relative to today. Default date is today.
LIBRARY (id | name | per qty unit | kcal P C F):
${libraryBlock(ctx)}
EXERCISES: ${exerciseNames(ctx).join('; ') || 'none yet'}
PLAN SESSIONS: ${ctx.plan ? ctx.plan.sessions.map(s => s.code + '=' + s.name).join(', ') : 'none'}${ps ? ' (next: ' + ps.next.code + ')' : ''}
CONTEXT: targets ${T.ok ? T.kcal + ' kcal, ' + T.protein + ' g protein' : 'unknown'}; today so far ${tt && tt.kcal != null ? Math.round(tt.kcal) + ' kcal, ' + Math.round(tt.p) + ' g protein' : 'nothing logged'}.`;
  const content = [];
  if (image) content.push({ type: 'image', source: { type: 'base64', media_type: image.media_type, data: image.data } });
  let msg = raw || '(photo, no caption)';
  if (pending) msg = `PENDING PROPOSAL (not yet logged): ${JSON.stringify(pending.payload)}\n\nMESSAGE: ${msg}`;
  content.push({ type: 'text', text: msg });
  const out = parseJSON(await claude(env, { model: env.MODEL_FAST || 'claude-haiku-5-5', system, messages: [{ role: 'user', content }], max_tokens: 1800 }));
  if (!out || !out.intent) throw new Error('I couldn’t read that. Try rephrasing it');
  if (out.intent === 'food' && out.food?.items?.some(i => i.research)) {
    await send(env, '🔎 Looking that up…');
    const better = await researchFood(env, ctx, raw, out.food, image);
    if (better?.items?.length) out.food = { ...out.food, ...better, items: better.items };
  }
  return out;
}
export async function researchFood(env, ctx, raw, food, image) {
  const system = `You estimate nutrition for meals Sam (UK) has eaten, as accurately as the information allows. Use web search to find published nutrition panels for branded or restaurant items, and typical UK recipes for home-cooked dishes; work out per-100 g of the finished dish, then scale to his portion. Keep items that are already fine. Reply with ONLY JSON: {"items":[{"name":str,"qty":num,"unit":"g"|"ml"|"serving","kcal":num,"p":num,"c":num,"f":num,"libId":str|null,"estimated":true}],"assumptions":[str],"ask":str|null}. Assumptions: short and specific (e.g. "lamb mince 20% fat", "350 g portion"). Ask at most one question, only if it would move the total by more than ~150 kcal.`;
  const content = [];
  if (image) content.push({ type: 'image', source: { type: 'base64', media_type: image.media_type, data: image.data } });
  content.push({ type: 'text', text: `What Sam wrote: """${raw}"""\nFirst-pass estimate: ${JSON.stringify(food)}\nImprove the items marked research.` });
  const t = await claude(env, {
    model: env.MODEL_SMART || 'claude-sonnet-5-5', system, max_tokens: 2500, messages: [{ role: 'user', content }],
    tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3, user_location: { type: 'approximate', country: 'GB', timezone: TZ } }]
  });
  return parseJSON(t);
}
