/* ═══════════════════════════════════════════════════════════════════════════
   store.js — the data layer. THE ONLY PLACE THAT TOUCHES health-daily-log.csv.
   ═══════════════════════════════════════════════════════════════════════════

   Why this file exists, and why it must not be bypassed:

   The knowledge base has three rules about this CSV that have been broken
   before, each time by code or a human remembering them imperfectly:

     1. APPEND-ONLY.      Never rewrite a row. Never summarise over rows.
     2. LAST ROW WINS.    A date may appear more than once. Corrections are
                          appended with confidence=corrected. Non-days are
                          appended with confidence=void and EXCLUDED from
                          every statistic.
     3. BLANK IS NOT ZERO. A partial day keeps its row with empty cells.
                          An empty kcal cell means "not logged", not "ate nothing".

   Implementing them HERE means they stop being things to get right by hand.
   If you find yourself parsing the CSV anywhere else in this repo, stop.

   Works in both the browser and node. Pure functions above, IO below.
   ═══════════════════════════════════════════════════════════════════════════ */

export const COLUMNS = [
  "date", "day_type", "weight_kg", "kcal", "protein_g", "carbs_g",
  "fat_g", "training", "confidence", "source", "notes"
];

const NUMERIC = new Set(["weight_kg", "kcal", "protein_g", "carbs_g", "fat_g"]);

/* ─────────────────────────────── PARSING ─────────────────────────────────
   A hand-rolled RFC4180 parser, because the notes column contains commas,
   quotes and newlines. `split(",")` will corrupt this file. Do not use it. */

export function parseCSV(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false, i = 0;

  // Strip a UTF-8 BOM if iCloud or Excel has added one.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  while (i < text.length) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }

    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ",") { row.push(field); field = ""; i++; continue; }
    if (c === "\r") { i++; continue; }
    if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }

    field += c; i++;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }

  const header = rows.shift() || [];
  return rows
    .filter(r => r.some(cell => cell !== ""))       // drop blank lines
    .map(r => {
      const o = {};
      header.forEach((h, idx) => { o[h.trim()] = (r[idx] ?? "").trim(); });
      return o;
    });
}

/* One field, serialised. Quote only when we must, so diffs stay readable —
   this file's history IS the audit trail, so noisy diffs have a real cost. */
function esc(v) {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function serialiseRow(rec) {
  return COLUMNS.map(c => esc(rec[c])).join(",");
}

export function serialiseCSV(records) {
  return COLUMNS.join(",") + "\n" + records.map(serialiseRow).join("\n") + "\n";
}

/* ─────────────────────────── BLANK IS NOT ZERO ───────────────────────────
   num() returns null for an empty cell, never 0. Every consumer must handle
   null. If you see `|| 0` applied to one of these, that is the bug. */

export function num(v) {
  if (v === "" || v == null) return null;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function typed(rec) {
  const o = { ...rec };
  for (const k of NUMERIC) o[k] = num(rec[k]);
  return o;
}

/* ────────────────────────────── LAST ROW WINS ────────────────────────────
   Collapse the append-only log into the current view of each date.
   `void` rows are not days — they are excluded entirely, not zeroed. */

export function currentView(records, { includeVoid = false } = {}) {
  const byDate = new Map();
  for (const raw of records) {
    const rec = typed(raw);
    if (!rec.date) continue;
    byDate.set(rec.date, rec);            // later row overwrites earlier — last wins
  }
  const out = [...byDate.values()]
    .filter(r => includeVoid || r.confidence !== "void")
    .sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

/* A "solid" day is one with an intake figure. Used for every rate and mean;
   a day with a weight but no food is real data but not a logged day. */
export const isSolid = r => r.kcal != null && r.protein_g != null;

/* The most recent recorded bodyweight — the engine's only weight input. */
export function latestWeight(records) {
  const days = currentView(records);
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].weight_kg != null) return { kg: days[i].weight_kg, date: days[i].date };
  }
  return null;
}

/* Sessions logged in the trailing N days. Feeds the activity multiplier if
   the derived engine is ever switched on — see targets.js and MIGRATION.md T7. */
export function sessionsInLastDays(records, days = 7, today = new Date()) {
  const cutoff = new Date(today.getTime() - days * 864e5).toISOString().slice(0, 10);
  return currentView(records)
    .filter(r => r.date > cutoff && r.training && r.training.trim() !== "")
    .length;
}

/* ──────────────────────────── APPENDING ──────────────────────────────────
   The only mutation this module allows. There is deliberately no update()
   and no delete(). A correction is an append; a mistake is an append. */

export function appendRecord(csvText, rec) {
  if (!rec.date) throw new Error("store: a record without a date cannot be appended");
  if (!rec.confidence) throw new Error("store: confidence is required (confirmed|corrected|void)");
  const body = csvText.endsWith("\n") ? csvText : csvText + "\n";
  return body + serialiseRow(rec) + "\n";
}

export function correctionFor(date, rec, why) {
  return { ...rec, date, confidence: "corrected",
           source: (rec.source || "") + ` CORRECTION ${stamp()} - supersedes the earlier ${date} row`,
           notes: why };
}

