# dashboards

Installable web apps replacing five sandboxed dashboard artifacts. One URL, opens on phone, MacBook and PC.

**The repo is the database.** Each app commits to `data/health-daily-log.csv` in the private `dashboards-data` repo via the GitHub Contents API, so every logged day is a commit and the history is the audit trail.

- `apps/diet` — daily food log against a derived calorie and protein target
- `shared/` — the data layer, the target engine, the design tokens. Extracted once
- `MIGRATION.md` — architecture, task list, open questions
- `CLAUDE.md` — build rules, auto-loaded by Claude Code

No secrets live here. The GitHub token is typed into the app at runtime and stored in browser localStorage on each device.

    node shared/verify.js     # data layer + target engine
        node tools/smoke.mjs      # runs the real app in Chromium
        
