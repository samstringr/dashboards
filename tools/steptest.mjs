/* Focused check: does the target line ACTUALLY step, and does the marker draw,
   when there is real data either side of 14 Aug? The live CSV has one day after
   the change, so the feature is effectively untested by the main harness. */
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

/* Real CSV + eight invented Block 02 days so both sides of the step exist. */
let CSV = await readFile(join(ROOT,"data/health-daily-log.csv"),"utf8");
const extra = [
 ["2026-08-14","Gym",73.0,2810,158,300,72],["2026-08-15","Rest","",2640,151,270,80],
 ["2026-08-16","Gym","",2905,166,318,74],["2026-08-18","Rest","",2712,157,286,69],
 ["2026-08-19","Football","",2880,161,305,78],["2026-08-20","Gym","",2755,159,292,71],
 ["2026-08-21","Rest","",2601,148,264,75],["2026-08-22","Gym","",2840,163,299,73]
].map(r=>[r[0],r[1],r[2],r[3],r[4],r[5],r[6],"","confirmed","steptest","synthetic"].join(","));
CSV = CSV.trimEnd() + "\n" + extra.join("\n") + "\n";

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport:{width:1440,height:900} });
await ctx.route("**/api.github.com/**", r => r.fulfill({ status:200, contentType:"application/json",
  body: JSON.stringify({ content: Buffer.from(CSV,"utf8").toString("base64"), sha:"s" }) }));
const page = await ctx.newPage();
const errs=[]; page.on("pageerror",e=>errs.push(e.message));
await page.addInitScript(()=>{ localStorage.setItem("gh-token","t");
  localStorage.setItem("diet7-repo", JSON.stringify({owner:"s",repo:"d",path:"data/health-daily-log.csv",branch:"main"})); });
await page.goto(base+"/apps/diet/index.html",{waitUntil:"networkidle"});
await page.waitForTimeout(600);

let f=0; const ok=(l,c,d="")=>{ console.log(`  ${c?"✓":"✗"} ${l}${d?"  — "+d:""}`); if(!c)f++; };
ok("no runtime errors", errs.length===0, errs[0]||"clean");

const probe = await page.evaluate(()=>{
  const c = Object.values(Chart.instances)[0];
  const tgt = c.data.datasets.filter(d=>d.label==="target").map(d=>({
    axis:d.yAxisID, stepped:d.stepped, dash:d.borderDash, uniq:[...new Set(d.data)] }));
  return { tgt, planDates:(c.$planDates||[]).length, labels:c.data.labels.length };
});
const kcalT = probe.tgt.find(t=>t.axis==="y2"), protT = probe.tgt.find(t=>t.axis==="y");
ok("a dashed target line exists per series", probe.tgt.length===2 && probe.tgt.every(t=>t.dash?.length));
ok("target lines are stepped, not interpolated", probe.tgt.every(t=>t.stepped==="before"));
ok("the CALORIE target line actually steps",
   kcalT.uniq.length===2, "values on the line: " + kcalT.uniq.join(" → "));
ok("it steps 2,325 → 2,780", kcalT.uniq[0]===2325 && kcalT.uniq[1]===2780);
ok("the PROTEIN line steps 150 → 155", protT.uniq.join(",")==="150,155", protT.uniq.join(" → "));

const stat = await page.locator("#stats").innerText();
ok("both eras scored separately now", /Block 01 band 2100–2550/.test(stat) && /Block 02 band 2600–2950/.test(stat),
   stat.replace(/\n/g," ").slice(0,110));

/* The marker is canvas-drawn. Read the pixels: at the marker's x there should be
   a vertical run of the grey dash colour that does NOT exist a few px to the left.
   (Removing the plugin from config after construction is a no-op — inline plugins
   are captured at build time — which is why the first version of this check
   compared two identical screenshots and "passed" nothing.) */
const marker = await page.evaluate(() => {
  const c = Object.values(Chart.instances)[0];
  const dates = c.$planDates || [];
  const i = dates.findIndex(d => d >= "2026-08-14");
  if (i < 0) return { found: false, reason: "no logged day on or after the change" };
  const px = Math.round(c.scales.x.getPixelForValue(i));
  const dpr = window.devicePixelRatio || 1;
  const ctx = c.ctx;
  const count = (xCss) => {
    const d = ctx.getImageData(Math.round(xCss * dpr), Math.round(c.chartArea.top * dpr) + 4,
                               1, Math.round((c.chartArea.bottom - c.chartArea.top) * dpr) - 8).data;
    let n = 0;
    for (let k = 0; k < d.length; k += 4)
      if (Math.abs(d[k] - 0x8d) < 26 && Math.abs(d[k+1] - 0x8d) < 26 && Math.abs(d[k+2] - 0x97) < 26) n++;
    return n;
  };
  return { found: true, i, px, onMarker: count(px), offMarker: count(px - 9) };
});
ok("a logged day exists on or after the plan change", marker.found, marker.reason || ("index " + marker.i));
ok("a vertical dashed rule is painted at the change date",
   marker.onMarker > 10 && marker.onMarker > marker.offMarker * 3,
   marker.onMarker + " marker-coloured pixels on the line vs " + marker.offMarker + " nine px away");
await page.locator("#chartbox").screenshot({ path:"/home/claude/seed/repo/tools/shot-step.png" });
console.log(`\n${f?"✗ FAILED":"✓ PASSED"} — ${8-f}/8\n`);
await browser.close(); server.close(); process.exit(f?1:0);
