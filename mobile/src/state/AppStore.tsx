/**
 * Local, in-memory app state for Phase 1. Holds everything the user can change
 * (picks, chat, parties, follows, settings). Later this becomes a thin cache
 * over Supabase/back-end data; components only use the hooks exported here.
 */
import { createContext, useContext, useMemo, useReducer, type ReactNode } from 'react';

import { createId } from '@/lib/id';
import { currentUserMember as CURRENT_USER_MEMBER, getDefaultSettings, getSeedParties, getSeedProfile } from '@/services';
import type { ChatMessage, UserProfile, UserSettings, WatchParty } from '@/types';

interface AppState {
  profile: UserProfile;
  settings: UserSettings;
  /** predictionId -> chosen optionId */
  picks: Record<string, string>;
  /** gameId -> AI chat transcript */
  chats: Record<string, ChatMessage[]>;
  parties: WatchParty[];
  /** partyId the user is currently "in" */
  activePartyId: string | null;
  savedStoryIds: string[];
}

type Action =
  | { type: 'pick'; predictionId: string; optionId: string }
  | { type: 'chat/append'; gameId: string; message: ChatMessage }
  | { type: 'chat/clear'; gameId: string }
  | { type: 'team/toggleFollow'; teamId: string }
  | { type: 'settings/set'; key: keyof UserSettings; value: boolean }
  | { type: 'party/join'; partyId: string }
  | { type: 'party/leave'; partyId: string }
  | { type: 'party/setActive'; partyId: string }
  | { type: 'party/message'; partyId: string; text: string }
  | { type: 'party/react'; partyId: string; emoji: string }
  | { type: 'party/create'; name: string; gameId: string; isPrivate: boolean }
  | { type: 'story/toggleSave'; storyId: string };

const isMember = (party: WatchParty) => party.members.some((m) => m.id === CURRENT_USER_MEMBER.id);

function updateParty(state: AppState, id: string, fn: (p: WatchParty) => WatchParty): AppState {
  return { ...state, parties: state.parties.map((p) => (p.id === id ? fn(p) : p)) };
}

