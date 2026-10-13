import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IconButton } from '@/components/ui';
import { FadeIn } from './FadeIn';

interface Props {
  title: string;
  subtitle?: string;
  /** Small label above the title, e.g. "Step 1 of 4". */
  eyebrow?: string;
  /** Onboarding progress: [current step (1-based), total steps]. */
  progress?: [number, number];
  children: ReactNode;
  /** Pinned under the form (primary action). */
  footer?: ReactNode;
  /** Show a back button (default: when there's somewhere to go back to). */
  back?: boolean | (() => void);
  /** Replays the entrance animation when it changes (e.g. per onboarding step). */
  motionKey?: string | number;
}

/** Shared frame for account screens: pure black, editorial title, form, pinned primary action. */
export function AuthLayout({
  title,
  subtitle,
  eyebrow,
  progress,
  children,
  footer,
  back = true,
  motionKey,
}: Props) {
  const onBack =
    typeof back === 'function'
      ? back
      : () => (router.canGoBack() ? router.back() : router.replace('/welcome'));
  return (
    <View className="flex-1 bg-bg">
      <SafeAreaView edges={['top', 'bottom']} className="flex-1">
        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View className="h-12 flex-row items-center gap-4 px-3">
            {back ? (
              <IconButton icon="chevron-back" accessibilityLabel="Back" onPress={onBack} />
            ) : (
              <View className="w-10" />
            )}
            {progress ? (
              <View
                className="mr-14 flex-1 flex-row gap-1.5"
                accessibilityRole="progressbar"
                accessibilityLabel={`Step ${progress[0]} of ${progress[1]}`}
              >
                {Array.from({ length: progress[1] }, (_, i) => (
                  <View
                    key={i}
                    className={`h-1 flex-1 rounded-full ${i < progress[0] ? 'bg-ink' : 'bg-white/15'}`}
                  />
                ))}
              </View>
            ) : null}
          </View>
          <ScrollView
            className="flex-1"
            contentContainerClassName="px-6 pb-8"
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            showsVerticalScrollIndicator={false}
          >
            <FadeIn motionKey={motionKey ?? title} className="w-full max-w-[440px] self-center">
              {eyebrow ? (
                <Text className="mb-3 text-[12px] font-semibold uppercase tracking-[2px] text-mute">
                  {eyebrow}
                </Text>
              ) : null}
              <Text
                className="text-[34px] font-bold leading-[38px] tracking-[-0.5px] text-ink"
                accessibilityRole="header"
              >
                {title}
              </Text>
              {subtitle ? (
                <Text className="mt-3 text-[16px] leading-[23px] text-sub">{subtitle}</Text>
              ) : null}
              <View className="mt-8 gap-4">{children}</View>
            </FadeIn>
          </ScrollView>
          {footer ? (
            <View className="w-full max-w-[440px] gap-3 self-center px-6 pb-3 pt-2">{footer}</View>
          ) : null}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

/** Inline status line under a form: error (red) or success/info (green). */
export function FormMessage({ error, info }: { error?: string | null; info?: string | null }) {
  if (!error && !info) return null;
  return (
    <View
      className={`rounded-xl px-3.5 py-3 ${error ? 'bg-loss/15' : 'bg-win/15'}`}
      accessibilityLiveRegion="polite"
    >
      <Text className={`text-[14px] leading-[19px] ${error ? 'text-loss' : 'text-win'}`}>
        {error ?? info}
      </Text>
    </View>
  );
}
