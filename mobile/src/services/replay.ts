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
    /** True when the server paused playback because a new prediction opened. */
    paused_for_prediction: boolean;
    /** Seconds until the next snap while a "pick window" holds playback after a question opens. */
    pick_window_seconds_left: number | null;
    speed: number;
    seconds_per_play: number;
    cursor: number;
    total_events: number;
    progress: number;
  };
  state: ReplayState;
}

/** Returned once when a session is created; the token authorizes every later request. */
export interface CreatedReplaySession extends ReplaySnapshot {
  session_token: string;
}

export type ReplayControl = 'play' | 'pause' | 'resume' | 'restart' | 'step';

/** A session id plus its secret token (kept in memory only; never logged or put in URLs). */
export interface ReplayAuth {
  sessionId: string;
  token: string;
}

const BASE = '/api/v1/replay';
const auth = (a: ReplayAuth) => ({ 'X-Session-Token': a.token });

export const listReplayGames = () => apiGet<ReplayGameSummary[]>(`${BASE}/games`);
/** `startCursor` > 0 joins mid-game (from the synchronized week): earlier plays are revealed, paused. */
export const startReplay = (gameId: string, speed = 1, startCursor = 0) =>
  apiRequest<CreatedReplaySession>('POST', `${BASE}/sessions`, {
    game_id: gameId,
    speed,
    autoplay: false,
    ...(startCursor > 0 ? { start_cursor: startCursor } : {}),
  });
export const getReplay = (a: ReplayAuth) => apiGet<ReplaySnapshot>(`${BASE}/sessions/${a.sessionId}`, 4000, auth(a));
export const controlReplay = (a: ReplayAuth, action: ReplayControl) =>
  apiRequest<ReplaySnapshot>('POST', `${BASE}/sessions/${a.sessionId}/${action}`, undefined, { headers: auth(a) });
export const setReplaySpeed = (a: ReplayAuth, speed: number) =>
  apiRequest<ReplaySnapshot>('PUT', `${BASE}/sessions/${a.sessionId}/speed`, { speed }, { headers: auth(a) });
export const endReplay = (a: ReplayAuth) =>
  apiRequest<void>('DELETE', `${BASE}/sessions/${a.sessionId}`, undefined, { headers: auth(a) });

// ---------------------------------------------------------------- Ask Sideline + insights
// Mirrors backend/app/agents/{agent,service,insights}.py.

export interface AskEvidence {
  tool: string;
  fact: string;
  play_sequence: number | null;
}

export interface AskAnswer {
  request_id: string;
  /** "clarification": the question was ambiguous (e.g. "he" after a tie); see `answer.clarification`. */
  status: 'ok' | 'cached' | 'clarification';
  answer: {
    answer: string;
    evidence: AskEvidence[];
    uncertainty: string | null;
    confidence: 'high' | 'medium' | 'low';
    answerable: boolean;
    clarification: { question: string; options: string[] } | null;
  };
  as_of: { cursor: number; period: string; clock: string | null; state_version: string };
  model: string;
  usage: { requests: number; input_tokens: number; output_tokens: number; estimated_cost_usd: number | null };
  latency_ms: number;
  /** Earlier turns of this session's chat the server used as context (0 = standalone). */
  context_turns: number;
  ambiguous_players: string[];
}

export interface ReplayConversation {
  cursor: number;
  turns: { request_id: string; question: string; answer: string; cursor: number; period: string; clock: string | null }[];
  hidden_later: number;
}

export type InsightExplanationStatus =
  | 'generated' | 'cached' | 'pending' | 'not_configured' | 'budget_exceeded' | 'rate_limited' | 'blocked' | 'error';

export interface ReplayInsight {
  id: string;
  kind: string;
  play_sequence: number;
  period: string;
  clock: string | null;
  team: string | null;
  headline: string;
  facts: Record<string, string | number | null>;
  importance: number;
  explanation: string | null;
  explanation_status: InsightExplanationStatus;
}

export interface ReplayInsights {
  as_of: AskAnswer['as_of'];
  ai_configured: boolean;
  insights: ReplayInsight[];
}

/** Ask Sideline about the game as of the session's current play. AI runs only on the backend. */
/** Phrasing preferences from the user's profile (enums the backend validates). Never game facts. */
export interface AskPreferences {
  knowledge_level: 'casual' | 'regular' | 'expert';
  explanation_style: 'simple' | 'balanced' | 'detailed';
}

export const askReplay = (a: ReplayAuth, question: string, preferences?: AskPreferences | null) =>
  apiRequest<AskAnswer>(
    'POST',
    `${BASE}/sessions/${a.sessionId}/ask`,
    { question, ...(preferences ? { preferences } : {}) },
    { headers: auth(a), timeoutMs: 45000 },
  );

