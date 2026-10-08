import { Text, View } from 'react-native';

import { getTeam } from '@/services';
import { lighten } from '@/theme';
import type { Game } from '@/types';

/** Mirrored stat bars in team colors, Apple Sports–style. The leader's bar is brighter. */
export function TeamStats({ game }: { game: Game }) {
  const stats = game.teamStats;
  if (!stats?.length) return null;
  const awayColor = lighten(getTeam(game.away.teamId).primary, 0.25);
  const homeColor = lighten(getTeam(game.home.teamId).primary, 0.25);

  return (
    <View className="rounded-2xl bg-white/10 px-4 pb-2 pt-3">
      <Text className="mb-1 text-center text-[15px] font-semibold text-ink">Team stats</Text>
      {stats.map((s) => {
        const max = Math.max(s.away, s.home, 1);
        const awayLeads = s.lowerIsBetter ? s.away < s.home : s.away > s.home;
        const homeLeads = s.lowerIsBetter ? s.home < s.away : s.home > s.away;
        return (
          <View key={s.label} className="py-2">
            <View className="flex-row items-end justify-between">
              <Text className={`font-score-bold text-[20px] ${awayLeads ? 'text-ink' : 'text-sub'}`}>{s.awayText ?? s.away}</Text>
              <Text className="text-[13px] text-sub">{s.label}</Text>
              <Text className={`font-score-bold text-[20px] ${homeLeads ? 'text-ink' : 'text-sub'}`}>{s.homeText ?? s.home}</Text>
            </View>
            <View className="mt-1.5 flex-row gap-1">
              <View className="flex-1 flex-row justify-end">
                <View className="h-1.5 rounded-full" style={{ width: `${(s.away / max) * 100}%`, backgroundColor: awayColor, opacity: awayLeads ? 1 : 0.45 }} />
              </View>
              <View className="flex-1 flex-row">
                <View className="h-1.5 rounded-full" style={{ width: `${(s.home / max) * 100}%`, backgroundColor: homeColor, opacity: homeLeads ? 1 : 0.45 }} />
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}
