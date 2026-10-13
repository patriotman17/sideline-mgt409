import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

import { useHaptics } from '@/lib/haptics';
import { countdownLabel, holdProgress } from '@/lib/moments';
import type { PredictionCard } from '@/lib/replayPredictions';
import { colors } from '@/theme';

interface Props {
  card: PredictionCard;
  /** Real seconds until play resumes on its own. */
  secondsLeft: number | null | undefined;
  totalSeconds?: number;
  onAnswer: (optionId: string) => void;
  /** Skip without answering (play resumes now). */
  onSkip?: () => void;
}

/**
 * A Big Moment: play holds before the snap. Situation, why it matters, two big choices, and a
 * countdown. Answering (or the countdown ending) resumes play; nothing is lost by skipping.
 */
export function MomentCard({ card, secondsLeft, totalSeconds = 12, onAnswer, onSkip }: Props) {
  const { success } = useHaptics();
  const p = card.item.prediction;
  const answerable = card.state === 'open';
  const progress = holdProgress(secondsLeft, totalSeconds);

  return (
    <View className="mx-4 mt-4 overflow-hidden rounded-3xl bg-surface">
      <View className="h-1 bg-white/10">
        <View className="h-full bg-volt" style={{ width: `${progress * 100}%` }} />
      </View>
      <View className="p-5">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-1.5">
            <Ionicons name="flash" size={13} color={colors.volt} />
            <Text className="text-[12px] font-bold uppercase tracking-[2px] text-volt">
              Big moment
            </Text>
          </View>
          <Text
            className="font-score-bold text-[18px] text-ink"
            accessibilityLabel={`${Math.ceil(secondsLeft ?? 0)} seconds until play resumes`}
          >
            {card.state === 'locked_in' ? 'Locked in' : countdownLabel(secondsLeft)}
          </Text>
        </View>

        <Text className="mt-3 font-cond text-[16px] uppercase tracking-[1px] text-sub">
          {p.situation}
        </Text>
        {p.tags.length ? (
          <Text className="mt-1 text-[12px] font-semibold text-white/60">{p.tags.join(' · ')}</Text>
        ) : null}
        <Text className="mt-3 text-[22px] font-bold leading-[28px] text-ink">{p.question}</Text>

        <View className={`mt-4 ${p.options.length > 2 ? 'gap-2' : 'flex-row gap-2'}`}>
          {p.options.map((o) => {
            const mine = card.selected === o.id;
            return (
              <Pressable
                key={o.id}
                disabled={!answerable}
                onPress={() => {
                  success();
                  onAnswer(o.id);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: mine, disabled: !answerable }}
                accessibilityLabel={`${o.label}${mine ? ', your pick' : ''}`}
                className={`min-h-[56px] flex-1 items-center justify-center rounded-2xl px-3 active:opacity-80 ${
                  mine ? 'bg-volt' : 'bg-white/10'
                } ${!answerable && !mine ? 'opacity-50' : ''}`}
              >
                <Text className={`text-[17px] font-bold ${mine ? 'text-bg' : 'text-ink'}`}>
                  {o.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {card.error ? <Text className="mt-3 text-[13px] text-loss">{card.error}</Text> : null}
        <View className="mt-3 flex-row items-center justify-between">
          <Text className="text-[12px] text-mute">
            +{p.points} pts if you’re right · demo scoring
          </Text>
          {onSkip && answerable ? (
            <Pressable
              onPress={onSkip}
              accessibilityRole="button"
              hitSlop={8}
              className="active:opacity-70"
            >
              <Text className="text-[13px] font-semibold text-sub">Skip</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}
