/* chart.js — the consistency chart and its stats.

   🚩 THE BIGGEST SINGLE CHANGE IN THE PORT.
   The artifact carried a hardcoded `SEED` array of 29 days, re-seeded by hand
   and backstopped by a weekly scheduled task, because a sandboxed artifact
   cannot read a file. That is also how it once shipped completely blank: a
   stray double comma made a sparse array hole, legal JavaScript that killed
   the page at runtime.

   There is no SEED any more. History is read from health-daily-log.csv on every
   open. The `weekly-diet-reseed` scheduled task can be retired (MIGRATION.md T16).

   ── Why the axes are set the way they are ──
   Protein is plotted on y and calories on y2, and BOTH ranges are centred on
   their target with the SAME proportional half-range. So a day on plan for both
   puts the two lines on top of each other, and any separation is immediately
   attributable to one or the other. A 10% miss looks the same size on either. */

import { S, el, r1, targets } from "./state.js";

const FRAC = 0.42;                      // half-range as a fraction of target.
/* Was 0.6, inherited from the artifact's 150 g / 2,325 kcal pairing. At a 2,780
   target that stretches the calorie axis to 1,112-4,448 and puts every real day in
   the bottom third of the plot. 0.42 keeps both axes centred on target, keeps the
   two half-ranges proportionally matched, and makes the lines readable. */
const grade = r => r >= 80 ? "#7fb069" : r >= 60 ? "#d9a441" : "#e2585a";
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
const isTrain = t => ["Gym", "Football", "Training"].includes(t);

let chart = null;

/* Solid days only — a row with no intake figure is "not logged", not a zero. */
export const solidDays = () => S.history.filter(r => r.kcal != null && r.protein_g != null);

export function stats() {
  const T = targets(), d = solidDays();
  if (!d.length) return { n: 0, pRate: 0, kRate: 0, kIn: 0, pMean: 0, kMean: 0, cover: 0 };
  const pIn = d.filter(r => r.protein_g >= T.protein).length;
  const kIn = d.filter(r => r.kcal >= T.kcal_lo && r.kcal <= T.kcal_hi).length;
  const first = d[0].date, last = d[d.length - 1].date;
  const span = Math.round((new Date(last) - new Date(first)) / 864e5) + 1;
  return {
    n: d.length,
    pRate: Math.round(pIn / d.length * 100),
    kRate: Math.round(kIn / d.length * 100),
    kIn,
    pMean: Math.round(mean(d.map(r => r.protein_g))),
    kMean: Math.round(mean(d.map(r => r.kcal))),
    cover: span ? Math.round(d.length / span * 100) : 0
  };
}

export function drawStats() {
  const s = stats(), T = targets(), host = el("stats");
  if (!s.n) { host.innerHTML = '<div class="st"><div class="v">—</div><div class="k">no logged days yet</div></div>'; return; }
  host.innerHTML =
    '<div class="st"><div class="v" style="color:' + grade(s.pRate) + '">' + s.pRate + '%</div>' +
      '<div class="k">hit the ' + T.protein + ' g floor</div></div>' +
    '<div class="st"><div class="v" style="color:' + grade(s.kRate) + '">' + s.kRate + '%</div>' +
      '<div class="k">landed in the band (' + s.kIn + ' of ' + s.n + ')</div></div>' +
    '<div class="st"><div class="v">' + s.pMean + '</div><div class="k">mean protein g</div></div>' +
    '<div class="st"><div class="v">' + s.kMean.toLocaleString() + '</div>' +
      '<div class="k">mean kcal · target ' + T.kcal.toLocaleString() + '</div></div>';
}

