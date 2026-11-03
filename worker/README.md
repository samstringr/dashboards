# Health DB

Sam's own backend for the Health & Fitness Dashboard. One database (Cloudflare D1), three ways in:

| Door | Path | Who uses it |
|---|---|---|
| Telegram bot | `/telegram` | @health_n_fitness_bot: log food, weigh-ins, sessions; `/workout` sends the next session |
| MCP connector | `/mcp` | The dashboard (connector name **Health DB**) and Claude chats |
| Apple Health | `/health` | iOS Shortcut that posts the morning weigh-in |

An hourly cron sends weigh-in reminders (Mon/Wed/Fri 07:00 UK), an evening protein nudge (21:00) and writes a nightly backup (03:00) to `samstringr/dashboards-data/backup/` as JSON and CSV.

## Data

Two tables mirror the dashboard exactly: `days` (one JSON document per date: `items`, `body`, `workouts`, `legacy`, `partial`) and `config` (`settings`, `library`, `plan`, `layout`). Every write stamps `updated`; the dashboard polls `get_rev` and pulls only what changed.

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
npx wrangler dev --local      # needs a .dev.vars, see test/flow.mjs
node test/flow.mjs test/seed.json
```
