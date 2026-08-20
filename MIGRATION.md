# Migration — architecture, task list, running log

**Seeded 17 August 2026** from `domains/claude-code-migration.md`, with the architecture
rewritten for the phone requirement. Read `CLAUDE.md` first; it is the standing rules.

---

## 1. What changed from the plan on file, and why

`claude-code-migration.md` (11 Aug) specified **five local desktop apps** reading files
off Sam's disk. On **17 Aug** he added the requirement that killed it:

> *"I just want it on my phone, and I don't wanna lose progress between sessions."*

A local Node app on a Windows PC does not run on an iPhone. **The target changed; the
port did not.** Everything about the design system, the split map and the feature backlog
survives untouched.

| | Plan on file (11 Aug) | Built (17 Aug) |
|---|---|---|
| Runs where | Local Node server, PC only | **GitHub Pages — one URL, phone + MacBook + PC** |
| Data lives | `health-daily-log.csv` on local disk | **Same CSV, committed to a private data repo** |
| Write path | App writes to disk | **App → GitHub Contents API → commit** |
| History | Git, for code only | **Git, for code *and* every logged day** |
| Offline | N/A (always local) | **IndexedDB/localStorage queue, drains on reconnect** |

**Why GitHub is the database and not just the host:** the CSV stays a plain file, so Claude
can still read it out of the knowledge base and the second-brain loop survives. A hosted DB
(Supabase, Firebase) is faster and has real auth, but it would have moved the data
somewhere Claude cannot see — trading the whole point of the base for ~800 ms per meal.

**Repo shape:** the **app repo is public** (it is only code; the token is typed in at
runtime and never committed), so Pages is free. The **data repo is private**, so the diet
log is not. ⚠ Pages on a private repo requires a paid plan — this split is how it stays
free without publishing Sam's food.

---

## 2. Task list

Work top to bottom. **One app per 5-hour window.** Tick as you go.

### Phase A — scaffold

- [x] **T2 · GitHub repos created, 17 Aug 2026.**
      **`samstringr/dashboards` — PUBLIC.** Code only; the token is typed in at runtime and
      never committed, so Pages is free.
      **`samstringr/dashboards-data` — PRIVATE.** Holds `data/health-daily-log.csv`.
      *(Done out of order — the repos gate everything else and were cheap to create.)*
