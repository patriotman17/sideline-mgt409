import '../../global.css';

import {
  BarlowCondensed_600SemiBold,
  BarlowCondensed_700Bold,
  BarlowCondensed_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/barlow-condensed';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LaunchScreen } from '@/components/auth';
import { Button } from '@/components/ui';
import { AppStoreProvider } from '@/state/AppStore';
import { AuthProvider, useAuth } from '@/state/AuthContext';
import { usePersonalization } from '@/state/usePersonalization';
import { WeekProvider, useWeek } from '@/state/WeekContext';
import { colors } from '@/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.volt,
    background: colors.bg,
    card: colors.surface,
    text: colors.ink,
    border: colors.line,
    notification: colors.live,
  },
};

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    BarlowCondensed_600SemiBold,
    BarlowCondensed_700Bold,
    BarlowCondensed_800ExtraBold,
  });
  const fontsReady = fontsLoaded || !!fontError;

  if (!fontsReady) return null;

  return (
    <SafeAreaProvider>
      <ThemeProvider value={navTheme}>
        <AuthProvider>
          <WeekProvider>
            <PerUserAppStore>
              <StatusBar style="light" />
              <WeekPrimaryTeam />
              <RootNavigator />
            </PerUserAppStore>
          </WeekProvider>
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

/**
 * Route guards (client-side navigation only; the database enforces access with RLS):
 * signed out → welcome + account screens · new account → onboarding · guest or onboarded → the app.
 * Email links (/auth/callback, /reset-password) are reachable in every state.
 */
/**
 * The local app store (picks, chats, demo profile) is remounted whenever the signed-in user changes,
 * so nothing from one account or the demo leaks into the next session on a shared device.
 */
function PerUserAppStore({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  return <AppStoreProvider key={session?.user.id ?? 'guest'}>{children}</AppStoreProvider>;
}

/** Your #1 team's big moments stop the week clock too (account or demo profile). */
function WeekPrimaryTeam() {
  const { primaryTeamId } = usePersonalization();
  const { setPrimaryTeam } = useWeek();
  useEffect(() => {
    setPrimaryTeam(primaryTeamId);
  }, [primaryTeamId, setPrimaryTeam]);
  return null;
}

function RootNavigator() {
  const { status, session, profileError, retry, signOut } = useAuth();
  // Native splash until we know whether there's a stored session; then a branded loading screen
  // while a returning user's profile loads.
  const restoring = status === 'loading' && !session;

  useEffect(() => {
    if (!restoring) SplashScreen.hideAsync().catch(() => {});
  }, [restoring]);

  if (restoring) return null;
  if (status === 'loading' && profileError) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-bg px-8">
        <Text className="text-center text-[17px] font-semibold text-ink">{profileError}</Text>
        <Button label="Try again" onPress={retry} />
        <Button label="Log out" variant="ghost" onPress={signOut} />
      </View>
    );
  }
  if (status === 'loading') return <LaunchScreen />;

  const inApp = status === 'guest' || status === 'ready';
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Protected guard={inApp}>
        <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
        {/* Game screen slides up as a sheet over the tabs (swipe down to close on iOS). */}
        <Stack.Screen name="game/[id]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="replay/[gameId]" options={{ presentation: 'modal' }} />
      </Stack.Protected>
      <Stack.Protected guard={status === 'signed_out'}>
        <Stack.Screen name="welcome" options={{ animation: 'fade' }} />
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="sign-up" />
        <Stack.Screen name="forgot-password" />
      </Stack.Protected>
      <Stack.Protected guard={status === 'needs_onboarding'}>
        <Stack.Screen name="onboarding" options={{ gestureEnabled: false, animation: 'fade' }} />
      </Stack.Protected>
      <Stack.Screen name="auth/callback" />
      <Stack.Screen name="reset-password" />
    </Stack>
  );
}
