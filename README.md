# Sideline

**An AI companion for watching live NFL games:** every play explained as it happens, any football question answered
from real data, and the big moments turned into picks. All without making anything up.

> **Try it now: https://sideline-web.onrender.com** (phone or laptop; tap **Try Demo**, no account needed).
> MGT 409 (AI Foundations for Managers, Fall 2026) final project by Rahul Regula.
> Report: [`report.html`](report.html) · Slides: [`slides.html`](slides.html) (open in a browser; **F** = full screen).

| | |
|---|---|
| App | React Native · Expo SDK 57 · TypeScript (iPhone, Android, web) |
| Backend | Python 3.11+ · FastAPI · Pydantic AI · **gpt-6-luna via Portkey** (course key only) |
| Data | Real NFL play-by-play and stats from [nflverse](https://github.com/nflverse/nflverse-data) (CC BY 4.0), stored in Supabase, with the same data committed in the repo as the offline default |

## 2-minute tour

1. Open the link and tap **Try Demo**.
2. **Scores** replays the real 2025 Week 5 on one clock: under **Jump to**, tap **Sunday · 1:00 PM**, pick **60×**,
   press **▶**. Games go live and score exactly as they did; nothing is shown before it happens.
3. Open a live game (e.g. Broncos @ Eagles): it stays in sync with the clock. Use **Ask AI** ("Who has the most rushing
   yards so far?"). When the game **pauses for a big moment**, make your call.
4. Open a game that hasn't started (e.g. Patriots @ Bills) for the **pregame** card and its AI preview.
5. Tap the lime **Ask** button (bottom right) for any football question: rules ("What's a two-point conversion?"),
   this season ("Who has the best defense?"), history ("How did the 2007 Patriots do?").
6. Optional: **You → Developer → Show AI usage** prints the real tokens and cost under every AI answer.

**Picks, Party and Discover** are labeled previews of upcoming features (sample data).

## Run it locally (about 5 minutes)

Needs **Python 3.11 or 3.12** and **Node.js 20+**. Only one key is used: `PORTKEY_API_KEY`.

**1. The key.** The backend looks for `.env` in the repo folder first, then **one folder above it** (so the staff
`.env` next to the cloned repo works as is). It needs `PORTKEY_API_KEY`; `OPENAI_API_KEY` is not used.

```
submissions/
├── .env              ← PORTKEY_API_KEY=...   (found here)
└── sideline-mgt409/  ← this repo (a .env here would win)
```

**2. Backend** (terminal 1):

```bash
cd sideline-mgt409/backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --port 8000
```

Check: http://localhost:8000/api/v1/status shows `"status":"ok"`.

**3. App in the browser** (terminal 2):

```bash
cd sideline-mgt409/mobile
npm install
npx expo start --web
```

It opens http://localhost:8081. Tap **Try Demo** and follow the tour above. (Phone: install Expo Go, set
`EXPO_PUBLIC_API_URL=http://<your-computer-IP>:8000` in `mobile/.env`, start the backend with `--host 0.0.0.0`, and scan
the QR code.)

**Data, no setup needed.** The repo includes everything the app uses (2025 Week 5 play-by-play, Weeks 1-4 season
context, 1999-2024 player and team seasons; about 2 MB), so it runs with no database. The hosted app reads the same data
from Supabase instead: set `REPLAY_DATA_SOURCE=supabase` and `SUPABASE_DB_URL` (read-only role) to switch; any database
problem falls back to the committed files. Accounts (sign-up) also need Supabase; without it the app offers **Try Demo**
only.

**Checks** (optional):

```bash
cd backend && .venv/bin/pip install -r requirements-dev.txt && .venv/bin/python -m pytest -q   # 291 tests, no paid calls
cd mobile && npm test                                                                           # 63 tests
```

See [AGENTS.md](AGENTS.md) for the architecture in detail, and the sections below for each feature.

---

## What's in the app

**Scores is the real 2025 Week 5.** One simulated clock replays the whole week the way it happened:
Thursday night, the London morning game, six overlapping 1 PM games, the 4 PM games, Sunday and Monday
night. Press play (1×–300×) or jump to a window; games go live, score and finish exactly as they did,
and nothing is shown before the clock reaches it. Tap any game to watch it from that moment with Ask
Sideline, Insights and Picks: it stays **live with the week** as the clock runs, or tap **My own pace**
to control it yourself (and **Back to live** to rejoin).

**Big moments.** Sideline pauses where it matters, like a broadcast before a 4th down: when a big moment
arrives in the game you're watching (or your #1 team's game), play holds for about 12 seconds with the
situation and two big choices, then the result lands right after the snap (✓ +points or ✗). Blowouts
never stop; close finishes might stop two to six times. Change it in the Picks tab: **Off**, **Big
moments** (default) or **Every question**. Data: nflverse play-by-play (CC BY 4.0), including the real time of
every play.

