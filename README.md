# Sideline

AI-powered mobile companion that makes watching live NFL games more interactive,
personalized, and social.

> **Status:** Phase 1 UI (clearly labeled **mock data**), Phase 2A/2B: a deterministic
> **historical replay engine** for real NFL play-by-play (nflverse), and Phase 2C: **Ask Sideline**,
> an AI agent that answers questions and explains key moments using only what has happened so far
> in the replay. No live commercial sports APIs, Supabase, or payments yet.

| | |
|---|---|
| Mobile | React Native · Expo SDK 57 · TypeScript · Expo Router · NativeWind v4 |
| Backend | Python 3.12 · FastAPI · Pydantic AI (gpt-6-luna via Portkey) |
| Planned | Supabase (auth, DB, realtime) |

See [AGENTS.md](AGENTS.md) for architecture and conventions.

## Prerequisites

- Node.js 20+ and npm
- Python 3.12 (3.10+ works)
- Optional: Xcode (iOS Simulator), Android Studio (emulator), or the Expo Go app on your phone

## 1. Environment files

```bash
cp .env.example .env                    # shared secrets, e.g. PORTKEY_API_KEY (backend only)
cp backend/.env.example backend/.env    # backend settings (APP_ENV, CORS_ORIGINS…)
cp mobile/.env.example mobile/.env      # optional: EXPO_PUBLIC_API_URL (public, non-secret)
```

Secrets go in the **root `.env`** and are read only by the backend. Never put secrets in
`mobile/.env` — anything prefixed `EXPO_PUBLIC_` ships inside the app bundle.

## 2. Backend

```bash
cd backend
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --reload --port 8000
```

- Health check: http://localhost:8000/health
- API docs (development only): http://localhost:8000/docs
- To use the app from a phone, add `--host 0.0.0.0` (see the API URL table below).

Checks (install dev tools once with `.venv/bin/pip install -r requirements-dev.txt`):

```bash
.venv/bin/ruff check . && .venv/bin/ruff format --check .   # lint + format
.venv/bin/mypy                                              # strict type check
.venv/bin/python -m pytest -q                               # tests
```

## 3. Mobile

```bash
cd mobile
npm install
npx expo start          # then press i (iOS), a (Android), or w (web)
```

Scan the QR code with Expo Go to run it on a phone. The Profile tab → **Developer → Backend**
row shows whether the app can reach the API.

API URL by target (set `EXPO_PUBLIC_API_URL` in `mobile/.env`):

| Target | URL |
|---|---|
| iOS Simulator / web | `http://localhost:8000` (default) |
| Android emulator | `http://10.0.2.2:8000` |
| Physical device | `http://<your-computer-LAN-IP>:8000` (start uvicorn with `--host 0.0.0.0`) |

Quality checks:

```bash
npm test              # unit tests (jest-expo)
npx tsc --noEmit      # types
npx expo lint         # ESLint (incl. React Compiler rules)
npx expo-doctor       # dependency / config health
```

## What's in the app

- **Scores** — Yesterday / Today / Upcoming, team-color score rows, featured game for your team, and **Classic replays** (real historical games, needs the backend)
- **Picks** — free-to-play picks (Live / My picks / Results) and your record
- **Party** — watch-party room with the game's score row, reactions, and chat
- **Discover** — stories, trending players, standings
- **You** — profile, teams, badges, saved stories, settings, backend status
- **Game sheet** — scoreboard + linescore; Summary, Plays, Picks, and Ask AI tabs
- **Replay sheet** — historical game replayed play by play with play / pause / restart / next play and 1×–10× speed, plus **Plays · Insights · Ask AI** tabs

Everything except replays uses local mock data and resets on reload.

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

## Ask Sideline AI (Phase 2C)

Ask questions about a replay ("Who leads in rushing?", "What just happened?") and get concise answers
with evidence, grounded only in plays revealed so far. The chat remembers the conversation within a
replay session, so follow-ups work: "No, which player?", "What about the other team?", "How many yards
does he have?", "Who leads now?" (always re-checked against the current play). If "he" could mean several
tied players, Sideline asks which one (with tap-to-ask options) instead of guessing. Rewinding or
restarting a replay hides chat messages from later in the game until the replay gets back there. Key moments (scores, lead changes, turnovers,
big plays, fourth downs, missed kicks) are detected by deterministic rules and explained by the AI.

**Setup:** put `PORTKEY_API_KEY` in the repo-root `.env`. Optional settings in `backend/.env`
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

## Data disclaimer

Everything under `mobile/src/data/mock/` is fabricated for development: scores, stats, odds,
quotes, users, and AI responses are not real. Historical replays use real nflverse data
(CC BY 4.0). Team names and colors are used for realism only;
team marks are generated from colors and abbreviations, not official logos.
