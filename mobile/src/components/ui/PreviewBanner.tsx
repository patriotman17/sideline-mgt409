import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { colors } from '@/theme';

interface Props {
  title: string;
  body: string;
  action?: { label: string; onPress: () => void };
  children?: ReactNode;
}

/**
 * Marks a proof-of-concept screen: the design is real, the content is sample data, and the feature is on
 * the roadmap. One per screen, at the top, so nobody mistakes it for live data.
 */
export function PreviewBanner({ title, body, action, children }: Props) {
  return (
    <View
      className="mx-4 mb-2 mt-2 rounded-2xl border border-white/10 bg-white/5 p-4"
      accessibilityRole="summary"
      accessibilityLabel={`${title}. ${body}`}
    >
      <View className="flex-row items-center gap-1.5">
        <Ionicons name="flask-outline" size={13} color={colors.volt} />
        <Text className="text-[11px] font-bold uppercase tracking-[1.5px] text-volt">
          Preview · coming next
        </Text>
      </View>
      <Text className="mt-1.5 text-[15px] font-semibold text-ink">{title}</Text>
      <Text className="mt-1 text-[13px] leading-[18px] text-sub">{body}</Text>
      {action ? (
        <Pressable
          onPress={action.onPress}
          accessibilityRole="button"
          hitSlop={8}
          className="mt-2.5 self-start active:opacity-70"
        >
          <Text className="text-[13px] font-semibold text-volt">{action.label} →</Text>
        </Pressable>
      ) : null}
      {children}
    </View>
  );
}
