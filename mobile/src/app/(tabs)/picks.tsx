import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { PredictionCard } from '@/components/game';
import {
  Avatar,
  EmptyState,
  ListGroup,
  PreviewBanner,
  Screen,
  SectionHeader,
  Skeleton,
  TextTabs,
} from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { formatNumber } from '@/lib/format';
import { findGame, listAllPredictions } from '@/services';
import { useAppState } from '@/state/AppStore';
import { colors } from '@/theme';
import type { Prediction } from '@/types';

type PicksTab = 'live' | 'mine' | 'results';

/** A two-way "who wins" pick in a live game makes the best hero. */
function pickFeatured(open: Prediction[]): Prediction | undefined {
  const isLive = (p: Prediction) => findGame(p.gameId)?.status === 'live';
  return (
    open.find((p) => isLive(p) && findGame(p.gameId)?.featured && /who wins/i.test(p.question)) ??
    open.find((p) => isLive(p) && /who wins/i.test(p.question)) ??
    open[0]
  );
}

function RecordCard() {
  const { profile } = useAppState();
  const { wins, losses, accuracy, points, recent } = profile.stats;
  return (
    <View className="mx-4 rounded-2xl bg-surface p-4">
      <View className="flex-row items-center justify-between">
        <Text className="text-[15px] font-semibold text-ink">Your record</Text>
        <Text className="text-[12px] text-mute">This season</Text>
      </View>
      <View className="mt-3 flex-row items-end">
        <View className="flex-1">
          <Text className="font-score text-[30px] leading-[34px] text-ink">{accuracy}%</Text>
          <Text className="text-[12px] text-sub">Win rate</Text>
        </View>
        <View className="flex-1">
          <Text className="font-score text-[30px] leading-[34px] text-ink">
            {wins}-{losses}
          </Text>
          <Text className="text-[12px] text-sub">Record</Text>
        </View>
        <View className="flex-1">
          <Text className="font-score text-[30px] leading-[34px] text-volt">
            {formatNumber(points)}
          </Text>
          <Text className="text-[12px] text-sub">Points</Text>
        </View>
      </View>
      <View
        className="mt-4 flex-row items-end gap-1"
        accessibilityLabel={`Last ${recent.length} picks`}
      >
        {recent.map((r, i) => (
          <View
            key={i}
            className={`flex-1 rounded-sm ${r === 'W' ? 'h-5 bg-volt' : 'h-2 bg-white/20'}`}
          />
        ))}
      </View>
      <Text className="mt-1.5 text-[11px] text-mute">Last {recent.length} picks</Text>
    </View>
  );
}

export default function PicksScreen() {
  const { profile, picks } = useAppState();
  const [tab, setTab] = useState<PicksTab>('live');
  const { data, loading, reload } = useAsync(listAllPredictions);

  const all = data ?? [];
  const open = all.filter((p) => p.status === 'open');
  const featured = pickFeatured(open);
  const moreLive = open.filter((p) => p.id !== featured?.id);
  const mine = open.filter((p) => picks[p.id]);
  const results = all.filter((p) => p.status === 'resolved');

  return (
    <Screen onRefresh={reload} refreshing={loading && !!data}>
      <View className="flex-row items-center justify-between px-5 pb-2 pt-2">
        <Text className="text-[15px] font-extrabold tracking-[6px] text-ink">SIDELINE</Text>
        <View className="flex-row items-center gap-2.5">
          <View className="flex-row items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5">
            <View className="h-4 w-4 items-center justify-center rounded-full bg-volt">
              <Ionicons name="trophy" size={9} color={colors.bg} />
            </View>
            <Text className="font-score-bold text-[16px] text-ink">
              {formatNumber(profile.stats.points)}
            </Text>
          </View>
          <Pressable
            onPress={() => router.push('/profile')}
            accessibilityRole="button"
            accessibilityLabel="Open your profile"
            hitSlop={8}
          >
            <Avatar initials={profile.initials} color={colors.volt} size={32} />
          </Pressable>
        </View>
      </View>

      <TextTabs<PicksTab>
        className="mx-2"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'live', label: 'Live' },
          { value: 'mine', label: 'My picks', badge: mine.length },
          { value: 'results', label: 'Results' },
        ]}
      />
      <PreviewBanner
        title="Your season of picks"
        body="This screen previews season-long picks and records with sample data. Real picks are live now inside every game: open one from Scores and call the big moments."
        action={{ label: 'Make real picks', onPress: () => router.navigate('/') }}
      />
      <Text className="mt-1 text-center text-[11px] text-mute">
        Free to play · Points only · Sample data
      </Text>

      {!data ? (
        <View className="mt-4 gap-3 px-4">
          <Skeleton className="h-72 rounded-3xl" />
          <Skeleton className="h-32" />
        </View>
      ) : tab === 'live' ? (
        <>
          {featured ? (
            <View className="mt-4 px-4">
              <PredictionCard prediction={featured} variant="featured" />
            </View>
          ) : null}
          {moreLive.length ? (
            <>
              <SectionHeader title="More picks" />
              <ListGroup>
                {moreLive.map((p) => (
                  <PredictionCard key={p.id} prediction={p} variant="row" />
                ))}
              </ListGroup>
            </>
          ) : null}
          <SectionHeader title="Your record" />
          <RecordCard />
        </>
      ) : tab === 'mine' ? (
        mine.length ? (
          <View className="mt-4">
            <ListGroup>
              {mine.map((p) => (
                <PredictionCard key={p.id} prediction={p} variant="row" />
              ))}
            </ListGroup>
          </View>
        ) : (
          <EmptyState
            icon="hand-left-outline"
            title="Make your first pick"
            body="Picks you make in live games show up here until they resolve."
          />
        )
      ) : results.length ? (
        <View className="mt-4">
          <ListGroup>
            {results.map((p) => (
              <PredictionCard key={p.id} prediction={p} variant="row" />
            ))}
          </ListGroup>
        </View>
      ) : (
        <EmptyState
          icon="trophy-outline"
          title="No results yet"
          body="Resolved picks land here with the points you earned."
        />
      )}
    </Screen>
  );
}
