# Health & Fitness dashboard

The dashboard Sam uses every day, published as a Claude artifact ("Wellbeing Dashboard"). It reads and
writes **Health DB** (`../worker/`) through the Health DB connector, so the Telegram bot, the dashboard and
Claude chats all see the same days.

`health-fitness.html` **is** the published page: one self-contained file, because an artifact has to be.
Everything else here is how that file is built and checked.

| Path | What it is |
|---|---|
| `health-fitness.html` | The page. Widgets, canvas, sheets, coach, strength model, quotes, Help. The 3D bundle is inlined into it by `build.py` |
| `src/fig3d/` | The physique figure: `body.js` turns the baked atlas mesh into a smooth mannequin shaped by lean and fat mass; `view.js` draws it, paints muscles by strength level and adds definition shading; `map.js` draws the same body flat, front and back, for the Muscle development chart |
| `src/mq/` | The lift form demos: the choreography rig (`rig.js`), the lift table and muscle shares (`lifts.js`), one demo per exercise (`demos*.js`), the renderer (`mann.js`) and `skin.js`, which copies the rig's angles onto the physique body each frame so the demos play on Sam's own figure |
| `src/atlas/` | The baked body (`body.b64`), its decoder, and `bake.mjs`, which made it. See `ATTRIBUTION.md`: the mesh is CC BY-SA 4.0 |
| `vendor/three.min.js` | three.js r128 (MIT), only for tests. The page itself loads it from cdnjs |
| `build.py` | Builds the 3D bundle from `src/` and inlines it into the page |
| `test/ui.mjs` | Drives the real page in Chromium against a local worker: layout, logging, sheets, 3D, phone layout |

## Working on it

1. Edit `src/` for the 3D, or `health-fitness.html` for everything else.
2. `python3 build.py` (only needed after a `src/` change; says so if nothing changed).
3. Run the tests, desktop and phone (instructions at the top of `test/ui.mjs`). Both must print `ALL PASSED`.
4. Publish the file to the existing artifact so its link stays the same.

## Why it is built this way

- **Not split into modules like `apps/diet`.** The 400-line rule in `CLAUDE.md` applies to `src/`; an artifact
  cannot load sibling files, so the page stays one file and the 3D lives in `src/` until it is built in.
- **The atlas, not a hand-made figure.** The earlier hand-built (SDF) figures looked crude; Sam asked for a smooth
  mannequin like his reference picture. A real scanned body, smoothed, shows the difference between now,
  4 weeks and the goal.
- **The test seed is not committed.** It is a real Health DB export, i.e. Sam's own history, and this repo is
  public. Any `get_snapshot` output works as `HF_SEED`.
- **The demos play on the physique body (13 Nov 2026).** Sam asked for it. Each demo is still choreographed on the simple rig, because joint-by-joint authoring is what got the form right; `skin.js` only retargets: torso turns, shoulder girdle, hands and feet placed where the rig puts them. If the body can't load, the old jointed mannequin is the fallback.
- **Stacking and skin (13 Nov 2026).** Presses are authored as two directions, where the upper arm puts the elbow and where the load travels, so the forearm can't drift off the line of force (Sam saw the incline press elbows cave). The skin weights now match across the armpit seam; before, the arm side followed the upper arm fully and the torso side stayed put, which pulled fins down the lats on any overhead or wide-arm movement.
- **The armpit, again (14 Nov 2026).** The first seam fix gave the torso skin near the armpit the full shoulder-bone weight, which pushed the lats out like wings ("a bat" on the hanging leg raise). Both sides of the seam now carry a small equal share (0.2), chosen by rendering 0, 0.2 and 0.4 side by side: 0 shows the fins, 0.4 the wings, 0.2 neither.
- **Hands.** The physique's fingers bend at the knuckles and again halfway along, so a grip closes into a fist; the grip point (`GRIP`, `GX` in `demos.js`) was re-measured on that fist, so bars and handles sit inside the hand.
- **Variants.** `lifts.js` groups demos that are one movement done differently (squat or leg press; seated row close, shoulder-width or wide; pullover on an incline bench with a bar or standing with a rope; pushdown standing or kneeling; overhead extension standing, kneeling or the two-cable katana; cable curl facing away, facing the cable or reverse grip; shrug seated, standing or chest-down on an incline bench; crunch on the decline bench or kneeling at a cable). The exercise name picks the default; the lift widget's toggle switches it and remembers the pick per exercise. The figure turns on drag and zooms on scroll or pinch; scroll over the chart changes its range.
- **Strength levels** come from Strength Level's published standards (male, by bodyweight); the 4-week and
  goal views assume a typical weekly gain for each level and that the split is trained as planned. Muscles
  with no logged lift yet are marked "assumed" in the strength sheet.
