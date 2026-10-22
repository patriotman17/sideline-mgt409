import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { Skeleton } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { useHaptics } from '@/lib/haptics';
import { compareRows, ordinal, resultLabel, streakLabel, weeksLabel } from '@/lib/pregame';
import { getTeam } from '@/services';
import { getPregame, requestPreview, type PregamePreview, type TeamForm } from '@/services/pregame';
import { colors } from '@/theme';

const teamColor = (abbr: string) => getTeam(abbr.toLowerCase()).primary;

const CATEGORY_UNIT = { passing: 'pass yds', rushing: 'rush yds', receiving: 'rec yds' } as const;

function TeamColumn({ form, align }: { form: TeamForm; align: 'left' | 'right' }) {
  const right = align === 'right';
  const streak = streakLabel(form.streak);
  return (
    <View className={`flex-1 ${right ? 'items-end' : 'items-start'}`}>
      <View className={`flex-row items-center gap-2 ${right ? 'flex-row-reverse' : ''}`}>
        <View className="h-3 w-3 rounded-full" style={{ backgroundColor: teamColor(form.team) }} />
        <Text className="font-cond text-[16px] uppercase tracking-[1px] text-sub">{form.team}</Text>
      </View>
      <Text className="mt-1 font-score-bold text-[34px] leading-[38px] text-ink">
        {form.record}
      </Text>
      {streak ? <Text className="text-[12px] font-semibold text-sub">{streak}</Text> : null}
      <View className={`mt-2 gap-0.5 ${right ? 'items-end' : 'items-start'}`}>
        {form.last_results.map((r) => (
          <Text key={r.week} className="text-[12px] text-white/70">
            Wk {r.week} · {resultLabel(r)}
          </Text>
        ))}
      </View>
    </View>
  );
}

function Leaders({ form }: { form: TeamForm }) {
  return (
    <View className="gap-1.5">
      <View className="flex-row items-center gap-2">
        <View className="h-2 w-2 rounded-full" style={{ backgroundColor: teamColor(form.team) }} />
        <Text className="text-[12px] font-semibold text-sub">{form.team} leaders</Text>
      </View>
      {form.leaders.map((l) => (
        <View key={l.category} className="flex-row items-baseline justify-between">
          <Text className="text-[14px] font-semibold text-ink">{l.player}</Text>
          <Text className="font-cond text-[14px] text-white/75">
            {l.yards.toLocaleString()} {CATEGORY_UNIT[l.category]} · {l.touchdowns} TD
            {l.league_rank <= 5 ? ` · ${ordinal(l.league_rank)} in NFL` : ''}
          </Text>
        </View>
      ))}
    </View>
  );
}

