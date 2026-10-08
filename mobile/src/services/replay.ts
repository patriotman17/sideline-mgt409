/**
 * Historical game replays served by the backend replay engine (nflverse data).
 * Unlike the mock services, this talks to FastAPI: `/api/v1/replay/*`.
 * Types mirror backend/app/replay/models.py and api/routes/replay.py.
 */
import type { Game, TimelineEvent, TimelineEventType } from '@/types';
import { apiGet, apiRequest } from './http';

export interface ReplayTeam {
  abbr: string;
  city: string | null;
  name: string | null;
  conference: string | null;
}

export interface ReplayGameSummary {
  game_id: string;
  title: string;
  season: number | null;
  season_type: string | null;
  week: number | null;
  game_date: string | null;
  venue: string | null;
  home: ReplayTeam;
  away: ReplayTeam;
  spread_line: number | null;
  total_line: number | null;
  total_events: number;
  attribution: string | null;
  license: string | null;
  is_test_fixture: boolean;
  data_warnings: number;
}

export type PlayKind =
  | 'game_start' | 'kickoff' | 'pass' | 'run' | 'punt' | 'field_goal' | 'extra_point' | 'two_point'
  | 'kneel' | 'spike' | 'penalty' | 'timeout' | 'end_quarter' | 'end_game' | 'other';

export interface ReplayPlay {
  sequence: number;
  kind: PlayKind;
  quarter: number;
  clock_seconds: number | null;
  offense: string | null;
  defense: string | null;
  yards_gained: number | null;
  description: string;
  scoring: { type: string; team: string; points: number }[];
  turnover: { type: 'interception' | 'fumble' | 'downs'; lost_by: string | null; gained_by: string | null } | null;
  penalty: { team: string | null; type: string | null; yards: number | null; no_play: boolean } | null;
  timeout_team: string | null;
  source_home_score_after: number | null;
  source_away_score_after: number | null;
}

export type ReplayGameStatus = 'pregame' | 'in_progress' | 'end_of_quarter' | 'halftime' | 'end_of_regulation' | 'final';

export interface ReplayState {
  game_id: string;
  status: ReplayGameStatus;
  quarter: number;
  clock_seconds: number | null;
  home_score: number;
  away_score: number;
  home_linescore: number[];
  away_linescore: number[];
  possession: string | null;
  down: number | null;
  distance: number | null;
  yardline_100: number | null;
  ball_on: string | null;
  home_timeouts: number | null;
  away_timeouts: number | null;
  home_win_probability: number | null;
  plays_revealed: number;
  last_play: ReplayPlay | null;
  recent_plays: ReplayPlay[];
}

export type PlaybackStatus = 'ready' | 'playing' | 'paused' | 'finished';

export interface ReplaySnapshot {
  session_id: string;
  game: ReplayGameSummary;
  playback: {
    status: PlaybackStatus;
    speed: number;
    seconds_per_play: number;
    cursor: number;
    total_events: number;
    progress: number;
  };
  state: ReplayState;
}

export type ReplayControl = 'play' | 'pause' | 'resume' | 'restart' | 'step';

const BASE = '/api/v1/replay';

export const listReplayGames = () => apiGet<ReplayGameSummary[]>(`${BASE}/games`);
export const startReplay = (gameId: string, speed = 1) =>
  apiRequest<ReplaySnapshot>('POST', `${BASE}/sessions`, { game_id: gameId, speed, autoplay: false });
export const getReplay = (sessionId: string) => apiGet<ReplaySnapshot>(`${BASE}/sessions/${sessionId}`);
export const controlReplay = (sessionId: string, action: ReplayControl) =>
  apiRequest<ReplaySnapshot>('POST', `${BASE}/sessions/${sessionId}/${action}`);
export const setReplaySpeed = (sessionId: string, speed: number) =>
  apiRequest<ReplaySnapshot>('PUT', `${BASE}/sessions/${sessionId}/speed`, { speed });
export const endReplay = (sessionId: string) => apiRequest<void>('DELETE', `${BASE}/sessions/${sessionId}`);

// ---------------------------------------------------------------- adapters
// Map replay state onto the app's Game/TimelineEvent types so existing
// scoreboard components render it unchanged.

/** App team ids are lowercase abbreviations (unknown teams fall back to a neutral mark). */
export const replayTeamId = (abbr: string) => abbr.toLowerCase();

/** "2024-02-11" -> "Feb 11, 2024". Use the game date, not `season`: playoffs fall in the next calendar year. */
export function formatGameDate(iso: string | null): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatClock(seconds: number | null): string {
  if (seconds === null) return '';
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function periodLabel(quarter: number): string {
  if (quarter <= 4) return `Q${quarter}`;
  return quarter === 5 ? 'OT' : `${quarter - 4}OT`;
}

/** "2024-01-21" -> "Sun Jan 21" (the app's kickoff label format: weekday first). */
function kickoffLabel(iso: string | null): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const weekday = date.toLocaleDateString('en-US', { weekday: 'short' });
  const month = date.toLocaleDateString('en-US', { month: 'short' });
  return `${weekday} ${month} ${d}`;
}

