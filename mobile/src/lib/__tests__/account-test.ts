import { describe, expect, it } from '@jest/globals';

import {
  EMAIL_CODE_LENGTH,
  MAX_PASSWORD_BYTES,
  codeError,
  normalizeCode,
  abbrFromTeamId,
  authStatus,
  diffFavorites,
  displayNameError,
  emailError,
  friendlyAuthError,
  loginPasswordError,
  normalizeEmail,
  orderFavorites,
  MAX_FAVORITE_TEAMS,
  normalizeUsername,
  passwordError,
  teamIdFromAbbr,
  toggleFavorite,
  utf8ByteLength,
  usernameError,
} from '../account';

describe('auth status (drives the router guards)', () => {
  const base = { loading: false, hasSession: false, demo: false, profile: null };

  it('is loading while the session is restored', () => {
    expect(authStatus({ ...base, loading: true })).toBe('loading');
  });

  it('signed out shows the welcome screen; Try Demo enters guest mode', () => {
    expect(authStatus(base)).toBe('signed_out');
    expect(authStatus({ ...base, demo: true })).toBe('guest');
  });

  it('a signed-in user waits for the profile, then onboarding until finished', () => {
    expect(authStatus({ ...base, hasSession: true })).toBe('loading');
    expect(authStatus({ ...base, hasSession: true, profile: { onboardedAt: null } })).toBe(
      'needs_onboarding',
    );
    expect(
      authStatus({ ...base, hasSession: true, profile: { onboardedAt: '2026-10-13T00:00:00Z' } }),
    ).toBe('ready');
  });

  it('a real session wins over a leftover demo flag', () => {
    expect(
      authStatus({ ...base, hasSession: true, demo: true, profile: { onboardedAt: null } }),
    ).toBe('needs_onboarding');
  });
});

describe('validation mirrors the database constraints', () => {
  it('usernames: 3-20 of a-z, 0-9, _', () => {
    expect(normalizeUsername('  Big Fan-Club ')).toBe('big_fan_club');
    expect(usernameError('ab')).toBeTruthy();
    expect(usernameError('a'.repeat(21))).toBeTruthy();
    expect(usernameError('bad!name')).toBeTruthy();
    expect(usernameError('jordan_lee_23')).toBeNull();
  });

  it('display names: 1-40 visible characters', () => {
    expect(displayNameError('   ')).toBeTruthy();
    expect(displayNameError('x'.repeat(41))).toBeTruthy();
    expect(displayNameError('Jordan Lee')).toBeNull();
  });

  it('passwords: 8+ characters with letters and digits', () => {
    expect(passwordError('short1')).toBeTruthy();
    expect(passwordError('lettersonly')).toBeTruthy();
    expect(passwordError('12345678')).toBeTruthy();
    expect(passwordError('touchdown24')).toBeNull();
  });

  it('emails', () => {
    expect(emailError('nope')).toBeTruthy();
    expect(emailError(' fan@example.com ')).toBeNull();
  });
});

describe('favorite teams', () => {
  it('toggles and stops at the 8-team limit', () => {
    expect(toggleFavorite(['kc'], 'buf')).toEqual(['kc', 'buf']);
    expect(toggleFavorite(['kc', 'buf'], 'kc')).toEqual(['buf']);
    const full = Array.from({ length: MAX_FAVORITE_TEAMS }, (_, i) => `t${i}`);
    expect(toggleFavorite(full, 'extra')).toEqual(full);
    expect(toggleFavorite(full, 't0')).toHaveLength(MAX_FAVORITE_TEAMS - 1);
  });

  it('diffs into rows to add and remove', () => {
    expect(diffFavorites(['kc', 'buf', 'sf'], ['buf', 'det'])).toEqual({
      add: ['det'],
      remove: ['kc', 'sf'],
    });
    expect(diffFavorites([], [])).toEqual({ add: [], remove: [] });
  });

  it('maps app ids to database abbreviations (Rams = LA)', () => {
    expect(abbrFromTeamId('la')).toBe('LA');
    expect(teamIdFromAbbr('KC')).toBe('kc');
  });
});

describe('friendly errors', () => {
  it('maps Supabase and Postgres errors', () => {
    expect(friendlyAuthError({ code: '23505' })).toBe('That username is taken.');
    expect(friendlyAuthError({ code: 'invalid_credentials' })).toBe(
      'Email or password is incorrect.',
    );
    expect(friendlyAuthError({ message: 'Email not confirmed' })).toMatch(/Confirm your email/);
    expect(friendlyAuthError({ status: 429 })).toMatch(/Too many attempts/);
    expect(friendlyAuthError({ message: 'You can follow at most 8 favorite teams.' })).toMatch(
      /up to 8/,
    );
    expect(friendlyAuthError(new Error('boom'))).toBe('Something went wrong. Please try again.');
  });
});

