import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { TeamBadge } from '@/components/game';
import { downAndDistance } from '@/lib/format';
import { useHaptics } from '@/lib/haptics';
import { getTeam } from '@/services';
import { colors, withAlpha } from '@/theme';
import type { Game } from '@/types';
import { LiveDot } from './LiveDot';

function Side({ game, side }: { game: Game; side: 'away' | 'home' }) {
  const ts = game[side];
  const team = getTeam(ts.teamId);
  const hasBall = game.situation?.possessionTeamId === team.id;
  return (
    <View className="flex-1 items-center">
      <Text className="font-score text-[76px] leading-[80px] text-ink">{ts.score}</Text>
      <TeamBadge teamId={team.id} size={40} />
      <View className="mt-1.5 flex-row items-center gap-1.5">
        <Text className="text-[14px] font-semibold text-ink">{team.name}</Text>
        {hasBall ? <View className="h-1.5 w-1.5 rounded-full bg-gold" accessibilityLabel="Has possession" /> : null}
      </View>
      <Text className="font-cond text-[13px] text-sub">{team.record}</Text>
    </View>
  );
}

/** Hero for a live game involving one of the user's teams. */
export function FeaturedGame({ game }: { game: Game }) {
  const { tap } = useHaptics();
  const away = getTeam(game.away.teamId);
  const home = getTeam(game.home.teamId);
  const s = game.situation;
  const awayPct = 100 - game.homeWinProbability;
  const open = (tab?: string) => {
    tap();
    router.push({ pathname: '/game/[id]', params: tab ? { id: game.id, tab } : { id: game.id } });
  };

  return (
    <View className="mx-3 mb-2 overflow-hidden rounded-3xl">
      <LinearGradient
        colors={[withAlpha(away.primary, 0.85), '#0B0B0D', '#0B0B0D', withAlpha(home.primary, 0.8)]}
        locations={[0, 0.42, 0.58, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />
      <Pressable
        onPress={() => open()}
        accessibilityRole="button"
        accessibilityLabel={`Open ${away.name} at ${home.name}`}
        className="px-4 pb-4 pt-4 active:opacity-90"
      >
        <Text className="text-center text-[11px] font-semibold tracking-[1.5px] text-sub">YOUR GAME · {game.network}</Text>
        <View className="mt-1 flex-row items-start">
          <Side game={game} side="away" />
          <View className="items-center pt-5">
            <View className="flex-row items-center gap-1.5">
              <LiveDot />
              <Text className="text-[12px] font-semibold text-live">LIVE</Text>
            </View>
            <Text className="mt-0.5 font-score-bold text-[26px] text-ink">
              {game.period} {game.clock}
            </Text>
            {s ? (
              <Text className="mt-1 text-[12px] text-sub">
                {downAndDistance(s.down, s.distance)} · {s.ballOn}
              </Text>
            ) : null}
          </View>
          <Side game={game} side="home" />
        </View>

        <View className="mt-4">
          <View className="h-1 flex-row overflow-hidden rounded-full">
            <View style={{ flex: awayPct, backgroundColor: withAlpha('#FFFFFF', 0.9) }} />
            <View className="w-0.5" />
            <View style={{ flex: game.homeWinProbability, backgroundColor: withAlpha('#FFFFFF', 0.28) }} />
          </View>
          <View className="mt-1.5 flex-row justify-between">
            <Text className="font-cond text-[13px] text-ink">
              {away.abbr} {awayPct}%
            </Text>
            <Text className="text-[11px] text-mute">Win probability</Text>
            <Text className="font-cond text-[13px] text-sub">
              {game.homeWinProbability}% {home.abbr}
            </Text>
          </View>
        </View>
      </Pressable>

      <View className="flex-row gap-2 px-4 pb-4">
        <Pressable
          onPress={() => open('chat')}
          accessibilityRole="button"
          className="flex-1 flex-row items-center justify-center gap-1.5 rounded-full bg-volt py-3 active:opacity-80"
        >
          <Ionicons name="sparkles" size={15} color={colors.bg} />
          <Text className="text-[14px] font-semibold text-bg">Ask Sideline AI</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            tap();
            router.push('/party');
          }}
          accessibilityRole="button"
          className="flex-1 flex-row items-center justify-center gap-1.5 rounded-full bg-white/15 py-3 active:opacity-80"
        >
          <Ionicons name="people" size={15} color={colors.ink} />
          <Text className="text-[14px] font-semibold text-ink">Watch party</Text>
        </Pressable>
      </View>
    </View>
  );
}
