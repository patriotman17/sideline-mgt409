/**
 * One place for "who is this user and what do they like": the signed-in account when there is one,
 * otherwise the local demo profile. Screens use this instead of reading AppStore or AuthContext
 * directly, so guests keep the sample experience and accounts get their own data.
 */
import { useMemo } from 'react';

import { orderFavorites } from '@/lib/account';
import type { ExplanationStyle, KnowledgeLevel } from '@/types';
import { useAppActions, useAppState } from './AppStore';
import { useAuth } from './AuthContext';

export interface AiPreferences {
  knowledgeLevel: KnowledgeLevel;
  explanationStyle: ExplanationStyle;
}

export function usePersonalization() {
  const { profile: demo, settings, savedStoryIds } = useAppState();
  const { toggleSaveStory } = useAppActions();
  const auth = useAuth();
  const account = auth.status === 'ready' ? auth.profile : null;

  return useMemo(() => {
    const favoriteTeamIds = account
      ? orderFavorites(auth.favoriteTeams, account.primaryTeamId)
      : demo.favoriteTeamIds;
    const aiPreferences: AiPreferences | null = account
      ? { knowledgeLevel: account.knowledgeLevel, explanationStyle: account.explanationStyle }
      : null;
    return {
      signedIn: !!account,
      initials: account ? initialsOf(account.displayName ?? '') : demo.initials,
      /** Primary team first, then the rest in the order they were added. */
      favoriteTeamIds,
      primaryTeamId: account ? account.primaryTeamId : (demo.favoriteTeamIds[0] ?? null),
      spoilerShield: account ? account.spoilerShield : settings.spoilerShield,
      savedStoryIds: account ? auth.savedStories : savedStoryIds,
      toggleSaveStory: account
        ? (id: string) => auth.toggleSavedStory(id).catch(() => {})
        : (id: string) => toggleSaveStory(id),
      /** Sent to Ask Sideline as validated settings; null for guests (server defaults). */
      aiPreferences,
    };
  }, [account, auth, demo, settings.spoilerShield, savedStoryIds, toggleSaveStory]);
}

export function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join('') || '?'
  );
}
