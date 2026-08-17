/* app.js — bootstrap, GitHub sync, settings, offline queue.

   The write path in one line:
     log an item → close the day → append a row → commit to the data repo.

   The artifact could not do the last two steps. It composed a block of text and
   handed it to chat for a human to paste, and design-system.md called that "not
   a workaround — it is the architecture." That architecture is now gone: the
   whole hand-off path (sendPrompt, the clipboard fallback chain, the copy-by-hand
   textarea) is deleted rather than ported. */

import { S, el, persist, loadLocal, clearDraft, repoConfig, targets, DAYS, ISO } from "./state.js";
import { BATCH, GRAM } from "./data.js";
import { render, renderFlagsInto, addItem, wireRender } from "./render.js";
import { renderEditor, wireEditors } from "./editors.js";
import { rebuildChart, drawStats, setSeries } from "./chart.js";
import { risks, buildRecord, totals } from "./engine.js";
import * as store from "../../shared/store.js";
import * as TG from "../../shared/targets.js";

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

/* ── service worker ───────────────────────────────────────────────────────── */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}

/* ── go ───────────────────────────────────────────────────────────────────── */
refresh();
loadHistory().then(drain);

/* Exposed for the headless harness — see tools/smoke.mjs. Not used by the UI. */
window.__diet = { S, refresh, applyCsv, targets, totals, store };
