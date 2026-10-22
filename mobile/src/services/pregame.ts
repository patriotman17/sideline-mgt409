/**
 * Pregame: both teams' season so far (only weeks before this game, so it can't spoil it), plus an
 * optional AI preview written once per game by the Sideline Preview agent and shared by everyone.
 */
import { apiGet, apiRequest } from './http';

const BASE = '/api/v1/pregame';

export interface PregameResult {
  week: number;
  opponent: string;
  home: boolean;
  points_for: number;
  points_against: number;
  outcome: 'W' | 'L' | 'T';
}

export interface PregameLeader {
  category: 'passing' | 'rushing' | 'receiving';
  player: string;
  yards: number;
  touchdowns: number;
  line: string;
  league_rank: number;
}

export interface TeamForm {
  team: string;
  games: number;
  record: string;
  streak: string | null;
  last_results: PregameResult[];
  points_per_game: number;
  points_allowed_per_game: number;
  yards_per_game: number;
  turnover_margin: number;
  ranks: { points: number; allowed: number; yards: number; turnovers: number };
  leaders: PregameLeader[];
}

export interface PreviewUsage {
  requests: number;
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
  estimated_cost_usd: number | null;
}

export interface PregamePreview {
  request_id: string;
  status: 'ok' | 'cached';
  preview: {
    headline: string;
    preview: string;
    evidence: { tool: string; fact: string }[];
    confidence: 'high' | 'medium' | 'low';
  };
  model: string;
  usage: PreviewUsage;
  latency_ms: number;
  grounding_issues: string[];
  weeks_included: number[];
}

export interface Pregame {
  season: number;
  week: number;
  weeks_included: number[];
  home: TeamForm;
  away: TeamForm;
  meetings: PregameResult[];
  storylines: { key: string; text: string }[];
  attribution: string;
  notes: string;
  /** Already written by someone (free to show). */
  ai_preview: PregamePreview | null;
}

export const getPregame = (gameId: string) =>
  apiGet<Pregame>(`${BASE}/${encodeURIComponent(gameId)}`, 6000);

/** Writes the preview if nobody has yet (one shared model call per game), else returns the cached one. */
export const requestPreview = (gameId: string) =>
  apiRequest<PregamePreview>('POST', `${BASE}/${encodeURIComponent(gameId)}/preview`, undefined, {
    timeoutMs: 45000,
  });
