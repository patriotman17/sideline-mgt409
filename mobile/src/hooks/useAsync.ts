import { useCallback, useEffect, useState } from 'react';

interface AsyncState<T> {
  data: T | undefined;
  loading: boolean;
  error: Error | undefined;
  reload: () => void;
}

interface Settled<T> {
  key: string;
  data?: T;
  error?: Error;
}

/**
 * Tiny data-loading hook for service calls. `deps` should be primitives.
 * Swap for TanStack Query when we add real network data, caching, and
 * refetch-on-focus. Previous data is kept while reloading.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: readonly (string | number | boolean | undefined)[] = []): AsyncState<T> {
  const [nonce, setNonce] = useState(0);
  const [settled, setSettled] = useState<Settled<T>>({ key: '' });
  const key = JSON.stringify([...deps, nonce]);

  useEffect(() => {
    let active = true;
    fn().then(
      (data) => active && setSettled({ key, data }),
      (err: unknown) =>
        active && setSettled((prev) => ({ key, data: prev.data, error: err instanceof Error ? err : new Error(String(err)) })),
    );
    return () => {
      active = false;
    };
    // `key` encodes deps + reload nonce; `fn` is intentionally not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data: settled.data, error: settled.error, loading: settled.key !== key, reload };
}
