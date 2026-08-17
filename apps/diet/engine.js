/* engine.js — totals, flags, the close-the-day planner, risk checks, and the
   CSV record. No DOM in here; everything returns data for render.js to draw.

   🚩 WHAT CHANGED IN THE PORT, AND WHY IT MATTERS MORE THAN THE PLUMBING.
   The artifact judged a day against a per-day-type target (2,100 rest / 2,450
   gym) and flagged going OVER. Both are wrong as of 14 Aug 2026:

     · One flat target, 2,780 kcal. Day type no longer moves it.
     · The direction of risk INVERTED. Sam under-eats four times more often than
       he over-eats — 9 of 28 days below 2,100, only 2 above 2,550 — and the new
       target is +543/day on his logged mean. Under-eating while training is how
       lean mass gets lost, which is the "I lost weight and look worse" mechanism.
       The loud flag now points DOWN, not up.                                    */

import { S, r1, scale, targets, DAYS, FAT_WARN, FAT_BAD, UNDER, ISO } from "./state.js";
import { BATCH } from "./data.js";
import { PRESETS, presetMacros, density } from "./presets.js";

export function totals() {
  if (S.closed && S.fileToday) {
    const f = S.fileToday;
    return [f.kcal ?? 0, f.protein_g ?? 0, f.carbs_g ?? 0, f.fat_g ?? 0];
  }
  const t = [0, 0, 0, 0];
  S.log.forEach(r => r.m.forEach((v, i) => t[i] += v));
  return t;
}

export const hasDay = () => S.closed || S.log.length > 0;

export const hasVeg = () => S.closed
  ? /veg|salad|greens/i.test(S.fileToday?.notes || "")
  : S.log.some(r => r.veg);

export const fileItems = () => String(S.fileToday?.notes || "")
  .split(/;\s*/).filter(s => s && !/^[A-Z][a-z]+ day logged/.test(s));

/* ── FLAGS ───────────────────────────────────────────────────────────────── */
export function flags() {
  const t = totals(), T = targets(), out = [];
  if (!hasDay()) return out;

  const fatty = S.log.filter(r => r.fat).length;
  const unv   = S.log.filter(r => r.u).length;
  const gap   = T.protein - t[1];

  /* Loudest flag, and it points down. See the header note. */
  if (t[0] < T.kcal_lo)
    out.push(["bad", "<b>" + Math.round(T.kcal - t[0]) + " kcal under</b> the " +
      T.kcal.toLocaleString() + " target. Under-eating is the documented failure mode here, " +
      "not overshoot — and a deficit without the training stimulus costs lean mass."]);
  else if (t[0] > T.kcal_hi)
    out.push(["warn", "Over the band by <b>" + Math.round(t[0] - T.kcal_hi) +
      " kcal</b>. Flag it, close it, and no compensatory restriction tomorrow."]);

  if (t[3] > FAT_BAD)
    out.push(["bad", "Fat at <b>" + Math.round(t[3]) + " g</b> — past the line. Name what drove it before you close."]);
  else if (t[3] > FAT_WARN)
    out.push(["warn", "Fat at <b>" + Math.round(t[3]) + " g</b>, approaching the line. Keep the rest lean."]);

  if (fatty >= 2)
    out.push(["warn", "<b>Fat stacking</b> — " + fatty + " fat-dense items today. The fix on record is sequencing, not elimination."]);

  if (gap > 0 && t[0] > T.kcal_hi - 250)
    out.push(["bad", "<b>" + Math.round(gap) + " g short</b> of the floor with only " +
      Math.round(T.kcal_hi - t[0]) + " kcal left."]);

  if (!hasVeg()) out.push(["warn", "Nothing green logged. 150 g of frozen veg is 68 kcal."]);

  if (unv) out.push(["info", unv + " item" + (unv > 1 ? "s are" : " is") +
    " an estimate, not a label figure. The row will say so."]);

  if (t[1] >= T.protein && t[0] >= T.kcal_lo && t[0] <= T.kcal_hi)
    out.push(["good", "Floor cleared at <b>" + r1(t[1]) + " g</b> and inside the band. That's the day."]);

  return out;
}

