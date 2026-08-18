/* presets.js — the click-to-log board.
   Items and macros come from domains/recipes.md. Recipes live there and only there. */

import { S, r1, scale, targets } from "./state.js";
import { BATCH, GRAM } from "./data.js";
import { RECIPES, recipe, recipeTotal, recipeName, prepProtein, prepSide,
         frecency, useCount, PREP_PROTEINS } from "./recipes.js";

export const BASE_PRESETS = [
  /* Renamed 17 Aug 2026: "Standard overnight oats" → "Overnight oats", and it is
     now an INGREDIENT recipe rather than a frozen macro block. */
  { id: "oats",   n: "Overnight oats",      kind: "recipe", rid: "oats",   icon: "grain", cls: "lock" },
  /* NEW 18 Aug 2026 — salmon, honey, paprika, soy, air fried. */
  { id: "salmonr", n: "Air-fried salmon",  kind: "recipe", rid: "salmon", icon: "fish" },
  { id: "plate", n: "Meal prep plate", icon: "plate",          kind: "plate" },
  { id: "assen", n: "Assenheims", icon: "plate",               kind: "assen" },
  { id: "bfc",   n: "Birds Eye southern fried chicken", icon: "chicken", m: [238, 13, 20, 12], cls: "fat" },
  { id: "whey",  n: "Protein powder scoop 35 g", icon: "tub", m: [132, 30, 1.2, 0.4] },
  { id: "chick", n: "Bulk chicken 100 g", icon: "chicken",       m: [190, 31, 0, 6.4] },
  { id: "yog",   n: "Protein yoghurt 100 g", icon: "pot",    m: [58, 11, 3.5, 0.2] },
  { id: "ban",   n: "Banana", icon: "berry",                   m: [105, 1.3, 27, 0.4] },
  { id: "rice",  n: "White rice 150 g cooked", icon: "grain",  m: [195, 4.1, 42.3, 0.5], cls: "unv" },
  { id: "vegq",  n: "Frozen veg 150 g", icon: "leaf",         m: scale(BATCH.veg.per, 150), veg: true, batch: "veg", g: 150, cls: "unv" },
  { id: "swpot", n: "Air-fried sweet potato", icon: "potato",   kind: "gram", gk: "swpot" },
  { id: "chips", n: "Thick-cut chips", icon: "potato",          kind: "gram", gk: "chips", cls: "unv" },
  { id: "ched",  n: "Cheddar cheese", icon: "cheese",           kind: "gram", gk: "ched",  cls: "fat" },
  { id: "ket",   n: "Heinz ketchup", icon: "sauce",            kind: "gram", gk: "ket" },
  { id: "mayo",  n: "Mayo 30 g", icon: "sauce",                m: [87, 0.2, 2.4, 8.4], cls: "fat" },
  { id: "sri",   n: "Sriracha 15 g", icon: "sauce",            m: [8, 0, 1.5, 0] },
  /* 10 g soy · 10 g rice wine vinegar · 5 g honey. The honey is 15 of the 24 kcal. */
  { id: "dip",   n: "Soy, vinegar & honey dip", icon: "sauce", m: [24, 0.8, 5.3, 0] },
  { id: "gyoza", n: "Itsu chicken gyoza, 12", icon: "plate",   m: [372, 19.7, 48, 10.6] },
  { id: "coco",  n: "Coconut bean rice 100 g", icon: "grain",  m: [135, 2.9, 22, 3.5], cls: "unv" },
  { id: "gast",  n: "Gastro chicken ½ bag", icon: "chicken",     m: [526, 28.5, 38, 28.5], cls: "fat" },
  { id: "pop",   n: "Pop chips, one bag", icon: "plate",       m: [100, 2.8, 14, 2.8], cls: "unv" },
  { id: "dom",   n: "Domino's slice", icon: "cheese",           m: [300, 13.5, 29, 14.5], cls: "fat" },
  /* Greggs Sausage Roll, 103 g. 348 kcal / 10.2 P / 24.1 C / 22.2 F, 10.2 g saturated.
     2.9 g protein per 100 kcal — the lowest-density item here bar the dips. */
  { id: "greg",  n: "Greggs sausage roll", icon: "beef",      m: [348, 10.2, 24.1, 22.2], cls: "fat" }
];

/* ⚠ FIXED IN THE PORT: the artifact had TWO presets with id "chips" — the gram
   editor and the Pop chips bag. Duplicate ids broke pin, edit and archive for
   both, because every lookup found the first one. Pop chips is now "pop". */

export const PRESETS = () => BASE_PRESETS.concat(S.customs).map(p => {
  const o = S.overrides[p.id];
  return o ? Object.assign({}, p, { n: o.n || p.n, m: o.m || p.m, edited: true }) : p;
});

/* ── ORDERING ─────────────────────────────────────────────────────────────
   "The more often I use a certain item, the more preference it is at the top."
   Pins still win — an explicit choice outranks an inferred one — then frecency,
   then the shipped order as a stable tiebreak so the board never jitters. */
