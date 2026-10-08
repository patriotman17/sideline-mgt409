import { useCallback, useEffect, useRef, useState } from 'react';

import {
  ApiError,
  controlReplay,
  endReplay,
  getReplay,
  setReplaySpeed,
  startReplay,
  type ReplayControl,
  type ReplaySnapshot,
} from '@/services';

/** Polling interval while a replay is playing. WebSockets can replace this later. */
const POLL_MS = 1000;

/**
 * Owns one backend replay session for a game: creates it on mount, polls while
 * playing, exposes playback controls, and deletes the session on unmount.
 */
export function useReplaySession(gameId: string) {
  const [snapshot, setSnapshot] = useState<ReplaySnapshot>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const sessionRef = useRef<string | null>(null);

  // Create (and later clean up) the session.
  useEffect(() => {
    let active = true;
    startReplay(gameId).then(
      (snap) => {
        if (!active) {
          endReplay(snap.session_id).catch(() => {});
          return;
        }
        sessionRef.current = snap.session_id;
        setSnapshot(snap);
        setError(undefined);
      },
      (err: unknown) => active && setError(err instanceof Error ? err.message : 'Could not start replay'),
    );
    return () => {
      active = false;
      const sid = sessionRef.current;
      sessionRef.current = null;
      if (sid) endReplay(sid).catch(() => {});
    };
  }, [gameId, attempt]);

  // Poll while playing.
  const playing = snapshot?.playback.status === 'playing';
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      const sid = sessionRef.current;
      if (!sid) return;
      getReplay(sid).then(setSnapshot, (err: unknown) => {
        if (err instanceof ApiError && err.status === 404) setError('This replay session expired.');
      });
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [playing]);

  const run = useCallback(async (request: (sid: string) => Promise<ReplaySnapshot>) => {
    const sid = sessionRef.current;
    if (!sid) return;
    setBusy(true);
    try {
      setSnapshot(await request(sid));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Replay request failed');
    } finally {
      setBusy(false);
    }
  }, []);

  const control = useCallback((action: ReplayControl) => run((sid) => controlReplay(sid, action)), [run]);
  const setSpeed = useCallback((speed: number) => run((sid) => setReplaySpeed(sid, speed)), [run]);
  const retry = useCallback(() => {
    setError(undefined);
    setSnapshot(undefined);
    setAttempt((n) => n + 1);
  }, []);

  return { snapshot, error, busy, control, setSpeed, retry };
}