- **No secrets and no personal data** are in the page: settings default to empty, and everything personal
  comes from Health DB at runtime.

## 14 Nov 2026: what changed and why

- **One skeleton.** `src/mq/rig.js` `SK` now holds the atlas body's own joint positions and bone lengths.
  WHY: the demo rig had its own proportions (shin 6 cm longer, arm 2 cm, shoulders 4 cm wider), so every pose
  was solved for one body and drawn on another. That one mismatch produced the "jumping" squat, elbows knocking
  at lockout and grips sliding on bars. `toAtlas` (skin.js) now copies the rig's joints straight across.
- **Shoulder skin v3** (`body.js`, `SP`). The top of the shoulder ring follows the collar bone, the armpit is a
  linear blend from chest to upper arm, the ribs follow the girdle bone. WHY: v1 gave wings, v2 (k = 0.2) gave
  loose skin under the arm that merged the triceps into the lats.
- **Muscles contract.** Each vertex carries `wk` (how much its muscle works in this lift); the material's
  `uFlex` (0 long, 1 short) pushes those vertices out by up to 13 mm and dulls the colour when long.
  Not done: the three triceps heads as separate shapes; the atlas paints the triceps as one region.
- **Linked widgets.** `selectDay(d)` is the one way to change the day (charts call it on click); it pulses the
  widgets that changed. Plan exercise names are `.exlink` buttons that set the lift widget.
- **Consistency grid.** Square cells, stacked in 1–4 bands chosen to fit the box. WHY: stretched cells were
  rejected ("don't squish"); squares at the largest size that fits use the space without distorting.
- **Speed slider** (`mann.js`, 0.25–1.5×, remembered on the device) on every demo.
- **Facing-away cable curl** uses two handles on two pulleys: a bar's single cable has to pass through the hips.
- **Adding an exercise** (Sam, 14 Nov: "every new exercise gets a model, graph, motion path, best form"):
  1. a `demo('key', …)` in `src/mq/demos*.js`, with the footage cues written above it;
  2. `INFO[key]` (muscles, three cues) and a `MATCH` pattern in `lifts.js`; add it to `VARIANTS` if it is a
     set-up of an existing lift, best set-up first (it gets the ★);
  3. an `EXMAP` row in `health-fitness.html` if the name doesn't already match one (weekly sets per muscle);
  4. render a contact sheet at the start, middle and end of the rep from two angles and look at it. A demo that
     parses is not a demo that looks right.
- **One selected day drives every widget** (second pass, same day). `S.sel` is the only state; `selectDay(d)` is the
  only way to change it. `winEnd(n)` / `weekEnd(weeks)` decide where a chart ends: today, unless the selected
  day is older than the chart can show. WHY: charts used to end on the selected day, so the bar you clicked
  jumped to the right edge. `asOf()` is null for today, else the day: `compNow(at)`, `liftBests(days, at)`
  and the Training plan read history up to it, so composition, muscle levels and "last" loads are as they stood.
  A Consistency click no longer opens the side sheet (Sam: "I just want to see it in the Today widget"); the
  sheet is on double-click. `showSession(w)` (Training log click) also opens the session's tab in the plan.
- **Smith machine chest press** (`smithpress`): flat bench, bar on rails, so the forearm is solved each frame to
  keep the hands on one vertical line. No strength standard: Sam logs the plates, and a Smith bar's effective
  weight varies by machine, so a level from it would be a guess.
