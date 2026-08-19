/* Focused check on the plan-change machinery: does the target line ACTUALLY
   step, and does the vertical rule ACTUALLY get painted?

   🚩 RUN TWICE, AND THE SECOND RUN IS THE ONE THAT MATTERS.

   Until 19 Aug 2026 this file only ran case A: the real CSV plus eight invented
   Block 02 days, so there was data either side of the change. It passed 8/8 for
   five days while the live site drew no rule at all, because the live log ends
   on 12 Aug and the change is on 14 Aug — the date was never on the axis, so
   the plugin returned early on every frame. The harness proved the drawing code
   and never the axis it draws on.

     A · data either side  — the step is visible, both eras scored
     B · REAL CSV, nothing logged after the change — the case that shipped broken

   Case B is why the x-axis is now a timeline (logged days ∪ plan changes ∪
   today) rather than a list of logged days. */
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("/home/claude/seed/repo/", import.meta.url));
const MIME = { ".html":"text/html", ".js":"text/javascript", ".css":"text/css",
               ".json":"application/json", ".csv":"text/csv", ".png":"image/png" };
const server = createServer(async (req,res)=>{
  try{ const p = join(ROOT, normalize(decodeURIComponent(req.url.split("?")[0])).replace(/^(\.\.[/\\])+/,""));
    const b = await readFile(p); res.writeHead(200,{ "Content-Type": MIME[extname(p)]||"application/octet-stream"}); res.end(b);
  }catch{ res.writeHead(404); res.end("nf"); }
});
await new Promise(r=>server.listen(0,r));
const base = `http://127.0.0.1:${server.address().port}`;

const REAL = await readFile(join(ROOT,"data/health-daily-log.csv"),"utf8");
const extra = [
 ["2026-08-14","Gym",73.0,2810,158,300,72],["2026-08-15","Rest","",2640,151,270,80],
 ["2026-08-16","Gym","",2905,166,318,74],["2026-08-18","Rest","",2712,157,286,69],
 ["2026-08-19","Football","",2880,161,305,78],["2026-08-20","Gym","",2755,159,292,71],
 ["2026-08-21","Rest","",2601,148,264,75],["2026-08-22","Gym","",2840,163,299,73]
].map(r=>[r[0],r[1],r[2],r[3],r[4],r[5],r[6],"","confirmed","steptest","synthetic"].join(","));
const SEEDED = REAL.trimEnd() + "\n" + extra.join("\n") + "\n";

const browser = await chromium.launch();
let f = 0, total = 0;
const ok = (l,c,d="")=>{ total++; console.log(`  ${c?"✓":"✗"} ${l}${d?"  — "+d:""}`); if(!c)f++; };

async function open(CSV) {
  const ctx = await browser.newContext({ viewport:{width:1440,height:900} });
  await ctx.route("**/api.github.com/**", r => r.fulfill({ status:200, contentType:"application/json",
    body: JSON.stringify({ content: Buffer.from(CSV,"utf8").toString("base64"), sha:"s" }) }));
  const page = await ctx.newPage();
  const errs=[]; page.on("pageerror",e=>errs.push(e.message));
  await page.addInitScript(()=>{ localStorage.setItem("gh-token","t");
    localStorage.setItem("diet7-repo", JSON.stringify({owner:"s",repo:"d",path:"data/health-daily-log.csv",branch:"main"})); });
  await page.goto(base+"/apps/diet/index.html",{waitUntil:"networkidle"});
  await page.waitForTimeout(600);
  return { page, ctx, errs };
}

/* The rule is canvas-drawn. Read the pixels: at the rule's x there should be a
   vertical run of near-ink pixels that does NOT exist a few px to the side.
   (Removing the plugin from config after construction is a no-op — inline
   plugins are captured at build time — which is why the first version of this
   check compared two identical screenshots and "passed" nothing.)
   The scan starts 40px below the top to clear the label chip, which is also
   ink-coloured and would otherwise register either side of the line. */
