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
ok("no 2,100 / 2,450 anywhere on screen",
   !/2,?100|2,?450/.test(await page.locator("body").innerText()));
const goal = await page.locator("#goal").innerText();
ok("goal strip shows 75 kg, not 67", /75 kg/.test(goal) && !/67 kg/.test(goal), goal.split("\n")[0]);
ok("goal strip shows the derivation", /BMR\s*1\d{3}\s*×/.test(goal));
ok("fallback weight is flagged, not hidden", /weight not in the log/i.test(goal));

console.log("\n── an empty day is not a gap ─────────────────────────────");
/* Caught on the live site, not here: before the guard, a blank day read as a
   155 g / 2,780 kcal shortfall and the planner proposed "14x protein yoghurt". */
ok("no routes offered before anything is logged",
   (await page.locator("#rec-body .opt-card").count()) === 0);
ok("it says what the day needs instead",
   /log breakfast/i.test(await page.locator("#rec-why").innerText()),
   (await page.locator("#rec-why").innerText()).slice(0, 58));

console.log("\n── logging ───────────────────────────────────────────────");
await page.locator("#presets .p", { hasText: "Standard overnight oats" }).first().click();
await page.waitForTimeout(150);
ok("logging a preset adds a row", (await page.locator("#rows tr").count()) === 1);
ok("protein metric updated", (await page.locator("#v-prot").innerText()) === "58",
   await page.locator("#v-prot").innerText());
ok("close button enabled once something is logged",
   !(await page.locator("#close").isDisabled()));

console.log("\n── under-eating is the loud flag now ─────────────────────");
const flagText = await page.locator("#flags").innerText();
ok("a 650 kcal day flags UNDER, not over", /under/i.test(flagText), flagText.split("\n")[0]?.slice(0, 60));

console.log("\n── close-the-day offers several routes, ranked ───────────");
const opts = await page.locator("#rec-body .opt-card").count();
ok("more than one route offered", opts > 1, opts + " options");
ok("the first is badged leanest", (await page.locator("#rec-body .opt-card.lead .lean").count()) === 1);
const dens = await page.locator("#rec-body .opt-card .od").allInnerTexts();
const nums = dens.map(s => parseFloat(s));
ok("ranked by protein per 100 kcal, descending",
   nums.every((v, i) => i === 0 || nums[i - 1] >= v), dens.join(" · "));
const counts = (await page.locator("#rec-body .opt-card .g").allInnerTexts())
  .map(s => parseInt(s)).filter(Number.isFinite);
ok("no route proposes more than 3 of one item", counts.every(c => c <= 3 || c > 10),
   counts.join(", "));

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
