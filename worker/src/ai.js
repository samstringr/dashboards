/* Health DB · ai.js */
import { TZ, r1, today, dLong, normName } from './util.js';
import { dayTotals, targets, allWorkouts, planState } from './model.js';
import { send } from './bot.js';
import { suppList } from './extras.js';
import { recentBlock, aliasesOf } from './food.js';

/* ---------- Claude ----------
   WHY the retries and the time budget (7 Nov 2026): a six-item message ("2 brioche buns, 2 servings of nandos peri
   mayo, … 1 nandos boneless chicken thigh") sent four items to the web lookup at once and the whole message
   failed. One busy or rate-limited answer from the API should cost a second try, not Sam's log. budget is
   the total time this call may take, retries included, so the bot always answers Telegram in time. */
const sleep = ms => new Promise(r => setTimeout(r, ms));
export async function claude(env, { model, system, messages, tools, max_tokens = 1500, budget = 40000 }) {
  const base = env.ANTHROPIC_API || 'https://api.anthropic.com', end = Date.now() + budget;
  let msgs = messages;
  for (let turn = 0; turn < 4; turn++) {
    let r, j;
    for (let attempt = 0; ; attempt++) {
      const left = end - Date.now();
      if (left < 3000) throw new Error('Claude took too long to answer');
      try {
        r = await fetch(base + '/v1/messages', {
          method: 'POST', signal: AbortSignal.timeout(left),
          headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
          body: JSON.stringify({ model, max_tokens, system, messages: msgs, ...(tools ? { tools } : {}) })
        });
        j = await r.json().catch(() => ({}));
      } catch (e) {
        if (e?.name === 'TimeoutError' || e?.name === 'AbortError') throw new Error('Claude took too long to answer');
        if (attempt < 2) { await sleep(1500 * (attempt + 1)); continue; }
        throw new Error('couldn’t reach Claude (' + (e?.message || e) + ')');
      }
      if (r.ok) break;
      const m = j.error?.message || ('HTTP ' + r.status);
      if (/credit balance/i.test(m)) throw new Error('your Anthropic credit has run out. Top up in the Console, then resend');
      const busy = r.status === 429 || r.status === 529 || r.status >= 500;
      const wait = Math.min(8000, (+r.headers.get('retry-after') || 0) * 1000 || 2000 * (attempt + 1));
      if (busy && attempt < 2 && end - Date.now() > wait + 5000) { await sleep(wait); continue; }
      const e = new Error('Claude API: ' + (r.status === 429 ? 'rate limit hit. ' : r.status === 529 ? 'Claude is overloaded. ' : '') + m);
      e.status = r.status; throw e;
    }
    if (j.stop_reason === 'pause_turn') { msgs = [...msgs, { role: 'assistant', content: j.content }]; continue; }
    return (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  }
  throw new Error('Claude took too long. Try again');
}
export function parseJSON(t) {
  if (!t) return null;
  const tries = [t];
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/); if (fence) tries.push(fence[1]);
  const a = t.indexOf('{'), b = t.lastIndexOf('}'); if (a >= 0 && b > a) tries.push(t.slice(a, b + 1));
  for (const s of tries) {
    try { return JSON.parse(s); } catch {}
    try { return JSON.parse(s.replace(/,\s*([}\]])/g, '$1')); } catch {}     // trailing commas
  }
  return null;
}
export function libraryBlock(ctx) {
  return ctx.library.map(x => `${x.id} | ${x.n}${aliasesOf(x).length ? ' (also: ' + aliasesOf(x).join('; ') + ')' : ''} | per ${x.q} ${x.u} | ${x.m.map(v => r1(v)).join(' ')}`).join('\n') || '(empty)';
}
export function exerciseNames(ctx) {
  const m = new Map();
  for (const w of allWorkouts(ctx.days)) for (const e of (w.ex || [])) if (e.n) m.set(normName(e.n), e.n);
  for (const s of (ctx.plan?.sessions || [])) for (const e of s.ex) m.set(normName(e.n), e.n);
  return [...m.values()];
}
const ITEM = `{"name":str,"qty":num,"unit":"g"|"ml"|"serving","kcal":num,"p":num,"c":num,"f":num,"libId":str|null,"ref":str|null,"estimated":bool,"research":bool}`;
export const SCHEMA = `{"intent":"food"|"weight"|"workout"|"recipe"|"preset"|"howmuch"|"supps"|"away"|"answer",
 "food":{"date":"YYYY-MM-DD","items":[${ITEM}],"assumptions":[str],"ask":str|null},
 "weight":{"date":"YYYY-MM-DD","weight_kg":num|null,"bf_pct":num|null,"smm_kg":num|null,"smm_pct":num|null,"waist_cm":num|null,"extra":{"muscle_kg":num,"ffm_kg":num,"visceral":num,"water_pct":num,"bone_kg":num,"bmr_kcal":num,"bmi":num,"metabolic_age":num,"protein_pct":num,"subq_pct":num}},
 "workout":{"date":"YYYY-MM-DD","kind":"gym"|"football"|"run"|"swim"|"cycle"|"walk"|"other","label":str,"planCode":str|null,"minutes":num|null,"distance_km":num|null,"exercises":[{"name":str,"sets":[{"kg":num|null,"reps":num|null,"rpe":num|null}]}],"note":str|null},
 "recipe":{"name":str,"per100":{"kcal":num,"p":num,"c":num,"f":num},"servingG":num|null,"assumptions":[str]},
 "preset":{"name":str,"aliases":[str],"replaces":str|null,"servings":num,"items":[${ITEM}],"assumptions":[str]},
 "howmuch":{"date":"YYYY-MM-DD","food":{"name":str,"libId":str|null,"ref":str|null,"per":{"qty":num,"unit":"g"|"ml"|"serving","kcal":num,"p":num,"c":num,"f":num}|null},"aim":"close"|"protein"|"kcal","have":{"qty":num,"unit":"g"|"ml"|"serving"}|null},
 "supps":{"date":"YYYY-MM-DD","taken":[str]},
 "away":{"from":"YYYY-MM-DD"|null,"to":"YYYY-MM-DD"|null,"note":str|null,"back":bool},
 "answer":str}`;
