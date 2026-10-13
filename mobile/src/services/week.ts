/**
 * Synchronized week: one simulated clock over every game of a real NFL week (nflverse data,
 * deterministic replay engine on the backend). The backend returns only what has happened by the
 * clock time: no score for scheduled games, no final before it's reached.
 */
import { apiGet, apiRequest } from './http';

const BASE = '/api/v1/week';

export type WeekPhase = 'scheduled' | 'live' | 'final';
export type WeekClockStatus = 'paused' | 'playing' | 'finished';

export interface WeekTeam {
  abbr: string;
  city: string | null;
  name: string | null;
}

export interface WeekGame {
  game_id: string;
  away: WeekTeam;
  home: WeekTeam;
  kickoff_at: string;
  /** Listed kickoff in ET, e.g. "Sun 1:00 PM". */
  kickoff_label: string;
  window_key: string;
  window_label: string;
  venue: string | null;
  neutral_site: boolean;
  /** Closing spread (pregame): positive = home favored. */
  spread_line: number | null;
  phase: WeekPhase;
  /** Plays revealed so far; opens the game's replay at this moment. */
  cursor: number;
  away_score: number | null;
  home_score: number | null;
  quarter: number | null;
  clock_seconds: number | null;
  /** "Q2 4:12", "Half", "End Q3", "Final", "Final/OT". */
  period_label: string | null;
  possession: string | null;
  down: number | null;
  distance: number | null;
  yardline_100: number | null;
  ball_on: string | null;
  home_win_probability: number | null;
}

export interface WeekPreset {
  key: string;
  label: string;
  at: string;
}

export interface WeekSnapshot {
  session_id: string;
  season: number;
  week: number;
  title: string;
  status: WeekClockStatus;
  speed: number;
  speeds: number[];
  sim_time: string;
  /** e.g. "Sun, Oct 5 · 2:30 PM ET". */
  sim_time_label: string;
  starts_at: string;
  ends_at: string;
  presets: WeekPreset[];
  games: WeekGame[];
  live_games: number;
  attribution: string;
  license: string;
}

export interface WeekAuth {
  sessionId: string;
  token: string;
}

const auth = (a: WeekAuth) => ({ 'X-Session-Token': a.token });

/** The featured week (2025 Week 5): starts paused just before the Sunday 1 PM games. */
export const FEATURED_WEEK = { season: 2025, week: 5, preset: 'sun-early' } as const;

export const startWeek = (
  season: number = FEATURED_WEEK.season,
  week: number = FEATURED_WEEK.week,
  preset: string = FEATURED_WEEK.preset,
) =>
  apiRequest<WeekSnapshot & { session_token: string }>('POST', `${BASE}/sessions`, {
    season,
    week,
    preset,
  });

export const getWeek = (a: WeekAuth) =>
  apiGet<WeekSnapshot>(`${BASE}/sessions/${a.sessionId}`, 4000, auth(a));

export const controlWeek = (a: WeekAuth, action: 'play' | 'pause') =>
  apiRequest<WeekSnapshot>('POST', `${BASE}/sessions/${a.sessionId}/${action}`, undefined, {
    headers: auth(a),
  });

export const seekWeek = (a: WeekAuth, target: { preset: string } | { at: string }) =>
  apiRequest<WeekSnapshot>('POST', `${BASE}/sessions/${a.sessionId}/seek`, target, {
    headers: auth(a),
  });

export const setWeekSpeed = (a: WeekAuth, speed: number) =>
  apiRequest<WeekSnapshot>(
    'POST',
    `${BASE}/sessions/${a.sessionId}/speed`,
    { speed },
    { headers: auth(a) },
  );
