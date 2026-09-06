/* editors.js — the in-place editors: Assenheims, meal-prep plate, the gram
   editor, new/edit item, and the composite meal builder.

   ⚠ THE ONE RULE THAT BREAKS THIS FILE IF IGNORED:
   NEVER call a full re-render from an input handler. It rebuilds the DOM and
   drops focus mid-keystroke, so typing "145" lands as "1". Update the live
   nodes instead. Every editor below follows the same shape: build once, then
   mutate a `recalc()` target. */

import { S, el, r1, scale, persist, targets } from "./state.js";
import { BATCH, GRAM, ASSEN } from "./data.js";
import { PRESETS, BASE_PRESETS, presetMacros, presetLabel, displayName } from "./presets.js";
import { oats, oatsTotal, setOatsGrams, resetOats, prepProtein, prepSide, setPrep,
         setSide, resetPrep, PREP_PROTEINS, PREP_SIDES, sumIngredients } from "./recipes.js";
import { totals } from "./engine.js";

let addItem, rerender;
export function wireEditors(fns) { addItem = fns.addItem; rerender = fns.render; }

const mkBtn = (cls, text, fn) => {
  const b = document.createElement("button"); b.className = cls; b.textContent = text;
  b.onclick = fn; return b;
};
const closeEditor = () => { S.editing = null; S.editTarget = null; rerender(); };

export function renderEditor() {
  const host = el("editor"); host.innerHTML = ""; if (!S.editing) return;
  const box = document.createElement("div"); box.className = "ed";

  if (S.editing === "basket")  return basketEditor(host, box);
  if (S.editing === "recipe")  return recipeEditor(host, box);
  if (S.editing === "assen")   assenEditor(box);
  if (S.editing === "plate")   plateEditor(box);
  if (S.editing === "gram")    return gramEditor(host, box);
  if (S.editing === "new")     return newEditor(host, box);
  host.appendChild(box);
}

/* ═══════════ T10 · COMPOSITE MEAL BUILDER ═══════════
   Requested 12 Aug 2026. Select several items at once, adjust each while the
   combined total moves, commit as ONE entry.

   Why this is not just convenience: the per-item loop is the friction the record
   already blames for the eight-week logging gap — "accuracy was never the
   failure; friction was." It also matches how Sam actually eats: a plate, not a
   sequence of ingredients.                                                      */
