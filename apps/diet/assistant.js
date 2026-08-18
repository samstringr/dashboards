/* assistant.js — talk to the app.

   Sam, 17 Aug 2026: "a chat menu where I can type to Claude and it listens, the
   same way I'm using this mic… I can rattle off what I ate today, and it adds
   anything that's already an option… and any new items not in the list, it will
   add them, look up using data available online what the macros should be."

   🚩 WHAT THIS DOES AND DOES NOT NEED A CREDENTIAL FOR.
   A static site cannot call Claude without an API key, and a key in browser
   storage is a second secret sitting next to the GitHub one. So this is built in
   three layers, and only the layer that genuinely needs judgement is missing:

     1. SPEECH → TEXT.  Web Speech API. Native, free, no key, works on iOS Safari.
     2. TEXT → ITEMS.   A matcher over Sam's own ~25 items with quantity parsing.
                        No model involved. Works offline. Deterministic, which
                        matters — a logging tool that occasionally invents a
                        number is worse than no logging tool.
     3. UNKNOWN → MACROS.  Open Food Facts. Public API, no key, no account,
                        good UK supermarket coverage. This is recipes.md's own
                        rule enforced in code: "branded and chain food gets
                        looked up online as the golden source, not estimated."

   What is NOT here: costing a recipe from raw ingredients, deciding cooked
   yields, judging whether a figure is trustworthy. That needs a model and it
   stays in chat with Claude. ⚠ Everything OFF returns is flagged `unv` and
   carries its source, because a crowd-sourced panel is not a read pack. */

import { S, r1 } from "./state.js";
import { PRESETS, presetMacros, displayName } from "./presets.js";

/* ── SPEECH ───────────────────────────────────────────────────────────────── */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
export const speechAvailable = () => !!SR;

let rec = null;
export function listen({ onPartial, onFinal, onEnd }) {
  if (!SR) return null;
  rec = new SR();
  rec.lang = "en-GB";
  rec.interimResults = true;
  rec.continuous = true;
  let finalText = "";
  rec.onresult = e => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) finalText += t; else interim += t;
    }
    onPartial?.((finalText + " " + interim).trim());
  };
  rec.onerror = () => onEnd?.();
  rec.onend = () => { onFinal?.(finalText.trim()); onEnd?.(); };
  rec.start();
  return rec;
}
export function stopListening() { try { rec?.stop(); } catch {} rec = null; }

/* ── NUMBER WORDS ─────────────────────────────────────────────────────────── */
const WORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
                seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
                half: 0.5, couple: 2 };

/* ── PARSE ────────────────────────────────────────────────────────────────
   Split on connectors, then for each fragment pull out a quantity and match the
   rest against the board. Deliberately conservative: anything it is not sure
   about comes back as `unmatched` for Sam to resolve, never as a guess. */

export function parse(text) {
  const frags = String(text).toLowerCase()
    .replace(/\band\b|\bthen\b|\bplus\b|\bwith\b/g, ",")
    .split(/[,;.]+/).map(s => s.trim()).filter(Boolean);

  const items = PRESETS().filter(p => !S.archived[p.id]);
  const out = [];

  for (const frag of frags) {
    /* grams first — "200g mince", "200 grams of mince" */
    const gm = frag.match(/(\d+(?:\.\d+)?)\s*(?:g|gram|grams|grammes)\b/);
    const grams = gm ? parseFloat(gm[1]) : null;

    /* then a count — "2 bananas", "twelve gyoza", "a banana" */
    let count = null;
    const cm = frag.match(/^\s*(\d+(?:\.\d+)?)\s+/);
    if (cm && !gm) count = parseFloat(cm[1]);
    if (count == null) {
      const w = frag.match(/^\s*(a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|half|couple)\b/);
      if (w) count = WORDS[w[1]];
    }

    const cleaned = frag
      .replace(/\d+(?:\.\d+)?\s*(?:g|gram|grams|grammes)\b/g, " ")
      .replace(/^\s*\d+(?:\.\d+)?\s+/, " ")
      .replace(/\b(a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|half|couple|of|some|my|the|had|ate|i)\b/g, " ")
      .replace(/\s+/g, " ").trim();
    if (!cleaned) continue;

    const hit = bestMatch(cleaned, items);
    if (hit) out.push({ frag, preset: hit.p, score: hit.score, grams, count: count ?? 1 });
    else out.push({ frag, query: cleaned, unmatched: true, grams, count: count ?? 1 });
  }
  return out;
}

/* Token-overlap scoring. Beats substring matching for "steak mince" vs "Lean
   steak mince prep", and beats Levenshtein for speech, where whole words are
   usually right and word ORDER usually is not. */
function bestMatch(q, items) {
  const qt = tokens(q);
  if (!qt.length) return null;
  let best = null;
  for (const p of items) {
    const nt = tokens(displayName(p) + " " + p.n);
    let hits = 0;
    for (const t of qt) if (nt.some(n => n === t || n.startsWith(t) || t.startsWith(n))) hits++;
    const score = hits / qt.length;
    if (score >= 0.6 && (!best || score > best.score)) best = { p, score };
  }
  return best;
}

const STOP = new Set(["prep", "g", "the", "and", "of", "with"]);
const tokens = s => String(s).toLowerCase().replace(/[^a-z0-9 ]/g, " ")
  .split(/\s+/).filter(t => t.length > 2 && !STOP.has(t));

/* ── RESOLVE a parsed line into something loggable ────────────────────────── */
export function resolve(p) {
  const per = presetMacros(p.preset, 1);
  const mult = p.grams && p.preset.kind === "gram" ? null : p.count;
  return {
    name: displayName(p.preset) + (p.count > 1 ? " ×" + p.count : ""),
    macros: per.map(v => v * (mult ?? 1)),
    preset: p.preset, count: p.count, grams: p.grams
  };
}

/* ── OPEN FOOD FACTS ──────────────────────────────────────────────────────
   No key, no account. UK-weighted search. Returns per-100 g macros plus the
   product's own name and brand, so the row can say where the number came from.
   ⚠ Crowd-sourced. Everything from here is flagged as an estimate. */

const OFF = "https://world.openfoodfacts.org";

export async function lookup(query) {
  const url = OFF + "/cgi/search.pl?" + new URLSearchParams({
    search_terms: query, search_simple: 1, action: "process", json: 1,
    page_size: 12, countries_tags_en: "United Kingdom",
    fields: "product_name,brands,nutriments,quantity,code,countries_tags_en"
  });
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error("Open Food Facts " + r.status);
  const j = await r.json();

  return (j.products || [])
    .map(p => {
      const n = p.nutriments || {};
      const kcal = n["energy-kcal_100g"] ?? (n.energy_100g ? n.energy_100g / 4.184 : null);
      if (kcal == null || !p.product_name) return null;
      return {
        name: [p.brands?.split(",")[0], p.product_name].filter(Boolean).join(" ").trim(),
        per: [r1(kcal), r1(n.proteins_100g ?? 0), r1(n.carbohydrates_100g ?? 0), r1(n.fat_100g ?? 0)],
        size: p.quantity || null, code: p.code,
        source: "Open Food Facts" + (p.code ? " · " + p.code : "")
      };
    })
    .filter(Boolean)
    /* Prefer entries with a full panel — a product with only calories is noise. */
    .sort((a, b) => (b.per[1] > 0 ? 1 : 0) - (a.per[1] > 0 ? 1 : 0))
    .slice(0, 6);
}
