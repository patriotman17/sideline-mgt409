import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';

import { TeamBadge } from '@/components/game';
import { getTeam } from '@/services';
import { colors } from '@/theme';
import type { TrendingPlayer } from '@/types';

export function TrendingPlayerCard({ player }: { player: TrendingPlayer }) {
  const up = player.trend === 'up';
  return (
    <View className="w-[200px] rounded-2xl border border-line bg-surface p-4">
      <View className="flex-row items-center justify-between">
        <TeamBadge teamId={player.teamId} size={36} />
        <View className={`flex-row items-center gap-1 rounded-full px-2 py-0.5 ${up ? 'bg-win/15' : 'bg-loss/15'}`}>
          <Ionicons name={up ? 'trending-up' : 'trending-down'} size={12} color={up ? colors.win : colors.loss} />
          <Text className={`text-[11px] font-bold ${up ? 'text-win' : 'text-loss'}`}>{player.change}</Text>
        </View>
      </View>
      <Text className="mt-3 text-[15px] font-bold text-ink">{player.name}</Text>
      <Text className="text-xs text-mute">
        {player.position} · {getTeam(player.teamId).abbr}
      </Text>
      <Text className="mt-2 text-xs font-semibold text-sub">{player.statLine}</Text>
    </View>
  );
}