- **Scores** — Yesterday / Today / Upcoming, team-color score rows, featured game for your team, and **Classic replays** (real historical games, needs the backend)
- **Picks** — free-to-play picks (Live / My picks / Results) and your record
- **Party** — watch-party room with the game's score row, reactions, and chat
- **Discover** — stories, trending players, standings
- **Welcome** — Create Account · Log In · **Try Demo** (no account needed)
- **Onboarding** (new accounts) — display name + unique username, football knowledge, AI explanation style, up to 8 favorite teams
- **You** — profile, teams, badges, saved stories, settings, backend status; signed in: your real profile, Sideline AI preferences, edit profile, change password, log out
- **Game sheet** — scoreboard + linescore; Summary, Plays, Picks, and Ask AI tabs
- **Replay sheet** — historical game replayed play by play with play / pause / restart / next play and 1×–10× speed, plus **Plays · Picks · Insights · Ask AI** tabs (Picks = real, auto-scored predictions)

Everything except replays and accounts uses local mock data and resets on reload.

## Historical replays (Phase 2A/2B)

Real NFL play-by-play is replayed by a deterministic Python engine (not an LLM). The engine
updates score, quarter, clock, possession, down, distance, field position, timeouts and win
probability one event at a time, and never exposes a play before the replay reaches it.

**Included games** (`backend/data/nflverse/`):

| game_id | Game | Plays |
|---|---|---|
| `2023_20_KC_BUF` | AFC Divisional Round · Jan 21, 2024 · Chiefs at Bills | 166 |
| `2023_22_SF_KC` | Super Bowl LVIII · Feb 11, 2024 · 49ers vs Chiefs (OT) | 207 |

