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

/* 🚩 EVERY per-100 g FIGURE BELOW IS A DEFAULT, NOT A CONSTANT — 18 Aug 2026.
   Sam: "when I go to edit the overnight oats, I can see the values, I can change
   them, that's great. But then the calorie values and protein values on the
   side, they're uneditable, and I need them to be editable."

   He was right and the first version was half a feature: editable grams against
   frozen macros still can't describe a different brand of oats or the protein
   powder that is no longer whey isolate. Both sides of the multiplication are
   editable now. Reset always returns to the sourced figure. */

/* Per 100 g of each component, back-derived from recipes.md §1's own component
   table so the defaults reproduce 650 / 57.5 / 86.5 / 8.8 exactly. */
/* ── RECIPES: a name, an icon, and a list of ingredients ──────────────────── */
export const RECIPES = {
  oats: {
    id: "oats", n: "Overnight oats", icon: "grain",
    note: "recipes.md §1, LOCKED and confirmed 5 Aug 2026. Defaults reproduce " +
          "650 / 57.5 / 86.5 / 8.8 exactly. ⚠ The protein powder is no longer the " +
          "whey isolate and its macros still are — read the Bulk pack and correct the row.",
    ing: [
      { id: "oats",   n: "Scottish rolled oats",           icon: "grain",  per: [378.75, 13.25, 67.75, 6.5],  g: 80,  step: 5 },
      /* ⚠ RENAMED 17 Aug 2026: "it's not actually the whey isolate anymore… just
         bulk protein powder chocolate flavour." Macros held at the isolate's
         figures until a pack is read — flag it, don't invent it. */
      { id: "powder", n: "Bulk protein powder, chocolate", icon: "tub",    per: [377.1, 85.7, 3.43, 1.14],   g: 35,  step: 5, unv: true },
      { id: "yog",    n: "Milbona protein yoghurt",        icon: "pot",    per: [58, 11, 3.5, 0.2],           g: 100, step: 10 },
      { id: "milk",   n: "Semi-skimmed milk",              icon: "bottle", per: [50, 3.6, 4.8, 1.8],          g: 150, step: 10 },
      { id: "berry",  n: "Frozen blueberries",             icon: "berry",  per: [45, 0.625, 10, 0.375],       g: 80,  step: 10 },
      { id: "honey",  n: "Honey",                          icon: "drop",   per: [306.7, 0, 82.7, 0],          g: 15,  step: 5 }
    ]
  },

  /* NEW 18 Aug 2026, from Sam: "air fried salmon with a bit of honey, some
     paprika, and a little bit of soy sauce as well in the air fryer."
     ⚠ Logged by RAW input, the recipes.md §4d pattern — mass is conserved apart
     from water, which carries no calories, so the total is exact without anyone
     weighing a cooked fillet. Salmon figure is generic farmed Atlantic and is
     the weakest row here; read the pack. */
  salmon: {
    id: "salmon", n: "Air-fried salmon", icon: "fish",
    note: "Logged by raw input, so the total is exact without a cooked weight. " +
          "⚠ Salmon is generic farmed Atlantic, not a read pack — correct it when you have one. " +
          "The honey is most of the carbs; the paprika is rounding.",
    ing: [
      { id: "fish",    n: "Salmon fillet, raw", icon: "fish",  per: [208, 20.4, 0, 13.4],  g: 150, step: 10, unv: true },
      { id: "honey",   n: "Honey",              icon: "drop",  per: [306.7, 0, 82.7, 0],   g: 10,  step: 5 },
      { id: "paprika", n: "Paprika",            icon: "spice", per: [282, 14.1, 54, 12.9], g: 2,   step: 1 },
      { id: "soy",     n: "Soy sauce",          icon: "sauce", per: [53, 8.1, 4.9, 0.6],   g: 10,  step: 5 }
    ]
  }
};

export const OATS_INGREDIENTS = RECIPES.oats.ing;

