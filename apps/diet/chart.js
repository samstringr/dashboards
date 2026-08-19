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
   Every score below uses the band IN FORCE ON THAT DAY, the target line is
   drawn as a STEP, and the change is marked on the x-axis.

   ── 19 Aug 2026 · FOURTH ATTEMPT AT THE PLAN-CHANGE LINE, and the first three
      failed for a reason no amount of styling would have fixed ──
   Sam, four times now: "all I want is a bisector of the x axis, a vertical line
   which corresponds to the date of when the diet change happened."

   It was implemented. It was pixel-tested. It drew 81 marker-coloured pixels in
   the harness. And on the live site it drew NOTHING, because:

     the x-axis was built from LOGGED DAYS ONLY,
     the last logged day is 12 Aug,
     the plan changed on 14 Aug,
     so `dates.findIndex(d => d >= "2026-08-14")` returned -1 and the plugin
     returned early on every single frame.

   The harness passed because `steptest.mjs` injects eight synthetic Block 02
   days before it looks. It proved the code works when the date is on the axis.
   It never asked whether the date is on the axis. 🚩 THE TEST AND THE LIVE SITE
   WERE LOOKING AT DIFFERENT AXES.

   The fix is structural, not cosmetic: the x-axis is no longer "days I logged",
   it is a TIMELINE — logged days, plus every plan-change date, plus today. A
   plan change gets a slot on the axis whether or not anything was eaten on it,
   so the line always has somewhere to stand. Slots with no row carry null and
   draw no point; the target line still steps there, which is the whole point.

   ── And the trend lines are gone ──
   Sam: "I don't want the trend lines." They were least-squares fits drawn per
   era. Six lines on one chart, four of them derived, is not a chart you read at
   a glance. Two data lines, two stepped target lines, one vertical rule. */

import { S, el, r1, targets } from "./state.js";
import { bandOn, PLAN_CHANGES } from "../../shared/targets.js";

/* 🚩 AXES REBUILT 18 Aug 2026 — THIRD ATTEMPT, and the first two were wrong in
   the same way. Sam: "make the low bound zero or just… I just wanna see, like,
   two flowing lines."

   The old scheme centred each axis on its target with a ±42% half-range. Sound
   in theory — an on-plan day puts the lines on top of each other — awful in
   practice: a 90 g protein day fell BELOW the axis floor and vanished off the
   bottom, which is why the chart read as broken rather than as a trend.

   Both axes now start at ZERO and top out at the same MULTIPLE of their target,
   so the on-plan alignment property survives while every real value stays on
   screen. */
const HEAD = 1.35;   // axis max as a multiple of target, same for both series
const grade = r => r >= 80 ? "#7fb069" : r >= 60 ? "#d9a441" : "#e2585a";
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
const C_PROT = "#e07b45", C_KCAL = "#6a9bd1";

/* The rule's colour. Read from --plan rather than written here, because
   design-system.md is binding and a colour declared in two places drifts.

   19 Aug 2026: was ink white, which Sam wanted changed — fair, since white on
   near-black is what the chart's own border is made of, so the rule read as
   part of the frame. Violet is the one hue the palette was not already using.
   Deliberately NOT the accent and NOT --cool: those ARE the two data series,
   and a mark the colour of a series gets read as a series. */
const cssVar = (name, fallback) => {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  } catch { return fallback; }
};
const markColour = () => cssVar("--plan", "#9b85cf");

let chart = null;

export const solidDays = () => S.history.filter(r => r.kcal != null && r.protein_g != null);

const today = () => new Date().toLocaleDateString("en-CA");

/* ── THE TIMELINE ─────────────────────────────────────────────────────────
   Logged days ∪ plan-change dates ∪ today. Sorted, de-duplicated, each slot
   carrying its row or null.

   Why today is in there: without it, a plan change with nothing logged after it
   lands on the LAST slot, which is the right-hand border of the plot — a line
   drawn exactly on the frame, indistinguishable from the frame. Adding today
   guarantees at least one slot to the right of the newest change, so the rule
   always sits INSIDE the chart where it can be seen. It also happens to be
   honest: the gap between the last logged day and today is real information. */
export function frame(days) {
  const rows = new Map(days.map(r => [r.date, r]));
  const dates = new Set(rows.keys());
  PLAN_CHANGES.forEach(pc => dates.add(pc.date));

  /* The NEWEST era always shows its full calendar span, change date → today.
     Two reasons, and the second is the one that made the feature work:
       · the days since the plan changed with nothing logged are real, and an
         empty run is exactly what they should look like;
       · it guarantees several slots to the RIGHT of the rule, so the rule sits
         inside the plot instead of on top of the right-hand border. With only
         the logged days on the axis, 14 Aug landed on the last slot and the
         line was drawn on the frame — invisible, whatever colour it was.
     ⚠ Capped at CAL_FILL days so an old plan change cannot flood the axis with
     empty slots and squash the actual data into the left third. */
  const CAL_FILL = 21;
  const last = PLAN_CHANGES.length ? PLAN_CHANGES[PLAN_CHANGES.length - 1].date : null;
  const now = today();
  if (last) {
    for (let k = 0, t = Date.parse(last); k <= CAL_FILL; k++, t += 864e5) {
      const iso = new Date(t).toISOString().slice(0, 10);
      if (iso > now) break;
      dates.add(iso);
    }
  }
  dates.add(now);
  return [...dates].sort().map(date => ({ date, row: rows.get(date) || null }));
}

