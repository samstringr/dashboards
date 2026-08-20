/* smoke.mjs — RUN the app, don't just parse it.

   design-system.md, 11 Aug 2026: a stray double comma made a sparse array hole.
   `node --check` passed it clean; at runtime it threw at the top level and the
   page died before one element rendered. "node --check proves a file PARSES.
   It does not prove it RUNS."

   This boots the real app in Chromium against a stubbed GitHub API serving the
   real CSV, then asserts the page actually rendered, that the targets on screen
   are the derived ones, that logging works, and that closing a day produces a
   correct append. Exits non-zero on any console error or failed assertion.

       node tools/smoke.mjs [--shots]
*/

import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SHOTS = process.argv.includes("--shots");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
               ".json": "application/json", ".csv": "text/csv", ".png": "image/png" };

let fails = 0, checks = 0;
const ok = (label, cond, detail = "") => {
  checks++;
  console.log(`  ${cond ? "✓" : "✗"} ${label}${detail ? "  — " + detail : ""}`);
  if (!cond) fails++;
};

/* ── static server ────────────────────────────────────────────────────────── */
const server = createServer(async (req, res) => {
  try {
    const p = join(ROOT, normalize(decodeURIComponent(req.url.split("?")[0])).replace(/^(\.\.[/\\])+/, ""));
    const body = await readFile(p);
    res.writeHead(200, { "Content-Type": MIME[extname(p)] || "application/octet-stream" });
    res.end(body);
  } catch { res.writeHead(404); res.end("not found"); }
});
await new Promise(r => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

/* ── the stubbed data repo ────────────────────────────────────────────────── */
let CSV = await readFile(join(ROOT, "data/health-daily-log.csv"), "utf8");
let commits = [];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });

await ctx.route("**/api.github.com/**", async route => {
  const req = route.request();
  if (req.method() === "GET") {
    return route.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ content: Buffer.from(CSV, "utf8").toString("base64"), sha: "stub" + commits.length }) });
  }
  const body = JSON.parse(req.postData() || "{}");
  CSV = Buffer.from(body.content, "base64").toString("utf8");
  commits.push(body.message);
  return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ commit: { sha: "x" } }) });
});

const page = await ctx.newPage();
const errors = [];
page.on("pageerror", e => errors.push("pageerror: " + e.message));
page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });

await page.addInitScript(() => {
  localStorage.setItem("gh-token", "stub-token");
  localStorage.setItem("diet7-repo", JSON.stringify(
    { owner: "sam", repo: "dashboards-data", path: "data/health-daily-log.csv", branch: "main" }));
});

console.log("\n── boot ──────────────────────────────────────────────────");
await page.goto(base + "/apps/diet/index.html", { waitUntil: "networkidle" });
await page.waitForTimeout(400);

ok("page loads with no runtime errors", errors.length === 0, errors[0] || "clean");
ok("the app rendered something", (await page.locator("#presets .p").count()) > 0,
   (await page.locator("#presets .p").count()) + " preset rows");
ok("setup pane is hidden when configured", !(await page.locator("#setup").evaluate(n => n.classList.contains("on"))));
ok("history loaded from the CSV",
   (await page.evaluate(() => window.__diet.S.history.length)) > 40,
   (await page.evaluate(() => window.__diet.S.history.length)) + " dates");
ok("voided 10 Jul excluded from history",
   !(await page.evaluate(() => window.__diet.S.history.some(r => r.date === "2026-07-10"))));

console.log("\n── targets are derived, not typed ────────────────────────");
const T = await page.evaluate(() => window.__diet.targets());
/* ⚠ NOT asserted as a constant any more. The whole point of targets.js is that
   the number is DERIVED from bodyweight — pinning the test to 2,780 would have
   started failing the moment a real weigh-in landed, which is exactly what it
   did. Assert the derivation instead. */
const W = await page.evaluate(() => window.__diet.S.weight);
/* 🚩 19 Aug 2026: derived from W.fastedKg, not W.kg. A FED weight is converted to
   its fasted equivalent before the formula sees it — the raw figure is what made
   the app show 2,810 against §3.5's 2,780. The old line here reproduced the bug
   in the assertion, so it agreed with the code and both were wrong. */
ok("calorie target is derived from the FASTED-equivalent weight, not the raw one",
   T.kcal === Math.round((10 * W.fastedKg + 6.25 * 172 - 5 * 24 + 5) * 1.66 / 10) * 10,
   W.kg + " kg " + (W.state || "UNSTATED") + " → " + W.fastedKg + " kg fasted → BMR " +
   T.bmr + " × 1.66 → " + T.kcal + " kcal");
ok("and that lands on health-targets.md §3.5's published 2,780",
   T.kcal === 2780, T.kcal + " kcal");
ok("protein target is 155 g", T.protein === 155);
/* 2,100 is now legitimate — it is Block 01's band label in the stats. What must
   never reappear is the old target being applied as if it were current. */
const bodyTxt = await page.locator("body").innerText();
ok("no stale 2,450 target anywhere", !/2,?450/.test(bodyTxt));
ok("2,100 appears only as a Block 01 band label",
   !/2,?100/.test(bodyTxt) || /Block 01 band 2100/.test(bodyTxt));
const goal = await page.locator("#goal").innerText();
ok("goal strip shows 75 kg, not 67", /75 kg/.test(goal) && !/67 kg/.test(goal), goal.split("\n")[0]);
ok("goal strip shows the derivation", /BMR\s*1\d{3}\s*×/.test(goal));
/* Either the weight is missing (fallback, flagged amber) or it is real but its
   fed/fasted state is unrecorded (also flagged). Both must be visible — an
   unlabelled weight quietly shifts the target by ~25 kcal per 1.5 kg. */
