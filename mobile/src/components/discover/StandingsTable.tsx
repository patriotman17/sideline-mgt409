import { Text, View } from 'react-native';

import { TeamBadge } from '@/components/game';
import { getTeam } from '@/services';
import type { Division } from '@/types';

/** Apple Sports–style division table with condensed numerals. */
export function StandingsTable({ division, highlightTeamIds = [] }: { division: Division; highlightTeamIds?: string[] }) {
  return (
    <View className="mx-4 mb-3 rounded-2xl bg-surface px-4 py-3">
      <Text className="mb-2 text-center text-[15px] font-semibold text-ink">{division.name}</Text>
      <View className="mb-1 flex-row items-center">
        <Text className="flex-1 text-[12px] text-mute">Team</Text>
        <Text className="w-9 text-center text-[12px] text-mute">W</Text>
        <Text className="w-9 text-center text-[12px] text-mute">L</Text>
        <Text className="w-12 text-center text-[12px] text-mute">PCT</Text>
        <Text className="w-10 text-right text-[12px] text-mute">STRK</Text>
      </View>
      {division.rows.map((r) => {
        const team = getTeam(r.teamId);
        const games = r.wins + r.losses + r.ties;
        const pct = games ? ((r.wins + r.ties / 2) / games).toFixed(3).replace(/^0/, '') : '.000';
        const mine = highlightTeamIds.includes(r.teamId);
        return (
          <View key={r.teamId} className="flex-row items-center py-2">
            <View className="flex-1 flex-row items-center gap-2.5">
              <TeamBadge teamId={r.teamId} size={24} />
              <Text className={`text-[15px] ${mine ? 'font-semibold text-volt' : 'text-ink'}`}>{team.name}</Text>
            </View>
            <Text className="w-9 text-center font-cond text-[17px] text-ink">{r.wins}</Text>
            <Text className="w-9 text-center font-cond text-[17px] text-ink">{r.losses}</Text>
            <Text className="w-12 text-center font-cond text-[17px] text-sub">{pct}</Text>
            <Text className={`w-10 text-right font-cond text-[17px] ${r.streak.startsWith('W') ? 'text-win' : 'text-loss'}`}>{r.streak}</Text>
          </View>
        );
      })}
    </View>
  );
}
