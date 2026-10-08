import { Text, View } from 'react-native';

import { getTeam } from '@/services';
import type { Game } from '@/types';

/** Two-tone bar showing each side's win probability. */
export function WinProbabilityBar({ game, showLabel = true }: { game: Game; showLabel?: boolean }) {
  const away = getTeam(game.away.teamId);
  const home = getTeam(game.home.teamId);
  const homePct = game.homeWinProbability;
  const awayPct = 100 - homePct;

  return (
    <View>
      {showLabel ? (
        <View className="mb-2 flex-row items-center justify-between">
          <Text className="text-xs font-bold text-ink">
            {away.abbr} <Text className="text-sub">{awayPct}%</Text>
          </Text>
          <Text className="text-[10px] font-semibold uppercase tracking-widest text-mute">Win probability</Text>
          <Text className="text-xs font-bold text-ink">
            <Text className="text-sub">{homePct}%</Text> {home.abbr}
          </Text>
        </View>
      ) : null}
      <View className="h-2 flex-row overflow-hidden rounded-full bg-raised">
        <View style={{ flex: awayPct, backgroundColor: away.primary }} />
        <View className="w-0.5 bg-bg" />
        <View style={{ flex: homePct, backgroundColor: home.primary }} />
      </View>
    </View>
  );
}