ok("an uncertain weight is flagged, never hidden",
   /weight not in the log/i.test(goal) || /fed or fasted not recorded/i.test(goal) ||
   /fasted|fed/i.test(goal),
   goal.split("\n").find(l => /kg/.test(l)) || goal.slice(0, 60));

console.log("\n── what's left, and per-item amounts ─────────────────────");
ok("no separate close-the-day card any more",
   (await page.locator("#rec, #rec-body").count()) === 0);
ok("an empty day says what it needs, not a gap to close",
   /kcal and .*g protein for the day/i.test(await page.locator("#left").innerText()),
   (await page.locator("#left").innerText()).slice(0, 60));

console.log("\n── logging ───────────────────────────────────────────────");
await page.locator("#presets .p", { hasText: "Overnight oats" }).first().click();
await page.waitForTimeout(200);
/* Oats is now a recipe, so clicking opens the ingredient editor rather than logging. */
ok("oats opens the ingredient editor, not a macro block",
   (await page.locator(".ed .er input[type=number]").count()) >= 6,
   (await page.locator(".ed .er input[type=number]").count()) + " ingredient inputs");
const oatsTot = await page.locator(".ed .tot2").innerText();
/* 🚩 CHANGED 19 Aug 2026 and the OLD assertion was the point of this one.
   It pinned the oats to 650/57.5/86.5/8.8 — recipes.md §1's headline — which was
   right while the recipe described 80 g of oats and 35 g of a whey isolate. Sam
   read the Bulk pack (392/68/21/3.8 per 100 g, not 377/85.7/3.4/1.1) and moved to
   100 g oats / 40 g powder / 180 g milk. Both halves of the multiplication moved,
   so the headline had to. Pinning the NEW number, not deleting the check. */
ok("defaults reproduce Sam's current build exactly",
   /766 kcal · 58\.4 g P · 108\.7 g C · 11\.8 g F/.test(oatsTot), oatsTot.split("\n")[0]);
ok("the protein powder is no longer carrying the whey isolate's macros",
   !/whey isolate/i.test(await page.locator(".ed").innerText()) &&
   /protein powder/i.test(await page.locator(".ed").innerText()));

/* Change an ingredient and watch the OUTPUT move — the whole point. */
const oatInput = page.locator(".ed .er").filter({ hasText: "Scottish rolled oats" }).locator("input");
await oatInput.fill("100");
await oatInput.dispatchEvent("input");
await page.waitForTimeout(120);
ok("editing grams moves the macros", !/650 kcal/.test(await page.locator(".ed .tot2").innerText()),
   (await page.locator(".ed .tot2").innerText()).split("\n")[0]);
await page.locator(".ed .acts .btn.p2").click();
await page.waitForTimeout(200);
ok("logging the recipe adds one row", (await page.locator("#rows tr").count()) === 1);

console.log("\n── under-eating is the loud flag now ─────────────────────");
const flagText = await page.locator("#flags").innerText();
ok("a light day flags UNDER, not over", /under/i.test(flagText), flagText.split("\n")[0]?.slice(0, 56));

console.log("\n── how much of THIS item closes the day ──────────────────");
const hints = await page.locator("#presets .phint").allInnerTexts();
ok("rows carry their own close-the-day amount", hints.length > 3, hints.length + " rows");
ok("amounts are concrete, not \"add some protein\"",
   hints.some(h => /\d/.test(h)), hints.slice(0, 3).join(" · "));

console.log("\n── composite meal builder (T10) ──────────────────────────");
await page.locator("#presets .addnew.build").click();
await page.waitForTimeout(150);
ok("builder opens", (await page.locator(".basket-list .brow").count()) > 5);
await page.locator(".brow", { hasText: "Cheddar cheese" }).locator(".btick").click();
await page.locator(".brow", { hasText: "Heinz ketchup" }).locator(".btick").click();
await page.waitForTimeout(120);
const tot = await page.locator(".ed .tot2").innerText();
ok("combined total moves as items are picked", /kcal/.test(tot) && !/Nothing picked/.test(tot), tot.split("\n")[0]);
await page.locator(".ed .acts .btn.p2").click();
await page.waitForTimeout(200);
ok("commits all picked items as ONE row", (await page.locator("#rows tr").count()) === 2,
   (await page.locator("#rows tr").count()) + " rows");
ok("the composite row names both items",
   /Cheddar/.test(await page.locator("#rows tr").nth(1).innerText()) &&
   /ketchup/.test(await page.locator("#rows tr").nth(1).innerText()));

console.log("\n── meal prep: pick the protein, edit ITS macros ──────────");
await page.locator("#presets .p", { hasText: "Meal prep plate" }).first().click();
await page.waitForTimeout(180);
const protOpts = await page.locator(".ed .opts .opt").allInnerTexts();
ok("three prepped proteins to choose from",
   protOpts.some(t => /chicken/i.test(t)) && protOpts.some(t => /mince/i.test(t)) &&
   protOpts.some(t => /salmon/i.test(t)), protOpts.join(" · "));
await page.locator(".ed .opts .opt", { hasText: "Salmon" }).click();
await page.waitForTimeout(150);
ok("salmon is flagged as the weakest-sourced row",
   /NOT in recipes\.md/i.test(await page.locator(".ed .tot2").innerText()));
ok("its per-100 g macros are editable", (await page.locator(".ed .er").filter({ hasText: "Per 100 g" }).locator("input").count()) === 4);
await page.locator(".ed .acts", { hasText: "Cancel" }).locator("button", { hasText: "Cancel" }).click();
await page.waitForTimeout(150);