function basketEditor(host, box) {
  if (!S.basket) S.basket = {};
  const items = PRESETS().filter(p => !S.archived[p.id] && (p.m || p.kind === "gram"));

  box.innerHTML = '<div class="et">Build a plate ' +
    '<span style="font-weight:400;color:var(--dim);font-size:10.5px">' +
    'pick several, adjust, add once</span></div>';

  const list = document.createElement("div"); list.className = "basket-list";
  const tt = document.createElement("div"); tt.className = "tot2";

  function combined() {
    const m = [0, 0, 0, 0];
    Object.keys(S.basket).forEach(id => {
      const p = items.find(x => x.id === id); if (!p) return;
      presetMacros(p, S.basket[id]).forEach((v, i) => m[i] += v);
    });
    return m;
  }
  function recalc() {
    const m = combined(), t = totals(), T = targets();
    const n = Object.keys(S.basket).length;
    tt.innerHTML = n
      ? Math.round(m[0]) + " kcal · " + r1(m[1]) + " g P · " + r1(m[2]) + " g C · " + r1(m[3]) + " g F" +
        '<div style="color:var(--dim);margin-top:4px;font-size:10px;line-height:1.45">' +
        "Takes the day to <b style=\"color:var(--ink)\">" + Math.round(t[0] + m[0]) + " kcal</b> and <b style=\"color:" +
        (t[1] + m[1] >= T.protein ? "var(--good)" : "var(--ink)") + "\">" + Math.round(t[1] + m[1]) +
        " g protein</b> of " + T.protein + ".</div>"
      : '<span style="color:var(--dim)">Nothing picked yet.</span>';
    add.disabled = !n;
    add.textContent = n ? "Add " + n + " item" + (n > 1 ? "s" : "") + " as one entry" : "Add";
  }

  items.forEach(p => {
    const row = document.createElement("div"); row.className = "brow";
    const on = () => S.basket[p.id] != null;

    const tick = document.createElement("button");
    tick.className = "btick"; tick.setAttribute("aria-pressed", String(on()));
    tick.textContent = on() ? "✓" : "";
    const nm = document.createElement("span"); nm.className = "bn"; nm.textContent = p.n;
    const qty = document.createElement("input");
    qty.type = "number"; qty.min = "0"; qty.step = p.kind === "gram" ? "1" : "0.5";
    qty.value = String(S.basket[p.id] ?? 1); qty.className = "bq";
    qty.disabled = !on();
    const unit = document.createElement("span"); unit.className = "bu";
    unit.textContent = p.kind === "gram" ? "× " + S.gState[p.gk].g + GRAM[p.gk].unit.replace("g ", " ") : "×";
    const mm = document.createElement("span"); mm.className = "bm";

    const paint = () => {
      const mult = S.basket[p.id] ?? 0;
      const m = presetMacros(p, mult || 1);
      mm.textContent = Math.round(m[0] * (mult || 1) / (mult || 1)) + " kcal · " + r1(m[1]) + " P";
      tick.textContent = on() ? "✓" : "";
      tick.setAttribute("aria-pressed", String(on()));
      qty.disabled = !on();
      row.classList.toggle("on", on());
    };

    tick.onclick = () => {
      if (on()) delete S.basket[p.id]; else S.basket[p.id] = +qty.value || 1;
      paint(); recalc();
    };
    qty.oninput = () => { if (on()) { S.basket[p.id] = Math.max(0, +qty.value || 0); recalc(); } };
    qty.onblur  = () => { if (on() && !S.basket[p.id]) { delete S.basket[p.id]; paint(); recalc(); } };

    row.append(tick, nm, qty, unit, mm); paint(); list.appendChild(row);
  });

  box.appendChild(list); box.appendChild(tt);

  const acts = document.createElement("div"); acts.className = "acts";
  const add = mkBtn("btn p2", "Add", () => {
    const chosen = Object.keys(S.basket);
    if (!chosen.length) return;
    const m = combined();
    const names = chosen.map(id => {
      const p = items.find(x => x.id === id), q = S.basket[id];
      return p.n + (q === 1 ? "" : " ×" + q);
    });
    const anyUnv = chosen.some(id => { const p = items.find(x => x.id === id);
      return p.cls === "unv" || !!p.custom || (p.kind === "gram" && GRAM[p.gk].unv); });
    const anyFat = chosen.some(id => { const p = items.find(x => x.id === id);
      return p.cls === "fat" || (p.kind === "gram" && GRAM[p.gk].fat); });
    const anyVeg = chosen.some(id => !!items.find(x => x.id === id)?.veg);
    addItem({ n: names.join(" + "), m, u: anyUnv, fat: anyFat, veg: anyVeg, composite: true });
    S.basket = null; S.editing = null; rerender();
  });
  acts.appendChild(add);
  acts.appendChild(mkBtn("btn", "Clear", () => { S.basket = {}; rerender(); }));
  acts.appendChild(mkBtn("btn", "Cancel", () => { S.basket = null; closeEditor(); }));
  box.appendChild(acts);
  recalc();
  host.appendChild(box);
}

