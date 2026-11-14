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
