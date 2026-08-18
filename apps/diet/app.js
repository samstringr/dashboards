/* app.js — bootstrap, GitHub sync, settings, offline queue.

   The write path in one line:
     log an item → close the day → append a row → commit to the data repo.

   The artifact could not do the last two steps. It composed a block of text and
   handed it to chat for a human to paste, and design-system.md called that "not
   a workaround — it is the architecture." That architecture is now gone: the
   whole hand-off path (sendPrompt, the clipboard fallback chain, the copy-by-hand
   textarea) is deleted rather than ported. */

import { S, el, r1, persist, loadLocal, clearDraft, repoConfig, targets, DAYS, ISO } from "./state.js";
import { BATCH, GRAM } from "./data.js";
import { render, renderFlagsInto, addItem, wireRender } from "./render.js";
import { renderEditor, wireEditors } from "./editors.js";
import { rebuildChart, drawStats, setSeries, wireChartGestures, stats as chartStats } from "./chart.js";
import { risks, buildRecord, totals } from "./engine.js";
import * as store from "../../shared/store.js";
import * as TG from "../../shared/targets.js";
import * as A from "./assistant.js";
import { noteUse } from "./recipes.js";
import { PRESETS, presetMacros, displayName } from "./presets.js";

let client = null;

/* ── boot ─────────────────────────────────────────────────────────────────── */
loadLocal(BATCH, GRAM);
wireRender({ render: refresh });
wireEditors({ addItem, render: refresh });

function refresh() { render(); drawStats(); }

el("when").textContent = new Date().toLocaleDateString("en-GB",
  { weekday: "long", day: "numeric", month: "long" });

/* ── history from the CSV ─────────────────────────────────────────────────── */
async function loadHistory() {
  const cfg = repoConfig.get();
  if (!cfg.owner || !cfg.repo || !store.hasToken()) { showSetup(true); return; }
  showSetup(false);
  client = store.makeClient(cfg);
  setSync("reading");
  try {
    const { text } = await client.read();
    applyCsv(text);
    setSync("idle");
  } catch (e) {
    setSync("error", e.message);
  }
  refresh(); rebuildChart();
}

export function applyCsv(text) {
  const rows = store.parseCSV(text);
  S.history = store.currentView(rows);

  /* Weight is the engine's only input. Resolve it here, once. */
  S.weight = TG.weightFor(rows, store.latestWeight);

  /* THE FILE WINS. If the CSV already has today, the day is closed: render from
     the file and discard the local draft. Never merge — merging is how two
     copies of one fact drift, which this base has hit three times. */
  const today = ISO();
  const row = S.history.find(r => r.date === today);
  if (row && row.kcal != null) {
    S.fileToday = row; S.closed = true; S.log = []; clearDraft();
    const k = Object.keys(DAYS).find(d => DAYS[d].csv === row.day_type);
    if (k) S.day = k;
  } else {
    S.fileToday = null; S.closed = false;
  }
}

/* ── saving ───────────────────────────────────────────────────────────────── */
async function doSave() {
  const b = el("close"), rec = buildRecord();
  b.disabled = true;

  if (!client || !S.online) {
    store.queue.push(rec);
    setSync("queued");
    b.textContent = "Queued — will commit when online";
    markClosedLocally(rec);
    setTimeout(refresh, 1200);
    return;
  }
  setSync("writing");
  try {
    await client.append(rec);
    const { text } = await client.read();
    applyCsv(text);                       // re-read so the file, not the draft, is on screen
    setSync("idle");
    b.textContent = "Committed";
  } catch (e) {
    store.queue.push(rec);
    setSync("queued", e.message);
    b.textContent = "Couldn't reach GitHub — queued";
    markClosedLocally(rec);
  }
  refresh(); rebuildChart();
}

function markClosedLocally(rec) {
  /* Optimistic close so the day reads as done offline. The next successful read
     replaces this with the file's own row. */
  S.fileToday = { ...rec, kcal: +rec.kcal, protein_g: +rec.protein_g,
                  carbs_g: +rec.carbs_g, fat_g: +rec.fat_g };
  S.closed = true; S.log = []; clearDraft();
}

