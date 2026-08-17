/* render.js — everything that draws. Reads state, writes DOM, returns nothing. */

import { S, el, r1, persist, targets, DAYS, FAT_WARN, FAT_BAD, UNDER } from "./state.js";
import { BATCH, GRAM } from "./data.js";
import { PRESETS, presetLabel } from "./presets.js";
import { totals, flags, closeOptions, hasDay, fileItems } from "./engine.js";
import { renderEditor, addBatchItem } from "./editors.js";
import * as TG from "../../shared/targets.js";

let onChange;
export function wireRender(fns) { onChange = fns.render; }

/* ── item logging ─────────────────────────────────────────────────────────── */
export function addItem(rec) { S.log.push(rec); S.justAdded = S.log.length - 1; }

export function addPreset(p) {
  if (p.kind) { S.editing = p.kind; if (p.gk) S.gTarget = p.gk; onChange(); return; }
  if (p.batch) { addBatchItem(p.batch, p.g); onChange(); return; }
  addItem({ n: p.n, m: p.m.slice(), u: p.cls === "unv" || !!p.custom, veg: !!p.veg, fat: p.cls === "fat" });
  onChange();
}

export function renderFlagsInto(host, arr) {
  host.innerHTML = "";
  arr.forEach(([lv, txt]) => {
    const d = document.createElement("div"); d.className = "fli " + lv;
    d.innerHTML = "<span>" + (lv === "good" ? "✓" : lv === "info" ? "•" : "▲") + "</span><span>" + txt + "</span>";
    host.appendChild(d);
  });
}

/* ── the goal strip ───────────────────────────────────────────────────────
   Why this exists: the targets were being hit without anyone being able to say
   what they were FOR. A calorie number with no goal behind it is the same
   failure as a figure with no date — it survives long after the thing that
   justified it has changed. One line, always on screen, carrying its own
   uncertainty. Now shows the DERIVATION, because Sam wants to re-derive rather
   than trust.                                                                  */
function renderGoal() {
  const host = el("goal"); if (!host) return;
  const t = totals(), T = targets();
  const left = Math.round(T.kcal - t[0]), pLeft = Math.round(T.protein - t[1]);
  const w = S.weight;

  host.innerHTML =
    '<span class="tag">🎯 ' + TG.PROFILE.goal_weight_kg + ' kg lean</span>' +
    '<span>at ' + TG.PROFILE.goal_bf_lo + '–' + TG.PROFILE.goal_bf_hi + '% body fat · FFMI ' +
      TG.PROFILE.goal_ffmi + ' · ~2-year arc to ' + TG.PROFILE.goal_horizon + '</span>' +
    '<span class="sep">│</span>' +
    (w && !w.fallback
      ? '<span><b>' + w.kg + ' kg</b> <span style="color:var(--dim)">' + w.date + '</span></span>'
      : '<span class="warn">⚠ weight not in the log</span><span>using the 14 Aug fasted estimate, ' +
        TG.FALLBACK_WEIGHT_KG + ' kg</span>') +
    '<span class="sep">│</span>' +
    '<span title="' + T.derivation + '"><b>' + T.kcal.toLocaleString() + '</b> kcal · <b>' +
      T.protein + '</b> g floor <span style="color:var(--dim)">(BMR ' + T.bmr + ' × ' + T.multiplier + ')</span>' +
    (hasDay()
      ? ' · <b' + (left < 0 ? ' class="warn"' : '') + '>' +
        (left >= 0 ? left + ' kcal' : Math.abs(left) + ' kcal over') + '</b>' +
        ' and <b' + (pLeft > 0 ? ' class="warn"' : '') + '>' +
        (pLeft > 0 ? pLeft + ' g protein' : 'floor cleared') + '</b> left'
      : '') + '</span>';
}

