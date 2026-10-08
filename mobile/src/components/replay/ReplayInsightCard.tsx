import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';

import type { ReplayInsight } from '@/services';
import { colors } from '@/theme';

const STATUS_NOTE: Partial<Record<ReplayInsight['explanation_status'], string>> = {
  not_configured: 'AI explanation unavailable (not configured)',
  budget_exceeded: 'AI explanation paused (daily budget reached)',
  rate_limited: 'AI explanation coming shortly',
  blocked: 'AI explanation unavailable',
  error: 'AI explanation failed',
  pending: 'Explanation appears when this moment is highlighted',
};

/** A deterministic game moment, optionally explained by Sideline AI. */
export function ReplayInsightCard({ insight }: { insight: ReplayInsight }) {
  const explained = !!insight.explanation;
  return (
    <View className="rounded-2xl bg-white/10 p-4">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-1.5">
          {explained ? <Ionicons name="sparkles" size={12} color={colors.volt} /> : <Ionicons name="flag" size={12} color={colors.sub} />}
          <Text className="text-[11px] font-semibold tracking-[1px] text-sub">
            {(explained ? 'SIDELINE AI · ' : '') + insight.kind.replace(/_/g, ' ').toUpperCase()}
          </Text>
        </View>
        <Text className="font-cond text-[13px] text-mute">
          {insight.period} {insight.clock ?? ''}
        </Text>
      </View>
      <Text className="mt-2 text-[16px] font-semibold leading-[21px] text-ink">{insight.headline}</Text>
      {explained ? (
        <Text className="mt-1.5 text-[14px] leading-[20px] text-white/75">{insight.explanation}</Text>
      ) : STATUS_NOTE[insight.explanation_status] && insight.importance >= 3 ? (
        <Text className="mt-1.5 text-[12px] text-mute">{STATUS_NOTE[insight.explanation_status]}</Text>
      ) : null}
      {typeof insight.facts.score === 'string' ? <Text className="mt-2 font-cond text-[14px] text-sub">{insight.facts.score}</Text> : null}
    </View>
  );
}