/* ═══════════ ASSENHEIMS ═══════════ */
function assenEditor(box) {
  const combo = ASSEN.combos[S.aState.base], step = ASSEN.sizes[S.aState.size];
  const m = combo.m.slice();
  if (step) ASSEN.chick100.forEach((v, i) => m[i] += v * step / 100);
  box.innerHTML = '<div class="et">Assenheims 56</div>';

  const mk = (lab, key, opts) => {
    const r = document.createElement("div"); r.className = "er";
    r.innerHTML = '<label>' + lab + '</label>';
    const o = document.createElement("div"); o.className = "opts";
    opts.forEach(([k, t]) => {
      const b = document.createElement("button"); b.className = "opt"; b.textContent = t;
      b.setAttribute("aria-pressed", String(S.aState[key] === k));
      b.onclick = () => { S.aState[key] = k; renderEditor(); };
      o.appendChild(b);
    });
    r.appendChild(o); box.appendChild(r);
  };
  mk("Chicken", "size", [["sm", "100 g"], ["reg", "200 g"], ["lg", "300 g"]]);
  mk("Bases", "base", [["veg", "Veg"], ["ricesalad", "Rice + salad"], ["vegpot", "Veg + potatoes"],
                       ["riceveg", "Rice + veg"], ["ricepot", "Rice + potatoes"]]);

  const tt = document.createElement("div"); tt.className = "tot2";
  tt.innerHTML = Math.round(m[0]) + " kcal · " + r1(m[1]) + " g P · " + r1(m[2]) + " g C · " + r1(m[3]) + " g F" +
    '<div style="color:var(--dim);margin-top:4px;font-size:10px;line-height:1.45">' +
    (step === 0 ? '✅ Assenheims 56 logged figures, used whole — no derivation.'
                : '✅ Logged figures for 200 g, stepped ' + (step > 0 ? "+" : "") + step + ' g of chicken.') +
    ' Grilled potatoes carry <b style="color:var(--warn)">6 g fat</b> per portion — they are oiled.</div>';
  box.appendChild(tt);

  const acts = document.createElement("div"); acts.className = "acts";
  acts.appendChild(mkBtn("btn p2", "Add", () => {
    addItem({ n: "Assenheims " + ASSEN.sizeLabel[S.aState.size] + " · " + combo.n,
              m, u: step !== 0, veg: S.aState.base !== "ricepot", fat: m[3] > 20 });
    S.editing = null; rerender();
  }));
  acts.appendChild(mkBtn("btn", "Cancel", closeEditor));
  box.appendChild(acts);
}

/* ═══════════ OVERNIGHT OATS — EDIT THE INGREDIENTS, NOT THE MACROS ═══════════
   "I'd rather edit the individual ingredient amounts as opposed to the macros
    themselves because that's easier for me to measure. I weigh out oats. I
    weigh out protein."
   So the inputs are grams of real things and the macros are the OUTPUT. Nobody
   weighs a calorie. Defaults reproduce recipes.md §1 exactly: 650 / 57.5 / 86.5 / 8.8. */
function recipeEditor(host, box) {
  box.innerHTML = '<div class="et">Overnight oats ' +
    '<span style="font-weight:400;color:var(--dim);font-size:10.5px">weigh it, don\'t guess it</span></div>';
  const tt = document.createElement("div"); tt.className = "tot2";

  function recalc() {
    const t = oatsTotal();
    tt.innerHTML = Math.round(t[0]) + " kcal · " + r1(t[1]) + " g P · " + r1(t[2]) + " g C · " + r1(t[3]) + " g F" +
      '<div style="color:var(--dim);margin-top:4px;font-size:10px;line-height:1.45">' +
      'Defaults are recipes.md §1, LOCKED and confirmed 5 Aug 2026 — 650 / 57.5 / 86.5 / 8.8. ' +
      '<b style="color:var(--warn)">⚠ The protein powder is no longer the whey isolate</b> and its ' +
      'macros still are. Read the Bulk pack and correct the row.</div>';
  }

  oats().forEach(ing => {
    const row = document.createElement("div"); row.className = "er";
    const l = document.createElement("label"); l.textContent = ing.n;
    l.style.minWidth = "170px";
    if (ing.unv) l.innerHTML += ' <span style="color:var(--warn)">⚠</span>';
    const inp = document.createElement("input");
    inp.type = "number"; inp.min = "0"; inp.step = String(ing.step); inp.value = String(ing.g);
    inp.oninput = () => { setOatsGrams(ing.id, +inp.value || 0); recalc(); };
    const u = document.createElement("span"); u.className = "bu"; u.textContent = "g";
    const m = document.createElement("span"); m.className = "bm";
    const paint = () => { const g = +inp.value || 0;
      m.textContent = Math.round(ing.per[0] * g / 100) + " kcal · " + r1(ing.per[1] * g / 100) + " P"; };
    inp.addEventListener("input", paint); paint();
    row.append(l, inp, u, m); box.appendChild(row);
  });

  recalc(); box.appendChild(tt);
  const acts = document.createElement("div"); acts.className = "acts";
  acts.appendChild(mkBtn("btn p2", "Add", () => {
    addItem({ n: displayName({ kind: "recipe" }), m: oatsTotal(), u: true, veg: false, fat: false });
    S.editing = null; rerender();
  }));
  acts.appendChild(mkBtn("btn", "Reset to the locked recipe", () => { resetOats(); renderEditor(); }));
  acts.appendChild(mkBtn("btn", "Cancel", closeEditor));
  box.appendChild(acts);
  host.appendChild(box);
}

