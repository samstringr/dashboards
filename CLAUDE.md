# Dashboards — build rules

Sam's health/finance/career apps. Replacing five Cowork artifacts that could not touch
the filesystem. **Ported, not redesigned** — the design decisions were already made and
paid for across five artifact sessions.

**Read `MIGRATION.md` for what's done, what's next, and the numbered task list.**

## What this is

A **static web app on GitHub Pages** that opens on Sam's phone, MacBook and PC from one
URL. **The repo is the database:** `data/health-daily-log.csv` is committed to via the
GitHub API, so every logged day is a commit and the history is the audit trail.

`diet` is app one. `activity`, `career`, `finances`, `master-todo` follow.

## Non-negotiable

- **`shared/store.js` is the ONLY code that touches the CSV.** If you are parsing that
  file anywhere else, stop. The three rules below are implemented there so they stop
  being things to remember:
  - **Append-only.** Never rewrite a row, never summarise over rows. A correction is an
    append with `confidence=corrected`; a non-day is an append with `confidence=void`.
  - **A date may appear more than once — THE LAST ROW WINS.**
  - **Blank is not zero.** A partial day keeps its row with empty cells. `|| 0` on an
    intake figure is a bug, not a default.
- 🚩 **NEVER HARDCODE A CALORIE OR PROTEIN NUMBER.** All targets come from
  `shared/targets.js`, which derives them from `domains/health-targets.md` §3.5. The old
  artifact hardcoded `2100`/`2450` at line 334 and they were three days stale by the time
  anyone noticed. That is the same failure as the 1.7 multiplier.
- **`design-system.md`** (in the iCloud Claude folder) is **binding**, not advisory. Its
  tokens are extracted once into `shared/tokens.css`. Do not redeclare a colour elsewhere.
- **Never commit a token.** `.gitignore` does not protect you from pasting one into source.
- **`apps/finances`:** after ANY change, extract `D` and `sim()` and re-run them in node.
  Expect debt-free January 2027, £135.48 interest, buffer September 2026. A visual check
  does not catch a mistyped digit.

## Verification — run it, don't just parse it

```
node shared/verify.js        # must pass before every commit touching shared/
```

`node --check` proves a file **parses**. It does not prove it **runs**. On 11 Aug 2026 a
stray double comma made a sparse array hole — legal JavaScript, passed `--check` clean,
and killed the entire page at runtime before one element rendered. **Substituting a
cheaper check while keeping the word "verified" is the actual failure.**

## Style

- **British English.** Sentence case, never Title Case. **Two font weights only: 400 and 600.**
- One accent (amber-clay), used only for the single most important thing on the page.
- Flat. No gradients, shadows or glow. Depth comes from surface steps and hairlines.
- **Numbers are the design.** Tabular figures, tight tracking, space around them.
- Detail goes behind **click-to-expand**, not below the fold.
- ⚠ **No-scroll is binding at ≥900px only.** A phone is a third of the area a desktop
  artifact was designed for; below 900px the page is one scrolling column. See the note
  at the foot of `shared/tokens.css`.

## Working method

- **Keep every file under ~400 lines.** Split before it grows past that. Every edit
  re-reads the file, and on the Pro plan the 5-hour window is the real constraint.
- **One app per session.** Context-switching mid-window wastes the re-read.
- **End every session with a commit**, even if the work is unfinished. An ugly commit
  beats a lost one. `git add -A && git commit -m "..."`.
- **This is a PORT.** If you find yourself redesigning, stop — that decision was already
  made, and re-litigating it is how five artifact sessions became zero shipped apps.

## How Sam wants to be talked to

- **Conclusion first, then the reasoning.** Numbers before prose. No hedging.
- **Report completed work as Dota 2 patch notes** — caps headers (`FIXED`, `CHANGED`,
  `KNOWN ISSUES`), bold subject, terse bullets, **old → new for every value**.
- **Ambiguity → stop and ask.** Don't guess on unclear specifics.
- 🚩 **Write down WHY, not just what.** This repo is a reasoning store. A figure he
  cannot re-derive is a figure he cannot correct.