- [ ] **T0 · Move this out of iCloud and `git init`.**
      ⚠ The seed arrived in `iCloudDrive\Claude\migration-seed\` because that is the only
      folder Claude could write to. **A git repo inside a syncing folder invites
      corruption**, and iCloud has already silently reverted file moves once and refuses
      programmatic deletes. Copy `repo/` to local disk (e.g. `C:\dev\dashboards`), then
      `git init`, `git add -A`, `git commit -m "Seed: shared layer, design tokens, target engine"`.
      **Then tell Sam to delete the seed folder in Explorer** — `rm` will not work.
- [ ] **T1 · 🚩 Append the 14 Aug weigh-in to `data/health-daily-log.csv`.**
      **73.0 kg fed / ~71.5 fasted, 14 Aug 2026 — the first bodyweight ever recorded, on
      the fourth attempt — was never written to the CSV.** All 51 dates have an empty
      `weight_kg` cell. `verify.js` caught this on its first run. Until it lands, every
      target in the app rests on `FALLBACK_WEIGHT_KG` in `targets.js`. **Remove that
      constant once the row is in.** ⚠ Confirm the exact figure with Sam before writing —
      this is an append to the knowledge base, not a code change.
- [x] **T2c · Pushed, 19 Aug 2026.** The rebuild plus the chart correction are live. Uploaded
      through the GitHub web UI from the browser; the token was never touched.
- [ ] **T2d · Confirm the 73.0 kg weigh-in was FED or FASTED.** It decides the target:
      **2,780** (from 71.5 kg fasted, §3.5) or **2,810** (from 73.0 as given). The app flags
      it rather than guessing. One sentence from Sam closes it.
- [x] **T2b · Pushed and Pages enabled, 17 Aug 2026.**
      **The app is live: https://samstringr.github.io/dashboards/apps/diet/**
      26 files in `dashboards`, `data/health-daily-log.csv` seeded into `dashboards-data`.
      Verified loading in a browser. ⚠ **Still unverified on Sam's actual iPhone** — do that
      before building anything on top of it.
- [ ] **T3 · 🚩 SAM MUST DO THIS ONE — the app does nothing until it is done.**
      Create a **fine-grained personal access token** at
      *Settings → Developer settings → Personal access tokens → Fine-grained*:
      **Repository access: only `samstringr/dashboards-data`. Permissions: Contents →
      Read and write. Nothing else. Expiry: 1 year.**
      Then open the app, hit ⚙, enter owner `samstringr`, repo `dashboards-data`, paste the
      token, Save and connect. Repeat on each device you want to WRITE from.
      ⚠ **Claude did not and will not create or handle this token** — that is a credential,
      and it stays between Sam and GitHub. It is also why the read path has only been
      verified against a stubbed API, never against the real repo.
- [ ] **T4 · Round-trip test.** Read the CSV from GitHub, append one throwaway row, confirm
      the commit appears, then void it with a `confidence=void` append. **Do not delete it**
      — that is the append-only rule proving itself.

### Phase B — the diet app  ✅ **BUILT 17 Aug 2026 — 31/31 in Chromium**

- [x] **T5 · Split `reference/diet-artifact-original.html` (1,339 lines) into `apps/diet/`.**
      Map in §3 below. **Nothing is redesigned in this step.**
- [x] **T6 · Replace the hardcoded targets with `shared/targets.js`.**
      Delete `const T={rest:{kcal:2100},gym:{kcal:2450}}` (line 334), `E_LO`/`E_HI`/`E_MID`
      (line 338) and the `GOAL` object (line 347, still says 67 kg / FFMI 20.5). The goal
      is **75 kg / FFMI 22.5** and the target is **one flat 2,780 kcal / 155 g**.
      ⚠ **The day-type buttons (rest / gym / football) still drive the CSV `day_type`
      column — keep them.** They just no longer change the calorie target.
- [x] **T7 · Wire `store.js` in place of `localStorage` + `window.sendPrompt`.**
      Delete the whole hand-off-to-chat path (line 478). The app writes now. **Keep the
      seeded history as a read-through cache only** — on load, the file wins over any
      local draft. That precedence rule exists because an artifact once held a stale copy
      of a day while three corrections went to the CSV.
- [x] **T8 · PWA shell.** `manifest.json`, an icon, `<meta name="apple-mobile-web-app-capable">`,
      and a service worker that caches the app shell so it opens with no signal.
      Verify "Add to Home Screen" on the actual iPhone, not the simulator.
- [x] **T9 · Offline queue.** Wire `queue.drain()` to `online` and to app open. Show the
      pending count in the UI — a silent queue is how a day gets lost.

### Phase C — the two features Sam asked for (12 Aug)  ✅ **BUILT 17 Aug 2026**

Both are quality-of-life on the daily write loop, **the highest-frequency interaction in
the whole system.** Build them here, not as artifact patches.

- [x] **T10 · Composite meal builder.** Multi-select several items (his example: frozen
      chips + cheese + ketchup), adjust each quantity while watching the combined total
      move, commit once.
      > **Why this is not just convenience:** the per-item loop is the friction the record
      > already blames for the eight-week logging gap — *"accuracy was never the failure;
      > friction was."* It also matches how he actually eats: a plate, not a sequence.
- [x] **T11 · Close-the-day should offer several routes, not one.** Compute the close
      against the things he commonly finishes on — mince prep, gyoza, cheese — and present
      them as alternatives. ⚠ **Rank by protein-per-calorie** so the leanest route is the
      default rather than whichever generated first.
      > *"Give options, not one polished answer. He iterates and chooses by reacting."*
      > A single suggestion he doesn't fancy is a dead end; three costed options is a decision.

### Phase D — after diet is in daily use

- [ ] **T12 · `activity`** (532 lines) — feeds diet's weight and session data. One job in two halves.
- [ ] **T13 · `finances`** (383 lines) — ⚠ re-run `sim()` in node after any change.
- [ ] **T14 · `career`** (703 lines) — Gmail/Indeed integration is the wildcard.
- [ ] **T15 · `master-todo`** (340 lines) — nearly trivial, leave as one file.
- [ ] **T16 · Retire `weekly-diet-reseed`** (the Sunday 19:00 scheduled task) and remove it
      from `INDEX.md`. It exists *because* artifacts cannot read files. Once diet reads the
      CSV directly it is dead weight.
- [ ] **T17 · Delete the artifacts — NOT BEFORE the replacement has run a full week.**
      The base has lost data to premature deletion before. *Verify the destination, not the
      operation.*

---

## 3. The diet split map

**1,339 lines in one file.** Claude Code on Pro is guided at "small repositories, typically
under 1,000 lines", and every edit re-reads the whole file. **Splitting is not tidiness —
it is the single biggest lever on how long this takes.**

| New file | From the original | Contains |
|---|---|---|
| `data.js` | 363–526, 1167–1213 | `BATCH`, `GRAM`, `ASSEN`, `SEED` history |
| `presets.js` | 527–562, 878–966 | `BASE_PRESETS`, custom presets, the preset column |
| `engine.js` | 563–650, 1076–1152 | `totals`, `flags`, `plan`, `risks`, `buildRow` |
| `render.js` | 651–1075 | goal strip, editors, fridge, `render()` |
| `chart.js` | 1153–1339 | consistency chart, `stats`, `showDay` |
| `index.html` | 1–306 | markup + `<link>`s only. **No inline script.** |

**Deleted outright, not ported:** the `window.sendPrompt` hand-off (478–497), the
`CLOSED`/`FILE_TODAY` localStorage precedence dance (356–362) — `store.js` handles both —
and every hardcoded target constant (334–348).

---

## 4. 🚩 Open questions — raise with Sam, do not decide alone

1. **Protein has three stated values and they disagree.** `health-targets.md` §3.5 says
   `2.15 × weight` (153.7 g at 71.5 kg), §4 says `2.1 × weight` (150.2 g), and the headline
   says **155 g**. **None of the three reproduce 155.** Shipping 155 because it is the number
   on the wall and §4 says of the protein rule *"if protein is ever revisited, the answer is:
   leave it"* — but the derivation is broken and he cannot re-derive it, which is the exact
   failure mode the 1.7 multiplier taught.
2. **`health-targets.md` contradicts itself on the derived engine.** §6 (11 Aug) specifies a
   session-tiered multiplier and day-type factors; §3.5 (14 Aug) deletes both on the merits,
   then says §6 "still stands for the dashboards." Those cannot both be followed. **Working
   answer:** flat target ships, §6 engine implemented behind `DERIVED_ENGINE_ENABLED = false`
   so the decision can be revisited with data instead of rebuilt.
3. **No-scroll on a phone.** design-system.md principle 1 was written for a ~1400×900
   artifact. Holding it literally at 390×844 means 6px type. **Working answer:** binding at
   ≥900px, single scrolling column below. Not a decision taken on Sam's behalf — his call.
4. **Does the canonical CSV move to GitHub, or stay in iCloud?** Right now it would be in
   both, and **two homes for one fact is the failure this base has hit three times.**
   Recommend: **GitHub becomes canonical**, and the iCloud copy is refreshed by `git pull`
   rather than edited. Must be settled before T4.

---

## 5. Corrections to the knowledge base, found while seeding

| File | What it says | What is actually true |
|---|---|---|
| `INDEX.md` (14 Aug) | *"`list_artifacts` returns only `physique-goal-comparison` — `activity`, `diet`, `finances`, `career`, `master-todo` are NOT reachable from a Cowork session"* | ✅ **All five are reachable.** Verified 17 Aug 2026. `diet` is 1,339 lines, last updated 13 Aug. Nothing needs rebuilding |
| `health-daily-log.csv` | has a `weight_kg` column | 🚩 **Empty on all 51 dates.** The 14 Aug weigh-in lives only in prose. See T1 |
| `claude-code-migration.md` §9 Q1 | *"How do the apps run? Decide in the scaffold session"* | ✅ **Decided 17 Aug: GitHub Pages + git-as-database.** Driven by the phone requirement |

---

## 6. 📋 Progress log — add to this

*Newest first. One line per session: what got done, what broke, what's next.*

| Date | Session | Done | Next |
|---|---|---|---|
| 20 Aug 2026 | Dates | 🚩 **THE APP LOST A DAY.** The 19th's seven items sat unclosed in an open tab; on the 20th `Close and save` ran and `buildRecord()` stamped the row with `ISO()` — by then the 20th. Food moved forward a day and the file said so confidently. **Voided the 2026-08-20 row, re-dated to 2026-08-19** (2,347 kcal / 162.2 P), both appends made through the app's own client so no token was ever handled. **FIX: the day being logged is STATE (`S.logDate`), not a clock read at the moment of saving.** New day selector in the header — ◀ ▶, a native date picker, "Today" — driving the draft key, the closed check, the record's date and the header. A day already in the file appends `corrected` and names what it supersedes; a backdated row says `BACKDATED` in its notes. **Midnight watcher**: if the clock rolls over under an open tab with items in the draft, the items do NOT move and the board says so. Chart drill-down gained "Log or correct this day". Suites: verify 35/35 · smoke **96 → 116** · steptest 17/17 | Push · confirm the 18 Aug composition (see below) |
| 19 Aug 2026 | Fed/fasted | 🚩 **The app was showing 2,810 while health-targets.md §3.5 said 2,780** — same body, same formula, two answers, because `weightFor()` read the fed/fasted state, printed it, and then handed the RAW figure to the derivation. Sam's call: the 73.0 kg is **FED**, fasted ≈ 71.5. `targets.js` now converts fed → fasted (**−1.5 kg**, the measured 14 Aug offset) before deriving: 73.0 → 71.5 → BMR 1,675 × 1.66 = **2,780**. ⚠ An UNSTATED weight is still NOT converted. 🚩 **`statedState()` rewritten after its own new test caught it**: it word-scanned free prose for "fasted" then "fed", so the correction row *explaining* the fed decision — which says "fasted" five times — was parsed as FASTED. Now an explicit **`STATE=fed`** token wins, and prose naming both words refuses to answer. Suites: verify **35/35** · smoke **96/96** · steptest 17/17 | 🚩 **NOT PUSHED — both bridges dropped mid-session.** See PENDING.md |
| 19 Aug 2026 | Data + chart | **Block 02 has data.** 17 Aug **2,681** kcal / 188.4 P / 270.1 C / 90.7 F and 18 Aug **2,658** / 212.5 / 219.5 / 93.9 written to the CSV from recall; 19 Aug loaded as a live draft, not a row, because a row would have closed the day. Block 02 now reads **100% in band (2/2), mean 2,670, −110 vs target** against Block 01's 43%. 🚩 **The protein powder was still carrying the whey isolate's macros** — 377.1/85.7/3.43/1.14 → **392/68/21/3.8**, read off the pack. At a 40 g scoop that is **7 g less protein and 7 g more carbs per bowl** than the app claimed, on every oats day ever logged. Oats defaults moved to the current build, 650/57.5/86.5/8.8 → **766/58.4/108.7/11.8**. Four meal-deal presets added with sources and stated uncertainty. Plan rule ink → **violet `--plan`**. Suites: verify 28/28 · smoke 95/95 · steptest 17/17 | T2d · fed/fasted · **read the baguette pack** · confirm the 17th's dinner protein |
| 19 Aug 2026 | Chart | 🚩 **The plan-change rule was never drawing on the live site** — and it was "pixel-verified". The x-axis was built from LOGGED DAYS ONLY, the last logged day is 12 Aug, the change is 14 Aug, so `findIndex(d => d >= "2026-08-14")` returned **-1** on every frame and the plugin returned early. `steptest.mjs` injected eight synthetic Block 02 days before it looked, so it proved the drawing code and never the axis it draws on. **Fix: the x-axis is a TIMELINE** — logged days ∪ plan-change dates ∪ the newest era's calendar span to today — so the date always has a slot and the rule is never flush with the border. Rule restyled 1px `#8d8d97` dashed → **2px `#e8e6e1` solid with a date chip**. **Trend lines removed** on Sam's instruction. Suites: verify 28/28 · smoke **95/95** · steptest **17/17**, now run twice, the second against the REAL log | T2d · the fed/fasted question · T4 · the canonical-CSV decision |
| 18 Aug 2026 | Rebuild | **Layout rebuilt to Sam's spec** — two columns, Today at the top, close-the-day folded into the log board as a per-item amount, fridge bottom right, chart given a resolved height so it stops clipping. **Recipes are editable at the level he measures at**: oats by ingredient grams, prep proteins by per-100 g macros. Frecency ordering, goal pane (weight and waist write to the CSV), voice logging + Open Food Facts. 🚩 **Era-aware scoring** — the first build scored all 41 days against 2,780 and reported a fabricated 5%; real figure is **43% against Block 01's own band**. Stepped target lines + plan-change marker, **proven 8/8 with data either side of 14 Aug**. Suites: verify 28/28 · smoke 43/43 · steptest 8/8 | 🚩 **PUSH** — blocked on the Chrome extension |
| 17 Aug 2026 | Ship | **Live at https://samstringr.github.io/dashboards/apps/diet/** — both repos created and populated, Pages enabled. Live-site check found a flaw the harness missed: on an empty day the planner proposed *14× protein yoghurt*. Guarded, portions capped at 3, smoke test extended to cover it — **34/34** | **T3 — Sam creates the token.** Nothing works until then |
| 17 Aug 2026 | Build | **The diet app is built.** 1,339-line artifact split into 10 modules under `apps/diet/`, largest 400 lines. Targets wired to `targets.js`. `sendPrompt` hand-off deleted; the app commits to GitHub itself. PWA shell, offline queue, T10 composite builder, T11 multi-option close. Chart.js **vendored**, CDN dependency removed. **`tools/smoke.mjs` runs the real app in Chromium: 31/31.** Repos `dashboards` (public) + `dashboards-data` (private) created | T0 · git init and push · T1 · the weigh-in · T3 · token |
| 17 Aug 2026 | Seed | Architecture rewritten for phone/GitHub. `store.js`, `targets.js`, `tokens.css`, `verify.js` written and **28/28 checks passing in node**. Diet artifact captured to `reference/` | — |

