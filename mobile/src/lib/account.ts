/**
 * Pure account helpers: validation that mirrors the database constraints, friendly error
 * messages, and the auth-status decision the router guards use. Unit-tested in
 * __tests__/account-test.ts. The database is still the source of truth (RLS + CHECKs).
 */
import type { AccountProfile } from '@/types';

export type AuthStatus = 'loading' | 'signed_out' | 'guest' | 'needs_onboarding' | 'ready';

export const MAX_FAVORITE_TEAMS = 8;
export const MIN_PASSWORD_LENGTH = 8;
/** bcrypt (used by Supabase Auth) only reads the first 72 *bytes*; longer passwords are rejected, never cut. */
export const MAX_PASSWORD_BYTES = 72;

/** UTF-8 byte length (what bcrypt sees): "a" = 1, "é" = 2, "€" = 3, "🏈" = 4. Lone surrogates count as U+FFFD (3). */
export function utf8ByteLength(text: string): number {
  let bytes = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp >= 0xd800 && cp <= 0xdfff) bytes += 3;
    else bytes += cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
  }
  return bytes;
}

/** Email codes (sign-up confirmation, password reset). Must match `auth.email.otp_length`. */
export const EMAIL_CODE_LENGTH = 8;

/** Keep digits only (handles pasted "1234 5678" or "Code: 12345678"). */
export function normalizeCode(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, EMAIL_CODE_LENGTH);
}

export function codeError(code: string): string | null {
  return new RegExp(`^\\d{${EMAIL_CODE_LENGTH}}$`).test(code)
    ? null
    : `Enter the ${EMAIL_CODE_LENGTH}-digit code from the email.`;
}

/** Emails are compared case-insensitively by Supabase; send one canonical form everywhere. */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Lowercase, trim, and swap spaces/dashes for underscores ("Big Fan" → "big_fan"). */
export function normalizeUsername(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

/** Same rule as the `profiles.username` CHECK: 3-20 of a-z, 0-9, _. */
export function usernameError(username: string): string | null {
  if (username.length < 3) return 'At least 3 characters.';
  if (username.length > 20) return 'At most 20 characters.';
  if (!/^[a-z0-9_]+$/.test(username)) return 'Use letters, numbers, and underscores only.';
  return null;
}

export function displayNameError(name: string): string | null {
  const n = name.trim();
  if (!n) return 'Enter a display name.';
  if (n.length > 40) return 'At most 40 characters.';
  return null;
}

export function emailError(email: string): string | null {
  const e = normalizeEmail(email);
  if (e.length > 254) return 'That email address is too long.';
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? null : 'Enter a valid email address.';
}

/** Mirrors the project's auth settings: 8+ characters with letters and digits. */
/**
 * New-password rules (sign up, reset). Mirrors the project's auth settings: 8+ characters with
 * letters and digits; any other characters (spaces, symbols, emoji) are allowed. The 72-byte cap is
 * measured in UTF-8 bytes, so a password is accepted exactly as typed or rejected, never truncated.
 */
export function passwordError(password: string): string | null {
  if ([...password].length < MIN_PASSWORD_LENGTH)
    return `At least ${MIN_PASSWORD_LENGTH} characters.`;
  if (utf8ByteLength(password) > MAX_PASSWORD_BYTES)
    return `Too long: passwords can be up to ${MAX_PASSWORD_BYTES} bytes (accents and emoji count as 2-4).`;
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) return 'Use both letters and numbers.';
  return null;
}

/** Log-in check: only what can't possibly be a valid password (no strength hints, nothing account-specific). */
export function loginPasswordError(password: string): string | null {
  if (!password) return 'Enter your password.';
  if (utf8ByteLength(password) > MAX_PASSWORD_BYTES)
    return `Passwords are at most ${MAX_PASSWORD_BYTES} bytes.`;
  return null;
}