export function replayToGame(snap: ReplaySnapshot): Game {
  const { game: g, state: s } = snap;
  const status = s.status === 'pregame' ? 'scheduled' : s.status === 'final' ? 'final' : 'live';
  const awayId = replayTeamId(g.away.abbr);
  const homeId = replayTeamId(g.home.abbr);
  const pad = (line: number[]) => [...line, ...Array<null>(Math.max(0, 4 - line.length)).fill(null)];
  const favorite = g.spread_line === null ? null : g.spread_line >= 0 ? g.home.abbr : g.away.abbr;

  let period = periodLabel(s.quarter);
  let clock = formatClock(s.clock_seconds);
  if (s.status === 'halftime') [period, clock] = ['Half', ''];
  else if (s.status === 'end_of_quarter' || s.status === 'end_of_regulation') [period, clock] = [`End ${periodLabel(s.quarter)}`, ''];

  const hasSituation = status === 'live' && s.possession && s.down !== null && s.distance !== null && s.yardline_100 !== null;
  return {
    id: g.game_id,
    week: g.week ?? 0,
    day: 'today',
    status,
    away: { teamId: awayId, score: s.away_score, timeouts: s.away_timeouts ?? 0 },
    home: { teamId: homeId, score: s.home_score, timeouts: s.home_timeouts ?? 0 },
    period: status === 'final' ? (s.quarter > 4 ? 'F/OT' : 'FINAL') : period,
    clock,
    kickoffLabel: kickoffLabel(g.game_date),
    network: g.title,
    venue: g.venue ?? '',
    spread: favorite ? `${favorite} -${Math.abs(g.spread_line ?? 0)}` : '',
    overUnder: g.total_line ?? 0,
    homeWinProbability: Math.round((s.home_win_probability ?? 0.5) * 100),
    situation: hasSituation
      ? {
          possessionTeamId: replayTeamId(s.possession!),
          down: s.down as 1 | 2 | 3 | 4,
          distance: s.distance!,
          ballOn: s.ball_on ?? '',
          // App field position runs 0–100 from the away end zone; the away team drives toward 100.
          fieldPosition: s.possession === g.away.abbr ? 100 - s.yardline_100! : s.yardline_100!,
          redZone: s.yardline_100! <= 20,
        }
      : undefined,
    linescore: s.home_linescore.length ? { away: pad(s.away_linescore), home: pad(s.home_linescore) } : undefined,
  };
}

function playTitle(p: ReplayPlay): { type: TimelineEventType; title: string } {
  const score = p.scoring[0];
  if (score?.type === 'touchdown') return { type: 'touchdown', title: 'Touchdown' };
  if (score?.type === 'field_goal') return { type: 'field_goal', title: 'Field goal' };
  if (score) return { type: 'touchdown', title: score.type === 'extra_point' ? 'Extra point' : score.type === 'safety' ? 'Safety' : 'Two-point try' };
  if (p.turnover) {
    const label = { interception: 'Interception', fumble: 'Fumble lost', downs: 'Turnover on downs' }[p.turnover.type];
    return { type: 'turnover', title: label };
  }
  if (p.penalty) return { type: 'penalty', title: p.penalty.type ? `Penalty · ${p.penalty.type}` : 'Penalty' };
  const yards = p.yards_gained;
  const yardText = yards === null ? '' : ` · ${yards >= 0 ? '+' : ''}${yards}`;
  switch (p.kind) {
    case 'kickoff':
      return { type: 'kickoff', title: 'Kickoff' };
    case 'punt':
      return { type: 'kickoff', title: 'Punt' };
    case 'timeout':
      return { type: 'period', title: p.timeout_team ? `Timeout · ${p.timeout_team}` : 'Timeout' };
    case 'end_quarter':
      return { type: 'period', title: `End of ${periodLabel(p.quarter)}` };
    case 'end_game':
      return { type: 'period', title: 'Final' };
    case 'field_goal':
      return { type: 'play', title: 'Field goal no good' };
    case 'pass':
      return { type: yards !== null && yards >= 20 ? 'big_play' : 'play', title: `Pass${yardText}` };
    case 'run':
      return { type: yards !== null && yards >= 20 ? 'big_play' : 'play', title: `Run${yardText}` };
    default:
      return { type: 'play', title: p.kind === 'kneel' ? 'Kneel' : p.kind === 'spike' ? 'Spike' : 'Play' };
  }
}

export function replayTimeline(snap: ReplaySnapshot): TimelineEvent[] {
  return snap.state.recent_plays.map((p) => {
    const { type, title } = playTitle(p);
    return {
      id: `${snap.game.game_id}-${p.sequence}`,
      gameId: snap.game.game_id,
      period: periodLabel(p.quarter),
      clock: formatClock(p.clock_seconds),
      type,
      teamId: (p.scoring[0]?.team ?? p.offense ?? p.timeout_team)?.toLowerCase(),
      title,
      description: p.description,
      // Score after this play (validated against the engine during ingestion).
      awayScore: p.source_away_score_after ?? snap.state.away_score,
      homeScore: p.source_home_score_after ?? snap.state.home_score,
    };
  });
}
