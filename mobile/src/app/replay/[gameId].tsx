import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  ChatComposer,
  FieldTracker,
  Linescore,
  Scoreboard,
  Timeline,
  WinProbabilityBar,
} from '@/components/game';
import { ReplayAskPanel, ReplayInsightCard, ReplayPicksPanel, ReplayPredictionCard } from '@/components/replay';
import { Button, EmptyState, IconButton, Skeleton, TextTabs } from '@/components/ui';
import { useReplayChat } from '@/hooks/useReplayChat';
import { useReplayInsights } from '@/hooks/useReplayInsights';
import { useReplayPredictions } from '@/hooks/useReplayPredictions';
import { useReplaySession } from '@/hooks/useReplaySession';
import { useKeyboardOverlap } from '@/hooks/useKeyboardOverlap';
import { useHaptics } from '@/lib/haptics';
import { usePersonalization } from '@/state/usePersonalization';
import { inlinePick } from '@/lib/replayPredictions';
import {
  formatGameDate,
  getTeam,
  replayTeamId,
  replayTimeline,
  replayToGame,
  type ReplaySnapshot,
} from '@/services';
import { colors, withAlpha } from '@/theme';

const SPEEDS = [1, 2, 5, 10];

type ReplayTab = 'plays' | 'picks' | 'insights' | 'ask';

const STATUS_LABEL: Record<ReplaySnapshot['playback']['status'], string> = {
  ready: 'Ready to replay',
  playing: 'Replaying',
  paused: 'Paused',
  finished: 'Replay complete',
};

function ControlButton({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      className={`h-11 w-11 items-center justify-center rounded-full bg-white/10 active:opacity-70 ${disabled ? 'opacity-40' : ''}`}
    >
      <Ionicons name={icon} size={19} color={colors.ink} />
    </Pressable>
  );
}

