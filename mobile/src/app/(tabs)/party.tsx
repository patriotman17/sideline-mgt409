import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform } from 'react-native';

import { CreatePartySheet, PartyCard, PartyRoom } from '@/components/party';
import { Button, EmptyState, IconButton, ListGroup, Screen, ScreenHeader, SectionHeader } from '@/components/ui';
import { useHaptics } from '@/lib/haptics';
import { listPartyEligibleGames } from '@/services';
import { isPartyMember, useAppActions, useAppState } from '@/state/AppStore';

export default function WatchPartyScreen() {
  const { parties, activePartyId } = useAppState();
  const actions = useAppActions();
  const { success } = useHaptics();
  const [creating, setCreating] = useState(false);

  const active = parties.find((p) => p.id === activePartyId);
  const joined = parties.filter((p) => isPartyMember(p) && p.id !== activePartyId);
  const discover = parties.filter((p) => !isPartyMember(p));
  const partyGames = useMemo(() => listPartyEligibleGames(), []);

  return (
    <KeyboardAvoidingView className="flex-1 bg-bg" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <ScreenHeader
          eyebrow="Watch together · Sample data"
          title="Party"
          right={<IconButton icon="add" accessibilityLabel="Create watch party" onPress={() => setCreating(true)} />}
        />

        {active ? (
          <PartyRoom
            party={active}
            onReact={(emoji) => actions.reactInParty(active.id, emoji)}
            onSend={(text) => actions.sendPartyMessage(active.id, text)}
            onLeave={() => actions.leaveParty(active.id)}
          />
        ) : (
          <EmptyState icon="people-outline" title="Start a watch party" body="React, chat, and make picks with friends during the game.">
            <Button label="Start a party" icon="add" onPress={() => setCreating(true)} />
          </EmptyState>
        )}

        {joined.length ? (
          <>
            <SectionHeader title="Your parties" />
            <ListGroup inset={80}>
              {joined.map((p) => (
                <PartyCard key={p.id} party={p} joined onJoin={() => {}} onOpen={() => actions.setActiveParty(p.id)} />
              ))}
            </ListGroup>
          </>
        ) : null}

        {discover.length ? (
          <>
            <SectionHeader title="Join a party" />
            <ListGroup inset={80}>
              {discover.map((p) => (
                <PartyCard
                  key={p.id}
                  party={p}
                  joined={false}
                  onJoin={() => {
                    success();
                    actions.joinParty(p.id);
                  }}
                  onOpen={() => {}}
                />
              ))}
            </ListGroup>
          </>
        ) : null}
      </Screen>

      <CreatePartySheet
        visible={creating}
        games={partyGames}
        onClose={() => setCreating(false)}
        onCreate={(name, gameId, isPrivate) => {
          success();
          actions.createParty(name, gameId, isPrivate);
          setCreating(false);
        }}
      />
    </KeyboardAvoidingView>
  );
}
