import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';

import { EmptyState } from '@/components/ui';
import { getTeam } from '@/services';
import { colors } from '@/theme';
import type { TimelineEvent, TimelineEventType } from '@/types';

const EVENT_STYLE: Record<TimelineEventType, { icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  touchdown: { icon: 'american-football', color: colors.volt },
  field_goal: { icon: 'flag', color: colors.win },
  turnover: { icon: 'swap-horizontal', color: colors.live },
  big_play: { icon: 'flash', color: colors.gold },
  penalty: { icon: 'warning', color: '#FFB020' },
  kickoff: { icon: 'play', color: colors.sub },
  period: { icon: 'time', color: colors.sub },
};

export function Timeline({ events, awayId, homeId }: { events: TimelineEvent[]; awayId: string; homeId: string }) {
  if (!events.length) {
    return <EmptyState icon="time-outline" title="No plays yet" body="The play-by-play timeline fills in once the game kicks off." />;
  }
  const away = getTeam(awayId);
  const home = getTeam(homeId);

  return (
    <View className="px-5">
      {events.map((e, i) => {
        const style = EVENT_STYLE[e.type];
        const isScoring = e.type === 'touchdown' || e.type === 'field_goal';
        const last = i === events.length - 1;
        return (
          <View key={e.id} className="flex-row">
            <View className="mr-3.5 items-center">
              <View className="h-8 w-8 items-center justify-center rounded-full bg-white/10">
                <Ionicons name={style.icon} size={14} color={style.color} />
              </View>
              {!last ? <View className="w-px flex-1 bg-white/10" /> : null}
            </View>
            <View className={`flex-1 ${last ? '' : 'pb-5'}`}>
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center gap-2">
                  <Text className="text-[15px] font-semibold" style={{ color: isScoring ? colors.ink : style.color }}>
                    {e.title}
                  </Text>
                  {e.teamId ? (
                    <View className="rounded px-1.5 py-0.5" style={{ backgroundColor: getTeam(e.teamId).primary }}>
                      <Text className="text-[10px] font-extrabold text-white">{getTeam(e.teamId).abbr}</Text>
                    </View>
                  ) : null}
                </View>
                <Text className="font-cond text-[13px] text-mute">
                  {e.period} · {e.clock}
                </Text>
              </View>
              <Text className="mt-1 text-[14px] leading-5 text-white/75">{e.description}</Text>
              {isScoring ? (
                <Text className="mt-1.5 font-score-bold text-[16px] text-ink">
                  {away.abbr} {e.awayScore} – {e.homeScore} {home.abbr}
                </Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}
