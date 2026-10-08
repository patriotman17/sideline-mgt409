import { useState } from 'react';
import { Text, View } from 'react-native';

import { GameCard } from '@/components/game';
import { EmptyState, MockBadge, Screen, ScreenHeader, SegmentedControl, Skeleton } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { listGames } from '@/services';
import type { GameStatus } from '@/types';

type Filter = GameStatus | 'all';

const EMPTY_COPY: Record<Filter, string> = {
  live: 'No games are live right now. Check back on game day.',
  scheduled: 'No upcoming games on the schedule.',
  final: 'No completed games yet this week.',
  all: 'No games found.',
};

export default function GamesScreen() {
  const [filter, setFilter] = useState<Filter>('live');
  const { data: games, loading, reload } = useAsync(() => listGames());

  const counts = {
    live: games?.filter((g) => g.status === 'live').length ?? 0,
    scheduled: games?.filter((g) => g.status === 'scheduled').length ?? 0,
    final: games?.filter((g) => g.status === 'final').length ?? 0,
  };
  const visible = games?.filter((g) => filter === 'all' || g.status === filter) ?? [];

  return (
    <Screen onRefresh={reload} refreshing={loading && !!games}>
      <ScreenHeader eyebrow="NFL · 2026 Season" title="Games" right={<MockBadge />} />

      <View className="px-5">
        <SegmentedControl<Filter>
          value={filter}
          onChange={setFilter}
          segments={[
            { value: 'live', label: 'Live', badge: counts.live },
            { value: 'scheduled', label: 'Upcoming' },
            { value: 'final', label: 'Final' },
            { value: 'all', label: 'All' },
          ]}
        />
      </View>

      <View className="mt-5 flex-row items-center justify-between px-5">
        <Text className="text-sm font-bold text-ink">Week 5</Text>
        <Text className="text-xs text-mute">
          {counts.live} live · {counts.scheduled} upcoming · {counts.final} final
        </Text>
      </View>

      <View className="mt-3 gap-3 px-5">
        {!games ? (
          [0, 1, 2].map((i) => <Skeleton key={i} className="h-36" />)
        ) : visible.length ? (
          visible.map((g) => <GameCard key={g.id} game={g} />)
        ) : (
          <EmptyState icon="american-football-outline" title="Nothing here yet" body={EMPTY_COPY[filter]} />
        )}
      </View>
    </Screen>
  );
}
