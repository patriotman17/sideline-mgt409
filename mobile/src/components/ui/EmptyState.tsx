import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';

import { colors } from '@/theme';

interface EmptyStateProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body?: string;
  children?: React.ReactNode;
}

export function EmptyState({ icon, title, body, children }: EmptyStateProps) {
  return (
    <View className="items-center px-8 py-12">
      <View className="mb-4 h-14 w-14 items-center justify-center rounded-full bg-elevated">
        <Ionicons name={icon} size={26} color={colors.mute} />
      </View>
      <Text className="text-center text-base font-bold text-ink">{title}</Text>
      {body ? <Text className="mt-1.5 text-center text-sm leading-5 text-sub">{body}</Text> : null}
      {children ? <View className="mt-5">{children}</View> : null}
    </View>
  );
}
