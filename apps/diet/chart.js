/* chart.js — the consistency chart and its stats.

   🚩 THE BIGGEST SINGLE CHANGE IN THE PORT.
   The artifact carried a hardcoded `SEED` array of 29 days, re-seeded by hand
   and backstopped by a weekly scheduled task, because a sandboxed artifact
   cannot read a file. That is also how it once shipped completely blank: a
   stray double comma made a sparse array hole, legal JavaScript that killed
   the page at runtime. There is no SEED any more.

   🚩 AND THE FIX THAT MATTERS MORE THAN ANY OF THE VISUALS.
   Block 02 handoff §4: "Do not retroactively score historical days against
   2,780. It would show a fabricated collapse in adherence on the day the target
   changed." The first build did exactly that and reported 5% band adherence.
   Every score below now uses the band IN FORCE ON THAT DAY, the target line is
   drawn as a STEP, and the change is marked on the x-axis.

   ── Why the axes are set the way they are ──
   Protein on y, calories on y2, both centred on the CURRENT target with the same
   proportional half-range. A day on plan for both puts the two lines on top of
   each other, so any separation is immediately attributable to one or the other. */

import { S, el, r1, targets } from "./state.js";
import { bandOn, PLAN_CHANGES } from "../../shared/targets.js";

/* 🚩 AXES REBUILT 18 Aug 2026 — THIRD ATTEMPT, and the first two were wrong in
   the same way. Sam: "make the low bound zero or just… I just wanna see, like,
   two flowing lines."

   The old scheme centred each axis on its target with a ±42% half-range. The
   idea was that an on-plan day puts the lines on top of each other — sound in
   theory, awful in practice: a 90 g protein day fell BELOW the axis floor and
   the line vanished off the bottom, which is why the chart read as jagged and
   broken rather than as a trend.

   Both axes now start at ZERO and top out at the same MULTIPLE of their target,
   so the on-plan alignment property survives while every real value stays on
   screen. Nothing clips, and the two series read as two flowing lines. */
const HEAD = 1.35;   // axis max as a multiple of target, same for both series
const grade = r => r >= 80 ? "#7fb069" : r >= 60 ? "#d9a441" : "#e2585a";
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
const C_PROT = "#e07b45", C_KCAL = "#6a9bd1";

let chart = null;

export const solidDays = () => S.history.filter(r => r.kcal != null && r.protein_g != null);

/* The visible window. Wheel zooms it, drag pans it. Null = show everything. */
let win = null;
const windowed = d => win ? d.slice(win.a, win.b) : d;

/* ── STATS, scored era by era ─────────────────────────────────────────────── */
export function stats() {
  const d = solidDays();
  if (!d.length) return { n: 0, eras: [], pRate: 0, pMean: 0 };

  /* Protein is continuous across the whole history — safe to score as one series.
     Calories are not, so they are grouped by the era each day fell in. */
  const T = targets();
  const pIn = d.filter(r => r.protein_g >= T.protein).length;

  const byEra = new Map();
  d.forEach(r => {
    const era = bandOn(r.date);
    if (!byEra.has(era.label)) byEra.set(era.label, { era, days: [] });
    byEra.get(era.label).days.push(r);
  });

  const eras = [...byEra.values()].map(({ era, days }) => {
    const inBand = days.filter(r => r.kcal >= era.kcal_lo && r.kcal <= era.kcal_hi).length;
    return {
      label: era.label, band: era.kcal_lo + "–" + era.kcal_hi, target: era.kcal,
      n: days.length, inBand, rate: Math.round(inBand / days.length * 100),
      kMean: Math.round(mean(days.map(r => r.kcal))),
      gap: Math.round(mean(days.map(r => r.kcal)) - era.kcal)
    };
  });

  return {
    n: d.length,
    pRate: Math.round(pIn / d.length * 100),
    pMean: Math.round(mean(d.map(r => r.protein_g))),
    eras
  };
}