/* ── close-the-day: SEVERAL routes, ranked leanest first (T11) ─────────────── */
function renderRec() {
  const res = closeOptions(), b = el("rec-body"); b.innerHTML = "";
  el("rec-why").innerHTML = res.why;

  if (!res.options.length) {
    b.innerHTML = '<div class="recempty">' +
      (S.log.length || S.closed ? "Nothing more needed." : "Log breakfast and this fills in.") + '</div>';
    return;
  }

  res.options.forEach((o, i) => {
    const card = document.createElement("div");
    card.className = "opt-card" + (i === 0 ? " lead" : "");
    const head = document.createElement("div"); head.className = "oh";
    head.innerHTML = (i === 0 ? '<span class="lean">leanest</span>' : "") +
      '<span class="od">' + r1(o.density) + ' g P / 100 kcal</span>';
    card.appendChild(head);

    o.lines.forEach(l => {
      const d = document.createElement("div"); d.className = "line";
      const g = document.createElement("span"); g.className = "g"; g.textContent = l.g;
      const n = document.createElement("div"); n.className = "nm";
      n.innerHTML = l.n + '<div class="sub">' + l.sub + '</div>';
      d.append(g, n); card.appendChild(d);
    });

    const why = document.createElement("div"); why.className = "owhy"; why.innerHTML = o.why;
    card.appendChild(why);

    const go = document.createElement("button"); go.className = "btn p2 osel"; go.textContent = "Log this";
    go.onclick = () => {
      if (o.kind === "fridge") Object.keys(o.plate).forEach(k => addBatchItem(k, o.plate[k]));
      else {
        const p = PRESETS().find(x => x.id === o.id);
        for (let i = 0; i < o.n; i++) addPreset(p);
      }
      onChange();
    };
    card.appendChild(go);
    b.appendChild(card);
  });
}

/* ── preset column ────────────────────────────────────────────────────────── */
function presetRow(p, mode) {
  const b = document.createElement("button");
  b.className = "p" + (p.cls ? " " + p.cls : "") + (mode === "pinned" ? " pinned" : "") +
    (mode === "arch" ? " archrow" : "") + (p.batch && (S.fridge[p.batch] ?? 0) <= 0 ? " gone" : "");
  const t = document.createElement("span"); t.textContent = p.n + (p.edited ? " ·" : "");
  const m = document.createElement("span"); m.className = "pm"; m.textContent = presetLabel(p);
  b.append(t, m);
  b.onclick = e => { if (e.target.closest(".ctl")) return; if (mode === "arch") return; addPreset(p); };

  const ctl = document.createElement("div"); ctl.className = "ctl";
  const mk = (txt, title, cls, fn) => {
    const x = document.createElement("button");
    x.textContent = txt; x.title = title; if (cls) x.className = cls;
    x.onclick = e => { e.stopPropagation(); fn(); };
    ctl.appendChild(x);
  };
  if (mode === "arch") {
    mk("↺", "Restore to the list", "", () => { delete S.archived[p.id]; persist(); onChange(); });
  } else {
    if (p.kind) mk("⋯", "Open the editor", "", () => { S.editing = p.kind; if (p.gk) S.gTarget = p.gk; onChange(); });
    else        mk("✎", "Edit name and macros", "", () => { S.editTarget = p.id; S.editing = "new"; onChange(); });
    mk("●", S.pins[p.id] ? "Unpin" : "Pin to the top", S.pins[p.id] ? "on" : "",
       () => { S.pins[p.id] ? delete S.pins[p.id] : S.pins[p.id] = 1; persist(); onChange(); });
    mk("⌫", "Archive — hidden, not deleted", "arch",
       () => { S.archived[p.id] = 1; delete S.pins[p.id]; persist(); onChange(); });
  }
  b.appendChild(ctl);
  return b;
}

function expander(label, count, open, fn) {
  const b = document.createElement("button"); b.className = "expand";
  b.setAttribute("aria-expanded", String(open));
  b.innerHTML = '<span class="car">▶</span><span>' + label + '</span><span class="cnt">' + count + '</span>';
  b.onclick = fn; return b;
}

