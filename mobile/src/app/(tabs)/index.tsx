import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { DayTabs, FeaturedGame, ReplayRow, ScoreRow, type ScoreDay } from '@/components/scores';
import { Avatar, EmptyState, Screen, Skeleton } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { splitKickoff } from '@/lib/format';
import { getTeam, listGamesByDay, listMostRecentFinals, listReplayGames } from '@/services';
import { useAppState } from '@/state/AppStore';
import { colors, withAlpha } from '@/theme';
import type { Game } from '@/types';

interface Section {
  key: string;
  title: string;
  icon?: keyof typeof Ionicons.glyphMap;
  games: Game[];
}

const involves = (g: Game, teamIds: string[]) => teamIds.includes(g.away.teamId) || teamIds.includes(g.home.teamId);

/** Group a day's games Apple Sports–style: your teams first, then by state. */
function buildSections(day: ScoreDay, games: Game[], favoriteIds: string[], excludeId?: string): Section[] {
  const pool = games.filter((g) => g.id !== excludeId);
  const mine = pool.filter((g) => involves(g, favoriteIds));
  const rest = pool.filter((g) => !involves(g, favoriteIds));
  const sections: Section[] = [];
  if (mine.length) sections.push({ key: 'mine', title: 'Your teams', icon: 'star', games: mine });

  if (day === 'upcoming') {
    // Group by weekday, preserving schedule order.
    const byDay = new Map<string, Game[]>();
    rest.forEach((g) => {
      const label = splitKickoff(g.kickoffLabel).day;
      byDay.set(label, [...(byDay.get(label) ?? []), g]);
    });
    byDay.forEach((list, label) => sections.push({ key: label, title: label, games: list }));
    return sections;
  }

  const live = rest.filter((g) => g.status === 'live');
  const final = rest.filter((g) => g.status === 'final');
  const later = rest.filter((g) => g.status === 'scheduled');
  if (live.length) sections.push({ key: 'live', title: 'Live', games: live });
  if (final.length) sections.push({ key: 'final', title: 'Final', games: final });
  if (later.length) sections.push({ key: 'later', title: 'Later today', games: later });
  return sections;
}

function SectionLabel({ title, icon }: { title: string; icon?: keyof typeof Ionicons.glyphMap }) {
  return (
    <View className="mb-2 mt-5 flex-row items-center gap-1.5 px-5">
      {icon ? <Ionicons name={icon} size={12} color={colors.sub} /> : null}
      <Text className="text-[12px] font-semibold uppercase tracking-[1px] text-sub">{title}</Text>
    </View>
  );
}

export default function ScoresScreen() {
  const { profile } = useAppState();
  const [day, setDay] = useState<ScoreDay>('today');
  const { data, loading, reload } = useAsync(
    async () => ({
      games: await listGamesByDay(day),
      recent: day === 'yesterday' ? await listMostRecentFinals() : [],
    }),
    [day],
  );

  // Real historical games from the backend replay engine; hidden if the backend is offline.
  const { data: replays } = useAsync(listReplayGames);
  const favoriteIds = profile.favoriteTeamIds;
  const games = data?.games ?? [];
  const hero = day === 'today' ? games.find((g) => g.status === 'live' && involves(g, favoriteIds)) : undefined;
  const sections = buildSections(day, games, favoriteIds, hero?.id);
  const tint = favoriteIds.length ? getTeam(favoriteIds[0]).primary : colors.surface;

  return (
    <Screen
      onRefresh={reload}
      refreshing={loading && !!data}
      background={
        <LinearGradient colors={[withAlpha(tint, 0.55), withAlpha(tint, 0)]} style={{ height: 340 }} />
      }
    >
      {/* Header */}
      <View className="flex-row items-center justify-between px-5 pb-1 pt-2">
        <Text className="text-[15px] font-extrabold tracking-[6px] text-ink">SIDELINE</Text>
        <Pressable onPress={() => router.push('/profile')} accessibilityRole="button" accessibilityLabel="Open your profile" hitSlop={8}>
          <Avatar initials={profile.initials} color={colors.volt} size={32} />
        </Pressable>
      </View>

      <DayTabs value={day} onChange={setDay} />
      <Text className="mb-1 text-center text-[11px] text-mute">NFL · Week 5 · Sample data</Text>

      {!data ? (
        <View className="mt-4 gap-2 px-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[78px]" />
          ))}
        </View>
      ) : (
        <>
          {hero ? (
            <View className="mt-3">
              <FeaturedGame game={hero} />
            </View>
          ) : null}

          {sections.map((s) => (
            <View key={s.key}>
              <SectionLabel title={s.title} icon={s.icon} />
              {s.games.map((g) => (
                <ScoreRow key={g.id} game={g} />
              ))}
            </View>
          ))}

          {day === 'yesterday' && games.length === 0 ? (
            <>
              <EmptyState icon="calendar-outline" title="No NFL games yesterday" body="Here’s the most recent result." />
              <SectionLabel title="Thursday Night Football" />
              {data.recent.map((g) => (
                <ScoreRow key={g.id} game={g} />
              ))}
            </>
          ) : null}

          {day === 'today' && replays?.length ? (
            <View>
              <SectionLabel title="Classic replays" icon="play-circle" />
              {replays.map((g) => (
                <ReplayRow key={g.game_id} game={g} />
              ))}
              <Text className="mt-1 px-5 text-[11px] text-mute">Real play-by-play from nflverse (CC BY 4.0), replayed play by play.</Text>
            </View>
          ) : null}

          {day !== 'yesterday' && sections.length === 0 && !hero ? (
            <EmptyState icon="american-football-outline" title="No games scheduled" body="Check another day for the full slate." />
          ) : null}
        </>
      )}
    </Screen>
  );
}
