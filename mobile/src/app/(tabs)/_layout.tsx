import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { countLiveGames } from '@/services';
import { colors } from '@/theme';

/**
 * Native platform tab bar: UITabBar on iOS (Liquid Glass on iOS 26+) and the
 * Material bottom navigation on Android. Web uses `_layout.web.tsx`.
 *
 * Automatic content insets are disabled so screens control their own safe-area
 * padding (see components/ui/Screen.tsx), keeping spacing identical across platforms.
 */
const LIVE_COUNT = countLiveGames();

export default function TabsLayout() {
  return (
    <NativeTabs tintColor={colors.volt} minimizeBehavior="onScrollDown">
      <NativeTabs.Trigger name="index" disableAutomaticContentInsets>
        <NativeTabs.Trigger.Icon sf="sportscourt.fill" md="scoreboard" />
        <NativeTabs.Trigger.Label>Scores</NativeTabs.Trigger.Label>
        {LIVE_COUNT ? <NativeTabs.Trigger.Badge>{String(LIVE_COUNT)}</NativeTabs.Trigger.Badge> : null}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="picks" disableAutomaticContentInsets>
        <NativeTabs.Trigger.Icon sf="chart.bar.fill" md="leaderboard" />
        <NativeTabs.Trigger.Label>Picks</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="party" disableAutomaticContentInsets>
        <NativeTabs.Trigger.Icon sf="person.2.fill" md="groups" />
        <NativeTabs.Trigger.Label>Party</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="discover" disableAutomaticContentInsets>
        <NativeTabs.Trigger.Icon sf="safari.fill" md="explore" />
        <NativeTabs.Trigger.Label>Discover</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile" disableAutomaticContentInsets>
        <NativeTabs.Trigger.Icon sf="person.crop.circle.fill" md="account_circle" />
        <NativeTabs.Trigger.Label>You</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
