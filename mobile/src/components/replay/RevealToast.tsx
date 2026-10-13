import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';

import type { Reveal } from '@/lib/moments';
import { colors } from '@/theme';

const STYLE = {
  correct: { icon: 'checkmark-circle', color: colors.win, bg: 'bg-win/15' },
  incorrect: { icon: 'close-circle', color: colors.loss, bg: 'bg-loss/15' },
  void: { icon: 'remove-circle-outline', color: colors.sub, bg: 'bg-white/10' },
} as const;

/** The instant result after the snap: ✓ +points or ✗, with what happened. */
export function RevealToast({ reveal }: { reveal: Reveal }) {
  const s = STYLE[reveal.kind];
  return (
    <View
      className={`mx-4 mt-3 flex-row items-center gap-3 rounded-2xl px-4 py-3 ${s.bg}`}
      accessibilityLiveRegion="polite"
      accessibilityLabel={`${reveal.title}. ${reveal.detail}`}
    >
      <Ionicons name={s.icon} size={26} color={s.color} />
      <View className="flex-1">
        <Text className="text-[16px] font-bold" style={{ color: s.color }}>
          {reveal.title}
        </Text>
        <Text className="text-[13px] leading-[18px] text-sub" numberOfLines={2}>
          {reveal.detail}
        </Text>
      </View>
    </View>
  );
}
