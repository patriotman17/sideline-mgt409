import { Text, View } from 'react-native';

import { TeamBadge } from '@/components/game';
import { Card } from '@/components/ui';
import { getTeam } from '@/services';
import type { Division } from '@/types';

export function StandingsTable({ division, highlightTeamIds = [] }: { division: Division; highlightTeamIds?: string[] }) {
  return (
    <Card className="mx-5 mb-3 px-4 py-3">
      <View className="mb-1 flex-row items-center">
        <Text className="flex-1 text-sm font-bold text-ink">{division.name}</Text>
        <Text className="w-10 text-center text-[11px] font-semibold text-mute">W-L</Text>
        <Text className="w-12 text-center text-[11px] font-semibold text-mute">PCT</Text>
        <Text className="w-10 text-right text-[11px] font-semibold text-mute">STRK</Text>
      </View>
      {division.rows.map((r, i) => {
        const team = getTeam(r.teamId);
        const games = r.wins + r.losses + r.ties;
        const pct = games ? ((r.wins + r.ties / 2) / games).toFixed(3).replace(/^0/, '') : '.000';
        const mine = highlightTeamIds.includes(r.teamId);
        return (
          <View key={r.teamId} className={`flex-row items-center py-2 ${i ? 'border-t border-line' : ''}`}>
            <Text className="w-4 text-xs font-semibold text-mute">{i + 1}</Text>
            <TeamBadge teamId={r.teamId} size={24} />
            <Text className={`ml-2.5 flex-1 text-sm font-semibold ${mine ? 'text-volt' : 'text-ink'}`}>{team.name}</Text>
            <Text className="w-10 text-center text-[13px] tabular-nums text-sub">
              {r.wins}-{r.losses}
            </Text>
            <Text className="w-12 text-center text-[13px] tabular-nums text-sub">{pct}</Text>
            <Text className={`w-10 text-right text-[13px] font-semibold ${r.streak.startsWith('W') ? 'text-win' : 'text-loss'}`}>
              {r.streak}
            </Text>
          </View>
        );
      })}
    </Card>
  );
}
