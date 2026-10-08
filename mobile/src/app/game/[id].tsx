import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  ChatComposer,
  ChatMessages,
  FieldTracker,
  GameLeaders,
  InsightCard,
  Linescore,
  OddsCard,
  PredictionCard,
  Scoreboard,
  TeamStats,
  Timeline,
  WinProbabilityBar,
} from '@/components/game';
import { Button, EmptyState, IconButton, MockBadge, Skeleton, TextTabs } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { useGameChat } from '@/hooks/useGameChat';
import { useKeyboardOverlap } from '@/hooks/useKeyboardOverlap';
import { getGameDetail, getTeam } from '@/services';
import { useAppState } from '@/state/AppStore';
import { colors, withAlpha } from '@/theme';

type DetailTab = 'summary' | 'plays' | 'picks' | 'chat';

// Older deep links used different tab names; keep them working.
const TAB_ALIASES: Record<string, DetailTab> = {
  summary: 'summary',
  insights: 'summary',
  plays: 'plays',
  timeline: 'plays',
  picks: 'picks',
  predict: 'picks',
  chat: 'chat',
};

function SummaryLink({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" className="flex-row items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-2 active:opacity-70">
      <Ionicons name={icon} size={13} color={colors.ink} />
      <Text className="text-[13px] font-medium text-ink">{label}</Text>
    </Pressable>
  );
}

export default function GameDetailScreen() {
  const params = useLocalSearchParams<{ id: string; tab?: string }>();
  const gameId = params.id;
  const [tab, setTab] = useState<DetailTab>(TAB_ALIASES[params.tab ?? ''] ?? 'summary');
  const [following, setFollowing] = useState(false);

  const { data, loading } = useAsync(() => getGameDetail(gameId), [gameId]);
  const { picks, settings } = useAppState();
  const chat = useGameChat(gameId);
  const scrollRef = useRef<ScrollView>(null);
  const { ref: keyboardRef, overlap: keyboardOverlap } = useKeyboardOverlap();

  // Keep the newest chat message in view.
  useEffect(() => {
    if (tab === 'chat') {
      const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
      return () => clearTimeout(t);
    }
  }, [tab, chat.messages.length, chat.typing, keyboardOverlap]);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  if (!loading && !data) {
    return (
      <SafeAreaView className="flex-1 bg-bg">
        <EmptyState icon="alert-circle-outline" title="Game not found" body="This game may have been removed from the schedule.">
          <Button label="Close" onPress={close} />
        </EmptyState>
      </SafeAreaView>
    );
  }

  const game = data?.game;
  const away = game ? getTeam(game.away.teamId) : undefined;
  const home = game ? getTeam(game.home.teamId) : undefined;
  const openPicks = data?.predictions.filter((p) => p.status === 'open' && !picks[p.id]).length ?? 0;
  const [headline, ...moreInsights] = data?.insights ?? [];

  return (
    <View className="flex-1 bg-bg">
      {away && home ? (
        <LinearGradient
          colors={[withAlpha(away.primary, 0.8), '#0B0B0D', '#0B0B0D', withAlpha(home.primary, 0.7)]}
          locations={[0, 0.35, 0.6, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0.7 }}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 480 }}
        />
      ) : null}
      {/* Fade the team colors into black so the sticky tabs blend in. */}
      <LinearGradient
        colors={[withAlpha(colors.bg, 0), colors.bg]}
        style={{ position: 'absolute', top: 220, left: 0, right: 0, height: 262 }}
      />

      <SafeAreaView edges={['top', 'bottom']} className="flex-1">
        {/* Keyboard-aware wrapper: pads by the exact on-screen keyboard overlap (works inside sheets). */}
        <View ref={keyboardRef} className="flex-1" style={{ paddingBottom: keyboardOverlap }}>
          {/* Sheet chrome */}
          <View className="items-center pt-1.5">
            <View className="h-1 w-9 rounded-full bg-white/30" />
          </View>
          <View className="flex-row items-center justify-between px-4 pb-1 pt-1.5">
            <IconButton icon="chevron-down" accessibilityLabel="Close game" onPress={close} />
            <View className="items-center">
              <Text className="text-[12px] font-medium text-sub">NFL · Week {game?.week ?? ''}</Text>
              <MockBadge />
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
            contentContainerClassName="pb-10"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            stickyHeaderIndices={[1]}
          >
            {/* 0: scoreboard + linescore */}
            <View className="px-3">
              {game ? (
                <>
                  <Scoreboard game={game} />
                  {game.linescore && !(settings.spoilerShield && game.status === 'final') ? (
                    <View className="mt-5">
                      <Linescore game={game} />
                    </View>
                  ) : null}
                </>
              ) : (
                <Skeleton className="h-64 rounded-3xl bg-white/10" />
              )}
            </View>

            {/* 1: sticky tabs */}
            <View className="bg-bg px-2 pt-3">
              <TextTabs<DetailTab>
                value={tab}
                onChange={setTab}
                tabs={[
                  { value: 'summary', label: 'Summary' },
                  { value: 'plays', label: 'Plays' },
                  { value: 'picks', label: 'Picks', badge: openPicks },
                  { value: 'chat', label: 'Ask AI' },
                ]}
              />
            </View>

            {/* 2: tab content */}
            <View className="px-4 pt-4">
              {!data || !game ? (
                <View className="gap-3">
                  <Skeleton className="h-28 bg-white/10" />
                  <Skeleton className="h-40 bg-white/10" />
                </View>
              ) : tab === 'summary' ? (
                <View className="gap-3">
                  {headline && settings.aiCommentary ? (
                    <InsightCard insight={headline}>
                      <View className="mt-3 flex-row gap-2">
                        <SummaryLink icon="chatbubble-ellipses-outline" label="Ask a follow-up" onPress={() => setTab('chat')} />
                        <SummaryLink icon="play-outline" label="Key plays" onPress={() => setTab('plays')} />
                      </View>
                    </InsightCard>
                  ) : null}
                  {game.status === 'live' ? (
                    <View className="rounded-2xl bg-white/10 px-4 py-3">
                      <WinProbabilityBar game={game} />
                    </View>
                  ) : null}
                  <TeamStats game={game} />
                  {game.leaders?.length ? <GameLeaders leaders={game.leaders} /> : null}
                  <OddsCard game={game} />
                  {settings.aiCommentary
                    ? moreInsights.map((i) => <InsightCard key={i.id} insight={i} />)
                    : null}
                  {game.status === 'scheduled' ? (
                    <Text className="py-6 text-center text-[13px] text-sub">
                      Kickoff at {game.venue}. Stats appear once the game starts.
                    </Text>
                  ) : null}
                </View>
              ) : tab === 'plays' ? (
                <View className="gap-5">
                  {game.status === 'live' && game.situation ? <FieldTracker game={game} /> : null}
                  <View className="-mx-4">
                    <Timeline events={data.timeline} awayId={game.away.teamId} homeId={game.home.teamId} />
                  </View>
                </View>
              ) : tab === 'picks' ? (
                <View className="gap-3">
                  {data.predictions.map((p) => (
                    <PredictionCard key={p.id} prediction={p} />
                  ))}
                  <Text className="mt-1 text-center text-[11px] text-mute">Free to play · Points only, no real money</Text>
                </View>
              ) : (
                <View className="-mx-4">
                  <ChatMessages messages={chat.messages} typing={chat.typing} onSuggestion={chat.send} />
                </View>
              )}
            </View>
          </ScrollView>

          {tab === 'chat' && game ? <ChatComposer onSend={chat.send} disabled={chat.typing} /> : null}
        </View>
      </SafeAreaView>
    </View>
  );
}
