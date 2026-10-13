/**
 * Accounts: email/password auth, profile, and favorite teams (Supabase).
 * The only module that talks to Supabase tables; screens go through AuthContext.
 */
import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';

import { abbrFromTeamId, diffFavorites, normalizeEmail, teamIdFromAbbr } from '@/lib/account';
import { ApiError, apiGet } from './http';
import type { AccountProfile, AccountProfileUpdate, NflTeam } from '@/types';
import { supabase } from './supabase';

export { ACCOUNTS_ENABLED } from './supabase';

function client() {
  if (!supabase) throw new Error('Accounts are not configured for this build.');
  return supabase;
}

/** Where email links (confirmation, password reset) return: sideline://, exp:// (Expo Go) or the web origin. */
export const authRedirectUrl = (path: 'auth/callback' | 'reset-password') =>
  Linking.createURL(`/${path}`);

// ---------------------------------------------------------------- auth

export async function getSession(): Promise<Session | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export function onAuthChange(cb: (event: string, session: Session | null) => void): () => void {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((event, session) => cb(event, session));
  return () => data.subscription.unsubscribe();
}

/** Returns `needsConfirmation: true` when the user must click the link in their email first. */
export async function signUp(
  email: string,
  password: string,
): Promise<{ needsConfirmation: boolean }> {
  const { data, error } = await client().auth.signUp({
    email: normalizeEmail(email),
    password,
    options: { emailRedirectTo: authRedirectUrl('auth/callback') },
  });
  if (error) throw error;
  return { needsConfirmation: !data.session };
}

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await client().auth.signInWithPassword({
    email: normalizeEmail(email),
    password,
  });
  if (error) throw error;
}

/**
 * Log out of this device: revokes this session's refresh token on Supabase and deletes the stored
 * session (and its encryption key). Other devices stay signed in.
 */
export async function signOut(): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  if (error) throw error;
}

export async function sendPasswordReset(email: string): Promise<void> {
  const { error } = await client().auth.resetPasswordForEmail(normalizeEmail(email), {
    redirectTo: authRedirectUrl('reset-password'),
  });
  if (error) throw error;
}

export async function resendConfirmation(email: string): Promise<void> {
  const { error } = await client().auth.resend({
    type: 'signup',
    email: normalizeEmail(email),
    options: { emailRedirectTo: authRedirectUrl('auth/callback') },
  });
  if (error) throw error;
}

/**
 * Confirm a new account with the 8-digit code from the confirmation email. Starts a session on this
 * device, so it works on any phone or browser (no links to open).
 */
export async function verifySignupCode(email: string, code: string): Promise<void> {
  const { error } = await client().auth.verifyOtp({
    email: normalizeEmail(email),
    token: code,
    type: 'email',
  });
  if (error) throw error;
}

/**
 * Reset a forgotten password with the 8-digit code from the reset email: verify the code (which signs
 * this device in for the recovery), then set the new password. The code is single-use and expires.
 */
export async function resetPasswordWithCode(
  email: string,
  code: string,
  newPassword: string,
): Promise<void> {
  const db = client();
  const { error } = await db.auth.verifyOtp({
    email: normalizeEmail(email),
    token: code,
    type: 'recovery',
  });
  if (error) throw error;
  const { error: updateError } = await db.auth.updateUser({ password: newPassword });
  if (updateError) throw updateError;
}

/** Exchange the `code` from an email link (PKCE) for a session on this device. */
export async function exchangeCode(code: string): Promise<void> {
  const { error } = await client().auth.exchangeCodeForSession(code);
  if (error) throw error;
}

export async function updatePassword(password: string): Promise<void> {
  const { error } = await client().auth.updateUser({ password });
  if (error) throw error;
}

// ---------------------------------------------------------------- profile

interface ProfileRow {
  id: string;
  username: string | null;
  display_name: string | null;
  knowledge_level: AccountProfile['knowledgeLevel'];
  ai_explanation_style: AccountProfile['explanationStyle'];
  spoiler_shield: boolean;
  notifications_enabled: boolean;
  onboarded_at: string | null;
  primary_team_abbr: string | null;
  created_at: string;
  updated_at: string;
}

const PROFILE_COLUMNS =
  'id, username, display_name, knowledge_level, ai_explanation_style, spoiler_shield, notifications_enabled, onboarded_at, primary_team_abbr, created_at, updated_at';

