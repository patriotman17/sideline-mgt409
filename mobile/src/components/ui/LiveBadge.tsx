import { useEffect, useState } from 'react';
import { Animated, Text, View } from 'react-native';

import { USE_NATIVE_DRIVER } from '@/lib/animation';

/** Pulsing red "LIVE" indicator. */
export function LiveBadge({ compact = false }: { compact?: boolean }) {
  const [pulse] = useState(() => new Animated.Value(1));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.25, duration: 700, useNativeDriver: USE_NATIVE_DRIVER }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: USE_NATIVE_DRIVER }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <View className={`flex-row items-center gap-1.5 rounded-full bg-liveDim ${compact ? 'px-2 py-0.5' : 'px-2.5 py-1'}`}>
      <Animated.View className="h-1.5 w-1.5 rounded-full bg-live" style={{ opacity: pulse }} />
      <Text className="text-[11px] font-extrabold tracking-wider text-live">LIVE</Text>
    </View>
  );
}