/* ── THE CLOSE-THE-DAY PLANNER ────────────────────────────────────────────
   Returns SEVERAL routes, not one (T11, requested 12 Aug 2026).
   "Give options, not one polished answer. He iterates and chooses by reacting."
   A single suggestion he doesn't fancy is a dead end; three costed options is a
   decision. ⚠ Ranked by protein per 100 kcal so the leanest route is the default. */

export function closeOptions() {
  const t = totals(), T = targets();
  const pGap = T.protein - t[1];
  const kGap = T.kcal - t[0];
  const out = [];

  if (S.closed) return { closed: true, options: [], why: closedWhy(t, T) };
  if (kGap <= -250) return { options: [], why:
    "Over the band by <b>" + Math.round(-kGap - 250) + " kcal</b>. Nothing more — close it out." };

  /* Route 1 — the fridge. Highest-protein batch first, then carbs, then greens. */
  const fridgeRoute = fridgePlan(t, T, pGap, kGap);
  if (fridgeRoute) out.push(fridgeRoute);

  /* Routes 2+ — the things he commonly finishes a day on. Named in the request:
     the mince prep (covered above), gyoza, cheese. Anything pinned counts too. */
  const finishers = PRESETS().filter(p =>
    !S.archived[p.id] && (p.m || p.kind === "gram") &&
    ["gyoza", "ched", "chick", "whey", "yog", "dip", "swpot", "chips", "ket"].includes(p.id));

  finishers.forEach(p => {
    const per = presetMacros(p, 1);
    if (per[0] <= 0) return;
    /* How many of this item closes the protein gap without breaking the band? */
    const byProtein = per[1] > 0 ? pGap / per[1] : Infinity;
    const byCal     = kGap / per[0];
    let n = Math.round(Math.min(byProtein > 0 ? byProtein : byCal, byCal));
    if (!Number.isFinite(n) || n < 1) n = kGap > per[0] * 0.6 ? 1 : 0;
    if (n < 1) return;
    const m = per.map(v => v * n);
    if (t[0] + m[0] > T.kcal_hi) return;
    out.push({
      kind: "preset", id: p.id, n,
      lines: [{ g: n === 1 ? "1×" : n + "×", n: p.n, sub: label(t, m, T) }],
      macros: m, density: density(m),
      why: "Lands at <b>" + Math.round(t[0] + m[0]) + " kcal</b>, protein <b>" +
           Math.round(t[1] + m[1]) + " g</b>."
    });
  });

  /* ⚠ Ranked protein-per-100-kcal, DESCENDING. The leanest route is the default. */
  const ranked = out.sort((a, b) => b.density - a.density).slice(0, 4);
  return { options: ranked, why: headline(t, T, pGap, kGap, ranked.length) };
}

function label(t, m, T) {
  const p2 = t[1] + m[1];
  return p2 >= T.protein ? "clears the floor" : Math.round(T.protein - p2) + " g still short";
}

function headline(t, T, pGap, kGap, n) {
  if (!n) return pGap > 0
    ? "<b>" + Math.round(pGap) + " g</b> short and nothing on the board fits the remaining " +
      Math.round(kGap) + " kcal. " + Math.round(pGap / 30 * 35) + " g of whey would do it."
    : "Floor cleared at <b>" + r1(t[1]) + " g</b>. <b>" + Math.round(kGap) + " kcal</b> of headroom left.";
  return pGap > 0
    ? "<b>" + Math.round(pGap) + " g</b> of protein and <b>" + Math.round(kGap) +
      " kcal</b> left. Ranked leanest first."
    : "Floor cleared at <b>" + r1(t[1]) + " g</b>. <b>" + Math.round(kGap) +
      " kcal</b> of headroom — carbs take the remainder.";
}

function closedWhy(t, T) {
  return "<b>Day closed.</b> " + Math.round(t[0]) + " kcal against " + T.kcal.toLocaleString() +
    ", protein <b>" + r1(t[1]) + " g</b>. Amend it in the app if something was missed — " +
    "a correction is appended, never edited over.";
}