/* The visible window, in TIMELINE indices. Wheel zooms it, drag pans it. */
let win = null;
const windowed = f => win ? f.slice(win.a, win.b) : f;
const timeline = () => frame(solidDays());

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
  const slot = windowed(timeline())[i], host = el("drill");
  const d = slot && slot.row;
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

/* ── THE PLAN-CHANGE RULE ─────────────────────────────────────────────────
   A custom plugin rather than a vendored annotation library — one vertical rule
   and a label is not worth 40 KB.

   Drawn LOUD on purpose. The previous version was a 1px #8d8d97 dashed hairline,
   which even when it did draw was a whisper. This is 2px, ink-coloured, solid,
   full plot height, with a filled chip carrying the date. Sam has asked for it
   four times; it is now the most visible thing on the chart. */
const planMarker = {
  id: "planMarker",
  afterDatasetsDraw(c) {
    const dates = c.$planDates || [];
    const x = c.scales.x, ctx = c.ctx, area = c.chartArea;
    PLAN_CHANGES.forEach(pc => {
      /* Exact match first — the timeline guarantees the date has a slot. The
         >= fallback survives a window that starts after the change. */
      let i = dates.indexOf(pc.date);
      if (i < 0) i = dates.findIndex(d => d >= pc.date);
      if (i < 0) return;
      const px = x.getPixelForValue(i);
      if (px < area.left - 1 || px > area.right + 1) return;

      const col = markColour();
      ctx.save();
      ctx.strokeStyle = col; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(px, area.top); ctx.lineTo(px, area.bottom); ctx.stroke();

      /* Chip, placed on whichever side has room so it never runs off the plot. */
      const txt = "plan change · " + new Date(pc.date)
        .toLocaleDateString("en-GB", { day: "numeric", month: "short" });
      ctx.font = "600 10px ui-sans-serif, system-ui, sans-serif";
      const w = ctx.measureText(txt).width + 12, h = 16;
      const left = px + 4 + w <= area.right;
      const bx = left ? px + 4 : px - 4 - w;
      ctx.fillStyle = col;
      if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(bx, area.top + 3, w, h, 4); ctx.fill(); }
      else ctx.fillRect(bx, area.top + 3, w, h);
      ctx.fillStyle = cssVar("--bg", "#0c0c0f");
      ctx.textAlign = "left"; ctx.textBaseline = "middle";
      ctx.fillText(txt, bx + 6, area.top + 3 + h / 2 + .5);
      ctx.restore();
    });
  }
};

