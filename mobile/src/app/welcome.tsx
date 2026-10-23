import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FadeIn, WelcomeBackdrop } from '@/components/auth';
import { Button } from '@/components/ui';
import { useAuth } from '@/state/AuthContext';
import { colors } from '@/theme';

const POINTS = [
  {
    icon: 'pulse',
    title: 'Live with the game',
    body: 'Scores, plays and win odds update snap by snap.',
  },
  {
    icon: 'sparkles',
    title: 'An AI that knows the moment',
    body: 'Ask anything. It answers from what’s happened so far.',
  },
  {
    icon: 'flag',
    title: 'Call the big moments',
    body: 'Make picks on 4th downs, drives and finishes.',
  },
] as const;

export default function WelcomeScreen() {
  const { accountsEnabled, startDemo } = useAuth();
  const [starting, setStarting] = useState(false);

  const tryDemo = async () => {
    setStarting(true);
    await startDemo(); // the router guard opens the app
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-bg">
      <WelcomeBackdrop />
      <View className="w-full max-w-[460px] flex-1 self-center px-7">
        <View className="flex-1 justify-center">
          <FadeIn>
            <Text
              className="font-score-bold text-[76px] uppercase leading-[72px] tracking-[-1px] text-ink"
              accessibilityRole="header"
            >
              Sideline
            </Text>
          </FadeIn>
          <FadeIn delay={90}>
            <Text className="mt-4 text-[26px] font-semibold leading-[32px] tracking-[-0.3px] text-ink">
              Every game, explained.{'\n'}
              <Text className="text-sub">As it happens.</Text>
            </Text>
          </FadeIn>

          <FadeIn delay={180} className="mt-10 gap-5">
            {POINTS.map((p) => (
              <View key={p.title} className="flex-row gap-4">
                <View
                  className="w-5 pt-2.5"
                  importantForAccessibility="no"
                  accessibilityElementsHidden
                >
                  <Ionicons name={p.icon} size={18} color={colors.sub} />
                </View>
                <View className="flex-1 border-t border-white/10 pt-2.5">
                  <Text className="text-[15px] font-semibold text-ink">{p.title}</Text>
                  <Text className="mt-0.5 text-[14px] leading-[19px] text-sub">{p.body}</Text>
                </View>
              </View>
            ))}
          </FadeIn>
        </View>

        <FadeIn delay={260} className="gap-3 pb-2">
          {accountsEnabled ? (
            <>
              <Button label="Create Account" onPress={() => router.push('/sign-up')} />
              <Button label="Log In" variant="secondary" onPress={() => router.push('/sign-in')} />
            </>
          ) : (
            <Text className="mb-1 text-center text-[13px] leading-[18px] text-mute">
              Accounts aren’t set up on this server. The demo has everything: replays, Ask AI, and
              picks.
            </Text>
          )}
          {accountsEnabled ? (
            <Pressable
              onPress={tryDemo}
              disabled={starting}
              accessibilityRole="button"
              accessibilityLabel="Try Demo, no account needed"
              className="items-center py-2.5 active:opacity-60"
            >
              <Text className="text-[15px] font-semibold text-ink">
                {starting ? 'Opening demo…' : 'Try Demo'}
                <Text className="font-normal text-mute"> · no account needed</Text>
              </Text>
            </Pressable>
          ) : (
            <Button label="Try Demo" loading={starting} onPress={tryDemo} />
          )}
        </FadeIn>
      </View>
    </SafeAreaView>
  );
}