### Things learned along the way

*Add anything that cost you time, so it costs you nothing next time.*

- 🚩 **A test that recomputes the buggy expression agrees with the bug.** Every date
  assertion in `smoke.mjs` compared the app's output against `new Date()` — the same clock
  read the bug was made of — so a suite at 96/96 could not see a whole day land on the
  wrong date. The new checks pin the row's date to the **selected** day and pass an
  explicit expected value. **When testing a value derived from ambient state (clock,
  locale, cwd, env), never rebuild the expectation from that same state.**
- **An `on()` helper that binds at module load cannot bind a button that is rendered on
  every paint.** `#reopen` drew, clicked and did nothing. Delegation on the static parent
  fixed it — and the smoke check caught it in the same run, which is the only reason it
  is a footnote rather than a second lost day.
- 🚩 **A keyword scan over a field that holds reasoning will eventually read the reasoning
  as the datum.** `statedState()` searched the CSV notes for "fasted" then "fed". It worked for
  five days. It broke the instant a note *explained* a fed/fasted decision, because that note
  mentions "fasted" repeatedly while describing a FED weight — and it broke silently, returning a
  confident wrong answer rather than an error. **Parsed fields need a token (`STATE=fed`), not a
  vocabulary.** Caught by a test written in the same session as the bug, which is the only reason
  it did not ship.
