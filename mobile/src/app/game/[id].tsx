import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  ChatComposer,
  ChatMessages,
  GameLeaders,
  InsightCard,
  PredictionCard,
  Scoreboard,
  Timeline,
} from '@/components/game';
import { Button, EmptyState, IconButton, MockBadge, SegmentedControl, Skeleton } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { useGameChat } from '@/hooks/useGameChat';
import { getGameDetail, getTeam } from '@/services';
import { useAppState } from '@/state/AppStore';
import { colors } from '@/theme';

type DetailTab = 'timeline' | 'insights' | 'predict' | 'chat';
const TABS: DetailTab[] = ['timeline', 'insights', 'predict', 'chat'];

export default function GameDetailScreen() {
  const params = useLocalSearchParams<{ id: string; tab?: string }>();
  const gameId = params.id;
  const initialTab = TABS.includes(params.tab as DetailTab) ? (params.tab as DetailTab) : 'timeline';
  const [tab, setTab] = useState<DetailTab>(initialTab);
  const [following, setFollowing] = useState(false);

  const { data, loading } = useAsync(() => getGameDetail(gameId), [gameId]);
  const { picks } = useAppState();
  const chat = useGameChat(gameId);
  const scrollRef = useRef<ScrollView>(null);

  // Keep the newest chat message in view.
  useEffect(() => {
    if (tab === 'chat') {
      const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
      return () => clearTimeout(t);
    }
  }, [tab, chat.messages.length, chat.typing]);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/'));

  if (!loading && !data) {
    return (
      <SafeAreaView className="flex-1 bg-bg">
        <EmptyState icon="alert-circle-outline" title="Game not found" body="This game may have been removed from the schedule.">
          <Button label="Back" onPress={goBack} />
        </EmptyState>
      </SafeAreaView>
    );
  }

  const game = data?.game;
  const openPicks = data?.predictions.filter((p) => p.status === 'open' && !picks[p.id]).length ?? 0;

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-bg">
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Top bar */}
        <View className="flex-row items-center justify-between px-4 pb-3 pt-1">
          <IconButton icon="chevron-back" accessibilityLabel="Go back" onPress={goBack} />
          <View className="items-center">
            <Text className="text-[15px] font-bold text-ink">
              {game ? `${getTeam(game.away.teamId).abbr} @ ${getTeam(game.home.teamId).abbr}` : ' '}
            </Text>
            <Text className="text-[11px] text-mute">{game ? `Week ${game.week} · ${game.venue}` : ' '}</Text>
          </View>
          <IconButton
            icon={following ? 'notifications' : 'notifications-outline'}
            color={following ? colors.volt : colors.ink}
            accessibilityLabel={following ? 'Stop following game' : 'Follow game alerts'}
            onPress={() => setFollowing((f) => !f)}
          />
        </View>

        <ScrollView
          ref={scrollRef}
          className="flex-1"
          contentContainerClassName="pb-8"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          stickyHeaderIndices={[1]}
        >
          {/* 0: scoreboard */}
          <View>{game ? <Scoreboard game={game} /> : <Skeleton className="mx-4 h-72 rounded-3xl" />}</View>

          {/* 1: sticky tab switcher */}
          <View className="bg-bg px-4 pb-3 pt-4">
            <SegmentedControl<DetailTab>
              value={tab}
              onChange={setTab}
              segments={[
                { value: 'timeline', label: 'Timeline' },
                { value: 'insights', label: 'Insights' },
                { value: 'predict', label: 'Predict', badge: openPicks },
                { value: 'chat', label: 'Ask AI' },
              ]}
            />
          </View>

          {/* 2: tab content */}
          <View className="pt-2">
            {!data || !game ? (
              <View className="gap-3 px-5">
                <Skeleton className="h-20" />
                <Skeleton className="h-20" />
              </View>
            ) : tab === 'timeline' ? (
              <Timeline events={data.timeline} awayId={game.away.teamId} homeId={game.home.teamId} />
            ) : tab === 'insights' ? (
              <View className="gap-3">
                <View className="flex-row items-center justify-between px-5">
                  <Text className="text-xs text-mute">Generated from live game data</Text>
                  <MockBadge />
                </View>
                <View className="gap-3 px-5">
                  {data.insights.map((i) => (
                    <InsightCard key={i.id} insight={i} />
                  ))}
                </View>
                {game.leaders?.length ? (
                  <>
                    <Text className="mt-4 px-5 text-base font-bold text-ink">Game leaders</Text>
                    <GameLeaders leaders={game.leaders} />
                  </>
                ) : null}
              </View>
            ) : tab === 'predict' ? (
              <View className="gap-3 px-5">
                <Text className="text-xs text-mute">Make picks to earn points and climb the leaderboard. No real money involved.</Text>
                {data.predictions.map((p) => (
                  <PredictionCard key={p.id} prediction={p} />
                ))}
              </View>
            ) : (
              <ChatMessages messages={chat.messages} typing={chat.typing} onSuggestion={chat.send} />
            )}
          </View>
        </ScrollView>

        {tab === 'chat' && game ? <ChatComposer onSend={chat.send} disabled={chat.typing} /> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
