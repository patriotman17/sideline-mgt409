import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

interface ScreenHeaderProps {
  title: string;
  eyebrow?: string;
  right?: ReactNode;
}

export function ScreenHeader({ title, eyebrow, right }: ScreenHeaderProps) {
  return (
    <View className="flex-row items-end justify-between px-5 pb-4 pt-2">
      <View className="flex-1">
        {eyebrow ? (
          <Text className="mb-1 text-xs font-semibold uppercase tracking-[2px] text-mute">{eyebrow}</Text>
        ) : null}
        <Text className="text-[32px] font-extrabold tracking-tight text-ink">{title}</Text>
      </View>
      {right}
    </View>
  );
}
