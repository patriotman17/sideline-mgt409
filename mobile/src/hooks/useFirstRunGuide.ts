import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useEffect } from 'react';

import { HOW_TO_SEEN_KEY, shouldAutoShowHowTo } from '@/lib/howTo';

/** Opens the "How Sideline works" guide the first time this device reaches Scores. */
export function useFirstRunGuide() {
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(HOW_TO_SEEN_KEY).then(
      (v) => {
        if (alive && shouldAutoShowHowTo(v)) router.push('/how-to');
      },
      () => {}, // storage unavailable: never block the app on the guide
    );
    return () => {
      alive = false;
    };
  }, []);
}

/** Remember that the guide was seen, so it doesn't open again on this device. */
export function markHowToSeen() {
  AsyncStorage.setItem(HOW_TO_SEEN_KEY, '1').catch(() => {});
}
