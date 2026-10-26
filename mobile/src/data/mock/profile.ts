// MOCK DATA — a fictional demo user. Real profiles will come from Supabase auth.
import type { UserProfile, UserSettings } from '@/types';

export const MOCK_PROFILE: UserProfile = {
  id: 'me',
  displayName: 'Alex Rivera',
  handle: '@alexr',
  initials: 'AR',
  memberSince: 'Aug 2026',
  favoriteTeamIds: ['buf', 'det'],
  stats: {
    points: 4820,
    accuracy: 68,
    streak: 5,
    rank: 312,
    partiesHosted: 7,
    wins: 34,
    losses: 16,
    recent: ['W', 'L', 'W', 'W', 'L', 'W', 'W', 'W', 'W', 'W'],
  },
  badges: [
    { id: 'b1', label: 'Hot Streak', icon: 'flame', earned: true },
    { id: 'b2', label: 'Oracle', icon: 'eye', earned: true },
    { id: 'b3', label: 'Party Host', icon: 'people', earned: true },
    { id: 'b4', label: 'Upset Caller', icon: 'flash', earned: false },
    { id: 'b5', label: 'Iron Fan', icon: 'shield-checkmark', earned: false },
  ],
};

export const DEFAULT_SETTINGS: UserSettings = {
  notifications: true,
  spoilerShield: false,
  haptics: true,
  aiCommentary: true,
  showAiUsage: true,
};
