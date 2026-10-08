# AGENTS.md — Sideline

Guidance for humans and AI coding agents working in this repo.

Sideline is an AI-powered mobile companion for watching live NFL games:
live scores, play timelines, AI insights, predictions, AI chat, and watch parties.
It is a standalone consumer product, unrelated to any coursework repo. Don't copy
code, config, or credentials in from elsewhere.

## Repo layout

```
Sideline/
├── .env / .env.example       # Shared secrets (PORTKEY_API_KEY). Read ONLY by the backend.
├── AGENTS.md  README.md
├── mobile/                   # Expo SDK 57 · React Native · TypeScript · Expo Router · NativeWind v4
│   ├── AGENTS.md             # Expo-specific agent rules (versioned docs, expo install, CNG)
│   ├── app.json  babel.config.js  metro.config.js  tailwind.config.js  global.css
│   └── src/
│       ├── app/              # ROUTES ONLY (Expo Router). (tabs)/ = Scores, Picks, Party, Discover, You; game/[id].tsx
│       ├── components/
│       │   ├── ui/           # Design-system primitives (Card, Chip, Button, SegmentedControl…)
│       │   ├── game/         # Scoreboard, FieldTracker, Timeline, InsightCard, PredictionCard, AIChat…
│       │   ├── party/  discover/  profile/
│       ├── data/mock/        # FABRICATED sample data. Only imported by src/services/ (and seeding)
│       ├── services/         # Data-access seam: mock today → FastAPI tomorrow. Same signatures.
│       ├── state/AppStore.tsx# Local user state (picks, chats, parties, follows, settings)
│       ├── hooks/  lib/  theme/  types/
└── backend/                  # Python 3.12 · FastAPI · Pydantic AI (later)
    ├── requirements.txt  requirements-dev.txt  pyproject.toml (ruff/mypy)  pytest.ini  .env(.example)
    ├── app/
    │   ├── main.py           # create_app(): CORS, routers
    │   ├── core/config.py    # Settings via python-dotenv (+ SecretStr)
    │   ├── api/routes/       # health.py, replay.py
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
    │   │   └── audit.py · budget.py · cache.py · pricing.py · sanitize.py
    │   ├── predictions/      # Phase 2D: deterministic replay predictions
    │   │   ├── models.py     #   Prediction, Answer, PredictionStats, POINTS table
    │   │   ├── rules.py      #   detectors (revealed snapshot only) + resolvers (one event at a time)
    │   │   └── ledger.py     #   per-session lifecycle, answers, stats, position-aware views
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
1. Process environment → 2. `backend/.env` → 3. repo-root `.env`

Expo only auto-loads `.env` files inside `mobile/`, so the root `.env` is never bundled.

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
  --game <game_id>`; commit the `.csv` + `.source.json`; run tests (ingestion must report 0 warnings).
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

- **Types:** `next_play_gain_5` (3rd down), `fourth_down_conversion` (4th & ≤3; ≤5 in opponent
  territory; or Q4/OT trailing by 1-8 with ≤5:00 and ≤10 to go), `drive_touchdown` (first snap of a new
  drive), `next_score` (drive start when none pending; window = half / regulation / OT). One open
  question per type (timeouts and quarter breaks never duplicate one). No next-play/drive questions
  with ≤60 s left in Q2/Q4 (kneel-downs).
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
- **Pause for picks** (default on, `PUT .../predictions/settings`): playback stops at the play where
  a question opens (`playback.paused_for_prediction`); answering every open question auto-resumes.
  Playback-mechanics tests pass `pause_for_predictions=False`.
- **Points (demo scoring):** correct = 10 next play, 15 next score, 20 drive TD, 25 4th down;
  incorrect/void/unanswered = 0. Accuracy = correct / (correct + incorrect). Streaks count consecutive
  correct answers in resolution order; voids neither extend nor break them. Points are per replay
  session and never competitive (historical outcomes are public); future live scoring belongs to
  Supabase accounts + a live provider emitting the same `PlayEvent`.
- **AI:** only `POST .../predictions/{id}/explain` for resolved predictions, via `AIService.explain`
  with the view at the resolving play (shared cache, budget, audit).
- **Mobile:** `hooks/useReplayPredictions` + `lib/replayPredictions.ts` (card states, optimistic answers
  with rollback, badge count; unit-tested) → replay screen **Picks** tab. Mock predictions in the game
  sheet / Picks tab stay separate and labeled "Sample data".

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
| Auth, profiles, picks persistence | Supabase → replace seeding in `state/AppStore.tsx` / `services/profile.ts` |
| Live watch parties | Supabase Realtime → `services/social.ts` + party actions in the store |