el("close").addEventListener("click", () => {
  const r = risks();
  if (!r.length) { doSave(); return; }
  el("mdl-h").textContent = r.length === 1 ? "One thing before this is saved" : r.length + " things before this is saved";
  el("mdl-s").innerHTML = "The log is <b>append-only</b> — once it's written it stays written, " +
    "and a wrong row is worse than a missing one.";
  renderFlagsInto(el("mdl-flags"), r);
  el("ov").classList.add("on");
});
el("mdl-go").addEventListener("click", () => { el("ov").classList.remove("on"); doSave(); });
el("mdl-back").addEventListener("click", () => el("ov").classList.remove("on"));
el("ov").addEventListener("click", e => { if (e.target === el("ov")) el("ov").classList.remove("on"); });

el("clear").addEventListener("click", () => {
  S.log.forEach(r => { if (r.batch && S.fridge[r.batch] !== null) S.fridge[r.batch] += r.g; });
  S.log = []; refresh();
});

Object.keys(DAYS).forEach(k =>
  el("d-" + k).addEventListener("click", () => { S.day = k; refresh(); }));
["both", "p", "k"].forEach(k => el("c-" + k).addEventListener("click", () => setSeries(k)));

/* ── offline queue ────────────────────────────────────────────────────────── */
async function drain() {
  if (!client || !S.online || !store.queue.size()) return;
  setSync("writing");
  const { sent, left } = await store.queue.drain(client);
  if (sent) {
    try { const { text } = await client.read(); applyCsv(text); } catch {}
  }
  setSync(left ? "queued" : "idle");
  refresh(); rebuildChart();
}
window.addEventListener("online",  () => { S.online = true;  setSync("idle"); drain(); });
window.addEventListener("offline", () => { S.online = false; setSync("queued"); });

function setSync(state, detail) {
  S.syncState = state;
  const n = el("sync"); if (!n) return;
  const q = store.queue.size();
  const map = {
    idle:    q ? [q + " queued", "warn"] : ["synced", "ok"],
    reading: ["reading…", ""], writing: ["committing…", ""],
    queued:  [(q || 1) + " queued · offline", "warn"],
    error:   ["sync error", "bad"]
  };
  const [txt, cls] = map[state] || ["", ""];
  n.textContent = txt; n.className = "sync " + cls;
  n.title = detail || "";
}

/* ── settings ─────────────────────────────────────────────────────────────── */
function showSetup(on) { el("setup").classList.toggle("on", !!on); }

el("gear").addEventListener("click", () => showSetup(!el("setup").classList.contains("on")));
el("setup-cancel").addEventListener("click", () => showSetup(false));
el("setup-save").addEventListener("click", async () => {
  const owner = el("s-owner").value.trim(), repo = el("s-repo").value.trim();
  const tok = el("s-token").value.trim();
  if (!owner || !repo) { el("setup-msg").textContent = "Owner and repo are both needed."; return; }
  repoConfig.set({ owner, repo, path: "data/health-daily-log.csv", branch: "main" });
  if (tok) store.setToken(tok);
  el("s-token").value = "";
  el("setup-msg").textContent = "Checking…";
  await loadHistory();
  el("setup-msg").textContent = S.syncState === "error" ? "Couldn't read the file — check the repo and token." : "";
});

(function fillSetup() {
  const c = repoConfig.get();
  el("s-owner").value = c.owner || "";
  el("s-repo").value = c.repo || "";
  el("s-has").textContent = store.hasToken() ? "a token is stored on this device" : "no token on this device";
})();

/* ═══════════ GOAL AND MEASUREMENTS ═══════════
   ⚠ Weight and waist are MEASUREMENTS. They are appended to the CSV with a date,
   not stored in localStorage. The CSV already has a weight_kg column and every
   one of its rows is empty — that gap is why every target in this app has been
   resting on a fallback constant. This pane is how it gets closed.

   Goal targets (goal weight, body fat, date, multiplier, protein) are PLAN, not
   measurement, so they do live locally — and they override the shipped values
   from health-targets.md rather than silently replacing them. */

function goalState() {
  return S.goal || {
    goal_kg: TG.PROFILE.goal_weight_kg, goal_bf: TG.PROFILE.goal_bf_lo,
    when: TG.PROFILE.goal_horizon, mult: TG.MULTIPLIER_REF.value, protein: targets().protein
  };
}

