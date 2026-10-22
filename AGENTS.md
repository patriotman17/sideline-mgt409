# AGENTS.md — Sideline

Guidance for humans and AI coding agents working in this repo.

Sideline is an AI-powered mobile companion for watching live NFL games:
live scores, play timelines, AI insights, predictions, AI chat, and watch parties.
This repo is the **MGT 409 (AI Foundations for Managers) final project** submission of Sideline,
a consumer product that is also being developed independently in a separate private repo. Course
deliverables (report, slides, hosting on Render) live here. Don't copy code, config, or credentials
in from other coursework or homework repos.

## Repo layout

```
Sideline/
├── .env / .env.example       # Shared secrets (PORTKEY_API_KEY). Read ONLY by the backend.
├── AGENTS.md  README.md  .mcp.json (Supabase MCP, project-scoped to Sideline)
├── supabase/                 # config.toml (auth settings) · migrations/*.sql (schema + RLS) · tests/*.sql (RLS checks)
├── mobile/                   # Expo SDK 57 · React Native · TypeScript · Expo Router · NativeWind v4
│   ├── AGENTS.md             # Expo-specific agent rules (versioned docs, expo install, CNG)
│   ├── app.json  babel.config.js  metro.config.js  tailwind.config.js  global.css
│   └── src/
│       ├── app/              # ROUTES ONLY (Expo Router). (tabs)/ = Scores, Picks, Party, Discover, You; game/[id].tsx
│       │                     #   welcome · sign-in · sign-up · forgot-password · reset-password · onboarding · auth/callback
│       ├── components/
│       │   ├── ui/           # Design-system primitives (Card, Chip, Button, SegmentedControl…)
│       │   ├── game/         # Scoreboard, FieldTracker, Timeline, InsightCard, PredictionCard, AIChat…
│       │   ├── auth/         # AuthLayout, TextField, ChoiceList, TeamPicker
│       │   ├── party/  discover/  profile/
│       ├── data/mock/        # FABRICATED sample data. Only imported by src/services/ (and seeding)
│       ├── services/         # Data-access seam: mock today → FastAPI tomorrow. Same signatures.
│       │                     #   supabase.ts (client + encrypted session storage) · account.ts (auth, profile, teams)
│       ├── state/AppStore.tsx# Local user state (picks, chats, parties, follows, settings)
│       ├── state/AuthContext.tsx # Auth status, session, profile, favorite teams (drives route guards)
│       ├── hooks/  lib/  theme/  types/
└── backend/                  # Python 3.12 · FastAPI · Pydantic AI (later)
    ├── requirements.txt  requirements-dev.txt  pyproject.toml (ruff/mypy)  pytest.ini  .env(.example)
    ├── app/
    │   ├── main.py           # create_app(): CORS, routers
    │   ├── core/config.py    # Settings via python-dotenv (+ SecretStr)
    │   ├── core/auth.py      # Supabase JWT verification (public JWKS) → CurrentUser dependency
    │   ├── api/routes/       # health.py, replay.py, predictions.py, ai.py, account.py (/me)
    │   ├── api/router.py     # /api/v1 aggregator
    │   ├── replay/           # Phase 2A/2B: nflverse ingestion + deterministic replay engine
    │   │   ├── source.py     #   nflverse URL, license, column list
    │   │   ├── ingest.py     #   CSV rows -> normalized PlayEvents + validation
    │   │   ├── models.py     #   Pydantic: Game, GameInfo, PlayEvent, GameState, ...
    │   │   ├── engine.py     #   pure apply_event / replay (no future leakage)
    │   │   ├── sessions.py   #   per-user playback (play/pause/resume/restart/step/speed)
    │   │   └── catalog.py    #   loads data/nflverse/*.csv once per process
    │   ├── agents/           # Phase 2C: Sideline AI (one Pydantic AI agent)
    │   │   ├── view.py       #   ReplayView: frozen snapshot at one cursor (the only thing tools see)
    │   │   ├── stats.py      #   deterministic team/player stats from revealed plays
    │   │   ├── tools.py      #   tool implementations (pure functions over ReplayView)
    │   │   ├── agent.py      #   agent, instructions (safeguards), SidelineAnswer output, PROMPT_VERSION
    │   │   ├── service.py    #   ask/explain pipeline: rate limit, cache, budget, limits, grounding, audit
    │   │   ├── insights.py   #   deterministic noteworthy-moment rules
    │   │   ├── conversation.py #  per-session chat memory (cursor-aware window, fingerprint)
    │   │   ├── llm.py        #   Portkey model factory + setup message
    │   │   ├── pregame.py    #   Sideline Preview agent (pregame preview from earlier weeks only)
│   │   └── audit.py · budget.py · cache.py · pricing.py · sanitize.py
    │   ├── pregame/season.py # Season-to-date context for a matchup (earlier weeks only, rules)
│   ├── predictions/      # Phase 2D: deterministic replay predictions
    │   │   ├── models.py     #   Prediction, Answer, PredictionStats, POINTS table
    │   │   ├── rules.py      #   detectors (revealed snapshot only) + resolvers (one event at a time)
    │   │   ├── config.py     #   PredictionConfig: ranking thresholds, cooldowns, pick window
    │   │   └── ledger.py     #   per-session lifecycle, featured selection, answers, stats, views
    │   └── services/         # External integrations (Supabase etc., later)
    ├── data/nflverse/        # Committed per-game extracts + .source.json provenance
    ├── scripts/fetch_nflverse_games.py   # Downloads a season (to .cache/, ignored) and extracts games
    ├── evals/                # Ask Sideline eval harness: cases.py (known situations), run.py
    └── tests/                # replay/ (engine, API) · agents/ (stats, tools, service, AI API) · evals harness
```