const probeRule = page => page.evaluate(() => {
  const c = Object.values(Chart.instances)[0];
  const dates = c.$planDates || [];
  const i = dates.indexOf("2026-08-14");
  if (i < 0) return { found:false, reason:"14 Aug has no slot on the axis", dates: dates.slice(-4) };
  const px = Math.round(c.scales.x.getPixelForValue(i));
  const dpr = window.devicePixelRatio || 1, ctx = c.ctx;
  const count = x => {
    const d = ctx.getImageData(Math.round(x*dpr), Math.round(c.chartArea.top*dpr)+40,
                               1, Math.round((c.chartArea.bottom-c.chartArea.top)*dpr)-48).data;
    let n=0; for (let k=0;k<d.length;k+=4) if (d[k]>0xd0 && d[k+1]>0xd0 && d[k+2]>0xc8) n++;
    return n;
  };
  return { found:true, i, last:dates.length-1, px,
           inside: px > c.chartArea.left+2 && px < c.chartArea.right-2,
           on:count(px), off:count(px-9) };
});

/* ── CASE A · data either side of the change ───────────────────────────── */
console.log("\n── A · data either side of 14 Aug ────────────────────────");
{
  const { page, ctx, errs } = await open(SEEDED);
  ok("no runtime errors", errs.length===0, errs[0]||"clean");
  const probe = await page.evaluate(()=>{
    const c = Object.values(Chart.instances)[0];
    return { tgt: c.data.datasets.filter(d=>d.label==="target").map(d=>({
               axis:d.yAxisID, stepped:d.stepped, dash:d.borderDash, uniq:[...new Set(d.data)] })),
             trends: c.data.datasets.filter(d=>d.label==="trend").length };
  });
  const kcalT = probe.tgt.find(t=>t.axis==="y2"), protT = probe.tgt.find(t=>t.axis==="y");
  ok("a dashed target line exists per series", probe.tgt.length===2 && probe.tgt.every(t=>t.dash?.length));
  ok("target lines are stepped, not interpolated", probe.tgt.every(t=>t.stepped==="before"));
  ok("the CALORIE target line actually steps", kcalT.uniq.length===2, "values: "+kcalT.uniq.join(" → "));
  ok("it steps 2,325 → 2,780", kcalT.uniq[0]===2325 && kcalT.uniq[1]===2780);
  ok("the PROTEIN line steps 150 → 155", protT.uniq.join(",")==="150,155", protT.uniq.join(" → "));
  ok("no trend lines survive", probe.trends===0);
  const stat = await page.locator("#stats").innerText();
  ok("both eras scored separately", /Block 01 band 2100–2550/.test(stat) && /Block 02 band 2600–2950/.test(stat),
     stat.replace(/\n/g," ").slice(0,110));
  const m = await probeRule(page);
  ok("14 Aug is on the axis", m.found, m.reason || ("index "+m.i+" of "+m.last));
  ok("the rule sits inside the plot, not on the frame", m.inside, "x="+m.px);
  ok("a bright vertical rule is painted at 14 Aug", m.on>10 && m.on>m.off*3,
     m.on+" ink pixels on the line vs "+m.off+" nine px away");
  await page.locator("#chartbox").screenshot({ path: ROOT+"tools/shot-step.png" });
  await ctx.close();
}

/* ── CASE B · the real log, which has NOTHING after the change ──────────── */
console.log("\n── B · REAL log · nothing logged after the change ────────");
{
  const { page, ctx, errs } = await open(REAL);
  ok("no runtime errors", errs.length===0, errs[0]||"clean");
  const last = await page.evaluate(()=>{
    const h = window.__diet.S.history.filter(r=>r.kcal!=null && r.protein_g!=null);
    return h[h.length-1].date;
  });
  ok("🚩 precondition: the last logged day is BEFORE the change", last < "2026-08-14", "last logged "+last);
  const m = await probeRule(page);
  ok("🚩 14 Aug still gets a slot on the axis", m.found, m.reason ? m.reason+" — tail "+(m.dates||[]).join(" ") : "index "+m.i+" of "+m.last);
  ok("it is NOT the last slot", m.found && m.i < m.last, m.found ? m.i+" of "+m.last : "n/a");
  ok("the rule sits inside the plot, not on the frame", m.inside, "x="+m.px);
  ok("🚩 a bright vertical rule is painted — THE CASE THAT SHIPPED BROKEN",
     m.on>10 && m.on>m.off*3, m.on+" ink pixels on the line vs "+m.off+" nine px away");
  await page.locator("#chartbox").screenshot({ path: ROOT+"tools/shot-step-real.png" });
  await ctx.close();
}

console.log(`\n${f?"✗ FAILED":"✓ PASSED"} — ${total-f}/${total}\n`);
await browser.close(); server.close(); process.exit(f?1:0);
