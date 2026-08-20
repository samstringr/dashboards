/* ═══════════════════════════════════════════════════════════════════════════
   verify.js — run it, don't just parse it.
   ═══════════════════════════════════════════════════════════════════════════

   design-system.md, 11 Aug 2026, after the diet dashboard shipped completely
   blank: a stray double comma made a sparse array hole. `node --check` passed
   it clean, because a hole is legal JavaScript. At runtime it threw at the top
   level and the whole page died before one element rendered.

     "node --check proves a file PARSES. It does not prove it RUNS."
     "Substituting a cheaper check while keeping the word 'verified' is the
      actual failure."

   So: this executes the real logic against the real CSV and exits non-zero on
   any failure. Run it before every commit that touches shared/.

       node shared/verify.js

   ═══════════════════════════════════════════════════════════════════════════ */

import { readFileSync } from "node:fs";
import * as S from "./store.js";
import * as T from "./targets.js";

let fails = 0, checks = 0, warns = 0;
const ok  = (label, cond, detail = "") => {
  checks++;
  if (!cond) { fails++; console.log(`  ✗ ${label}${detail ? "  — " + detail : ""}`); }
  else console.log(`  ✓ ${label}${detail ? "  — " + detail : ""}`);
};

console.log("\n── store.js ──────────────────────────────────────────────");

const csv  = readFileSync(new URL("../data/health-daily-log.csv", import.meta.url), "utf8");
const rows = S.parseCSV(csv);

ok("CSV parses", rows.length > 0, `${rows.length} raw rows`);
ok("header is the expected 11 columns",
   Object.keys(rows[0]).length === S.COLUMNS.length,
   Object.keys(rows[0]).length + " columns");

/* The notes column contains commas, quotes and newlines. A split(",") parser
   silently shreds these rows, so this is the check that matters most. */
const fat = rows.find(r => (r.notes || "").includes(","));
ok("quoted fields with embedded commas survive", !!fat && !fat.notes.startsWith('"'),
   fat ? `"${fat.notes.slice(0, 44)}…"` : "none found");

const view = S.currentView(rows);
ok("last-row-wins collapses duplicate dates", view.length < rows.length,
   `${rows.length} rows → ${view.length} dates`);

/* 2026-06-17 appears twice: an early pre-dinner total, then a correction. */
const jun17 = view.find(r => r.date === "2026-06-17");
ok("the 17 Jun correction supersedes the earlier row",
   jun17 && jun17.kcal === 2388 && jun17.confidence === "corrected",
   jun17 ? `${jun17.kcal} kcal, confidence=${jun17.confidence}` : "missing");

/* 2026-07-10 was voided — a whole batch logged before any of it was eaten. */
ok("voided dates are excluded, not zeroed",
   !view.some(r => r.date === "2026-07-10"),
   "2026-07-10 absent from the current view");
ok("voided dates are still retrievable with includeVoid",
   S.currentView(rows, { includeVoid: true }).some(r => r.date === "2026-07-10"));

/* Blank is not zero — the single easiest rule to break with `|| 0`. */
const blank = view.find(r => r.kcal == null);
ok("blank kcal is null, never 0", blank ? blank.kcal === null : false,
   blank ? `${blank.date} kcal=${blank.kcal}` : "no blank rows found");
ok("num('') is null and num('0') is 0", S.num("") === null && S.num("0") === 0);

const solid = view.filter(S.isSolid);
ok("solid days identified", solid.length > 20, `${solid.length} solid days`);

/* Round-trip: parse → serialise → parse must be lossless, or the audit trail
   corrupts a little on every write. */
const rt = S.parseCSV(S.serialiseCSV(rows));
ok("parse → serialise → parse is lossless",
   JSON.stringify(rt) === JSON.stringify(rows),
   `${rt.length} rows back`);

/* Append must not disturb what is already there. */
const appended = S.parseCSV(S.appendRecord(csv,
  { date: "2026-08-17", day_type: "Rest", kcal: 2780, protein_g: 155,
    confidence: "confirmed", source: "verify.js", notes: "test, with a comma" }));
ok("append adds exactly one row", appended.length === rows.length + 1);
ok("append leaves earlier rows byte-identical",
   JSON.stringify(appended.slice(0, rows.length)) === JSON.stringify(rows));
ok("append round-trips a comma in notes",
   appended.at(-1).notes === "test, with a comma");

let threw = false;
try { S.appendRecord(csv, { date: "2026-08-17" }); } catch { threw = true; }
ok("append refuses a record with no confidence", threw);

console.log("\n── targets.js ────────────────────────────────────────────");

const w = S.latestWeight(rows);
const resolved = T.weightFor(rows, S.latestWeight);
ok("a bodyweight resolves for the engine", resolved.kg > 0,
   `${resolved.kg} kg${resolved.fallback ? " (FALLBACK)" : " from CSV"}`);
