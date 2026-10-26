import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { DayTabs, MomentBanner, ScoreRow, WeekClock } from '@/components/scores';
import { Avatar, Button, EmptyState, Screen, Skeleton } from '@/components/ui';
import { WEEK_DAYS, dayOfClock, toScoreGame, weekSections, type WeekDay } from '@/lib/week';
import { getTeam } from '@/services';
import type { WeekGame } from '@/services/week';
import { usePersonalization } from '@/state/usePersonalization';
import { useFirstRunGuide } from '@/hooks/useFirstRunGuide';
import { useWeek } from '@/state/WeekContext';
import { colors, withAlpha } from '@/theme';

function SectionLabel({ title, icon }: { title: string; icon?: keyof typeof Ionicons.glyphMap }) {
  return (
    <View className="mb-2 mt-6 flex-row items-center gap-1.5 px-5">
      {icon ? <Ionicons name={icon} size={12} color={colors.sub} /> : null}
      <Text className="text-[12px] font-semibold uppercase tracking-[1px] text-sub">{title}</Text>
    </View>
  );
}

/**
 * Scores is the real 2025 Week 5, on one shared simulated clock (backend replay engine, nflverse
 * data). Games go live and score exactly as they did; nothing is shown before the clock reaches it.
 * Tapping a game opens its replay at the current moment.
 */
export default function ScoresScreen() {
  const { favoriteTeamIds, initials } = usePersonalization();
  const week = useWeek();
  const { ensure } = week;
  useFirstRunGuide();
  // null = follow the clock's day; a tap pins a day.
  const [pinnedDay, setPinnedDay] = useState<WeekDay | null>(null);

  useEffect(() => {
    ensure();
  }, [ensure]);

  const snap = week.snapshot;
  const day = pinnedDay ?? (snap ? dayOfClock(snap.sim_time_label) : 'sun');
  const sections = snap ? weekSections(snap.games, day, favoriteTeamIds) : [];
  // The clock is holding on a big moment in your #1 team's game (you're on Scores, not in a game).
  const heldGame =
    snap?.status === 'held' && snap.hold && !week.viewingGameId
      ? snap.games.find((g) => g.game_id === snap.hold?.game_id)
      : undefined;
  const tint = favoriteTeamIds.length ? getTeam(favoriteTeamIds[0]).primary : colors.surface;

  const open = (g: WeekGame) =>
    router.push({
      pathname: '/replay/[gameId]',
      params: {
        gameId: g.game_id,
        ...(g.cursor > 0 ? { startCursor: String(g.cursor) } : {}),
        // Live or upcoming games follow the week clock; finals open at your own pace.
        ...(g.phase !== 'final' ? { live: '1' } : {}),
      },
    });

  return (
    <Screen
      background={
        <LinearGradient
          colors={[withAlpha(tint, 0.55), withAlpha(tint, 0)]}
          style={{ height: 340 }}
        />
      }
    >
      {/* Header */}
      <View className="flex-row items-center justify-between px-5 pb-1 pt-2">
        <Text className="text-[15px] font-extrabold tracking-[6px] text-ink">SIDELINE</Text>
        <Pressable
          onPress={() => router.push('/profile')}
          accessibilityRole="button"
          accessibilityLabel="Open your profile"
          hitSlop={8}
        >
          <Avatar initials={initials} color={colors.volt} size={32} />
        </Pressable>
      </View>

      {week.error && !snap ? (
        <EmptyState
          icon="cloud-offline-outline"
          title="Week 5 is unavailable"
          body={`${week.error} Make sure the Sideline backend is running.`}
        >
          <Button label="Try Again" onPress={week.retry} />
        </EmptyState>
      ) : !snap ? (
        <View className="mt-4 gap-2 px-3">
          {week.waking ? (
            <View
              className="mb-2 rounded-2xl bg-white/10 px-4 py-3"
              accessibilityLiveRegion="polite"
            >
              <Text className="text-[14px] font-semibold text-ink">
                Waking up the Sideline server…
              </Text>
              <Text className="mt-1 text-[12px] leading-4 text-sub">
                The free host sleeps when nobody is using it. The first load can take up to a
                minute.
              </Text>
            </View>
          ) : null}
          <Skeleton className="h-52 rounded-2xl" />
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[78px]" />
          ))}
        </View>
      ) : (
        <>
          <WeekClock
            week={snap}
            busy={week.busy}
            onPlay={week.play}
            onPause={week.pause}
            onSpeed={week.setSpeed}
            onJump={(preset) => {
              setPinnedDay(null); // follow the clock to the new day
              week.jumpTo(preset);
            }}
          />

          {heldGame && snap.hold ? (
            <MomentBanner
              hold={snap.hold}
              matchup={`${heldGame.away.abbr} @ ${heldGame.home.abbr}`}
              onOpen={() => open(heldGame)}
              onSkip={week.release}
            />
          ) : null}

          <View className="mt-4">
            <DayTabs<WeekDay> days={WEEK_DAYS} value={day} onChange={setPinnedDay} />
          </View>

          {sections.map((s) => (
            <View key={s.key}>
              <SectionLabel title={s.title} icon={s.icon} />
              {s.games.map((g) => (
                <ScoreRow
                  key={g.game_id}
                  game={toScoreGame(g)}
                  showRecords={false}
                  badge={g.moment?.big_moment ? 'Big moment' : undefined}
                  onPress={() => open(g)}
                />
              ))}
            </View>
          ))}

          <Text className="mx-5 mt-3 text-center text-[11px] leading-4 text-mute">
            {snap.attribution} Tap a game to watch it from this moment, with Ask Sideline, Insights
            and Picks.
          </Text>
        </>
      )}
    </Screen>
  );
}
