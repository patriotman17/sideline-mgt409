// MOCK DATA — fictional users and conversations.
import type { PartyMember, WatchParty } from '@/types';

export const CURRENT_USER_MEMBER: PartyMember = {
  id: 'me',
  name: 'You',
  initials: 'AR',
  color: '#C6FF3D',
};

const M = {
  jordan: { id: 'u-jordan', name: 'Jordan K.', initials: 'JK', color: '#5B8CFF', isHost: true },
  maya: { id: 'u-maya', name: 'Maya P.', initials: 'MP', color: '#FF7AB6' },
  devon: { id: 'u-devon', name: 'Devon W.', initials: 'DW', color: '#FFC94D' },
  sam: { id: 'u-sam', name: 'Sam L.', initials: 'SL', color: '#2EE59D' },
  priya: { id: 'u-priya', name: 'Priya R.', initials: 'PR', color: '#8C7CFF' },
  chris: { id: 'u-chris', name: 'Chris T.', initials: 'CT', color: '#FF8A4D' },
} satisfies Record<string, PartyMember>;

export const MOCK_PARTIES: WatchParty[] = [
  {
    id: 'party-bills',
    name: 'Bills Mafia HQ',
    gameId: 'g-buf-kc',
    hostId: M.jordan.id,
    members: [M.jordan, M.maya, M.devon, M.sam, M.priya, CURRENT_USER_MEMBER],
    isPrivate: false,
    startsLabel: 'Live now',
    reactions: { '🔥': 42, '😱': 17, '🙌': 29, '😤': 8 },
    messages: [
      { id: 'pm1', memberId: M.jordan.id, text: 'THAT SCRAMBLE. Josh is not human 😤', timeLabel: '4:58' },
      { id: 'pm2', memberId: M.maya.id, text: 'Defense needs one more stop. ONE.', timeLabel: '4:51' },
      { id: 'pm3', memberId: M.devon.id, text: 'Sideline AI says 62% we win from here', timeLabel: '4:40' },
      { id: 'pm4', memberId: M.sam.id, text: 'I locked in FG on the drive prediction 🎯', timeLabel: '4:33' },
      { id: 'pm5', memberId: M.priya.id, text: 'Clock management please 🙏', timeLabel: '4:20' },
    ],
  },
  {
    id: 'party-north',
    name: 'Lions Den',
    gameId: 'g-det-gb',
    hostId: M.chris.id,
    members: [{ ...M.chris, isHost: true }, M.sam, M.maya],
    isPrivate: false,
    startsLabel: 'Live now',
    reactions: { '🔥': 12, '😱': 6, '🙌': 9, '😤': 3 },
    messages: [
      { id: 'pn1', memberId: M.chris.id, text: 'Red zone D, let’s go', timeLabel: '8:50' },
    ],
  },
  {
    id: 'party-snf',
    name: 'Sunday Night Crew',
    gameId: 'g-sf-sea',
    hostId: M.priya.id,
    members: [{ ...M.priya, isHost: true }, M.devon, M.jordan, M.chris],
    isPrivate: true,
    startsLabel: 'Sun 8:00 PM ET',
    reactions: {},
    messages: [],
  },
  {
    id: 'party-mnf',
    name: 'MNF Fantasy Sweat',
    gameId: 'g-hou-mia',
    hostId: M.devon.id,
    members: [{ ...M.devon, isHost: true }, M.maya],
    isPrivate: false,
    startsLabel: 'Mon 8:00 PM ET',
    reactions: {},
    messages: [],
  },
];

export const PARTY_REACTIONS = ['🔥', '😱', '🙌', '😤'] as const;