/* ═══════════ MEAL PREP PLATE — PICK THE PROTEIN, EDIT ITS MACROS ═══════════
   "I want to be able to decide between the protein I've prepped — chicken
    breast, lean steak mince, salmon fillet — and click into those and edit the
    macros for those ones, because when I do my big meal preps, say I cook the
    lean steak mince, I might add ten of red kidney beans, or I might add some
    cabbage, and that slightly adjusts the macros themselves."

   ⚠ NOTE THE DIFFERENCE FROM OATS, IT IS THE WHOLE DESIGN.
   Oats: fixed components, editable GRAMS. Prep: fixed grams-per-portion,
   editable PER-100 g MACROS. Two shapes, because he measures them differently. */
function plateEditor(box) {
  box.innerHTML = '<div class="et">Meal prep plate</div>';

  const pickRow = document.createElement("div"); pickRow.className = "er";
  pickRow.innerHTML = '<label>Protein</label>';
  const opts = document.createElement("div"); opts.className = "opts";
  PREP_PROTEINS.forEach(pr => {
    const b = document.createElement("button"); b.className = "opt"; b.textContent = pr.n;
    b.setAttribute("aria-pressed", String(S.prepPick === pr.id));
    b.onclick = () => { S.prepPick = pr.id; persist(); renderEditor(); };
    opts.appendChild(b);
  });
  pickRow.appendChild(opts); box.appendChild(pickRow);

  const pr = prepProtein(S.prepPick);
  const tt = document.createElement("div"); tt.className = "tot2";

  /* portion */
  const gRow = document.createElement("div"); gRow.className = "er";
  gRow.innerHTML = '<label>Portion</label>';
  const gInp = document.createElement("input");
  gInp.type = "number"; gInp.min = "0"; gInp.step = "10"; gInp.value = String(pr.g);
  const gU = document.createElement("span"); gU.className = "bu"; gU.textContent = "g cooked";
  gRow.append(gInp, gU); box.appendChild(gRow);

  /* editable per-100 g macros */
  const mRow = document.createElement("div"); mRow.className = "er";
  mRow.innerHTML = '<label>Per 100 g</label>';
  const mIn = [];
  ["kcal", "P", "C", "F"].forEach((ph, i) => {
    const x = document.createElement("input");
    x.type = "number"; x.min = "0"; x.step = "0.1"; x.placeholder = ph;
    x.style.width = "58px"; x.value = String(pr.per[i]);
    mIn.push(x); mRow.appendChild(x);
  });
  box.appendChild(mRow);

  const sideRows = [];
  PREP_SIDES.forEach(sd => {
    const cur = prepSide(sd.id);
    const row = document.createElement("div"); row.className = "er";
    const l = document.createElement("label"); l.textContent = cur.n;
    const inp = document.createElement("input");
    inp.type = "number"; inp.min = "0"; inp.step = "10"; inp.value = String(cur.g);
    const u = document.createElement("span"); u.className = "bu"; u.textContent = "g";
    row.append(l, inp, u); box.appendChild(row);
    sideRows.push({ sd, inp });
  });

  function current() {
    const per = mIn.map(x => +x.value || 0);
    const g = +gInp.value || 0;
    const m = per.map(v => v * g / 100);
    sideRows.forEach(({ sd, inp }) => {
      const sg = +inp.value || 0;
      prepSide(sd.id).per.forEach((v, i) => m[i] += v * sg / 100);
    });
    return { per, g, m };
  }
  function recalc() {
    const { m } = current();
    tt.innerHTML = Math.round(m[0]) + " kcal · " + r1(m[1]) + " g P · " + r1(m[2]) + " g C · " + r1(m[3]) + " g F" +
      '<div style="color:var(--dim);margin-top:4px;font-size:10px;line-height:1.45">' + pr.note + '</div>';
  }
  [gInp, ...mIn, ...sideRows.map(r => r.inp)].forEach(x => x.addEventListener("input", recalc));
  recalc(); box.appendChild(tt);

  const acts = document.createElement("div"); acts.className = "acts";
  acts.appendChild(mkBtn("btn p2", "Add plate", () => {
    const { per, g, m } = current();
    setPrep(S.prepPick, { per, g });
    sideRows.forEach(({ sd, inp }) => setSide(sd.id, { g: +inp.value || 0 }));
    const names = [pr.n + " " + g + " g"]
      .concat(sideRows.filter(r => +r.inp.value > 0).map(r => r.sd.n + " " + r.inp.value + " g"));
    addItem({ n: names.join(" + "), m, u: true,
              veg: sideRows.some(r => r.sd.veg && +r.inp.value > 0), fat: m[3] > 20 });
    S.editing = null; rerender();
  }));
  acts.appendChild(mkBtn("btn", "Save macros only", () => {
    const { per, g } = current(); setPrep(S.prepPick, { per, g }); renderEditor();
  }));
  acts.appendChild(mkBtn("btn", "Reset " + pr.n.toLowerCase(), () => { resetPrep(S.prepPick); renderEditor(); }));
  acts.appendChild(mkBtn("btn", "Cancel", closeEditor));
  box.appendChild(acts);
}

