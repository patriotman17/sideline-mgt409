/**
 * Shared domain types. These mirror the shapes the backend will eventually
 * return, so swapping mock data for real APIs should not change components.
 */

export type Conference = 'AFC' | 'NFC';

export interface Team {
  id: string;
  abbr: string;
  city: string;
  name: string;
  conference: Conference;
  division: string;
  primary: string;
  secondary: string;
  record: string;
}

export type GameStatus = 'live' | 'scheduled' | 'final';

export interface TeamScore {
  teamId: string;
  score: number;
  timeouts: number;
}

export interface GameSituation {
  possessionTeamId: string;
  down: 1 | 2 | 3 | 4;
  distance: number;
  /** Human-readable ball spot, e.g. "KC 38". */
  ballOn: string;
  /** 0–100 position on the field from the away team's end zone. */
  fieldPosition: number;
  redZone: boolean;
}

export interface GameLeader {
  category: 'Passing' | 'Rushing' | 'Receiving';
  player: string;
  teamId: string;
  line: string;
}

export interface Game {
  id: string;
  week: number;
  status: GameStatus;
  away: TeamScore;
  home: TeamScore;
  /** e.g. "Q4", "HALF", "OT". Present for live/final games. */
  period?: string;
  clock?: string;
  kickoffLabel: string;
  network: string;
  venue: string;
  spread: string;
  overUnder: number;
  /** Home team win probability, 0–100. */
  homeWinProbability: number;
  situation?: GameSituation;
  leaders?: GameLeader[];
  featured?: boolean;
  /** Short hook shown on cards, e.g. "Rematch of last year's AFC title game". */
  storyline?: string;
}

export type TimelineEventType =
  | 'touchdown'
  | 'field_goal'
  | 'turnover'
  | 'big_play'
  | 'penalty'
  | 'kickoff'
  | 'period';

export interface TimelineEvent {
  id: string;
  gameId: string;
  period: string;
  clock: string;
  type: TimelineEventType;
  teamId?: string;
  title: string;
  description: string;
  awayScore: number;
  homeScore: number;
}

export type InsightKind = 'momentum' | 'matchup' | 'trend' | 'stat';

export interface Insight {
  id: string;
  gameId: string;
  kind: InsightKind;
  title: string;
  body: string;
  /** Model confidence 0–100 (mocked for now). */
  confidence: number;
  generatedAgo: string;
}

export interface PredictionOption {
  id: string;
  label: string;
  /** Share of community picks, 0–100. */
  communityPct: number;
}

export interface Prediction {
  id: string;
  gameId: string;
  question: string;
  options: PredictionOption[];
  points: number;
  closesLabel: string;
  status: 'open' | 'locked' | 'resolved';
  correctOptionId?: string;
}

export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
  createdAt: number;
}

export interface PartyMember {
  id: string;
  name: string;
  initials: string;
  color: string;
  isHost?: boolean;
}

export interface PartyMessage {
  id: string;
  memberId: string;
  text: string;
  timeLabel: string;
}

export interface WatchParty {
  id: string;
  name: string;
  gameId: string;
  hostId: string;
  members: PartyMember[];
  messages: PartyMessage[];
  reactions: Record<string, number>;
  startsLabel: string;
  isPrivate: boolean;
}

export type StoryCategory = 'News' | 'Analysis' | 'Fantasy' | 'Highlights';

export interface Story {
  id: string;
  category: StoryCategory;
  title: string;
  summary: string;
  source: string;
  timeAgo: string;
  readMinutes: number;
  teamId?: string;
}

export interface TrendingPlayer {
  id: string;
  name: string;
  position: string;
  teamId: string;
  statLine: string;
  trend: 'up' | 'down';
  change: string;
}

export interface StandingRow {
  teamId: string;
  wins: number;
  losses: number;
  ties: number;
  streak: string;
}

export interface Division {
  name: string;
  rows: StandingRow[];
}

export interface UserProfile {
  id: string;
  displayName: string;
  handle: string;
  initials: string;
  memberSince: string;
  favoriteTeamIds: string[];
  stats: {
    points: number;
    accuracy: number;
    streak: number;
    rank: number;
    partiesHosted: number;
  };
  badges: { id: string; label: string; icon: string; earned: boolean }[];
}

export interface UserSettings {
  notifications: boolean;
  spoilerShield: boolean;
  haptics: boolean;
  aiCommentary: boolean;
}
