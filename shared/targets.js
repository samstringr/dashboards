/* ═══════════════════════════════════════════════════════════════════════════
   targets.js — the calorie and protein engine.
   Ported from domains/health-targets.md §3–§4 and §6, 17 Aug 2026.
   ═══════════════════════════════════════════════════════════════════════════

   🚩 THE RULE THIS FILE EXISTS TO ENFORCE:
      NEVER HARDCODE A CALORIE NUMBER ANYWHERE ELSE IN THIS REPO.

   The old artifact did exactly that — `const T={rest:{kcal:2100},gym:{kcal:2450}}`
   at line 334 of reference/diet-artifact-original.html. Those constants were
   correct on 11 Aug and wrong by 14 Aug, and nothing in the code could tell.
   That is the same failure as the 1.7 activity multiplier: a bare number with
   no derivation, so when it broke there was no way to see what it had
   contaminated.

   Every number below carries its derivation. If you change one, change the
   derivation, not the output.
   ═══════════════════════════════════════════════════════════════════════════ */

export const PROFILE = {
  height_cm: 172,
  dob: "2001-09-17",          // derived, not hardcoded — age feeds BMR and ticks over 17 Sep
  goal_weight_kg: 75,         // health-targets.md §1, revised 14 Aug 2026 (was 67)
  goal_ffmi: 22.5,
  goal_bf_lo: 10, goal_bf_hi: 12,
  goal_horizon: "2028-10"     // ~2-year arc; milestone 73 kg @ 13% in 2027
};

/* 🚩 FALLBACK WEIGHT — AND THE REASON IT HAD TO EXIST.
   The engine's only input is bodyweight. On 14 Aug 2026 Sam was weighed for
   the first time ever — 73.0 kg fed, ~71.5 fasted, on the fourth attempt — and
   health-targets.md §8 marks it ✅ DONE.

   ⚠ IT WAS NEVER WRITTEN TO health-daily-log.csv. The file has a weight_kg
   column and every one of its 51 dates is empty. The single most expensive
   measurement in the base lives only in prose.

   That is INDEX.md rule 8 exactly — "state goes in artifacts, rules go in
   markdown" — failing in the direction nobody was watching. verify.js caught
   it on the first run.

   REMOVE THIS CONSTANT once the weigh-in is appended to the CSV (MIGRATION.md
   task T1). While it exists, every target in this app rests on a number that
   is not in the data layer. */
export const FALLBACK_WEIGHT_KG = 71.5;   // fasted estimate, 14 Aug 2026

export function weightFor(records, latestWeightFn) {
  const w = latestWeightFn(records);
  if (w) return { kg: w.kg, date: w.date, fallback: false };
  return { kg: FALLBACK_WEIGHT_KG, date: "2026-08-14", fallback: true,
           warning: "No weight in health-daily-log.csv — using the 14 Aug fasted estimate. See MIGRATION.md T1." };
}

export function ageOn(date = new Date()) {
  const d = new Date(PROFILE.dob);
  let a = date.getFullYear() - d.getFullYear();
  const m = date.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && date.getDate() < d.getDate())) a--;
  return a;
}

/* ── BMR — Mifflin-St Jeor, §3.1 ────────────────────────────────────────── */
export function bmr(weight_kg, date = new Date()) {
  return 10 * weight_kg + 6.25 * PROFILE.height_cm - 5 * ageOn(date) + 5;
}

/* ── THE SHIPPED TARGET — §3.5, revised 14 August 2026 ───────────────────
   ONE number. Every day. Training day, rest day, football day.
   No day-type split, no tiered multiplier. Both were deleted on the merits:

     · The day-type split (2,450 training / 2,100 rest) was never followed —
       logged means were Gym 2,197 · Football 2,221 · Rest 2,170, a 51 kcal
       spread against a designed 350. Deleting it removed a rule, not a habit.
     · The tiered multiplier adjusted by ~100 kcal per session, inside a
       formula whose own error band is ±250–400 kcal. False precision, which
       is exactly what the 1.7 error was made of.

   ⚠ 2,780 IS MAINTENANCE, HONESTLY LABELLED. It is somewhere between a 400
   deficit and a 400 surplus. Which one it actually is gets settled by four
   weeks of weight data (see correction() below), not by this formula.        */

export const MULTIPLIER = 1.66;   // §3.5. A weekly average, not a daily one.

/* Rounded to the nearest 10. health-targets.md §3.5 derives 1,675 × 1.66 = 2,781
   and then publishes 2,780 — the file rounds, so the code rounds the same way,
   or the app and the knowledge base disagree by one on the headline number and
   Sam notices numbers. The underlying error band is ±250–400 kcal, so a unit
   digit here was never real precision to begin with. */
export function calorieTarget(weight_kg, date = new Date()) {
  return Math.round(bmr(weight_kg, date) * MULTIPLIER / 10) * 10;
}

/* ⚠ CONFLICT, FLAGGED NOT RESOLVED — protein has three stated values:
      §3.5  protein = 2.15 × weight_kg, floor 145   → 153.7 g at 71.5 kg
      §4    protein = 2.10 × weight_kg, floor 145   → 150.2 g at 71.5 kg
      §3.5 headline                                  → 155 g
   None of the three agree, and 155 cannot be re-derived from either formula.
   Shipping 155 because it is the headline Sam is eating to, and because §4
   says of the protein rule: "if protein is ever revisited, the answer is:
   leave it." Raised in MIGRATION.md as an open question for Sam to settle. */