function AiPreview({ gameId, initial }: { gameId: string; initial: PregamePreview | null }) {
  const { tap } = useHaptics();
  const [preview, setPreview] = useState<PregamePreview | null>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showEvidence, setShowEvidence] = useState(false);

  const write = async () => {
    tap();
    setBusy(true);
    setError(null);
    try {
      setPreview(await requestPreview(gameId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not write a preview');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="mt-4 rounded-2xl bg-white/5 p-4">
      <View className="flex-row items-center gap-1.5">
        <Ionicons name="sparkles" size={12} color={colors.volt} />
        <Text className="text-[11px] font-semibold tracking-[1px] text-sub">
          SIDELINE AI · PREVIEW
        </Text>
      </View>
      {preview ? (
        <>
          <Text className="mt-2 text-[17px] font-bold leading-[22px] text-ink">
            {preview.preview.headline}
          </Text>
          <Text className="mt-1.5 text-[14px] leading-[20px] text-white/80">
            {preview.preview.preview}
          </Text>
          <Pressable
            onPress={() => setShowEvidence((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded: showEvidence }}
            hitSlop={8}
            className="mt-2.5 self-start active:opacity-70"
          >
            <Text className="text-[12px] font-semibold text-sub">
              {showEvidence
                ? 'Hide sources'
                : `Based on ${preview.preview.evidence.length} season facts`}
            </Text>
          </Pressable>
          {showEvidence ? (
            <View className="mt-1.5 gap-1">
              {preview.preview.evidence.map((e) => (
                <Text key={e.fact} className="text-[12px] leading-[17px] text-white/60">
                  · {e.fact}
                </Text>
              ))}
            </View>
          ) : null}
          <Text className="mt-2 text-[11px] text-mute">
            Written from {weeksLabel(preview.weeks_included)} only · no predictions
            {preview.grounding_issues.length ? ' · some details unverified' : ''}
          </Text>
        </>
      ) : (
        <>
          <Text className="mt-1.5 text-[13px] leading-[18px] text-white/70">
            A short, spoiler-free preview written from both teams’ season so far.
          </Text>
          {error ? <Text className="mt-2 text-[13px] text-loss">{error}</Text> : null}
          <Pressable
            onPress={write}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Write an AI preview of this game"
            className="mt-3 flex-row items-center gap-2 self-start rounded-full bg-volt px-4 py-2.5 active:opacity-80"
          >
            {busy ? <ActivityIndicator size="small" color={colors.bg} /> : null}
            <Text className="text-[14px] font-bold text-bg">
              {busy ? 'Reading both teams’ season…' : error ? 'Try again' : 'Preview this game'}
            </Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

/** Before kickoff: both teams' season so far (earlier weeks only), rule-based storylines, AI preview. */
export function PregameCard({ gameId }: { gameId: string }) {
  const { data, error, loading, reload } = useAsync(() => getPregame(gameId), [gameId]);

  if (!data) {
    if (error && !loading) {
      return (
        <View className="mx-4 mt-4 rounded-2xl bg-white/10 p-4">
          <Text className="text-[13px] text-sub">Season context is unavailable for this game.</Text>
          <Pressable
            onPress={reload}
            accessibilityRole="button"
            className="mt-2 self-start active:opacity-70"
          >
            <Text className="text-[13px] font-semibold text-volt">Try again</Text>
          </Pressable>
        </View>
      );
    }
    return <Skeleton className="mx-4 mt-4 h-72 rounded-2xl bg-white/10" />;
  }

  const rows = compareRows(data.away, data.home);
  return (
    <View className="mx-4 mt-4 rounded-2xl bg-white/10 p-4">
      <View className="flex-row items-center justify-between">
        <Text className="text-[12px] font-bold uppercase tracking-[2px] text-ink">Pregame</Text>
        <Text className="text-[12px] text-sub">
          Season so far · {weeksLabel(data.weeks_included)}
        </Text>
      </View>

      <View className="mt-3 flex-row">
        <TeamColumn form={data.away} align="left" />
        <TeamColumn form={data.home} align="right" />
      </View>

      <View className="mt-4 gap-2">
        {rows.map((r) => (
          <View key={r.label} className="flex-row items-center">
            <Text
              className={`w-16 font-score-bold text-[17px] ${r.better === 'away' ? 'text-ink' : 'text-white/50'}`}
            >
              {r.away}
            </Text>
            <Text className="flex-1 text-center text-[12px] text-sub">{r.label}</Text>
            <Text
              className={`w-16 text-right font-score-bold text-[17px] ${r.better === 'home' ? 'text-ink' : 'text-white/50'}`}
            >
              {r.home}
            </Text>
          </View>
        ))}
      </View>

      {data.storylines.length ? (
        <View className="mt-4 gap-1.5">
          <Text className="text-[12px] font-semibold text-sub">Storylines</Text>
          {data.storylines.map((s) => (
            <View key={s.key} className="flex-row gap-2">
              <Text className="text-[14px] text-volt">•</Text>
              <Text className="flex-1 text-[14px] leading-[19px] text-ink">{s.text}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <View className="mt-4 gap-4">
        <Leaders form={data.away} />
        <Leaders form={data.home} />
      </View>

      <AiPreview gameId={gameId} initial={data.ai_preview} />

      <Text className="mt-3 text-[11px] leading-4 text-mute">
        Regular-season games before Week {data.week} only. {data.attribution}
      </Text>
    </View>
  );
}
