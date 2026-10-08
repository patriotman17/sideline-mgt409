import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';

import { ProgressBar } from '@/components/ui';
import { colors } from '@/theme';
import type { Insight, InsightKind } from '@/types';

const KIND_META: Record<InsightKind, { label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  momentum: { label: 'Momentum', icon: 'trending-up' },
  matchup: { label: 'Matchup', icon: 'git-compare' },
  trend: { label: 'Trend', icon: 'analytics' },
  stat: { label: 'Key stat', icon: 'stats-chart' },
};

/** AI-generated insight. Visual language (violet) is reserved for AI content. */
export function InsightCard({ insight, compact = false }: { insight: Insight; compact?: boolean }) {
  const meta = KIND_META[insight.kind];
  return (
    <View className={`rounded-2xl border border-ai/30 bg-aiDim/60 p-4 ${compact ? 'w-[280px]' : ''}`}>
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-1.5">
          <Ionicons name="sparkles" size={13} color={colors.ai} />
          <Text className="text-[11px] font-bold uppercase tracking-widest text-ai">{meta.label}</Text>
        </View>
        <Text className="text-[11px] text-mute">{insight.generatedAgo}</Text>
      </View>
      <Text className="mt-2 text-[15px] font-bold text-ink">{insight.title}</Text>
      <Text className="mt-1 text-[13px] leading-5 text-sub" numberOfLines={compact ? 3 : undefined}>
        {insight.body}
      </Text>
      <View className="mt-3 flex-row items-center gap-3">
        <View className="flex-1">
          <ProgressBar value={insight.confidence} color={colors.ai} height={4} />
        </View>
        <Text className="text-[11px] font-semibold text-sub">{insight.confidence}% confidence</Text>
      </View>
    </View>
  );
}
