import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AiUsage, IconButton } from '@/components/ui';
import { SheetView } from '@/components/web/SheetView';
import { useKeyboardOverlap } from '@/hooks/useKeyboardOverlap';
import { canAsk, previousQuestions, STARTER_QUESTIONS, type AskItem } from '@/lib/askSideline';
import { useHaptics } from '@/lib/haptics';
import { createId } from '@/lib/id';
import { askSideline, type AssistResult } from '@/services/askSideline';
import { useWeek } from '@/state/WeekContext';
import { colors } from '@/theme';

function Chip({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className="rounded-full bg-white/10 px-3.5 py-2 active:opacity-70"
    >
      <Text className="text-[13px] font-medium text-ink">{label}</Text>
    </Pressable>
  );
}

function Answer({
  result,
  onFollowUp,
}: {
  result: AssistResult;
  onFollowUp?: (q: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const a = result.answer;
  return (
    <View className="gap-2">
      <View className="flex-row items-center gap-1.5">
        <Ionicons name="sparkles" size={12} color={colors.volt} />
        <Text className="text-[11px] font-semibold tracking-[1px] text-sub">SIDELINE AI</Text>
      </View>
      <Text className="text-[16px] leading-[23px] text-ink">{a.answer}</Text>
      {a.evidence.length ? (
        <Pressable
          onPress={() => setOpen((v) => !v)}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          hitSlop={8}
          className="self-start active:opacity-70"
        >
          <Text className="text-[12px] font-semibold text-sub">
            {open ? 'Hide sources' : `Sources (${a.evidence.length})`}
          </Text>
        </Pressable>
      ) : null}
      {open
        ? a.evidence.map((e) => (
            <Text key={e.tool + e.fact} className="text-[12px] leading-[17px] text-white/60">
              · {e.fact}
            </Text>
          ))
        : null}
      <Text className="text-[11px] text-mute">
        {result.as_of}
        {a.confidence === 'low' ? ' · some details unverified' : ''}
      </Text>
      <AiUsage usage={result.usage} status={result.status} />
      {onFollowUp && a.follow_ups.length ? (
        <View className="mt-1 flex-row flex-wrap gap-2">
          {a.follow_ups.map((q) => (
            <Chip key={q} label={q} onPress={() => onFollowUp(q)} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

/**
 * Ask Sideline: football questions from anywhere (rules, players, teams, league leaders, this week's
 * scores so far). Answers come from Sideline's rule guide and real data, never the model's memory.
 * The chat lives only on this screen (closing it starts fresh).
 */
export default function AssistantScreen() {
  const { weekAuth } = useWeek();
  const { tap } = useHaptics();
  const { ref: keyboardRef, overlap } = useKeyboardOverlap();
  const [items, setItems] = useState<AskItem[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(t);
  }, [items.length, busy, overlap]);

  const ask = async (question: string) => {
    const q = question.trim();
    if (!canAsk(q) || busy) return;
    tap();
    const context = previousQuestions(items);
    setItems((prev) => [...prev, { id: createId('q'), role: 'user', text: q }]);
    setText('');
    setBusy(true);
    try {
      const result = await askSideline(q, context, weekAuth);
      setItems((prev) => [...prev, { id: createId('a'), role: 'assistant', result }]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sideline AI is unavailable right now.';
      setItems((prev) => [
        ...prev,
        { id: createId('e'), role: 'error', text: message, question: q },
      ]);
    } finally {
      setBusy(false);
    }
  };

  const lastAnswerId = [...items].reverse().find((i) => i.role === 'assistant')?.id;

  return (
    <SheetView>
      <SafeAreaView edges={['top', 'bottom']} className="flex-1">
        <View ref={keyboardRef} className="flex-1" style={{ paddingBottom: overlap }}>
          <View className="items-center pt-1.5">
            <View className="h-1 w-9 rounded-full bg-white/30" />
          </View>
          <View className="flex-row items-center justify-between px-4 pb-2 pt-1.5">
            <IconButton
              icon="chevron-down"
              accessibilityLabel="Close Ask Sideline"
              onPress={() => router.back()}
            />
            <View className="flex-row items-center gap-1.5">
              <Ionicons name="sparkles" size={14} color={colors.volt} />
              <Text className="text-[16px] font-bold text-ink">Ask Sideline</Text>
            </View>
            <View className="w-11" />
          </View>

          <ScrollView
            ref={scrollRef}
            className="flex-1"
            contentContainerClassName="gap-5 px-5 pb-6 pt-2"
            keyboardShouldPersistTaps="handled"
          >
            {items.length === 0 ? (
              <View className="gap-4 pt-6">
                <Text className="text-[26px] font-bold leading-[31px] text-ink">
                  Ask anything about football.
                </Text>
                <Text className="text-[15px] leading-[21px] text-sub">
                  Rules and penalties, players, teams, who leads the league, or what’s happening in
                  this week’s games. Answers come from Sideline’s rule guide and real NFL data.
                </Text>
                <Text className="text-[13px] leading-[18px] text-mute">
                  Your question goes to Sideline’s server and an AI model. No account details are
                  included.
                </Text>
                <View className="mt-2 flex-row flex-wrap gap-2">
                  {STARTER_QUESTIONS.map((q) => (
                    <Chip key={q} label={q} onPress={() => ask(q)} />
                  ))}
                </View>
              </View>
            ) : null}

            {items.map((item) =>
              item.role === 'user' ? (
                <View
                  key={item.id}
                  className="max-w-[85%] self-end rounded-3xl bg-volt px-4 py-2.5"
                >
                  <Text className="text-[15px] font-medium text-bg">{item.text}</Text>
                </View>
              ) : item.role === 'assistant' ? (
                <Answer
                  key={item.id}
                  result={item.result}
                  onFollowUp={item.id === lastAnswerId && !busy ? ask : undefined}
                />
              ) : (
                <View key={item.id} className="gap-2">
                  <Text className="text-[14px] text-loss">{item.text}</Text>
                  <Pressable
                    onPress={() => ask(item.question)}
                    accessibilityRole="button"
                    className="self-start active:opacity-70"
                  >
                    <Text className="text-[13px] font-semibold text-volt">Try Again</Text>
                  </Pressable>
                </View>
              ),
            )}
            {busy ? (
              <View className="flex-row items-center gap-2" accessibilityLiveRegion="polite">
                <Ionicons name="sparkles" size={12} color={colors.volt} />
                <Text className="text-[13px] text-sub">
                  Checking the rule guide and the numbers…
                </Text>
              </View>
            ) : null}
          </ScrollView>

          <View className="flex-row items-end gap-2 border-t border-white/10 bg-black/90 px-4 pb-2 pt-3">
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Ask about rules, players, teams…"
              placeholderTextColor={colors.mute}
              className="max-h-28 min-h-[44px] flex-1 rounded-3xl bg-white/10 px-4 py-3 text-[15px] text-ink"
              multiline
              returnKeyType="send"
              submitBehavior="submit"
              onSubmitEditing={() => ask(text)}
              accessibilityLabel="Ask Sideline a football question"
            />
            <Pressable
              onPress={() => ask(text)}
              disabled={!canAsk(text) || busy}
              accessibilityRole="button"
              accessibilityLabel="Send question"
              className={`h-11 w-11 items-center justify-center rounded-full ${
                canAsk(text) && !busy ? 'bg-volt' : 'bg-white/10'
              }`}
            >
              <Ionicons
                name="arrow-up"
                size={20}
                color={canAsk(text) && !busy ? colors.bg : colors.mute}
              />
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </SheetView>
  );
}
