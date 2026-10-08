import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';

import { colors } from '@/theme';
import type { Insight, InsightKind } from '@/types';

const KIND_LABEL: Record<InsightKind, string> = {
  momentum: 'Momentum',
  matchup: 'Matchup',
  trend: 'Trend',
  stat: 'Key stat',
};

/** AI-generated insight. AI content is marked by the ✦ sparkle and "Sideline AI" label. */
export function InsightCard({ insight, compact = false, children }: { insight: Insight; compact?: boolean; children?: React.ReactNode }) {
  return (
    <View className={`rounded-2xl bg-white/10 p-4 ${compact ? 'w-[280px]' : ''}`}>
      <View className="flex-row items-center gap-1.5">
        <Ionicons name="sparkles" size={12} color={colors.volt} />
        <Text className="text-[11px] font-semibold tracking-[1px] text-sub">SIDELINE AI · {KIND_LABEL[insight.kind].toUpperCase()}</Text>
      </View>
      <Text className="mt-2 text-[17px] font-semibold leading-[22px] text-ink">{insight.title}</Text>
      <Text className="mt-1.5 text-[14px] leading-[20px] text-white/75" numberOfLines={compact ? 3 : undefined}>
        {insight.body}
      </Text>
      <Text className="mt-2.5 text-[11px] text-mute">
        {insight.confidence}% confidence · {insight.generatedAgo}
      </Text>
      {children}
    </View>
  );
}