function renderPresets() {
  const host = el("presets"); host.innerHTML = "";
  const all = PRESETS();
  const live = all.filter(p => !S.archived[p.id]);
  const pinned = live.filter(p => S.pins[p.id]);
  const rest = live.filter(p => !S.pins[p.id]);
  const arch = all.filter(p => S.archived[p.id]);

  /* T10 entry point sits above everything — it is the fast path, not a feature. */
  const bb = document.createElement("button"); bb.className = "addnew build";
  bb.innerHTML = '<span>▣</span><span>Build a plate</span>' +
    '<span class="cnt">several at once</span>';
  bb.onclick = () => { S.editing = "basket"; onChange(); };
  host.appendChild(bb);

  pinned.forEach(p => host.appendChild(presetRow(p, "pinned")));
  if (!pinned.length) {
    const d = document.createElement("div"); d.className = "hintline";
    d.textContent = "Nothing pinned. Open the list below and pin what you eat often.";
    host.appendChild(d);
  }

  host.appendChild(expander("Everything else", rest.length, S.openMore, () => { S.openMore = !S.openMore; onChange(); }));
  if (S.openMore) {
    const w = document.createElement("div"); w.className = "sub-list";
    rest.forEach(p => w.appendChild(presetRow(p, "rest")));
    host.appendChild(w);
  }
  if (arch.length) {
    host.appendChild(expander("Archived", arch.length, S.openArch, () => { S.openArch = !S.openArch; onChange(); }));
    if (S.openArch) {
      const w = document.createElement("div"); w.className = "sub-list";
      arch.forEach(p => w.appendChild(presetRow(p, "arch")));
      host.appendChild(w);
    }
  }

  const nb = document.createElement("button"); nb.className = "addnew";
  nb.innerHTML = '<span>＋</span><span>New item or recipe</span>';
  nb.onclick = () => { S.editTarget = null; S.editing = "new"; onChange(); };
  host.appendChild(nb);

  const hint = document.createElement("div"); hint.className = "hintline";
  hint.innerHTML = "✎ edit · ● pin · ⌫ archive. Edits are yours and reversible; <b>·</b> marks a changed item.";
  host.appendChild(hint);
  el("pin-n").textContent = pinned.length + " pinned · " + live.length + " items";
}

/* ── fridge ───────────────────────────────────────────────────────────────── */
function renderFridge() {
  const host = el("fridge"); host.innerHTML = "";
  Object.keys(BATCH).forEach(k => {
    if (S.fridge[k] === null) return;
    const B = BATCH[k], rem = S.fridge[k], pct = Math.max(0, Math.min(100, rem / B.init * 100));
    const size = k === "mince" ? 320 : 150, portions = rem > 0 ? Math.floor(rem / size) : 0;
    const row = document.createElement("div"); row.className = "fr";
    const ft = document.createElement("div"); ft.className = "ft";
    ft.innerHTML = '<div class="fn">' + B.n + '</div><div class="fd">' + Math.round(rem) + ' g of ' + B.init +
      ' · ' + B.per[0] + ' kcal / ' + B.per[1] + ' P per 100 g' +
      (portions ? ' · ~' + portions + ' portions' : ' · empty') +
      '</div><div class="fb"><i style="width:' + pct + '%" class="' + (pct < 25 ? "low" : "") + '"></i></div>';
    const btn = document.createElement("button"); btn.className = "mini"; btn.textContent = "Restock";
    btn.onclick = () => {
      const v = prompt("Cooked weight in the fridge, grams:", String(B.init));
      if (v !== null && !isNaN(+v)) { S.fridge[k] = Math.max(0, +v); onChange(); }
    };
    const del = document.createElement("button"); del.className = "mini del"; del.textContent = "×";
    del.title = "Remove from the fridge — binned, eaten elsewhere, gone off";
    del.onclick = () => { if (confirm("Remove " + B.n + " from the fridge?\n\nIt comes back with Restock."))
      { S.fridge[k] = null; onChange(); } };
    row.append(ft, btn, del); host.appendChild(row);
  });
  const gone = Object.keys(BATCH).filter(k => S.fridge[k] === null);
  if (gone.length) {
    const b = document.createElement("button"); b.className = "addnew";
    b.textContent = "Restore " + gone.length + " removed item" + (gone.length > 1 ? "s" : "");
    b.onclick = () => { gone.forEach(k => S.fridge[k] = 0); onChange(); };
    host.appendChild(b);
  }
}

