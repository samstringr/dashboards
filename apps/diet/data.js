/* data.js — food constants. Every figure carries its source.
   Ported verbatim from the artifact, 17 Aug 2026. Sources unchanged.

   Sources, 10–13 Aug 2026:
   - Lean beef steak mince 5% (Birchwood, Lidl): 130 kcal / 22 P / 0 C / 4.2 F per 100 g raw
   - Birds Eye southern fried chicken breast in breadcrumbs: 238 / 13 / 20 / 12 per breast
   - Assenheims 56: menu confirms 100 / 200 / 300 g chicken sizes
   - Everything else: domains/recipes.md and domains/health-fitness.md              */

import { scale, r1 } from "./state.js";

/* ── BATCH: cooked once, portioned many times. Lives in the fridge inventory,
      recorded per 100 g COOKED, and decrements as it is eaten. ── */
export const BATCH = {
  mince:  { n: "Lean steak mince prep",  per: [157, 21.0, 6.4, 5.0], init: 1700, unv: true },
  potato: { n: "Air-fried potatoes",     per: [115, 2.6, 22.6, 1.9], init: 850,  unv: true },
  veg:    { n: "Lidl frozen mixed veg",  per: [45, 2.5, 7.0, 0.5],   init: 1000, unv: true, veg: true }
};

/* ── GRAM: cooked to order, logged by RAW input, never cooked weight.
   recipes.md §4d, 11 Aug 2026. A BATCH has one cooked yield and many portions.
   Sweet potato is cooked a portion at a time, so a per-100-g-cooked figure
   would need the basket re-weighed at every cook — exactly the per-portion
   weighing Sam ruled out on 10 Aug 2026.

   Recorded per 100 g of RAW input plus a per-ml line for oil. That is the
   number he already has at prep time, and because mass is conserved apart from
   water — which carries no calories — the total is EXACT, not an estimate.  ── */
export const GRAM = {
  swpot: {
    n: "Air-fried sweet potato", unit: "g raw",
    per: [86, 1.6, 20.1, 0.05],   // USDA FoodData Central 168482, per 100 g raw
    oil: [8.22, 0, 0, 0.913],     // Tesco own-label 1 L panel, per 1 ml
    pG: 0.00119, pO: 0.00775,     // £/g raw, £/ml oil — Tesco, 11 Aug 2026
    dflt: 145, oilDflt: 5,
    rows: [["Sweet potato", "g", "g raw", 5, 2000], ["Olive oil", "oil", "ml", 1, 100]],
    hint: (o, s) => 'The oil is <b style="color:var(--warn)">' +
      (o[0] ? Math.round(8.22 * s.oil / o[0] * 100) : 0) +
      '%</b> of the calories and effectively all of the fat. ✅ Computed from raw input, so this is exact.',
    note: "145 g raw + 1 tsp oil is the 11 Aug 2026 entry. Set either number to whatever you " +
          "actually used — the totals stay exact because they are computed from the raw input."
  },

  /* ⚠ 12 Aug 2026 CHANGED THE BASIS. Chips are now logged by COOKED weight, which
     retired the 39% frozen-vs-cooked conversion this entry used to carry. Co-op
     thick-cut has no published panel; Tesco steak-cut 170 kcal/100 g COOKED is the
     working figure, real band 165–185. Lidl is the default brand — and it is the
     weakest-sourced row here, so READ THE PACK. */
  chips: {
    n: "Thick-cut chips", unit: "g cooked", unv: true,
    per: [170, 2.4, 29.6, 4.0], oil: [0, 0, 0, 0],
    pG: 0.00133, pO: 0,
    dflt: 200, oilDflt: 0,
    rows: [["Chips", "g", "g cooked", 10, 1000]],
    hint: () => '<b style="color:var(--warn)">⚠ ±35 kcal per 100 g.</b> No Co-op or Lidl thick-cut ' +
      'panel exists; Tesco steak-cut cooked is standing in. Reading the pack settles it.',
    note: "Weigh them COOKED, off the tray — the basis changed on 12 Aug 2026. " +
          "1.4 g of protein per 100 kcal: a carb source with a fat tail, nothing more."
  },

  /* Tesco Mature Cheddar 400 g, £3.25. 416 kcal / 25.4 P / 0.1 C / 34.9 F per 100 g,
     21.7 g of that saturated. Densest fat source in recipes.md — ahead of mayo. */
  ched: {
    n: "Cheddar cheese", unit: "g", fat: true,
    per: [416, 25.4, 0.1, 34.9], oil: [0, 0, 0, 0],
    pG: 0.00812, pO: 0,
    dflt: 50, oilDflt: 0,
    rows: [["Cheddar", "g", "g", 5, 300]],
    hint: o => '<b style="color:var(--warn)">' + r1(o[3]) + ' g of fat</b>, ' + r1(o[3] * 0.62) +
      ' g of it saturated. 6.1 g protein per 100 kcal — reads as protein, behaves as fat.',
    note: "⚠ The item most needing weighing and least likely to get weighed. Grated by eye, " +
          "30 g and 80 g look identical on a plate and are 125 kcal apart."
  },

  /* Heinz Tomato Ketchup 460 g, £2.25. 102 kcal / 1.2 P / 23.2 C / 0.1 F per 100 g. */
  ket: {
    n: "Heinz ketchup", unit: "g",
    per: [102, 1.2, 23.2, 0.1], oil: [0, 0, 0, 0],
    pG: 0.00489, pO: 0,
    dflt: 30, oilDflt: 0,
    rows: [["Ketchup", "g", "g", 5, 200]],
    hint: (o, s) => '✅ Mayo does the same job for <b style="color:var(--warn)">' +
      Math.round(s.g * 2.9) + ' kcal and ' + r1(s.g * 0.28) + ' g of fat</b>. This is ' +
      Math.round(o[0]) + ' kcal and none.',
    note: "Nearly all sugar, but the dose is so small it does not matter — 30 g is 31 kcal. " +
          "Swapping mayo for ketchup once a day is ~56 kcal and 8 g of fat, free."
  }
};