function fridgePlan(t, T, pGap, kGap) {
  const lines = [], plate = {};
  let k2 = t[0], p2 = t[1], f2 = t[3];

  if (pGap > 0) {
    let best = null;
    Object.keys(BATCH).forEach(k => {
      if ((S.fridge[k] ?? 0) <= 0) return;
      const per = BATCH[k].per, dens = per[1] / per[0];
      if (!best || dens > best.dens) best = { k, per, dens };
    });
    if (best) {
      const g = Math.min(Math.round(pGap / (best.per[1] / 100) / 10) * 10, S.fridge[best.k]);
      if (g > 0) {
        const used = scale(best.per, g);
        lines.push({ g: g + " g", n: BATCH[best.k].n, sub: "closes the " + Math.round(pGap) + " g protein gap" });
        plate[best.k] = g;
        k2 += used[0]; p2 += used[1]; f2 += used[3];
      }
    }
  }

  const vegReserve = (!hasVeg() && (S.fridge.veg ?? 0) > 0) ? Math.round(BATCH.veg.per[0] * 1.5) : 0;
  const MARGIN = 80;
  let head = T.kcal - k2;
  if ((S.fridge.potato ?? 0) > 0 && !plate.potato && head - vegReserve - MARGIN > 140) {
    const pg = Math.min(S.fridge.potato,
      Math.round((head - vegReserve - MARGIN) / BATCH.potato.per[0] * 100 / 10) * 10);
    if (pg >= 50) {
      lines.push({ g: pg + " g", n: BATCH.potato.n, sub: "fills the band, leaves a margin" });
      plate.potato = pg;
      const u = scale(BATCH.potato.per, pg); k2 += u[0]; p2 += u[1]; f2 += u[3];
    }
  }
  if (!hasVeg() && (S.fridge.veg ?? 0) > 0) {
    lines.push({ g: "150 g", n: BATCH.veg.n, sub: "nothing green logged today — 68 kcal, counts in the total" });
    plate.veg = 150;
    const u = scale(BATCH.veg.per, 150); k2 += u[0]; p2 += u[1]; f2 += u[3];
  }
  if (!lines.length) return null;

  const m = [k2 - t[0], p2 - t[1], 0, f2 - t[3]];
  return {
    kind: "fridge", plate, lines, macros: m, density: density(m),
    why: "Lands at <b>" + Math.round(k2) + " kcal</b> against " + T.kcal.toLocaleString() +
         ", protein <b>" + Math.round(p2) + " g</b>." +
         (f2 > FAT_WARN ? " Fat would reach <b>" + Math.round(f2) + " g</b> — keep the rest lean." : "")
  };
}

/* ── RISK CHECK before saving ─────────────────────────────────────────────── */
export function risks() {
  const t = totals(), T = targets(), out = [];
  if (t[1] < T.protein)
    out.push(["bad", "Protein floor <b>missed by " + Math.round(T.protein - t[1]) + " g</b> — closing at " + r1(t[1]) + " g."]);
  if (t[0] < T.kcal - UNDER)
    out.push(["bad", "Closing <b>" + Math.round(T.kcal - t[0]) + " kcal under</b> a " +
      T.kcal.toLocaleString() + " target. Under-eating is not a win on a recomposition."]);
  if (t[0] > T.kcal_hi)
    out.push(["warn", "Closing <b>" + Math.round(t[0] - T.kcal_hi) + " kcal over</b> the band."]);
  if (t[3] > FAT_BAD) out.push(["warn", "Fat closed at <b>" + r1(t[3]) + " g</b>."]);
  if (!hasVeg()) out.push(["warn", "No vegetables logged today."]);
  return out;
}

/* ── THE CSV RECORD ───────────────────────────────────────────────────────
   ⚠ weight_kg and training are deliberately BLANK. Blank is not zero, and
   neither may be inferred or interpolated. store.js refuses a record with no
   confidence, which is the last line of defence against an unlabelled row. */
export function buildRecord() {
  const t = totals();
  const unv = S.log.filter(l => l.u).map(l => l.n);
  return {
    date: ISO(),
    day_type: DAYS[S.day].csv,
    weight_kg: "",
    kcal: Math.round(t[0]),
    protein_g: r1(t[1]),
    carbs_g: r1(t[2]),
    fat_g: r1(t[3]),
    training: "",
    confidence: "confirmed",
    source: "Diet app " + ISO(),
    notes: S.log.map(l => l.n).join("; ") +
           (unv.length ? " | ESTIMATED not label: " + unv.join(", ") : "")
  };
}