/** Which part of the app a user may see. */
export function authStatus(input: {
  loading: boolean;
  hasSession: boolean;
  demo: boolean;
  profile: Pick<AccountProfile, 'onboardedAt'> | null;
}): AuthStatus {
  if (input.loading) return 'loading';
  if (input.hasSession) {
    if (!input.profile) return 'loading';
    return input.profile.onboardedAt ? 'ready' : 'needs_onboarding';
  }
  return input.demo ? 'guest' : 'signed_out';
}

/** Rows to add and remove to turn `current` favorites into `next`. */
export function diffFavorites(
  current: string[],
  next: string[],
): { add: string[]; remove: string[] } {
  const now = new Set(current);
  const want = new Set(next);
  return { add: next.filter((t) => !now.has(t)), remove: current.filter((t) => !want.has(t)) };
}

/** Primary team first, then the others in their saved order. */
export function orderFavorites(teamIds: string[], primary: string | null): string[] {
  if (!primary || !teamIds.includes(primary)) return teamIds;
  return [primary, ...teamIds.filter((t) => t !== primary)];
}

/** Toggle a team in a favorites list, respecting the 8-team limit. */
export function toggleFavorite(current: string[], team: string): string[] {
  if (current.includes(team)) return current.filter((t) => t !== team);
  return current.length >= MAX_FAVORITE_TEAMS ? current : [...current, team];
}

/** App team id (lowercase) ↔ database abbreviation (uppercase, nflverse; Rams = LA). */
export const teamIdFromAbbr = (abbr: string) => abbr.toLowerCase();
export const abbrFromTeamId = (id: string) => id.toUpperCase();

/** Turn Supabase / Postgres errors into short, user-facing messages. */
export function friendlyAuthError(err: unknown): string {
  const e = (err ?? {}) as { message?: string; code?: string; status?: number };
  const code = e.code ?? '';
  const message = (e.message ?? '').toLowerCase();
  if (code === '23505' || message.includes('profiles_username_key'))
    return 'That username is taken.';
  if (code === 'invalid_credentials' || message.includes('invalid login credentials'))
    return 'Email or password is incorrect.';
  if (code === 'email_not_confirmed' || message.includes('email not confirmed'))
    return 'Confirm your email first. Check your inbox for the link.';
  if (code === 'user_already_exists' || message.includes('already registered'))
    return 'An account with this email already exists. Try logging in.';
  if (code === 'weak_password' || message.includes('password should'))
    return 'Choose a stronger password.';
  if (
    code === 'over_email_send_rate_limit' ||
    code === 'over_request_rate_limit' ||
    e.status === 429
  )
    return 'Too many attempts. Wait a minute and try again.';
  if (message.includes('72') && message.includes('password'))
    return `Passwords can be up to ${MAX_PASSWORD_BYTES} bytes.`;
  if (
    code === 'session_not_found' ||
    code === 'refresh_token_not_found' ||
    code === 'session_expired'
  )
    return 'Your session expired. Log in again.';
  if (
    code === 'otp_expired' ||
    message.includes('token has expired') ||
    message.includes('otp has expired')
  )
    return 'That code is wrong or has expired. Request a new one.';
  if (code === 'same_password') return 'Choose a password you haven’t used here before.';
  if (code === 'reauthentication_needed')
    return 'For security, log in again before changing your password.';
  if (message.includes('network') || message.includes('fetch'))
    return 'Can’t reach Sideline accounts. Check your connection.';
  if (message.includes('at most 8')) return `You can follow up to ${MAX_FAVORITE_TEAMS} teams.`;
  return 'Something went wrong. Please try again.';
}

export const KNOWLEDGE_LEVELS = [
  { value: 'casual', label: 'Casual', hint: 'I watch for the fun of it' },
  { value: 'regular', label: 'Regular', hint: 'I know the rules and the stars' },
  { value: 'expert', label: 'Expert', hint: 'Schemes, matchups, the works' },
] as const;

export const EXPLANATION_STYLES = [
  { value: 'simple', label: 'Simple', hint: 'Short, plain-language answers' },
  { value: 'balanced', label: 'Balanced', hint: 'A bit of context with each answer' },
  { value: 'detailed', label: 'Detailed', hint: 'Deeper breakdowns and stats' },
] as const;