/* Meal-prep proteins. per100 is EDITABLE — the batch changes every cook. */
export const PREP_PROTEINS = [
  { id: "chicken", n: "Chicken breast", icon: "chicken", per: [190, 31, 0, 6.4],    g: 200, unv: true,
    note: "recipes.md §4, per 100 g cooked. Bulk-cooked, yield varies with the batch." },
  { id: "mince",   n: "Lean steak mince", icon: "beef", per: [157, 21.0, 6.4, 5.0], g: 320, unv: true,
    note: "recipes.md §4a, per 100 g cooked. 1,700 g yield confirmed 10 Aug 2026. " +
          "Edit these if you cooked beans, cabbage or anything else into the batch." },
  { id: "salmon",  n: "Salmon fillet", icon: "fish", per: [208, 22.1, 0, 12.4], g: 150, unv: true,
    note: "⚠ NOT in recipes.md — generic cooked Atlantic salmon standing in. " +
          "Read the pack and correct it; this is the weakest-sourced row here." }
];

/* Sides that ride along with a prep plate. Kept separate from the protein so the
   protein picker stays a single choice, which is how he described it. */
export const PREP_SIDES = [
  { id: "potato", n: "Air-fried potatoes", icon: "potato", per: [115, 2.6, 22.6, 1.9], g: 150, unv: true },
  { id: "veg",    n: "Lidl frozen mixed veg", icon: "leaf", per: [45, 2.5, 7.0, 0.5],   g: 150, unv: true, veg: true },
  { id: "rice",   n: "White rice, cooked", icon: "grain", per: [130, 2.7, 28.2, 0.3], g: 0,   unv: true }
];

/* ── Overrides. Everything above is a DEFAULT; what Sam edits lives in
      localStorage and wins. Reset always returns to the sourced figure. ── */

/* Overrides are keyed recipe → ingredient → {g, per}. Both halves editable. */
export function recipe(rid) {
  const R = RECIPES[rid];
  const ov = (S.recipeOverrides.r || {})[rid] || {};
  return { ...R, ing: R.ing.map(i => {
    const o = ov[i.id] || {};
    return { ...i, g: o.g ?? i.g, per: o.per || i.per, edited: !!o.per };
  }) };
}

export const oats = () => recipe("oats").ing;

export function setIng(rid, iid, patch) {
  S.recipeOverrides.r = S.recipeOverrides.r || {};
  S.recipeOverrides.r[rid] = S.recipeOverrides.r[rid] || {};
  S.recipeOverrides.r[rid][iid] = { ...(S.recipeOverrides.r[rid][iid] || {}), ...patch };
  persist();
}

export function resetRecipe(rid) {
  if (S.recipeOverrides.r) delete S.recipeOverrides.r[rid];
  persist();
}

export const recipeTotal = rid => sumIngredients(recipe(rid).ing);

export function recipeName(rid) {
  const R = RECIPES[rid], cur = recipe(rid).ing;
  const diffs = R.ing
    .map(d => ({ d, c: cur.find(c => c.id === d.id) }))
    .filter(x => x.c.g !== x.d.g || x.c.edited)
    .map(x => x.c.g === 0 ? "no " + shortName(x.d.n) : shortName(x.d.n) + " " + r1(x.c.g) + "g");
  return diffs.length ? R.n + " · " + diffs.join(", ") : R.n;
}

const shortName = n => n.toLowerCase()
  .replace("scottish rolled ", "").replace("bulk protein powder, chocolate", "protein")
  .replace("milbona protein yoghurt", "yoghurt").replace("semi-skimmed ", "")
  .replace("frozen ", "").replace(", raw", "");

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

export const resetOats = () => resetRecipe("oats");
export function resetPrep(id) { if (S.recipeOverrides.prep) delete S.recipeOverrides.prep[id]; persist(); }

/* ── Totals ───────────────────────────────────────────────────────────────── */
export const sumIngredients = list =>
  list.reduce((t, i) => (i.per.forEach((v, k) => t[k] += v * i.g / 100), t), [0, 0, 0, 0]);

export const oatsTotal = () => recipeTotal("oats");

export const oatsName = () => recipeName("oats");

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