export function rebuildChart() {
  const cv = el("ch"); if (!cv || typeof Chart === "undefined") return;
  const T = targets(), all = timeline();
  if (chart) { chart.destroy(); chart = null; }
  if (!solidDays().length) return;

  const f = windowed(all);
  const labels = f.map(s => s.date.slice(5));
  const rows = f.map(s => s.row).filter(Boolean);

  /* Zero floor. Ceiling is target × HEAD, lifted if real data would clip it —
     a chart that hides a day is worse than one with a little dead space. */
  const pPeak = Math.max(T.protein, ...rows.map(r => r.protein_g));
  const kPeak = Math.max(T.kcal, ...rows.map(r => r.kcal));
  const head = Math.max(HEAD, pPeak / T.protein * 1.06, kPeak / T.kcal * 1.06);
  const pHi = Math.ceil(T.protein * head / 10) * 10;
  const kHi = Math.ceil(T.kcal * head / 100) * 100;

  /* Stepped target lines — the era model made visible. These are drawn on EVERY
     slot including the empty ones, which is what makes the step land exactly on
     the change date rather than on the next day that happened to be logged. */
  const targetLine = (pick, colour, axis) => ({
    label: "target", yAxisID: axis,
    data: f.map(s => pick(bandOn(s.date))),
    borderColor: colour, borderWidth: 1.25, borderDash: [5, 4],
    pointRadius: 0, stepped: "before", fill: false, order: 0, tension: 0
  });

  const dataLine = (label, pick, colour, fillRgba, axis) => ({
    label, yAxisID: axis, data: f.map(s => s.row ? pick(s.row) : null),
    borderColor: colour, backgroundColor: fillRgba,
    borderWidth: 2, pointRadius: 0, pointHitRadius: 14,
    tension: .4, cubicInterpolationMode: "monotone",
    fill: true, order: 2, spanGaps: true
  });

  const sets = [];
  if (S.series !== "k") {
    sets.push(dataLine("protein g", r => r.protein_g, C_PROT, "rgba(224,123,69,.12)", "y"));
    sets.push(targetLine(e => e.protein, C_PROT, "y"));
  }
  if (S.series !== "p") {
    sets.push(dataLine("kcal", r => r.kcal, C_KCAL, "rgba(106,155,209,.10)", "y2"));
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
          filter: it => it.dataset.label !== "target" && it.raw != null,
          callbacks: { afterBody: ctx => {
            const s = f[ctx[0].dataIndex]; if (!s || !s.row) return [];
            const era = bandOn(s.date);
            return [(s.row.day_type || "") + (s.row.day_type ? " · " : "") + era.label,
                    era.kcal_lo + "–" + era.kcal_hi + " kcal · " + era.protein + " g floor"];
          } }
        }
      },
      scales: {
        x: { grid: { color: "#1e1e25", drawBorder: false },
             ticks: { color: "#5c5c66", font: { size: 10.5 }, maxTicksLimit: 9,
                      maxRotation: 0, autoSkipPadding: 12 } },
        y: { position: "left", min: 0, max: pHi,
             grid: { color: "#1e1e25", drawBorder: false },
             ticks: { color: "#5c5c66", font: { size: 10.5 }, maxTicksLimit: 6 } },
        y2: { position: "right", min: 0, max: kHi,
              grid: { display: false, drawBorder: false },
              ticks: { color: "#5c5c66", font: { size: 10.5 }, maxTicksLimit: 6 } }
      }
    }
  });

  chart.$planDates = f.map(s => s.date);
  chart.update("none");

  el("legend").innerHTML =
    '<span><i style="background:' + C_PROT + '"></i>protein</span>' +
    '<span><i style="background:' + C_KCAL + '"></i>kcal</span>' +
    '<span><i class="dash"></i>target</span>' +
    '<span><i class="rule"></i>plan change</span>' +
    '<span class="wlabel">' + windowLabel() + '</span>' +
    '<span style="color:var(--dim)">scroll to zoom · drag to pan' +
      (win ? ' · <b id="zreset" style="color:var(--accent);cursor:pointer">reset</b>' : '') + '</span>';
  const zr = el("zreset"); if (zr) zr.onclick = () => { win = null; rebuildChart(); };
}

/* ── Wheel zoom and drag pan ──────────────────────────────────────────────
   Sam: "the scrolling is, like, too violent, and it's not kind of intuitive
   what you're scrolling or looking at."

   · VIOLENT — one wheel notch used to change the window by 25%, and a trackpad
     emits notches in bursts, so a flick went from 40 days to 6. Steps are now
     ~8% per notch and normalised across deltaMode, so a mouse wheel and a
     trackpad feel the same.
   · NOT INTUITIVE — the legend now names the visible range and its day count,
     live, and redraws are coalesced into one per animation frame. */

/* 1.08 per notch. 1.25 was violent — a flick went from 40 days to 6. 1.04 was
   the overcorrection: 36 notches to get from 40 days down to 10. 1.08 makes
   that journey ~18 notches, about one comfortable scroll. Scroll UP zooms IN. */
const ZOOM_PER_NOTCH = 1.08;
let raf = null;
const schedule = () => { if (!raf) raf = requestAnimationFrame(() => { raf = null; rebuildChart(); }); };

export function windowLabel() {
  const all = timeline(); if (!all.length) return "";
  const f = windowed(all);
  const n = all.filter(s => s.row).length, vis = f.filter(s => s.row).length;
  const fmt = iso => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return win
    ? fmt(f[0].date) + " → " + fmt(f[f.length - 1].date) + " · " + vis + " of " + n + " logged days"
    : fmt(f[0].date) + " → " + fmt(f[f.length - 1].date) + " · all " + n + " logged days";
}

export function wireChartGestures() {
  const box = el("chartbox"); if (!box) return;

  /* Normalise wheel deltas: deltaMode 0 = pixels (trackpad), 1 = lines, 2 = pages. */
  const notches = e => {
    const px = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
    return px / 100;
  };

  box.addEventListener("wheel", e => {
    const n = timeline().length; if (n < 8) return;
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

  /* Drag to pan. Works at any zoom; at full view there is nowhere to go. */
  let drag = null;
  box.addEventListener("pointerdown", e => {
    if (!win) return;
    drag = { x: e.clientX, a: win.a, moved: false };
    box.setPointerCapture(e.pointerId);
    box.style.cursor = "grabbing";
  });
  box.addEventListener("pointermove", e => {
    if (!drag || !win) return;
    const n = timeline().length, span = win.b - win.a;
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
