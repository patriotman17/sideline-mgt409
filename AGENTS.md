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
    │   ├── agents/           # Pydantic AI agents (Phase 2C)
    │   └── services/         # External integrations (Supabase etc., later)
    ├── data/nflverse/        # Committed per-game extracts + .source.json provenance
    ├── scripts/fetch_nflverse_games.py   # Downloads a season (to .cache/, ignored) and extracts games
    └── tests/                # tests/replay/: ingest, engine, sessions, API
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
- Navigation: `router.push({ pathname: '/game/[id]', params: { id, tab } })`.
  Game Detail accepts `tab=summary|plays|picks|chat` (old names are aliased).
  Historical replays: `router.push({ pathname: '/replay/[gameId]', params: { gameId } })`.
- State: read with `useAppState()`, mutate with `useAppActions()`. Keep the reducer pure.
- Async data: `useAsync(fn, deps)` (deps must be primitives). Plan: TanStack Query in Phase 2.
- Interactions: use `useHaptics()` (respects the user setting, no-ops on web). Every
  pressable gets `accessibilityRole` and, for icon-only controls, `accessibilityLabel`.
- Animations with RN `Animated` must use `USE_NATIVE_DRIVER` from `@/lib/animation`.
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

## Checks (run before declaring work done)

```bash
# mobile/
npx tsc --noEmit && npx expo lint && npx expo-doctor
npx expo export --platform ios --platform android --output-dir /tmp/sideline-export  # native bundle compiles

# backend/  (install dev tools once: .venv/bin/pip install -r requirements-dev.txt)
.venv/bin/ruff check . && .venv/bin/ruff format --check . && .venv/bin/mypy && .venv/bin/python -m pytest -q
```

## Roadmap hooks

| Phase | Where it plugs in |
|-------|-------------------|
| 2A/2B ✅ Historical ingestion + replay engine | `app/replay/` → `/api/v1/replay/*` → `mobile/src/services/replay.ts` + `hooks/useReplaySession.ts` |
| 2C AI agent with game tools (Pydantic AI via Portkey) | `backend/app/agents/`, tools read only `ReplaySession.visible_events()` / `GameState` → `/api/v1/assistant/chat` |
| 2D Mobile integration | Replace mock insights/chat in `services/assistant.ts` & `services/games.ts` with replay-backed data |
| 2E Evaluations | Accuracy, no-future-leakage, reliability suites alongside `tests/replay/` |
| Live scores (commercial provider) | `backend/app/services/` provider emitting the same `PlayEvent` model |
| Auth, profiles, picks persistence | Supabase → replace seeding in `state/AppStore.tsx` / `services/profile.ts` |
| Live watch parties | Supabase Realtime → `services/social.ts` + party actions in the store |