function nowLabel() {
  const d = new Date();
  return `${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'pick': {
      const isNewPick = !(action.predictionId in state.picks);
      return {
        ...state,
        picks: { ...state.picks, [action.predictionId]: action.optionId },
        // Mock: award a small participation bonus for first-time picks.
        profile: isNewPick
          ? { ...state.profile, stats: { ...state.profile.stats, points: state.profile.stats.points + 10 } }
          : state.profile,
      };
    }
    case 'chat/append':
      return {
        ...state,
        chats: { ...state.chats, [action.gameId]: [...(state.chats[action.gameId] ?? []), action.message] },
      };
    case 'chat/clear':
      return { ...state, chats: { ...state.chats, [action.gameId]: [] } };
    case 'team/toggleFollow': {
      const ids = state.profile.favoriteTeamIds;
      const favoriteTeamIds = ids.includes(action.teamId)
        ? ids.filter((id) => id !== action.teamId)
        : [...ids, action.teamId];
      return { ...state, profile: { ...state.profile, favoriteTeamIds } };
    }
    case 'settings/set':
      return { ...state, settings: { ...state.settings, [action.key]: action.value } };
    case 'party/join':
      return {
        ...updateParty(state, action.partyId, (p) =>
          isMember(p) ? p : { ...p, members: [...p.members, CURRENT_USER_MEMBER] },
        ),
        activePartyId: action.partyId,
      };
    case 'party/leave': {
      const next = updateParty(state, action.partyId, (p) => ({
        ...p,
        members: p.members.filter((m) => m.id !== CURRENT_USER_MEMBER.id),
      }));
      const fallback = next.parties.find(isMember)?.id ?? null;
      return { ...next, activePartyId: state.activePartyId === action.partyId ? fallback : state.activePartyId };
    }
    case 'party/setActive':
      return { ...state, activePartyId: action.partyId };
    case 'party/message':
      return updateParty(state, action.partyId, (p) => ({
        ...p,
        messages: [
          { id: createId('pm'), memberId: CURRENT_USER_MEMBER.id, text: action.text, timeLabel: nowLabel() },
          ...p.messages,
        ],
      }));
    case 'party/react':
      return updateParty(state, action.partyId, (p) => ({
        ...p,
        reactions: { ...p.reactions, [action.emoji]: (p.reactions[action.emoji] ?? 0) + 1 },
      }));
    case 'party/create': {
      const party: WatchParty = {
        id: createId('party'),
        name: action.name,
        gameId: action.gameId,
        hostId: CURRENT_USER_MEMBER.id,
        members: [{ ...CURRENT_USER_MEMBER, isHost: true }],
        messages: [],
        reactions: {},
        isPrivate: action.isPrivate,
        startsLabel: 'Starting soon',
      };
      return {
        ...state,
        parties: [party, ...state.parties],
        activePartyId: party.id,
        profile: {
          ...state.profile,
          stats: { ...state.profile.stats, partiesHosted: state.profile.stats.partiesHosted + 1 },
        },
      };
    }
    case 'story/toggleSave': {
      const saved = state.savedStoryIds.includes(action.storyId);
      return {
        ...state,
        savedStoryIds: saved
          ? state.savedStoryIds.filter((id) => id !== action.storyId)
          : [...state.savedStoryIds, action.storyId],
      };
    }
    default:
      return state;
  }
}

function initState(): AppState {
  const parties = getSeedParties();
  return {
    profile: getSeedProfile(),
    settings: getDefaultSettings(),
    picks: { p4: 'kc' },
    chats: {},
    parties,
    activePartyId: parties.find(isMember)?.id ?? null,
    savedStoryIds: [],
  };
}

const StateContext = createContext<AppState | null>(null);
const DispatchContext = createContext<React.Dispatch<Action> | null>(null);

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initState);
  return (
    <DispatchContext.Provider value={dispatch}>
      <StateContext.Provider value={state}>{children}</StateContext.Provider>
    </DispatchContext.Provider>
  );
}

export function useAppState(): AppState {
  const ctx = useContext(StateContext);
  if (!ctx) throw new Error('useAppState must be used inside <AppStoreProvider>');
  return ctx;
}

/** Typed action helpers so components never build raw actions. */
export function useAppActions() {
  const dispatch = useContext(DispatchContext);
  if (!dispatch) throw new Error('useAppActions must be used inside <AppStoreProvider>');
  return useMemo(
    () => ({
      pick: (predictionId: string, optionId: string) => dispatch({ type: 'pick', predictionId, optionId }),
      appendChat: (gameId: string, message: ChatMessage) => dispatch({ type: 'chat/append', gameId, message }),
      clearChat: (gameId: string) => dispatch({ type: 'chat/clear', gameId }),
      toggleFollowTeam: (teamId: string) => dispatch({ type: 'team/toggleFollow', teamId }),
      setSetting: (key: keyof UserSettings, value: boolean) => dispatch({ type: 'settings/set', key, value }),
      joinParty: (partyId: string) => dispatch({ type: 'party/join', partyId }),
      leaveParty: (partyId: string) => dispatch({ type: 'party/leave', partyId }),
      setActiveParty: (partyId: string) => dispatch({ type: 'party/setActive', partyId }),
      sendPartyMessage: (partyId: string, text: string) => dispatch({ type: 'party/message', partyId, text }),
      reactInParty: (partyId: string, emoji: string) => dispatch({ type: 'party/react', partyId, emoji }),
      createParty: (name: string, gameId: string, isPrivate: boolean) =>
        dispatch({ type: 'party/create', name, gameId, isPrivate }),
      toggleSaveStory: (storyId: string) => dispatch({ type: 'story/toggleSave', storyId }),
    }),
    [dispatch],
  );
}

export const isPartyMember = isMember;
