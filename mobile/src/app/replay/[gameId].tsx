import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FieldTracker, Linescore, Scoreboard, Timeline, WinProbabilityBar } from '@/components/game';
import { Button, EmptyState, IconButton, Skeleton } from '@/components/ui';
import { useReplaySession } from '@/hooks/useReplaySession';
import { useHaptics } from '@/lib/haptics';
import { formatGameDate, getTeam, replayTeamId, replayTimeline, replayToGame, type ReplaySnapshot } from '@/services';
import { colors, withAlpha } from '@/theme';

const SPEEDS = [1, 2, 5, 10];

const STATUS_LABEL: Record<ReplaySnapshot['playback']['status'], string> = {
  ready: 'Ready to replay',
  playing: 'Replaying',
  paused: 'Paused',
  finished: 'Replay complete',
};

function ControlButton({ icon, label, onPress, disabled }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; disabled?: boolean }) {
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
  const { snapshot, error, busy, control, setSpeed, retry } = useReplaySession(gameId);
  const { tap } = useHaptics();
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  if (error) {
    return (
      <SafeAreaView className="flex-1 bg-bg">
        <EmptyState icon="cloud-offline-outline" title="Replay unavailable" body={`${error} Make sure the Sideline backend is running.`}>
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
          colors={[withAlpha(away.primary, 0.8), '#0B0B0D', '#0B0B0D', withAlpha(home.primary, 0.7)]}
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
        <View className="items-center pt-1.5">
          <View className="h-1 w-9 rounded-full bg-white/30" />
        </View>
        <View className="flex-row items-center justify-between px-4 pb-1 pt-1.5">
          <IconButton icon="chevron-down" accessibilityLabel="Close replay" onPress={close} />
          <View className="flex-1 items-center px-2">
            <Text className="text-[12px] font-medium text-sub" numberOfLines={1}>
              {snapshot ? `${snapshot.game.title} · ${formatGameDate(snapshot.game.game_date)}` : 'Historical replay'}
            </Text>
            <Text className="text-[11px] text-mute">
              Historical replay{snapshot?.game.season ? ` · ${snapshot.game.season} season` : ''}
            </Text>
          </View>
          <View className="w-10" />
        </View>

        <ScrollView className="flex-1" contentContainerClassName="pb-10" showsVerticalScrollIndicator={false}>
          <View className="px-3">
            {game ? <Scoreboard game={game} showRecords={false} /> : <Skeleton className="h-60 rounded-3xl bg-white/10" />}
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
                <Text className="text-[13px] font-semibold text-ink">{STATUS_LABEL[playback.status]}</Text>
                <Text className="font-cond text-[14px] text-sub">
                  Play {playback.cursor} of {playback.total_events}
                </Text>
              </View>
              <View className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
                <View className="h-full rounded-full bg-volt" style={{ width: `${playback.progress * 100}%` }} />
              </View>
              <View className="mt-4 flex-row items-center justify-between">
                <ControlButton icon="refresh" label="Restart replay" onPress={() => control('restart')} disabled={busy || playback.cursor === 0} />
                <Pressable
                  onPress={togglePlay}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityLabel={isPlaying ? 'Pause replay' : finished ? 'Replay again' : 'Play replay'}
                  className="h-14 w-14 items-center justify-center rounded-full bg-volt active:opacity-80"
                >
                  <Ionicons name={isPlaying ? 'pause' : finished ? 'refresh' : 'play'} size={24} color={colors.bg} style={isPlaying || finished ? undefined : { marginLeft: 3 }} />
                </Pressable>
                <ControlButton icon="play-skip-forward" label="Next play" onPress={() => control('step')} disabled={busy || finished} />
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
                      <Text className={`font-cond text-[15px] ${active ? 'text-bg' : 'text-ink'}`}>{s}x</Text>
                    </Pressable>
                  );
                })}
              </View>
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
              <Text className="mb-3 mt-6 px-5 text-[20px] font-bold text-ink">Play-by-play</Text>
              {snapshot.state.recent_plays.length ? (
                <Timeline events={replayTimeline(snapshot)} awayId={replayTeamId(snapshot.game.away.abbr)} homeId={replayTeamId(snapshot.game.home.abbr)} />
              ) : (
                <Text className="px-5 text-[14px] text-sub">Press play to start from kickoff. Plays appear here as they happen.</Text>
              )}
              <Text className="mx-5 mt-6 text-center text-[11px] leading-4 text-mute">
                {snapshot.game.attribution ?? 'Historical play-by-play'}
                {snapshot.game.is_test_fixture ? ' · Test fixture' : ''}
              </Text>
            </>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
