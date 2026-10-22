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
import {
  MomentCard,
  PregameCard,
  ReplayAskPanel,
  ReplayInsightCard,
  ReplayPicksPanel,
  ReplayPredictionCard,
  RevealToast,
} from '@/components/replay';
import { LiveDot } from '@/components/scores';
import { Button, EmptyState, IconButton, Skeleton, TextTabs } from '@/components/ui';
import { SheetView } from '@/components/web/SheetView';
import { useReplayChat } from '@/hooks/useReplayChat';
import { useReplayInsights } from '@/hooks/useReplayInsights';
import { useReplayPredictions } from '@/hooks/useReplayPredictions';
import { useReplaySession } from '@/hooks/useReplaySession';
import { useKeyboardOverlap } from '@/hooks/useKeyboardOverlap';
import { useHaptics } from '@/lib/haptics';
import { usePersonalization } from '@/state/usePersonalization';
import { useWeek } from '@/state/WeekContext';
import { newReveals, type Reveal } from '@/lib/moments';
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
  const { gameId, startCursor, live } = useLocalSearchParams<{
    gameId: string;
    startCursor?: string;
    live?: string;
  }>();
  // Opened from the synchronized week: join at that moment, then follow the week clock.
  const joinAt = Math.max(0, Number.parseInt(startCursor ?? '0', 10) || 0);
  const week = useWeek();
  const { snapshot, auth, error, busy, control, setSpeed, stepBy, retry, refresh } =
    useReplaySession(gameId, joinAt, week.momentHolds);
  const weekGame =
    live === '1' ? week.snapshot?.games.find((g) => g.game_id === gameId) : undefined;
  const weekPlaying = week.snapshot?.status === 'playing' || week.snapshot?.status === 'held';
  // Following = this game advances with the shared week clock. Any manual control detaches.
  const [following, setFollowing] = useState(live === '1');
  const weekCursor = weekGame?.cursor;
  const replayCursor = snapshot?.playback.cursor;
  useEffect(() => {
    if (!following || busy || weekCursor === undefined || replayCursor === undefined) return;
    if (weekCursor <= replayCursor) return;
    const t = setTimeout(() => stepBy(weekCursor - replayCursor), 0); // catch up (50 plays per request)
    return () => clearTimeout(t);
  }, [following, busy, weekCursor, replayCursor, stepBy]);
  // While following, this game's big moments stop the week clock.
  const { setViewing } = week;
  useEffect(() => {
    if (!following) return;
    setViewing(gameId);
    return () => setViewing(null);
  }, [following, gameId, setViewing]);
  const ownPace = (fn: () => void) => () => {
    setFollowing(false);
    fn();
  };
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
  const picks = useReplayPredictions(
    auth,
    snapshot?.playback.cursor ?? 0,
    snapshot?.playback.status,
    refresh,
  );

  // Instant result after the snap for questions you answered (shown once, for a few seconds).
  const [seenReveals, setSeenReveals] = useState<Set<string>>(() => new Set());
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const resolvedItems = picks.data?.resolved;
  useEffect(() => {
    const fresh = newReveals(resolvedItems ?? [], seenReveals);
    if (!fresh.length) return;
    const t = setTimeout(() => {
      setSeenReveals((prev) => new Set([...prev, ...fresh.map((f) => f.id)]));
      setReveal(fresh[fresh.length - 1]);
    }, 0);
    return () => clearTimeout(t);
  }, [resolvedItems, seenReveals]);
  useEffect(() => {
    if (!reveal) return;
    const t = setTimeout(() => setReveal(null), 4000);
    return () => clearTimeout(t);
  }, [reveal]);
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
  // Big Moment hold: the week clock holding on this game (following), or this replay's own hold.
  const weekHold = following && week.snapshot?.hold?.game_id === gameId ? week.snapshot.hold : null;
  const ownHoldSeconds =
    !following && snapshot?.playback.moment_hold
      ? snapshot.playback.pick_window_seconds_left
      : null;
  const momentId =
    weekHold?.moment.prediction_id ??
    (ownHoldSeconds != null
      ? picks.view.open.find((c) => c.item.prediction.big_moment)?.item.prediction.id
      : undefined);
  const momentCard = momentId
    ? picks.view.open.find((c) => c.item.prediction.id === momentId)
    : undefined;
  const momentSeconds = weekHold?.seconds_left ?? ownHoldSeconds;
  const answerMoment = async (optionId: string) => {
    if (!momentCard) return;
    await picks.answer(momentCard.item.prediction.id, optionId);
    if (weekHold) week.release(); // answered: the week moves on now
  };
  const inline = tab === 'picks' ? undefined : inlinePick(picks.view);
  const featuredPick =
    inline && inline.item.prediction.id !== momentCard?.item.prediction.id ? inline : undefined;
  const finished = playback?.status === 'finished';

  const togglePlay = () => {
    tap();
    if (!playback) return;
    setFollowing(false);
    if (isPlaying) control('pause');
    else if (playback.status === 'paused') control('resume');
    else if (finished) control('restart');
    else control('play');
  };

  return (
    <SheetView>
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

            {/* Before kickoff: both teams' season so far. Disappears once the game starts. */}
            {game?.status === 'scheduled' && gameId ? <PregameCard gameId={gameId} /> : null}

            {momentCard ? (
              <MomentCard
                card={momentCard}
                secondsLeft={momentSeconds}
                onAnswer={answerMoment}
                onSkip={weekHold ? week.release : undefined}
              />
            ) : null}
            {reveal ? <RevealToast reveal={reveal} /> : null}

            {/* Playback controls */}
            {playback ? (
              <View className="mx-4 mt-4 rounded-2xl bg-white/10 p-4">
                <View className="flex-row items-center justify-between">
                  <Text className="text-[13px] font-semibold text-ink">
                    {following && weekGame
                      ? weekHold
                        ? 'Big moment · play holding'
                        : weekPlaying
                          ? 'Live with the week'
                          : 'Week paused'
                      : STATUS_LABEL[playback.status]}
                  </Text>
                  <Text className="font-cond text-[14px] text-sub">
                    Play {playback.cursor} of {playback.total_events}
                  </Text>
                </View>
                {weekGame ? (
                  following ? (
                    <View className="mt-2.5 flex-row items-center gap-2 rounded-xl bg-white/5 px-3 py-2">
                      {weekPlaying ? (
                        <LiveDot />
                      ) : (
                        <Ionicons name="pause" size={12} color={colors.sub} />
                      )}
                      <Text className="flex-1 text-[13px] text-sub">
                        In sync with {week.snapshot?.title} · {week.snapshot?.sim_time_label}
                      </Text>
                      <Pressable
                        onPress={() => setFollowing(false)}
                        accessibilityRole="button"
                        hitSlop={8}
                        className="active:opacity-70"
                      >
                        <Text className="text-[13px] font-semibold text-ink">My own pace</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <Pressable
                      onPress={() => {
                        tap();
                        // Ahead of the week (you played on): start over and catch back up to live.
                        if (weekCursor !== undefined && playback.cursor > weekCursor)
                          control('restart');
                        else if (playback.status === 'playing') control('pause');
                        setFollowing(true);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel="Back to live with the week"
                      className="mt-2.5 flex-row items-center gap-2 rounded-xl bg-white/5 px-3 py-2 active:opacity-70"
                    >
                      <Ionicons name="radio" size={14} color={colors.ink} />
                      <Text className="flex-1 text-[13px] text-sub">Watching at your own pace</Text>
                      <Text className="text-[13px] font-semibold text-ink">Back to live</Text>
                    </Pressable>
                  )
                ) : null}
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
                    onPress={ownPace(() => control('restart'))}
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
                    onPress={ownPace(() => control('step'))}
                    disabled={busy || finished}
                  />
                </View>
                <View className="mt-4 flex-row justify-center gap-2" accessibilityRole="radiogroup">
                  {SPEEDS.map((s) => {
                    const active = playback.speed === s;
                    return (
                      <Pressable
                        key={s}
                        onPress={ownPace(() => setSpeed(s))}
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
                    momentHolds={week.momentHolds}
                    onMomentHolds={(level) => {
                      week.setMomentHolds(level);
                      picks.setMomentHolds(level);
                    }}
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
    </SheetView>
  );
}
