/**
 * Auth + account state for the whole app.
 *
 * `status` drives the router guards in src/app/_layout.tsx:
 *   signed_out       → Welcome / Log In / Create Account
 *   guest            → the full app in demo mode (no account, no Supabase needed)
 *   needs_onboarding → Onboarding (identity, teams, preferences)
 *   ready            → the full app with the user's profile
 *
 * Route guards only control navigation. Access to account data is enforced by Supabase RLS and, for
 * backend endpoints, by JWT verification in FastAPI.
 *
 * Private account data (profile, teams, saved stories) lives only in this provider's memory and is
 * cleared on sign-out; the root layout also remounts the local app store per user, so nothing from
 * one account (or the demo) carries over to the next.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { authStatus, type AuthStatus } from '@/lib/account';
import {
  ACCOUNTS_ENABLED,
  getMyFavoriteTeams,
  getMyProfile,
  getMySavedStories,
  getSession,
  resetPasswordWithCode,
  onAuthChange,
  saveStory,
  sendPasswordReset,
  setMyFavoriteTeams,
  signIn,
  signOut,
  signUp,
  unsaveStory,
  updateMyProfile,
  updatePassword,
  verifySignupCode,
} from '@/services/account';
import type {
  AccountProfile,
  AccountProfileUpdate,
  ExplanationStyle,
  KnowledgeLevel,
} from '@/types';

const DEMO_KEY = 'sideline.demo_mode';

export interface OnboardingAnswers {
  username: string;
  displayName: string;
  teamIds: string[];
  primaryTeamId: string | null;
  knowledgeLevel: KnowledgeLevel;
  explanationStyle: ExplanationStyle;
  spoilerShield: boolean;
  notificationsEnabled: boolean;
}

interface AuthValue {
  status: AuthStatus;
  /** False when this build has no Supabase settings: only the guest demo is available. */
  accountsEnabled: boolean;
  session: Session | null;
  email: string | null;
  profile: AccountProfile | null;
  /** App team ids (lowercase), in the order they were added. */
  favoriteTeams: string[];
  savedStories: string[];
  /** Set when the profile couldn't be loaded (e.g. offline); `retry` tries again. */
  profileError: string | null;
  retry: () => void;
  startDemo: () => Promise<void>;
  exitDemo: () => Promise<void>;
  signUp: (email: string, password: string) => Promise<{ needsConfirmation: boolean }>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  /** Confirm sign-up with the emailed 8-digit code (signs this device in). */
  verifySignupCode: (email: string, code: string) => Promise<void>;
  /** Reset a forgotten password with the emailed 8-digit code (signs this device in). */
  resetPasswordWithCode: (email: string, code: string, newPassword: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  updateProfile: (update: AccountProfileUpdate) => Promise<AccountProfile>;
  setFavoriteTeams: (teamIds: string[]) => Promise<void>;
  toggleSavedStory: (storyId: string) => Promise<void>;
  /** Save every onboarding answer, then mark onboarding complete. */
  completeOnboarding: (answers: OnboardingAnswers) => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [booting, setBooting] = useState(true);
  const [demo, setDemo] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [favoriteTeams, setFavorites] = useState<string[]>([]);
  const [savedStories, setSaved] = useState<string[]>([]);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const userId = session?.user.id ?? null;

  // Boot: restore demo flag + stored session, then follow auth changes (sign in/out, token refresh,
  // or a refresh failure, which signs the user out).
  useEffect(() => {
    let alive = true;
    (async () => {
      const [demoFlag, stored] = await Promise.all([
        AsyncStorage.getItem(DEMO_KEY).catch(() => null),
        getSession().catch(() => null),
      ]);
      if (!alive) return;
      setDemo(demoFlag === '1');
      setSession(stored);
      setBooting(false);
    })();
    const unsubscribe = onAuthChange((_event, next) => {
      // Don't call Supabase inside this callback (it can deadlock); just record the session.
      setSession(next);
    });
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  // Load the account whenever the signed-in user changes; clear it when they sign out.
  useEffect(() => {
    if (!userId) {
      const t = setTimeout(() => {
        setProfile(null);
        setFavorites([]);
        setSaved([]);
        setProfileError(null);
      }, 0);
      return () => clearTimeout(t);
    }
    let alive = true;
    (async () => {
      try {
        const [p, teams, stories] = await Promise.all([
          getMyProfile(userId),
          getMyFavoriteTeams(userId),
          getMySavedStories(userId),
        ]);
        if (!alive) return;
        setProfile(p);
        setFavorites(teams);
        setSaved(stories);
        setProfileError(p ? null : 'Your profile is still being created. Try again in a moment.');
      } catch {
        if (alive) setProfileError('Couldn’t load your profile. Check your connection.');
      }
    })();
    return () => {
      alive = false;
    };
  }, [userId, reload]);

  const status = authStatus({ loading: booting, hasSession: !!session, demo, profile });

  const startDemo = useCallback(async () => {
    await AsyncStorage.setItem(DEMO_KEY, '1').catch(() => {});
    setDemo(true);
  }, []);

  const exitDemo = useCallback(async () => {
    await AsyncStorage.removeItem(DEMO_KEY).catch(() => {});
    setDemo(false);
  }, []);

  const doSignIn = useCallback(async (email: string, password: string) => {
    await signIn(email, password);
    await AsyncStorage.removeItem(DEMO_KEY).catch(() => {});
    setDemo(false);
  }, []);

  const leaveDemo = useCallback(async () => {
    await AsyncStorage.removeItem(DEMO_KEY).catch(() => {});
    setDemo(false);
  }, []);

  const doVerifySignupCode = useCallback(
    async (email: string, code: string) => {
      await verifySignupCode(email, code);
      await leaveDemo();
    },
    [leaveDemo],
  );

  const doResetPasswordWithCode = useCallback(
    async (email: string, code: string, newPassword: string) => {
      await resetPasswordWithCode(email, code, newPassword);
      await leaveDemo();
    },
    [leaveDemo],
  );

  const doSignOut = useCallback(async () => {
    try {
      await signOut();
    } finally {
      // Clear private state even if the network call failed.
      setSession(null);
      setProfile(null);
      setFavorites([]);
      setSaved([]);
    }
  }, []);

  const updateProfile = useCallback(
    async (update: AccountProfileUpdate) => {
      if (!userId) throw new Error('Not signed in');
      const next = await updateMyProfile(userId, update);
      setProfile(next);
      return next;
    },
    [userId],
  );

  const setFavoriteTeams = useCallback(
    async (teamIds: string[]) => {
      if (!userId) throw new Error('Not signed in');
      const next = await setMyFavoriteTeams(userId, favoriteTeams, teamIds);
      setFavorites(next);
      // Unfollowing the primary team clears it in the database; mirror that here.
      if (profile?.primaryTeamId && !next.includes(profile.primaryTeamId)) {
        setProfile({ ...profile, primaryTeamId: null });
      }
    },
    [userId, favoriteTeams, profile],
  );

  const toggleSavedStory = useCallback(
    async (storyId: string) => {
      if (!userId) throw new Error('Not signed in');
      const saved = savedStories.includes(storyId);
      // Optimistic, then roll back if the database refuses.
      setSaved((s) => (saved ? s.filter((id) => id !== storyId) : [...s, storyId]));
      try {
        if (saved) await unsaveStory(userId, storyId);
        else await saveStory(userId, storyId);
      } catch (err) {
        setSaved((s) => (saved ? [...s, storyId] : s.filter((id) => id !== storyId)));
        throw err;
      }
    },
    [userId, savedStories],
  );

  const completeOnboarding = useCallback(
    async ({ teamIds, primaryTeamId, ...answers }: OnboardingAnswers) => {
      if (!userId) throw new Error('Not signed in');
      await updateMyProfile(userId, answers); // username uniqueness is checked here first
      setFavorites(await setMyFavoriteTeams(userId, favoriteTeams, teamIds));
      setProfile(
        await updateMyProfile(userId, {
          primaryTeamId: primaryTeamId && teamIds.includes(primaryTeamId) ? primaryTeamId : null,
          onboardedAt: new Date().toISOString(),
        }),
      );
      await AsyncStorage.removeItem(DEMO_KEY).catch(() => {});
      setDemo(false);
    },
    [userId, favoriteTeams],
  );

  const value = useMemo<AuthValue>(
    () => ({
      status,
      accountsEnabled: ACCOUNTS_ENABLED,
      session,
      email: session?.user.email ?? null,
      profile,
      favoriteTeams,
      savedStories,
      profileError,
      retry: () => setReload((n) => n + 1),
      startDemo,
      exitDemo,
      signUp,
      signIn: doSignIn,
      signOut: doSignOut,
      sendPasswordReset,
      verifySignupCode: doVerifySignupCode,
      resetPasswordWithCode: doResetPasswordWithCode,
      updatePassword,
      updateProfile,
      setFavoriteTeams,
      toggleSavedStory,
      completeOnboarding,
    }),
    [
      status,
      session,
      profile,
      favoriteTeams,
      savedStories,
      profileError,
      startDemo,
      exitDemo,
      doSignIn,
      doSignOut,
      doVerifySignupCode,
      doResetPasswordWithCode,
      updateProfile,
      setFavoriteTeams,
      toggleSavedStory,
      completeOnboarding,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
