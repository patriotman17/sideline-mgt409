import { Text, View } from 'react-native';

import { getTeam } from '@/services';
import type { Game } from '@/types';
import { TeamBadge } from './TeamBadge';

/** Quarter-by-quarter scoring table. */
export function Linescore({ game }: { game: Game }) {
  const ls = game.linescore;
  if (!ls) return null;
  const periods = ls.away.length > 4 ? ['1', '2', '3', '4', 'OT'] : ['1', '2', '3', '4'];
  const rows = [
    { teamId: game.away.teamId, values: ls.away, total: game.away.score },
    { teamId: game.home.teamId, values: ls.home, total: game.home.score },
  ];
  return (
    <View className="rounded-2xl bg-black/30 px-4 py-3">
      <View className="flex-row">
        <View className="flex-1" />
        {periods.map((p) => (
          <Text key={p} className="w-8 text-center text-[12px] font-medium text-mute">
            {p}
          </Text>
        ))}
        <Text className="w-10 text-right text-[12px] font-semibold text-sub">T</Text>
      </View>
      {rows.map((r) => (
        <View key={r.teamId} className="mt-2 flex-row items-center">
          <View className="flex-1 flex-row items-center gap-2">
            <TeamBadge teamId={r.teamId} size={20} />
            <Text className="text-[14px] font-semibold text-ink">{getTeam(r.teamId).abbr}</Text>
          </View>
          {periods.map((p, i) => (
            <Text key={p} className="w-8 text-center font-cond text-[17px] text-sub">
              {r.values[i] ?? '–'}
            </Text>
          ))}
          <Text className="w-10 text-right font-score-bold text-[19px] text-ink">{r.total}</Text>
        </View>
      ))}
    </View>
  );
}
