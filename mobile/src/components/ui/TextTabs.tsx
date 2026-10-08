import { Pressable, Text, View } from 'react-native';

import { useHaptics } from '@/lib/haptics';

export interface TextTab<T extends string> {
  value: T;
  label: string;
  badge?: number;
}

interface TextTabsProps<T extends string> {
  tabs: TextTab<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

/** Text tabs with a lime underline on the active tab — no pills or boxes. */
export function TextTabs<T extends string>({ tabs, value, onChange, className = '' }: TextTabsProps<T>) {
  const { tap } = useHaptics();
  return (
    <View className={`flex-row border-b border-white/10 ${className}`} accessibilityRole="tablist">
      {tabs.map((t) => {
        const active = t.value === value;
        return (
          <Pressable
            key={t.value}
            onPress={() => {
              if (!active) tap();
              onChange(t.value);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            className="flex-1 items-center pt-2"
          >
            <View className="flex-row items-center gap-1.5 pb-2.5">
              <Text className={`text-[15px] ${active ? 'font-semibold text-ink' : 'font-medium text-mute'}`}>{t.label}</Text>
              {t.badge ? (
                <View className="min-w-[17px] items-center rounded-full bg-volt px-1">
                  <Text className="text-[10px] font-bold text-bg">{t.badge}</Text>
                </View>
              ) : null}
            </View>
            <View className={`h-[2px] w-10 rounded-full ${active ? 'bg-volt' : 'bg-transparent'}`} />
          </Pressable>
        );
      })}
    </View>
  );
}