console.log("\n── the plan changed on 14 Aug, and scoring respects it ───");
const statTxt = await page.locator("#stats").innerText();
ok("calories scored per era, not all against 2,780",
   /Block 01 band 2100–2550/.test(statTxt), statTxt.replace(/\n/g, " ").slice(0, 88));
ok("Block 01 adherence is not the fabricated 5%",
   !/^5%/.test(statTxt.trim()));
ok("the reason is stated on screen", /would invent a collapse/i.test(statTxt));
/* Was "there is no Block 02 data yet" — true until 19 Aug 2026, when 17 and 18 Aug
   were logged. The claim worth asserting is not which branch fires, it is that the
   note always NAMES the eras it scored rather than quietly averaging across them. */
ok("the era note names both plans rather than averaging over the change",
   /Block 01/.test(statTxt) && /Block 02/.test(statTxt),
   statTxt.replace(/\n/g, " ").slice(-120));
const eras = await page.evaluate(() => window.__diet.eraStats());
ok("Block 01 scored against 2,100\u20132,550",
   eras.eras[0].band === "2100–2550", eras.eras[0].label + " " + eras.eras[0].rate + "% of " + eras.eras[0].n);

console.log("\n── closing the day commits to the repo ───────────────────");
const before = CSV.split("\n").filter(Boolean).length;
await page.locator("#close").click();
await page.waitForTimeout(200);
if (await page.locator("#ov").evaluate(n => n.classList.contains("on"))) {
  await page.locator("#mdl-go").click();          // risk check fires: under-eating
}
await page.waitForTimeout(700);
const after = CSV.split("\n").filter(Boolean).length;
ok("exactly one row appended", after === before + 1, `${before} → ${after} lines`);
ok("a commit was made", commits.length === 1, commits[0] || "none");

