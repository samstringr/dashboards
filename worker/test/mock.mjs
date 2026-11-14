import http from 'http';
const calls = [];
const J = (res, o, s = 200) => { res.writeHead(s, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
let mid = 100;
const mockState = { turboFail: false };
const claudeReply = (body) => {
  const sys = typeof body.system === 'string' ? body.system : JSON.stringify(body.system);
  const last = body.messages[body.messages.length - 1];
  const parts = Array.isArray(last.content) ? last.content : [{ type: 'text', text: last.content }];
  const txt = parts.filter(p => p.type === 'text').map(p => p.text).join(' ');
  const hasImg = parts.some(p => p.type === 'image');
  let out;
  const td = (sys.match(/Today is [^(]*\((\d{4}-\d{2}-\d{2})\)/) || [])[1] || '2026-11-02';
  const recent = re => { const sec = sys.slice(Math.max(0, sys.indexOf('RECENT, logged'))); const l = sec.split('\n').find(x => / \| /.test(x) && re.test(x)); return l ? l.split(' | ')[0].trim() : null; };
  const first = (() => { const c = body.messages[0].content; return Array.isArray(c) ? c.filter(p => p.type === 'text').map(p => p.text).join(' ') : String(c); })();
  // 7 Nov 2026: Sam's burger message, with the web lookup rate-limited on both models
  if (/You estimate nutrition/.test(sys) && /brioche/i.test(txt)) return { __status: 429, body: { type: 'error', error: { type: 'rate_limit_error', message: 'This request would exceed the rate limit for your organization of 30,000 input tokens per minute.' } } };
  if (/That was not a valid JSON/.test(txt)) {
    if (/garbage/.test(first)) return { content: [{ type: 'text', text: 'Still not sure, sorry.' }], stop_reason: 'end_turn' };
    out = { intent: 'food', food: { date: td, items: [{ name: 'Tuna', qty: 102, unit: 'g', libId: 'tuna', estimated: false, research: false }] } };
    return { content: [{ type: 'text', text: JSON.stringify(out) }], stop_reason: 'end_turn' };
  }
  if (!/You estimate nutrition/.test(sys)) {
    if (/flaky|garbage/.test(txt)) return { content: [{ type: 'text', text: 'Sure! You had {some tuna} I think.' }], stop_reason: 'end_turn' };
    if (/brioche/i.test(txt)) out = { intent: 'food', food: { date: td, items: [
      { name: 'Brioche bun', qty: 2, unit: 'serving', ref: recent(/Brioche/), libId: null, estimated: true, research: false },
      { name: "Nando's Perinaise", qty: 50, unit: 'g', ref: recent(/Perinaise/), libId: null, estimated: true, research: false },
      { name: 'Gherkin slices', qty: 4, unit: 'serving', kcal: 4, p: 0.2, c: 0.8, f: 0, libId: null, ref: null, estimated: true, research: false },
      { name: 'Beef burger (1 of an 8-pack)', qty: 113, unit: 'g', kcal: 280, p: 18, c: 3, f: 22, libId: null, ref: null, estimated: true, research: true },
      { name: "Nando's boneless chicken thigh", qty: 1, unit: 'serving', kcal: 170, p: 24, c: 0, f: 8, libId: null, ref: null, estimated: true, research: true },
      { name: 'Cheddar', qty: 30, unit: 'g', libId: 'ched', ref: null, estimated: false, research: false }], assumptions: ['8 × 113 g quarter pounders'], ask: null } };
    else if (/overnight oats are/i.test(txt)) out = { intent: 'preset', preset: { name: 'standard overnight oats', aliases: ['my oats'], replaces: 'oats', servings: 1, items: [
      { name: 'Oats', qty: 100, unit: 'g', kcal: 375, p: 12, c: 60, f: 8, libId: null, ref: null, estimated: true, research: false },
      { name: 'Bulk chocolate protein powder', qty: 40, unit: 'g', libId: 'powder', ref: null, estimated: false, research: false },
      { name: 'Semi-skimmed milk', qty: 180, unit: 'ml', libId: 'milk', ref: null, estimated: false, research: false }], assumptions: [] } };
    else if (/standard overnight oats/i.test(txt)) out = { intent: 'food', food: { date: td, items: [{ name: 'Overnight oats', qty: 1, unit: 'serving', libId: 'oats', ref: null, estimated: false, research: false }] } };
    else if (/how much .* and (white )?rice/i.test(txt)) out = { intent: 'howmuch', howmuch: { date: td, foods: [{ name: 'pork belly', said: 'pork belly', libId: null, ref: recent(/pork belly/i), per: null, typical: 200 }, { name: 'white rice', said: 'rice', libId: 'rice', ref: null, per: null, typical: 150 }], aim: 'close', have: null } };
    else if (/protein shake plus/i.test(txt)) out = { intent: 'food', food: { date: td, items: [{ name: 'Overnight oats', qty: 1, unit: 'serving', libId: 'oats', ref: null, estimated: false, research: false }, { name: 'Protein powder', qty: 30, unit: 'g', libId: 'powder', ref: null, estimated: false, research: false }] } };
    else if (/how much/i.test(txt)) out = { intent: 'howmuch', howmuch: { date: td, food: { name: 'pork belly', libId: null, ref: recent(/pork belly/i), per: null }, aim: 'close', have: { qty: 300, unit: 'g' } } };
  }
  if (out) return { content: [{ type: 'text', text: JSON.stringify(out) }], stop_reason: 'end_turn' };
  if (/You estimate nutrition/.test(sys)) {
    const beef = /beef/i.test(txt);
    out = { items: [
      { name: beef ? "Shepherd's pie (beef, homemade)" : "Shepherd's pie (lamb, homemade)", qty: 380, unit: 'g', kcal: beef ? 440 : 470, p: 26, c: 46, f: beef ? 16 : 19, libId: null, estimated: true },
      { name: 'Green beans, boiled', qty: 80, unit: 'g', kcal: 28, p: 1.5, c: 6.3, f: 0.2, libId: null, estimated: true },
      { name: 'Gravy', qty: 50, unit: 'ml', kcal: 15, p: 0.2, c: 2.3, f: 0.6, libId: null, estimated: true }],
      assumptions: [beef ? 'beef mince 10% fat' : 'lamb mince 20% fat', '380 g portion'], ask: null };
    return { content: [{ type: 'text', text: 'Searching…' }, { type: 'server_tool_use', id: 'x', name: 'web_search', input: { query: 'shepherds pie' } }, { type: 'text', text: '```json\n' + JSON.stringify(out) + '\n```' }], stop_reason: 'end_turn' };
  }
  if (/took .*creatine/i.test(txt)) out = { intent: 'supps', supps: { taken: ['creatine', 'zinc'] } };
  else if (/holiday/i.test(txt)) out = { intent: 'away', away: { from: null, to: '2026-11-20', note: 'Holiday', back: false } };
  else if (parts.some(p => p.type === 'image' && /^\/9j\/4AkJ/.test(p.source?.data || ''))) out = { intent: 'photo', photo: { pose: null } };
  else if (hasImg) out = { intent: 'weight', weight: { date: '2026-11-02', weight_kg: 72.5, bf_pct: 16.9, smm_pct: 53.7, smm_kg: null, waist_cm: null, extra: { muscle_kg: 57.3, visceral: 7 } } };
  else if (/PENDING PROPOSAL/.test(txt) && /beef/i.test(txt)) out = { intent: 'food', food: { date: '2026-11-02', items: [{ name: "Shepherd's pie", qty: 380, unit: 'g', kcal: 450, p: 26, c: 46, f: 17, libId: null, estimated: true, research: true }, { name: 'Green beans', qty: 80, unit: 'g', kcal: 28, p: 1.5, c: 6.3, f: 0.2, libId: null, estimated: true, research: false }], assumptions: ['beef'] } };
  else if (/shepherd/i.test(txt)) out = { intent: 'food', food: { date: '2026-11-02', items: [{ name: "Shepherd's pie", qty: 400, unit: 'g', kcal: 480, p: 25, c: 48, f: 20, libId: null, estimated: true, research: true }, { name: 'Green beans', qty: 80, unit: 'g', kcal: 28, p: 1.5, c: 6.3, f: 0.2, libId: null, estimated: true, research: false }], assumptions: ['full plate'] } };
  else if (/tuna/i.test(txt)) out = { intent: 'food', food: { date: '2026-11-02', items: [{ name: 'Tuna', qty: 204, unit: 'g', kcal: 1, p: 1, c: 0, f: 0, libId: 'tuna', estimated: false, research: false }, { name: 'Heinz Light mayo', qty: 60, unit: 'g', kcal: 0, p: 0, c: 0, f: 0, libId: 'heinzlight', estimated: false, research: false }] } };
  else if (/^WORKOUT/m.test(txt)) out = { intent: 'workout', workout: { date: '2026-11-02', kind: 'gym', label: 'Ps · Push', planCode: 'Ps', exercises: [{ name: 'Flat DB press', sets: [{ kg: 30, reps: 12, rpe: 8 }, { kg: 30, reps: 10, rpe: 9 }] }, { name: 'Pec deck', sets: [{ kg: 45, reps: 13 }] }] } };
  else if (/kg/.test(txt) && /%/.test(txt)) out = { intent: 'weight', weight: { date: '2026-11-02', weight_kg: 72.4, bf_pct: 16.8 } };
  else if (/save/i.test(txt)) out = { intent: 'recipe', recipe: { name: "Mum's chilli", per100: { kcal: 128, p: 9.5, c: 9, f: 5.8 }, servingG: 400, assumptions: ['yield 90%'] } };
  else if (/ran/i.test(txt)) out = { intent: 'workout', workout: { date: '2026-11-02', kind: 'run', label: 'Easy run', minutes: 28, distance_km: 5, exercises: [] } };
  else out = { intent: 'answer', answer: 'You have 57 g of protein left.' };
  return { content: [{ type: 'text', text: JSON.stringify(out) }], stop_reason: 'end_turn' };
};
http.createServer((req, res) => {
  let b = ''; req.on('data', c => b += c); req.on('end', () => {
    const body = b ? (() => { try { return JSON.parse(b); } catch { return b; } })() : null;
    if (req.url === '/calls') return J(res, calls);
    if (req.url === '/reset') { calls.length = 0; mockState.turboFail = false; return J(res, { ok: true }); }
    if (req.url.startsWith('/v1/messages')) {
      calls.push({ api: 'claude', model: body.model, tools: !!body.tools, sys: String(typeof body.system === 'string' ? body.system : '').slice(0, 60) });
      const rep = claudeReply(body);
      if (rep.__status) { res.writeHead(rep.__status, { 'content-type': 'application/json', 'retry-after': '1' }); return res.end(JSON.stringify(rep.body)); }
      return J(res, rep);
    }
    if (req.url.startsWith('/ai/')) { calls.push({ api: 'ai', model: req.url.slice(4), body }); if (process.env.AI_FAIL || /large-v3-turbo/.test(req.url) && mockState.turboFail) return J(res, { error: 'bad audio' }, 400); return J(res, { text: ' 2 tins of tuna and 60g hines light mayo ', word_count: 9 }); }
    if (req.url === '/turbo-fail') { mockState.turboFail = true; return J(res, { ok: true }); }
    if (req.url.startsWith('/file/')) { res.writeHead(200, { 'content-type': 'image/jpeg' }); return res.end(Buffer.from(/phys/.test(req.url) ? [255, 216, 255, 224, 9, 9, 9, 9] : [255, 216, 255, 224, 1, 2, 3, 4])); }
    if (req.url.startsWith('/repos/')) { calls.push({ api: 'github', method: req.method, url: req.url, len: b.length }); return req.method === 'GET' ? J(res, { message: 'Not Found' }, 404) : J(res, { content: {} }, 201); }
    const m = req.url.match(/^\/bot[^/]+\/(\w+)/);
    if (m) {
      calls.push({ api: 'tg', method: m[1], body });
      if (m[1] === 'getFile') return J(res, { ok: true, result: { file_path: /^voice/.test(body.file_id) ? 'voice/file_2.oga' : /^phys/.test(body.file_id) ? 'photos/phys_1.jpg' : 'photos/file_1.jpg' } });
      if (m[1] === 'sendMessage') return J(res, { ok: true, result: { message_id: ++mid } });
      return J(res, { ok: true, result: true });
    }
    J(res, { error: 'unknown ' + req.url }, 404);
  });
}).listen(9999, () => console.log('mock on 9999'));
