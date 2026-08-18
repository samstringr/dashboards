/* state.js — mutable app state and its persistence.
   Split out so every other module imports state instead of declaring its own.
   The original kept all of this at the top of a 1,339-line file; the problem
   wasn't tidiness, it was that any edit re-read the whole thing. */

import * as T from "../../shared/targets.js";

export const ISO = () => new Date().toLocaleDateString("en-CA");

/* ── Thresholds that are NOT calorie targets. Targets live in targets.js. ──
   FLOOR/CEIL are the protein band; the rest are the fat and under-eating
   watch lines. None of them are derived from bodyweight, so they belong here. */
export const FAT_WARN = 65, FAT_BAD = 80, UNDER = 300;

/* Day type no longer changes the calorie target — 14 Aug 2026 cut the diet to
   one flat number. It is KEPT because the CSV's day_type column needs it, and
   because the old two-way toggle wrote an empty day_type for training days,
   which is indistinguishable from "not recorded". Three buttons, no guess. */
export const DAYS = {
  rest:     { label: "Rest",     csv: "Rest" },
  gym:      { label: "Gym",      csv: "Gym" },
  football: { label: "Football", csv: "Football" }
};

/* localStorage keys. `diet7-` prefix: bumped from diet6 at the GitHub port so a
   stale pre-port draft cannot be read back by the new code. */
const K = {
  draft: () => "diet7-" + ISO(),
  fridge: "diet7-fridge", pins: "diet7-pins", customs: "diet7-customs",
  overrides: "diet7-overrides", archived: "diet7-archived", gram: "diet7-gram",
  repo: "diet7-repo", recipes: "diet7-recipes", uses: "diet7-uses", goal: "diet7-goal"
};

export const S = {
  day: "rest",
  log: [],
  fridge: null,
  pins: null,
  customs: [],
  overrides: {},
  archived: {},
  gState: {},
  pState: { mince: 320, potato: 150, veg: 150 },
  aState: { size: "reg", base: "veg" },

  editing: null, editTarget: null, gTarget: null,
  justAdded: -1, openMore: false, openArch: false, series: "both",

  /* Composite meal builder (T10) — a basket of {presetId, grams|multiplier} */
  basket: null,

  /* Recipe edits: ingredient grams for oats, per-100 g macros for prep proteins.
     Everything shipped is a DEFAULT; what Sam edits lives here and wins. */
  recipeOverrides: {},

  /* Frecency: {id: {n, last, score}}. Drives preset order — see recipes.js. */
  uses: {},

  /* The goal pane's editable state. Weight is written to the CSV, not held here
     — a weight in localStorage is a second home for a fact that already has one. */
  goal: null,

  /* Which prep protein is selected in the meal-prep plate. */
  prepPick: "mince",

  /* Voice assistant transcript and what it resolved to. */
  heard: null,

  /* ── The file wins ──────────────────────────────────────────────────────
     Populated from health-daily-log.csv on load. If the CSV already contains
     today, the day has been closed and written: the Today card renders from
     the FILE and the local draft is discarded, never merged.

     This precedence rule is not a preference. On 10 Aug 2026 the artifact kept
     a local draft while three corrections went to the CSV, and both copies then
     claimed to be today. Merging is how two copies drift. */
  history: [],          // rows from the CSV, ascending by date
  fileToday: null,
  closed: false,

  /* Weight resolved from the CSV, or the documented fallback. See targets.js. */
  weight: null,
  online: navigator.onLine,
  syncState: "idle"     // idle | reading | writing | queued | error
};

/* Targets are DERIVED, never typed. Recomputed whenever weight changes. */
export function targets() {
  return T.today(S.weight?.kg ?? T.FALLBACK_WEIGHT_KG);
}

export const el = id => document.getElementById(id);
export const r1 = v => Math.round(v * 10) / 10;
export const scale = (per, g) => per.map(v => v * g / 100);

const read = (key, dflt) => {
  try { const v = JSON.parse(localStorage.getItem(key) || "null"); return v ?? dflt; }
  catch { return dflt; }
};

export function loadLocal(BATCH, GRAM) {
  const d = read(K.draft(), null);
  if (d) { S.day = d.day || "rest"; S.log = d.log || []; }

  S.fridge = read(K.fridge, null);
  if (!S.fridge) { S.fridge = {}; Object.keys(BATCH).forEach(k => S.fridge[k] = BATCH[k].init); }

  S.pins = read(K.pins, null) || { oats: 1, plate: 1, assen: 1, ban: 1, whey: 1 };
  S.customs = read(K.customs, []);
  S.overrides = read(K.overrides, {});
  S.archived = read(K.archived, {});

  /* "Set your own amount" is worthless if it resets — remember the last grams. */
  Object.keys(GRAM).forEach(k => S.gState[k] = { g: GRAM[k].dflt, oil: GRAM[k].oilDflt });
  const g = read(K.gram, null);
  if (g) Object.keys(S.gState).forEach(k => { if (g[k] && typeof g[k].g === "number") S.gState[k] = g[k]; });

  S.recipeOverrides = read(K.recipes, {});
  S.uses = read(K.uses, {});
  S.goal = read(K.goal, null);
}

export function persist() {
  try {
    localStorage.setItem(K.draft(), JSON.stringify({ day: S.day, log: S.log }));
    localStorage.setItem(K.fridge, JSON.stringify(S.fridge));
    localStorage.setItem(K.pins, JSON.stringify(S.pins));
    localStorage.setItem(K.customs, JSON.stringify(S.customs));
    localStorage.setItem(K.overrides, JSON.stringify(S.overrides));
    localStorage.setItem(K.archived, JSON.stringify(S.archived));
    localStorage.setItem(K.gram, JSON.stringify(S.gState));
    localStorage.setItem(K.recipes, JSON.stringify(S.recipeOverrides));
    localStorage.setItem(K.uses, JSON.stringify(S.uses));
    if (S.goal) localStorage.setItem(K.goal, JSON.stringify(S.goal));
  } catch { /* private browsing, quota — never let persistence kill a render */ }
}

export function clearDraft() { try { localStorage.removeItem(K.draft()); } catch {} }

/* Repo config — which GitHub repo holds the CSV. Set in the settings pane. */
export const repoConfig = {
  get()  { return read(K.repo, { owner: "", repo: "", path: "data/health-daily-log.csv", branch: "main" }); },
  set(c) { localStorage.setItem(K.repo, JSON.stringify(c)); },
  ok()   { const c = repoConfig.get(); return !!(c.owner && c.repo); }
};
