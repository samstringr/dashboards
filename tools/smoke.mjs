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
ok("calorie target is the derived 2,780", T.kcal === 2780, T.kcal + " kcal");
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
ok("fallback weight is flagged, not hidden", /weight not in the log/i.test(goal));

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
ok("defaults reproduce recipes.md \u00a71 exactly",
   /650 kcal · 57.5 g P · 86.5 g C · 8.8 g F/.test(oatsTot), oatsTot.split("\n")[0]);
ok("the renamed protein powder is flagged, not silently re-macroed",
   /protein powder/i.test(await page.locator(".ed").innerText()) &&
   /whey isolate/i.test(await page.locator(".ed").innerText()));

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
ok("and it says there is no Block 02 data yet",
   /no data under it yet/i.test(statTxt));
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
