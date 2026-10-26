import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, IconButton } from '@/components/ui';
import { SheetView } from '@/components/web/SheetView';
import { markHowToSeen } from '@/hooks/useFirstRunGuide';
import { HOW_TO_STEPS } from '@/lib/howTo';
import { colors } from '@/theme';

/** "How Sideline works": four steps, shown once on first launch and any time from You. */
export default function HowToScreen() {
  // Opening it counts as seen, however it's closed (button, close icon or swipe down).
  useEffect(() => {
    markHowToSeen();
  }, []);

  return (
    <SheetView>
      <SafeAreaView edges={['top', 'bottom']} className="flex-1">
        <View className="items-center pt-1.5">
          <View className="h-1 w-9 rounded-full bg-white/30" />
        </View>
        <View className="flex-row items-center justify-between px-4 pb-1 pt-1.5">
          <IconButton icon="close" accessibilityLabel="Close guide" onPress={() => router.back()} />
          <View className="w-11" />
        </View>

        <ScrollView className="flex-1" contentContainerClassName="px-6 pb-6">
          <Text
            className="text-[30px] font-bold leading-[35px] text-ink"
            accessibilityRole="header"
          >
            How Sideline works
          </Text>
          <Text className="mt-2 text-[15px] leading-[21px] text-sub">
            Watch a real NFL Sunday as it happens, with an AI that explains every moment.
          </Text>

          <View className="mt-7 gap-6">
            {HOW_TO_STEPS.map((s, i) => (
              <View
                key={s.title}
                className="flex-row gap-4"
                accessible
                accessibilityLabel={`Step ${i + 1} of ${HOW_TO_STEPS.length}: ${s.title}. ${s.body}`}
              >
                <View className="h-11 w-11 items-center justify-center rounded-full bg-white/10">
                  <Ionicons name={s.icon} size={20} color={colors.ink} />
                </View>
                <View className="flex-1">
                  <Text className="text-[17px] font-semibold text-ink">{s.title}</Text>
                  <Text className="mt-1 text-[15px] leading-[21px] text-sub">{s.body}</Text>
                </View>
              </View>
            ))}
          </View>

          <Text className="mt-8 text-[13px] leading-[18px] text-mute">
            Nothing is shown before it happens. Real play-by-play from nflverse (CC BY 4.0). Open
            this guide again any time from You.
          </Text>
        </ScrollView>

        <View className="px-6 pb-2 pt-2">
          <Button label="Start Watching" onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    </SheetView>
  );
}
