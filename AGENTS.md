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
│       ├── app/              # ROUTES ONLY (Expo Router). (tabs)/ = 5 tabs, game/[id].tsx = Game Detail
│       ├── components/
│       │   ├── ui/           # Design-system primitives (Card, Chip, Button, SegmentedControl…)
│       │   ├── game/         # Scoreboard, FieldTracker, Timeline, InsightCard, PredictionCard, AIChat…
│       │   ├── party/  discover/  profile/
│       ├── data/mock/        # FABRICATED sample data. Only imported by src/services/ (and seeding)
│       ├── services/         # Data-access seam: mock today → FastAPI tomorrow. Same signatures.
│       ├── state/AppStore.tsx# Local user state (picks, chats, parties, follows, settings)
│       ├── hooks/  lib/  theme/  types/
└── backend/                  # Python 3.12 · FastAPI · Pydantic AI (later)
    ├── requirements.txt  pytest.ini  .env / .env.example
    ├── app/
    │   ├── main.py           # create_app(): CORS, routers
    │   ├── core/config.py    # Settings via python-dotenv (+ SecretStr)
    │   ├── api/routes/       # health.py; future feature routers
    │   ├── api/router.py     # /api/v1 aggregator
    │   ├── agents/           # Pydantic AI agents (Phase 2+)
    │   └── services/         # External integrations (sports data, Supabase) (Phase 2+)
    └── tests/
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
5. **AI visual language.** Violet (`ai` token) + sparkles icon is reserved for AI-generated content.

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
- Tabs use `expo-router/js-tabs` (the bare `Tabs` export from `expo-router` is deprecated).
  Theme exports (`DarkTheme`, `ThemeProvider`) come from `expo-router`.
- Navigation: `router.push({ pathname: '/game/[id]', params: { id, tab } })`.
  Game Detail accepts `tab=timeline|insights|predict|chat`.
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
  deploying.

## Checks (run before declaring work done)

```bash
# mobile/
npx tsc --noEmit && npx expo lint && npx expo-doctor
npx expo export --platform ios --platform android --output-dir /tmp/sideline-export  # native bundle compiles

# backend/
.venv/bin/python -m pytest -q
```

## Roadmap hooks

| Phase | Where it plugs in |
|-------|-------------------|
| Real scores / play-by-play | `backend/app/services/` provider → `/api/v1/games` → `mobile/src/services/games.ts` |
| AI chat & insights (Pydantic AI via Portkey) | `backend/app/agents/` → `/api/v1/assistant/chat` → `mobile/src/services/assistant.ts` |
| Auth, profiles, picks persistence | Supabase → replace seeding in `state/AppStore.tsx` / `services/profile.ts` |
| Live watch parties | Supabase Realtime → `services/social.ts` + party actions in the store |
