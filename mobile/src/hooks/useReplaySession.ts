import { useCallback, useEffect, useRef, useState } from 'react';

import {
  ApiError,
  controlReplay,
  endReplay,
  getReplay,
  setReplaySpeed,
  startReplay,
  stepReplay,
  type MomentHolds,
  type ReplayAuth,
  type ReplayControl,
  type ReplaySnapshot,
} from '@/services';

/** Polling interval while a replay is playing. WebSockets can replace this later. */
const POLL_MS = 1000;

/**
 * Owns one backend replay session for a game: creates it on mount, polls while
 * playing, exposes playback controls, and deletes the session on unmount.
 */
export function useReplaySession(gameId: string, startCursor = 0, momentHolds: MomentHolds = 'big') {
  // The hold level only matters when the session is created; later changes go through Picks settings.
  const [initialHolds] = useState(momentHolds);
  const [snapshot, setSnapshot] = useState<ReplaySnapshot>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // Session id + secret token live only in memory for this screen.
  const sessionRef = useRef<ReplayAuth | null>(null);
  const [auth, setAuth] = useState<ReplayAuth | null>(null);

  // Create (and later clean up) the session.
  useEffect(() => {
    let active = true;
    startReplay(gameId, 1, startCursor, initialHolds).then(
      ({ session_token, ...snap }) => {
        const created = { sessionId: snap.session_id, token: session_token };
        if (!active) {
          endReplay(created).catch(() => {});
          return;
        }
        sessionRef.current = created;
        setAuth(created);
        setSnapshot(snap);
        setError(undefined);
      },
      (err: unknown) => active && setError(err instanceof Error ? err.message : 'Could not start replay'),
    );
    return () => {
      active = false;
      const current = sessionRef.current;
      sessionRef.current = null;
      if (current) endReplay(current).catch(() => {});
    };
  }, [gameId, startCursor, initialHolds, attempt]);

  // Poll while playing.
  const playing = snapshot?.playback.status === 'playing';
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      const current = sessionRef.current;
      if (!current) return;
      getReplay(current).then(setSnapshot, (err: unknown) => {
        if (err instanceof ApiError && err.status === 404) setError('This replay session expired.');
      });
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [playing]);

  const run = useCallback(async (request: (a: ReplayAuth) => Promise<ReplaySnapshot>) => {
    const current = sessionRef.current;
    if (!current) return;
    setBusy(true);
    try {
      setSnapshot(await request(current));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Replay request failed');
    } finally {
      setBusy(false);
    }
  }, []);

  const control = useCallback((action: ReplayControl) => run((a) => controlReplay(a, action)), [run]);
  const setSpeed = useCallback((speed: number) => run((a) => setReplaySpeed(a, speed)), [run]);
  /** Reveal up to 50 more plays at once (following the synchronized week clock). */
  const stepBy = useCallback((plays: number) => run((a) => stepReplay(a, plays)), [run]);
  /** Re-read playback now (e.g. the server auto-resumed after a prediction was answered). */
  const refresh = useCallback(() => run((a) => getReplay(a)), [run]);

  const retry = useCallback(() => {
    setError(undefined);
    setSnapshot(undefined);
    setAuth(null);
    setAttempt((n) => n + 1);
  }, []);

  return { snapshot, auth, error, busy, control, setSpeed, stepBy, retry, refresh };
}