function openGoal() {
  const g = goalState(), w = S.weight;
  el("g-weight").value = "";
  el("g-waist").value = "";
  el("g-bf").value = "";
  el("g-gw").value = g.goal_kg;
  el("g-gbf").value = g.goal_bf;
  el("g-when").value = g.when;
  el("g-mult").value = g.mult;
  el("g-prot").value = g.protein;

  const T = targets();
  el("goal-derive").innerHTML =
    "Current: <b>" + T.kcal.toLocaleString() + " kcal · " + T.protein + " g</b> — " +
    "BMR " + T.bmr + " (Mifflin-St Jeor, " + TG.PROFILE.height_cm + " cm, age " +
    TG.ageOn() + ", " + (w?.kg ?? TG.FALLBACK_WEIGHT_KG) + " kg) × " + T.multiplier + ". " +
    (w?.fallback ? "<b style='color:var(--warn)'>⚠ That weight is a fallback — it is not in the log. " +
      "Entering one below fixes every number in the app.</b>" : "Weight from the log, " + w.date + ".");

  el("goal-waist-note").innerHTML =
    "⚠ <b>The waist has never been measured</b>, and in a maintenance recomp it is the only " +
    "signal that works — bodyweight is designed to stay flat for twelve weeks, so the scale " +
    "will say nothing. It is the highest-value open measurement in the whole base. £4 and two minutes.";

  previewGoal();
  el("goalov").classList.add("on");
}

function previewGoal() {
  const kg = +el("g-weight").value || S.weight?.kg || TG.FALLBACK_WEIGHT_KG;
  const mult = +el("g-mult").value || TG.MULTIPLIER_REF.value;
  const bmr = Math.round(TG.bmr(kg));
  const kcal = Math.round(bmr * mult / 10) * 10;
  el("goal-preview").innerHTML =
    "Would give <b>" + kcal.toLocaleString() + " kcal</b> — BMR " + bmr + " × " + mult +
    ". <span style='color:var(--dim)'>Error band on this formula is ±250–400 kcal, so the " +
    "figure is settled by four weeks of weigh-ins, not by the arithmetic.</span>";
}
["g-weight", "g-mult"].forEach(id => el(id).addEventListener("input", previewGoal));

el("goalbtn").addEventListener("click", openGoal);
el("goal-close").addEventListener("click", () => el("goalov").classList.remove("on"));
el("goalov").addEventListener("click", e => { if (e.target === el("goalov")) el("goalov").classList.remove("on"); });

el("goal-save").addEventListener("click", async () => {
  S.goal = {
    goal_kg: +el("g-gw").value || TG.PROFILE.goal_weight_kg,
    goal_bf: +el("g-gbf").value || TG.PROFILE.goal_bf_lo,
    when: el("g-when").value.trim() || TG.PROFILE.goal_horizon,
    mult: +el("g-mult").value || TG.MULTIPLIER_REF.value,
    protein: +el("g-prot").value || targets().protein
  };
  TG.applyOverrides(S.goal);
  persist();

  const kg = +el("g-weight").value, waist = +el("g-waist").value, bf = +el("g-bf").value;
  if (kg > 0 || waist > 0 || bf > 0) {
    const notes = ["Measurement from the diet app"];
    if (waist > 0) notes.push("waist " + waist + " cm at the navel");
    if (bf > 0) notes.push("body fat " + bf + "% (stated, not measured by DEXA)");
    const rec = { date: ISO(), day_type: "", weight_kg: kg > 0 ? kg : "",
                  kcal: "", protein_g: "", carbs_g: "", fat_g: "", training: "",
                  confidence: "confirmed", source: "Diet app goal pane " + ISO(),
                  notes: notes.join("; ") };
    /* ⚠ Blank is not zero. This row carries a weight and NOTHING else — the
       intake cells stay empty so it is never counted as a 0 kcal day. */
    if (client && S.online) {
      try { await client.append(rec, "measure: " + (kg ? kg + " kg" : "") + (waist ? " waist " + waist + " cm" : ""));
            const { text } = await client.read(); applyCsv(text); }
      catch { store.queue.push(rec); setSync("queued"); }
    } else { store.queue.push(rec); setSync("queued"); }
  }
  el("goalov").classList.remove("on");
  refresh(); rebuildChart();
});

/* ═══════════ THE ASSISTANT ═══════════
   Speech in, items out. See assistant.js for what does and does not need a key. */

let listening = false;
const heardBox = () => el("heard");

