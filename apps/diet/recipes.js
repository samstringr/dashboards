/* recipes.js — composable items, editable at the level Sam actually measures at.

   🚩 THE PROBLEM THIS SOLVES, IN HIS WORDS (17 Aug 2026):
     "I can edit it, but I can't edit the individual ingredient amounts. I'd
      rather edit the individual ingredient amounts as opposed to the macros
      themselves because that's easier for me to measure. You know? I weigh out
      oats. I weigh out protein."

   The old editor exposed the OUTPUT (650 kcal / 57.5 g P). Nobody weighs a
   calorie. He weighs 80 g of oats. So a recipe now stores its ingredients and
   derives the macros, which means the number on screen is always the sum of
   things he actually put in the bowl.

   TWO SHAPES, because he asked for two different things:

   · INGREDIENT recipes (overnight oats) — fixed per-100 g components, editable
     GRAMS. He measures grams, so grams are the input.

   · PORTION recipes (the meal-prep proteins) — editable PER-100 g MACROS plus a
     portion weight. His words: "say I cook the lean steak mince, I might add ten
     of red kidney beans, or I might add some cabbage, and that slightly adjusts
     the macros themselves of that steak mince." The batch composition changes
     every cook, so the per-100 g figure is the thing that needs editing, not
     the grams.

   Sources: domains/recipes.md §1 (oats, LOCKED, confirmed 5 Aug 2026),
   §4 (bulk chicken), §4a (lean steak mince, yield confirmed 10 Aug 2026).      */

import { S, r1, persist } from "./state.js";

/* Per 100 g of each component, back-derived from recipes.md §1's own component
   table so the defaults reproduce 650 / 57.5 / 86.5 / 8.8 exactly. */
export const OATS_INGREDIENTS = [
  { id: "oats",   n: "Scottish rolled oats",        per: [378.75, 13.25, 67.75, 6.5],  g: 80,  step: 5 },
  /* ⚠ RENAMED 17 Aug 2026 at Sam's instruction: "it's not actually the whey
     isolate anymore… just bulk protein powder chocolate flavour." Macros held
     at the isolate's figures until a pack is read — flag it, don't invent it. */
  { id: "powder", n: "Bulk protein powder, chocolate", per: [377.1, 85.7, 3.43, 1.14], g: 35,  step: 5, unv: true },
  { id: "yog",    n: "Milbona protein yoghurt",      per: [58, 11, 3.5, 0.2],           g: 100, step: 10 },
  { id: "milk",   n: "Semi-skimmed milk",            per: [50, 3.6, 4.8, 1.8],          g: 150, step: 10 },
  { id: "berry",  n: "Frozen blueberries",           per: [45, 0.625, 10, 0.375],       g: 80,  step: 10 },
  { id: "honey",  n: "Honey",                        per: [306.7, 0, 82.7, 0],          g: 15,  step: 5 }
];

/* Meal-prep proteins. per100 is EDITABLE — the batch changes every cook. */
export const PREP_PROTEINS = [
  { id: "chicken", n: "Chicken breast",    per: [190, 31, 0, 6.4],    g: 200, unv: true,
    note: "recipes.md §4, per 100 g cooked. Bulk-cooked, yield varies with the batch." },
  { id: "mince",   n: "Lean steak mince",  per: [157, 21.0, 6.4, 5.0], g: 320, unv: true,
    note: "recipes.md §4a, per 100 g cooked. 1,700 g yield confirmed 10 Aug 2026. " +
          "Edit these if you cooked beans, cabbage or anything else into the batch." },
  { id: "salmon",  n: "Salmon fillet",     per: [208, 22.1, 0, 12.4], g: 150, unv: true,
    note: "⚠ NOT in recipes.md — generic cooked Atlantic salmon standing in. " +
          "Read the pack and correct it; this is the weakest-sourced row here." }
];

/* Sides that ride along with a prep plate. Kept separate from the protein so the
   protein picker stays a single choice, which is how he described it. */
export const PREP_SIDES = [
  { id: "potato", n: "Air-fried potatoes",    per: [115, 2.6, 22.6, 1.9], g: 150, unv: true },
  { id: "veg",    n: "Lidl frozen mixed veg", per: [45, 2.5, 7.0, 0.5],   g: 150, unv: true, veg: true },
  { id: "rice",   n: "White rice, cooked",    per: [130, 2.7, 28.2, 0.3], g: 0,   unv: true }
];

