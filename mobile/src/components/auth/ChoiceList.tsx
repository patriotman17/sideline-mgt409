import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

import { useHaptics } from '@/lib/haptics';
import { colors } from '@/theme';

interface Option<T extends string> {
  value: T;
  label: string;
  hint?: string;
}

interface Props<T extends string> {
  label?: string;
  options: readonly Option<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Horizontal pills (compact, for settings) instead of full-width rows. */
  compact?: boolean;
}

/** Single-choice list used for knowledge level and AI explanation style. */
export function ChoiceList<T extends string>({
  label,
  options,
  value,
  onChange,
  compact,
}: Props<T>) {
  const { tap } = useHaptics();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label}>
      {label ? <Text className="mb-2 text-[13px] font-semibold text-sub">{label}</Text> : null}
      <View className={compact ? 'flex-row gap-2' : 'gap-2'}>
        {options.map((o) => {
          const selected = o.value === value;
          return (
            <Pressable
              key={o.value}
              onPress={() => {
                tap();
                onChange(o.value);
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={o.hint ? `${o.label}. ${o.hint}` : o.label}
              className={`active:opacity-80 ${
                compact
                  ? `flex-1 items-center rounded-full px-3 py-2 ${selected ? 'bg-volt' : 'bg-white/10'}`
                  : `flex-row items-center rounded-2xl px-4 py-3.5 ${selected ? 'border border-volt bg-volt/10' : 'border border-transparent bg-surface'}`
              }`}
            >
              {compact ? (
                <Text className={`text-[14px] font-semibold ${selected ? 'text-bg' : 'text-ink'}`}>
                  {o.label}
                </Text>
              ) : (
                <>
                  <View className="flex-1">
                    <Text className="text-[16px] font-semibold text-ink">{o.label}</Text>
                    {o.hint ? <Text className="mt-0.5 text-[13px] text-sub">{o.hint}</Text> : null}
                  </View>
                  <Ionicons
                    name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                    size={22}
                    color={selected ? colors.volt : colors.mute}
                  />
                </>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
