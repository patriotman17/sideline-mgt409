/**
 * WebCrypto pieces supabase-js needs, for iOS/Android (Hermes has no `crypto.subtle`).
 *
 * Without this, supabase-js falls back to `Math.random()` for the PKCE code verifier and sends it in
 * "plain" instead of a SHA-256 challenge. Both are backed by the OS's secure crypto via expo-crypto.
 * Browsers already have WebCrypto, so this only fills gaps and never replaces an existing API.
 */
import * as ExpoCrypto from 'expo-crypto';
import { Platform } from 'react-native';

type CryptoLike = {
  getRandomValues?: <T extends ArrayBufferView | null>(array: T) => T;
  subtle?: { digest: (algorithm: string, data: BufferSource) => Promise<ArrayBuffer> };
};

const DIGESTS: Record<string, ExpoCrypto.CryptoDigestAlgorithm> = {
  'SHA-1': ExpoCrypto.CryptoDigestAlgorithm.SHA1,
  'SHA-256': ExpoCrypto.CryptoDigestAlgorithm.SHA256,
  'SHA-384': ExpoCrypto.CryptoDigestAlgorithm.SHA384,
  'SHA-512': ExpoCrypto.CryptoDigestAlgorithm.SHA512,
};

export function installCryptoPolyfill(): void {
  if (Platform.OS === 'web') return;
  const g = globalThis as unknown as { crypto?: CryptoLike };
  const c: CryptoLike = g.crypto ?? {};
  if (typeof c.getRandomValues !== 'function') {
    c.getRandomValues = <T extends ArrayBufferView | null>(array: T): T => {
      ExpoCrypto.getRandomValues(array as unknown as Uint8Array);
      return array;
    };
  }
  if (!c.subtle || typeof c.subtle.digest !== 'function') {
    c.subtle = {
      digest: (algorithm: string, data: BufferSource) => {
        const alg = DIGESTS[algorithm.toUpperCase()];
        if (!alg) return Promise.reject(new Error(`Unsupported digest: ${algorithm}`));
        return ExpoCrypto.digest(alg, data);
      },
    };
  }
  g.crypto = c;
}

installCryptoPolyfill();
