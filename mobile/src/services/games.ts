// TODO(phase-2): replace mock reads with `apiGet('/api/v1/games…')` once the
// backend proxies a real sports data provider. Signatures should not change.
import { buildMockGameContent, MOCK_GAMES } from '@/data/mock';
import type { Game, GameStatus, Insight, Prediction, TimelineEvent } from '@/types';
import { mockDelay } from './http';
import { teamAbbr } from './teams';

export interface GameDetail {
  game: Game;
  timeline: TimelineEvent[];
  insights: Insight[];
  predictions: Prediction[];
}

const STATUS_ORDER: Record<GameStatus, number> = { live: 0, scheduled: 1, final: 2 };

export async function listGames(status?: GameStatus): Promise<Game[]> {
  await mockDelay();
  return MOCK_GAMES.filter((g) => !status || g.status === status).sort(
    (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status],
  );
}

export async function getFeaturedGame(): Promise<Game> {
  await mockDelay();
  return MOCK_GAMES.find((g) => g.featured) ?? MOCK_GAMES[0];
}

export async function getGameDetail(id: string): Promise<GameDetail | null> {
  await mockDelay();
  const game = MOCK_GAMES.find((g) => g.id === id);
  if (!game) return null;
  return { game, ...buildMockGameContent(game, teamAbbr) };
}

/** Synchronous lookup for components that already have a game id (e.g. party cards). */
export const findGame = (id: string): Game | undefined => MOCK_GAMES.find((g) => g.id === id);

/** Games a watch party can be created for (live or upcoming). */
export const listPartyEligibleGames = (): Game[] => MOCK_GAMES.filter((g) => g.status !== 'final');

/** Live game count for the tab badge. Becomes a realtime subscription later. */
export const countLiveGames = (): number => MOCK_GAMES.filter((g) => g.status === 'live').length;

export async function listOpenPredictions(): Promise<Prediction[]> {
  await mockDelay();
  return MOCK_GAMES.flatMap((g) => buildMockGameContent(g, teamAbbr).predictions).filter(
    (p) => p.status === 'open',
  );
}

export async function listTopInsights(limit = 3): Promise<Insight[]> {
  await mockDelay();
  return MOCK_GAMES.filter((g) => g.status === 'live')
    .flatMap((g) => buildMockGameContent(g, teamAbbr).insights.slice(0, 1))
    .slice(0, limit);
}