export function todayBlock(ctx, td) {
  const d = ctx.days.find(x => x.date === td);
  return (d?.items || []).map(i => `${i.n} ${r1(i.q)} ${i.u}: ${Math.round(i.kcal)} kcal ${r1(i.p)} P`).join('; ') || 'nothing yet';
}
export async function parseMessage(env, ctx, raw, image, pending) {
  const T = targets(ctx), td = today(), tt = dayTotals(ctx.days.find(d => d.date === td));
  const ps = planState(ctx);
  const system = `You are the logging parser for Sam's health and fitness bot. Sam is in the UK; assume UK products, UK portion sizes and cooked weights unless he says raw. Today is ${dLong(td)} (${td}). Reply with ONLY one JSON object, no prose, in this shape (include "intent" and only the key for that intent):
${SCHEMA}
Rules:
- food: one item per food, even when he lists the ingredients of several things he made (two burgers = buns, patties, sauces, cheese as separate items). If an item clearly IS a LIBRARY entry (by name or an "also" name), set libId and qty in that entry's unit; the server recomputes macros. If it is the same food as a RECENT item (the same product, dish or restaurant item, or leftovers of it), set ref to that id and qty in THAT item's unit, scaling from what he says (e.g. "2 servings" of something logged as 25 g for one = 50 g); research false; the server rescales the numbers. Otherwise give your best per-item numbers for the amount eaten (kcal whole number, macros 1 decimal), estimated true, libId and ref null.
- Amounts: "1 from an 8 pack" = one of eight: use the typical UK pack (supermarket 8-pack beef burgers are usually 8 × 113 g quarter pounders; thin 8-packs 8 × 57 g) and say which in assumptions. Counted things ("4 slices of gherkin", "2 buns", "a chicken thigh") → unit serving with qty = the count, or grams if you convert, with the weight per piece in assumptions. Brands and restaurants (Nando's, Greggs, Tesco) use their published figures when you know them.
- research: true only for an item not in LIBRARY or RECENT whose numbers could easily be 20%+ off: home-cooked or family dishes, restaurant or takeaway items, branded products you don't know the panel for. Plain single ingredients (cheddar, gherkins, a banana) need none. "a full standard plate" of a main is roughly 350-450 g. Assumptions: short and specific (portion, which meat, oil). Use "ask" only for one question that would change the total by more than ~150 kcal.
- If a PENDING PROPOSAL is shown and the message corrects it ("it was beef", "make it 300 g", "add a yoghurt"), return the full corrected object of the same intent (food, preset or howmuch), keeping unchanged items.
- preset: when Sam defines a standard meal he'll repeat ("my standard overnight oats are 100 g oats, 40 g protein powder…", "save my usual shake as…", "preset: …"): name as he says it, items = the ingredients as listed, servings = how many portions that makes (default 1). If it updates an existing LIBRARY entry (e.g. "standard overnight oats" ≈ an oats entry), set replaces to its id. aliases: shorter names he might type ("oats", "my oats"). A preset is a fixed serving; a recipe is a dish weighed out per 100 g.
- recipe: when Sam gives a recipe to save ("save mum's chilli: ..."), work out per-100 g macros of the FINISHED dish. Raw ingredient totals divided by the cooked weight; estimate the cooked yield if not given (stews ~85-90% of raw weight, mash-topped bakes ~90%).
- howmuch: questions like "how much X should I eat to close the day / hit my protein / use my calories", including leftovers ("I've got leftover pork belly from yesterday, how much should I have?"). Point food at a LIBRARY id, a RECENT id (ref) for something he logged before or has leftovers of, or else give per (your estimate per 100 g, or per serving). aim: "protein" if he asks about protein, "kcal" if calories, else "close". have: how much he says he has, if he says. Do not do the maths; the server does it.
- weight: from text or a Fit Profile screenshot (dates in the app are US format MM/DD/YYYY). "Skeletal Muscle" as % → smm_pct; in kg → smm_kg. "Muscle Mass" is a different number (extra.muscle_kg).
- workout: "3x8 at 60" = three sets of 8 at 60 kg. Bodyweight sets: kg null. Reuse EXERCISE names when they match. A message starting "WORKOUT <code>" is a filled-in session from the plan: planCode = that code, kind gym, and parse each line's text after the colon into sets; skip lines with nothing after the colon. Runs/swims: kind run/swim with minutes or distance.
- supps: whenever Sam says he took supplements, add "supps" with the SUPPLEMENT ids he named ("took my vitamins" = all of them), alongside the main intent if the message also logs food etc. A message only about supplements has intent "supps"; "what have I taken?" is intent "supps" with taken [].
- away: going on holiday or away ("away until the 28th", "on holiday for a week" = to is today+6) → from/to dates, note like "Holiday". "I'm back" → back true.
- Messages are typed fast or come from voice notes: expect typos and odd spellings ("boineless" = boneless, "hines" = Heinz, "thge" = the) and spoken numbers.
- answer: for other questions or chat. Max 80 words, numbers first, British English, direct. Use CONTEXT only.
- Dates: "yesterday", weekday names etc. are relative to today. Default date is today.
LIBRARY (id | name | per qty unit | kcal P C F):
${libraryBlock(ctx)}
RECENT, logged in the last 7 days, newest first (id | day | name | qty unit | kcal P C F):
${recentBlock(ctx)}
EXERCISES: ${exerciseNames(ctx).join('; ') || 'none yet'}
SUPPLEMENTS (id = name): ${suppList(ctx).items.map(x => x.id + '=' + x.n).join(', ')}
PLAN SESSIONS: ${ctx.plan ? ctx.plan.sessions.map(s => s.code + '=' + s.name).join(', ') : 'none'}${ps ? ' (next: ' + ps.next.code + ')' : ''}
CONTEXT: targets ${T.ok ? T.kcal + ' kcal, ' + T.protein + ' g protein' : 'unknown'}; today so far ${tt && tt.kcal != null ? Math.round(tt.kcal) + ' kcal, ' + Math.round(tt.p) + ' g protein' : 'nothing logged'}; today's items: ${todayBlock(ctx, td)}.`;
  const content = [];
  if (image) content.push({ type: 'image', source: { type: 'base64', media_type: image.media_type, data: image.data } });
  let msg = raw || '(photo, no caption)';
  if (pending) msg = `PENDING PROPOSAL (not yet logged, intent ${pending.kind}): ${JSON.stringify(pending.payload)}\n\nMESSAGE: ${msg}`;
  content.push({ type: 'text', text: msg });
  const model = env.MODEL_FAST || 'claude-haiku-5-5', messages = [{ role: 'user', content }];
  let txt = await claude(env, { model, system, messages, max_tokens: 3000, budget: 25000 });
  let out = parseJSON(txt);
  if (!out || !out.intent) {   // one more go: a reply that isn't JSON is usually a one-off
    txt = await claude(env, { model, system, max_tokens: 3000, budget: 15000, messages: [...messages, { role: 'assistant', content: txt || '(empty)' }, { role: 'user', content: 'That was not a valid JSON object. Reply with ONLY the JSON object.' }] });
    out = parseJSON(txt);
  }
  if (!out || !out.intent) { const e = new Error('I couldn’t read that. Try rephrasing it'); e.detail = String(txt || '').slice(0, 300); throw e; }
  const box = out.intent === 'food' ? out.food : out.intent === 'preset' ? out.preset : null;
  if (box?.items?.some(i => i.research)) {
    await send(env, '🔎 Looking that up…');
    try {
      const better = await researchFood(env, ctx, raw, box, image);
      if (better?.items?.length) Object.assign(box, { items: better.items, assumptions: better.assumptions || box.assumptions, ask: better.ask ?? box.ask ?? null });
      else box.lookupFailed = 'no usable answer came back';
    } catch (e) { box.lookupFailed = String(e.message || e).replace(/^Claude API: /, ''); }
  }
  return out;
}
/* Web lookup for the items marked research. WHY the fallback model: Sonnet with web search is the heavy call
   (search results run to tens of thousands of input tokens), so it's the one that hits rate limits. Haiku has
   its own limits, so it's tried next; if both fail the caller keeps the first-pass estimates. */