export default function ReplayScreen() {
  const { gameId } = useLocalSearchParams<{ gameId: string }>();
  const { snapshot, auth, error, busy, control, setSpeed, retry, refresh } = useReplaySession(gameId);
  const [tab, setTab] = useState<ReplayTab>('plays');
  const { aiPreferences } = usePersonalization();
  const knowledge = aiPreferences?.knowledgeLevel;
  const style = aiPreferences?.explanationStyle;
  const askPreferences = useMemo(
    () => (knowledge && style ? { knowledge_level: knowledge, explanation_style: style } : null),
    [knowledge, style],
  );
  const chat = useReplayChat(auth, snapshot?.playback.cursor ?? 0, askPreferences);
  const insights = useReplayInsights(auth, snapshot?.playback.cursor, tab === 'insights');
  const picks = useReplayPredictions(auth, snapshot?.playback.cursor ?? 0, snapshot?.playback.status, refresh);
  const scrollRef = useRef<ScrollView>(null);
  const { ref: keyboardRef, overlap: keyboardOverlap } = useKeyboardOverlap();
  const { tap } = useHaptics();

  // Keep the newest answer in view.
  useEffect(() => {
    if (tab !== 'ask') return;
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(t);
  }, [tab, chat.items.length, chat.pending, keyboardOverlap]);
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  if (error) {
    return (
      <SafeAreaView className="flex-1 bg-bg">
        <EmptyState
          icon="cloud-offline-outline"
          title="Replay unavailable"
          body={`${error} Make sure the Sideline backend is running.`}
        >
          <View className="flex-row gap-2">
            <Button label="Try again" onPress={retry} />
            <Button label="Close" variant="secondary" onPress={close} />
          </View>
        </EmptyState>
      </SafeAreaView>
    );
  }

  const game = snapshot ? replayToGame(snapshot) : undefined;
  const playback = snapshot?.playback;
  const away = snapshot ? getTeam(replayTeamId(snapshot.game.away.abbr)) : undefined;
  const home = snapshot ? getTeam(replayTeamId(snapshot.game.home.abbr)) : undefined;
  const isPlaying = playback?.status === 'playing';
  // Featured question shown right under the controls (except on the Picks tab, which lists it already).
  const featuredPick = tab === 'picks' ? undefined : inlinePick(picks.view);
  const finished = playback?.status === 'finished';

  const togglePlay = () => {
    tap();
    if (!playback) return;
    if (isPlaying) control('pause');
    else if (playback.status === 'paused') control('resume');
    else if (finished) control('restart');
    else control('play');
  };

  return (
    <View className="flex-1 bg-bg">
      {away && home ? (
        <LinearGradient
          colors={[
            withAlpha(away.primary, 0.8),
            '#0B0B0D',
            '#0B0B0D',
            withAlpha(home.primary, 0.7),
          ]}
          locations={[0, 0.35, 0.6, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0.7 }}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 480 }}
        />
      ) : null}
      <LinearGradient
        colors={[withAlpha(colors.bg, 0), colors.bg]}
        style={{ position: 'absolute', top: 220, left: 0, right: 0, height: 262 }}
      />

      <SafeAreaView edges={['top', 'bottom']} className="flex-1">
        {/* Keyboard-aware wrapper: pads by the exact on-screen keyboard overlap (works inside sheets). */}
        <View ref={keyboardRef} className="flex-1" style={{ paddingBottom: keyboardOverlap }}>
          <View className="items-center pt-1.5">
            <View className="h-1 w-9 rounded-full bg-white/30" />
          </View>
          <View className="flex-row items-center justify-between px-4 pb-1 pt-1.5">
            <IconButton icon="chevron-down" accessibilityLabel="Close replay" onPress={close} />
            <View className="flex-1 items-center px-2">
              <Text className="text-[12px] font-medium text-sub" numberOfLines={1}>
                {snapshot
                  ? `${snapshot.game.title} · ${formatGameDate(snapshot.game.game_date)}`
                  : 'Historical replay'}
              </Text>
              <Text className="text-[11px] text-mute">
                Historical replay{snapshot?.game.season ? ` · ${snapshot.game.season} season` : ''}
              </Text>
            </View>
            <View className="w-10" />
          </View>

          <ScrollView
            ref={scrollRef}
            className="flex-1"
            contentContainerClassName="pb-10"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View className="px-3">
              {game ? (
                <Scoreboard game={game} showRecords={false} />
              ) : (
                <Skeleton className="h-60 rounded-3xl bg-white/10" />
              )}
              {game?.linescore ? (
                <View className="mt-5">
                  <Linescore game={game} />
                </View>
              ) : null}
            </View>

            {/* Playback controls */}
            {playback ? (
              <View className="mx-4 mt-4 rounded-2xl bg-white/10 p-4">
                <View className="flex-row items-center justify-between">
                  <Text className="text-[13px] font-semibold text-ink">
                    {STATUS_LABEL[playback.status]}
                  </Text>
                  <Text className="font-cond text-[14px] text-sub">
                    Play {playback.cursor} of {playback.total_events}
                  </Text>
                </View>
                {playback.paused_for_prediction ? (
                  <Pressable
                    onPress={() => setTab('picks')}
                    accessibilityRole="button"
                    accessibilityLabel="Paused for your pick. Open picks"
                    className="mt-2.5 flex-row items-center gap-2 rounded-xl bg-volt/15 px-3 py-2 active:opacity-70"
                  >
                    <Ionicons name="hand-left" size={14} color={colors.volt} />
                    <Text className="flex-1 text-[13px] font-semibold text-volt">
                      Paused for your pick — answer to keep watching
                    </Text>
                    <Ionicons name="chevron-forward" size={14} color={colors.volt} />
                  </Pressable>
                ) : null}
                <View className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
                  <View
                    className="h-full rounded-full bg-volt"
                    style={{ width: `${playback.progress * 100}%` }}
                  />
                </View>
                <View className="mt-4 flex-row items-center justify-between">
                  <ControlButton
                    icon="refresh"
                    label="Restart replay"
                    onPress={() => control('restart')}
                    disabled={busy || playback.cursor === 0}
                  />
                  <Pressable
                    onPress={togglePlay}
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityLabel={
                      isPlaying ? 'Pause replay' : finished ? 'Replay again' : 'Play replay'
                    }
                    className="h-14 w-14 items-center justify-center rounded-full bg-volt active:opacity-80"
                  >
                    <Ionicons
                      name={isPlaying ? 'pause' : finished ? 'refresh' : 'play'}
                      size={24}
                      color={colors.bg}
                      style={isPlaying || finished ? undefined : { marginLeft: 3 }}
                    />
                  </Pressable>
                  <ControlButton
                    icon="play-skip-forward"
                    label="Next play"
                    onPress={() => control('step')}
                    disabled={busy || finished}
                  />
                </View>
                <View className="mt-4 flex-row justify-center gap-2" accessibilityRole="radiogroup">
                  {SPEEDS.map((s) => {
                    const active = playback.speed === s;
                    return (
                      <Pressable
                        key={s}
                        onPress={() => setSpeed(s)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: active }}
                        accessibilityLabel={`${s}x speed`}
                        className={`rounded-full px-3.5 py-1.5 ${active ? 'bg-volt' : 'bg-white/10'}`}
                      >
                        <Text
                          className={`font-cond text-[15px] ${active ? 'text-bg' : 'text-ink'}`}
                        >
                          {s}x
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {featuredPick ? (
              <View className="mx-4 mt-3">
                <ReplayPredictionCard
                  compact
                  card={featuredPick}
                  secondsToSnap={playback?.pick_window_seconds_left}
                  onAnswer={(o) => picks.answer(featuredPick.item.prediction.id, o)}
                />
              </View>
            ) : null}

            {game?.status === 'live' ? (
              <View className="mx-4 mt-3 gap-3">
                {game.situation ? (
                  <View className="rounded-2xl bg-white/10 px-4 py-3">
                    <FieldTracker game={game} />
                  </View>
                ) : null}
                <View className="rounded-2xl bg-white/10 px-4 py-3">
                  <WinProbabilityBar game={game} />
                </View>
              </View>
            ) : null}

            {snapshot ? (
              <>
                <View className="mb-4 mt-5 px-2">
                  <TextTabs<ReplayTab>
                    value={tab}
                    onChange={setTab}
                    tabs={[
                      { value: 'plays', label: 'Plays' },
                      { value: 'picks', label: 'Picks', badge: picks.view.needsAnswer },
                      { value: 'insights', label: 'Insights' },
                      { value: 'ask', label: 'Ask AI' },
                    ]}
                  />
                </View>

                {tab === 'plays' ? (
                  snapshot.state.recent_plays.length ? (
                    <Timeline
                      events={replayTimeline(snapshot)}
                      awayId={replayTeamId(snapshot.game.away.abbr)}
                      homeId={replayTeamId(snapshot.game.home.abbr)}
                    />
                  ) : (
                    <Text className="px-5 text-[14px] text-sub">
                      Press play to start from kickoff. Plays appear here as they happen.
                    </Text>
                  )
                ) : tab === 'picks' ? (
                  <ReplayPicksPanel
                    data={picks.data}
                    view={picks.view}
                    error={picks.error}
                    onRetry={picks.reload}
                    onAnswer={picks.answer}
                    onTogglePause={picks.setPauseForPicks}
                    onExplain={picks.explain}
                    secondsToSnap={playback?.pick_window_seconds_left}
                    explanations={picks.explanations}
                  />
                ) : tab === 'insights' ? (
                  <View className="gap-3 px-4">
                    {insights.data && !insights.data.ai_configured ? (
                      <Text className="text-[12px] text-mute">
                        AI explanations are off: add PORTKEY_API_KEY on the backend to enable them.
                      </Text>
                    ) : null}
                    {insights.error ? (
                      <View className="rounded-2xl bg-loss/10 p-4">
                        <Text className="text-[14px] font-semibold text-ink">
                          Couldn’t load insights
                        </Text>
                        <Text className="mt-1 text-[13px] text-sub">{insights.error}</Text>
                        <Button
                          label="Retry"
                          size="sm"
                          variant="secondary"
                          className="mt-3 self-start"
                          onPress={insights.reload}
                        />
                      </View>
                    ) : null}
                    {insights.data?.insights.length ? (
                      insights.data.insights.map((i) => (
                        <ReplayInsightCard key={i.id} insight={i} />
                      ))
                    ) : !insights.error ? (
                      <Text className="text-[14px] text-sub">
                        {insights.loading
                          ? 'Finding key moments…'
                          : 'Key moments (scores, lead changes, turnovers, big plays) appear here as the replay unfolds.'}
                      </Text>
                    ) : null}
                  </View>
                ) : (
                  <ReplayAskPanel
                    items={chat.items}
                    pending={chat.pending}
                    onAsk={chat.send}
                    onRetry={chat.retry}
                    onReset={chat.reset}
                    hiddenCount={chat.hiddenCount}
                  />
                )}

                <Text className="mx-5 mt-6 text-center text-[11px] leading-4 text-mute">
                  {snapshot.game.attribution ?? 'Historical play-by-play'}
                  {snapshot.game.is_test_fixture ? ' · Test fixture' : ''}
                </Text>
              </>
            ) : null}
          </ScrollView>
          {tab === 'ask' && snapshot ? (
            <ChatComposer onSend={chat.send} disabled={chat.pending || !auth} />
          ) : null}
        </View>
      </SafeAreaView>
    </View>
  );
}
