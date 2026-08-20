/* render.js — everything that draws. Reads state, writes DOM, returns nothing. */

import { S, el, r1, persist, targets, DAYS, FAT_WARN, FAT_BAD, UNDER, ISO } from "./state.js";
import { BATCH, GRAM } from "./data.js";
import { PRESETS, presetLabel, presetMacros, displayName, ordered, closeHint,
         macroClass, MACRO_GROUPS } from "./presets.js";
import { noteUse, useCount } from "./recipes.js";
import { icon } from "./icons.js";
import { totals, flags, hasDay, fileItems } from "./engine.js";
import { renderEditor, addBatchItem } from "./editors.js";
import * as TG from "../../shared/targets.js";

let onChange;
export function wireRender(fns) { onChange = fns.render; }

/* ── item logging ─────────────────────────────────────────────────────────── */
export function addItem(rec) { S.log.push(rec); S.justAdded = S.log.length - 1; }

export function addPreset(p) {
  if (p.kind) {
    S.editing = p.kind;
    if (p.gk) S.gTarget = p.gk;
    if (p.rid) S.gTarget = p.rid;
    onChange(); return;
  }
  noteUse(p.id);
  if (p.batch) { addBatchItem(p.batch, p.g); onChange(); return; }
  addItem({ n: displayName(p), m: p.m.slice(), u: p.cls === "unv" || !!p.custom,
            veg: !!p.veg, fat: p.cls === "fat" });
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

/* ── FLAGS ARE TRANSIENT NOW — 18 Aug 2026 ──────────────────────────────────
   Sam: "the more flags that come up, the more it pushes down the view of what
   I've eaten in the day, and you can't actually see it… that's obviously a bug.
   The flags are, like, not that important. I'd rather they flash on the screen
   and persist for a bit and then disappear into, like, a small exclamation point
   in the corner of that box."

   He is right that it is a bug and right about the fix. Flags grew with the day —
   by evening there could be five — and each one stole a row from the food table,
   which is the thing he opens the app to look at. A warning that hides the data
   it is warning about is worse than no warning.

   So: show for 7s, then collapse to a badge carrying the count and the worst
   severity. Click the badge to bring them back. Nothing is lost, and the table
   keeps its height.
   ⚠ The risk-check modal is NOT affected — that one has to block, and it does. */

const FLAG_MS = 7000;
let flagTimer = null, flagsOpen = false, lastKey = "";

export function paintFlags(arr) {
  const host = el("flags"), badge = el("flagbadge");
  if (!host || !badge) return;

  const key = arr.map(f => f[0] + f[1]).join("|");
  const changed = key !== lastKey;
  lastKey = key;

  if (!arr.length) {
    host.classList.remove("on"); host.innerHTML = ""; badge.hidden = true;
    clearTimeout(flagTimer); flagsOpen = false; return;
  }

  const worst = arr.some(f => f[0] === "bad") ? "bad"
              : arr.some(f => f[0] === "warn") ? "warn"
              : arr.some(f => f[0] === "info") ? "info" : "good";
  badge.hidden = false;
  badge.className = "flagbadge " + worst;
  badge.textContent = (worst === "good" ? "✓" : worst === "info" ? "•" : "!") +
                      (arr.length > 1 ? " " + arr.length : "");
  badge.title = arr.length + " flag" + (arr.length > 1 ? "s" : "") + " — click to show";

  renderFlagsInto(host, arr);

  /* Only restart the timer when the flags actually changed, or every render
     would re-show them and they would never settle. */
  if (changed) {
    host.classList.add("on"); flagsOpen = true;
    clearTimeout(flagTimer);
    flagTimer = setTimeout(() => { host.classList.remove("on"); flagsOpen = false; }, FLAG_MS);
  } else {
    host.classList.toggle("on", flagsOpen);
  }

  badge.onclick = () => {
    flagsOpen = !flagsOpen;
    host.classList.toggle("on", flagsOpen);
    clearTimeout(flagTimer);
    if (flagsOpen) flagTimer = setTimeout(() => { host.classList.remove("on"); flagsOpen = false; }, FLAG_MS);
  };
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
      ? '<span><b>' + w.kg + ' kg</b> <span style="color:var(--dim)">' + w.date +
        (w.state ? ' ' + w.state : '') + '</span></span>' +
        (w.state ? '' : '<span class="warn" title="' + (w.warning || '') +
          '">⚠ fed or fasted not recorded</span>')
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

/* ── WHAT'S LEFT — one line, not a card ───────────────────────────────────
   The separate "Close the day" panel is gone. Sam, 17 Aug 2026: "The close the
   day box is way too big. I think this should just be combined with the log an
   item part… have on that item, how much of that one item would I need to get
   to close the day."

   So the question moves to where the decision is made: a single line of what's
   left at the top of the log panel, and every row on the board carrying its own
   answer. A panel two columns away was asking Sam to hold a number in his head
   and walk it over. The board now does that for him, per item.               */
function renderLeft() {
  const host = el("left"); if (!host) return;
  const t = totals(), T = targets();
  /* 🚩 20 Aug 2026 — the day being logged is named here, every time, whenever it
     is not today. The bug this replaces was invisible precisely because nothing
     on screen said which date the food was going to. */
  const dayLabel = new Date(S.logDate + "T12:00:00")
    .toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  const back = S.logDate !== ISO();
  const pre = back
    ? '<b class="acc">Logging ' + dayLabel + '</b> <span style="color:var(--dim)">— not today. ' +
      'This will be saved with the ' + S.logDate + ' date.</span><br>'
    : "";

  /* Midnight passed while the tab sat open. Do not move the items and do not
     stay silent — this is the exact failure of 19 → 20 August. */
  if (S.rolled) {
    host.innerHTML =
      '<b class="warn">It is now ' + S.rolled.to + '.</b> These ' + S.log.length +
      ' item' + (S.log.length === 1 ? "" : "s") + ' were started on <b>' + S.rolled.from +
      '</b> and are still being logged to that date — nothing has moved. ' +
      'Use the date control at the top to switch to today if that is wrong.';
    return;
  }

  if (S.closed) {
    host.innerHTML = pre + '<b class="ok">Day closed.</b> ' + Math.round(t[0]) + ' kcal · ' +
      r1(t[1]) + ' g protein, committed to the CSV. ' +
      '<button class="mini" id="reopen">Re-log this day</button> ' +
      '<span style="color:var(--dim)">appends a correction that replaces it — it cannot ' +
      'restore the individual items, only the totals are in the file</span>';
    return;
  }
  const pLeft = Math.round(T.protein - t[1]), kLeft = Math.round(T.kcal - t[0]);
  if (S.reopened) {
    host.innerHTML = pre + '<b class="warn">Re-logging a day that is already written.</b> ' +
      'The file has <b>' + S.reopened.kcal + '</b> kcal · <b>' + r1(S.reopened.protein_g) +
      '</b> g P for ' + S.logDate + '. Saving appends a <b>corrected</b> row that supersedes it.';
    return;
  }
  if (!S.log.length) {
    host.innerHTML = pre + '<b>' + T.kcal.toLocaleString() + '</b> kcal and <b>' + T.protein +
      '</b> g protein for the day. Each item below shows how much of it would close that.';
    return;
  }
  host.innerHTML = pre +
    (pLeft > 0 ? '<b class="acc">' + pLeft + ' g</b> protein' : '<b class="ok">floor cleared</b>') +
    ' · ' + (kLeft > 0 ? '<b>' + kLeft.toLocaleString() + '</b> kcal to target'
                       : '<b class="warn">' + Math.abs(kLeft) + '</b> kcal over target') +
    ' <span style="color:var(--dim)">— amounts below close the gap</span>';
}

/* ── preset column ────────────────────────────────────────────────────────── */
function presetRow(p, mode) {
  const b = document.createElement("button");
  b.className = "p" + (p.cls ? " " + p.cls : "") + (mode === "pinned" ? " pinned" : "") +
    (mode === "arch" ? " archrow" : "");
  const t = document.createElement("span"); t.className = "pn";
  t.innerHTML = (p.icon ? icon(p.icon) : "") +
    "<span>" + displayName(p).replace(/[<>&]/g, "") + (p.edited ? " ·" : "") + "</span>";
  const m = document.createElement("span"); m.className = "pm"; m.textContent = presetLabel(p);
  b.append(t, m);
  /* How much of THIS item closes the day. The answer where the decision is. */
  const hint = closeHint(p, totals());
  if (hint && !S.closed) {
    const h = document.createElement("span");
    h.className = "phint" + (hint.weak ? " weak" : "");
    h.textContent = hint.text;
    b.appendChild(h);
  }
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
    if (p.kind) mk("⋯", "Open the editor", "",
      () => { S.editing = p.kind; if (p.gk) S.gTarget = p.gk; if (p.rid) S.gTarget = p.rid; onChange(); });
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
  const live = ordered(all.filter(p => !S.archived[p.id]));
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
    /* Grouped by dominant macro so the list is scannable rather than a wall.
       Frecency ordering still applies WITHIN each group. */
    const w = document.createElement("div"); w.className = "sub-list";
    MACRO_GROUPS.forEach(g => {
      const inGroup = rest.filter(p => macroClass(p) === g.key);
      if (!inGroup.length) return;
      const h = document.createElement("div");
      h.className = "grouphead " + g.key;
      h.innerHTML = "<span>" + g.label + "</span><span class='gc'>" + inGroup.length + "</span>";
      h.title = g.hint;
      w.appendChild(h);
      inGroup.forEach(p => w.appendChild(presetRow(p, "rest")));
    });
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
  hint.innerHTML = "✎ edit · ● pin · ⌫ archive. <b>Order is by how often you log it</b>, " +
    "decayed over ~3 weeks, so a new staple climbs and an old one drifts down. Pins always win.";
  host.appendChild(hint);
  el("pin-n").textContent = pinned.length + " pinned · " + live.length + " items";
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
    el("empty").innerHTML = (S.logDate === ISO() ? "Nothing logged today." :
      "Nothing logged for " + S.logDate + ".") +
      "<br><span class='dimcell'>Tap a preset to start.</span>";
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
  paintFlags(fl);

  renderEditor(); renderPresets(); renderLeft(); renderGoal();

  const cb = el("close");
  if (S.closed) { cb.disabled = true; cb.textContent = "Day closed"; }
  else {
    cb.disabled = !S.log.length;
    cb.textContent = S.logDate === ISO() ? "Close and save"
      : "Save " + new Date(S.logDate + "T12:00:00").toLocaleDateString("en-GB",
          { day: "numeric", month: "short" });
  }
  persist();
}
