import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router/js-tabs';
import { StyleSheet, View, type ColorValue, type ViewStyle } from 'react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AskFab } from '@/components/assistant';
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

/** Frosted glass, close to the iOS tab bar: content scrolls underneath, blurred. */
const glass = {
  backgroundColor: 'rgba(22,22,24,0.62)',
  backdropFilter: 'saturate(180%) blur(22px)',
  WebkitBackdropFilter: 'saturate(180%) blur(22px)',
} as unknown as ViewStyle;

function GlassBackground() {
  return <View style={[StyleSheet.absoluteFill, glass]} />;
}

export default function WebTabsLayout() {
  const liveCount = useWeek().snapshot?.live_games ?? 0;
  // Home-screen (standalone) mode on iPhone: clear the home indicator.
  const bottom = useSafeAreaInsets().bottom;
  return (
    <View className="flex-1">
      <Tabs
        screenOptions={{
          headerShown: false,
          animation: 'fade', // quick cross-fade between tabs
          tabBarBackground: GlassBackground,
          tabBarActiveTintColor: colors.volt,
          tabBarInactiveTintColor: colors.mute,
          tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
          // Floats over the content (screens keep pb-28, as for the native bar).
          tabBarStyle: {
            position: 'absolute',
            backgroundColor: 'transparent',
            borderTopColor: 'rgba(255,255,255,0.08)',
            height: 64 + bottom,
            paddingTop: 6,
            paddingBottom: 8 + bottom,
          },
          tabBarBadgeStyle: { backgroundColor: colors.live, fontSize: 10, fontWeight: '700' },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Scores',
            tabBarIcon: tabIcon('american-football-outline', 'american-football'),
            tabBarBadge: liveCount || undefined,
          }}
        />
        <Tabs.Screen
          name="picks"
          options={{ title: 'Picks', tabBarIcon: tabIcon('stats-chart-outline', 'stats-chart') }}
        />
        <Tabs.Screen
          name="party"
          options={{ title: 'Party', tabBarIcon: tabIcon('people-outline', 'people') }}
        />
        <Tabs.Screen
          name="discover"
          options={{ title: 'Discover', tabBarIcon: tabIcon('compass-outline', 'compass') }}
        />
        <Tabs.Screen
          name="profile"
          options={{ title: 'You', tabBarIcon: tabIcon('person-circle-outline', 'person-circle') }}
        />
      </Tabs>
      <AskFab />
    </View>
  );
}
