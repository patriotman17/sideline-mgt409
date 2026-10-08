import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { TeamBadge } from '@/components/game';
import { formatGameDate, getTeam, replayTeamId, type ReplayGameSummary } from '@/services';
import { colors, withAlpha } from '@/theme';

/** A historical game available for replay. Shows the matchup only — never the result. */
export function ReplayRow({ game }: { game: ReplayGameSummary }) {
  const away = getTeam(replayTeamId(game.away.abbr));
  const home = getTeam(replayTeamId(game.home.abbr));
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/replay/[gameId]', params: { gameId: game.game_id } })}
      accessibilityRole="button"
      accessibilityLabel={`Replay ${game.title}, ${game.away.name ?? game.away.abbr} at ${game.home.name ?? game.home.abbr}`}
      className="mx-3 mb-2 overflow-hidden rounded-2xl active:opacity-80"
    >
      <LinearGradient
        colors={[withAlpha(away.primary, 0.55), colors.surface, colors.surface, withAlpha(home.primary, 0.55)]}
        locations={[0, 0.36, 0.64, 1]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />
      <View className="flex-row items-center px-3 py-3">
        <View className="w-[64px] items-center">
          <TeamBadge teamId={replayTeamId(game.away.abbr)} size={34} />
          <Text className="mt-1 text-[12px] font-medium text-sub">{game.away.name ?? game.away.abbr}</Text>
        </View>
        <View className="flex-1 items-center">
          <Text className="text-[11px] font-medium text-mute">{formatGameDate(game.game_date)}</Text>
          <Text className="mt-0.5 text-center text-[15px] font-semibold text-ink" numberOfLines={1}>
            {game.title}
          </Text>
          <View className="mt-1.5 flex-row items-center gap-1 rounded-full bg-volt px-2.5 py-1">
            <Ionicons name="play" size={10} color={colors.bg} />
            <Text className="text-[11px] font-bold text-bg">Replay</Text>
          </View>
        </View>
        <View className="w-[64px] items-center">
          <TeamBadge teamId={replayTeamId(game.home.abbr)} size={34} />
          <Text className="mt-1 text-[12px] font-medium text-sub">{game.home.name ?? game.home.abbr}</Text>
        </View>
      </View>
    </Pressable>
  );
}