- **Plan, 14 Nov:** no upright row. S&A: cable upright row → DB lateral raise, reverse pec deck → face pull;
  B&B shrug 2 → 3 sets; C&T machine chest press → Smith machine chest press. Weekly sets: side delts 14.0,
  rear delts 10.5, traps 11.9 → 11.2, everything else unchanged (worked out with the page's own EXMAP).
- **Pulse only on change** (14 Nov, evening). `selectDay` records `widgetKey(id)` for every widget before and
  after; only widgets whose key changed pulse, and never the one clicked (`src`). The key is the rendered title
  and body, unless the type defines `dayKey()` (Composition: the reading shown; Physique and Muscle
  development: the best lifts and bodyweight), where a date label changes but the substance doesn't. The pulse
  is a fading hairline and a 0.45 s fade-in of the content. WHY: Sam, "a little bit more subtle… only do it for
  the widgets that are changing". The Training plan now only follows a day you trained; Lift progress marks the
  selected day only if that lift was done on it.
- **Steps** (`stepsOn(d)`): Training log right-hand axis (weekly average of complete days), tooltip, stats; a
  Metric and Number option; the day sheet. Today's count is "so far" and never averaged.
- **Smith machine chest press, flat and incline** (`smithDemo` in demos7.js). The bar's path comes first: fixed
  grip width, fixed vertical line; the arms are solved to put the grip points on it every frame. WHY: the first
  version hung the bar off wherever the hands landed, so the hands slid along it (Sam: "the grip position is
  changing").
- **Targets and streaks** (15 Nov). `dayHit(d)` is the one rule: protein at its floor (−0.5 g rounding) and
  calories within ±10% (`KCAL_BAND`), each against `targetsOn(d)`, the targets that applied that day (memoised
  per render). Used by the Intake dots (calories: complete days only; protein: today too, since a floor reached
  can't be undone), the Consistency grid (was judged against today's floor) and the Streaks widget. `runOf`:
  true counts, false breaks, null skips (away, void, today unfinished). WHY ±10%: logged calories are only about
  that accurate, and a recomp target is a band. Weekly streaks: gym (plan's sessions a week, rounded down) and
  weigh-ins (3 a week), current week pending until met.
- **Plan, 15 Nov:** DB lateral raise off S&A; cable lateral raise 3 sets on C&T. Side delts 3 + 3 + 3 (+ press)
  across C&T, L and S&A instead of 6 on S&A: same 14.0 a week. Sessions 17 / 19 / 19 / 19 sets. Largest
  per-session load: chest 8.5 on C&T, under the ~11 fractional sets where hypertrophy per session levels off
  (Remmert, Zourdos et al. 2025, SportRxiv preprint).
- **Pop-ups in the middle** (15 Nov). `#sheet` is a centred window on desktop (as tall as its content, 360px
  minimum so forms don't jump, 86% maximum); `.wide` is a fixed 1000 × 86% window (split builder), `.full` the
  photos window. Phones keep the bottom sheet. Was: a 460px panel down the right.
- **Split builder: Per session** (`hf.volView`): a row per muscle, a column per session, the week and its band,
  sets per session at the foot; amber over ~11 sets for one muscle in one session.
- **Fit the box** (`fitWidget`, run after every render and on resize): tighten spacing, then hide `data-fit`
  parts highest level first (`.stats > .dim` count as 1), clip an overflow of 6px or less instead of scrolling,
  and fade the bottom edge of anything that still scrolls; scroll bars only on hover. `data-scroll` marks lists
  meant to scroll (food log, opened details). Streaks: rows 8–5, target line 4, squares 3. Training plan: plan
  name 3, microcycle line 2.
- **Intake**: a hit is a thin green outline round the whole bar (was a dot above it).
- **Edit layout** (15 Nov, `setEditing`). Widgets only move or resize in edit mode (pencil in the zoom controls,
  or E); outside it there are no corners and the canvas never selects text. In edit mode a drag anywhere on a
  widget moves it and the contents are inert. `UNDO` holds the canvas before every change made while editing
  (drags, Fill screen, loading a preset); Ctrl/⌘ Z or the Undo button steps back; Done or Esc ends it. WHY:
  Sam was selecting text and nudging widgets while just using the page.
- **Fill screen** (`fillScreen`): every edge is mapped through one x scale and one y scale to fill the visible
  canvas at the current zoom, then rounded to the grid, so touching widgets stay touching. If any widget would go
  under its minimum (the screen holds less than the layout), it refuses and says to zoom out.
- **Presets** ride in the layout document (`presets: [{name, widgets, view, at}]`); the first load of this
  version saves the canvas as "Default". Until presets have loaded, `saveLayout` leaves the key out rather
  than writing an empty list.
- **Wider pop-ups**: default 600 → 720px; `.wide` (split builder, widget palette, Help) is now nearly the photos
  window (4vh / 6vw margins).
- **Back day as trained from 15 Nov** (`demos8.js`). The chest-supported row is now the Life Fitness plate-loaded
  Row from Sam's photos: saddle seat, tall chest pad, levers pivoting near the floor in front with plates low on
  each, wide (inward bar) and neutral (upright) handles. The pivot sits under the finish, so the hands travel back
  and up as on the machine's sticker. New: `chestrowclose`, `latrow1` (single-arm cable row, lat focus),
  `backext` (45° back extension with a plate), `cablerdf` (cross-body cable rear delt fly). Shrug variants list
  chest-on-bench first. MATCH puts the specific names ahead of the general row and rear-delt patterns.
- **Standing pullover**: the stretch took the arms about 150° overhead with the shoulders shrugged, so the upper
  arms ran into the head (Sam: "clipping or hyperextending"). Now the hands stop at forehead height, shoulders down.
- **Lower back** is a split-builder muscle (`erectors`, keep 4–8): back extension 1, RDL and deadlift ½. EXMAP
  checks shrugs first: "DB shrug (chest-supported)" was being scored as a chest-supported row (lats, upper back).
- **Training log by day (18 Nov 2026).** Sam: "split each week into days… see the different step counts on every day…
  a 10K step target on that axis… if I hover, it's good to see the week". Each week keeps its band (alternate shading,
  its Monday underneath) and gets seven columns: steps as a bar on the right-hand scale, brighter at or over the target
  (dotted line, 10,000, from `stepTarget`: the widget's settings, then `settings.stepTarget`, then 10,000), and the
  day's sessions as squares underneath (green gym, blue cardio, outlined sport). Hover shows the day, then its week;
  a click selects the day everywhere (a day with sessions opens the latest in the Training plan). Below 3 px a day
  (a year on a normal widget) the columns would be hairlines, so it falls back to the weekly totals and average line,
  which get the dotted target too. Steps go back to 4 May 2026 (one-off import, worker README).
- **UI test, Intake click (18 Nov 2026).** It clicked the middle of the chart, which as the local seed aged landed on a
  day with nothing logged. The test now logs two made-up food days in the last fortnight and clicks the first real bar.
- **Golf, light activity (23 Nov 2026).** Sam: "I want to be able to log when I did golf training". `kindGroup` has a
  fourth group, `light` (`LIGHT_KINDS = ['golf']`): shown on the Training log (outlined grey square, its own stat and
  legend entry, in the hover), never counted in cardio minutes, sessions a week or the Consistency cardio dot. WHY:
  range practice measured 2.3-2.6 MET (Wolkodoff 2024), under the 3.0 that counts as moderate; an hour would otherwise
  cover 40% of the 150-minute week. The cardio sheet has a Golf button (label "Golf: driving range"). The session lane
  holds three markers a day (gym + cardio + golf happened on 19 Nov).
- **Away days in the widgets (23 Nov 2026).** Sam, after Cambridge: "nice to see that in the widgets too… not able to
  hit my targets there". `countable` and `dayHit` leave away days out (no averages, no on-target ring, no floor-hit %),
  as the streaks and the weekly review already did. Intake and the Training log draw the Consistency grid's dashed
  outline round them (`AWAY_STROKE`), Intake dims their bars and adds "away" to its legend, hovers say "away, <place>"
  and Today shows an "Away · <place>" chip. The place is the away note up to its first comma.
- **S&A preset:** cable crunch → decline weighted crunch (Sam's swap, 23 Nov; the same demo as on Legs).
- **UI tests, dates (23 Nov 2026):** the made-up steps cover 40 days (the 1 Nov click needs steps the week before it).
- **Publish `build/index.html`, never `health-fitness.html` (23 Nov 2026).** health-fitness.html is a fragment.
  `build.py` puts it inside `page-shell.html` (doctype, UTF-8, viewport, and the reset the page relies on:
  `body{margin:0}` and `[hidden]{display:none!important}`) and writes `build/index.html`; the UI test loads the same
  shell. WHY: v31 went out through a publishing tool that serves the file as-is (the old one added this shell itself).
  With no doctype or charset the page ran in quirks mode, and without the `[hidden]` rule the layout-presets menu could
  not close: Sam saw a stuck menu and no widgets. Reproduced locally (the v31 file, unwrapped, times out on the first
  click); the page now also carries the two reset rules itself, so even an unwrapped copy works.
- **Away days, subtler (23 Nov 2026, same evening).** Sam: "make it more subtle… it shouldn't disrupt what the existing
  widget looks like… happy with the dotted line and a colour". The full-height dashed box round each away day became one
  short dotted line in the plan colour just under the baseline for each run of away days (`AWAY_LINE`, `awayRuns`), in
  Intake and the Training log; Intake no longer dims away bars. Hover, the Today chip and the averages are unchanged.
- **Training log on a short widget.** Under 80 px of chart (Sam's is about 50): 3 px squares, no date labels, and only as
  many rows of squares as the busiest day needs. WHY: a fixed three-row lane of 7 px squares left the bars about 10 px tall.
- **S&A preset:** overhead cable triceps extension → Katana triceps extension (Sam's pick, 23 Nov). The name keeps
  "triceps" so the split builder scores it (EXMAP) and "katana" so the 3D demo matches.
- **Lift progress frames the working muscle (24 Nov 2026).** Sam: "like the preacher curl is now, honed in on the target
  muscle… for a rear delt cable fly, focused in on the back". `focusCam` (mann.js) aims the camera at the demo's main
  muscle on the posed body mid-rep, from the side it faces (front, back, side or three-quarter, from the torso's own
  facing, so seated, lying and bent-over bodies work), at 55-70% of the whole-body distance, never more than 40° from
  above. Hamstrings from the side, triceps from straight behind (a seat back and a cable tower got in the way). The
  demo's own `cam` is the fallback; `opt.whole` keeps it. Checked on a contact sheet of every plan exercise.
- **Outlines, one language (24 Nov 2026).** Sam: away days "too subtle… a red border where I'm not on target… pink…
  make it consistent… where nothing is logged… comes down, across the bottom, then up". Intake bars get an outline:
  green hit, red missed (never today while it's going), magenta away (`--away`, Microsoft Teams' out-of-office
  colour). A run of away days with no bar gets a magenta bracket under the axis (`awayBracket`). Consistency's away
  cells and the Today chip use the same magenta. Replaces the dotted line of 23 Nov.
- **Training log, third version (24 Nov 2026).** Sam: "I want to know if I'm hitting my weekly cardio goal… steps can be
  a line graph, and then a stacked bar chart can be the cardio". `drawLog`: one bar a week of counted cardio minutes,
  a segment per session, solid once the week reaches 150 and faint until then; light cardio as a narrow outlined bar
  beside it (on top, it looked as if it lifted the week over the target); steps a line with a dot on 10k days. The
  scales are tied so 150 min and 10k sit on ONE dotted line. Sessions stay as squares under the axis (per day, or gym
  squares per week on long ranges); a magenta bracket marks away days. Stats add "weeks ≥150 min". "Golf" reads
  "light cardio" in the key and stats; the hover still says what it was.
- **C&T preset** follows the plan: incline DB 2, Smith chest press (flat) 3, pec deck 3; dips out (24 Nov 2026).
