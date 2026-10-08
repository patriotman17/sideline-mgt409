import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import type { ReplayChatItem } from '@/hooks/useReplayChat';
import type { AskAnswer } from '@/services';
import { colors } from '@/theme';

const SUGGESTIONS = ['What’s the score?', 'Who leads in rushing?', 'Any turnovers so far?', 'What just happened?'];

const TOOL_LABEL: Record<string, string> = {
  get_game_state: 'Game state',
  get_recent_plays: 'Play-by-play',
  get_team_stats: 'Team stats',
  get_player_stats: 'Player stats',
  get_game_context: 'Game context',
};

function Avatar() {
  return (
    <View className="mr-2 h-7 w-7 items-center justify-center rounded-full bg-white/10">
      <Ionicons name="sparkles" size={13} color={colors.volt} />
    </View>
  );
}

function AnswerBubble({ result, onAsk }: { result: AskAnswer; onAsk: (question: string) => void }) {
  const [open, setOpen] = useState(false);
  const { answer, as_of } = result;
  const options = answer.clarification?.options ?? [];
  return (
    <View className="mb-3 flex-row">
      <Avatar />
      <View className="max-w-[85%] flex-1">
        <View className="rounded-2xl rounded-bl-md bg-white/10 px-3.5 py-2.5">
          <Text className="text-[15px] leading-[21px] text-ink">{answer.answer}</Text>
          {answer.uncertainty && !options.length ? (
            <Text className="mt-1.5 text-[13px] leading-[18px] text-sub">{answer.uncertainty}</Text>
          ) : null}
        </View>
        {options.length ? (
          <View className="mt-2 gap-1.5">
            {options.map((o) => (
              <Pressable
                key={o}
                onPress={() => onAsk(o)}
                accessibilityRole="button"
                className="self-start rounded-full border border-volt/50 px-3 py-1.5 active:opacity-70"
              >
                <Text className="text-[13px] font-medium text-volt">{o}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        <View className="ml-1 mt-1 flex-row flex-wrap items-center gap-x-2">
          <Text className="text-[11px] text-mute">
            As of {as_of.period} {as_of.clock ?? ''} · {answer.confidence} confidence{result.status === 'cached' ? ' · cached' : ''}
          </Text>
          {answer.evidence.length ? (
            <Pressable onPress={() => setOpen((o) => !o)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Show evidence">
              <Text className="text-[11px] font-semibold text-volt">{open ? 'Hide' : 'Based on'} {answer.evidence.length} fact{answer.evidence.length > 1 ? 's' : ''}</Text>
            </Pressable>
          ) : null}
        </View>
        {open ? (
          <View className="ml-1 mt-1.5 gap-1">
            {answer.evidence.map((e, i) => (
              <Text key={i} className="text-[12px] leading-[17px] text-sub">
                <Text className="font-semibold text-ink">{TOOL_LABEL[e.tool] ?? e.tool}:</Text> {e.fact}
              </Text>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

function ErrorBubble({ item, onRetry }: { item: Extract<ReplayChatItem, { role: 'error' }>; onRetry: () => void }) {
  const setup = item.code === 'not_configured';
  return (
    <View className="mb-3 flex-row">
      <Avatar />
      <View className="max-w-[85%] flex-1 rounded-2xl rounded-bl-md border border-loss/40 bg-loss/10 px-3.5 py-2.5">
        <Text className="text-[14px] font-semibold text-ink">{setup ? 'Sideline AI isn’t set up' : 'Couldn’t answer that'}</Text>
        <Text className="mt-1 text-[13px] leading-[18px] text-sub">{item.message}</Text>
        {!setup && item.code !== 'blocked' ? (
          <Pressable onPress={onRetry} accessibilityRole="button" className="mt-2 flex-row items-center gap-1 self-start rounded-full bg-white/10 px-3 py-1.5 active:opacity-70">
            <Ionicons name="refresh" size={13} color={colors.ink} />
            <Text className="text-[13px] font-medium text-ink">Retry</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function Thinking() {
  return (
    <View className="mb-3 flex-row items-center">
      <Avatar />
      <View className="rounded-2xl rounded-bl-md bg-white/10 px-3.5 py-2.5">
        <Text className="text-[13px] text-sub">Checking the play-by-play…</Text>
      </View>
    </View>
  );
}

interface ReplayAskPanelProps {
  items: ReplayChatItem[];
  pending: boolean;
  onAsk: (question: string) => void;
  onRetry: (item: Extract<ReplayChatItem, { role: 'error' }>) => void;
  onReset: () => void;
  /** Messages from later replay positions, hidden after a rewind/restart. */
  hiddenCount: number;
}

/** Ask Sideline conversation: real backend answers grounded in the replay's revealed plays. */
export function ReplayAskPanel({ items, pending, onAsk, onRetry, onReset, hiddenCount }: ReplayAskPanelProps) {
  return (
    <View className="px-4">
      {items.length ? (
        <Pressable
          onPress={onReset}
          disabled={pending}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Start a new chat"
          className="mb-3 flex-row items-center gap-1 self-end active:opacity-70"
        >
          <Ionicons name="create-outline" size={14} color={colors.sub} />
          <Text className="text-[13px] font-medium text-sub">New chat</Text>
        </Pressable>
      ) : null}
      {hiddenCount > 0 ? (
        <View className="mb-3 flex-row items-center gap-1.5 rounded-xl bg-white/5 px-3 py-2">
          <Ionicons name="eye-off-outline" size={13} color={colors.mute} />
          <Text className="flex-1 text-[12px] text-mute">
            {hiddenCount} message{hiddenCount > 1 ? 's' : ''} from later in the game {hiddenCount > 1 ? 'are' : 'is'} hidden
            until the replay gets there.
          </Text>
        </View>
      ) : null}

      {items.length === 0 ? (
        <View className="mb-4 items-center px-6 pt-2">
          <View className="h-11 w-11 items-center justify-center rounded-full bg-white/10">
            <Ionicons name="sparkles" size={20} color={colors.volt} />
          </View>
          <Text className="mt-2.5 text-[17px] font-semibold text-ink">Ask Sideline</Text>
          <Text className="mt-1 text-center text-[14px] leading-5 text-sub">
            Answers use only what has happened so far in this replay, from the real play-by-play.
          </Text>
        </View>
      ) : null}

      {items.map((item) =>
        item.role === 'user' ? (
          <View key={item.id} className="mb-3 items-end">
            <View className="max-w-[80%] rounded-2xl rounded-br-md bg-volt px-3.5 py-2.5">
              <Text className="text-[15px] font-medium leading-[21px] text-bg">{item.text}</Text>
            </View>
          </View>
        ) : item.role === 'assistant' ? (
          <AnswerBubble key={item.id} result={item.result} onAsk={onAsk} />
        ) : (
          <ErrorBubble key={item.id} item={item} onRetry={() => onRetry(item)} />
        ),
      )}

      {pending ? <Thinking /> : null}

      {!pending ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 pb-2" className="-mx-4 px-4">
          {SUGGESTIONS.map((s) => (
            <Pressable key={s} onPress={() => onAsk(s)} accessibilityRole="button" className="rounded-full bg-white/10 px-3.5 py-2 active:opacity-70">
              <Text className="text-[13px] font-medium text-ink">{s}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}
