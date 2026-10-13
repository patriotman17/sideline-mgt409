import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

import { useHaptics } from '@/lib/haptics';
import { countdownLabel, holdProgress } from '@/lib/moments';
import type { WeekHold } from '@/services/week';
import { colors } from '@/theme';

interface Props {
  hold: WeekHold;
  /** e.g. "DEN @ PHI". */
  matchup: string;
  onOpen: () => void;
  onSkip: () => void;
}

/** The week clock is holding on a big moment in your #1 team's game: jump in and make the call. */
export function MomentBanner({ hold, matchup, onOpen, onSkip }: Props) {
  const { tap } = useHaptics();
  return (
    <View className="mx-4 mt-3 overflow-hidden rounded-2xl bg-volt/10">
      <View className="h-1 bg-white/10">
        <View
          className="h-full bg-volt"
          style={{ width: `${holdProgress(hold.seconds_left) * 100}%` }}
        />
      </View>
      <View className="p-4">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-1.5">
            <Ionicons name="flash" size={13} color={colors.volt} />
            <Text className="text-[12px] font-bold uppercase tracking-[2px] text-volt">
              Big moment · {matchup}
            </Text>
          </View>
          <Text className="font-score-bold text-[16px] text-ink">
            {countdownLabel(hold.seconds_left)}
          </Text>
        </View>
        <Text className="mt-2 font-cond text-[14px] uppercase tracking-[1px] text-sub">
          {hold.moment.situation}
        </Text>
        <Text className="mt-1 text-[17px] font-bold leading-[22px] text-ink">
          {hold.moment.question}
        </Text>
        <View className="mt-3 flex-row items-center gap-3">
          <Pressable
            onPress={() => {
              tap();
              onOpen();
            }}
            accessibilityRole="button"
            className="rounded-full bg-volt px-4 py-2.5 active:opacity-80"
          >
            <Text className="text-[14px] font-bold text-bg">Make your call</Text>
          </Pressable>
          <Pressable
            onPress={onSkip}
            accessibilityRole="button"
            hitSlop={8}
            className="active:opacity-70"
          >
            <Text className="text-[14px] font-semibold text-sub">Keep watching</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