- 🚩 **Logging real data broke a test, and that was the test working.** `steptest.mjs`
  case B asserted "nothing logged on or after the plan change" as a PRECONDITION of the
  bug it guards. The moment 17 and 18 Aug were logged, that precondition stopped holding
  — so the check would have gone on passing while testing nothing. It now truncates the
  real file to before 14 Aug, which guarantees the condition instead of hoping for it.
  **When a fixture's precondition depends on live data, it will silently expire.**
- **The unverified flag was doing its job and still cost two days.** The protein powder
  was renamed on 17 Aug and its macros left at the old product's, correctly marked `unv`.
  Nobody reads a flag. What closed it was Sam reading the pack — so the useful output of
  an `unv` row is not the warning, it is the specific question it generates.
- 🚩 **The harness and the live site were looking at different axes.** `steptest.mjs`
  seeded eight synthetic days after the plan change so it could see the step — and in doing
  so it manufactured the one precondition the live site did not have. It asserted the
  feature worked *given* the date is on the axis, and never asserted the date is on the
  axis. **A fixture that supplies the missing precondition tests everything except the
  bug.** Every check that depends on the shape of the data now runs against the REAL CSV
  as well as the seeded one.
- **`verify.js` earned its keep on run one**, catching that the most expensive measurement
  in the base (the first-ever weigh-in) had never reached the data layer. Tests against
  real data find data problems, not just code problems.
