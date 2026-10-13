/**
 * Supabase client for accounts (auth, profiles, favorite teams).
 *
 * Only the project URL and the *publishable* key ship in the app. Both are public by design;
 * Row Level Security in the database is what protects each user's data. The secret / service-role
 * key is never used anywhere in this app or the Sideline backend.
 *
 * Accounts are optional: with no EXPO_PUBLIC_SUPABASE_* values, `supabase` is null and the app
 * runs in guest demo mode only (replays, Ask AI and picks all keep working).
 *
 * Session storage:
 * - iOS / Android: the session is AES-256 encrypted; the key lives in the Keychain / Keystore
 *   (expo-secure-store) and the ciphertext in AsyncStorage. SecureStore alone can't hold a full
 *   session (values over ~2 KB are rejected on some iOS versions).
 * - Web: the browser's localStorage (supabase-js default). Browsers have no OS keychain, so this
 *   is as secure as any web session: same-origin only, cleared on log out.
 */
// Must run before supabase-js generates PKCE secrets (native platforms lack WebCrypto).
import '@/lib/cryptoPolyfill';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupportedStorage } from '@supabase/supabase-js';
import * as aesjs from 'aes-js';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { AppState, Platform } from 'react-native';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';

/** True when this build has Supabase settings, i.e. Create Account / Log In are available. */
export const ACCOUNTS_ENABLED = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);

/** SecureStore keys may only contain letters, digits, ".", "-" and "_". */
const secureKey = (key: string) => `sideline.${key.replace(/[^a-zA-Z0-9._-]/g, '_')}.key`;

/** Encrypt-at-rest storage for native: random AES-256 key per write, kept in SecureStore. */
export class EncryptedSessionStorage implements SupportedStorage {
  async getItem(key: string): Promise<string | null> {
    const [cipherHex, keyHex] = await Promise.all([
      AsyncStorage.getItem(key),
      SecureStore.getItemAsync(secureKey(key)),
    ]);
    if (!cipherHex || !keyHex) return null;
    try {
      const ctr = new aesjs.ModeOfOperation.ctr(
        aesjs.utils.hex.toBytes(keyHex),
        new aesjs.Counter(1),
      );
      return aesjs.utils.utf8.fromBytes(ctr.decrypt(aesjs.utils.hex.toBytes(cipherHex)));
    } catch {
      return null; // unreadable session (e.g. the key was wiped): treat as logged out
    }
  }

  async setItem(key: string, value: string): Promise<void> {
    const aesKey = Crypto.getRandomValues(new Uint8Array(32));
    const ctr = new aesjs.ModeOfOperation.ctr(aesKey, new aesjs.Counter(1));
    const cipherHex = aesjs.utils.hex.fromBytes(ctr.encrypt(aesjs.utils.utf8.toBytes(value)));
    await SecureStore.setItemAsync(secureKey(key), aesjs.utils.hex.fromBytes(aesKey), {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
    });
    await AsyncStorage.setItem(key, cipherHex);
  }

  async removeItem(key: string): Promise<void> {
    await Promise.all([AsyncStorage.removeItem(key), SecureStore.deleteItemAsync(secureKey(key))]);
  }
}

/** During static web rendering there is no `window`; never touch localStorage there. */
const isServer = Platform.OS === 'web' && typeof window === 'undefined';

function makeClient() {
  return createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      storage: Platform.OS === 'web' ? undefined : new EncryptedSessionStorage(),
      autoRefreshToken: !isServer,
      persistSession: !isServer,
      // Email links are handled explicitly by the /auth/callback and /reset-password routes.
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
  });
}

// One client per JS context: Fast Refresh re-runs this module, so reuse the existing instance.
const globalForSupabase = globalThis as unknown as {
  __sidelineSupabase?: ReturnType<typeof makeClient>;
};
export const supabase = ACCOUNTS_ENABLED
  ? (globalForSupabase.__sidelineSupabase ??= makeClient())
  : null;

// Refresh tokens only while the app is in the foreground (recommended for React Native).
if (supabase && Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