export function drawStats() {
  const s = stats(), T = targets(), host = el("stats");
  if (!s.n) { host.innerHTML = '<div class="st"><div class="v">—</div><div class="k">no logged days yet</div></div>'; return; }

  const cur = s.eras[s.eras.length - 1];
  const prev = s.eras.length > 1 ? s.eras[0] : null;

  host.innerHTML =
    '<div class="st"><div class="v" style="color:' + grade(s.pRate) + '">' + s.pRate + '%</div>' +
      '<div class="k">hit the ' + T.protein + ' g floor · all ' + s.n + ' days</div></div>' +
    '<div class="st"><div class="v">' + s.pMean + '</div><div class="k">mean protein g</div></div>' +
    s.eras.map(e =>
      '<div class="st"><div class="v" style="color:' + grade(e.rate) + '">' + e.rate + '%</div>' +
      '<div class="k">' + e.label + ' band ' + e.band + ' (' + e.inBand + '/' + e.n + ')</div></div>' +
      '<div class="st"><div class="v">' + e.kMean.toLocaleString() + '</div>' +
      '<div class="k">' + e.label + ' mean kcal · ' + (e.gap >= 0 ? "+" : "") + e.gap + ' vs ' +
      e.target.toLocaleString() + '</div></div>').join("");

  /* ⚠ The line the first build got wrong, stated so it stays fixed.
     Shown whenever a plan change exists — not only once both sides have data —
     because the most useful moment to read it is BEFORE the new era has any. */
  const T2 = targets();
  const note = s.eras.length > 1
    ? 'Calories are scored against the band in force that day — ' +
      s.eras.map(e => e.label + ' at ' + e.band).join(', ') + '. ' +
      'Scoring the whole history against ' + T2.kcal.toLocaleString() +
      ' would invent a collapse on the day the plan changed.'
    : 'All ' + s.n + ' logged days fall in <b>' + cur.label + '</b> and are scored against its ' +
      'own band, ' + cur.band + '. The plan changed on 14 Aug to ' + T2.kcal.toLocaleString() +
      ' kcal — <b>there is no data under it yet</b>. Scoring these days against the new number ' +
      'would invent a collapse on the day the plan changed, which is what the first build did.';
  el("stats").insertAdjacentHTML("beforeend", '<div class="eranote">' + note + '</div>');
}

export function showDay(i) {
  const d = windowed(solidDays())[i], host = el("drill");
  if (!d) { host.className = "drill"; return; }
  const era = bandOn(d.date);
  host.className = "drill on";
  const pOk = d.protein_g >= era.protein, kOk = d.kcal >= era.kcal_lo && d.kcal <= era.kcal_hi;
  host.innerHTML =
    '<div class="dh"><div class="dd">' + new Date(d.date).toLocaleDateString("en-GB",
      { weekday: "short", day: "numeric", month: "short" }) + '</div>' +
    (d.day_type ? '<div class="dt">' + d.day_type + '</div>' : '') +
    '<div class="dt">' + era.label + '</div>' +
    (d.confidence === "corrected" ? '<div class="dt">corrected</div>' : '') + '</div>' +
    '<div class="dm">' +
      '<span style="color:' + (pOk ? "var(--good)" : "var(--bad)") + '"><b>' + r1(d.protein_g) + '</b> g P</span>' +
      '<span style="color:' + (kOk ? "var(--good)" : "var(--warn)") + '"><b>' + d.kcal.toLocaleString() + '</b> kcal</span>' +
      '<span><b>' + r1(d.carbs_g ?? 0) + '</b> g C</span>' +
      '<span><b>' + r1(d.fat_g ?? 0) + '</b> g F</span>' +
      (d.weight_kg != null ? '<span><b>' + d.weight_kg + '</b> kg</span>' : '') +
    '</div>' +
    '<div class="dn" style="color:var(--dim)">judged against ' + era.label + ': ' +
      era.kcal_lo + '–' + era.kcal_hi + ' kcal, ' + era.protein + ' g floor</div>' +
    (d.notes ? '<div class="dn">' + escapeHtml(d.notes) + '</div>' : '');
}

