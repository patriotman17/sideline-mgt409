import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Animated, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { MockBadge } from '@/components/ui';
import { USE_NATIVE_DRIVER } from '@/lib/animation';
import { useHaptics } from '@/lib/haptics';
import { getAssistantSuggestions } from '@/services';
import { colors } from '@/theme';
import type { ChatMessage } from '@/types';

function TypingDots() {
  const [anims] = useState(() => [0, 1, 2].map(() => new Animated.Value(0.3)));
  useEffect(() => {
    const loops = anims.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 150),
          Animated.timing(v, { toValue: 1, duration: 300, useNativeDriver: USE_NATIVE_DRIVER }),
          Animated.timing(v, { toValue: 0.3, duration: 300, useNativeDriver: USE_NATIVE_DRIVER }),
          Animated.delay((2 - i) * 150),
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [anims]);
  return (
    <View className="flex-row gap-1 py-1" accessibilityLabel="Sideline AI is typing">
      {anims.map((v, i) => (
        <Animated.View key={i} className="h-2 w-2 rounded-full bg-white" style={{ opacity: v }} />
      ))}
    </View>
  );
}

function AssistantAvatar() {
  return (
    <View className="mr-2 h-7 w-7 items-center justify-center rounded-full bg-white/10">
      <Ionicons name="sparkles" size={13} color={colors.volt} />
    </View>
  );
}

function Bubble({ message }: { message: ChatMessage }) {
  const mine = message.role === 'user';
  return (
    <View className={`mb-3 flex-row ${mine ? 'justify-end' : 'justify-start'}`}>
      {!mine ? <AssistantAvatar /> : null}
      <View
        className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 ${
          mine ? 'rounded-br-md bg-volt' : 'rounded-bl-md bg-white/10'
        }`}
      >
        <Text className={`text-[14px] leading-5 ${mine ? 'font-medium text-bg' : 'text-ink'}`}>{message.text}</Text>
      </View>
    </View>
  );
}

interface ChatMessagesProps {
  messages: ChatMessage[];
  typing: boolean;
  onSuggestion: (text: string) => void;
}

/** Transcript + suggestion chips. Rendered inside the parent screen's scroll view. */
export function ChatMessages({ messages, typing, onSuggestion }: ChatMessagesProps) {
  return (
    <View className="px-5">
      <View className="mb-5 items-center px-6 pt-2">
        <View className="h-11 w-11 items-center justify-center rounded-full bg-white/10">
          <Ionicons name="sparkles" size={20} color={colors.volt} />
        </View>
        <Text className="mt-2.5 text-[17px] font-semibold text-ink">Ask Sideline AI</Text>
        <Text className="mt-1 text-center text-[14px] leading-5 text-sub">
          Plays, stats, strategy, or what to expect next.
        </Text>
        <View className="mt-1.5">
          <MockBadge label="Demo responses" />
        </View>
      </View>

      {messages.map((m) => (
        <Bubble key={m.id} message={m} />
      ))}

      {typing ? (
        <View className="mb-3 flex-row items-center">
          <AssistantAvatar />
          <View className="rounded-2xl rounded-bl-md bg-white/10 px-3.5 py-2">
            <TypingDots />
          </View>
        </View>
      ) : null}

      {!typing ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 pb-2" className="-mx-5 px-5">
          {getAssistantSuggestions().map((s) => (
            <Pressable
              key={s}
              onPress={() => onSuggestion(s)}
              accessibilityRole="button"
              className="rounded-full bg-white/10 px-3.5 py-2 active:opacity-70"
            >
              <Text className="text-[13px] font-medium text-ink">{s}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

/** Text input + send button pinned to the bottom of the screen. */
export function ChatComposer({ onSend, disabled }: { onSend: (text: string) => void; disabled: boolean }) {
  const [text, setText] = useState('');
  const { tap } = useHaptics();
  const canSend = text.trim().length > 0 && !disabled;

  const submit = () => {
    if (!canSend) return;
    tap();
    onSend(text);
    setText('');
  };

  return (
    <View className="flex-row items-end gap-2 border-t border-white/10 bg-black/90 px-4 pb-2 pt-3">
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder="Ask about this game…"
        placeholderTextColor={colors.mute}
        className="max-h-28 min-h-[44px] flex-1 rounded-3xl bg-white/10 px-4 py-3 text-[15px] text-ink"
        multiline
        returnKeyType="send"
        submitBehavior="submit"
        onSubmitEditing={submit}
        accessibilityLabel="Message Sideline AI"
      />
      <Pressable
        onPress={submit}
        disabled={!canSend}
        accessibilityRole="button"
        accessibilityLabel="Send message"
        className={`h-11 w-11 items-center justify-center rounded-full ${canSend ? 'bg-volt' : 'bg-white/10'}`}
      >
        <Ionicons name="arrow-up" size={20} color={canSend ? colors.bg : colors.mute} />
      </Pressable>
    </View>
  );
}
