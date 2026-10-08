import { Pressable, Text, View } from 'react-native';

import { useHaptics } from '@/lib/haptics';

export interface Segment<T extends string> {
  value: T;
  label: string;
  badge?: number;
}

interface SegmentedControlProps<T extends string> {
  segments: Segment<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

export function SegmentedControl<T extends string>({ segments, value, onChange, className = '' }: SegmentedControlProps<T>) {
  const { tap } = useHaptics();
  return (
    <View className={`flex-row rounded-xl border border-line bg-surface p-1 ${className}`} accessibilityRole="tablist">
      {segments.map((s) => {
        const active = s.value === value;
        return (
          <Pressable
            key={s.value}
            onPress={() => {
              if (!active) tap();
              onChange(s.value);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-lg py-2 ${active ? 'bg-raised' : ''}`}
          >
            <Text className={`text-[13px] font-semibold ${active ? 'text-ink' : 'text-mute'}`}>{s.label}</Text>
            {s.badge ? (
              <View className="min-w-[18px] items-center rounded-full bg-live px-1">
                <Text className="text-[10px] font-bold text-white">{s.badge}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}