if (!w) {
  warns++;
  console.log("  ⚠ health-daily-log.csv carries NO weight in any of its 51 dates.");
  console.log("    The 14 Aug weigh-in (73.0 kg fed / ~71.5 fasted) exists only in prose.");
  console.log("    Every target below rests on a fallback constant. See MIGRATION.md T1.");
}

/* Derivation check against health-targets.md §3.5:
   BMR 1,675 (172 cm, 24 y, 71.5 kg) × 1.66 = 2,781 → the published 2,780.    */
const on14Aug = new Date("2026-08-14");
const b = T.bmr(71.5, on14Aug);
ok("age derives from DOB, not hardcoded", T.ageOn(on14Aug) === 24, `age ${T.ageOn(on14Aug)}`);
ok("BMR matches §3.1 at 71.5 kg", Math.abs(b - 1675) < 1.5, `${b.toFixed(1)} vs 1,675 on file`);

const tgt = T.calorieTarget(71.5, on14Aug);
ok("calorie target matches the published 2,780", tgt === 2780, `${tgt} vs 2,780 on file`);
ok("protein target is the published 155 g", T.today(71.5, on14Aug).protein === 155);
ok("no calorie constant is reachable outside targets.js",
   T.today(71.5, on14Aug).derivation.includes("×"),
   T.today(71.5, on14Aug).derivation);

/* 🚩 FED → FASTED, added 19 Aug 2026. The bug this guards was live and visible:
   the app showed 2,810 while health-targets.md §3.5 said 2,780, because a FED
   weight was read, labelled, and then fed to the formula raw. Three assertions —
   the conversion happens, it does NOT happen on an unstated weight, and the
   converted answer lands on the published figure. */
ok("a FED weight converts to its fasted equivalent",
   T.fastedEquivalent(73.0, "fed") === 71.5, T.fastedEquivalent(73.0, "fed") + " kg");
ok("a FASTED weight is left alone", T.fastedEquivalent(71.5, "fasted") === 71.5);
ok("🚩 an UNSTATED weight is NOT converted — that would invent a measurement",
   T.fastedEquivalent(73.0, null) === 73.0, T.fastedEquivalent(73.0, null) + " kg");
ok("73.0 kg FED lands on the published 2,780, not 2,810",
   T.calorieTarget(T.fastedEquivalent(73.0, "fed"), on14Aug) === 2780,
   T.calorieTarget(T.fastedEquivalent(73.0, "fed"), on14Aug) + " vs " +
   T.calorieTarget(73.0, on14Aug) + " if the state were discarded");
ok("🚩 a note that mentions BOTH words refuses to guess",
   T.weightFor([{date:"2026-01-01", weight_kg:73, notes:"73 kg fed, about 71.5 fasted"}],
               rs => ({kg:73, date:"2026-01-01"})).state === null,
   "prose naming both states → no conversion");
ok("an explicit STATE= token beats the prose around it",
   T.weightFor([{date:"2026-01-01", weight_kg:73, notes:"STATE=fed. Compared against a fasted figure."}],
               rs => ({kg:73, date:"2026-01-01"})).fastedKg === 71.5,
   "STATE=fed inside prose mentioning 'fasted' → 71.5 kg");
ok("the resolved weight carries a fasted equivalent for the engine to use",
   resolved.fastedKg > 0 && resolved.fastedKg <= resolved.kg,
   resolved.kg + " kg " + (resolved.state || "state UNSTATED") + " → " + resolved.fastedKg + " kg fasted-equivalent");

/* Age ticks over on 17 Sep 2026 — the target must move with it, unprompted.
   This is the whole reason age is derived rather than typed. */
/* Targets round to the nearest 10, so a birthday moves this by 10, not by 8.3.
   Asserting the direction and that it moves at all — an exact-equality test here
   would just be re-implementing the code. */
const after = T.calorieTarget(71.5, new Date("2026-09-18"));
ok("target moves when Sam turns 25 without anyone editing a file",
   after < tgt, `${tgt} → ${after} (−${tgt - after})`);

ok("correction rule: −0.8 kg over 4 weeks says eat more",  T.correction(-0.8).delta === +150);
ok("correction rule: +1.4 kg over 4 weeks says eat less",  T.correction(1.4).delta === -150);
ok("correction rule: +0.3 kg is the hold zone",            T.correction(0.3).delta === 0);

ok("the derived §6 engine is present but OFF", T.DERIVED_ENGINE_ENABLED === false);
ok("derived multiplier tiers still resolve",   T.derivedMultiplier(3) === 1.55);

const trig = T.exitTriggers({ kgChange4wk: null, waistChange4wk: null, weeksSinceWaist: null });
ok("an unmeasured waist raises a bad-level flag",
   trig.some(t => t.level === "bad" && /waist/i.test(t.text)));

console.log(`\n${fails ? "✗ FAILED" : "✓ PASSED"} — ${checks - fails}/${checks} checks` +
            `${warns ? `, ${warns} warning${warns > 1 ? "s" : ""}` : ""}\n`);
process.exit(fails ? 1 : 0);