/* ── ASSENHEIMS 56 — straight from the source, no derivation.
   Five real logged combinations from MyNetDiary, all at REGULAR (200 g) chicken.

   ⚠ WHY THESE ARE WHOLE COMBINATIONS AND NOT COMPONENTS.
   Solving the five entries simultaneously for chicken/veg/salad/potato/rice gives
   veg ≈ 0 kcal and salad ≈ −28 kcal. The entries are mutually inconsistent, so any
   per-component figure would be invented, not sourced. The combination totals are
   what was actually measured, so they are what gets used.

   Two components DO fall out cleanly as differences, and both are recorded:
     grilled potatoes   = +85 kcal · 3 P · 15 C · 6 F   ← 6 g fat. They are oiled.
     Colombian red rice = +111 kcal · 4 P · 29 C · 2 F                          ── */
export const ASSEN = {
  combos: {
    veg:       { n: "Veg",               m: [490, 49, 13, 17] },
    ricesalad: { n: "Rice + salad",      m: [573, 52, 38, 18] },
    vegpot:    { n: "Veg + potatoes",    m: [575, 52, 28, 23] },
    riceveg:   { n: "Rice + veg",        m: [601, 53, 42, 19] },
    ricepot:   { n: "Rice + potatoes",   m: [686, 55, 56, 25] }
  },
  chick100: [216, 23.3, 2, 7.5],          // ONLY to step chicken off the 200 g the combos assume
  sizes: { sm: -100, reg: 0, lg: 100 },
  sizeLabel: { sm: "100 g", reg: "200 g", lg: "300 g" }
};

/* ── SHAH'S HALAL RICE PLATTER ────────────────────────────────────────────
   Sam, 29 Aug 2026: "I also commonly eat Large Shah's Halal Combo Rice Platter…
   add the option to select whether it is regular or large (default large), and
   chicken, lamb or combo (default combo) with spicy sauce, always."

   🚩 SHAH'S OWN PUBLISHED FIGURES ARE UNUSABLE, AND THE REASON MATTERS.
   Their two UK sites disagree with each other AND with themselves:
     shahshalalfood.co.uk  combo   520 kcal · 29 P ·  98 C · 12 F → macros sum to 616
     shahshalalfooduk.com  combo   820 kcal · 40 P ·  39 C · 34 F → macros sum to 622
     shahshalalfooduk.com  lamb   1030 kcal · 39 P ·  45 C · 55 F → macros sum to 831
   A published calorie figure that does not reconcile with its own published
   macros cannot be used for EITHER number. Taking the stated kcal breaks the
   day's macro totals; taking the macros breaks the kcal. Both were rejected.

   ✅ SOURCED FROM THE HALAL GUYS INSTEAD — the same product format (halal-cart
   platter: rice, meat, white sauce, hot sauce), whose published figures pass
   the test Shah's own chart fails, reconciling to within 3 kcal:
     regular chicken   648 kcal · 59 P ·  79 C · 10 F   (236 + 316 +  90 = 642)
     regular combo     794 kcal · 50 P ·  96 C · 23 F   (200 + 384 + 207 = 791)
     small combo       572 kcal · 34 P ·  73 C · 16 F   (136 + 292 + 144 = 572)
   Corroboration: Shah's UK puts a combo at 820 against Halal Guys' 794 — 3%
   apart — and both rank chicken < combo < lamb, lamb the fattest. The shape of
   the menu agrees even where the arithmetic does not.

   LAMB IS DERIVED, NOT INVENTED. A combo is half chicken and half gyro, so
   lamb = 2 × combo − chicken = 940 kcal · 41 P · 113 C · 36 F, which reconciles
   exactly (164 + 452 + 324 = 940).

   ⚠ THE LARGE MULTIPLIER IS AN ASSUMPTION. No large-size figure is published
   anywhere. 1.4 is Halal Guys' own small → regular step (572 → 794 = 1.39).
   A reasoned estimate, not a measurement — which is why every item logged from
   here carries the UNVERIFIED flag. Read a panel or weigh one and correct it;
   the editor exists for exactly that.

   Spicy sauce is always on at ~10 kcal / 2 g C, folded into each base rather
   than offered as a toggle. Sam never varies it, and a control nobody moves is
   only a new way to get it wrong.                                          ── */
export const SHAHS = {
  meats: {
    chicken: { n: "Chicken", m: [658, 59,  81, 10] },
    combo:   { n: "Combo",   m: [804, 50,  98, 23] },
    lamb:    { n: "Lamb",    m: [950, 41, 115, 36] }
  },
  sizes:     { reg: 1,         lg: 1.4 },
  sizeLabel: { reg: "Regular", lg: "Large" }
};

export const vegPreset = () => scale(BATCH.veg.per, 150);
