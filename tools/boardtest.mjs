/* ═══════════════════════════════════════════════════════════════════════════
   boardtest.mjs — the 29 Aug 2026 "Log an item" changes, executed.

   Covers what smoke.mjs cannot know about:
     1. Sections are the largest macro BY GRAMS, not by calorie share.
     2. The five fatty items that move to Carbs KEEP their amber fat flag —
        this is the whole reason the change was safe to make.
     3. Every row on the board carries kcal, P, C and F.
     4. Shah's Halal platter: defaults, arithmetic, editor, and the logged row.

   ⚠ Written against a REAL browser, not a stubbed DOM. design-system.md:
   "node --check proves a file PARSES. It does not prove it RUNS."
   ═══════════════════════════════════════════════════════════════════════════ */
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
               ".css": "text/css", ".json": "application/json", ".png": "image/png" };

let pass = 0, fail = 0;
const ok = (label, cond, detail = "") => {
  (cond ? pass++ : fail++);
  console.log(`  ${cond ? "✓" : "✗"} ${label}${detail ? "  — " + detail : ""}`);
};

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

let CSV = await readFile(join(ROOT, "data/health-daily-log.csv"), "utf8");
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.route("**/api.github.com/**", route => route.fulfill({
  status: 200, contentType: "application/json",
  body: JSON.stringify({ content: Buffer.from(CSV, "utf8").toString("base64"), sha: "stub" })
}));

const page = await ctx.newPage();
const errors = [];
page.on("pageerror", e => errors.push("pageerror: " + e.message));
page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });
await page.addInitScript(() => {
  localStorage.setItem("gh-token", "stub-token");
  localStorage.setItem("diet7-repo", JSON.stringify(
    { owner: "sam", repo: "dashboards-data", path: "data/health-daily-log.csv", branch: "main" }));
});
await page.goto(base + "/apps/diet/index.html", { waitUntil: "networkidle" });
await page.waitForTimeout(400);

console.log("\n── it runs at all ────────────────────────────────────────");
ok("no runtime errors on boot", errors.length === 0, errors[0] || "clean");

/* Pull every preset with its computed macros and its section. */
const board = await page.evaluate(async () => {
  const P = await import("./presets.js");
  return P.PRESETS().map(p => {
    const m = P.presetMacros(p, 1).map(v => +(+v).toFixed(1));
    return { id: p.id, n: P.displayName(p), cls: p.cls || "", m,
             sect: P.macroClass(p), label: P.presetLabel(p) };
  });
});
const by = id => board.find(r => r.id === id);

console.log("\n── 1. sections follow the largest macro BY GRAMS ──────────");
for (const r of board) {
  const [, p, c, f] = r.m;
  const want = !(p + c + f) ? "carb" : (p >= c && p >= f) ? "protein" : f > c ? "fat" : "carb";
  if (r.sect !== want) { ok(`${r.n} filed under ${want}`, false, `got ${r.sect}`); }
}
ok("every item's section matches the grams rule", fail === 0, board.length + " items checked");

console.log("\n── 2. the two Sam asked for, and the cost of the rule ─────");
ok("air-fried salmon is in Protein", by("salmonr").sect === "protein",
   `${by("salmonr").m[1]} g P vs ${by("salmonr").m[3]} g F`);
ok("whole roast chicken is in Protein", by("roast").sect === "protein",
   `${by("roast").m[1]} g P vs ${by("roast").m[3]} g F`);

const moved = ["bfc", "gast", "dom", "greg", "maxjal"];
ok("the five fatty items did move to Carbs",
   moved.every(id => by(id).sect === "carb"),
   moved.map(id => by(id).n.split(" ")[0] + "→" + by(id).sect).join(" · "));
ok("🚩 and they ALL kept the amber fat flag — the signal is not lost",
   moved.every(id => by(id).cls === "fat"),
   moved.map(id => by(id).cls || "NO FLAG").join(" · "));
ok("Ginsters stays in Fat on its own merits", by("gins").sect === "fat",
   `${by("gins").m[3]} g F vs ${by("gins").m[2]} g C`);
ok("an unconfigured builder is not filed as protein by a 0-0-0 tie",
   await page.evaluate(async () => (await import("./presets.js")).macroClass({ id: "x", n: "x" }) === "carb"));

console.log("\n── 3. every row carries all four figures ──────────────────");
const bad = board.filter(r => !/\d+ kcal/.test(r.label) || !/[\d.]+ P\b/.test(r.label) ||
                              !/[\d.]+ C\b/.test(r.label) || !/[\d.]+ F\b/.test(r.label));
ok("kcal, P, C and F on every item", bad.length === 0,
   bad.length ? bad.map(b => b.n).join(", ") : board.length + " items");