/* ═══════════ GRAM EDITOR ═══════════ */
function gramEditor(host, box) {
  const G = GRAM[S.gTarget], s = S.gState[S.gTarget];
  box.innerHTML = '<div class="et">' + G.n + '</div>';
  const tt = document.createElement("div"); tt.className = "tot2";
  const calc = () => {
    const o = [0, 0, 0, 0];
    G.per.forEach((v, i) => o[i] += v * s.g / 100);
    G.oil.forEach((v, i) => o[i] += v * s.oil);
    return o;
  };
  function recalc() {
    const o = calc(), cost = s.g * G.pG + s.oil * G.pO;
    tt.innerHTML = Math.round(o[0]) + " kcal · " + r1(o[1]) + " g P · " + r1(o[2]) + " g C · " + r1(o[3]) + " g F" +
      '<div style="color:var(--dim);margin-top:4px;font-size:10px;line-height:1.45">' +
      'Costs <b style="color:var(--ink)">£' + cost.toFixed(2) + '</b> — Tesco, 11 Aug 2026. ' +
      (G.hint ? G.hint(o, s) : '') + '</div>';
  }
  G.rows.forEach(([lab, key, unit, step, max]) => {
    const row = document.createElement("div"); row.className = "er";
    const l = document.createElement("label"); l.textContent = lab;
    const inp = document.createElement("input");
    inp.type = "number"; inp.min = "0"; inp.step = String(step); inp.max = String(max);
    inp.value = String(s[key]);
    inp.oninput = () => { s[key] = Math.max(0, +inp.value || 0); recalc(); };
    inp.onblur  = () => { s[key] = Math.max(0, Math.min(+inp.value || 0, max));
                          inp.value = String(s[key]); recalc(); };
    const u = document.createElement("span"); u.className = "bu"; u.textContent = unit;
    row.append(l, inp, u); box.appendChild(row);
  });
  recalc(); box.appendChild(tt);

  const acts = document.createElement("div"); acts.className = "acts";
  acts.appendChild(mkBtn("btn p2", "Add", () => {
    const o = calc();
    if (o[0] <= 0) { S.editing = null; rerender(); return; }
    addItem({ n: G.n + " " + s.g + " " + G.unit + (G.oil[0] && s.oil ? " + " + s.oil + " ml oil" : ""),
              m: o, u: !!G.unv, veg: false, fat: !!G.fat || o[3] > 20 });
    S.editing = null; persist(); rerender();
  }));
  acts.appendChild(mkBtn("btn", "Reset to " + G.dflt + " g", () => {
    s.g = G.dflt; s.oil = G.oilDflt; persist(); renderEditor();
  }));
  acts.appendChild(mkBtn("btn", "Cancel", closeEditor));
  box.appendChild(acts);

  const nt = document.createElement("div"); nt.className = "enote"; nt.textContent = G.note;
  box.appendChild(nt); host.appendChild(box);
}