/** The server's chat as it applies at the session's current replay position. */
export const getReplayConversation = (a: ReplayAuth) =>
  apiGet<ReplayConversation>(`${BASE}/sessions/${a.sessionId}/conversation`, 6000, auth(a));

/** Start a new Ask Sideline chat: the server forgets this session's earlier turns. */
export const resetReplayChat = (a: ReplayAuth) =>
  apiRequest<void>('DELETE', `${BASE}/sessions/${a.sessionId}/conversation`, undefined, { headers: auth(a) });

export const getReplayInsights = (a: ReplayAuth, explain = 2) =>
  apiGet<ReplayInsights>(`${BASE}/sessions/${a.sessionId}/insights?limit=10&explain=${explain}`, 45000, auth(a));

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


// ---------------------------------------------------------------- replay predictions (Phase 2D)
// Mirrors backend/app/predictions/models.py + api/routes/predictions.py. Outcomes, locks and points
// are decided by the server's deterministic ledger; the app only sends a prediction id + option id.

export type ReplayPredictionType = 'next_play_gain_5' | 'fourth_down_conversion' | 'drive_touchdown' | 'next_score';
export type ReplayPredictionStatus = 'open' | 'locked' | 'resolved' | 'void';
export type ReplayPredictionOutcome = 'correct' | 'incorrect' | 'void' | 'pending' | 'unanswered';

export interface ReplayPrediction {
  id: string;
  type: ReplayPredictionType;
  question: string;
  options: { id: string; label: string }[];
  points: number;
  window: string;
  team: string | null;
  status: ReplayPredictionStatus;
  opened_cursor: number;
  locked_cursor: number | null;
  resolved_cursor: number | null;
  correct_option_id: string | null;
  void_reason: string | null;
  resolution_summary: string | null;
  situation: string;
  /** Deterministic ranking score (higher = bigger moment) and why it was featured, e.g. "Red zone". */
  importance: number;
  tags: string[];
}

export interface ReplayPredictionItem {
  prediction: ReplayPrediction;
  your_answer: string | null;
  answered_cursor: number | null;
  outcome: ReplayPredictionOutcome;
  points_awarded: number;
  /** Outcome revealed later than the current replay position (after a rewind). */
  result_hidden_until: number | null;
}

export interface ReplayPredictionStats {
  scoring_mode: 'demo';
  points: number;
  answered: number;
  correct: number;
  incorrect: number;
  void: number;
  pending: number;
  accuracy: number | null;
  current_streak: number;
  longest_streak: number;
}

export interface ReplayPredictions {
  cursor: number;
  scoring_mode: 'demo';
  scoring_note: string;
  points_table: Record<ReplayPredictionType, number>;
  pause_for_predictions: boolean;
  paused_for_prediction: boolean;
  resumes_after_play: number | null;
  open: ReplayPredictionItem[];
  locked: ReplayPredictionItem[];
  resolved: ReplayPredictionItem[];
  stats: ReplayPredictionStats;
}

export interface ReplayPredictionAnswer {
  answer: { prediction_id: string; option_id: string; answered_cursor: number; answered_at: string };
  created: boolean;
  resumed_playback: boolean;
  item: ReplayPredictionItem;
}

const PRED = (a: ReplayAuth) => `${BASE}/sessions/${a.sessionId}/predictions`;

export const getReplayPredictions = (a: ReplayAuth) => apiGet<ReplayPredictions>(PRED(a), 6000, auth(a));

/** Lock in an answer. Final once recorded (the same answer again is an idempotent retry). */
export const answerReplayPrediction = (a: ReplayAuth, predictionId: string, optionId: string) =>
  apiRequest<ReplayPredictionAnswer>(
    'POST',
    `${PRED(a)}/${encodeURIComponent(predictionId)}/answer`,
    { option_id: optionId },
    { headers: auth(a) },
  );

export const setPauseForPredictions = (a: ReplayAuth, enabled: boolean) =>
  apiRequest<ReplayPredictions>('PUT', `${PRED(a)}/settings`, { pause_for_predictions: enabled }, { headers: auth(a) });

/** Optional AI explanation of a resolved prediction (the outcome itself is deterministic). */
export const explainReplayPrediction = (a: ReplayAuth, predictionId: string) =>
  apiRequest<{ prediction_id: string; explanation: string }>(
    'POST',
    `${PRED(a)}/${encodeURIComponent(predictionId)}/explain`,
    undefined,
    { headers: auth(a), timeoutMs: 45000 },
  );