export async function researchFood(env, ctx, raw, food, image) {
  const system = `You estimate nutrition for meals Sam (UK) has eaten, as accurately as the information allows. Use web search to find published nutrition panels for branded or restaurant items (one search can cover several items, e.g. a restaurant's nutrition PDF), and typical UK recipes for home-cooked dishes; work out per-100 g of the finished dish, then scale to his portion. Keep items not marked research exactly as they are, including libId and ref. Reply with ONLY JSON: {"items":[${ITEM}],"assumptions":[str],"ask":str|null}. Assumptions: short and specific (e.g. "lamb mince 20% fat", "350 g portion"). Ask at most one question, only if it would move the total by more than ~150 kcal.`;
  const content = [];
  if (image) content.push({ type: 'image', source: { type: 'base64', media_type: image.media_type, data: image.data } });
  content.push({ type: 'text', text: `What Sam wrote: """${raw}"""\nFirst-pass estimate: ${JSON.stringify(food)}\nImprove the items marked research.` });
  const tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3, user_location: { type: 'approximate', country: 'GB', timezone: TZ } }];
  const models = [env.MODEL_SMART || 'claude-sonnet-5-5', env.MODEL_FAST || 'claude-haiku-5-5'];
  const end = Date.now() + 32000; let err;
  for (const model of models) {
    const budget = end - Date.now(); if (budget < 8000) break;
    try {
      const out = parseJSON(await claude(env, { model, system, max_tokens: 3000, budget, messages: [{ role: 'user', content }], tools }));
      if (out?.items?.length) return out;
    } catch (e) { err = e; if (!(e.status === 429 || e.status === 529 || e.status >= 500)) break; }
  }
  if (err) throw err;
  return null;
}