/* ═══════════ NEW / EDIT ITEM ═══════════ */
function newEditor(host, box) {
  const target = S.editTarget ? PRESETS().find(p => p.id === S.editTarget) : null;
  const base = S.editTarget ? BASE_PRESETS.concat(S.customs).find(p => p.id === S.editTarget) : null;
  box.innerHTML = '<div class="et">' + (target ? "Edit — " + base.n : "New item") + '</div>';
  const f = {};

  const nameRow = document.createElement("div"); nameRow.className = "er";
  nameRow.innerHTML = '<label>Name</label>';
  f.name = document.createElement("input"); f.name.type = "text";
  f.name.placeholder = "e.g. Chorizo & bean stew, per 100 g";
  if (target) f.name.value = target.n;
  nameRow.appendChild(f.name); box.appendChild(nameRow);

  const mrow = document.createElement("div"); mrow.className = "er";
  mrow.innerHTML = '<label>Macros</label>';
  [["k", "kcal", 0], ["p", "P", 1], ["c", "C", 2], ["ft", "F", 3]].forEach(([key, ph, idx]) => {
    const i = document.createElement("input");
    i.type = "number"; i.min = "0"; i.placeholder = ph; i.style.width = "58px";
    if (target && target.m) i.value = String(target.m[idx]);
    f[key] = i; mrow.appendChild(i);
  });
  box.appendChild(mrow);

  const acts = document.createElement("div"); acts.className = "acts";
  const save = mkBtn("btn p2", target ? "Save changes" : "Save to list", () => {
    const n = f.name.value.trim(); if (!n) { f.name.focus(); return; }
    const m = [+f.k.value || 0, +f.p.value || 0, +f.c.value || 0, +f.ft.value || 0];
    if (!m[0] && !m[1]) {
      save.textContent = "Needs kcal and protein";
      setTimeout(() => save.textContent = target ? "Save changes" : "Save to list", 2200);
      return;
    }
    if (target) {
      const c = S.customs.find(x => x.id === S.editTarget);
      if (c) { c.n = n; c.m = m; }                    // custom items edit in place
      else S.overrides[S.editTarget] = { n, m };      // built-ins get an override layer
    } else {
      S.customs.push({ id: "cu" + Date.now(), n, m, custom: true, cls: "unv" });
    }
    S.editTarget = null; S.editing = null; persist(); rerender();
  });
  acts.appendChild(save);
  if (target && S.overrides[S.editTarget]) {
    acts.appendChild(mkBtn("btn", "Reset to original", () => {
      delete S.overrides[S.editTarget]; S.editTarget = null; S.editing = null; persist(); rerender();
    }));
  }
  acts.appendChild(mkBtn("btn", "Cancel", closeEditor));
  box.appendChild(acts); host.appendChild(box); f.name.focus();
}

/* Shared with render.js — logging a batch decrements the fridge. */
export function addBatchItem(k, g) {
  g = Math.min(g, S.fridge[k] ?? 0); if (g <= 0) return;
  const B = BATCH[k];
  addItem({ n: B.n + " " + g + " g", m: scale(B.per, g), u: !!B.unv, veg: !!B.veg, batch: k, g });
  S.fridge[k] = Math.round((S.fridge[k] - g) * 10) / 10;
}
