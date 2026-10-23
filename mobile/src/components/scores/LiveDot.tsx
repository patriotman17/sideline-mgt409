import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated } from 'react-native';

import { USE_NATIVE_DRIVER } from '@/lib/animation';

/** Small pulsing red dot that marks a game as live. */
export function LiveDot({ size = 7 }: { size?: number }) {
  const [pulse] = useState(() => new Animated.Value(1));

  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    let alive = true;
    // Reduce Motion: a steady dot instead of an endless pulse (HIG: accessibility › Motion).
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduce) => {
        if (!alive || reduce) return;
        loop = Animated.loop(
          Animated.sequence([
            Animated.timing(pulse, { toValue: 0.3, duration: 800, useNativeDriver: USE_NATIVE_DRIVER }),
            Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: USE_NATIVE_DRIVER }),
          ]),
        );
        loop.start();
      });
    return () => {
      alive = false;
      loop?.stop();
    };
  }, [pulse]);

  return (
    <Animated.View
      accessibilityLabel="Live"
      className="rounded-full bg-live"
      style={{ width: size, height: size, opacity: pulse }}
    />
  );
}
