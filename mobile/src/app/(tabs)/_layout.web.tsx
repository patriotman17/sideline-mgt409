import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router/js-tabs';
import type { ColorValue } from 'react-native';

import { useWeek } from '@/state/WeekContext';
import { colors } from '@/theme';

/** Web fallback: native tabs have no system tab bar on web, so use a styled JS tab bar. */
type IconName = keyof typeof Ionicons.glyphMap;

function tabIcon(name: IconName, activeName: IconName) {
  function TabIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
    return <Ionicons name={focused ? activeName : name} size={22} color={color} />;
  }
  return TabIcon;
}

export default function WebTabsLayout() {
  const liveCount = useWeek().snapshot?.live_games ?? 0;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.volt,
        tabBarInactiveTintColor: colors.mute,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarStyle: { backgroundColor: 'rgba(28,28,30,0.92)', borderTopColor: colors.line, height: 64, paddingTop: 6, paddingBottom: 8 },
        tabBarBadgeStyle: { backgroundColor: colors.live, fontSize: 10, fontWeight: '700' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Scores', tabBarIcon: tabIcon('american-football-outline', 'american-football'), tabBarBadge: liveCount || undefined }}
      />
      <Tabs.Screen name="picks" options={{ title: 'Picks', tabBarIcon: tabIcon('stats-chart-outline', 'stats-chart') }} />
      <Tabs.Screen name="party" options={{ title: 'Party', tabBarIcon: tabIcon('people-outline', 'people') }} />
      <Tabs.Screen name="discover" options={{ title: 'Discover', tabBarIcon: tabIcon('compass-outline', 'compass') }} />
      <Tabs.Screen name="profile" options={{ title: 'You', tabBarIcon: tabIcon('person-circle-outline', 'person-circle') }} />
    </Tabs>
  );
}
