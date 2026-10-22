import { Text } from 'react-native';

import { formatUsage, type AiUsageData } from '@/lib/aiUsage';
import { useAppState } from '@/state/AppStore';

/** Shown under AI answers only when You → Developer → "Show AI usage" is on (off for normal use). */
export function AiUsage({ usage, status }: { usage: AiUsageData | undefined; status?: string }) {
  const { settings } = useAppState();
  if (!settings.showAiUsage || !usage) return null;
  return (
    <Text
      className="mt-1 font-cond text-[12px] text-volt/80"
      accessibilityLabel="AI usage for this answer"
    >
      AI usage · {formatUsage(usage, status)}
    </Text>
  );
}