/* ── Overrides. Everything above is a DEFAULT; what Sam edits lives in
      localStorage and wins. Reset always returns to the sourced figure. ── */

export function oats() {
  const ov = S.recipeOverrides.oats || {};
  return OATS_INGREDIENTS.map(i => ({ ...i, g: ov[i.id] ?? i.g }));
}

export function prepProtein(id) {
  const base = PREP_PROTEINS.find(p => p.id === id) || PREP_PROTEINS[0];
  const ov = (S.recipeOverrides.prep || {})[id] || {};
  return { ...base, per: ov.per || base.per, g: ov.g ?? base.g, edited: !!ov.per };
}

export function prepSide(id) {
  const base = PREP_SIDES.find(p => p.id === id);
  const ov = (S.recipeOverrides.side || {})[id] || {};
  return { ...base, per: ov.per || base.per, g: ov.g ?? base.g };
}

export function setOatsGrams(id, g) {
  S.recipeOverrides.oats = S.recipeOverrides.oats || {};
  S.recipeOverrides.oats[id] = Math.max(0, g);
  persist();
}

export function setPrep(id, patch) {
  S.recipeOverrides.prep = S.recipeOverrides.prep || {};
  S.recipeOverrides.prep[id] = { ...(S.recipeOverrides.prep[id] || {}), ...patch };
  persist();
}

export function setSide(id, patch) {
  S.recipeOverrides.side = S.recipeOverrides.side || {};
  S.recipeOverrides.side[id] = { ...(S.recipeOverrides.side[id] || {}), ...patch };
  persist();
}

export function resetOats() { delete S.recipeOverrides.oats; persist(); }
export function resetPrep(id) { if (S.recipeOverrides.prep) delete S.recipeOverrides.prep[id]; persist(); }

/* ── Totals ───────────────────────────────────────────────────────────────── */
export const sumIngredients = list =>
  list.reduce((t, i) => (i.per.forEach((v, k) => t[k] += v * i.g / 100), t), [0, 0, 0, 0]);

export const oatsTotal = () => sumIngredients(oats());

/* Name the DEVIATION, not the recipe. Reciting all six ingredients every time
   made the log row unreadable and told Sam nothing — he knows what is in his
   own oats. What he needs to see later is which bit was different that day. */
export function oatsName() {
  const cur = oats();
  const diffs = OATS_INGREDIENTS
    .map(d => ({ d, g: cur.find(c => c.id === d.id).g }))
    .filter(x => x.g !== x.d.g)
    .map(x => x.g === 0 ? "no " + short(x.d.n) : short(x.d.n) + " " + r1(x.g) + "g");
  return diffs.length ? "Overnight oats · " + diffs.join(", ") : "Overnight oats";
}
const short = n => n.toLowerCase()
  .replace("scottish rolled ", "").replace("bulk protein powder, chocolate", "protein")
  .replace("milbona protein yoghurt", "yoghurt").replace("semi-skimmed ", "")
  .replace("frozen ", "");

/* ── FRECENCY ─────────────────────────────────────────────────────────────
   "The more often I use a certain item, the more preference it is at the top."

   Straight frequency would freeze the board — a thing eaten 40 times in June
   outranks a thing eaten daily this week forever. So: count, decayed by how
   long ago each use was. Half-life 21 days, which is long enough that the oats
   never move and short enough that a new staple climbs within a fortnight. */

const HALF_LIFE_DAYS = 21;

export function noteUse(id) {
  const u = S.uses[id] || { n: 0, last: null, score: 0 };
  const now = Date.now();
  const decay = u.last ? Math.pow(0.5, (now - u.last) / (HALF_LIFE_DAYS * 864e5)) : 0;
  S.uses[id] = { n: u.n + 1, last: now, score: (u.score || 0) * decay + 1 };
  persist();
}

export function frecency(id) {
  const u = S.uses[id]; if (!u || !u.last) return 0;
  return (u.score || 0) * Math.pow(0.5, (Date.now() - u.last) / (HALF_LIFE_DAYS * 864e5));
}

export const useCount = id => S.uses[id]?.n || 0;
