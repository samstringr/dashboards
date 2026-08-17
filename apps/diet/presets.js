/* presets.js — the click-to-log board.
   Items and macros come from domains/recipes.md. Recipes live there and only there. */

import { S, r1, scale } from "./state.js";
import { BATCH, GRAM } from "./data.js";

export const BASE_PRESETS = [
  { id: "oats",  n: "Standard overnight oats", m: [650, 57.5, 86.5, 8.8], cls: "lock" },
  { id: "plate", n: "Meal prep plate",         kind: "plate" },
  { id: "assen", n: "Assenheims",              kind: "assen" },
  { id: "bfc",   n: "Birds Eye southern fried chicken", m: [238, 13, 20, 12], cls: "fat" },
  { id: "whey",  n: "Whey scoop 35 g",         m: [132, 30, 1.2, 0.4] },
  { id: "chick", n: "Bulk chicken 100 g",      m: [190, 31, 0, 6.4] },
  { id: "yog",   n: "Protein yoghurt 100 g",   m: [58, 11, 3.5, 0.2] },
  { id: "ban",   n: "Banana",                  m: [105, 1.3, 27, 0.4] },
  { id: "vegq",  n: "Frozen veg 150 g",        m: scale(BATCH.veg.per, 150), veg: true, batch: "veg", g: 150, cls: "unv" },
  { id: "swpot", n: "Air-fried sweet potato",  kind: "gram", gk: "swpot" },
  { id: "chips", n: "Thick-cut chips",         kind: "gram", gk: "chips", cls: "unv" },
  { id: "ched",  n: "Cheddar cheese",          kind: "gram", gk: "ched",  cls: "fat" },
  { id: "ket",   n: "Heinz ketchup",           kind: "gram", gk: "ket" },
  { id: "mayo",  n: "Mayo 30 g",               m: [87, 0.2, 2.4, 8.4], cls: "fat" },
  { id: "sri",   n: "Sriracha 15 g",           m: [8, 0, 1.5, 0] },
  /* 10 g soy · 10 g rice wine vinegar · 5 g honey. The honey is 15 of the 24 kcal. */
  { id: "dip",   n: "Soy, vinegar & honey dip", m: [24, 0.8, 5.3, 0] },
  { id: "gyoza", n: "Itsu chicken gyoza, 12",  m: [372, 19.7, 48, 10.6] },
  { id: "coco",  n: "Coconut bean rice 100 g", m: [135, 2.9, 22, 3.5], cls: "unv" },
  { id: "gast",  n: "Gastro chicken ½ bag",    m: [526, 28.5, 38, 28.5], cls: "fat" },
  { id: "pop",   n: "Pop chips, one bag",      m: [100, 2.8, 14, 2.8], cls: "unv" },
  { id: "dom",   n: "Domino's slice",          m: [300, 13.5, 29, 14.5], cls: "fat" },
  /* Greggs Sausage Roll, 103 g. 348 kcal / 10.2 P / 24.1 C / 22.2 F, 10.2 g saturated,
     1.3 g salt. Published June 2026. 2.9 g protein per 100 kcal — the lowest-density
     item on this board bar the dips, and 57% of its calories are fat. Added 13 Aug 2026. */
  { id: "greg",  n: "Greggs sausage roll",     m: [348, 10.2, 24.1, 22.2], cls: "fat" }
];

/* ⚠ FIXED IN THE PORT: the artifact had TWO presets with id "chips" — the gram
   editor and the Pop chips bag. Duplicate ids broke pin, edit and archive for
   both, because every lookup found the first one. Pop chips is now "pop". */

/* Overrides let any item — built-in or custom — be renamed or re-costed without
   losing the original, so a reset is always possible. */
export const PRESETS = () => BASE_PRESETS.concat(S.customs).map(p => {
  const o = S.overrides[p.id];
  return o ? Object.assign({}, p, { n: o.n || p.n, m: o.m || p.m, edited: true }) : p;
});

export function presetLabel(p) {
  if (p.kind === "plate") {
    const tot = Object.keys(BATCH).reduce(
      (a, k) => a + BATCH[k].per[0] * Math.min(S.pState[k], S.fridge[k] ?? 0) / 100, 0);
    return "from the fridge · " + Math.round(tot) + " kcal";
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

/* Macros for a preset at a given multiplier. Used by the composite builder,
   which needs a number for anything selectable — including the editor kinds. */
export function presetMacros(p, mult = 1) {
  if (p.m) return p.m.map(v => v * mult);
  if (p.kind === "gram") {
    const G = GRAM[p.gk], s = S.gState[p.gk], o = [0, 0, 0, 0];
    G.per.forEach((v, i) => o[i] += v * s.g / 100);
    G.oil.forEach((v, i) => o[i] += v * s.oil);
    return o.map(v => v * mult);
  }
  return [0, 0, 0, 0];
}

/* Protein per 100 kcal — the ranking used by the close-the-day options (T11)
   so the leanest route is the default rather than whichever generated first. */
export const density = m => m[0] > 0 ? m[1] / m[0] * 100 : 0;
