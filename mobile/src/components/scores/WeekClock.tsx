import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { useHaptics } from '@/lib/haptics';
import type { WeekSnapshot } from '@/services/week';
import { colors } from '@/theme';
import { LiveDot } from './LiveDot';

interface Props {
  week: WeekSnapshot;
  busy: boolean;
  onPlay: () => void;
  onPause: () => void;
  onSpeed: (speed: number) => void;
  onJump: (preset: string) => void;
}

const speedLabel = (s: number) => `${s}×`;

/** The shared week clock: simulated date/time, play/pause, speed, and jump-to TV windows. */
export function WeekClock({ week, busy, onPlay, onPause, onSpeed, onJump }: Props) {
  const { tap } = useHaptics();
  const playing = week.status === 'playing';
  const [day, time] = week.sim_time_label.split(' · ');

  return (
    <View className="mx-4 mt-2 rounded-2xl bg-surface p-4">
      <View className="flex-row items-center justify-between">
        <Text className="text-[12px] font-semibold uppercase tracking-[1.5px] text-sub">
          {week.title}
        </Text>
        {week.live_games ? (
          <View className="flex-row items-center gap-1.5">
            <LiveDot />
            <Text className="text-[12px] font-semibold text-ink">{week.live_games} live</Text>
          </View>
        ) : null}
      </View>

      <View className="mt-2 flex-row items-center">
        <View className="flex-1">
          <Text className="text-[14px] text-sub">{day}</Text>
          <Text
            className="font-score-bold text-[34px] leading-[38px] text-ink"
            accessibilityLiveRegion="polite"
          >
            {time}
          </Text>
        </View>
        <Pressable
          onPress={() => {
            tap();
            if (playing) onPause();
            else onPlay();
          }}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={playing ? 'Pause the week' : 'Play the week'}
          className="h-12 w-12 items-center justify-center rounded-full bg-volt active:opacity-80"
        >
          <Ionicons
            name={playing ? 'pause' : 'play'}
            size={22}
            color={colors.bg}
            style={playing ? undefined : { marginLeft: 2 }}
          />
        </Pressable>
      </View>

      <View
        className="mt-3 flex-row gap-2"
        accessibilityRole="radiogroup"
        accessibilityLabel="Clock speed"
      >
        {week.speeds.map((s) => {
          const active = week.speed === s;
          return (
            <Pressable
              key={s}
              onPress={() => onSpeed(s)}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${s} times speed`}
              className={`rounded-full px-3 py-1.5 ${active ? 'bg-ink' : 'bg-white/10'}`}
            >
              <Text className={`font-cond text-[14px] ${active ? 'text-bg' : 'text-ink'}`}>
                {speedLabel(s)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text className="mb-2 mt-4 text-[12px] font-semibold text-sub">Jump to</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2"
      >
        {week.presets.map((p) => (
          <Pressable
            key={p.key}
            onPress={() => onJump(p.key)}
            accessibilityRole="button"
            accessibilityLabel={`Jump to ${p.label}`}
            className="rounded-full bg-white/10 px-3.5 py-2 active:opacity-70"
          >
            <Text className="text-[13px] font-semibold text-ink">{p.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <Text className="mt-3 text-[11px] leading-4 text-mute">
        The real {week.title} on one clock: games go live and score exactly as they did.{' '}
        {speedLabel(60)} = one game hour per minute.
      </Text>
    </View>
  );
}
