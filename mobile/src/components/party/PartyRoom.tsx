import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { ScoreRow } from '@/components/scores';
import { Avatar, AvatarStack } from '@/components/ui';
import { useHaptics } from '@/lib/haptics';
import { currentUserMember, findGame } from '@/services';
import { colors } from '@/theme';
import type { WatchParty } from '@/types';
import { ReactionBar } from './ReactionBar';

interface PartyRoomProps {
  party: WatchParty;
  onReact: (emoji: string) => void;
  onSend: (text: string) => void;
  onLeave: () => void;
}

/** The active watch party: the game's score row, reactions, and the group chat. */
export function PartyRoom({ party, onReact, onSend, onLeave }: PartyRoomProps) {
  const [draft, setDraft] = useState('');
  const { tap } = useHaptics();
  const game = findGame(party.gameId);
  const membersById = new Map(party.members.map((m) => [m.id, m]));

  const send = () => {
    if (!draft.trim()) return;
    tap();
    onSend(draft.trim());
    setDraft('');
  };

  return (
    <View>
      <View className="flex-row items-center justify-between px-5">
        <View className="flex-1 pr-3">
          <Text className="text-[22px] font-bold text-ink" numberOfLines={1}>
            {party.name}
          </Text>
          <View className="mt-1 flex-row items-center gap-2">
            <AvatarStack people={party.members} size={22} max={5} />
            <Text className="text-[13px] text-sub">{party.members.length} watching</Text>
          </View>
        </View>
        <Pressable onPress={onLeave} hitSlop={8} accessibilityRole="button" className="rounded-full bg-white/10 px-3.5 py-1.5 active:opacity-70">
          <Text className="text-[13px] font-medium text-ink">Leave</Text>
        </Pressable>
      </View>

      {game ? (
        <View className="mt-4">
          <ScoreRow game={game} />
        </View>
      ) : null}

      <View className="mt-2 px-4">
        <ReactionBar counts={party.reactions} onReact={onReact} />
      </View>

      <View className="mt-4 flex-row items-center gap-2 px-4">
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Message the room"
          placeholderTextColor={colors.mute}
          onSubmitEditing={send}
          returnKeyType="send"
          className="h-11 flex-1 rounded-full bg-white/10 px-4 text-[15px] text-ink"
          accessibilityLabel="Message the watch party"
        />
        <Pressable
          onPress={send}
          accessibilityRole="button"
          accessibilityLabel="Send to party"
          className={`h-11 w-11 items-center justify-center rounded-full ${draft.trim() ? 'bg-volt' : 'bg-white/10'}`}
        >
          <Ionicons name="arrow-up" size={19} color={draft.trim() ? colors.bg : colors.mute} />
        </Pressable>
      </View>

      <View className="mt-2 px-4">
        {party.messages.length === 0 ? (
          <Text className="py-6 text-center text-[14px] text-mute">No messages yet. Start the trash talk.</Text>
        ) : (
          party.messages.slice(0, 15).map((m) => {
            const mine = m.memberId === currentUserMember.id;
            const member = membersById.get(m.memberId);
            if (mine) {
              return (
                <View key={m.id} className="mt-2.5 items-end">
                  <View className="max-w-[80%] rounded-2xl rounded-br-md bg-volt px-3.5 py-2">
                    <Text className="text-[15px] leading-5 text-bg">{m.text}</Text>
                  </View>
                  <Text className="mt-1 text-[11px] text-mute">{m.timeLabel}</Text>
                </View>
              );
            }
            return (
              <View key={m.id} className="mt-2.5 flex-row items-end gap-2">
                <Avatar initials={member?.initials ?? '?'} color={member?.color ?? colors.mute} size={28} />
                <View className="max-w-[80%]">
                  <Text className="mb-1 ml-1 text-[12px] text-sub">
                    {member?.name ?? 'Guest'}
                    {member?.isHost ? <Text className="text-gold"> · Host</Text> : null} · {m.timeLabel}
                  </Text>
                  <View className="rounded-2xl rounded-bl-md bg-white/10 px-3.5 py-2">
                    <Text className="text-[15px] leading-5 text-ink">{m.text}</Text>
                  </View>
                </View>
              </View>
            );
          })
        )}
      </View>
    </View>
  );
}