export const PROTEIN_FLOOR_HEADLINE = 155;   // §3.5, the number on the wall
export const PROTEIN_COEFF = 2.15;           // §3.5 derivation
export const PROTEIN_MIN = 145;              // absolute floor, both sections agree

export function proteinTarget(weight_kg) {
  return Math.max(PROTEIN_MIN, Math.round(PROTEIN_COEFF * weight_kg));
}

/* The band the day is judged against. There is no upper calorie ceiling any
   more — the old 2,100–2,450 band went with the day-type split. ±250 mirrors
   the honest error band on the target itself rather than inventing a new one. */
export const BAND = 250;

export function today(weight_kg, date = new Date()) {
  const kcal = calorieTarget(weight_kg, date);
  return {
    kcal,
    kcal_lo: kcal - BAND,
    kcal_hi: kcal + BAND,
    protein: PROTEIN_FLOOR_HEADLINE,
    weight_kg,
    bmr: Math.round(bmr(weight_kg, date)),
    multiplier: MULTIPLIER,
    derivation: `BMR ${Math.round(bmr(weight_kg, date))} × ${MULTIPLIER} = ${kcal} kcal · protein ${PROTEIN_FLOOR_HEADLINE} g`
  };
}

/* ── §3.6 THE CORRECTION RULE — the real dynamic engine ──────────────────
   Assessed every 4 weeks against FASTED weigh-ins. This is what turns the
   estimate into a measurement, and it is dynamic on a measurement rather
   than on a proxy for one — which is why it survived and the tiered
   multiplier did not.

   ⚠ Do not add tiers between these. If the trend says the number is wrong,
   move the number.                                                          */

export function correction(kgChangeOver4Weeks) {
  if (kgChangeOver4Weeks > 1.0)  return { delta: -150, why: "gaining too fast — that is fat" };
  if (kgChangeOver4Weeks < -0.5) return { delta: +150, why: "cutting by accident" };
  return { delta: 0, why: "target zone — hold" };
}

/* ── §4b EXIT TRIGGERS — flag proactively, do not wait to be asked ────────
   A recomp holds bodyweight flat BY DESIGN, so the scale says nothing for
   twelve weeks. Surface these in the UI rather than leaving them to judgment. */

export function exitTriggers({ kgChange4wk, waistChange4wk, weeksSinceWaist }) {
  const out = [];
  if (kgChange4wk != null && kgChange4wk < -0.5)
    out.push({ level: "warn", text: "Down >0.5 kg in 4 weeks — 2,780 is a deficit, not maintenance. +150 kcal." });
  if (kgChange4wk != null && kgChange4wk > 1.0)
    out.push({ level: "warn", text: "Up >1.0 kg in 4 weeks — 2,780 is a surplus. −150 kcal." });
  if (weeksSinceWaist == null)
    out.push({ level: "bad", text: "Waist has NEVER been measured. In a recomp it is the only signal that works. ~£4, two minutes." });
  else if (weeksSinceWaist > 4)
    out.push({ level: "warn", text: `Waist not measured for ${weeksSinceWaist} weeks.` });
  return out;
}

/* ═══════════════════════════════════════════════════════════════════════════
   §6 DERIVED ENGINE — IMPLEMENTED, DEFAULTED OFF. Do not switch on without Sam.
   ═══════════════════════════════════════════════════════════════════════════
   ⚠ health-targets.md contradicts itself here and the conflict is NOT resolved:

     §6 (11 Aug) specifies a session-tiered multiplier and day-type factors
        (×1.12 training, ×0.96 rest) and says the activity log should drive
        the diet target.
     §3.5 (14 Aug) DELETES both on the merits, then says "§6's derived engine
        still stands for the dashboards — inside an app the arithmetic is free
        and invisible. It must never surface as a number Sam has to compute."

   Those cannot both be followed. The reading taken here: §3.5's arguments
   (false precision, friction, backwards incentives) are about whether the
   NUMBER is trustworthy, not about who computes it — so a computer deriving a
   number that is wrong by ±100 inside a ±350 error band is still wrong. The
   flat target ships. The engine is kept here, runnable, so the decision can
   be revisited with data rather than rebuilt from scratch.                    */

export const DERIVED_ENGINE_ENABLED = false;

export const SESSION_TIERS = [
  { min: 5, mult: 1.65 }, { min: 3, mult: 1.55 },
  { min: 1, mult: 1.45 }, { min: 0, mult: 1.375 }
];

export function derivedMultiplier(sessionsThisWeek) {
  return SESSION_TIERS.find(t => sessionsThisWeek >= t.min).mult;
}

export function derivedTarget(weight_kg, sessionsThisWeek, dayType, date = new Date()) {
  const tdee = bmr(weight_kg, date) * derivedMultiplier(sessionsThisWeek);
  const factor = dayType === "Rest" ? 0.96 : 1.12;   // §6; holds the weekly total constant
  return Math.round(tdee * factor);
}
