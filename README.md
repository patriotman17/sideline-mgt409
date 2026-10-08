# Sideline

AI-powered mobile companion that makes watching live NFL games more interactive,
personalized, and social.

> **Phase 1 status:** polished UI with clearly labeled **mock data**, plus a FastAPI backend
> with a `/health` endpoint. No real sports APIs, Supabase, or AI agents yet.

| | |
|---|---|
| Mobile | React Native · Expo SDK 57 · TypeScript · Expo Router · NativeWind v4 |
| Backend | Python 3.12 · FastAPI · Pydantic AI (planned) |
| Planned | Supabase (auth, DB, realtime) · Portkey AI gateway |

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
- Tests: `.venv/bin/python -m pytest -q`

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
npx tsc --noEmit      # types
npx expo lint         # ESLint (incl. React Compiler rules)
npx expo-doctor       # dependency / config health
```

## What's in the app

- **Home** — featured live game hero, quick actions, live carousel, AI Pulse insights, open predictions, your teams, upcoming games
- **Games** — Live / Upcoming / Final / All filter with scorecards
- **Watch Party** — active party room (live mini-scoreboard, reactions, group chat), join/leave, create a party
- **Discover** — search, category filters, trending players, stories with bookmarking, standings
- **Profile** — stats, badges, follow teams, settings (alerts, spoiler shield, AI commentary, haptics), backend status
- **Game Detail** — scoreboard with field tracker, timeouts and win probability; Timeline, Insights (+ leaders), Predict, and Ask AI chat tabs

All interactive state (picks, chat, parties, follows, settings) is local and resets on reload.

## Mock data disclaimer

Everything under `mobile/src/data/mock/` is fabricated for development: scores, stats, odds,
quotes, users, and AI responses are not real. Team names and colors are used for realism only;
team marks are generated from colors and abbreviations, not official logos.