## Architecture principles

1. **Services are the only seam to data.** Screens/components never import `@/data/mock`
   (no exceptions — even seeding and the live-games tab badge go through services). To go live, change
   `src/services/*.ts` to call the backend; component code should not change.
2. **Secrets stay server-side.** The mobile app only sees `EXPO_PUBLIC_*` values, which are
   public by definition. API keys (Portkey, sports data, Supabase service role) live in
   `.env` files loaded by `backend/app/core/config.py`. Never log or return them; use `SecretStr`.
3. **Types are the contract.** `mobile/src/types/index.ts` mirrors the future API shapes.
   When backend endpoints arrive, define matching Pydantic models and keep field names aligned.
4. **Mock data is always labeled.** Any surface showing fabricated content shows a
   `<MockBadge />` or equivalent copy. Don't present mock scores/stats as real.
5. **AI visual language.** A lime ✦ sparkle + "Sideline AI" label marks AI-generated content.
6. **Historical replays are real data.** They come from the backend replay engine (nflverse),
   are labeled with their CC BY 4.0 attribution, and never show a result before it happens.

## Env loading (backend)

Precedence, highest first; existing values are never overwritten:
1. Process environment → 2. `backend/.env` → 3. repo-root `.env` → 4. `.env` one folder **above** the repo

(4) is a course requirement: the app must find `.env` in the repo folder first, then one folder up, so the
key can live outside the clone. `tests/test_config.py` covers the order. On Render, keys are set as
environment variables in the dashboard (1), so no `.env` file is deployed.

Expo only auto-loads `.env` files inside `mobile/`, so the root `.env` is never bundled.

`SUPABASE_URL` (backend, optional) is the only Supabase value the backend needs: it fetches the project's
**public** JWT signing keys from it. No Supabase secret / service-role key is used anywhere.

## Mobile conventions

- Expo SDK 57. Read `mobile/AGENTS.md` and fetch versioned docs before touching Expo APIs.
  Add packages with `npx expo install <pkg>` (not `npm install`) for SDK-compatible versions.
- Styling: NativeWind `className` with tokens from `src/theme/palette.json` (shared by Tailwind
  and TS via `colors`). Use `style` only for dynamic values (team colors, widths).
  The app is dark-only (`darkMode: 'class'` in Tailwind config).
- Tabs: Scores · Picks · Party · Discover · You. `(tabs)/_layout.tsx` uses native tabs
  (`expo-router/unstable-native-tabs` in SDK 57; becomes `expo-router/native-tabs` in SDK 58) for
  the system tab bar / iOS 26 Liquid Glass. `(tabs)/_layout.web.tsx` is a styled `expo-router/js-tabs`
  fallback because native tabs have no web tab bar. Screens own their safe-area padding
  (`disableAutomaticContentInsets`) and keep `pb-28` so content clears the floating bar.
  Theme exports (`DarkTheme`, `ThemeProvider`) come from `expo-router`.
- Type: scores, clocks and stats use Barlow Condensed via `font-score` / `font-score-bold` /
  `font-cond` (loaded in `src/app/_layout.tsx`); never combine those with `font-bold`.
  UI text uses the system font.
- Visual language (Scores redesign): pure-black background, no outlined cards, team colors
  carry meaning (row gradients away→home), lime only for user actions/selection, one quiet
  "Sample data" marker per screen.
- Replay AI: `hooks/useReplayChat` (Ask Sideline, loading/error/retry, setup message on `not_configured`)
  and `hooks/useReplayInsights` (refreshes only while visible, ≥5 s apart). The session token from
  `useReplaySession` stays in memory; never persist or log it.
- Navigation: `router.push({ pathname: '/game/[id]', params: { id, tab } })`.
  Game Detail accepts `tab=summary|plays|picks|chat` (old names are aliased).
  Historical replays: `router.push({ pathname: '/replay/[gameId]', params: { gameId } })`.
- State: read with `useAppState()`, mutate with `useAppActions()`. Keep the reducer pure.
- Async data: `useAsync(fn, deps)` (deps must be primitives). Plan: TanStack Query in Phase 2.
- Interactions: use `useHaptics()` (respects the user setting, no-ops on web). Every
  pressable gets `accessibilityRole` and, for icon-only controls, `accessibilityLabel`.
- Animations with RN `Animated` must use `USE_NATIVE_DRIVER` from `@/lib/animation`.
- Text inputs inside sheets (`presentation: 'modal'`): don't use `KeyboardAvoidingView` (it under-corrects
  inside sheets and does nothing on Android edge-to-edge). Wrap the scroll view + composer in a View with
  `useKeyboardOverlap()`'s ref and `paddingBottom: overlap`.
- React Compiler lint rules are on: don't read refs during render (use `useState(() => …)`
  for stable instances) and don't `setState` synchronously in effects.
- Imports: `@/` alias → `mobile/src/`.

