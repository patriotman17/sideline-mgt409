import * as Haptics from 'expo-haptics';
import { useCallback } from 'react';
import { Platform } from 'react-native';

import { useAppState } from '@/state/AppStore';

/** Haptic feedback that respects the user's setting and no-ops on web. */
export function useHaptics() {
  const { settings } = useAppState();
  const enabled = settings.haptics && Platform.OS !== 'web';

  const tap = useCallback(() => {
    if (enabled) Haptics.selectionAsync().catch(() => {});
  }, [enabled]);

  const impact = useCallback(() => {
    if (enabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  }, [enabled]);

  const success = useCallback(() => {
    if (enabled) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, [enabled]);

  return { tap, impact, success };
}
