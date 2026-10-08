import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Text, View } from 'react-native';

import { TeamBadge } from '@/components/game';
import { getTeam } from '@/services';
import { colors, withAlpha } from '@/theme';
import type { TrendingPlayer } from '@/types';

export function TrendingPlayerCard({ player }: { player: TrendingPlayer }) {
  const team = getTeam(player.teamId);
  const up = player.trend === 'up';
  return (
    <View className="w-[176px] overflow-hidden rounded-2xl bg-surface">
      <LinearGradient
        colors={[withAlpha(team.primary, 0.7), withAlpha(team.primary, 0)]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.4, y: 1 }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />
      <View className="p-4">
        <TeamBadge teamId={player.teamId} size={34} />
        <Text className="mt-3 text-[16px] font-semibold text-ink" numberOfLines={1}>
          {player.name}
        </Text>
        <Text className="text-[12px] text-sub">
          {player.position} · {team.abbr}
        </Text>
        <View className="mt-3 flex-row items-center gap-1">
          <Ionicons name={up ? 'arrow-up' : 'arrow-down'} size={13} color={up ? colors.win : colors.loss} />
          <Text className={`font-score-bold text-[20px] ${up ? 'text-win' : 'text-loss'}`}>{player.change}</Text>
        </View>
        <Text className="mt-0.5 font-cond text-[14px] text-sub" numberOfLines={1}>
          {player.statLine}
        </Text>
      </View>
    </View>
  );
}