## Backend conventions

- App factory in `app/main.py`; new features = a router in `app/api/routes/` mounted on
  `api_router` (`/api/v1/...`). `/health` stays unversioned at the root.
- Settings via `Depends(get_settings)`; override with `app.dependency_overrides` in tests.
- Response models are Pydantic `BaseModel`s; agents use typed deps and structured `output_type`.
- Dependencies are pinned only by name in `requirements.txt` for now — pin versions before
  deploying. Dev tools (ruff, mypy) live in `requirements-dev.txt`.
- `app/` and `scripts/` are mypy `--strict`; tests are type-checked with relaxed untyped-def rules.

## Replay engine (Phase 2A/2B)

Flow: nflverse CSV extract → `ingest.normalize_rows` → immutable `Game` → `engine.apply_event`
folded over `events[:cursor]` → `ReplaySession` (cursor derived from an injectable clock) → API.

- **Deterministic, not an LLM.** `apply_event(state, event, game)` is a pure function. Same events
  in, same state out.
- **No future leakage.** State at cursor *k* depends only on `events[:k]` (tested for every *k*).
  An event's `after` fields hold only the immediate post-play situation (the next snap's
  pre-snap down/distance/spot/possession) — never a later outcome. API responses never include
  later events, the final score, or warning text (only a warning count). Future AI context must
  come from `ReplaySession.visible_events()`.
- **Don't invent data.** Blank/`NA` source values stay `None`. Scoring comes only from explicit
  result flags; source score totals are used to *validate* the engine, and mismatches become
  `Game.warnings` rather than silent fixes.
- **nflverse quirks (verified on 2023 data):** `total_home_score`/`total_away_score` and
  `*_timeouts_remaining` already include the current row, despite the dictionary saying
  "start of play". Lost fumbles on kicks can be by the *receiving* team, so the loser is derived
  from who has the ball next. Rams are `LA`. Postseason OT is a 15:00 period.
- **Sessions:** unguessable ids, isolated state, idle TTL (2h) and a cap (500, LRU eviction).
  Speeds 0.25×–50×; 1× = one event per 3 s. Polling (1 s) from the app; WebSockets later.
- **Adding a game:** `cd backend && .venv/bin/python scripts/fetch_nflverse_games.py --season 2023
  --game <game_id>` (or `--season 2025 --week 5` for a whole regular-season week); commit the `.csv` +
  `.source.json`; run tests (ingestion must report 0 warnings). Extracts also carry the optional
  `start_time` (actual kickoff, ET) and `location` ("Neutral" = e.g. London) columns when the source has
  them; older extracts without them still load.
- **2025 Week 5:** all 14 games extracted (2,454 rows, ~1 MB), 0 ingestion
  warnings, engine finals match nflverse, and every player's pass/rush/receiving yards match nflverse's
  independent yardage columns (`tests/replay/test_week5_2025.py`, golden file in `tests/replay/data/`).
  Extracts also include `time_of_day` (the real UTC time of each play; it describes only that play).
- **Synchronized week** (`app/replay/week.py`, `api/routes/week.py` → `/api/v1/week/*`): one simulated
  clock over every game of a week. `GameTimeline` maps clock time → cursor (`bisect` over per-play times;
  marker rows inherit the previous time, times never run backwards), and state comes from the same pure
  `replay()`. `WeekSlate` groups games into TV windows from the listed kickoff (actual kickoff floored to
  5 min, ET): Thursday Night, Sunday · London (neutral site), 1:00 PM, 4:05 & 4:25 PM, Sunday Night,
  Monday Night; presets jump 5 min before each window. `WeekSession` = per-viewer clock (paused at start,
  speeds 1/10/60/300×, seek/clamp, finishes at the end), token-protected like replays (bad token = 404).
  **No leakage:** scheduled games return no score/period; finals only once the clock reaches the last
  play; the clock's upper bound is last kickoff + 4h30 (an estimate, never a real end time). Opening a
  game from the week creates a replay with `start_cursor` (revealed at once, paused);
  `PredictionLedger.visible_from` hides questions from before the join. Only weeks whose games all have
  per-play times appear (`slates_from`; today: 2025 Week 5).
