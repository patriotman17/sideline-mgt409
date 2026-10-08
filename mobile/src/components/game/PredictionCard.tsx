import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

import { useHaptics } from '@/lib/haptics';
import { useAppActions, useAppState } from '@/state/AppStore';
import { colors } from '@/theme';
import type { Prediction } from '@/types';

/**
 * Pick'em-style prediction. Before picking, options are buttons; after
 * picking, community splits are revealed. Picks can be changed while open.
 */
export function PredictionCard({ prediction, compact = false }: { prediction: Prediction; compact?: boolean }) {
  const { picks } = useAppState();
  const { pick } = useAppActions();
  const { success } = useHaptics();
  const myPick = picks[prediction.id];
  const resolved = prediction.status === 'resolved';
  const reveal = !!myPick || resolved;
  const wonPick = resolved && myPick === prediction.correctOptionId;

  return (
    <View className={`rounded-2xl border border-line bg-surface p-4 ${compact ? 'w-[290px]' : ''}`}>
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-1.5 rounded-full bg-voltDim px-2 py-0.5">
          <Ionicons name="trophy" size={11} color={colors.volt} />
          <Text className="text-[11px] font-bold text-volt">+{prediction.points} pts</Text>
        </View>
        <Text className={`text-[11px] font-semibold ${resolved ? 'text-mute' : 'text-sub'}`}>{prediction.closesLabel}</Text>
      </View>
      <Text className="mt-3 text-[15px] font-bold leading-5 text-ink">{prediction.question}</Text>

      <View className="mt-3 gap-2">
        {prediction.options.map((o) => {
          const selected = myPick === o.id;
          const correct = resolved && prediction.correctOptionId === o.id;
          return (
            <Pressable
              key={o.id}
              disabled={resolved}
              onPress={() => {
                success();
                pick(prediction.id, o.id);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected, disabled: resolved }}
              accessibilityLabel={`${o.label}${reveal ? `, ${o.communityPct} percent of fans` : ''}`}
              className={`overflow-hidden rounded-xl border active:opacity-80 ${
                selected ? 'border-volt' : correct ? 'border-win' : 'border-line'
              } bg-elevated`}
            >
              {reveal ? (
                <View
                  className="absolute bottom-0 left-0 top-0"
                  style={{ width: `${o.communityPct}%`, backgroundColor: selected ? 'rgba(198,255,61,0.16)' : 'rgba(255,255,255,0.05)' }}
                />
              ) : null}
              <View className="flex-row items-center justify-between px-3.5 py-3">
                <View className="flex-row items-center gap-2">
                  {selected ? <Ionicons name="checkmark-circle" size={16} color={colors.volt} /> : null}
                  {correct && !selected ? <Ionicons name="checkmark" size={16} color={colors.win} /> : null}
                  <Text className={`text-sm font-semibold ${selected ? 'text-volt' : 'text-ink'}`}>{o.label}</Text>
                </View>
                {reveal ? <Text className="text-sm font-bold text-sub">{o.communityPct}%</Text> : null}
              </View>
            </Pressable>
          );
        })}
      </View>

      {resolved && myPick ? (
        <Text className={`mt-3 text-xs font-bold ${wonPick ? 'text-win' : 'text-loss'}`}>
          {wonPick ? `Nailed it · +${prediction.points} pts earned` : 'Missed this one — next drive!'}
        </Text>
      ) : myPick ? (
        <Text className="mt-3 text-xs text-mute">Pick locked in · tap another option to change before it closes</Text>
      ) : null}
    </View>
  );
}
