import { Text, View } from 'react-native';

import { downAndDistance } from '@/lib/format';
import { getTeam } from '@/services';
import { colors } from '@/theme';
import type { Game } from '@/types';

/**
 * Mini field showing ball spot and line to gain. Field position is measured
 * 0–100 from the away team's end zone; the away team drives toward 100.
 */
export function FieldTracker({ game }: { game: Game }) {
  const s = game.situation;
  if (!s) return null;
  const away = getTeam(game.away.teamId);
  const home = getTeam(game.home.teamId);
  const offense = getTeam(s.possessionTeamId);
  const towardHome = s.possessionTeamId === game.away.teamId;
  const lineToGain = Math.max(0, Math.min(100, s.fieldPosition + (towardHome ? s.distance : -s.distance)));

  return (
    <View>
      <View className="mb-2 flex-row items-center justify-between">
        <Text className="text-[15px] font-semibold text-ink">
          {downAndDistance(s.down, s.distance)} <Text className="font-normal text-sub">at {s.ballOn}</Text>
        </Text>
        <View className="flex-row items-center gap-1.5">
          {s.redZone ? (
            <View className="rounded bg-liveDim px-1.5 py-0.5">
              <Text className="text-[10px] font-extrabold text-live">RED ZONE</Text>
            </View>
          ) : null}
          <Text className="text-xs font-semibold text-sub">{offense.abbr} ball {towardHome ? '→' : '←'}</Text>
        </View>
      </View>
      <View className="h-12 flex-row overflow-hidden rounded-xl" style={{ backgroundColor: '#14361F' }}>
        <View className="w-[8%] items-center justify-center" style={{ backgroundColor: away.primary }}>
          <Text className="text-[9px] font-black text-white" style={{ transform: [{ rotate: '-90deg' }] }}>
            {away.abbr}
          </Text>
        </View>
        <View className="flex-1 flex-row">
          {Array.from({ length: 10 }).map((_, i) => (
            <View key={i} className="flex-1" style={{ borderLeftWidth: i === 0 ? 0 : 1, borderColor: 'rgba(255,255,255,0.18)' }} />
          ))}
          {/* Line to gain */}
          <View className="absolute bottom-0 top-0 w-[2px]" style={{ left: `${lineToGain}%`, backgroundColor: colors.gold }} />
          {/* Line of scrimmage */}
          <View className="absolute bottom-0 top-0 w-[2px]" style={{ left: `${s.fieldPosition}%`, backgroundColor: '#5B8CFF' }} />
          {/* Ball */}
          <View
            className="absolute h-3 w-5 rounded-full border border-white/70"
            style={{ left: `${s.fieldPosition}%`, top: 18, marginLeft: -10, backgroundColor: '#8B4A22' }}
          />
        </View>
        <View className="w-[8%] items-center justify-center" style={{ backgroundColor: home.primary }}>
          <Text className="text-[9px] font-black text-white" style={{ transform: [{ rotate: '90deg' }] }}>
            {home.abbr}
          </Text>
        </View>
      </View>
    </View>
  );
}