el("mic").addEventListener("click", () => {
  if (!A.speechAvailable()) {
    showHeard("<div class='ht'><i>This browser has no speech recognition. " +
      "Safari on iOS and Chrome do; Firefox does not. You can still type into the search-free board below.</i></div>");
    return;
  }
  if (listening) { A.stopListening(); return; }
  listening = true; el("mic").classList.add("on"); el("mic").textContent = "● listening";
  showHeard("<div class='ht'><i>Listening — say what you ate.</i></div>");
  A.listen({
    onPartial: t => showHeard("<div class='ht'>" + escapeHtml(t) + "</div>"),
    onFinal: t => { if (t) handleHeard(t); },
    onEnd: () => { listening = false; el("mic").classList.remove("on"); el("mic").textContent = "🎙"; }
  });
});

const escapeHtml = s => String(s).replace(/[&<>"]/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function showHeard(html) { heardBox().innerHTML = html; heardBox().classList.add("on"); }
function hideHeard() { heardBox().classList.remove("on"); heardBox().innerHTML = ""; }

async function handleHeard(text) {
  const parsed = A.parse(text);
  let html = '<div class="ht">' + escapeHtml(text) + '</div>';
  const matched = parsed.filter(p => !p.unmatched);
  const missing = parsed.filter(p => p.unmatched);

  matched.forEach(p => {
    const r = A.resolve(p);
    html += '<div class="hrow"><span class="hn">' + escapeHtml(r.name) + '</span>' +
      '<span class="hm">' + Math.round(r.macros[0]) + ' kcal · ' + r1(r.macros[1]) + ' P</span></div>';
  });
  missing.forEach(p => {
    html += '<div class="hrow miss"><span class="hn">' + escapeHtml(p.query) +
      ' — not on the board</span><span class="hm">looking up…</span></div>';
  });
  html += '<div class="acts" style="margin-top:9px">' +
    (matched.length ? '<button class="btn p2" id="h-add">Log ' + matched.length + ' item' +
      (matched.length > 1 ? 's' : '') + '</button>' : '') +
    '<button class="btn" id="h-cancel">Dismiss</button></div>';
  showHeard(html);

  el("h-cancel").onclick = hideHeard;
  const add = el("h-add");
  if (add) add.onclick = () => {
    matched.forEach(p => {
      const r = A.resolve(p);
      noteUse(p.preset.id);
      addItem({ n: r.name, m: r.macros, u: true, veg: !!p.preset.veg, fat: p.preset.cls === "fat" });
    });
    hideHeard(); refresh();
  };

  /* Unknowns → Open Food Facts. No key, no account. */
  for (const p of missing) {
    try {
      const hits = await A.lookup(p.query);
      const host = document.createElement("div"); host.className = "hopts";
      if (!hits.length) host.innerHTML = '<div style="font-size:10.5px;color:var(--dim)">' +
        'Nothing found on Open Food Facts. Add it by hand with ＋ New item.</div>';
      hits.forEach(h => {
        const b = document.createElement("button"); b.className = "hopt";
        const g = p.grams || 100;
        b.innerHTML = '<b>' + escapeHtml(h.name) + '</b> — ' +
          Math.round(h.per[0] * g / 100) + ' kcal · ' + r1(h.per[1] * g / 100) + ' g P per ' + g + ' g ' +
          '<span>· ' + h.source + '</span>';
        b.onclick = () => {
          S.customs.push({ id: "off" + h.code, n: h.name + " " + g + " g",
            m: h.per.map(v => v * g / 100), custom: true, cls: "unv",
            src: h.source });
          noteUse("off" + h.code);
          addItem({ n: h.name + " " + g + " g", m: h.per.map(v => v * g / 100), u: true });
          persist(); hideHeard(); refresh();
        };
        host.appendChild(b);
      });
      heardBox().appendChild(host);
    } catch {
      const d = document.createElement("div"); d.className = "hopts";
      d.innerHTML = '<div style="font-size:10.5px;color:var(--warn)">Could not reach Open Food Facts.</div>';
      heardBox().appendChild(d);
    }
  }
}

/* ── service worker ───────────────────────────────────────────────────────── */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}

/* ── go ───────────────────────────────────────────────────────────────────── */
wireChartGestures();
refresh();
loadHistory().then(drain);

/* Exposed for the headless harness — see tools/smoke.mjs. Not used by the UI. */
window.__diet = { S, refresh, applyCsv, targets, totals, store,
                  eraStats: () => ({ eras: chartStats().eras }) };