describe('passwords: bcrypt-safe, measured in UTF-8 bytes, never truncated', () => {
  it('counts UTF-8 bytes, not characters', () => {
    expect(utf8ByteLength('abc')).toBe(3);
    expect(utf8ByteLength('é')).toBe(2);
    expect(utf8ByteLength('€')).toBe(3);
    expect(utf8ByteLength('🏈')).toBe(4); // one character, two UTF-16 units, four bytes
    expect(utf8ByteLength('\ud800')).toBe(3); // lone surrogate is sent as U+FFFD
  });

  it('accepts exactly 72 bytes and rejects 73, whatever the characters', () => {
    const ascii72 = 'a1'.repeat(36);
    expect(utf8ByteLength(ascii72)).toBe(MAX_PASSWORD_BYTES);
    expect(passwordError(ascii72)).toBeNull();
    expect(passwordError(ascii72 + 'x')).toMatch(/72 bytes/);
    // 36 characters but 72 bytes (2-byte é): fine. One more é = 74 bytes: rejected.
    const accented = 'é'.repeat(34) + 'a1';
    expect(utf8ByteLength(accented)).toBe(70);
    expect(passwordError(accented + 'é')).toBeNull(); // 72 bytes
    expect(passwordError(accented + 'éé')).toMatch(/72 bytes/); // 74 bytes, only 37 characters
    // Emoji: 18 footballs = 72 bytes but no letters/digits; with letters it's over the cap.
    expect(passwordError('🏈'.repeat(17) + 'a1')).toBeNull(); // 68 + 2 = 70 bytes
    expect(passwordError('🏈'.repeat(18) + 'a1')).toMatch(/72 bytes/); // 74 bytes
  });

  it('allows long passphrases, spaces, and symbols up to the cap', () => {
    expect(passwordError('correct horse battery staple 42!')).toBeNull();
    expect(passwordError('P@$$w0rd-with_symbols#2026')).toBeNull();
    expect(passwordError('short1')).toMatch(/8 characters/);
  });

  it('counts the minimum in characters (emoji count once)', () => {
    expect(passwordError('🏈🏈🏈🏈🏈🏈a1')).toBeNull(); // 8 characters
    expect(passwordError('🏈🏈🏈🏈🏈a1')).toMatch(/8 characters/); // 7 characters
  });

  it('login only rejects what cannot be a valid password (no strength hints)', () => {
    expect(loginPasswordError('')).toBe('Enter your password.');
    expect(loginPasswordError('x')).toBeNull(); // wrong passwords are Supabase's call
    expect(loginPasswordError('a'.repeat(73))).toMatch(/72 bytes/);
  });
});

describe('emails and favorites', () => {
  it('normalizes emails the same way everywhere', () => {
    expect(normalizeEmail('  Fan@Example.COM ')).toBe('fan@example.com');
    expect(emailError(`${'a'.repeat(250)}@x.co`)).toMatch(/too long/);
  });

  it('puts the primary team first', () => {
    expect(orderFavorites(['kc', 'buf', 'sf'], 'sf')).toEqual(['sf', 'kc', 'buf']);
    expect(orderFavorites(['kc', 'buf'], 'det')).toEqual(['kc', 'buf']); // not a favorite: ignored
    expect(orderFavorites(['kc'], null)).toEqual(['kc']);
  });
});

describe('email codes (sign-up confirmation, password reset)', () => {
  it('matches the project setting: 8 digits', () => {
    expect(EMAIL_CODE_LENGTH).toBe(8);
  });

  it('keeps digits only, from typed or pasted text', () => {
    expect(normalizeCode('1234 5678')).toBe('12345678');
    expect(normalizeCode('Your code: 87654321.')).toBe('87654321');
    expect(normalizeCode('123456789012')).toBe('12345678'); // never longer than a code
  });

  it('requires exactly 8 digits', () => {
    expect(codeError('12345678')).toBeNull();
    expect(codeError('1234567')).toMatch(/8-digit/);
    expect(codeError('')).toMatch(/8-digit/);
  });

  it('wrong or expired codes get one clear message', () => {
    expect(friendlyAuthError({ code: 'otp_expired' })).toMatch(/wrong or has expired/);
    expect(friendlyAuthError({ message: 'Token has expired or is invalid' })).toMatch(
      /wrong or has expired/,
    );
  });
});
