import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { TeamBadge } from '@/components/game';
import { Avatar, AvatarStack, Card, LiveBadge, MockBadge } from '@/components/ui';
import { gameStatusLabel } from '@/lib/format';
import { useHaptics } from '@/lib/haptics';
import { findGame } from '@/services';
import { colors } from '@/theme';
import type { WatchParty } from '@/types';
import { ReactionBar } from './ReactionBar';

interface PartyRoomProps {
  party: WatchParty;
  onReact: (emoji: string) => void;
  onSend: (text: string) => void;
  onLeave: () => void;
  onOpenGame: () => void;
}

/** The active watch party: mini scoreboard, reactions, and group chat. */
export function PartyRoom({ party, onReact, onSend, onLeave, onOpenGame }: PartyRoomProps) {
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
    <Card className="mx-5 p-4">
      <View className="flex-row items-center justify-between">
        <View className="flex-1">
          <Text className="text-lg font-extrabold text-ink">{party.name}</Text>
          <View className="mt-1 flex-row items-center gap-2">
            <AvatarStack people={party.members} size={22} max={5} />
            <Text className="text-xs text-sub">{party.members.length} in the room</Text>
          </View>
        </View>
        <Pressable onPress={onLeave} hitSlop={8} accessibilityRole="button" className="rounded-full border border-line px-3 py-1.5 active:opacity-70">
          <Text className="text-xs font-semibold text-sub">Leave</Text>
        </Pressable>
      </View>

      {game ? (
        <Pressable
          onPress={onOpenGame}
          accessibilityRole="button"
          accessibilityLabel="Open game center"
          className="mt-4 flex-row items-center rounded-2xl bg-elevated px-4 py-3 active:opacity-80"
        >
          <TeamBadge teamId={game.away.teamId} size={30} />
          <Text className="ml-2 text-xl font-black tabular-nums text-ink">{game.status === 'scheduled' ? '' : game.away.score}</Text>
          <View className="flex-1 items-center">
            {game.status === 'live' ? <LiveBadge compact /> : null}
            <Text className="mt-0.5 text-[11px] font-bold text-sub">{gameStatusLabel(game)}</Text>
          </View>
          <Text className="mr-2 text-xl font-black tabular-nums text-ink">{game.status === 'scheduled' ? '' : game.home.score}</Text>
          <TeamBadge teamId={game.home.teamId} size={30} />
        </Pressable>
      ) : null}

      <View className="mt-4">
        <ReactionBar counts={party.reactions} onReact={onReact} />
      </View>

      <View className="mt-4 flex-row items-center justify-between">
        <Text className="text-sm font-bold text-ink">Party chat</Text>
        <MockBadge label="MOCK USERS" />
      </View>

      <View className="mt-3 flex-row items-center gap-2">
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Say something to the room…"
          placeholderTextColor={colors.mute}
          onSubmitEditing={send}
          returnKeyType="send"
          className="h-11 flex-1 rounded-full border border-line bg-elevated px-4 text-[14px] text-ink"
          accessibilityLabel="Message the watch party"
        />
        <Pressable
          onPress={send}
          accessibilityRole="button"
          accessibilityLabel="Send to party"
          className={`h-11 w-11 items-center justify-center rounded-full ${draft.trim() ? 'bg-volt' : 'bg-elevated'}`}
        >
          <Ionicons name="send" size={16} color={draft.trim() ? colors.bg : colors.mute} />
        </Pressable>
      </View>

      <View className="mt-3">
        {party.messages.length === 0 ? (
          <Text className="py-4 text-center text-[13px] text-mute">No messages yet — start the trash talk.</Text>
        ) : (
          party.messages.slice(0, 12).map((m) => {
            const member = membersById.get(m.memberId);
            const mine = m.memberId === 'me';
            return (
              <View key={m.id} className="flex-row py-2">
                <Avatar initials={member?.initials ?? '?'} color={member?.color ?? colors.mute} size={30} />
                <View className="ml-2.5 flex-1">
                  <View className="flex-row items-center gap-2">
                    <Text className={`text-[13px] font-bold ${mine ? 'text-volt' : 'text-ink'}`}>{member?.name ?? 'Guest'}</Text>
                    {member?.isHost ? <Text className="text-[10px] font-bold text-gold">HOST</Text> : null}
                    <Text className="text-[11px] text-mute">{m.timeLabel}</Text>
                  </View>
                  <Text className="mt-0.5 text-[14px] leading-5 text-sub">{m.text}</Text>
                </View>
              </View>
            );
          })
        )}
      </View>
    </Card>
  );
}
