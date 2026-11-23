# Health DB

Sam's own backend for the Health & Fitness Dashboard. One database (Cloudflare D1), three ways in:

| Door | Path | Who uses it |
|---|---|---|
| Telegram bot | `/telegram` | @health_n_fitness_bot: log food, weigh-ins, sessions; `/workout` sends the next session |
| MCP connector | `/mcp` | The dashboard (connector name **Health DB**) and Claude chats |
| Apple Health | `/health` | iOS Shortcuts: "Send Weigh-in to H&F" when Fit Profile closes; "Send Steps To H&F" (the last 7 days of steps) whenever Telegram opens |

An hourly cron sends weigh-in reminders (Mon/Wed/Fri 07:00 UK), a supplements check (14:00 and 21:00, only for what isn't ticked), an evening protein nudge (21:00) and writes a nightly backup (03:00) to `samstringr/dashboards-data/backup/` as JSON and CSV.

Every new Apple Health weigh-in gets a Telegram acknowledgement (weight, body fat, lean mass, 7-day average, change since the last one; exact repeats are skipped). If no weigh-in has arrived by 10:00 on a weigh day, the bot says so, which is how a Shortcut that didn't fire shows up.

**Food logging.** A message is read by Claude Haiku into items. Library foods (and their "also" names) and repeats of anything logged in the last 7 days reuse known numbers and are logged straight away; anything new is estimated, looked up on the web if it's a restaurant, branded or home-cooked item (Sonnet, then Haiku if Sonnet is rate-limited), and shown for a ✅ first. If the lookup fails, the bot still shows its own estimates and says so, rather than failing the message. Since 7 Nov 2026:
- **Presets:** "my standard overnight oats are 100 g oats, 40 g protein powder…" saves (or updates) one serving as a library entry that keeps its parts; sending the name logs it. `/foods` lists them.
- **How much:** "how much of the leftover pork belly closes the day?" works out the amount from what's left of today's calories and protein, capped by how much he says he has, with a button to log it. The maths is done in `food.js`, not by the model.
- **Two foods and closers (13 Nov 2026):** "how much chilli and white rice closes the day?" answers with numbered options (`close.js`): 1 the pair at the ratio he has eaten them together before (median of the last six meals with both; it closes calories and protein exactly when that needs no more than double or less than half his usual ratio), 2 the first food alone and what it leaves, 3 and 4 with less and more of the second. Then closers that fit the gap: his staples (protein shake, a tin of tuna or sardines, Greek yoghurt and a banana, digestives and cheese, For Goodness Shakes) and anything he has finished a day with twice in 60 days, protein-first while protein is short. Each numbered option has a log button; closers are typed like any food (14 Nov 2026: Sam found a button per closer too many). WHY: the first version answered with the chilli alone and ignored the rice.
- **Preset plus extras:** "standard protein shake plus 1 extra scoop" logs the preset unchanged and the scoop as its own line; the parser sees each preset's parts, so it knows a scoop is 30 g.
- **Failures** are kept (last 20) and readable through the MCP tool `get_bot_errors`; the failure message has a 🔁 Try again button. WHY: on 7 Nov a six-item message failed with "I couldn't read that" and nothing recorded why.

**Supplements.** `/supps` is a checklist with a ✅ Tick all button; "all supplements taken", "took my vitamins" or "all except magnesium" in a message ticks them too. Creatine sits in the after-training slot (13 Nov 2026: Sam asked for the best time; post-workout has a small edge in one trial, but taking it every day matters far more).

**Progress photos (13 Nov 2026; reworked 14 Nov, twice).** Every 4 weeks, on a weigh-in morning (Mon/Wed/Fri 07:00), the bot says a set is due. Sam just sends the photos: one at a time or as an album, no caption, no command. A photo with no caption goes through the same Claude call that reads food photos, which now also recognises a physique photo and its pose (`intent: photo`); those are saved as progress photos and nothing is logged. A caption that says progress (or names a pose) covers its whole album and skips Claude entirely, as does anything sent within 30 minutes of `/photos`; "those are progress photos" typed within 15 minutes moves the last photo or album across. Poses come from the caption, else from what Claude saw, else in order front → side → back → flexed. One reply per album, edited as each photo lands; its "Not progress photos" button takes the batch back out. They live in their own `photos` table, so `get_snapshot`, the nightly GitHub backup and the CSV never carry them. The dashboard's Photos sheet reads and writes them through `list_photos`, `get_photo`, `put_photo` and `delete_photos`. WHY recognition: rules of thumb ("a set is due", "it came as an album") failed both ways, because Sam also sends several meal photos at once; he asked for photo-only sending to just work and said the photos don't need locking away. The cost, stated plainly: an uncaptioned progress photo passes through the Anthropic API once.

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

**The coach (14 Nov 2026).** `src/coach.js`. After a gym session is saved the bot sends a second message: each lift, how it compares with last time, what to aim for next time and why, then one focus. Every figure comes from the plan's own rule applied to the FIRST set (top of the rep range → one step more load and back to the bottom of the range; inside it → same load, one more rep; under it → about 10% off), so the advice can be re-derived by hand. Claude writes only a two-sentence opening from those lines and is told to add no numbers; if that call fails the review goes without it. The first rotation of a plan is labelled calibration. `/workout` shows the same "today" target beside each lift. If a session contains a lift that isn't in the plan in the slot of one that was skipped, the bot offers to make the swap permanent (buttons; nothing changes without a tap). On Sunday at 19:00 (and on `/review`) it sends the week: training, food, weight, what went well, what to improve, one focus. WHY deterministic: a target Sam can't re-derive is a target he can't correct. `settings.usualCardio` (free text) tells the parser what an unspecified cardio session usually is; a number Sam gives always wins.

**Steps (14 Nov 2026).** The weigh-in Shortcut could also send `steps`: one total per day for the last 7 days, as text (`2026-11-14=8432;2026-11-13=10234`); a `{date: count}` object or a bare number also works. Steps can come on their own (saved quietly, no Telegram message) or with a weigh-in. Each day stores `steps` and `stepsAt` (the date it was sent); a count sent on its own day is still running, so the dashboard shows it as "so far" and keeps it out of averages until a later send replaces it. Steps don't count as "data" for away/quiet detection (`hasData`), because the phone counts them whether or not Sam is logging. WHY in the weigh-in Shortcut: Sam asked for it there, and seven days per send means a missed morning loses nothing. The weekly review includes the average.

**Steps, second version (18 Nov 2026).** Steps now have their own Shortcut, "Send Steps To H&F", run by an automation whenever Telegram opens. WHY: riding along with the weigh-in meant steps arrived three times a week; a time-of-day automation fails because iOS blocks Health reads while the phone is locked ("Protected health data is inaccessible"), and at night it usually is; Sam opens Telegram several times a day to log food, always unlocked. The Shortcut: Find Health Samples (Steps, Start Date in the last 7 days, Group By Day, Fill Missing off, oldest first) → Repeat with each → Text `Start Date (custom yyyy-MM-dd)=Value` → Combine with `;` → POST `{"steps": …}`. "Last 7 days" includes today, so 8 days go each time. Fill Missing is off so a day with no data stays blank instead of 0 (blank is not zero). The key must be lower-case `steps`: iOS capitalised it on the first try and the Worker answered "no weight, body fat or steps".
**Steps import.** The window is 400 days (was 60) and steps are saved in two queries whatever the count (`daysBetween` + batched `putDays` in store.js). WHY: Sam wanted his steps back to 4 May 2026 in one go, ~200 days, and a read plus a write per day would be ~400 database calls in one request. For a one-off import, duplicate the Shortcut, remove its Telegram trigger, set Start Date to "is after" the day before you want, run it once, then delete it.
**Golf (23 Nov 2026).** A session kind of its own: "driving range for 2 hours, irons" → kind `golf`, label "Golf: driving range", 120 min, note "Irons". It is light activity (`LIGHT` in coach.js): the weekly review reports it ("1 golf, 120 min") but never adds it to cardio minutes. WHY: range practice measured 2.3-2.6 MET (Wolkodoff 2024), under moderate (3.0).
**The coach, second version (15 Nov 2026).** After Sam's first back day: "too long… the coach notes at the bottom… for each exercise just next, very shorthand… use colours… eye-catching". A gym session now gets a one-line save (with Undo) and then the review: a tally, one line per lift (a dot for the first set against last time, 🟢 up, 🟡 same, 🔴 down, ⚪ first time; what was done in shorthand, `42.5×9,8`; the next target in a grey code span, `↑ 45×6–8`, `42.5×10`, `↓ 30×8–10`), then the coach's feedback and the focus in a quote block at the bottom, then what's next. Telegram can't colour text, so colour comes from the dots and code spans. Claude writes 3–4 sentences from `H.facts` (every figure and its reason, drop-offs, skipped and extra lifts, calibration) and is told to add no numbers. A lift not in the plan is judged on 8–12.
`/workout` (and Send to phone) is now a numbered list to read, each lift with its sets × reps, today's target by the same rule and last time, then the template alone in a grey box Telegram copies with one tap: `WORKOUT <code>` and each lift's name and a colon, nothing to delete.
**Standard cardio.** `settings.usualCardio` is `{label, kind, note}`; the parser sets `usual: true` when Sam says "standard/usual cardio" (or the activity with no numbers) and the bot applies the label and note word for word, minutes from the message. WHY: "standard cardio 21 minutes" had been saved as "Incline walk on the treadmill", without the incline and speed.
**Weekly review.** Food counts only days that are over and not away: the review goes out at 19:00 on Sunday, so today is still being eaten, and away days are holidays. Planned sessions scale with the days away. WHY: the 15 Nov review averaged 2,119 kcal because a holiday day and an unfinished day counted. Away has always been settable from the bot ("away until Thursday", `/away 4`, `/back`).
