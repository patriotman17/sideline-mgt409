import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

import { useHaptics } from '@/lib/haptics';
import { lockLabel, type PredictionCard } from '@/lib/replayPredictions';
import { colors } from '@/theme';

const BADGE: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  correct: { label: 'Correct', icon: 'checkmark-circle', color: colors.win },
  incorrect: { label: 'Missed it', icon: 'close-circle', color: colors.loss },
  void: { label: 'Void', icon: 'remove-circle-outline', color: colors.mute },
  missed: { label: 'No pick', icon: 'ellipse-outline', color: colors.mute },
  locked_in: { label: 'Locked in', icon: 'lock-closed', color: colors.volt },
  closed: { label: 'Closed', icon: 'lock-closed-outline', color: colors.mute },
  hidden: { label: 'Result later in the game', icon: 'eye-off-outline', color: colors.mute },
};

interface Props {
  card: PredictionCard;
  onAnswer?: (optionId: string) => void;
  explanation?: { text?: string; error?: string; loading?: boolean };
  onExplain?: () => void;
  /** Seconds until the next snap (pick window), for the open-question footer. */
  secondsToSnap?: number | null;
  /** Inline under the playback controls: tighter, without the long window text. */
  compact?: boolean;
}

/** A real replay prediction: answer before the play, watch it lock, see the deterministic result. */
export function ReplayPredictionCard({ card, onAnswer, explanation, onExplain, secondsToSnap, compact }: Props) {
  const { success } = useHaptics();
  const { item, state, selected } = card;
  const p = item.prediction;
  const answerable = state === 'open' && !!onAnswer;
  const finished = state === 'correct' || state === 'incorrect' || state === 'void' || state === 'missed';
  const badge = BADGE[state];

  return (
    <View className="rounded-2xl bg-white/10 p-4">
      <View className="flex-row items-center justify-between">
        <Text className="text-[12px] text-sub">{p.situation}</Text>
        {badge ? (
          <View className="flex-row items-center gap-1">
            <Ionicons name={badge.icon} size={13} color={badge.color} />
            <Text className="text-[12px] font-semibold" style={{ color: badge.color }}>
              {badge.label}
              {state === 'correct' ? ` · +${item.points_awarded}` : ''}
            </Text>
          </View>
        ) : (
          <Text className="font-cond text-[14px] text-volt">+{p.points} pts</Text>
        )}
      </View>
      {p.tags.length ? (
        <Text className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.8px] text-white/60" numberOfLines={1}>
          {p.tags.join(' · ')}
        </Text>
      ) : null}
      <Text className={`mb-3 mt-1.5 font-semibold text-ink ${compact ? 'text-[16px] leading-[21px]' : 'text-[17px] leading-[22px]'}`}>
        {p.question}
      </Text>

      <View className={p.options.length > 2 ? 'gap-2' : 'flex-row gap-2'}>
        {p.options.map((o) => {
          const mine = selected === o.id;
          const right = finished && p.correct_option_id === o.id;
          return (
            <Pressable
              key={o.id}
              disabled={!answerable}
              onPress={() => {
                success();
                onAnswer?.(o.id);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: mine, disabled: !answerable }}
              accessibilityLabel={`${o.label}${mine ? ', your pick' : ''}${right ? ', correct answer' : ''}`}
              className={`min-h-[48px] flex-1 flex-row items-center justify-center gap-1.5 rounded-xl px-3 py-2 active:opacity-80 ${
                mine ? (finished && !right ? 'bg-loss/30' : 'bg-volt') : 'bg-white/10'
              } ${right && !mine ? 'border border-win' : ''} ${!answerable && !mine ? 'opacity-70' : ''}`}
            >
              {mine && state === 'sending' ? <Ionicons name="time-outline" size={14} color={colors.bg} /> : null}
              {mine && state !== 'sending' ? (
                <Ionicons name={finished ? (right ? 'checkmark' : 'close') : 'lock-closed'} size={14} color={finished && !right ? colors.ink : colors.bg} />
              ) : null}
              {right && !mine ? <Ionicons name="checkmark" size={14} color={colors.win} /> : null}
              <Text className={`text-[15px] font-semibold ${mine && !(finished && !right) ? 'text-bg' : 'text-ink'}`} numberOfLines={1}>
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {card.error ? <Text className="mt-2.5 text-[12px] text-loss">{card.error}</Text> : null}
      {state === 'open' ? (
        <Text className="mt-2.5 text-[12px] text-mute">
          {lockLabel(secondsToSnap)}
          {compact ? '' : ` · ${p.window}`}
        </Text>
      ) : null}
      {compact && state === 'locked_in' ? (
        <Text className="mt-2.5 text-[12px] text-mute">Locked in · result in Picks</Text>
      ) : null}
      {state === 'locked_in' || state === 'closed' ? (
        <Text className="mt-2.5 text-[12px] text-mute">{p.window}</Text>
      ) : null}
      {state === 'hidden' ? (
        <Text className="mt-2.5 text-[12px] text-mute">You’ll see the result again at play {item.result_hidden_until}.</Text>
      ) : null}
      {finished && (p.resolution_summary || p.void_reason) ? (
        <Text className="mt-2.5 text-[13px] leading-[18px] text-sub">{p.void_reason ?? p.resolution_summary}</Text>
      ) : null}

      {finished && onExplain ? (
        explanation?.text ? (
          <View className="mt-3 flex-row gap-1.5 rounded-xl bg-white/5 p-3">
            <Ionicons name="sparkles" size={13} color={colors.volt} style={{ marginTop: 2 }} />
            <Text className="flex-1 text-[13px] leading-[18px] text-white/80">{explanation.text}</Text>
          </View>
        ) : (
          <Pressable onPress={onExplain} disabled={explanation?.loading} accessibilityRole="button" className="mt-3 flex-row items-center gap-1 self-start active:opacity-70">
            <Ionicons name="sparkles" size={12} color={colors.volt} />
            <Text className="text-[12px] font-semibold text-volt">
              {explanation?.loading ? 'Explaining…' : explanation?.error ? 'Couldn’t explain — retry' : 'Why?'}
            </Text>
          </Pressable>
        )
      ) : null}
    </View>
  );
}
