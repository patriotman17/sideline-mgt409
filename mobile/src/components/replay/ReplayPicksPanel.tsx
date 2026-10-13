import { Text, View } from 'react-native';

import { ChoiceList } from '@/components/auth';

import { Button } from '@/components/ui';
import { formatAccuracy, type PicksView } from '@/lib/replayPredictions';
import type { MomentHolds, ReplayPredictions } from '@/services';
import { MOMENT_HOLD_OPTIONS } from '@/lib/moments';
import { ReplayPredictionCard } from './ReplayPredictionCard';

interface Props {
  data: ReplayPredictions | undefined;
  view: PicksView;
  error: string | undefined;
  onRetry: () => void;
  onAnswer: (predictionId: string, optionId: string) => void;
  momentHolds: MomentHolds;
  onMomentHolds: (level: MomentHolds) => void;
  onExplain: (predictionId: string) => void;
  secondsToSnap?: number | null;
  explanations: Record<string, { text?: string; error?: string; loading?: boolean }>;
}

function Stat({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
  return (
    <View className="flex-1 items-center">
      <Text
        className={`font-score text-[26px] leading-[30px] ${accent ? 'text-volt' : 'text-ink'}`}
      >
        {value}
      </Text>
      <Text className="text-[11px] text-sub">{label}</Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="mt-5 gap-3">
      <Text className="text-[13px] font-semibold uppercase tracking-[1px] text-sub">{title}</Text>
      {children}
    </View>
  );
}

/** Real, deterministic predictions for a historical replay (demo scoring). */
export function ReplayPicksPanel({
  data,
  view,
  error,
  onRetry,
  onAnswer,
  momentHolds,
  onMomentHolds,
  onExplain,
  secondsToSnap,
  explanations,
}: Props) {
  if (error && !data) {
    return (
      <View className="mx-4 rounded-2xl bg-loss/10 p-4">
        <Text className="text-[14px] font-semibold text-ink">Couldn’t load predictions</Text>
        <Text className="mt-1 text-[13px] text-sub">{error}</Text>
        <Button
          label="Retry"
          size="sm"
          variant="secondary"
          className="mt-3 self-start"
          onPress={onRetry}
        />
      </View>
    );
  }
  if (!data) {
    return <Text className="px-5 text-[14px] text-sub">Loading predictions…</Text>;
  }
  const s = data.stats;
  return (
    <View className="px-4">
      <View className="flex-row rounded-2xl bg-white/10 py-3.5">
        <Stat value={String(s.points)} label="Points" accent />
        <View className="w-px bg-white/10" />
        <Stat value={formatAccuracy(s.accuracy)} label="Accuracy" />
        <View className="w-px bg-white/10" />
        <Stat value={`${s.current_streak}`} label={`Streak · best ${s.longest_streak}`} />
      </View>
      <Text className="mt-2 text-center text-[11px] leading-4 text-mute">
        Demo scoring · points stay in this replay. Answer before the play; picks are final.
      </Text>

      <View className="mt-3 rounded-2xl bg-white/10 p-4">
        <Text className="text-[14px] font-semibold text-ink">Moment holds</Text>
        <Text className="mb-3 mt-0.5 text-[12px] text-mute">
          {MOMENT_HOLD_OPTIONS.find((o) => o.value === momentHolds)?.hint}
        </Text>
        <ChoiceList
          compact
          options={MOMENT_HOLD_OPTIONS}
          value={momentHolds}
          onChange={onMomentHolds}
        />
      </View>

      {data.resumes_after_play !== null ? (
        <Text className="mt-3 text-[12px] leading-[17px] text-mute">
          You’ve rewound. New questions resume after play {data.resumes_after_play}, where you left
          off — earlier ones can’t be re-answered.
        </Text>
      ) : null}

      {view.open.length ? (
        <Section title="Make your pick">
          {view.open.map((c) => (
            <ReplayPredictionCard
              key={c.item.prediction.id}
              card={c}
              secondsToSnap={secondsToSnap}
              onAnswer={(o) => onAnswer(c.item.prediction.id, o)}
            />
          ))}
        </Section>
      ) : (
        <View className="mt-5 items-center rounded-2xl bg-white/5 px-6 py-6">
          <Text className="text-center text-[15px] font-semibold text-ink">
            No open questions right now
          </Text>
          <Text className="mt-1 text-center text-[13px] leading-[18px] text-sub">
            A handful of featured questions per game, saved for the big moments: 4th-down calls,
            red-zone snaps, and late, close situations. They’ll pop up under the replay controls.
          </Text>
        </View>
      )}

      {view.waiting.length ? (
        <Section title="Waiting for the result">
          {view.waiting.map((c) => (
            <ReplayPredictionCard key={c.item.prediction.id} card={c} />
          ))}
        </Section>
      ) : null}

      {view.results.length ? (
        <Section title="Results">
          {view.results.map((c) => (
            <ReplayPredictionCard
              key={c.item.prediction.id}
              card={c}
              explanation={explanations[c.item.prediction.id]}
              onExplain={() => onExplain(c.item.prediction.id)}
            />
          ))}
        </Section>
      ) : null}
    </View>
  );
}
