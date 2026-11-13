# Health DB

Sam's own backend for the Health & Fitness Dashboard. One database (Cloudflare D1), three ways in:

| Door | Path | Who uses it |
|---|---|---|
| Telegram bot | `/telegram` | @health_n_fitness_bot: log food, weigh-ins, sessions; `/workout` sends the next session |
| MCP connector | `/mcp` | The dashboard (connector name **Health DB**) and Claude chats |
| Apple Health | `/health` | iOS Shortcut that posts the morning weigh-in |

An hourly cron sends weigh-in reminders (Mon/Wed/Fri 07:00 UK), a supplements check (14:00 and 21:00, only for what isn't ticked), an evening protein nudge (21:00) and writes a nightly backup (03:00) to `samstringr/dashboards-data/backup/` as JSON and CSV.

Every new Apple Health weigh-in gets a Telegram acknowledgement (weight, body fat, lean mass, 7-day average, change since the last one; exact repeats are skipped). If no weigh-in has arrived by 10:00 on a weigh day, the bot says so, which is how a Shortcut that didn't fire shows up.

**Food logging.** A message is read by Claude Haiku into items. Library foods (and their "also" names) and repeats of anything logged in the last 7 days reuse known numbers and are logged straight away; anything new is estimated, looked up on the web if it's a restaurant, branded or home-cooked item (Sonnet, then Haiku if Sonnet is rate-limited), and shown for a ✅ first. If the lookup fails, the bot still shows its own estimates and says so, rather than failing the message. Since 7 Nov 2026:
- **Presets:** "my standard overnight oats are 100 g oats, 40 g protein powder…" saves (or updates) one serving as a library entry that keeps its parts; sending the name logs it. `/foods` lists them.
- **How much:** "how much of the leftover pork belly closes the day?" works out the amount from what's left of today's calories and protein, capped by how much he says he has, with a button to log it. The maths is done in `food.js`, not by the model.
- **Two foods and closers (13 Nov 2026):** "how much chilli and white rice closes the day?" answers with numbered options (`close.js`): 1 the pair at the ratio he has eaten them together before (median of the last six meals with both; it closes calories and protein exactly when that needs no more than double or less than half his usual ratio), 2 the first food alone and what it leaves, 3 and 4 with less and more of the second. Then closers that fit the gap: his staples (protein shake, a tin of tuna or sardines, Greek yoghurt and a banana, digestives and cheese, For Goodness Shakes) and anything he has finished a day with twice in 60 days, protein-first while protein is short. Each option and closer has its own log button. WHY: the first version answered with the chilli alone and ignored the rice.
- **Preset plus extras:** "standard protein shake plus 1 extra scoop" logs the preset unchanged and the scoop as its own line; the parser sees each preset's parts, so it knows a scoop is 30 g.
- **Failures** are kept (last 20) and readable through the MCP tool `get_bot_errors`; the failure message has a 🔁 Try again button. WHY: on 7 Nov a six-item message failed with "I couldn't read that" and nothing recorded why.

**Supplements.** `/supps` is a checklist with a ✅ Tick all button; "all supplements taken", "took my vitamins" or "all except magnesium" in a message ticks them too. Creatine sits in the after-training slot (13 Nov 2026: Sam asked for the best time; post-workout has a small edge in one trial, but taking it every day matters far more).

**Progress photos (13 Nov 2026).** Every 4 weeks, on a weigh-in morning (Mon/Wed/Fri 07:00), the bot asks for a set with a 📸 Start button; `/photos` starts one any time. Photos sent in the next 30 minutes, or captioned with a pose ("front", "side", "back", "front flexed"), are saved in order front → side → back → flexed. They are **never sent to Claude**, and live in their own `photos` table, so `get_snapshot`, the nightly GitHub backup and the CSV never carry them. A weigh-in screenshot sent by mistake has a "Not a progress photo" button that takes it out and reads it as usual. The dashboard's Photos sheet reads and writes them through `list_photos`, `get_photo`, `put_photo` and `delete_photos`. WHY in Health DB: Sam wants to send them to the bot and see them on the dashboard, and the bot can only write here.

Voice notes are transcribed by Workers AI Whisper (the `[ai]` binding), echoed back, then handled like typed text.

**Away mode.** Doing nothing is fine: gaps stay blank and are skipped by every average. After 2 days with nothing logged the reminders go quiet by themselves (one message says so), and the first thing sent after 3+ empty days gets a short welcome-back note. `/away 7`, `/away 2026-12-28` or "on holiday until the 28th" silence reminders up front; `/back` ends it.

## Data

Two tables mirror the dashboard exactly: `days` (one JSON document per date: `items`, `body`, `workouts`, `legacy`, `partial`) and `config` (`settings`, `library`, `plan`, `layout`, `supplements`, `away`). A third, `photos`, holds progress photos (one row per date and pose, a ~320 px thumbnail and the full photo, base64) and is deliberately left out of every export. Supplements ticked on a day live in that day's `supps` (id → time ticked), so each day starts unticked. Every write stamps `updated`; the dashboard polls `get_rev` and pulls only what changed.

## Secrets (Cloudflare → Worker → Settings → Variables and Secrets)

| Name | What |
|---|---|
| `TELEGRAM_TOKEN` | From @BotFather |
| `ANTHROPIC_API_KEY` | From the Claude Console |
| `GITHUB_TOKEN` | Fine-grained token, Contents read/write on `dashboards-data` only |
| `API_KEY` | A long random string you make up. Used by the Claude connector, the iOS Shortcut and `/setup` |

Never commit these. Plain settings live in `wrangler.toml` `[vars]`.

## Deploy

Cloudflare Workers Builds, connected to this repo with root directory `worker`. Every push to `main` redeploys. The D1 database is created automatically on the first deploy.

After the first deploy, open `https://health-db.<subdomain>.workers.dev/setup?key=<API_KEY>` once to connect the Telegram webhook.

## Test locally

```
npm install
node test/mock.mjs &          # fake Telegram, Claude and GitHub
npx wrangler dev -c wrangler.test.toml   # wrangler.toml without the [ai] block (Workers AI only runs remotely); needs a .dev.vars, see test/flow.mjs
node test/flow.mjs test/seed.json
node test/unit.mjs            # away/quiet logic, food maths
```