export function showDay(i) {
  const d = solidDays()[i], host = el("drill");
  if (!d) { host.className = "drill"; return; }
  const T = targets();
  host.className = "drill on";
  const pOk = d.protein_g >= T.protein, kOk = d.kcal >= T.kcal_lo && d.kcal <= T.kcal_hi;
  host.innerHTML =
    '<div class="dh"><div class="dd">' + new Date(d.date).toLocaleDateString("en-GB",
      { weekday: "short", day: "numeric", month: "short" }) + '</div>' +
    (d.day_type ? '<div class="dt">' + d.day_type + '</div>' : '') +
    (d.confidence === "corrected" ? '<div class="dt">corrected</div>' : '') + '</div>' +
    '<div class="dm">' +
      '<span style="color:' + (pOk ? "var(--good)" : "var(--bad)") + '"><b>' + r1(d.protein_g) + '</b> g P</span>' +
      '<span style="color:' + (kOk ? "var(--good)" : "var(--warn)") + '"><b>' + d.kcal.toLocaleString() + '</b> kcal</span>' +
      '<span><b>' + r1(d.carbs_g ?? 0) + '</b> g C</span>' +
      '<span><b>' + r1(d.fat_g ?? 0) + '</b> g F</span>' +
      (d.weight_kg != null ? '<span><b>' + d.weight_kg + '</b> kg</span>' : '') +
    '</div>' +
    (d.notes ? '<div class="dn">' + escapeHtml(d.notes) + '</div>' : '');
}

const escapeHtml = s => String(s).replace(/[&<>"]/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export function rebuildChart() {
  const cv = el("ch"); if (!cv || typeof Chart === "undefined") return;
  const T = targets(), d = solidDays();
  if (chart) { chart.destroy(); chart = null; }
  if (!d.length) return;

  const labels = d.map(r => r.date.slice(5));
  const pLo = Math.round(T.protein * (1 - FRAC)), pHi = Math.round(T.protein * (1 + FRAC));
  const kLo = Math.round(T.kcal * (1 - FRAC)), kHi = Math.round(T.kcal * (1 + FRAC));

  const sets = [];
  if (S.series !== "k") sets.push({
    label: "protein g", data: d.map(r => r.protein_g), yAxisID: "y",
    borderColor: "#e07b45", backgroundColor: "rgba(224,123,69,.12)",
    borderWidth: 2, pointRadius: 0, tension: .25, fill: true
  });
  if (S.series !== "p") sets.push({
    label: "kcal", data: d.map(r => r.kcal), yAxisID: "y2",
    borderColor: "#6a9bd1", backgroundColor: "rgba(106,155,209,.10)",
    borderWidth: 2, pointRadius: 0, tension: .25, fill: true
  });

  chart = new Chart(cv, {
    type: "line",
    data: { labels, datasets: sets },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      onClick: (e, els) => { if (els.length) showDay(els[0].index); },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#1a1a1f", borderColor: "#33333d", borderWidth: 1,
          titleColor: "#e8e6e1", bodyColor: "#8d8d97", padding: 9, displayColors: false,
          callbacks: { afterBody: ctx => {
            const r = d[ctx[0].dataIndex];
            return r.day_type ? r.day_type : "";
          } }
        }
      },
      scales: {
        x: { grid: { color: "#1e1e25", drawBorder: false },
             ticks: { color: "#5c5c66", font: { size: 10.5 }, maxTicksLimit: 10 } },
        y: { position: "left", min: pLo, max: pHi,
             grid: { color: "#1e1e25", drawBorder: false },
             ticks: { color: "#5c5c66", font: { size: 10.5 } } },
        y2: { position: "right", min: kLo, max: kHi,
              grid: { display: false, drawBorder: false },
              ticks: { color: "#5c5c66", font: { size: 10.5 } } }
      }
    }
  });

  el("legend").innerHTML =
    '<span><i style="background:#e07b45"></i>protein · floor ' + T.protein + ' g</span>' +
    '<span><i style="background:#6a9bd1"></i>kcal · target ' + T.kcal.toLocaleString() + '</span>' +
    '<span style="color:var(--dim)">both axes centred on target · tap a point for the day</span>';
}

export function setSeries(s) {
  S.series = s;
  ["both", "p", "k"].forEach(k => el("c-" + k).setAttribute("aria-pressed", String(k === s)));
  rebuildChart();
}