ok("the builders show figures too, not just a description",
   /kcal/.test(by("assen").label) && /kcal/.test(by("shahs").label),
   "Assenheims: " + by("assen").label.slice(0, 58));

console.log("\n── 4. Shah's Halal platter ────────────────────────────────");
const sh = by("shahs");
ok("the item exists on the board", !!sh, sh && sh.n);
ok("defaults to LARGE COMBO as asked", /large/i.test(sh.label) && /combo/i.test(sh.label),
   sh.label.slice(0, 70));
/* 804 · 50 · 98 · 23 at regular, × 1.4 for large. */
const want = [804 * 1.4, 50 * 1.4, 98 * 1.4, 23 * 1.4].map(v => +v.toFixed(1));
ok("large-combo arithmetic is right", JSON.stringify(sh.m) === JSON.stringify(want),
   sh.m.join(" / ") + "  expected " + want.join(" / "));
ok("it is flagged unverified", sh.cls === "unv", sh.cls);
ok("it files under Carbs on the grams rule", sh.sect === "carb",
   `${sh.m[2]} g C vs ${sh.m[1]} g P vs ${sh.m[3]} g F`);

/* Switch to regular chicken and confirm the board line itself moves. */
const swapped = await page.evaluate(async () => {
  const P = await import("./presets.js"), St = await import("./state.js");
  St.S.sState.size = "reg"; St.S.sState.meat = "chicken";
  const p = P.PRESETS().find(x => x.id === "shahs");
  return { m: P.presetMacros(p, 1).map(v => +(+v).toFixed(1)), label: P.presetLabel(p), sect: P.macroClass(p) };
});
ok("changing size and meat moves the board line", /regular/i.test(swapped.label) && /chicken/i.test(swapped.label),
   swapped.label.slice(0, 70));
ok("regular chicken is the sourced figure, unscaled",
   JSON.stringify(swapped.m) === JSON.stringify([658, 59, 81, 10]), swapped.m.join(" / "));
ok("regular chicken files under Carbs (81 C > 59 P)", swapped.sect === "carb");

/* The editor, opened for real. */
await page.evaluate(async () => {
  const St = await import("./state.js");
  St.S.sState.size = "lg"; St.S.sState.meat = "combo";
});
await page.evaluate(() => { window.__diet && window.__diet.render && window.__diet.render(); });
const opened = await page.evaluate(async () => {
  const St = await import("./state.js"), E = await import("./editors.js");
  St.S.editing = "shahs"; E.renderEditor();
  const host = document.getElementById("editor");
  return { text: host.innerText.replace(/\n+/g, " · ").slice(0, 900),
           buttons: [...host.querySelectorAll(".opt")].map(b => b.textContent) };
});
ok("the editor opens", /Shah/.test(opened.text), opened.text.slice(0, 60));
ok("it offers Regular/Large and Chicken/Combo/Lamb",
   JSON.stringify(opened.buttons) === JSON.stringify(["Regular", "Large", "Chicken", "Combo", "Lamb"]),
   opened.buttons.join(" · "));
ok("it shows the total for the current pick", /1126 kcal|1,126 kcal/.test(opened.text.replace(/,/g, "")),
   (opened.text.match(/\d+ kcal[^·]*/) || [""])[0]);
ok("🚩 it says out loud that the figures are unverified", /Unverified/i.test(opened.text));
ok("and names the 1.4 estimate rather than hiding it", /1\.4|estimate/i.test(opened.text));

const logged = await page.evaluate(async () => {
  const St = await import("./state.js"), E = await import("./editors.js");
  St.S.log = []; St.S.editing = "shahs"; E.renderEditor();
  [...document.querySelectorAll("#editor .btn")].find(b => b.textContent === "Add").click();
  return St.S.log.map(r => ({ n: r.n, m: r.m.map(v => +(+v).toFixed(1)), u: !!r.u, fat: !!r.fat }));
});
ok("clicking Add logs exactly one row", logged.length === 1, JSON.stringify(logged[0] && logged[0].n));
ok("the row names size and meat", /large/.test(logged[0].n) && /combo/.test(logged[0].n), logged[0].n);
ok("the row carries the large-combo macros", JSON.stringify(logged[0].m) === JSON.stringify(want),
   logged[0].m.join(" / "));
ok("the row is marked unverified in the log", logged[0].u === true);
ok("and carries the fat flag at 32 g", logged[0].fat === true, logged[0].m[3] + " g F");

ok("still no runtime errors after all of that", errors.length === 0, errors[0] || "clean");

console.log(`\n${fail === 0 ? "✅" : "❌"}  ${pass}/${pass + fail} passing\n`);
await browser.close();
server.close();
process.exit(fail === 0 ? 0 : 1);