- **The artifact had two presets with `id: "chips"`** — the gram editor and the Pop chips
  bag. Duplicate ids silently broke pin, edit and archive for both, because every lookup
  found the first match. Renamed to `pop` in the port. Nobody had noticed in eight days.
- **`node --check` passed the whole app before it could render at all.** The Chromium smoke
  test caught a dead CDN on the first run. Parse is not run — again.
- **A test suite that only runs the happy path is a test suite with a blind spot.** 31/31
  green, and the first thing on screen when the app was actually opened was nonsense,
  because every assertion ran *after* logging something. **Open the thing in the state a
  new user meets it in.**
- 🚩 **A test that removes a plugin after construction removes nothing.** The first version
  of the marker check compared two screenshots taken with the plugin still active, found
  them identical, and would have reported the feature working whether or not it drew a
  single pixel. **A check that cannot fail is not a check.** Replaced with a pixel read:
  81 marker-coloured pixels on the line, 9 nine pixels away.
- **The stats the app now computes off the real CSV are worse than the file claims:**
  **5% of logged days land inside the 2,780 ± 250 band (2 of 41)** and the mean is
  **1,882 kcal against a 2,780 target — 898/day short.** `health-targets.md` §3.5 predicted
  +543; measured against the full log it is worse than that. **The target is not the hard
  part; eating it is.**
