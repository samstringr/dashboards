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
- [ ] **T2c · 🚩 PUSH THE REBUILD.** 13 changed files sit in `migration-seed/repo/` and are
      **not on GitHub**. The live site still serves the 17 Aug build. Blocked twice: the
      5-hour window ran out mid-upload on 17 Aug, and the Chrome extension is disconnected
      on 18 Aug. **Nothing is lost — the disk copy is verified byte-for-byte and passes
      28/28 on Sam's own machine.**
      Changed: `shared/targets.js` · `apps/diet/{index.html,diet.css,app.js,state.js,presets.js,render.js,chart.js,editors.js,sw.js}` ·
      NEW `apps/diet/{recipes.js,assistant.js}` · `tools/{smoke.mjs,steptest.mjs}`
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
| 18 Aug 2026 | Rebuild | **Layout rebuilt to Sam's spec** — two columns, Today at the top, close-the-day folded into the log board as a per-item amount, fridge bottom right, chart given a resolved height so it stops clipping. **Recipes are editable at the level he measures at**: oats by ingredient grams, prep proteins by per-100 g macros. Frecency ordering, goal pane (weight and waist write to the CSV), voice logging + Open Food Facts. 🚩 **Era-aware scoring** — the first build scored all 41 days against 2,780 and reported a fabricated 5%; real figure is **43% against Block 01's own band**. Stepped target lines + plan-change marker, **proven 8/8 with data either side of 14 Aug**. Suites: verify 28/28 · smoke 43/43 · steptest 8/8 | 🚩 **PUSH** — blocked on the Chrome extension |
| 17 Aug 2026 | Ship | **Live at https://samstringr.github.io/dashboards/apps/diet/** — both repos created and populated, Pages enabled. Live-site check found a flaw the harness missed: on an empty day the planner proposed *14× protein yoghurt*. Guarded, portions capped at 3, smoke test extended to cover it — **34/34** | **T3 — Sam creates the token.** Nothing works until then |
| 17 Aug 2026 | Build | **The diet app is built.** 1,339-line artifact split into 10 modules under `apps/diet/`, largest 400 lines. Targets wired to `targets.js`. `sendPrompt` hand-off deleted; the app commits to GitHub itself. PWA shell, offline queue, T10 composite builder, T11 multi-option close. Chart.js **vendored**, CDN dependency removed. **`tools/smoke.mjs` runs the real app in Chromium: 31/31.** Repos `dashboards` (public) + `dashboards-data` (private) created | T0 · git init and push · T1 · the weigh-in · T3 · token |
| 17 Aug 2026 | Seed | Architecture rewritten for phone/GitHub. `store.js`, `targets.js`, `tokens.css`, `verify.js` written and **28/28 checks passing in node**. Diet artifact captured to `reference/` | — |

### Things learned along the way

*Add anything that cost you time, so it costs you nothing next time.*

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
