import { useEffect, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Animated, Easing, Text, View } from 'react-native';

import { USE_NATIVE_DRIVER } from '@/lib/animation';
import { colors } from '@/theme';

/** Shown while a returning user's session and profile load (after the native splash). */
export function LaunchScreen({ message = 'Signing you in…' }: { message?: string }) {
  const [pulse] = useState(() => new Animated.Value(0.35));

  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduce) => {
        if (reduce) return pulse.setValue(1);
        loop = Animated.loop(
          Animated.sequence([
            Animated.timing(pulse, {
              toValue: 1,
              duration: 900,
              easing: Easing.inOut(Easing.quad),
              useNativeDriver: USE_NATIVE_DRIVER,
            }),
            Animated.timing(pulse, {
              toValue: 0.35,
              duration: 900,
              easing: Easing.inOut(Easing.quad),
              useNativeDriver: USE_NATIVE_DRIVER,
            }),
          ]),
        );
        loop.start();
      });
    return () => loop?.stop();
  }, [pulse]);

  return (
    <View
      className="flex-1 items-center justify-center bg-bg"
      accessibilityLiveRegion="polite"
      accessibilityLabel={message}
    >
      <Animated.Text
        className="font-score-bold text-[44px] uppercase tracking-[-0.5px] text-ink"
        style={{ opacity: pulse }}
      >
        Sideline
      </Animated.Text>
      <View className="mt-6 flex-row items-center gap-2">
        <ActivityIndicator size="small" color={colors.sub} />
        <Text className="text-[14px] text-sub">{message}</Text>
      </View>
    </View>
  );
}
