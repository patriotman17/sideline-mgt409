import { Pressable, Text, View } from 'react-native';

interface SectionHeaderProps {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  accessory?: React.ReactNode;
}

export function SectionHeader({ title, actionLabel, onAction, accessory }: SectionHeaderProps) {
  return (
    <View className="mb-3 mt-7 flex-row items-center justify-between px-5">
      <View className="flex-row items-center gap-2">
        <Text className="text-lg font-bold text-ink">{title}</Text>
        {accessory}
      </View>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} hitSlop={10} accessibilityRole="button">
          <Text className="text-sm font-semibold text-volt">{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
