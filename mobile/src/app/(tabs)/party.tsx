import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Text } from 'react-native';

import { PartyCard, PartyRoom } from '@/components/party';
import {
  EmptyState,
  ListGroup,
  PreviewBanner,
  Screen,
  ScreenHeader,
  SectionHeader,
} from '@/components/ui';
import { isPartyMember, useAppActions, useAppState } from '@/state/AppStore';

export default function WatchPartyScreen() {
  const { parties, activePartyId } = useAppState();
  const actions = useAppActions();
  // Watch parties are a preview: actions that would need real friends and servers explain that instead of
  // pretending to work.
  const [notice, setNotice] = useState(false);
  const comingSoon = () => setNotice(true);

  const active = parties.find((p) => p.id === activePartyId);
  const joined = parties.filter((p) => isPartyMember(p) && p.id !== activePartyId);
  const discover = parties.filter((p) => !isPartyMember(p));

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-bg"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen>
        <ScreenHeader eyebrow="Watch together · Sample data" title="Party" />
        <PreviewBanner
          title="Watch parties with friends"
          body="Watch a game together: live chat, reactions, and a shared leaderboard for big-moment picks. This screen is a design preview with sample parties; real parties are next on the roadmap."
        >
          {notice ? (
            <Text className="mt-2 text-[13px] font-semibold text-ink">
              Creating and joining parties is coming soon. For now, open any game from Scores to
              watch it live.
            </Text>
          ) : null}
        </PreviewBanner>

        {active ? (
          <PartyRoom party={active} onReact={comingSoon} onSend={comingSoon} onLeave={comingSoon} />
        ) : (
          <EmptyState
            icon="people-outline"
            title="Watch parties are coming"
            body="React, chat, and make picks with friends during the game."
          />
        )}

        {joined.length ? (
          <>
            <SectionHeader title="Your parties" />
            <ListGroup inset={80}>
              {joined.map((p) => (
                <PartyCard
                  key={p.id}
                  party={p}
                  joined
                  onJoin={() => {}}
                  onOpen={() => actions.setActiveParty(p.id)}
                />
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
                  onJoin={comingSoon}
                  onOpen={() => {}}
                />
              ))}
            </ListGroup>
          </>
        ) : null}
      </Screen>
    </KeyboardAvoidingView>
  );
}