- **Mobile Scores = the real week:** `state/WeekContext` (one in-memory week session, polled 1 s while
  playing; a 404 from any week call (backend restarted, host woke from sleep, session expired) drops the session
  and creates a fresh one, re-sending the watch list) → `(tabs)/index.tsx` with `WeekClock` (simulated ET time, play/pause, speeds, jump-to),
  Thursday/Sunday/Monday tabs (follow the clock until tapped), your teams pinned (#1 first), TV-window
  sections via `lib/week.ts` (`toScoreGame`, `weekSections`; unit-tested), and the tab badge = live games.
  The fabricated mock games no longer appear on Scores (other tabs still use labeled sample data), and
  the 2023 classic replays were removed from the app (their extracts stay in the repo for tests/evals).
- **Following the week in a game:** Scores opens live/upcoming games with `live=1`; the replay screen then
  **follows the week clock**: it steps its replay session (`stepBy`, ≤50 plays per request) up to the
  week's cursor for that game, so Ask AI / Insights / Picks stay in sync ("Live with the week"). Any
  manual control (play/pause, next play, speed, restart, "My own pace") detaches; "Back to live" rejoins
  (restarting first if you had played ahead). Finals open at your own pace.
- **Historical data in Supabase (optional source):** migration `20261016000000_historical_nfl_data.sql`
  creates a private **`history`** schema (not in the API's exposed schemas): `history.games` (schedule +
  full nflverse provenance + `rows_sha256`) and `history.plays` (`(game_id, row_index)` PK, `row` jsonb =
  the original extract row). RLS on both; **no grants to anon/authenticated**; the only access is SELECT
  for the **`sideline_reader`** role (NOLOGIN in the migration; the owner sets its password privately).
  Import: `scripts/import_history_to_supabase.py --season 2025 --week 5` (Supabase CLI as owner, one
  transaction per game, refuses games with warnings, `--verify` re-reads every row, compares hashes and
  rebuilds the engine events). Backend: `REPLAY_DATA_SOURCE=supabase` + `SUPABASE_DB_URL` (reader
  connection string) → `catalog.build_catalog` loads games via `history_db` (parameterized psycopg,
  read-only transaction, checksum re-check) and runs the **same** `build_game`; games that exist only
  locally (none today: the 2023 classics are imported too) are kept (`source="supabase+local"`); any failure logs
  only the exception type and **falls back to local CSVs** (default), so guests and graders need nothing
  extra. Tests always force `REPLAY_DATA_SOURCE=local` (`tests/conftest.py`), so they never touch a
  database.
  Clients never query `history.*` (that would leak future plays); they only get engine state via the API.
- **Data license:** nflverse data is CC BY 4.0 — keep the attribution visible wherever it's shown.
- **Session tokens:** `POST /sessions` returns `session_token` once; every other session request needs
  `X-Session-Token`. Only a SHA-256 hash is stored; bad token and unknown session both return 404.
- **Look-ahead columns are banned:** never extract `fixed_drive_result`, `drive_play_count`,
  `drive_time_of_possession`, `series_result` or similar drive/game summaries — they describe the future.

## Sideline AI (Phase 2C)

One Pydantic AI agent (`app/agents/agent.py`) answers questions about a replay. The deterministic engine
stays the source of truth: the agent only *reads* engine-derived facts through five tools —
`get_game_state`, `get_recent_plays`, `get_team_stats`, `get_player_stats`, `get_game_context`.

- **Leak-proof context.** Each request builds a `ReplayView` at the session cursor (revealed events +
  `GameState`, no final score, no full event list). Tools can't reach anything else. Insight
  explanations use the view *at that play*. `situation_note` is derived only from revealed plays and
  never reveals a future choice (e.g. extra point vs two-point).
- **Conversation memory.** Each `ReplaySession` owns a `Conversation` (server-side only; clients never send
  history, so they can't forge assistant turns). Each turn stores the cursor it was answered at;
  `context(cursor)` returns only turns at or before the current cursor (rewind/restart can't leak later
  answers), windowed by `AI_HISTORY_TURNS` (6) and `AI_HISTORY_MAX_CHARS` (3000). Older turns contribute
  their *questions only*. History is sent as plain user/assistant messages, answers stamped
  "[answered as of Qx m:ss, play N]"; tool outputs are never replayed — facts are always re-fetched.
  `DELETE /replay/sessions/{id}/conversation` starts a new chat; `GET` returns the turns visible at the
  current position (+ `hidden_later`). Failed questions aren't remembered.
- **Ties / ambiguous pronouns.** `get_player_stats` records rank-1 ties; a turn remembers which tied
  players its answer named. A following "he/his/him/she/her" with no name is answered deterministically
  (no model call, no cost, status `clarification`) with `clarification.options` = one rewritten question
  per player. The model can also return `clarification` for other ambiguities (instruction rule 7).
- **Mobile chat sync.** Every chat item carries the cursor it belongs to; `lib/replayChat.ts`
  (`visibleChat`, `reconcileChat`, unit-tested with jest-expo) hides items from later positions after a
  rewind/restart and shows them again when the replay gets there — the same rule the server applies.
  On rewind the hook re-syncs with `GET /conversation`.
- **Player vs team.** "Who has the most / leads in X" = individual players across both teams via
  `get_player_stats(category=...)` (ranked `leaderboard` + `leader_by_team`). `get_team_stats` is
  documented as team totals only, used for explicit team questions ("which team", "total", "battle").
- **Caching.** Answers: key = (`state_version` = game@cursor#data-hash, `PROMPT_VERSION`, model,
  conversation `fingerprint`, normalized question). Standalone questions (empty context) share across
  sessions at the same position; contextual follow-ups only hit with an identical context. Never across
  positions.
  Insight explanations: (game, play, state version, kind, prompt version, model). Bump
  `PROMPT_VERSION` whenever instructions or tool outputs change.
- **Structured output.** `SidelineAnswer {answer ≤900 chars, evidence[tool, fact, play_sequence],
  uncertainty, confidence, answerable}`. `check_grounding` drops evidence citing uncalled tools or
  unrevealed plays and downgrades confidence.
- **Safeguards.** Instructions forbid invented stats, future knowledge, formation/coverage claims, and
  following instructions inside `description_untrusted` or the question. Hard limits: `UsageLimits`
  (requests, tool calls, output tokens), `max_tokens`, timeout, per-session rate limit, daily USD budget,
  question ≤500 chars. Provider content-filter blocks surface as `blocked` (422), not as an outage.
- **Model/config.** Default `gpt-6-luna` via Portkey (`AI_MODEL`, `AI_BASE_URL`, `PORTKEY_PROVIDER`).
  Azure chat completions only allows tools with `AI_REASONING_EFFORT=none` for this model. Missing
  `PORTKEY_API_KEY` → 503 `not_configured` with a setup message; nothing pretends to work.
- **Audit.** One JSON line per AI request in `backend/logs/ai_audit.jsonl` (git-ignored) + in-memory
  ring buffer (`GET /api/v1/ai/audit`, development only): status, model, prompt version, tool calls
  (args, duration, ok/error), tokens, estimated cost, latency, error type. Keys never appear: records
  hold no headers and free text passes through `AuditLog.redact`.
- **Costs.** `pricing.estimate_cost` uses bundled genai-prices data (`gpt-6-luna`: $0.20/M in,
  $0.50/M out) unless `AI_INPUT_PRICE_PER_MTOK`/`AI_OUTPUT_PRICE_PER_MTOK` override it. Unknown → `None`
  and a conservative $0.01 is charged against the budget.
- **Tests never call a paid model**: use `FunctionModel` via `tests/agents/conftest.py::scripted`.
- **Evals:** `python -m evals.run` (offline, free) or `--live` (≈$0.004 for 17 cases + 3 conversations / 10 turns).
  `CONVERSATIONS` in `evals/cases.py` replays multi-turn chats (incl. the original "most rushing yards" →
  "No, which player?" failure, "the other team", "he", "now", and a rewind-leak check); `forbid_tools` fails
  player questions answered with team totals. Expected facts are
  computed from the engine; checks = factual, tool selection, grounding, no future leakage (incl. any
  player who only appears after the cursor), cost/latency.

## Predictions (Phase 2D)

Deterministic, server-authoritative predictions on historical replays. No AI decides eligibility,
options, deadlines, outcomes, or points (`app/predictions/`, `api/routes/predictions.py`).

- **Types (eligibility):** `next_play_gain_5` (3rd down), `fourth_down_conversion` (4th & ≤3; ≤5 in
  opponent territory; or Q4/OT trailing by 1-8 with ≤5:00 and ≤10 to go), `drive_touchdown` (first snap
  of a new drive), `next_score` (drive start when none pending; window = half / regulation / OT). No
  next-play/drive questions with ≤60 s left in Q2/Q4 (kneel-downs).
- **Featured moments (ranking + pacing):** eligible candidates are *ranked*, not all asked.
  `rules.rank` scores each from the revealed state only (base per type + late game / OT, one-score or
  tied, red zone, goal to go, short yardage, short field, takeaway, two-minute drill, opening drive /
  second half; minus 3rd & long and own-half 4th downs) and attaches `importance` + `tags` (the "why
  now", shown on the card). `PredictionLedger._feature` opens at most **one** question, and only when no
  other is open: the best candidate ≥ `min_score`, past the cooldown since the last question
  (`cooldown_snaps`, or `critical_cooldown_snaps` when ≥ `critical_score`), past `type_cooldown_snaps` for
  its type, and within `max_per_quarter` (critical moments ignore the cap). All knobs live in
  `app/predictions/config.py::PredictionConfig`; pacing state (snap count, last featured snap,
  per-type/per-quarter counts) is built only from revealed plays, so it stays deterministic and
  leak-free (truncated-game equality test covers it). Current result: **6** (Divisional) and **9** (Super
  Bowl) featured questions, pinned by `test_featured_moments_per_game`. Tests that exercise resolvers
  on every situation use `tests/predictions/helpers.EVERY` (ranking/pacing off).
- **Lifecycle:** OPEN → LOCKED at the **next snap** (any event except timeout / end of quarter /
  game start / end of game) → RESOLVED (correct option) or VOID (reason). Next-play and 4th-down
  resolve on that snap; void if it's a no-play penalty or not a pass/run (punt, FG, kneel, spike).
  Drive TD: yes on the drive team's TD; no on FG, punt, turnover, missed FG, opponent score, end of
  half/regulation/game. Next score: first scoring play's team, or `none` at the window's end.
- **Exploit prevention:** detectors take a `Revealed` (state + last revealed snap) only; the ledger
  processes each event once, in order, beyond its **high-water mark**. Restart/rewind never reopen
  or create questions until the replay passes the furthest play ever revealed. `submit_prediction`
  syncs the session to "now" under the session lock before validating, so a due play locks the
  question first. One final answer per question (same option = idempotent 200; different = 409).
  Reads hide questions opened after the current position and mask outcomes revealed after it
  (`result_hidden_until`).
- **Pick window (default):** when a question opens during playback, the next snap waits an extra
  `pick_window_seconds` (8 s at 1×, scaled by speed). It's anchored to when the play was *due*, not when
  a client polled, so the timeline is identical however often clients poll.
  `playback.pick_window_seconds_left` = seconds until that next snap; answering ends the window early.
- **Moment holds** (`moment_holds`: `off` · **`big`** (default) · `all`; set at session creation or via
  `PUT .../predictions/settings {moment_holds}`): a featured question is a **big moment** when its
  importance ≥ `critical_score` (`Prediction.big_moment`; about 2-6 per close game, 0 in blowouts; 18 in
  2025 Week 5). `big`: big moments hold the next snap `big_moment_hold_seconds` (12) **real** seconds at
  any speed (`playback.moment_hold`); others get the normal pick window. `all` = the old "pause for picks"
  (stop at every question until answered; `pause_for_predictions` still maps to it). `off` = pick window
  only. Answering ends a hold early. Playback-mechanics tests use `tests/replay/conftest.PLAIN`
  (`pick_window_seconds=0`) for exact 3 s timing.
- **Week holds:** `week.game_moments` precomputes each game's featured questions with the same
  deterministic ledger a replay runs (same ids). `PUT /week/sessions/{id}/watch {game_ids, level}` sets
  which games may stop the viewer's clock (the app sends the game being viewed + the #1 team's game).
  The clock stops **exactly** at a watched big moment (`status: "held"`, `hold {game_id, seconds_left,
  moment}`), holds 12 real seconds, then resumes by itself; `POST .../release` (after answering), play,
  pause, seek or unwatching end it; each moment holds once per pass. `WeekGame.moment` = the question
  open right now (never its outcome). Mobile: `MomentCard` in the replay screen (countdown, big choices,
  Skip), `MomentBanner` on Scores for the #1 team ("Make your call"), lime "Big moment" chips on rows,
  `RevealToast` (✓ +points / ✗ / void) after the snap, and the Picks panel's **Moment holds** choice
  (`lib/moments.ts`, unit-tested; remembered on the device by `WeekContext`).
- **Points (demo scoring):** correct = 10 next play, 15 next score, 20 drive TD, 25 4th down;
  incorrect/void/unanswered = 0. Accuracy = correct / (correct + incorrect). Streaks count consecutive
  correct answers in resolution order; voids neither extend nor break them. Points are per replay
  session and never competitive (historical outcomes are public); future live scoring belongs to
  Supabase accounts + a live provider emitting the same `PlayEvent`.
- **AI:** optional and never authoritative — question wording is templated, ranking is rules, outcomes
  and points are rules. AI is only `POST .../predictions/{id}/explain` (user taps "Why?") for resolved
  predictions, via `AIService.explain` with the view at the resolving play (shared cache, budget, audit),
  so cost is ≤ one cached call per featured question.
- **Mobile:** `hooks/useReplayPredictions` + `lib/replayPredictions.ts` (card states, optimistic answers
  with rollback, badge count, `inlinePick`, `lockLabel` countdown; unit-tested) → the open question shows
  **inline under the playback controls** (compact card with tags + "Next snap in Ns") and in the
  replay screen's **Picks** tab. Mock predictions in the game
  sheet / Picks tab stay separate and labeled "Sample data".

## Pregame (season context + Sideline Preview)

- **Data:** `scripts/build_pregame.py --season S --week W` reads the cached nflverse season file and writes
  `data/pregame/S_wWW.json`: every REG game with `week < W` (final score, net offensive yards on pass/run
  plays excluding two-point tries, giveaways = INTs thrown + fumbles lost by the fumbling team) and each
  player's season totals. It refuses to write a game from week ≥ W. Provenance (URL, sha256, license) in
  `source`.
- **Rules:** `app/pregame/season.py::SeasonData` (loaded once per file; `data_version` = file hash) derives
  records, streaks, last two results, per-game averages, league ranks (competition ranking; allowed: fewer =
  better), team leaders and `storylines` (unbeaten / winless / 3+ streak, top-3 offense or defense, bottom-3
  defense, turnover margin ≥ ±4, NFL #1 in a yards category, 20+ point result last week, both won/lost,
  rematch; ≤ 5, alternating teams). It filters `week < W` again (tested with an injected Week 5 game).
- **Supabase copy:** migration `20261022000000_pregame_season_context.sql` → `history.pregame_builds` /
  `pregame_games` / `pregame_players` (same read model as `history.games`: private schema, RLS, SELECT only
  for `sideline_reader`, nothing for anon/authenticated) with a database check `game_week < week` (a later
  game can't be stored). Import: `scripts/import_history_to_supabase.py --pregame [--verify]` (one transaction
  per build, read back and compared). With `REPLAY_DATA_SOURCE=supabase` `season_for` loads from there and
  re-checks `content_sha256` (canonical, row-order independent, excludes `generated_at`, so the local file and
  the copy share one `data_version`); any failure falls back to the local file.
- **API:** `api/routes/pregame.py` → `GET /api/v1/pregame/{game_id}` (public; includes `ai_preview` only if
  already cached, never triggers a model call) and `POST .../preview`.
- **Sideline Preview agent** (`app/agents/pregame.py`): `preview_agent` with `get_matchup_overview` /
  `get_team_leaders(team)` (only the two teams in the matchup) → `PregamePreview {headline ≤80, preview ≤600,
  evidence ≤4, confidence}`. Server-written prompt only. `AIService.preview`: shared cache key (game,
  `data_version`, `PREVIEW_PROMPT_VERSION` = pg.1, model), per-key `asyncio.Lock` (one call for concurrent
  requests), rate limit per client IP only on a miss, then the shared `_execute` runner (configured →
  budget → usage limits + max_tokens + timeout → spend; also used by Ask Sideline). `check_preview` drops
  evidence from uncalled tools and flags numbers absent from tool outputs (confidence → low);
  `mentions_result` withholds text containing the game's real final score unless that pair also appears in
  the tool outputs (status `withheld`, 502, never cached). Audit `kind="preview"`.
- **Tokens:** audit records and `usage` now include `cached_input_tokens` (provider prompt cache) for every
  AI call.
- **Mobile:** `services/pregame.ts` → `components/replay/PregameCard.tsx` (shown in the replay screen while
  the game is `scheduled`) with pure helpers in `lib/pregame.ts` (unit-tested).

## Accounts (Supabase)

Optional email/password accounts. **Guest demo must always work with zero Supabase config**: with no
`EXPO_PUBLIC_SUPABASE_*` values the welcome screen shows only Try Demo and the app makes no Supabase
requests; with no `SUPABASE_URL` the backend's account endpoints return 503 `auth_not_configured` while
replays / Ask AI / insights / predictions are unaffected. Guest mode never reads or writes account data.

- **Passwords are Supabase Auth's job, never ours.** Supabase hashes with bcrypt and a random salt per
  password inside `auth.users` (unreadable by API roles). Sideline never hashes, stores, logs, or returns
  passwords, hashes, or salts; no public table has such a column (checked by `supabase/tests/02_*`).
  Don't add client-side hashing or a second password store. Rules (`lib/account.ts`, mirrored in
  `supabase/config.toml`, `lower_upper_letters_digits_symbols`): ≥ 8 characters with lower + upper + digit +
  a Supabase ASCII symbol (`PASSWORD_SYMBOLS`), any other characters allowed, **≤ 72
  UTF-8 bytes** (bcrypt's input limit; `utf8ByteLength`) so a password is used exactly as typed or
  rejected, never truncated. Text fields for passwords have no `maxLength`. Emails are trimmed +
  lowercased (`normalizeEmail`) everywhere. Reset says "if an account exists…"; login says "Email or
  password is incorrect" (no enumeration). Resend/reset buttons wait 60 s (`useCooldown`), matching
  Supabase's per-user email limit; Supabase also rate-limits sign-in/sign-up/verify per IP.
- **Schema** (`supabase/migrations/`, applied with `npx supabase db push --linked`; never edit an applied
  migration, add a new one):
  - `nfl_teams`: 32 teams (nflverse abbrs, Rams = `LA`), read-only to everyone.
  - `profiles`: 1:1 with `auth.users`, created by the `on_auth_user_created` trigger. `username` unique
    `^[a-z0-9_]{3,20}$`; `display_name` 1-40; `knowledge_level` casual/regular/expert (regular);
    `ai_explanation_style` simple/balanced/detailed (balanced); `spoiler_shield` (false);
    `notifications_enabled` (true); `primary_team_abbr` (composite FK to the user's *own*
    `favorite_teams` row, cleared automatically on unfollow); `onboarded_at` (requires username + name);
    `created_at` / `updated_at` (trigger).
  - `favorite_teams` (user, team; max 8 via trigger) · `saved_stories` (user, story id slug; max 200).
  - Future (not created yet): prediction history, points, badges, friends, parties each get their own
    RLS table keyed on `profiles.id`; **demo replay scores and live competitive scores stay in separate
    tables** so demo points never reach live leaderboards. AI conversations stay server-side in replay
    sessions (`agents/conversation.py`) with their leakage rules; don't move them to Supabase.
- **RLS on every table; never disable it.** Policies compare `(select auth.uid())` (from the verified
  JWT) with the row owner. Column-level grants: clients may update only username, display_name,
  knowledge_level, ai_explanation_style, spoiler_shield, notifications_enabled, primary_team_abbr,
  onboarded_at; insert only `(user_id, team_abbr)` / `(user_id, story_id)`; never ids or timestamps;
  can't insert/delete profiles. `nfl_teams` is SELECT-only. `is_username_available(text)` is SECURITY
  DEFINER (boolean only, `authenticated` only; the one intentional advisor warning).
- **Verify DB changes** with the rolled-back suites in `supabase/tests/` (two throwaway users + anon; the
  final `VERIFY_OK` error is success) and `npx supabase db advisors --linked`.
- **Auth settings** live in `supabase/config.toml` `[auth]` (confirmations **off** for the course demo, password rules, secure
  password change, redirect URLs `sideline://**`, `exp://**`, localhost:8081). `npx supabase config push`
  changes **production** auth: show the diff and get approval first.
- **Mobile:** `services/supabase.ts` (publishable key only; PKCE; native sessions AES-256 encrypted with a
  per-write key in Keychain/Keystore via expo-secure-store, ciphertext in AsyncStorage; web uses
  localStorage; auto-refresh only while the app is foregrounded; one client across Fast Refresh) →
  `services/account.ts` (the only module touching Supabase tables; parameterized supabase-js queries,
  never SQL strings) → `state/AuthContext.tsx` (`status`: loading · signed_out · guest ·
  needs_onboarding · ready, from the pure, unit-tested `authStatus`). `Stack.Protected` guards route by
  status; `auth/callback` and `reset-password` handle email links (`exchangeCodeForSession`) in any
  state. Returning users skip Welcome (branded `LaunchScreen` while the profile loads). Logout =
  `signOut({ scope: 'local' })` + clearing profile/teams/stories; the local app store is remounted per
  user (`PerUserAppStore`). Backend calls as a user go through `asSignedInUser` (refresh once on 401).
- **Personalization** via `state/usePersonalization.ts` (account when signed in, demo profile otherwise):
  Scores puts your teams first (#1 team on top), score rows honor spoiler shield, Discover has a
  **My teams** filter (stories with a followed `teamId`) and synced saved stories, You shows the real
  profile, and Ask Sideline sends `preferences {knowledge_level, explanation_style}`.
- **Ask Sideline preferences** (`agents/agent.py::AnswerStyle`): validated enums only, turned into fixed
  server-written sentences by `style_instructions` (no client text reaches the prompt); phrasing only, so
  facts still come from the tools. Part of the answer-cache key and recorded in the audit log as
  `answer_style`. `PROMPT_VERSION` 2c.5.
- **Backend:** `core/auth.py` verifies `Authorization: Bearer <access_token>` against
  `<SUPABASE_URL>/auth/v1/.well-known/jwks.json` (PyJWKClient, cached 10 min, re-fetched for an unknown
  `kid`, so key rotation just works): asymmetric algorithms only (HS256 / `none` rejected), signature,
  `exp` (30 s leeway), `iss`, `aud=authenticated`, required claims. 401 for missing/invalid/expired, 403
  for a genuine non-user token (e.g. `role=anon`), 503 if keys are unreachable or auth isn't configured.
  Identity comes **only** from the verified `sub`; no endpoint accepts a user id. Use `CurrentUser` for any
  private endpoint. Replay `X-Session-Token` auth is separate and unchanged. Tests sign real ES256 tokens
  with a throwaway key (`tests/test_auth.py`), no network.
- **Demo: no email.** Supabase's built-in sender only reaches the project's team, so for MGT 409
  `enable_confirmations = false` (sign-up returns a session and goes straight to onboarding; the email
  is unverified) and `EMAIL_DELIVERY = false` (`lib/account.ts`) hides "Forgot password?". The code
  templates are commented out in config.toml because `config push` fails with them on the free tier.
  Re-enable all three together once custom SMTP with a real domain exists.
- **Email codes, not links.** Sign-up confirmation and password reset are typed-in **8-digit codes**
  (`verifyOtp` type `email` / `recovery`; `CodeField`, `codeError`, `EMAIL_CODE_LENGTH` = the project's
  `otp_length`), so they work on any device. **Not live yet:** the code templates
  (`supabase/templates/*.html`, `[auth.email.template.*]` in config.toml) can't be pushed on the free tier
  with Supabase's default sender; that needs custom SMTP (e.g. a Gmail App Password) entered in the
  dashboard. Until then Supabase sends its default **link** emails; the code screens say "Got a link
  instead? Open it on this same device and browser", and `/auth/callback` + `/reset-password` still
  handle links (same device/browser only, PKCE). The built-in sender only reaches Supabase-org members,
  about 2/hour. Test accounts can be created in the dashboard (Authentication → Users → Add user →
  Auto Confirm).
- **Native PKCE:** `lib/cryptoPolyfill.ts` (imported first in `services/supabase.ts`) gives Hermes
  `crypto.getRandomValues` + `crypto.subtle.digest` via expo-crypto. Without it supabase-js uses
  `Math.random()` verifiers and "plain" challenges on iOS/Android.

## Checks (run before declaring work done)

```bash
# mobile/
npx tsc --noEmit && npx expo lint && npx expo-doctor && npm test
npx expo export --platform ios --platform android --output-dir /tmp/sideline-export  # native bundle compiles

# backend/  (install dev tools once: .venv/bin/pip install -r requirements-dev.txt)
.venv/bin/ruff check . && .venv/bin/ruff format --check . && .venv/bin/mypy && .venv/bin/python -m pytest -q
.venv/bin/python -m evals.run            # offline eval harness (no cost); add --live when changing prompts/tools
```

## Roadmap hooks

| Phase | Where it plugs in |
|-------|-------------------|
| 2A/2B ✅ Historical ingestion + replay engine | `app/replay/` → `/api/v1/replay/*` → `mobile/src/services/replay.ts` + `hooks/useReplaySession.ts` |
| 2C ✅ Sideline AI agent + insights | `app/agents/` → `/replay/sessions/{id}/ask` & `/insights` → replay screen (Ask AI / Insights tabs) |
| 2D ✅ Dynamic predictions | `app/predictions/` → `/replay/sessions/{id}/predictions*` → replay screen Picks tab |
| Next | Replay-backed AI beyond the replay screen (mock game sheet chat still uses `services/assistant.ts`) |
| 2E Evaluations | Grow `evals/cases.py`; add regression thresholds to CI (live runs on prompt/tool changes) |
| Live scores (commercial provider) | `backend/app/services/` provider emitting the same `PlayEvent` model |
| Auth + profiles ✅ (Supabase) | `supabase/migrations` → `services/account.ts` → `state/AuthContext.tsx` → welcome/onboarding/You; FastAPI `CurrentUser` |
| Picks persistence | Supabase tables + RLS → replace seeding in `state/AppStore.tsx` / `services/profile.ts` |
| Live watch parties | Supabase Realtime → `services/social.ts` + party actions in the store |