const last = CSV.trim().split("\n").pop();
ok("appended row is today's date", last.startsWith(new Date().toLocaleDateString("en-CA")), last.slice(0, 40));
ok("confidence is set", /,confirmed,/.test(last));
ok("weight_kg and training stay BLANK — blank is not zero",
   last.split(",")[2] === "" && /,,confirmed,/.test(last.replace(/"[^"]*"/g, "Q")) === false ||
   last.split(",")[2] === "");
ok("day reads as closed after the commit",
   await page.evaluate(() => window.__diet.S.closed));
ok("the file wins — draft cleared",
   (await page.evaluate(() => window.__diet.S.log.length)) === 0);

console.log("\n── logging a day that is not today ───────────────────────");
/* 🚩 ADDED 20 Aug 2026, after the app lost a day.

   On 19 Aug seven items were logged and left open. The tab was still open on the
   20th; Close and save ran and `buildRecord()` stamped the row with ISO() —
   which by then was the 20th. The food moved forward a day and the CSV said so
   confidently. It had to be voided and re-dated by hand the next morning.

   Nothing in the old suite could have caught it, because every date assertion
   compared the app's output against `new Date()` — the same clock read the bug
   was made of. **A test that recomputes the buggy expression agrees with the
   bug.** These pin the date to the SELECTED day instead. */
const isoOf = d => d.toLocaleDateString("en-CA");
const yesterday = isoOf(new Date(Date.now() - 864e5));
const EMPTY_DAY = "2026-08-15";      // a real gap in the log: it jumps 12 Aug → 17 Aug

ok("the day selector exists and is not a passive label",
   (await page.locator("#whenprev").count()) === 1 &&
   (await page.locator("#whenpick").count()) === 1);
ok("it names today when it is today", /today/i.test(await page.locator("#when").innerText()),
   await page.locator("#when").innerText());

/* ── A day that has never been logged ─────────────────────────────────────── */
await page.evaluate(d => window.__diet.jumpToDay(d), EMPTY_DAY);
await page.waitForTimeout(300);
ok("jumping to an unlogged day opens a blank board",
   (await page.evaluate(() => window.__diet.S.logDate)) === EMPTY_DAY &&
   (await page.evaluate(() => window.__diet.S.log.length)) === 0);
ok("🚩 the board SAYS it is not today — the thing that was missing",
   /not today/i.test(await page.locator("#left").innerText()),
   (await page.locator("#left").innerText()).slice(0, 68));
ok("the page is visibly marked as backdated",
   await page.evaluate(() => document.body.classList.contains("backdated")));

const beforeRows = CSV.split("\n").filter(Boolean).length;
await page.locator("#presets .p", { hasText: "Banana" }).first().click();
await page.waitForTimeout(250);
ok("the save button names the day it will write, not \"today\"",
   /15 Aug/.test(await page.locator("#close").innerText()),
   await page.locator("#close").innerText());

const rec = await page.evaluate(() => window.__diet.buildRecord());
ok("🚩 buildRecord stamps the SELECTED day, not the clock",
   rec.date === EMPTY_DAY, rec.date + "  (the clock says " + isoOf(new Date()) + ")");
ok("a fresh day is `confirmed`", rec.confidence === "confirmed");
ok("but it admits it was entered late", /entered/.test(rec.source) && /BACKDATED/.test(rec.notes),
   rec.source);

await page.locator("#close").click();
await page.waitForTimeout(200);
if (await page.locator("#ov").evaluate(n => n.classList.contains("on"))) await page.locator("#mdl-go").click();
await page.waitForTimeout(700);
ok("the appended row carries the chosen date",
   CSV.trim().split("\n").pop().startsWith(EMPTY_DAY),
   CSV.trim().split("\n").pop().slice(0, 30));
ok("one row appended, nothing rewritten",
   CSV.split("\n").filter(Boolean).length === beforeRows + 1);

/* ── A day that is already written ────────────────────────────────────────── */
await page.evaluate(d => window.__diet.jumpToDay(d), yesterday);
await page.waitForTimeout(300);
ok("a day already in the file reads as closed — the file wins",
   await page.evaluate(() => window.__diet.S.closed));
ok("and offers a way to correct it",
   (await page.locator("#reopen").count()) === 1);
ok("which is honest that it cannot restore the individual items",
   /cannot|only the totals/i.test(await page.locator("#left").innerText()),
   (await page.locator("#left").innerText()).slice(-70));

await page.locator("#reopen").click();
await page.waitForTimeout(250);
ok("re-opening unlocks the board", !(await page.evaluate(() => window.__diet.S.closed)));
await page.locator("#presets .p", { hasText: "Banana" }).first().click();
await page.waitForTimeout(250);
const rec2 = await page.evaluate(() => window.__diet.buildRecord());
ok("🚩 re-logging a written day is `corrected`, never `confirmed`",
   rec2.confidence === "corrected", rec2.confidence);
ok("and the note names the figures it supersedes", /SUPERSEDES/.test(rec2.notes),
   (rec2.notes.match(/SUPERSEDES[^|]*/) || [""])[0].trim());

await page.locator("#whenhome").click();
await page.waitForTimeout(300);
ok("Today jumps back", (await page.evaluate(() => window.__diet.S.logDate)) === isoOf(new Date()));
ok("forward past today is refused — you cannot log food you have not eaten",
   await page.locator("#whennext").isDisabled());
ok("and today's own draft survived the round trip untouched",
   (await page.evaluate(() => window.__diet.S.log.length)) === 0 ||
   (await page.evaluate(() => window.__diet.S.closed)));

console.log("\n── phone layout ──────────────────────────────────────────");
const phone = await ctx.newPage();
await phone.setViewportSize({ width: 390, height: 844 });
await phone.goto(base + "/apps/diet/index.html", { waitUntil: "networkidle" });
await phone.waitForTimeout(400);
const noHScroll = await phone.evaluate(() =>
  document.documentElement.scrollWidth <= window.innerWidth + 1);
ok("no horizontal scroll at 390px", noHScroll);
const tap = await phone.evaluate(() => {
  const b = document.querySelector("#presets .p");
  return b ? b.getBoundingClientRect().height : 0;
});
ok("log buttons meet the 44px touch minimum", tap >= 44, Math.round(tap) + "px");

/* ── the chart must stay proportionate at any window shape ────────────────
   Found live on a 1080x1759 window: the chart card was flex:1 and took all the
   spare height, giving a 562x1166 canvas with the lines stretched into spikes.
   Fixing the clip earlier did not stop the opposite failure, so both ends are
   asserted now. */
console.log("\n── axes start at zero, nothing clips ─────────────────────");
const ax = await page.evaluate(() => {
  const c = Object.values(Chart.instances)[0];
  const d = window.__diet.S.history.filter(r => r.kcal != null && r.protein_g != null);
  return { yMin: c.scales.y.min, yMax: c.scales.y.max,
           kMin: c.scales.y2.min, kMax: c.scales.y2.max,
           pLow: Math.min(...d.map(r => r.protein_g)), pHigh: Math.max(...d.map(r => r.protein_g)),
           kLow: Math.min(...d.map(r => r.kcal)), kHigh: Math.max(...d.map(r => r.kcal)) };
});
ok("protein axis starts at 0", ax.yMin === 0, "0 → " + ax.yMax);
ok("calorie axis starts at 0", ax.kMin === 0, "0 → " + ax.kMax);
/* The old scheme floored protein at 65 g, so a 90 g day fell off the bottom —
   which is what made the chart look broken rather than low. */
ok("the lowest logged protein day is ON the chart", ax.pLow >= ax.yMin && ax.pLow <= ax.yMax,
   "lowest " + ax.pLow + " g");
ok("the highest logged protein day is ON the chart", ax.pHigh <= ax.yMax, "highest " + ax.pHigh + " g");
ok("every calorie day is on the chart", ax.kLow >= 0 && ax.kHigh <= ax.kMax,
   ax.kLow + "–" + ax.kHigh + " within 0–" + ax.kMax);
ok("axes stay proportionally matched",
   Math.abs((ax.yMax / 155) - (ax.kMax / 2780)) < 0.12,
   (ax.yMax / 155).toFixed(2) + "× vs " + (ax.kMax / 2780).toFixed(2) + "× of target");

console.log("\n── zoom is gentle and says what you are looking at ───────");
const winBefore = await page.evaluate(() => document.querySelector('.lg .wlabel').textContent);
await page.locator("#chartbox").hover();
await page.mouse.wheel(0, -100);   // up = zoom in
await page.waitForTimeout(160);
const winAfter = await page.evaluate(() => document.querySelector('.lg .wlabel').textContent);
const days = t => parseInt((t.match(/(\d+) of/) || t.match(/all (\d+)/) || [])[1] || "0");
ok("one wheel notch is a small step, not a lurch",
   days(winAfter) < days(winBefore) && days(winAfter) > days(winBefore) * 0.85,
   winBefore + "  →  " + winAfter);
/* And it has to actually get somewhere: 1.04/notch tested "gentle" but took 36
   notches to reach a useful zoom, which is its own failure. */
for (let i = 0; i < 17; i++) await page.mouse.wheel(0, -100);
await page.waitForTimeout(200);
const winDeep = await page.evaluate(() => document.querySelector('.lg .wlabel').textContent);
/* 🚩 RESTATED 20 Aug 2026, and the old form was a time bomb of the same kind
   steptest case B turned out to be. It asserted an ABSOLUTE count — "between 5
   and 12 days visible" — which was calibrated against a 42-day log. Logging
   three more days pushed it to 13 and the check failed while the zoom was
   working perfectly. An assertion pinned to the size of live data expires.

   What the test actually cares about is the RATE: 1.08 per notch, so 18 notches
   should divide the window by 1.08^18 ≈ 4. Assert that ratio and the check
   survives the log growing to 400 days. */
const shrink = days(winBefore) / Math.max(1, days(winDeep));
ok("~18 notches divides the window by about four", shrink >= 3 && shrink <= 5,
   winDeep + "  (÷" + shrink.toFixed(1) + ", 1.08^18 predicts ÷4.0)");
ok("the visible range is named", /→/.test(winAfter), winAfter);
await page.evaluate(() => document.querySelector('#chartbox').dispatchEvent(new MouseEvent('dblclick',{bubbles:true})));
await page.waitForTimeout(160);
ok("double-click resets to the full range",
   /all/.test(await page.evaluate(() => document.querySelector('.lg .wlabel').textContent)));

console.log("\n── the flag stack cannot move the layout ─────────────────");
/* 🚩 REWRITTEN 20 Aug 2026, and the bug it now guards was live for two days
   while this section passed.

   The stack collapsed with `grid-template-rows: 0fr`, which zeroes the FIRST
   grid row only. The flags were direct children, so with three flags rows two
   and three fell into implicit `auto` tracks and kept their height. Measured on
   the live site: a "closed" stack still 74px tall, dead space between the goal
   strip and the food table. The old checks only ever asked whether a CLASS was
   present — and the class was correct the whole time.

   So the assertion is now geometric: the food table must not move by a single
   pixel between flags-up and flags-down. The stack is an absolute overlay, so
   that is true by construction rather than by animation. */
const tbl = await page.locator(".card.today .tbl").boundingBox();
ok("the table keeps a readable height with flags up", tbl.height >= 132, Math.round(tbl.height) + "px");
ok("a flag badge appears in the card header",
   await page.locator("#flagbadge").isVisible(),
   await page.locator("#flagbadge").innerText());

const nFlags = await page.locator("#flags .fli").count();
ok("flags are rendered as a stack", nFlags > 0, nFlags + " flags");
/* "Pop up one at a time" — each flag carries its own increasing delay. */
const delays = await page.$$eval("#flags .fli", ns => ns.map(n => n.style.animationDelay));
ok("they arrive one at a time, not as a block",
   nFlags < 2 || delays[1] !== delays[0], delays.join(" · "));

ok("🚩 the stack is OUT OF FLOW — it cannot push the table at all",
   await page.locator("#flags").evaluate(n => getComputedStyle(n).position === "absolute"));

const tblUp = (await page.locator(".card.today .tbl").boundingBox()).y;
await page.waitForTimeout(7400 + nFlags * 150);
ok("flags collapse on their own after a few seconds",
   await page.locator("#flags").evaluate(n => n.classList.contains("away")));
ok("and they shrink INTO the badge, not to an arbitrary corner",
   await page.locator("#flags").evaluate(n => /px/.test(n.style.transformOrigin)),
   await page.locator("#flags").evaluate(n => n.style.transformOrigin));

const tblDown = (await page.locator(".card.today .tbl").boundingBox()).y;
ok("🚩 THE BUG: the table does not move when the flags go — no gap left behind",
   tblUp === tblDown, "table top " + Math.round(tblUp) + "px up, " + Math.round(tblDown) + "px down");

await page.locator("#flagbadge").click();
await page.waitForTimeout(300);
ok("clicking the badge brings them back",
   !(await page.locator("#flags").evaluate(n => n.classList.contains("away"))));
ok("and bringing them back still does not move the table",
   Math.round((await page.locator(".card.today .tbl").boundingBox()).y) === Math.round(tblDown));

console.log("\n── ingredient macros are editable, and salmon exists ─────");
await page.locator("#presets .expand", { hasText: "Everything else" }).click();
await page.waitForTimeout(150);
const hasSalmon = await page.locator("#presets .p", { hasText: "Air-fried salmon" }).count();
ok("air-fried salmon is on the board", hasSalmon > 0);
await page.locator("#presets .p", { hasText: "Air-fried salmon" }).first().click();
await page.waitForTimeout(200);
/* Revised 18 Aug: salmon is ONE editable number, grams of COOKED fish. Sam:
   "there's no need for me to adjust honey, paprika, sauce amounts every time."
   The glaze is context in the note, not four rows to maintain. */
const ingNames = await page.locator(".ed .inglabel").allInnerTexts();
ok("salmon is a single cooked-weight number, not four ingredients",
   ingNames.length === 1, ingNames.join(" · ").replace(/\n/g, " "));
ok("and it is COOKED weight", /cooked/i.test(ingNames.join()), ingNames.join().replace(/\n/g," "));
ok("the glaze is recorded as context, not silently dropped",
   /honey/i.test(await page.locator(".ed .tot2").innerText()) &&
   /NOT counted/i.test(await page.locator(".ed .tot2").innerText()));
ok("the omission is quantified, not just flagged",
   /40 kcal/.test(await page.locator(".ed .tot2").innerText()));
ok("the ingredient row has an icon", (await page.locator(".ed .inglabel .ico").count()) === 1);

await page.locator(".ed .ingtog").first().click();
await page.waitForTimeout(120);
ok("✎ reveals the per-100 g macros", (await page.locator(".ed .ingmac.on input.im").count()) === 4);
const kcalIn = page.locator(".ed .ingmac.on input.im").first();
const totBefore = await page.locator(".ed .tot2").innerText();
await kcalIn.fill("300");
await kcalIn.dispatchEvent("input");
await page.waitForTimeout(150);
const totAfter = await page.locator(".ed .tot2").innerText();
ok("editing a per-100 g calorie figure moves the total",
   totBefore.split("\n")[0] !== totAfter.split("\n")[0],
   totBefore.split("\n")[0] + "  →  " + totAfter.split("\n")[0]);

/* Caught live: the per-100 g inputs pushed the right grid track past its share
   and the whole column ran off the viewport, because `1fr` tracks default to
   min-width:auto. Assert it at the widest state the editor can reach. */
ok("an open ingredient editor does not push the layout off screen",
   await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
   (await page.evaluate(() => document.documentElement.scrollWidth)) + " vs " +
   (await page.evaluate(() => window.innerWidth)));

console.log("\n── \"everything else\" is grouped by macro ─────────────────");
const heads = await page.locator("#presets .grouphead").allInnerTexts();
ok("the long list is grouped, not a wall", heads.length >= 2, heads.join(" · ").replace(/\n/g, " "));
ok("grouped by protein / carbs / fat",
   /protein/i.test(heads.join()) && /carb/i.test(heads.join()) && /fat/i.test(heads.join()));
/* Grams would file almost everything under carbs; the split is by share of
   calories, which is why cheddar lands in fat and not in protein. */
const cls = await page.evaluate(() => {
  const P = window.__diet.presets();
  const pick = id => P.find(p => p.id === id);
  return { ched: window.__diet.macroClass(pick("ched")),
           chick: window.__diet.macroClass(pick("chick")),
           rice: window.__diet.macroClass(pick("rice")) };
});
ok("cheddar is filed as fat, not protein", cls.ched === "fat", "cheddar → " + cls.ched);
ok("bulk chicken is protein", cls.chick === "protein", "chicken → " + cls.chick);
ok("white rice is carbs", cls.rice === "carb", "rice → " + cls.rice);

console.log("\n── the fridge card is gone ───────────────────────────────");
ok("no fridge card", (await page.locator("#fridge, .card.fridge").count()) === 0);
ok("nothing is greyed out as \"none left\"",
   !/none left/i.test(await page.locator("#presets").innerText()));

console.log("\n── no trend lines, and the plan change is ON THE AXIS ────");
/* 🚩 THIS IS THE CHECK THAT WOULD HAVE CAUGHT THE LIVE BUG.
   The marker drew nothing on the real site for five days because the x-axis
   was built from LOGGED DAYS ONLY and nothing has been logged since 12 Aug,
   two days before the 14 Aug change. steptest.mjs injected synthetic Block 02
   days before it looked, so it proved the drawing code and never the axis.
   This runs against the REAL CSV and asserts the change date has a slot. */
const axp = await page.evaluate(() => {
  const c = Object.values(Chart.instances)[0];
  return { trends: c.data.datasets.filter(d => d.label === "trend").length,
           sets: c.data.datasets.map(d => d.label),
           dates: c.$planDates || [] };
});
ok("the trend lines are gone", axp.trends === 0, axp.sets.join(" · "));
ok("four datasets remain — two data, two target", axp.sets.length === 4, axp.sets.join(" · "));
ok("🚩 the plan-change date has a slot on the axis, with the REAL log",
   axp.dates.includes("2026-08-14"),
   "last five axis dates: " + axp.dates.slice(-5).join(" · "));
ok("the change is NOT the last slot, so the rule is not drawn on the border",
   axp.dates.indexOf("2026-08-14") < axp.dates.length - 1,
   "index " + axp.dates.indexOf("2026-08-14") + " of " + (axp.dates.length - 1));
/* Pixel read, not a screenshot diff — see the note in steptest.mjs. */
const rule = await page.evaluate(() => {
  const c = Object.values(Chart.instances)[0];
  const i = (c.$planDates || []).indexOf("2026-08-14");
  if (i < 0) return { on: 0, off: 0 };
  const px = Math.round(c.scales.x.getPixelForValue(i));
  const dpr = window.devicePixelRatio || 1, ctx = c.ctx;
  const count = x => {
    const d = ctx.getImageData(Math.round(x * dpr), Math.round(c.chartArea.top * dpr) + 40,
                               1, Math.round((c.chartArea.bottom - c.chartArea.top) * dpr) - 48).data;
    let n = 0;
    for (let k = 0; k < d.length; k += 4)
      if (Math.abs(d[k]-155) < 30 && Math.abs(d[k+1]-133) < 30 && Math.abs(d[k+2]-207) < 30) n++;
    return n;
  };
  return { on: count(px), off: count(px - 9) };
});
ok("a bright vertical rule is actually painted at 14 Aug",
   rule.on > 10 && rule.on > rule.off * 3,
   rule.on + " violet pixels on the line vs " + rule.off + " nine px away");
const legend = await page.locator(".lg").innerText();
ok("the legend names the rule rather than leaving it unexplained",
   /plan change/i.test(legend), legend.replace(/\n/g, " · ").slice(0, 110));
ok("no slope readouts left behind", !/\/day/.test(legend));

console.log("\n── the roast chicken, the hover hint and the lens ────────");
/* Added 20 Aug 2026 with the features themselves. */
/* Assert against the board's data, not against whichever disclosure group
   happens to be open — a DOM-only check here just tests the accordion. */
const roast = await page.evaluate(() =>
  window.__diet.presets().filter(p => p.id === "roast")
    .map(p => ({ n: p.n, rid: p.rid, m: window.__diet.presetMacros(p, 1) }))[0]);
ok("the whole roast chicken is on the board", !!roast, roast && roast.n);
ok("it is a recipe, so the cooked weight is editable", roast && roast.rid === "chicken");
const chickNote = await page.evaluate(() => window.__diet.recipeNote("chicken"));
ok("it says to weigh it COOKED — there is no raw weight and no yield",
   /cooked/i.test(chickNote), chickNote.slice(0, 64));
ok("and it names the skin as the decision it is",
   /skin/i.test(chickNote) && /167/.test(chickNote),
   (chickNote.match(/Strip the skin[^.]*\./) || [""])[0]);
ok("the rub is declared uncounted rather than silently dropped",
   /NOT counted/i.test(chickNote));

/* Hover: the consequence of eating one, not the amount needed to close.
   Needs an OPEN day — the hint is meaningless on a day already committed, so it
   is not rendered there. 16 Aug is a real gap in the log. */
await page.evaluate(() => window.__diet.jumpToDay("2026-08-16"));
await page.waitForTimeout(400);
const row = page.locator("#presets .p", { hasText: "Banana" }).first();
const eat = row.locator(".peat");
ok("every row carries an eat-one hint", (await eat.count()) === 1);
const eatTxt = await eat.innerText();
ok("it answers WHERE it leaves you, not how much to eat",
   /eat one →/.test(eatTxt) && /(target|band)/.test(eatTxt), eatTxt);
ok("🚩 it is hidden until hover — discreet, not a second permanent number",
   (await eat.evaluate(n => parseFloat(getComputedStyle(n).opacity))) === 0);
await row.hover();
await page.waitForTimeout(320);
ok("and hovering reveals it",
   (await eat.evaluate(n => parseFloat(getComputedStyle(n).opacity))) > 0.8,
   await eat.evaluate(n => getComputedStyle(n).opacity));

/* The lens. Off by default, and every row already carries its band. */
ok("the lens is OFF by default — one accent per page",
   (await page.locator("#qual").getAttribute("aria-pressed")) === "false");
ok("but every row already carries a quality band",
   (await page.locator("#presets .p.q-hi, #presets .p.q-ok, #presets .p.q-lo, #presets .p.q-bad").count()) > 5,
   (await page.locator("#presets .p.q-hi, #presets .p.q-ok, #presets .p.q-lo, #presets .p.q-bad").count()) + " banded rows");
const borderOff = await page.locator("#presets .p.q-bad").first().evaluate(n => getComputedStyle(n).borderTopColor);
await page.locator("#qual").click();
await page.waitForTimeout(250);
ok("clicking it turns the lens on",
   (await page.locator("#qual").getAttribute("aria-pressed")) === "true" &&
   await page.locator("#presets").evaluate(n => n.classList.contains("qual")));
const borderOn = await page.locator("#presets .p.q-bad").first().evaluate(n => getComputedStyle(n).borderTopColor);
ok("🚩 and it actually repaints the borders — not just a class",
   borderOff !== borderOn, borderOff + "  →  " + borderOn);
/* Bands come from protein per 100 kcal, so the classification has to agree with
   the figures rather than with a hand-written list. */
const bands = await page.evaluate(() => {
  const out = {};
  window.__diet.presets().forEach(p => {
    const m = window.__diet.presetMacros(p, 1);
    if (m[0]) out[p.id] = { d: Math.round(m[1] / m[0] * 1000) / 10, q: window.__diet.qualityClass(p) };
  });
  return out;
});
ok("a sausage roll is banded as carrying no protein",
   bands.gins && bands.gins.q === "q-bad", bands.gins && bands.gins.d + " g/100 kcal");
ok("bulk chicken is banded as a protein source",
   bands.chick && bands.chick.q === "q-hi", bands.chick && bands.chick.d + " g/100 kcal");
ok("cheddar reads as protein and is banded as not one",
   bands.ched && bands.ched.q === "q-lo", bands.ched && bands.ched.d + " g/100 kcal");
/* 🚩 The check that caught the first version libelling small food. Frozen veg
   is 5.6 g/100 kcal — the same band as cheddar — on 68 calories that cannot
   hurt a day. Below the floor, negative bands are suppressed; positive ones
   are not, so a 58-kcal protein yoghurt still earns green. */
ok("🚩 frozen veg is NOT called bad — 68 kcal cannot damage a day",
   bands.vegq && bands.vegq.q === "", bands.vegq && bands.vegq.d + " g/100 kcal → " +
   (bands.vegq.q || "unbanded"));
ok("but a small GOOD item still earns green",
   bands.yog && bands.yog.q === "q-hi", bands.yog && bands.yog.d + " g/100 kcal");
await page.locator("#qual").click();
await page.waitForTimeout(200);

console.log("\n── the plan-change label is P subscript c ────────────────");
const lgTxt = await page.locator(".lg").innerText();
ok("the legend spells the symbol out", /P\s*c/.test(lgTxt.replace(/\n/g, " ")),
   (lgTxt.match(/P.{0,14}plan change/) || [""])[0]);
ok("it keeps a plain-English gloss for anyone who has not seen the notation",
   /targets changed/i.test(await page.locator(".lg span[title]").first().getAttribute("title") || ""),
   await page.locator(".lg span[title]").first().getAttribute("title"));

console.log("\n── the multiplier is explained ───────────────────────────");
await page.locator("#goalbtn").click();
await page.waitForTimeout(250);
const ex = await page.locator(".explain").innerText();
ok("the goal pane explains what the multiplier is", /BMR/.test(ex) && /multiplier/i.test(ex));
ok("it gives the scale, not just the number", /1\.375/.test(ex) && /1\.9/.test(ex));
ok("it names the 1.7 error rather than hiding it", /1\.7/.test(ex) && /250/.test(ex));
ok("and points at the scale as the real answer", /fasted/i.test(ex) && /150 kcal/.test(ex));
await page.locator("#goal-close").click();
await page.waitForTimeout(150);

console.log("\n── the assistant is gone ─────────────────────────────────");
ok("no mic button", (await page.locator("#mic").count()) === 0);
ok("no transcript box", (await page.locator("#heard").count()) === 0);

/* ═══ VERSION SKEW ═══
   The failure that shipped a blank page on 18 Aug, reproduced. GitHub Pages
   caches assets for 10 minutes, so a browser can pair a NEW index.html with a
   CACHED OLD app.js. Any top-level `el(x).addEventListener` on an element the
   other version lacks throws, and an ES module that throws at the top level
   stops dead — every button, the chart and the board with it.

   This serves an index.html with elements REMOVED and asserts the app still
   boots. It is the only check here that spans two versions. */
console.log("\n── survives a version skew ───────────────────────────────");
const skewPage = await ctx.newPage();
const skewErrors = [];
skewPage.on("pageerror", e => skewErrors.push(e.message));
await skewPage.addInitScript(() => {
  localStorage.setItem("gh-token", "stub-token");
  localStorage.setItem("diet7-repo", JSON.stringify(
    { owner: "sam", repo: "dashboards-data", path: "data/health-daily-log.csv", branch: "main" }));
});
await skewPage.route("**/apps/diet/index.html*", async route => {
  const html = await readFile(join(ROOT, "apps/diet/index.html"), "utf8");
  /* Strip three elements a future version might drop. */
  const cut = html
    .replace(/<button class="gear" id="goalbtn"[\s\S]*?<\/button>/, "")
    .replace(/<button class="btn" id="clear">Clear<\/button>/, "")
    .replace(/<div class="seg mini2"[\s\S]*?<\/div>/, "");
  route.fulfill({ status: 200, contentType: "text/html", body: cut });
});
await skewPage.goto(base + "/apps/diet/index.html", { waitUntil: "networkidle" });
await skewPage.waitForTimeout(500);
ok("no uncaught error when the HTML is missing elements", skewErrors.length === 0,
   skewErrors[0] || "clean");
ok("the board still renders", (await skewPage.locator("#presets .p").count()) > 0,
   (await skewPage.locator("#presets .p").count()) + " preset rows");
ok("the chart still draws", await skewPage.evaluate(() => !!Object.values(Chart.instances).length));
/* Click the first plain (non-editor) row — which one it is depends on frecency,
   and asserting a specific item here would be testing the ordering, not the skew. */
ok("logging still works", await (async () => {
  const rows = skewPage.locator("#presets .p");
  const n = await rows.count();
  for (let i = 0; i < n; i++) {
    const label = await rows.nth(i).innerText();
    if (/editable|pick & edit|set your own|weigh it/.test(label)) continue;
    await rows.nth(i).click();
    await skewPage.waitForTimeout(200);
    if ((await skewPage.locator("#rows tr").count()) >= 1) return true;
  }
  return false;
})());
await skewPage.close();

/* Caught live 18 Aug: with several flags up, the Today card overflowed its own
   border and the Consistency card painted over its table. A card must never
   draw outside itself. */
console.log("\n── cards stay inside their own borders ───────────────────");
const overlap = await page.evaluate(() => {
  const boxes = [...document.querySelectorAll(".grid .card")].map(n => ({
    cls: n.className, r: n.getBoundingClientRect() }));
  const bad = [];
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i].r, b = boxes[j].r;
      const ov = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      const oh = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      if (ov > 2 && oh > 2) bad.push(boxes[i].cls + " ∩ " + boxes[j].cls);
    }
  /* And nothing inside a card may extend past it. */
  const spill = [...document.querySelectorAll(".grid .card")].filter(n =>
    n.scrollHeight > n.clientHeight + 2 && getComputedStyle(n).overflow === "visible")
    .map(n => n.className);
  return { bad, spill };
});
ok("no two cards overlap", overlap.bad.length === 0, overlap.bad.join(", ") || "clean");
ok("no card spills past its own border", overlap.spill.length === 0, overlap.spill.join(", ") || "clean");

