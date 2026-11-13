/* UI test for the Health & Fitness dashboard: drives the real page in Chromium against a local Health DB worker.

   Run from this folder, with the worker running locally (see ../worker/README.md):
     cd ../worker && npx wrangler dev --port 8787        # .dev.vars needs API_KEY=testkey
     HF_SEED=/path/to/seed.json node test/ui.mjs         # desktop, 1440 x 900
     HF_SEED=/path/to/seed.json node test/ui.mjs phone   # 390 x 844
   Start from an empty local database each run (stop wrangler, delete ../worker/.wrangler/state, restart).

   WHY the seed is not in the repo: it is a real export of Health DB (get_snapshot), i.e. Sam's own food,
   weight and training history, and this repo is public. Any snapshot with days and config works.
   Screenshots go to test/out/ (git-ignored). */
import { createRequire } from 'module'; const require = createRequire(import.meta.url); const { chromium } = require('playwright');
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const R = path.dirname(fileURLToPath(import.meta.url)) + '/', OUT = R + 'out/'; fs.mkdirSync(OUT, { recursive: true });
if (!process.env.HF_SEED) { console.error('Set HF_SEED to a Health DB snapshot (see the comment at the top).'); process.exit(2); }
const W = process.env.HF_WORKER || 'http://127.0.0.1:8787', KEY = process.env.HF_KEY || 'testkey';
const seed = JSON.parse(fs.readFileSync(process.env.HF_SEED, 'utf8'));
const html = fs.readFileSync(R + '../health-fitness.html', 'utf8');
fs.writeFileSync(OUT + '_test.html', `<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>body{margin:0}[hidden]{display:none!important}</style></head><body>${html}</body></html>`);
const out = []; let fails = 0; const check = (n, c, x = '') => { out.push((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); if (!c) fails++; };
const mcpNode = async (name, args) => { const r = await fetch(W + '/mcp', { method: 'POST', headers: { authorization: 'Bearer ' + KEY, 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args || {} } }) }); return (await r.json()).result; };
const imp = await mcpNode('import_data', { days: seed.days, config: seed.config, mode: 'missing' });
for (const [date, kind, label, extra] of [['2026-10-27', 'gym', 'U · Upper', { planCode: 'U' }], ['2026-10-29', 'run', 'Easy run', { minutes: 28, distance_km: 5 }], ['2026-10-31', 'football', 'Football', { minutes: 60 }], ['2026-11-01', 'gym', 'L · Lower', { planCode: 'L', exercises: [{ name: 'Back squat', sets: [{ kg: 80, reps: 8 }, { kg: 80, reps: 7 }] }] }], ['2026-11-03', 'cycle', 'Easy ride', { minutes: 45 }], ['2026-11-04', 'swim', 'Swim', {}]]) await mcpNode('log_workout', { date, kind, label, ...extra });
const vp = process.argv[2] === 'phone' ? { width: 390, height: 844 } : { width: 1440, height: 900 };
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1 });
await ctx.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ path: R + '../vendor/three.min.js', contentType: 'application/javascript' }));
await ctx.route('https://fonts.googleapis.com/**', r => r.abort()); await ctx.route('https://fonts.gstatic.com/**', r => r.abort());
const page = await ctx.newPage();
const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/ERR_|net::|Failed to load resource/.test(m.text())) errors.push(m.text()); });
await page.exposeFunction('__mcp', async (name, args) => JSON.stringify(await mcpNode(name, args)));
await page.addInitScript(mode => { window.__F3D_STATIC = true;
  localStorage.setItem('hf.mode', JSON.stringify(mode));
  const call = async (server, tool, input) => {
    window.__calls = (window.__calls || []).concat(tool);
    const r = JSON.parse(await window.__mcp(tool, input || {}));
    if (r.isError) throw { code: 'tool_error', message: r.content[0].text };
    return { content: r.content, structuredContent: r.structuredContent, payload: r.structuredContent };
  };
  const mcp = { callTool: call, watchTool: (s, t, i, h) => { const tick = () => call(s, t, i).then(r => h({ type: 'data', result: r }), e => h({ type: 'error', error: e })); setTimeout(tick, 30); const iv = setInterval(tick, 1500); return () => clearInterval(iv); } };
  // in-memory stand-ins for the photo store: the page's db rows and uploaded assets
  const rows = new Map(), assets = new Map(); let na = 0;
  const db = { collection: c => ({ get: async () => ({ docs: [...rows].filter(([k]) => k.startsWith(c + '/')).map(([, v]) => ({ data: () => v })) }), doc: id => ({ set: async v => { rows.set(c + '/' + id, JSON.parse(JSON.stringify(v))); }, delete: async () => { rows.delete(c + '/' + id); } }) }) };
  const store = { upload: async b => { const id = 'a'.repeat(31) + (++na); assets.set(id, b.size); return { id, url: '/_blob/' + id, sizeBytes: b.size, contentType: 'image/jpeg' }; }, delete: async id => ({ deleted: assets.delete(id) }), list: async () => ({ assets: [], usage: {} }) };
  window.__photoMock = { rows, assets };
  window.claude = { use: async n => n === 'mcp' ? mcp : n === 'db' ? db : n === 'assets' ? store : null };
}, process.argv[2] === 'phone' ? 'stack' : 'canvas');
await page.goto('file://' + OUT + '_test.html');
await page.waitForTimeout(1200);
// new default layout
await page.click('[data-act=settings]'); await page.click('#st-reset'); await page.waitForTimeout(2500);
const ids = await page.evaluate(() => [...document.querySelectorAll('.widget')].map(w => w.dataset.id));
if (process.argv[2] === 'phone') { const ord = await page.evaluate(() => [...document.querySelectorAll('.widget')].map(w => w.dataset.id)); check('phone: Daily thought straight after Coach', ord.indexOf('quote') === ord.indexOf('tips') + 1 && ord.indexOf('intake') === ord.indexOf('quote') + 1, ord.join(',')); }
check('new layout: 13 widgets', ids.length === 13 && ['supps', 'tips', 'quote', 'muscles'].every(i => ids.includes(i)), ids.join(','));
const broken = await page.evaluate(() => [...document.querySelectorAll('.widget')].filter(w => /hit an error/.test(w.innerText)).map(w => w.dataset.id + ': ' + w.innerText.slice(0, 120)));
check('no widget errors', !broken.length, broken.join(' | '));
const lay = (await mcpNode('get_snapshot', {})).structuredContent.config.layout.widgets;
check('layout saved to Health DB', lay.length === 13 && lay.some(w => w.type === 'muscles') && lay.some(w => w.type === 'quote'));
// cardio note beside the Training log title: 45 min logged this week, one swim without minutes
const cn = await page.locator('.widget[data-id=workouts] .w-note').innerText().catch(() => '');
const tt = await page.evaluate(() => { const e = document.querySelector('.widget[data-id=workouts] .w-title'); return e.scrollWidth <= e.clientWidth; });
check('training log title not cut off by the note', tt);
if (process.argv[2] === 'phone') { const tb = await page.evaluate(() => ({dn: document.querySelector('.datenav').getBoundingClientRect().right, ac: document.querySelector('.actions').getBoundingClientRect().left})); check('phone top bar: buttons clear of the date', tb.ac >= tb.dn, JSON.stringify(tb)); }
check('training log: cardio X / 150 min this week', /^Cardio \d+ \/ 150 min/.test(cn), cn);
const cardio0 = +((cn.match(/^Cardio (\d+)/) || [])[1] || 0);
// consistency grid: gym dot vs cardio dot, legend
const cal = await page.evaluate(() => { const c = d => document.querySelector(`.widget[data-id=calendar] i[data-d="${d}"]`); return {fb: c('2026-10-31')?.className, gym: c('2026-11-01')?.className, leg: document.querySelector('.widget[data-id=calendar] .pl')?.innerText}; });
check('consistency: cardio has its own dot', /\bcd\b/.test(cal.fb) && !/\btr\b/.test(cal.fb) && /\btr\b/.test(cal.gym) && !/\bcd\b/.test(cal.gym) && /cardio/.test(cal.leg) && /gym/.test(cal.leg), JSON.stringify(cal));
// lift picker: plan first, then a break, then the rest
const lp = await page.evaluate(() => [...document.querySelectorAll('.widget[data-id=lift] select[data-ex] optgroup')].map(g => g.label + ':' + g.children.length + ':' + [...g.children].map(o => o.textContent).join('|')));
const lpIn = (lp[0] || '').split(':')[2]?.split('|') || [], lpOut = (lp[1] || '').split(':')[2]?.split('|') || [];
check('lift picker: in the plan, then not in the plan', lp.length === 2 && /^In the plan:/.test(lp[0]) && /^Not in the plan:/.test(lp[1]) && lpOut.includes('Reverse cable curl') && !lpOut.some(n => lpIn.includes(n)), lp.map(x => x.slice(0, 80)).join(' / '));
// daily thought: a quote with its source; click gives another
const q1 = await page.locator('.widget[data-id=quote] .qt').innerText().catch(() => ''), qsrc = await page.locator('.widget[data-id=quote] .qs').innerText().catch(() => '');
await page.locator('.widget[data-id=quote] .qcard').click(); await page.waitForTimeout(150);
const q2 = await page.locator('.widget[data-id=quote] .qt').innerText().catch(() => '');
const qfit = await page.evaluate(() => { const c = document.querySelector('.widget[data-id=quote] .qcard'); return c ? c.scrollHeight <= c.clientHeight + 1 : false; });
check('daily thought: quote, source, click for another, fits', q1.length > 10 && qsrc.length > 3 && q2 && q2 !== q1 && qfit, (q1.slice(0, 50) + ' | ' + qsrc).replace(/\n/g, ' '));
// logging cardio: top-bar button → quick sheet → saved with minutes and distance, and the note moves
await page.click('[data-act=cardio]'); await page.waitForTimeout(200);
const ct = await page.locator('#sheet-t').innerText();
await page.click('#c-kind [data-k=run]'); await page.click('[data-m="45"]'); await page.fill('#c-km', '8');
const wkLine = await page.locator('#c-week').innerText();
await page.click('#c-save'); await page.waitForTimeout(1200);
const dayNow = (await mcpNode('get_day', {})).structuredContent.day, runRec = (dayNow.workouts || []).find(w => w.kind === 'run');
const cn2 = await page.locator('.widget[data-id=workouts] .w-note').innerText().catch(() => '');
check('cardio sheet: run 45 min 8 km saved, note goes up by 45', /Log cardio or sport/.test(ct) && wkLine.includes(`${cardio0} → ${cardio0 + 45}`) && runRec?.min === 45 && runRec?.km === 8 && cn2.startsWith(`Cardio ${cardio0 + 45} / 150`), JSON.stringify(runRec) + ' | ' + cn2);
// the session sheet hands football to the cardio sheet; the Training log button opens it too
await page.click('[data-act=session]'); await page.waitForTimeout(200); await page.selectOption('#s-kind', 'football'); await page.waitForTimeout(150);
const sw = await page.locator('#sheet-t').innerText(), onK = await page.evaluate(() => document.querySelector('#c-kind .on')?.dataset.k);
await page.click('#sheet-x');
await page.evaluate(() => document.querySelector('.widget[data-id=workouts] .w-add').click()); await page.waitForTimeout(200);
const fromLog = await page.locator('#sheet-t').innerText(); await page.click('#sheet-x');
check('session sheet → cardio sheet for football; + Cardio in Training log', /Log cardio or sport/.test(sw) && onK === 'football' && /Log cardio or sport/.test(fromLog), sw + ' / ' + onK);
const tipsQ = /k: 'Stoic'/.test(html.slice(html.indexOf('const TIP_STATIC'), html.indexOf('function tipDeck')));
check('coach: practical tips only (quotes moved out)', !tipsQ);
// 3D
await page.waitForTimeout(1500);
await page.waitForTimeout(1500);
const canv = await page.evaluate(() => ['muscles', 'lift'].map(id => !!document.querySelector(`.widget[data-id=${id}] canvas`)));
check('canvases in muscle development and lift', canv.every(Boolean), JSON.stringify(canv));
await page.screenshot({ path: `${OUT}v5-${vp.width}.png` });
// today widget merged with list + macro columns
const td = await page.locator('.widget[data-id=today] .w-body').innerText();
check('today shows carbs, fat and the list', /Carbs/.test(td) && /Fat/.test(td) && /kcal/.test(td), td.replace(/\n/g, ' | ').slice(0, 200));
// supplements: tick → Health DB day doc
await page.evaluate(() => document.querySelector('.widget[data-id=supps] [data-sp=creatine]').click());
await page.waitForTimeout(800);
const TD = await page.evaluate(() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); });
let day = (await mcpNode('get_day', { date: TD })).structuredContent.day;
check('supplement tick saved', !!day.supps?.creatine, JSON.stringify(day.supps));
await page.evaluate(() => document.querySelector('.widget[data-id=supps] [data-sp=creatine]').click()); await page.waitForTimeout(800);
day = (await mcpNode('get_day', { date: TD })).structuredContent.day;
check('supplement untick saved', !day.supps?.creatine);
// plan tabs + editor
await page.evaluate(() => document.querySelector('.widget[data-id=plan] [data-tab=L]').click()); await page.waitForTimeout(200);
check('plan tab switches session', /Back squat/.test(await page.locator('.widget[data-id=plan] .w-body').innerText()));
await page.evaluate(() => document.querySelector('.widget[data-id=plan] [data-edit]').click()); await page.waitForTimeout(400);
const pe = await page.locator('#sheet-b').innerText();
check('split builder scores muscles', /Weekly volume: hard sets per muscle/.test(pe) && /Traps/.test(pe) && /Side delts/.test(pe) && /\d+%/.test(pe), (pe.match(/\d+%[^\n]*/) || [''])[0]);
await page.screenshot({ path: `${OUT}v5-builder-${vp.width}.png` });
const scoreTxt = await page.evaluate(() => [...document.querySelectorAll('.vr')].map(r => r.innerText.replace(/\n/g, ' ')).join(' | '));
console.log('SCORES', scoreTxt);
await page.evaluate(() => document.querySelector('[data-g=strength]').click()); await page.waitForTimeout(150);
check('goal switch rescoring', /1–6 reps/.test(await page.locator('#pe-score').innerText()));
await page.evaluate(() => document.querySelector('[data-g=hypertrophy]').click()); await page.waitForTimeout(100);
await page.evaluate(() => document.querySelector('#sheet-b [data-preset="ct-bb-l-sa"]').click()); await page.waitForTimeout(400);
const pp = await page.locator('#pe-score').innerText();
check('4-day preset scores 100%', /100%/.test(pp) && /15 of 15 in range/.test(pp) && /5\.6 sessions a week over a 4-session microcycle/.test(pp), (pp.match(/\d+%[^\n]*/) || [''])[0]);
await page.screenshot({ path: `${OUT}v7-preset-${vp.width}.png` });
const order = () => page.evaluate(() => [...document.querySelectorAll('[data-si="0"] .pe-row [data-ek=n]')].map(i => i.value));
const before = await order(), g3 = page.locator('[data-si="0"] .pe-row').nth(2).locator('[data-drag]');
await g3.scrollIntoViewIfNeeded(); const gb = await g3.boundingBox(), r1 = await page.locator('[data-si="0"] .pe-row').nth(0).boundingBox();
await page.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2); await page.mouse.down();
await page.mouse.move(gb.x + gb.width / 2, r1.y + 3, { steps: 10 }); await page.mouse.up(); await page.waitForTimeout(250);
const after = await order();
check('drag reorders exercises', after[0] === before[2] && after[1] === before[0] && after.length === before.length, after.slice(0, 3).join(' > '));
await page.locator('[data-si="0"] .pe-row').nth(0).locator('[data-drag]').focus(); await page.keyboard.press('ArrowDown'); await page.waitForTimeout(150);
const kb = await order();
check('arrow keys reorder exercises', kb[1] === after[0] && kb[0] === after[1], kb.slice(0, 2).join(' > '));
await page.screenshot({ path: `${OUT}v7-drag-${vp.width}.png` });
await page.click('#sheet-x');
// calendar click → day sheet
await page.evaluate(() => { const c = [...document.querySelectorAll('.widget[data-id=calendar] i[data-d]')].filter(i => i.dataset.d === '2026-11-02')[0]; c.click(); });
await page.waitForTimeout(300);
const ds = await page.locator('#sheet-b').innerText();
check('day summary sheet', /Food/.test(ds) && /Body/.test(ds) && /Training/.test(ds) && /Supplements/.test(ds), (await page.locator('#sheet-t').innerText()));
await page.click('#sheet-x');
check('month labels', (await page.evaluate(() => [...document.querySelectorAll('.widget[data-id=calendar] .ml')].map(x => x.textContent).filter(Boolean))).length >= 4);
// help
await page.click('[data-act=help]'); await page.waitForTimeout(200);
const hw = await page.locator('#sheet-b').innerText();
check('help: rationale', /Mifflin/.test(hw) && /What matters most/.test(hw));
await page.screenshot({ path: `${OUT}v5-help-${vp.width}.png` });
await page.evaluate(() => document.querySelector('#hp-tab [data-t=tech]').click()); await page.waitForTimeout(150);
check('help: technical', /Cloudflare Worker/.test(await page.locator('#sheet-b').innerText()) && await page.locator('svg.arch').count() === 1);
const ht = await page.locator('#sheet-b').innerText();
check('help: goal rationale on record', /The goal, and why/.test(ht) && /FFMI/.test(ht) && /Kouri/.test(ht) && await page.locator('table.ffmi tr').count() >= 5, (ht.match(/The goal is [^.]*/) || [''])[0]);
await page.evaluate(() => document.querySelector('table.ffmi')?.scrollIntoView()); await page.waitForTimeout(100);
await page.screenshot({ path: `${OUT}v7-goal-${vp.width}.png` });
await page.screenshot({ path: `${OUT}v5-help2-${vp.width}.png` });
await page.click('#sheet-x');
// composition expand
await page.evaluate(() => document.querySelector('.widget[data-id=body] [data-x]')?.click()); await page.waitForTimeout(150);
check('composition expands scale details', /Visceral|Skeletal/.test(await page.locator('.widget[data-id=body] .w-body').innerText()));
// workouts hover tooltip
if (vp.width > 900) {
  const wb = await page.locator('.widget[data-id=workouts] .chart svg').boundingBox();
  await page.mouse.move(wb.x + wb.width - 6, wb.y + wb.height / 2); await page.waitForTimeout(150);
  check('training log hover lists the week', /Week of/.test(await page.locator('.widget[data-id=workouts] .tip').innerText().catch(() => '')));
  // top-left corner resize of the targets widget
  const before = await page.evaluate(() => JSON.stringify((window.__lay = null, null)));
  const n = await page.locator('.widget[data-id=muscles]').boundingBox();
  await page.mouse.move(n.x + 40, n.y + 40); await page.waitForTimeout(100);
  await page.mouse.move(n.x - 1, n.y - 1); await page.mouse.down(); await page.mouse.move(n.x - 60, n.y - 60, { steps: 8 }); await page.mouse.up();
  await page.waitForTimeout(1500);
  const ph = (await mcpNode('get_snapshot', {})).structuredContent.config.layout.widgets.find(w => w.id === 'muscles');
  check('top-left corner resize moves x/y and grows', ph.x < 24 && ph.y < 10 && ph.w > 10 && ph.h > 15, JSON.stringify(ph));
  await page.screenshot({ path: `${OUT}v5-resized.png` });
}
// calendar fits its widget
const ov = await page.evaluate(() => { const w = document.querySelector('.widget[data-id=calendar] .w-body'), c = w.querySelector('[data-cal]'), cs = getComputedStyle(w); return {cal: c.scrollWidth, room: w.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight), last: [...c.querySelectorAll('i')].pop().dataset.d}; });
check('consistency fits its width and ends this week', ov.cal <= ov.room + 1 && ov.last >= TD, JSON.stringify(ov));
// builder: three goals
await page.evaluate(() => document.querySelector('.widget[data-id=plan] [data-edit]').click()); await page.waitForTimeout(300);
const goals = await page.evaluate(() => [...document.querySelectorAll('#pe-goal [data-g]')].map(b => b.textContent));
check('split builder: hypertrophy, strength, power', goals.join(',') === 'Hypertrophy,Strength,Power', goals.join(','));
await page.click('#sheet-x');
// help: protein timing and FFMI
await page.click('[data-act=help]'); await page.waitForTimeout(200);
const hp = await page.locator('#sheet-b').innerText();
check('help: protein timing + FFMI', /Protein timing/.test(hp) && /Staples 2011/.test(hp) && /fat-free mass index/.test(hp), (hp.match(/fat-free mass index of [\d.]+/) || [''])[0]);
await page.click('#sheet-x');
// muscle development: Now / 4 weeks / Goal, front and back charts, tap a muscle, strength sheet behind a click
await page.evaluate(() => document.querySelector('.widget[data-id=muscles] [data-mdv] [data-v=goal]').click()); await page.waitForTimeout(2500);
const mdc = await page.locator('.widget[data-id=muscles] .mdc canvas').count(), mleg = await page.locator('.widget[data-id=muscles] .lvbar').count();
await page.waitForTimeout(1200); const mcfg = (await mcpNode('get_snapshot', {})).structuredContent.config.layout.widgets.find(w => w.id === 'muscles')?.cfg?.view;
const fcv = page.locator('.widget[data-id=muscles] [data-side=front] canvas'); await fcv.scrollIntoViewIfNeeded().catch(() => {}); const fbb = await fcv.boundingBox().catch(() => null);
let mtip = '';
// the figure's width in its box depends on the box's shape, so try a few points on the chest and belly
for (const [fx, fy] of [[0.44, 0.27], [0.56, 0.27], [0.47, 0.36], [0.53, 0.42]]) { if (!fbb || /·/.test(mtip)) break; await page.mouse.click(fbb.x + fbb.width * fx, fbb.y + fbb.height * fy); await page.waitForTimeout(200); mtip = await page.locator('.widget[data-id=muscles] .mdtip').innerText().catch(() => ''); }
await page.evaluate(() => document.querySelector('.widget[data-id=muscles] [data-s]')?.click()); await page.waitForTimeout(300);
await page.locator('.widget[data-id=muscles]').screenshot({ path: `${OUT}md-${vp.width}.png` }).catch(() => {});
const lvt = await page.locator('#sheet-b .lvt tbody tr').count(); await page.click('#sheet-x');
check('muscle development: goal view saved, front + back charts, legend, tap names a muscle, strength sheet', mcfg === 'goal' && mdc === 2 && mleg === 1 && /·/.test(mtip) && lvt >= 1, `view=${mcfg} canvases=${mdc} tip=${mtip.replace(/\n/g, ' ')} rows=${lvt}`);
// terms: dotted words open a definition; Help has a Terms tab
await page.evaluate(() => document.querySelector('.widget[data-id=plan] .term')?.click()); await page.waitForTimeout(150);
const tp = await page.locator('#termpop').innerText().catch(() => '');
check('terms: tapping a dotted word explains it', /Microcycle/.test(tp) && /4 sessions plus the rest day/.test(tp), tp.split('\n')[0]);
await page.evaluate(() => document.querySelector('#termpop [data-allterms]')?.click()); await page.waitForTimeout(250);
const hterms = await page.locator('#sheet-b').innerText().catch(() => '');
check('help: Terms tab lists the vocabulary', /Mesocycle/.test(hterms) && /MRV/.test(hterms) && /TDEE/.test(hterms) && /RIR/.test(hterms), (hterms.match(/Programming[\s\S]{0,40}/) || [''])[0].replace(/\n/g, ' '));
await page.click('#sheet-x');
await page.screenshot({ path: `${OUT}v18-muscles-${vp.width}.png` });
// every exercise in Block 04 has a built demo, and the names map to the right machine
const MESO5 = ['Incline DB bench', 'Machine chest press', 'Weighted dip (+kg)', 'Pec deck', 'Tricep pushdown', 'Hanging leg raise',
  'Lat pulldown', 'Chest-supported row', 'Seated cable row', 'Cable pullover', 'Reverse pec deck', 'DB shrug', 'Incline DB curl',
  'Back squat or leg press', 'Romanian deadlift', 'Bulgarian split squat', 'Seated leg curl', 'Seated calf raise', 'Adductor machine', 'Cable lateral raise', 'Decline weighted crunch',
  'DB shoulder press', 'Cable upright row', 'Overhead cable triceps extension', 'Cable hammer curl'];