export function voidFor(date, why) {
  return { date, confidence: "void",
           source: `CORRECTION ${stamp()} - voids the earlier ${date} row`, notes: why };
}

function stamp() {
  const d = new Date(), m = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${String(d.getDate()).padStart(2,"0")}-${m[d.getMonth()]}-${String(d.getFullYear()).slice(2)}`;
}

/* ═══════════════════════════════════════════════════════════════════════════
   GITHUB BACKEND — the repo is the database.
   ═══════════════════════════════════════════════════════════════════════════

   Reads and writes data/health-daily-log.csv in the private data repo via the
   GitHub Contents API. Every logged day becomes a commit, which is why the
   append-only rule above is enforced by the tool rather than by memory.

   ⚠ THE TOKEN. A fine-grained personal access token scoped to the DATA REPO
   ONLY, with Contents: read and write, and nothing else. It is held in
   localStorage on each device you write from. That is a real secret sitting in
   browser storage — acceptable on your own phone and laptop, but it is the
   weak point of this architecture and it is not pretended otherwise.
   NEVER commit a token. .gitignore does not protect you from pasting one
   into a source file.
   ═══════════════════════════════════════════════════════════════════════════ */

const TOKEN_KEY = "gh-token";
const API = "https://api.github.com";

export const getToken = () => localStorage.getItem(TOKEN_KEY) || "";
export const setToken = t => localStorage.setItem(TOKEN_KEY, t.trim());
export const hasToken = () => !!getToken();

export function makeClient({ owner, repo, path = "data/health-daily-log.csv", branch = "main" }) {

  const headers = () => ({
    "Authorization": "Bearer " + getToken(),
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28"
  });

  /* Read. Returns { text, sha }. The sha is the optimistic-concurrency token:
     GitHub rejects a write whose sha is stale, which is exactly the collision
     detection we want when the phone and the MacBook both have edits. */
  async function read() {
    const r = await fetch(`${API}/repos/${owner}/${repo}/contents/${path}?ref=${branch}`,
                          { headers: headers(), cache: "no-store" });
    if (!r.ok) throw new Error(`store.read: ${r.status} ${await r.text()}`);
    const j = await r.json();
    // atob gives latin-1; the notes column contains en-dashes, so decode as UTF-8.
    const bytes = Uint8Array.from(atob(j.content.replace(/\n/g, "")), c => c.charCodeAt(0));
    return { text: new TextDecoder("utf-8").decode(bytes), sha: j.sha };
  }

  async function write(text, sha, message) {
    const content = btoa(String.fromCharCode(...new TextEncoder().encode(text)));
    const r = await fetch(`${API}/repos/${owner}/${repo}/contents/${path}`, {
      method: "PUT", headers: headers(),
      body: JSON.stringify({ message, content, sha, branch })
    });
    if (r.status === 409) throw new ConflictError("remote moved on since read");
    if (!r.ok) throw new Error(`store.write: ${r.status} ${await r.text()}`);
    return r.json();
  }

  /* Append one record. Re-reads immediately before writing so a stale local
     copy can never clobber a row logged on another device. On a 409 it retries
     against the fresh file — safe precisely BECAUSE this is append-only. */
  async function append(rec, message, attempt = 0) {
    const { text, sha } = await read();
    try {
      return await write(appendRecord(text, rec), sha,
                         message || `log: ${rec.date} ${rec.kcal ?? "-"} kcal / ${rec.protein_g ?? "-"} g P`);
    } catch (e) {
      if (e instanceof ConflictError && attempt < 3) return append(rec, message, attempt + 1);
      throw e;
    }
  }

  return { read, write, append };
}

export class ConflictError extends Error {}

/* ────────────────────────── OFFLINE WRITE QUEUE ──────────────────────────
   The gym basement has no signal, and a diet app you cannot use at the point
   of eating is a diet app you stop using. Log lands in the queue instantly;
   the queue drains to GitHub whenever the network returns.

   ⚠ Per-device. If you log offline on the phone and then log on the MacBook
   before the phone drains, both queues eventually append. That is FINE and is
   the reason append-only + last-row-wins was chosen: two appends for one date
   resolve deterministically instead of one silently overwriting the other. */

const QUEUE_KEY = "diet-queue";

export const queue = {
  all:  () => JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]"),
  push: rec => { const q = queue.all(); q.push(rec); localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); },
  size: () => queue.all().length,
  clear: () => localStorage.removeItem(QUEUE_KEY),

  async drain(client, onProgress) {
    const q = queue.all();
    if (!q.length) return { sent: 0, left: 0 };
    let sent = 0;
    for (const rec of q) {
      try { await client.append(rec); sent++; onProgress?.(sent, q.length); }
      catch { break; }                    // stop on first failure; keep the rest queued
    }
    const left = q.slice(sent);
    left.length ? localStorage.setItem(QUEUE_KEY, JSON.stringify(left)) : queue.clear();
    return { sent, left: left.length };
  }
};