const escapeHtml = s => String(s).replace(/[&<>"]/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* ── The plan-change marker. A custom plugin rather than a vendored annotation
      library — one vertical dashed rule and a label is not worth 40 KB. ── */
const planMarker = {
  id: "planMarker",
  afterDatasetsDraw(c) {
    const dates = c.$planDates || [];
    const x = c.scales.x, ctx = c.ctx;
    PLAN_CHANGES.forEach(pc => {
      /* ⚠ First logged day ON OR AFTER the change, not an exact match. Nothing
         was logged on 14 Aug itself, so an indexOf lookup drew nothing at all
         and the whole feature silently did not exist. */
      const i = dates.findIndex(d => d >= pc.date);
      if (i < 0) return;
      const px = x.getPixelForValue(i);
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = "#8d8d97"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(px, c.chartArea.top); ctx.lineTo(px, c.chartArea.bottom); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#8d8d97";
      ctx.font = "600 9.5px ui-sans-serif, system-ui";
      ctx.textAlign = px > (c.chartArea.left + c.chartArea.right) / 2 ? "right" : "left";
      ctx.fillText("plan change · " + pc.label,
        px + (ctx.textAlign === "right" ? -5 : 5), c.chartArea.top + 11);
      ctx.restore();
    });
  }
};

export function rebuildChart() {
  const cv = el("ch"); if (!cv || typeof Chart === "undefined") return;
  const T = targets(), all = solidDays();
  if (chart) { chart.destroy(); chart = null; }
  if (!all.length) return;

  const d = windowed(all);
  const labels = d.map(r => r.date.slice(5));
  /* Zero floor. Ceiling is target × HEAD, lifted if real data would clip it —
     a chart that hides a day is worse than one with a little dead space. */
  const pPeak = Math.max(...d.map(r => r.protein_g), T.protein);
  const kPeak = Math.max(...d.map(r => r.kcal), T.kcal);
  const head = Math.max(HEAD, pPeak / T.protein * 1.06, kPeak / T.kcal * 1.06);
  const pLo = 0, pHi = Math.ceil(T.protein * head / 10) * 10;
  const kLo = 0, kHi = Math.ceil(T.kcal * head / 100) * 100;

  /* Stepped target lines — the whole point of the era model made visible. */
  const targetLine = (pick, colour, axis) => ({
    label: "target", yAxisID: axis,
    data: d.map(r => pick(bandOn(r.date))),
    borderColor: colour, borderWidth: 1.25, borderDash: [5, 4],
    pointRadius: 0, stepped: "before", fill: false, order: 0, tension: 0
  });

  const sets = [];
  if (S.series !== "k") {
    sets.push({ label: "protein g", data: d.map(r => r.protein_g), yAxisID: "y",
      borderColor: C_PROT, backgroundColor: "rgba(224,123,69,.12)",
      borderWidth: 2, pointRadius: 0, pointHitRadius: 14, tension: .4, cubicInterpolationMode: "monotone",
      fill: true, order: 2, spanGaps: true });
    sets.push(targetLine(e => e.protein, C_PROT, "y"));
  }
  if (S.series !== "p") {
    sets.push({ label: "kcal", data: d.map(r => r.kcal), yAxisID: "y2",
      borderColor: C_KCAL, backgroundColor: "rgba(106,155,209,.10)",
      borderWidth: 2, pointRadius: 0, pointHitRadius: 14, tension: .4, cubicInterpolationMode: "monotone",
      fill: true, order: 2, spanGaps: true });
    sets.push(targetLine(e => e.kcal, C_KCAL, "y2"));
  }

  chart = new Chart(cv, {
    type: "line",
    data: { labels, datasets: sets },
    plugins: [planMarker],
    options: {
      responsive: true, maintainAspectRatio: false,
      resizeDelay: 60,
      animation: false,   // gestures redraw per frame; tweening would fight them
      layout: { padding: { top: 4, right: 2, bottom: 0, left: 0 } },
      interaction: { mode: "index", intersect: false },
      onClick: (e, els) => { if (els.length) showDay(els[0].index); },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#1a1a1f", borderColor: "#33333d", borderWidth: 1,
          titleColor: "#e8e6e1", bodyColor: "#8d8d97", padding: 9, displayColors: false,
          filter: it => it.dataset.label !== "target",
          callbacks: { afterBody: ctx => {
            const r = d[ctx[0].dataIndex], era = bandOn(r.date);
            return [(r.day_type || "") + (r.day_type ? " · " : "") + era.label,
                    era.kcal_lo + "–" + era.kcal_hi + " kcal · " + era.protein + " g floor"];
          } }
        }
      },
      scales: {
        x: { grid: { color: "#1e1e25", drawBorder: false },
             ticks: { color: "#5c5c66", font: { size: 10.5 }, maxTicksLimit: 9,
                      maxRotation: 0, autoSkipPadding: 12 } },
        y: { position: "left", min: pLo, max: pHi,
             grid: { color: "#1e1e25", drawBorder: false },
             ticks: { color: "#5c5c66", font: { size: 10.5 }, maxTicksLimit: 6 } },
        y2: { position: "right", min: kLo, max: kHi,
              grid: { display: false, drawBorder: false },
              ticks: { color: "#5c5c66", font: { size: 10.5 }, maxTicksLimit: 6 } }
      }
    }
  });

  chart.$planDates = d.map(r => r.date);
  chart.update("none");

  el("legend").innerHTML =
    '<span><i style="background:' + C_PROT + '"></i>protein</span>' +
    '<span><i style="background:' + C_KCAL + '"></i>kcal</span>' +
    '<span><i class="dash"></i>target</span>' +
    '<span class="wlabel">' + windowLabel() + '</span>' +
    '<span style="color:var(--dim)">scroll to zoom · drag to pan' +
      (win ? ' · <b id="zreset" style="color:var(--accent);cursor:pointer">reset</b>' : '') + '</span>';
  const zr = el("zreset"); if (zr) zr.onclick = () => { win = null; rebuildChart(); };
}

