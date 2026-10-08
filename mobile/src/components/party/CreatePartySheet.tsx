import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';

import { Button, Chip } from '@/components/ui';
import { getTeam } from '@/services';
import { colors } from '@/theme';
import type { Game } from '@/types';

interface CreatePartySheetProps {
  visible: boolean;
  games: Game[];
  onClose: () => void;
  onCreate: (name: string, gameId: string, isPrivate: boolean) => void;
}

export function CreatePartySheet({ visible, games, onClose, onCreate }: CreatePartySheetProps) {
  const [name, setName] = useState('');
  const [gameId, setGameId] = useState<string | null>(null);
  const [isPrivate, setIsPrivate] = useState(false);
  // Ref (not state) so rapid double-taps in the same tick can't create two parties.
  const submittedRef = useRef(false);
  const selectedGame = gameId ?? games[0]?.id ?? null;
  const canCreate = name.trim().length >= 3 && !!selectedGame;

  // Re-arm each time the sheet opens. (Modal `onShow` isn't reliable on web.)
  useEffect(() => {
    if (visible) submittedRef.current = false;
  }, [visible]);

  const reset = () => {
    setName('');
    setGameId(null);
    setIsPrivate(false);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 justify-end">
        <Pressable className="absolute inset-0 bg-black/60" onPress={onClose} accessibilityLabel="Close" />
        <View className="rounded-t-3xl bg-surface px-5 pb-10 pt-3">
          <View className="mb-4 h-1 w-10 self-center rounded-full bg-raised" />
          <Text className="text-xl font-extrabold text-ink">Start a watch party</Text>
          <Text className="mt-1 text-[13px] text-sub">Invite friends to react, chat, and make picks together.</Text>

          <Text className="mb-2 mt-5 text-[13px] font-medium text-sub">Party name</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Sunday Squad"
            placeholderTextColor={colors.mute}
            maxLength={32}
            className="h-12 rounded-xl bg-white/10 px-4 text-[15px] text-ink"
          />

          <Text className="mb-2 mt-5 text-[13px] font-medium text-sub">Game</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
            {games.map((g) => (
              <Chip
                key={g.id}
                label={`${getTeam(g.away.teamId).abbr} @ ${getTeam(g.home.teamId).abbr}`}
                selected={selectedGame === g.id}
                onPress={() => setGameId(g.id)}
              />
            ))}
          </ScrollView>

          <View className="mt-5 flex-row items-center justify-between rounded-xl bg-white/10 px-4 py-3">
            <View>
              <Text className="text-[15px] font-semibold text-ink">Private party</Text>
              <Text className="text-xs text-sub">Only people with an invite can join</Text>
            </View>
            <Switch value={isPrivate} onValueChange={setIsPrivate} trackColor={{ true: colors.volt, false: colors.raised }} thumbColor="#fff" />
          </View>

          <Button
            label="Create party"
            icon="sparkles"
            className="mt-6"
            disabled={!canCreate}
            onPress={() => {
              if (!selectedGame || submittedRef.current) return;
              submittedRef.current = true;
              onCreate(name.trim(), selectedGame, isPrivate);
              reset();
            }}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