/* ── main render ──────────────────────────────────────────────────────────── */
export function render() {
  const t = totals(), T = targets();
  const tb = el("rows"); tb.innerHTML = "";

  if (S.closed) {
    /* Read-only view of the written day. The file wins — this is rendered from
       the CSV row, never from a local draft. */
    el("empty").style.display = "none";
    fileItems().forEach(nm => {
      const tr = document.createElement("tr");
      const td = document.createElement("td"); td.textContent = nm; tr.appendChild(td);
      for (let j = 0; j < 4; j++) {
        const d = document.createElement("td"); d.textContent = "—"; d.className = "dimcell"; tr.appendChild(d);
      }
      tr.appendChild(document.createElement("td")); tb.appendChild(tr);
    });
    const tr = document.createElement("tr"); tr.className = "tot";
    ["Total", Math.round(t[0]), r1(t[1]), Math.round(t[2]), r1(t[3]), ""].forEach(v => {
      const td = document.createElement("td"); td.textContent = v; tr.appendChild(td);
    });
    tb.appendChild(tr);
  } else {
    el("empty").style.display = S.log.length ? "none" : "block";
    el("empty").innerHTML = "Nothing logged today.<br><span class='dimcell'>Tap a preset to start.</span>";
    S.log.forEach((r, i) => {
      const tr = document.createElement("tr");
      if (i === S.justAdded) tr.className = "new";
      [r.n, Math.round(r.m[0]), r.m[1], r.m[2], r.m[3]].forEach((v, j) => {
        const td = document.createElement("td"); td.textContent = j === 0 ? v : r1(v); tr.appendChild(td);
      });
      const td = document.createElement("td");
      const x = document.createElement("button"); x.className = "x"; x.textContent = "×"; x.title = "Remove";
      x.onclick = () => {
        const rm = S.log.splice(i, 1)[0];
        if (rm.batch && S.fridge[rm.batch] !== null) S.fridge[rm.batch] += rm.g;
        S.justAdded = -1; onChange();
      };
      td.appendChild(x); tr.appendChild(td); tb.appendChild(tr);
    });
  }
  S.justAdded = -1;

  const gap = T.protein - t[1];
  let pSt = "";
  if (hasDay()) {
    if (t[1] >= T.protein) pSt = "good";
    else pSt = (T.kcal - t[0]) >= gap / BATCH.mince.per[1] * BATCH.mince.per[0] ? "warn" : "bad";
  }
  el("m-prot").className = "met lead" + (pSt ? " " + pSt : "");
  el("v-prot").textContent = Math.round(t[1]);
  el("k-prot").innerHTML = gap > 0
    ? "protein g · <b class='acc'>" + Math.round(gap) + " g</b> to the floor = " + Math.round(gap / 21 * 100) + " g of the prep"
    : "protein g · floor cleared at " + T.protein;
  const bar = el("p-bar");
  bar.style.width = Math.min(100, t[1] / T.protein * 100) + "%";
  bar.className = t[1] >= T.protein ? "ok" : "";

  el("v-kcal").textContent = Math.round(t[0]).toLocaleString();
  el("k-kcal").textContent = "kcal · " + Math.round(T.kcal - t[0]).toLocaleString() + " left of " + T.kcal.toLocaleString();
  /* ⚠ Direction inverted from the artifact: UNDER is the loud state now. */
  el("m-kcal").className = "met" + (!hasDay() ? "" :
    t[0] < T.kcal - UNDER ? " bad" : t[0] > T.kcal_hi ? " warn" : " good");
  el("v-carb").textContent = Math.round(t[2]);
  el("v-fat").textContent = Math.round(t[3]);
  el("m-fat").className = "met" + (!hasDay() ? "" : t[3] > FAT_BAD ? " bad" : t[3] > FAT_WARN ? " warn" : " good");

  Object.keys(DAYS).forEach(k => el("d-" + k).setAttribute("aria-pressed", String(k === S.day)));

  const fl = flags();
  if (S.closed) fl.unshift(["good",
    "<b>Closed and committed to health-daily-log.csv.</b> Figures below are the file's, not a local draft — the file wins."]);
  renderFlagsInto(el("flags"), fl);

  renderEditor(); renderPresets(); renderFridge(); renderRec(); renderGoal();

  const cb = el("close");
  if (S.closed) { cb.disabled = true; cb.textContent = "Day closed"; }
  else { cb.disabled = !S.log.length; if (cb.textContent === "Day closed") cb.textContent = "Close and save"; }
  persist();
}