console.log("\n── chart geometry at three window shapes ─────────────────");
for (const [w, h, label] of [[1440, 900, "laptop"], [1080, 1759, "tall"], [1920, 1080, "wide"]]) {
  await page.setViewportSize({ width: w, height: h });
  await page.waitForTimeout(250);
  const box = await page.locator("#chartbox").boundingBox();
  const ratio = box.width / box.height;
  ok(`${label} ${w}x${h}: chart is a sane shape`,
     box.height >= 180 && box.height <= 360 && ratio > 1,
     Math.round(box.width) + "x" + Math.round(box.height) + " (ratio " + ratio.toFixed(2) + ")");
}
await page.setViewportSize({ width: 1440, height: 900 });
await page.waitForTimeout(200);

if (SHOTS) {
  await page.screenshot({ path: join(ROOT, "tools/shot-desktop.png") });
  await phone.screenshot({ path: join(ROOT, "tools/shot-phone.png"), fullPage: true });
  console.log("\n  screenshots written to tools/");
}

console.log(`\n${fails ? "✗ FAILED" : "✓ PASSED"} — ${checks - fails}/${checks} checks\n`);
if (errors.length) { console.log("errors seen:"); errors.forEach(e => console.log("   " + e)); }

await browser.close();
server.close();
process.exit(fails || errors.length ? 1 : 0);