/* ── Wheel zoom and drag pan ──────────────────────────────────────────────
   Sam: "the scrolling is, like, too violent, and it's not kind of intuitive
   what you're scrolling or looking at."

   Both complaints, fixed separately:

   · VIOLENT — one wheel notch used to change the window by 25%, and a trackpad
     emits notches in bursts, so a flick went from 40 days to 6. Steps are now
     ~4% per notch and normalised across deltaMode, so a mouse wheel and a
     trackpad feel the same.
   · NOT INTUITIVE — nothing told you what you were looking at. The legend now
     names the visible range and its day count, live, and Chart.js redraws are
     coalesced into one per animation frame so the motion is continuous rather
     than stepped. */

/* 1.08 per notch. 1.25 was violent — a flick went from 40 days to 6. 1.04 was
   the overcorrection: 36 notches to get from 40 days down to 10, which is its
   own kind of unusable. 1.08 makes that journey ~18 notches, about one
   comfortable scroll. Scroll UP zooms IN, matching every map you have used. */
const ZOOM_PER_NOTCH = 1.08;
let raf = null;
const schedule = () => { if (!raf) raf = requestAnimationFrame(() => { raf = null; rebuildChart(); }); };

export function windowLabel() {
  const all = solidDays(); if (!all.length) return "";
  const d = windowed(all);
  const fmt = iso => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return win
    ? fmt(d[0].date) + " → " + fmt(d[d.length - 1].date) + " · " + d.length + " of " + all.length + " days"
    : fmt(d[0].date) + " → " + fmt(d[d.length - 1].date) + " · all " + all.length + " days";
}

export function wireChartGestures() {
  const box = el("chartbox"); if (!box) return;

  /* Normalise wheel deltas: deltaMode 0 = pixels (trackpad), 1 = lines, 2 = pages. */
  const notches = e => {
    const px = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
    return px / 100;
  };

  box.addEventListener("wheel", e => {
    const n = solidDays().length; if (n < 8) return;
    e.preventDefault();
    const cur = win || { a: 0, b: n };
    const span = cur.b - cur.a;
    const rect = box.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));

    const next = span * Math.pow(ZOOM_PER_NOTCH, notches(e));
    const clamped = Math.max(5, Math.min(n, Math.round(next)));
    if (clamped >= n) { if (win) { win = null; schedule(); } return; }
    if (clamped === span && win) return;          // below one day of change, do nothing

    const anchor = cur.a + span * frac;           // keep the day under the cursor put
    let a = Math.round(anchor - clamped * frac);
    a = Math.max(0, Math.min(n - clamped, a));
    win = { a, b: a + clamped };
    schedule();
  }, { passive: false });

  /* Drag to pan. Works at any zoom; at full view there is nowhere to go, so the
     cursor stays a crosshair rather than promising something it cannot do. */
  let drag = null;
  box.addEventListener("pointerdown", e => {
    if (!win) return;
    drag = { x: e.clientX, a: win.a, moved: false };
    box.setPointerCapture(e.pointerId);
    box.style.cursor = "grabbing";
  });
  box.addEventListener("pointermove", e => {
    if (!drag || !win) return;
    const n = solidDays().length, span = win.b - win.a;
    const perPx = span / box.clientWidth;
    let a = Math.round(drag.a - (e.clientX - drag.x) * perPx);
    a = Math.max(0, Math.min(n - span, a));
    if (a !== win.a) { win = { a, b: a + span }; drag.moved = true; schedule(); }
  });
  const end = () => { drag = null; box.style.cursor = ""; };
  box.addEventListener("pointerup", end);
  box.addEventListener("pointercancel", end);
  box.addEventListener("dblclick", () => { if (win) { win = null; schedule(); } });
}

export function setSeries(s) {
  S.series = s;
  ["both", "p", "k"].forEach(k => el("c-" + k).setAttribute("aria-pressed", String(k === s)));
  rebuildChart();
}