export function ordered(list) {
  const base = new Map(BASE_PRESETS.map((p, i) => [p.id, i]));
  return [...list].sort((a, b) => {
    const pa = S.pins[a.id] ? 1 : 0, pb = S.pins[b.id] ? 1 : 0;
    if (pa !== pb) return pb - pa;
    const fa = frecency(a.id), fb = frecency(b.id);
    if (Math.abs(fa - fb) > 0.01) return fb - fa;
    return (base.get(a.id) ?? 99) - (base.get(b.id) ?? 99);
  });
}

export function presetLabel(p) {
  if (p.kind === "recipe") {
    const R = recipe(p.rid), t = recipeTotal(p.rid);
    return R.ing.filter(i => i.g > 0).map(i => r1(i.g) + "g " + i.n.split(/[ ,]/)[0].toLowerCase()).join(" · ") +
           " · " + Math.round(t[0]) + " kcal";
  }
  if (p.kind === "plate") {
    const pr = prepProtein(S.prepPick);
    return pr.n.toLowerCase() + " " + pr.g + "g · " + Math.round(pr.per[0] * pr.g / 100) + " kcal · pick & edit";
  }
  if (p.kind === "assen") return "size, bases, sauce · editable";
  if (p.kind === "gram") {
    const G = GRAM[p.gk], s = S.gState[p.gk];
    return s.g + " " + G.unit + (G.oil[0] && s.oil ? " + " + s.oil + " ml oil" : "") +
           " · " + Math.round(G.per[0] * s.g / 100 + G.oil[0] * s.oil) + " kcal · set your own";
  }
  if (p.batch && (S.fridge[p.batch] ?? 0) <= 0) return "none left";
  return Math.round(p.m[0]) + " kcal · " + r1(p.m[1]) + " g P";
}

/* Macros for a preset at a given multiplier. */
export function presetMacros(p, mult = 1) {
  if (p.kind === "recipe") return recipeTotal(p.rid).map(v => v * mult);
  if (p.kind === "plate") {
    const pr = prepProtein(S.prepPick);
    return pr.per.map(v => v * pr.g / 100 * mult);
  }
  if (p.m) return p.m.map(v => v * mult);
  if (p.kind === "gram") {
    const G = GRAM[p.gk], s = S.gState[p.gk], o = [0, 0, 0, 0];
    G.per.forEach((v, i) => o[i] += v * s.g / 100);
    G.oil.forEach((v, i) => o[i] += v * s.oil);
    return o.map(v => v * mult);
  }
  return [0, 0, 0, 0];
}

export const displayName = p =>
  p.kind === "recipe" ? recipeName(p.rid) :
  p.kind === "plate"  ? "Meal prep plate · " + prepProtein(S.prepPick).n.toLowerCase() : p.n;

/* Protein per 100 kcal — ranks the close-the-day routes so the leanest is first. */
export const density = m => m[0] > 0 ? m[1] / m[0] * 100 : 0;

/* ── HOW MUCH OF *THIS* ITEM WOULD CLOSE THE DAY ───────────────────────────
   Sam, 17 Aug 2026: "it would be nice if you can… have, like, on that item, how
   much of that one item would I need to get to close the day."

   This is what replaced the separate close-the-day card. Every row on the board
   now carries its own answer, so the question is answered where the decision is
   actually made rather than in a panel two columns away.

   The binding constraint is whichever runs out first — protein floor or the top
   of the calorie band. Returns null when the item can't sensibly get there. */
export function closeHint(p, totals) {
  const T = targets();
  const per = presetMacros(p, 1);
  if (!per[0] || !S.log.length && !totals[0]) return null;

  const pGap = T.protein - totals[1];
  const kRoom = T.kcal_hi - totals[0];
  if (kRoom <= 0) return null;

  /* If protein is already covered, the useful answer is calories to the target. */
  const wantK = T.kcal - totals[0];
  if (pGap <= 0) {
    if (wantK <= 0) return null;
    const n = wantK / per[0];
    return fmt(p, n, per, "to target");
  }
  if (per[1] <= 0) return null;
  const nP = pGap / per[1];
  const nK = kRoom / per[0];
  if (nP > nK) return { text: "can't close it — " + fmt(p, nK, per, "").text + " fills the band first", weak: true };
  return fmt(p, nP, per, "clears the floor");
}

function fmt(p, n, per, suffix) {
  if (!Number.isFinite(n) || n <= 0) return null;
  if (p.kind === "gram") {
    const G = GRAM[p.gk], s = S.gState[p.gk];
    return { text: Math.round(s.g * n / 5) * 5 + " " + G.unit + " " + suffix };
  }
  if (p.kind === "plate") {
    const pr = prepProtein(S.prepPick);
    return { text: Math.round(pr.g * n / 10) * 10 + " g " + suffix };
  }
  if (p.batch) return { text: Math.round(p.g * n / 10) * 10 + " g " + suffix };
  const r = n < 1 ? Math.round(n * 10) / 10 : Math.round(n * 2) / 2;
  return { text: r + "× " + suffix };
}
