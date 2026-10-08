import { useCallback, useEffect, useRef, useState } from 'react';

import { getReplayInsights, type ReplayAuth, type ReplayInsights } from '@/services';

/** Minimum gap between insight refreshes, to bound AI explanation spend while replays run fast. */
const MIN_REFRESH_MS = 5000;

/**
 * Deterministic insights for the current replay position, with AI explanations
 * generated server-side (and shared across users). Only refreshes while visible.
 */
export function useReplayInsights(auth: ReplayAuth | null, cursor: number | undefined, enabled: boolean) {
  const [data, setData] = useState<ReplayInsights>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const lastFetch = useRef(0);
  const lastCursor = useRef<number | null>(null);

  const load = useCallback(async () => {
    if (!auth) return;
    lastFetch.current = Date.now();
    setLoading(true);
    try {
      setData(await getReplayInsights(auth));
      setError(undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t load insights');
    } finally {
      setLoading(false);
    }
  }, [auth]);

  useEffect(() => {
    if (!enabled || !auth || cursor === undefined || cursor === lastCursor.current) return;
    const wait = Math.max(0, MIN_REFRESH_MS - (Date.now() - lastFetch.current));
    const timer = setTimeout(() => {
      lastCursor.current = cursor;
      load();
    }, wait);
    return () => clearTimeout(timer);
  }, [enabled, auth, cursor, load]);

  return { data, error, loading, reload: load };
}