**Data source:** [nflverse play-by-play](https://github.com/nflverse/nflverse-data/releases/tag/pbp)
(`play_by_play_2023.csv.gz`), licensed **CC BY 4.0**. Each extract has a `.source.json` with the
source URL, SHA-256, retrieval time, and license. Add more games with:

```bash
cd backend
.venv/bin/python scripts/fetch_nflverse_games.py --season 2023 --game 2023_20_KC_BUF
```

The full season file is cached in `backend/.cache/` (git-ignored); only per-game extracts are committed.

**API** (`/api/v1/replay`):

| Method | Path | Purpose |
|---|---|---|
| GET | `/games` | Available games (matchup and metadata only, no results) |
| POST | `/sessions` | Start a replay `{game_id, speed?, autoplay?}` → session snapshot |
| GET | `/sessions/{id}` | Current state (poll while playing) |
| POST | `/sessions/{id}/play` · `/pause` · `/resume` · `/restart` | Playback controls |
| POST | `/sessions/{id}/step` | Advance `{plays: n}` events manually |
| PUT | `/sessions/{id}/speed` | `{speed}` from 0.25 to 50 (1× = one play every 3 s) |
| DELETE | `/sessions/{id}` | End the session |

Sessions are isolated per id, expire after 2 hours idle, and require the `session_token`
returned at creation in an `X-Session-Token` header on every other request.

## Predictions (Phase 2D)

During a historical replay, Sideline asks a handful of questions at the game's **featured moments**
and scores them automatically, using deterministic rules (never AI) and only the plays revealed so far:

| Question | Eligible when | Points |
|---|---|---|
| Will the next play gain 5+ yards? | 3rd down | 10 |
| Which team will score next? | A drive starts (one at a time) | 15 |
| Will this drive end in a touchdown? | A drive starts | 20 |
| If they go for it on 4th down, will they convert? | 4th & short / realistic go-for-it spots | 25 |

Not every eligible moment is asked. Each one is ranked by how much it matters (late and close, overtime,
red zone, goal to go, 4th & short, short field after a takeaway, opening drive / second half), and only
the best one opens, with cooldowns between questions, per type, and per quarter. That's about 5–10
questions per game: **6** for the Divisional Round replay and **9** for Super Bowl LVIII. Each card
says why it was picked ("4th down · Late game · One-score game"). Tune it in
`backend/app/predictions/config.py`.

- Answers lock at the **next snap**; picks are final. Results resolve on the deciding play or drive.
- **Void** (0 points, doesn't affect accuracy or streaks) when the question can't be fairly scored,
  e.g. the play is wiped out by a penalty or a team punts instead of going for it.
- Incorrect and unanswered = 0. Accuracy = correct ÷ (correct + incorrect); current and longest
  streaks count consecutive correct answers.
- The open question appears **right under the replay controls** (and in the Picks tab). By default
  the replay keeps going but gives you a short **pick window**: the next snap waits about 8 extra seconds
  (at 1×), with a countdown. Answering ends the wait.
- **Pause for picks** (off by default) stops the replay until you answer instead.
- **Demo scoring:** historical outcomes are public, so points live only in that replay session.
  Restarting or rewinding never re-offers a question or shows a result early.
- "Why?" on a result asks Sideline AI to explain it (optional; cached).

| Method | Path (`/api/v1/replay/sessions/{id}/…`) | Purpose |
|---|---|---|
| GET | `predictions` | Open, waiting, recent results, stats, pause setting (one poll) |
| GET | `predictions/open` · `predictions/resolved` · `predictions/history` · `predictions/stats` | Individual views |
| POST | `predictions/{prediction_id}/answer` | `{option_id}` — final; same answer again is idempotent |
| PUT | `predictions/settings` | `{pause_for_predictions}` |
| POST | `predictions/{prediction_id}/explain` | AI explanation of a resolved prediction |

## Ask Sideline AI (Phase 2C)

Ask questions about a replay ("Who leads in rushing?", "What just happened?") and get concise answers
with evidence, grounded only in plays revealed so far. The chat remembers the conversation within a
replay session, so follow-ups work: "No, which player?", "What about the other team?", "How many yards
does he have?", "Who leads now?" (always re-checked against the current play). If "he" could mean several
tied players, Sideline asks which one (with tap-to-ask options) instead of guessing. Rewinding or
restarting a replay hides chat messages from later in the game until the replay gets back there. Key moments (scores, lead changes, turnovers,
big plays, fourth downs, missed kicks) are detected by deterministic rules and explained by the AI.

**Setup:** put `PORTKEY_API_KEY` in `.env` (repo folder or one folder above it). Optional settings in `backend/.env`
(see `backend/.env.example`): `AI_MODEL` (default `gpt-6-luna`), `AI_DAILY_BUDGET_USD` (default 2.0),
rate/token limits, price overrides. Without a key, the app shows a setup message instead of answers.

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/replay/sessions/{id}/ask` | `{question}` → answer, evidence, uncertainty, confidence, as-of position |
| GET | `/api/v1/replay/sessions/{id}/conversation` | Chat turns visible at the current replay position (+ how many are hidden as later) |
| DELETE | `/api/v1/replay/sessions/{id}/conversation` | Start a new chat (forget this session's earlier turns) |
| GET | `/api/v1/replay/sessions/{id}/insights?limit=&explain=` | Key moments so far + AI explanations (≤3 new per call) |
| GET | `/api/v1/ai/status` | Configured?, model, today's estimated spend vs budget (no secrets) |
| GET | `/api/v1/ai/audit` | Recent AI audit records (development only) |

**Cost:** about **$0.00015–0.0003 per question** with `gpt-6-luna` ($0.20/M input, $0.50/M output tokens);
spend is capped per day. Every AI call is logged to `backend/logs/ai_audit.jsonl` (no secrets).

**Evals:** `cd backend && .venv/bin/python -m evals.run` (offline, free) or `--live` (≈$0.005) checks
factual accuracy, tool selection, evidence grounding, future-data leakage, and cost/latency on known
situations from both replay games.

## Pregame (season so far + AI preview)

Open any Week 5 game before kickoff and a **Pregame** card shows both teams' season so far: record,
streak, last two results, points scored / allowed and yards per game, turnover margin, season leaders
(with league rank) and up to five rule-based storylines ("NYJ is 0-4 and still looking for its first
win."). It disappears at kickoff.

- **Data:** `backend/data/pregame/2025_w05.json` (64 games from Weeks 1-4 + 400 players' totals, 140 KB),
  built from the cached nflverse season file by
  `cd backend && .venv/bin/python scripts/build_pregame.py --season 2025 --week 5`. It contains only
  games *before* the previewed week (the script refuses anything else, and the backend filters again).
- **Also in Supabase** (optional, like the play-by-play): `history.pregame_*` tables, imported with
  `scripts/import_history_to_supabase.py --pregame`; the database itself refuses a game from the previewed
  week or later. The local file stays the default and the fallback.
- **API:** `GET /api/v1/pregame/{game_id}` (no session needed: earlier weeks can't spoil the game) and
  `POST /api/v1/pregame/{game_id}/preview`.
- **Sideline AI preview** (shown automatically; on Render all 14 are written at startup with
  `AI_PREGENERATE_PREVIEWS=true`): a second, smaller agent (**Sideline Preview**,
  `app/agents/pregame.py`) with two read-only tools, `get_matchup_overview` and `get_team_leaders`.
  The prompt is written by the server only (no user text), so there's nothing to inject. One preview is
  written per game and **shared by every user** (cached 7 days; simultaneous requests wait for one model
  call), so the whole week costs about 14 calls (≈ $0.0003-0.0004 each). Safeguards: the same budget,
  usage limits, timeout and audit log as Ask Sideline; numbers that no tool returned are flagged and drop
  confidence to low; a preview that states the game's **real final score** is withheld (`withheld`, never
  cached), since the model may remember how these 2025 games ended.

## Ask Sideline (any football question)

The lime **Ask** button on every tab opens a chat for questions outside a single game: rules and penalties
("What's a two-point conversion?"), players ("Is Josh Allen good this year?"), teams ("How are the Bills
doing?"), league leaders, and "What are the scores right now?" (your week clock's scoreboard). A third agent
answers only from Sideline's curated rule guide, the real season data (Weeks 1-4, plus this week as far as
your clock has gone) and **NFL history 1999-2024** (careers season by season, past leaders, team records, Super
Bowl champions; nflverse, stored in Supabase `history.*` with the committed `backend/data/history/` as fallback), shows its sources, and refuses to state results your clock hasn't reached. About
$0.0003 per question; repeated questions are cached.

## Accounts (optional)

Sideline works fully **without accounts**: tap **Try Demo** for real replays, Ask Sideline, insights and
demo predictions. Graders and anyone running locally need only `PORTKEY_API_KEY`. With Supabase
configured, people can create an account and Sideline remembers them across sessions and devices.

### What an account adds
Sign up (no email confirmation for the course demo, see Known limits), log in / out, and sessions that
survive restarts. A
4-step onboarding (name + unique @username → favorite teams + a #1 team → knowledge level, AI
explanation style, spoiler shield, game alerts → review) saves a profile that drives the app:
your teams first on Scores, a **My teams** filter and synced saved stories in Discover, your real
profile in You (everything editable there), and Ask Sideline answers phrased for your knowledge level
and preferred detail. Game facts always come from the replay engine, never from preferences.

### Setup
| Where | Variable | Notes |
|---|---|---|
| `mobile/.env` | `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public by design (the "publishable" key). Never put the secret / service-role key in the app |
| `backend/.env` | `SUPABASE_URL` | Only used to download the project's **public** signing keys and verify logins |

1. `npx supabase login`, then `npx supabase link --project-ref <your-project-ref>`.
2. `npx supabase db push --linked` applies `supabase/migrations/` (tables, constraints, triggers, RLS).
3. `npx supabase config push` applies `supabase/config.toml` auth settings (review the diff it shows).
4. Optional check: `npx supabase db query --linked -f supabase/tests/01_profiles_favorites_rls.sql`
   (and `02_…`). They run as two throwaway users and always roll back; success prints `VERIFY_OK`.

### Database
| Table | Holds | Who can access it |
|---|---|---|
| `profiles` | username (unique), display name, #1 team, knowledge level, AI style, spoiler shield, alerts, onboarding status, timestamps | Only the owner (read + edit allowed fields) |
| `favorite_teams` | up to 8 followed teams per user | Only the owner (read, add, remove) |
| `saved_stories` | saved Discover stories (up to 200) | Only the owner (read, add, remove) |
| `nfl_teams` | the 32 teams | Everyone can read; nobody can change |

Row Level Security is on for every table, and each policy compares the row's owner with the user id
inside the verified login token (`auth.uid()`), so one user can never read or change another's data,
even by calling the database API directly. Users can't edit ids or timestamps, and guests (anonymous)
can't see any account table.

### How passwords are protected
- **Supabase Auth does it all.** Passwords go straight from the app to Supabase over HTTPS. Supabase
  stores only a **bcrypt** hash with a **unique random salt** per password (its managed work factor),
  and verifies, confirms and resets accounts with its own expiring, single-use tokens.
- **Why not our own bcrypt?** A second password system would be one more place for a leak or a mistake
  (weak work factor, missing salt, timing bugs). Supabase's implementation is purpose-built, audited and
  maintained, and keeps hashes in a schema our API can't read.
- **Sideline never sees password hashes and never stores passwords.** No Sideline table has a password,
  hash or salt column, and passwords never reach our backend, logs, audit trail or API responses.
- **Rules:** 8+ characters with a lowercase and an uppercase letter, a number and a symbol (the
  project's `lower_upper_letters_digits_symbols` setting); spaces, accents and emoji are fine too; at most
  **72 bytes in UTF-8** (bcrypt's limit, so accents and emoji count 2-4 each). Too-long passwords are
  rejected with a clear message and never silently cut. Emails are trimmed and lowercased.
- **No account fishing:** wrong logins say "Email or password is incorrect"; reset says "if an account
  exists…". Resend / reset wait 60 s between emails, and Supabase rate-limits auth requests per IP.

### Sessions and the API
- **On the phone**, the session is AES-256 encrypted with a key kept in the iOS Keychain / Android
  Keystore. **On the web**, it's in the browser's storage for this site. Supabase refreshes the
  short-lived access token automatically; if that fails you're signed out. Logging out revokes this
  device's session and clears your data from the app.
- **The FastAPI backend** checks every account request's token against Supabase's public signing keys
  (signature, issuer, audience, expiry), picks up key rotation automatically, and takes the user's
  identity only from the verified token. `GET /api/v1/me` returns the signed-in user: 401 without a valid
  token, 403 for a token that isn't a user's. Replay sessions keep their own separate `X-Session-Token`.
- **No secrets in the app:** the bundle contains only the public URL and publishable key. The Supabase
  secret / service-role key and the Portkey key are never used by the app, and `.env` files are git-ignored.

### Who protects what
| Protection | Sideline | Supabase |
|---|---|---|
| Password hashing (bcrypt + salt), verification, reset and confirmation tokens | | ✓ |
| Auth rate limits and abuse protection | cooldown on email buttons | ✓ |
| Password rules (8+, lower + upper + digit + symbol, ≤ 72 bytes) and input validation | ✓ (in the app) | ✓ (server settings) |
| Database schema, constraints, RLS policies, column permissions | ✓ (migrations) | enforces them |
| Session storage (encrypted on device) and logout cleanup | ✓ | refresh-token revocation |
| JWT verification in FastAPI, identity from the token only | ✓ | publishes signing keys |
| Guest demo with no account data access | ✓ | |

### Known limits
- **No email is sent for the course demo.** Supabase's built-in sender only delivers to members of
  the project's Supabase team (about 2 emails per hour), so strangers could never confirm an account.
  For MGT 409, **email confirmation is off** (`enable_confirmations = false`): sign up goes straight to
  onboarding, but the address isn't verified. **Forgot password is hidden** (`EMAIL_DELIVERY = false`
  in `mobile/src/lib/account.ts`).
- **To turn email back on:** add a custom SMTP sender with a domain you own (Supabase → Authentication →
  Emails → SMTP Settings, e.g. Resend), uncomment the code templates in `supabase/config.toml`, set
  `enable_confirmations = true`, `npx supabase config push`, and set `EMAIL_DELIVERY = true`. Sign-up
  confirmation and password reset then use **8-digit codes** typed into the app (already built), so they
  work on any phone or computer.

## Historical data source (local or Supabase)

By default the backend reads the committed nflverse extracts in `backend/data/nflverse/`. That needs no
setup and is what graders use. Optionally the same data can live in Supabase:

1. Apply the migrations (`npx supabase db push --linked`), which create a private `history` schema that
   app users can't query, plus a read-only `sideline_reader` role.
2. Import: `cd backend && .venv/bin/python scripts/import_history_to_supabase.py --season 2025 --week 5`
   (add `--verify` to re-check every row against the local files).
3. In the Supabase SQL editor, give the reader a password you choose:
   `alter role sideline_reader with login password '…';`
4. In `backend/.env`: `REPLAY_DATA_SOURCE=supabase` and
   `SUPABASE_DB_URL=postgresql://sideline_reader.<project-ref>:<password>@<pooler-host>:5432/postgres`
   (pooler host from the dashboard's **Connect** panel).

Switch back any time with `REPLAY_DATA_SOURCE=local`. Games that are only in the local folder (not
imported yet) still appear, and if Supabase can't be read the backend falls back to the local files
automatically. Either way, game facts are computed by the same replay engine, and the
app only receives what the replay has revealed.

## Deploy (Render)

`render.yaml` is a Render **Blueprint** for two services from this repo:

| Service | What | Free-tier notes |
|---|---|---|
| `sideline-api` | FastAPI backend (`backend/`), Python 3.12, pinned `requirements.txt`, health check `/health` | **Starter** plan ($7/month): always on. On the free plan it would sleep after ~15 idle minutes; the app handles that anyway ("Waking up the Sideline server…", fresh sessions after a restart). |
| `sideline-web` | The Expo **web** build of the app (`mobile/`, `expo export --platform web`), static, every path rewritten to `index.html` | Wide screens show the app as a centered phone-width column; phone browsers get the full-screen layout. |

1. Render → **New → Blueprint** → pick this repo. Render reads `render.yaml`.
2. When asked, enter the secrets (never in git): `PORTKEY_API_KEY`; optionally `SUPABASE_URL` and
   `SUPABASE_DB_URL` (read-only `sideline_reader` connection string) for accounts and the Supabase data
   source, and the public `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for the web app.
   With only `PORTKEY_API_KEY` the app runs in guest mode on the committed data files.
3. The two public URLs are written in `render.yaml` (`EXPO_PUBLIC_API_URL` for the web build, `CORS_ORIGINS`
   for the backend). Render's `fromService` `host` is the private network name, so it can't be used for
   browser traffic. If Render gives your services other names, update those two values.
   Live: web **https://sideline-web.onrender.com** · API https://sideline-api-6b29.onrender.com/health
4. Supabase Auth's `site_url` and redirect allowlist point at the deployed web app (`supabase/config.toml`;
   change them there and `npx supabase config push` if your URL differs).

Production mode (`APP_ENV=production`) turns off `/docs` and the development-only AI audit endpoint, and
uvicorn runs with `--proxy-headers` so the AI rate limit sees each visitor's real IP.

## Data disclaimer

Everything under `mobile/src/data/mock/` is fabricated for development: scores, stats, odds,
quotes, users, and AI responses are not real. Historical replays use real nflverse data
(CC BY 4.0). Team names and colors are used for realism only;
team marks are generated from colors and abbreviations, not official logos.
