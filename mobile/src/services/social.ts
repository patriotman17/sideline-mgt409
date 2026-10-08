// TODO(phase-3): back watch parties with Supabase tables + Realtime channels.
import { CURRENT_USER_MEMBER, MOCK_PARTIES, PARTY_REACTIONS } from '@/data/mock';
import type { PartyMember, WatchParty } from '@/types';

/** Initial parties used to seed local state. */
export const getSeedParties = (): WatchParty[] => JSON.parse(JSON.stringify(MOCK_PARTIES));
export const partyReactions = PARTY_REACTIONS;

/** The signed-in user as a party member. Comes from Supabase auth later. */
export const currentUserMember: PartyMember = CURRENT_USER_MEMBER;
