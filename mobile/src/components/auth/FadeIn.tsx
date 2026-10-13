import { useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, View } from 'react-native';

import { USE_NATIVE_DRIVER } from '@/lib/animation';

interface Props {
  children: ReactNode;
  /** Change this to replay the entrance (e.g. the onboarding step number). */
  motionKey?: string | number;
  delay?: number;
  /** Rise distance in points. */
  distance?: number;
  className?: string;
}

/** Subtle entrance: fade + short rise. Skipped when the user has Reduce Motion on. */
export function FadeIn({ children, motionKey, delay = 0, distance = 10, className }: Props) {
  const [progress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    let alive = true;
    progress.setValue(0);
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduce) => {
        if (!alive) return;
        if (reduce) {
          progress.setValue(1);
          return;
        }
        Animated.timing(progress, {
          toValue: 1,
          duration: 320,
          delay,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: USE_NATIVE_DRIVER,
        }).start();
      });
    return () => {
      alive = false;
    };
  }, [progress, motionKey, delay]);

  return (
    <Animated.View
      style={{
        opacity: progress,
        transform: [
          { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] }) },
        ],
      }}
    >
      {/* NativeWind styles plain Views; Animated.View only carries the motion. */}
      <View className={className}>{children}</View>
    </Animated.View>
  );
}
