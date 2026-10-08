import { Pressable, Text, View } from 'react-native';

import { useHaptics } from '@/lib/haptics';

export type ScoreDay = 'yesterday' | 'today' | 'upcoming';

const DAYS: { value: ScoreDay; label: string }[] = [
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'today', label: 'Today' },
  { value: 'upcoming', label: 'Upcoming' },
];

/** Apple Sports–style text tabs: weight and color carry the selection, no pills. */
export function DayTabs({ value, onChange }: { value: ScoreDay; onChange: (day: ScoreDay) => void }) {
  const { tap } = useHaptics();
  return (
    <View className="flex-row justify-around px-6" accessibilityRole="tablist">
      {DAYS.map((d) => {
        const active = d.value === value;
        return (
          <Pressable
            key={d.value}
            onPress={() => {
              if (!active) tap();
              onChange(d.value);
            }}
            hitSlop={10}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            className="px-3 py-2"
          >
            <Text className={`text-[16px] ${active ? 'font-semibold text-ink' : 'font-medium text-mute'}`}>{d.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
