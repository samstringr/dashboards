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
    note: "Components from recipes.md §1 (LOCKED, 5 Aug 2026). ✅ The protein powder row " +
          "is now READ FROM THE PACK — Sam, 19 Aug 2026 — and the grams are his current " +
          "build. The old 650 / 57.5 / 86.5 / 8.8 headline no longer applies: it described " +
          "80 g of oats and 35 g of a different powder. This build is 766 / 58.4 / 108.7 / 11.8.",
    ing: [
      { id: "oats",   n: "Scottish rolled oats",           icon: "grain",  per: [378.75, 13.25, 67.75, 6.5],  g: 100, step: 5 },
      /* 🚩 CORRECTED 19 Aug 2026, and this one was carrying real error.
         Renamed on 17 Aug — "it's not actually the whey isolate anymore… just bulk
         protein powder chocolate flavour" — but the MACROS stayed at the isolate's,
         flagged unverified, for two days. Sam read the pack:

              was  377.1 kcal · 85.7 P · 3.43 C · 1.14 F   (whey isolate)
              now  392   kcal · 68   P · 21   C · 3.8  F   (Bulk chocolate)

         At his 40 g scoop that is 7 g LESS protein and 7 g MORE carbs per bowl than
         the app was claiming. Every oats day logged before today overstates protein
         by about that much — the CSV rows stand as logged, but this is why. */
      { id: "powder", n: "Bulk protein powder, chocolate", icon: "tub",    per: [392, 68, 21, 3.8],           g: 40,  step: 5 },
      { id: "yog",    n: "Milbona protein yoghurt",        icon: "pot",    per: [58, 11, 3.5, 0.2],           g: 100, step: 10 },
      { id: "milk",   n: "Semi-skimmed milk",              icon: "bottle", per: [50, 3.6, 4.8, 1.8],          g: 180, step: 10 },
      { id: "berry",  n: "Frozen blueberries",             icon: "berry",  per: [45, 0.625, 10, 0.375],       g: 80,  step: 10 },
      { id: "honey",  n: "Honey",                          icon: "drop",   per: [306.7, 0, 82.7, 0],          g: 15,  step: 5 }
    ]
  },

  /* NEW 18 Aug 2026, revised the same day.

     First build made this four editable ingredients — salmon, honey, paprika,
     soy — logged by RAW input. Wrong for how Sam actually eats it. His words:
     "I'm going to be just taking the cooked salmon out the fridge, weighing it,
     and then eating it. There's no need for me to adjust honey, paprika, sauce
     amounts every time."

     So it is ONE editable number: grams of COOKED salmon. The glaze is recorded
     as context, not as a row to maintain.

     ⚠ AND THE HONEST BIT, because it is a real omission rather than a rounding
     one: the glaze is NOT in these macros. On a typical fillet it is roughly
     +40 kcal and +9 g carbs — about 12% of the calories. Sam asked for salmon
     alone and that is what this logs, but the number is stated here so the
     choice stays visible rather than quietly becoming a wrong figure. */
  salmon: {
    id: "salmon", n: "Air-fried salmon", icon: "fish",
    note: "Weigh it COOKED, straight from the air fryer or the fridge. " +
          "Cooked with honey, paprika and soy rubbed on — ⚠ that glaze is NOT counted here " +
          "(~40 kcal, ~9 g carbs on a typical fillet). " +
          "⚠ Salmon is generic farmed Atlantic, not a read pack.",
    ing: [
      { id: "fish", n: "Salmon, cooked", icon: "fish", per: [208, 22.1, 0, 12.4], g: 150, step: 10, unv: true }
    ]
  },

  /* ── WHOLE ROAST CHICKEN, added 20 August 2026 ──────────────────────────
     Sam: "I cooked a whole chicken. Rubbed it with a little bit of paprika, a
     little bit of honey, put an onion inside it, but I don't count the onion.
     When I go to eat it, I'll just weigh out the cooked weight. I don't know
     how much it weighed raw."

     🚩 SO IT IS LOGGED BY COOKED WEIGHT, like the salmon (4d's rule) and NOT
     like the batch preps. A batch figure needs a raw input and a cooked yield;
     he has neither, and inventing a raw weight to back into a yield would make
     every portion wrong by however far the guess was off. A per-100-g-cooked
     figure needs only the thing he will actually do: put meat on the scale.

     ⚠ SKIN IS THE WHOLE DECISION HERE, and it is a bigger swing than anything
     else on this board:
        meat AND skin, roasted   223 kcal · 24.0 P · 0 C · 13.4 F   per 100 g
        meat only, no skin       167 kcal · 25.0 P · 0 C ·  6.6 F   per 100 g
     Same protein. **Half the fat and a third fewer calories.** Over 500 g of
     picked chicken that is 280 kcal — a whole meal's worth of difference made
     by nothing but whether the skin goes on the plate. Skin-on is the default
     because Sam rubbed the skin and will eat it; switch the row to 167/25/0/6.6
     on a day he strips it. Both figures USDA, read 20 Aug 2026.

     ⚠ The rub is NOT counted, and unlike the salmon glaze it genuinely does not
     matter: "a little bit" of honey over a whole bird is ~15 g, so ~46 kcal
     spread across the entire chicken — under 6 kcal per 100 g of meat. Paprika
     is nil. The onion is not counted because Sam does not eat it. */
  chicken: {
    id: "chicken", n: "Whole roast chicken", icon: "chicken",
    note: "Weigh the meat COOKED, off the bird — there is no raw weight and no yield, " +
          "so this is the only basis that can be exact. ⚠ The row is MEAT AND SKIN. " +
          "Strip the skin and it is 167 / 25 / 0 / 6.6 instead: same protein, half the fat. " +
          "⚠ Paprika and honey rub NOT counted (~46 kcal over the whole bird, under 6 per 100 g). " +
          "Onion not counted — it goes in the cavity and does not get eaten.",
    ing: [ { id: "meat", n: "Roast chicken, meat and skin, cooked", icon: "chicken",
             per: [223, 24, 0, 13.4], g: 200, step: 10 } ] }
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