const fromRow = (r: ProfileRow): AccountProfile => ({
  id: r.id,
  username: r.username,
  displayName: r.display_name,
  knowledgeLevel: r.knowledge_level,
  explanationStyle: r.ai_explanation_style,
  spoilerShield: r.spoiler_shield,
  notificationsEnabled: r.notifications_enabled,
  onboardedAt: r.onboarded_at,
  primaryTeamId: r.primary_team_abbr ? teamIdFromAbbr(r.primary_team_abbr) : null,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

function toRow(u: AccountProfileUpdate): Partial<ProfileRow> {
  const row: Partial<ProfileRow> = {};
  if (u.username !== undefined) row.username = u.username;
  if (u.displayName !== undefined) row.display_name = u.displayName?.trim() ?? null;
  if (u.knowledgeLevel !== undefined) row.knowledge_level = u.knowledgeLevel;
  if (u.explanationStyle !== undefined) row.ai_explanation_style = u.explanationStyle;
  if (u.spoilerShield !== undefined) row.spoiler_shield = u.spoilerShield;
  if (u.notificationsEnabled !== undefined) row.notifications_enabled = u.notificationsEnabled;
  if (u.onboardedAt !== undefined) row.onboarded_at = u.onboardedAt;
  if (u.primaryTeamId !== undefined)
    row.primary_team_abbr = u.primaryTeamId ? abbrFromTeamId(u.primaryTeamId) : null;
  return row;
}

/** The signed-in user's profile (RLS returns only their own row). */
export async function getMyProfile(userId: string): Promise<AccountProfile | null> {
  const { data, error } = await client()
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data ? fromRow(data as ProfileRow) : null;
}

export async function updateMyProfile(
  userId: string,
  update: AccountProfileUpdate,
): Promise<AccountProfile> {
  const { data, error } = await client()
    .from('profiles')
    .update(toRow(update))
    .eq('id', userId)
    .select(PROFILE_COLUMNS)
    .single();
  if (error) throw error;
  return fromRow(data as ProfileRow);
}

export async function isUsernameAvailable(username: string): Promise<boolean> {
  const { data, error } = await client().rpc('is_username_available', { candidate: username });
  if (error) throw error;
  return data === true;
}

// ---------------------------------------------------------------- teams

export async function listNflTeams(): Promise<NflTeam[]> {
  const { data, error } = await client()
    .from('nfl_teams')
    .select('abbr, city, name, conference, division')
    .order('abbr');
  if (error) throw error;
  return data as NflTeam[];
}

/** Favorite teams as app team ids (lowercase). */
export async function getMyFavoriteTeams(userId: string): Promise<string[]> {
  const { data, error } = await client()
    .from('favorite_teams')
    .select('team_abbr, created_at')
    .eq('user_id', userId)
    .order('created_at');
  if (error) throw error;
  return (data as { team_abbr: string }[]).map((r) => teamIdFromAbbr(r.team_abbr));
}

/** Make the stored favorites equal `teamIds` (removes first, so swapping at the 8-team limit works). */
export async function setMyFavoriteTeams(
  userId: string,
  current: string[],
  teamIds: string[],
): Promise<string[]> {
  const { add, remove } = diffFavorites(current, teamIds);
  const db = client();
  if (remove.length) {
    const { error } = await db
      .from('favorite_teams')
      .delete()
      .eq('user_id', userId)
      .in('team_abbr', remove.map(abbrFromTeamId));
    if (error) throw error;
  }
  if (add.length) {
    const { error } = await db
      .from('favorite_teams')
      .insert(add.map((id) => ({ user_id: userId, team_abbr: abbrFromTeamId(id) })));
    if (error) throw error;
  }
  return getMyFavoriteTeams(userId);
}

// ---------------------------------------------------------------- Sideline backend

export interface BackendUser {
  id: string;
  email: string | null;
  role: string;
  aal: string | null;
  session_id: string | null;
}

/**
 * Call the Sideline backend as the signed-in user. Uses the current access token; if the backend says
 * it expired (401), refreshes the session once with Supabase and retries. The user id is never sent:
 * the backend reads it from the verified token.
 */
export async function asSignedInUser<T>(call: (accessToken: string) => Promise<T>): Promise<T> {
  const db = client();
  const { data } = await db.auth.getSession();
  if (!data.session) throw new Error('Not signed in');
  try {
    return await call(data.session.access_token);
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 401) throw err;
    const { data: refreshed, error } = await db.auth.refreshSession();
    if (error || !refreshed.session) throw err;
    return call(refreshed.session.access_token);
  }
}

/** Who the backend says this login token belongs to (it verifies the Supabase JWT). */
export const getBackendUser = () =>
  asSignedInUser((token) =>
    apiGet<BackendUser>('/api/v1/me', 5000, { Authorization: `Bearer ${token}` }),
  );

// ---------------------------------------------------------------- saved Discover stories

export async function getMySavedStories(userId: string): Promise<string[]> {
  const { data, error } = await client()
    .from('saved_stories')
    .select('story_id, created_at')
    .eq('user_id', userId)
    .order('created_at');
  if (error) throw error;
  return (data as { story_id: string }[]).map((r) => r.story_id);
}

export async function saveStory(userId: string, storyId: string): Promise<void> {
  const { error } = await client()
    .from('saved_stories')
    .insert({ user_id: userId, story_id: storyId });
  if (error && error.code !== '23505') throw error; // already saved = fine
}

export async function unsaveStory(userId: string, storyId: string): Promise<void> {
  const { error } = await client()
    .from('saved_stories')
    .delete()
    .eq('user_id', userId)
    .eq('story_id', storyId);
  if (error) throw error;
}