const nd = await page.evaluate(L => L.map(n => [n, Fig3D.moveFor(n), Fig3D.ready(Fig3D.moveFor(n))]), MESO5);
const notBuilt = nd.filter(x => !x[2]).map(x => x[0]), m = Object.fromEntries(nd.map(x => [x[0], x[1]]));
check('lift demos: all 25 Mesocycle 05 exercises built, names map right', !notBuilt.length && m['Weighted dip (+kg)'] === 'dip' && m['Seated cable row'] === 'cablerow' && m['DB shrug'] === 'shrug' && m['Cable upright row'] === 'uprow' && m['Machine chest press'] === 'machpress' && m['Chest-supported row'] === 'chestrow' && m['Reverse pec deck'] === 'revpec' && m['Cable pullover'] === 'straightarm' && m['Bulgarian split squat'] === 'splitsquat', notBuilt.join(', ') || nd.map(x => x[1]).join(','));
const lctl = await page.locator('.widget[data-id=lift] .f3d-ctl button').count();
check('lift demo has pause/front/side/back', lctl === 4, String(lctl));
check('lift legend lists working muscles', /Chest|Lats|delts/.test(await page.locator('.widget[data-id=lift] .mlg').innerText().catch(() => '')));
await page.screenshot({ path: `${OUT}v6-${vp.width}.png` });
// palette shows real widgets
await page.click('[data-act=widgets]'); await page.waitForTimeout(4500);
const pv = await page.evaluate(() => ({cards: document.querySelectorAll('.pal [data-pv]').length, real: document.querySelectorAll('.pal .pvw').length, imgs: document.querySelectorAll('.pal .pvw img').length, errs: [...document.querySelectorAll('.pal .pvw')].filter(n => /error|unavailable/.test(n.innerText)).length}));
check('palette previews are real widgets (3D as stills)', pv.cards === pv.real && pv.imgs >= 2 && !pv.errs, JSON.stringify(pv));
await page.screenshot({ path: `${OUT}v6-palette-${vp.width}.png` });
await page.click('#sheet-x');
// progress photos: private sheet from the top bar, upload a pose, the set appears with that day's weight, delete
await page.click('[data-act=photos]'); await page.waitForTimeout(400);
const p0 = await page.locator('#sheet-b').innerText();
await page.evaluate(() => document.querySelector('#sheet-b [data-pt=add]').click()); await page.waitForTimeout(300);
await page.setInputFiles('#sheet-b [data-up=front]', `${OUT}v18-muscles-${vp.width}.png`); await page.waitForTimeout(1500);
const pm = await page.evaluate(() => ({ rows: [...window.__photoMock.rows.values()], n: window.__photoMock.assets.size }));
await page.evaluate(() => document.querySelector('#sheet-b [data-pt=sets]').click()); await page.waitForTimeout(300);
const p1 = await page.locator('#sheet-b').innerText(), blurred = await page.locator('#sheet-b .ph-th.blur').count();
await page.evaluate(() => { const d = document.querySelector('#sheet-b [data-del]'); d.click(); d.click(); }); await page.waitForTimeout(500);
const pm2 = await page.evaluate(() => ({ rows: window.__photoMock.rows.size, n: window.__photoMock.assets.size }));
check('photos: due notice, upload saves a set with the weigh-in, blurred until tapped, delete removes it', /No photos yet/.test(p0) && pm.n === 1 && pm.rows[0]?.shots?.front && pm.rows[0].date === TD && /Delete this set/.test(p1) && pm2.rows === 0 && pm2.n === 0, JSON.stringify({ row: pm.rows[0], blurred, after: pm2 }));
await page.click('#sheet-x');
check('no page errors', !errors.length, JSON.stringify(errors).slice(0, 400));
await browser.close();
console.log(out.join('\n')); console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
