import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { LiveBadge, MockBadge } from '@/components/ui';
import { downAndDistance, gameStatusLabel } from '@/lib/format';
import { getTeam } from '@/services';
import { colors, withAlpha } from '@/theme';
import type { Game } from '@/types';
import { TeamBadge } from './TeamBadge';
import { WinProbabilityBar } from './WinProbabilityBar';

function Side({ teamId, score, hasBall }: { teamId: string; score: number; hasBall: boolean }) {
  const team = getTeam(teamId);
  return (
    <View className="flex-1 items-center">
      <TeamBadge teamId={teamId} size={56} />
      <Text className="mt-2 text-sm font-bold text-ink">{team.name}</Text>
      <Text className="text-[11px] text-sub">{team.record}</Text>
      <View className="mt-1 flex-row items-center gap-1">
        <Text className="text-[44px] font-black tabular-nums text-ink">{score}</Text>
      </View>
      <View className="h-3">{hasBall ? <Ionicons name="american-football" size={12} color={colors.gold} /> : null}</View>
    </View>
  );
}

/** Hero card for the headline game on Home. */
export function FeaturedGameCard({ game }: { game: Game }) {
  const away = getTeam(game.away.teamId);
  const home = getTeam(game.home.teamId);
  const s = game.situation;

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/game/[id]', params: { id: game.id } })}
      accessibilityRole="button"
      accessibilityLabel={`Open game center for ${away.name} at ${home.name}`}
      className="mx-5 overflow-hidden rounded-3xl border border-line active:opacity-90"
    >
      <LinearGradient
        colors={[withAlpha(away.primary, 0.55), colors.surface, withAlpha(home.primary, 0.55)]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ padding: 20 }}
      >
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            {game.status === 'live' ? <LiveBadge /> : null}
            <Text className="text-xs font-bold text-ink">{gameStatusLabel(game)}</Text>
          </View>
          <MockBadge />
        </View>

        <View className="mt-4 flex-row items-start">
          <Side teamId={away.id} score={game.away.score} hasBall={s?.possessionTeamId === away.id} />
          <View className="items-center pt-5">
            <Text className="text-xs font-semibold text-mute">@</Text>
          </View>
          <Side teamId={home.id} score={game.home.score} hasBall={s?.possessionTeamId === home.id} />
        </View>

        {s ? (
          <View className="mt-1 self-center rounded-full bg-bg/60 px-3 py-1.5">
            <Text className="text-xs font-semibold text-ink">
              {getTeam(s.possessionTeamId).abbr} · {downAndDistance(s.down, s.distance)} at {s.ballOn}
            </Text>
          </View>
        ) : null}

        <View className="mt-4">
          <WinProbabilityBar game={game} />
        </View>

        <View className="mt-4 flex-row items-center justify-between rounded-2xl bg-bg/50 px-4 py-3">
          <View className="flex-row items-center gap-2">
            <Ionicons name="sparkles" size={14} color={colors.ai} />
            <Text className="text-[13px] font-semibold text-ink">Open game center</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.sub} />
        </View>
      </LinearGradient>
    </Pressable>
  );
}
