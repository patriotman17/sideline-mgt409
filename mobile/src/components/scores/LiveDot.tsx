import { useEffect, useState } from 'react';
import { Animated } from 'react-native';

import { USE_NATIVE_DRIVER } from '@/lib/animation';

/** Small pulsing red dot that marks a game as live. */
export function LiveDot({ size = 7 }: { size?: number }) {
  const [pulse] = useState(() => new Animated.Value(1));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.3, duration: 800, useNativeDriver: USE_NATIVE_DRIVER }),
        Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: USE_NATIVE_DRIVER }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View
      accessibilityLabel="Live"
      className="rounded-full bg-live"
      style={{ width: size, height: size, opacity: pulse }}
    />
  );
}
