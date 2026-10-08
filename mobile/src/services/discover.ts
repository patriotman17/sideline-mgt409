import { MOCK_STANDINGS, MOCK_STORIES, MOCK_TRENDING_PLAYERS } from '@/data/mock';
import type { Division, Story, TrendingPlayer } from '@/types';
import { mockDelay } from './http';

export interface DiscoverFeed {
  stories: Story[];
  trending: TrendingPlayer[];
  standings: Division[];
}

export async function getDiscoverFeed(): Promise<DiscoverFeed> {
  await mockDelay();
  return { stories: MOCK_STORIES, trending: MOCK_TRENDING_PLAYERS, standings: MOCK_STANDINGS };
}
