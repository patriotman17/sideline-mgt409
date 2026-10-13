/**
 * The synchronized-week clock, shared by the whole app (Scores and the tab badge).
 *
 * The backend session (id + secret token) lives only in memory, like replay sessions. The session is
 * created the first time a screen calls `ensure()`, and polled once a second while the clock runs.
 * Works without accounts or Supabase: it only needs the Sideline backend.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import {
  controlWeek,
  getWeek,
  seekWeek,
  setWeekSpeed,
  startWeek,
  type WeekAuth,
  type WeekSnapshot,
} from '@/services/week';

const POLL_MS = 1000;

interface WeekValue {
  snapshot: WeekSnapshot | undefined;
  error: string | undefined;
  busy: boolean;
  /** Create the week session if there isn't one yet (safe to call repeatedly). */
  ensure: () => void;
  retry: () => void;
  play: () => void;
  pause: () => void;
  jumpTo: (preset: string) => void;
  setSpeed: (speed: number) => void;
}

const WeekContext = createContext<WeekValue | null>(null);

export function WeekProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<WeekSnapshot>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [wanted, setWanted] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [auth, setAuth] = useState<WeekAuth | null>(null);
  const creating = useRef(false);

  // Create the session once something asks for it.
  useEffect(() => {
    if (!wanted || auth || creating.current) return;
    creating.current = true;
    let alive = true;
    startWeek().then(
      ({ session_token, ...snap }) => {
        creating.current = false;
        if (!alive) return;
        setAuth({ sessionId: snap.session_id, token: session_token });
        setSnapshot(snap);
        setError(undefined);
      },
      (err: unknown) => {
        creating.current = false;
        if (alive) setError(err instanceof Error ? err.message : 'Could not load the week');
      },
    );
    return () => {
      alive = false;
    };
  }, [wanted, auth, attempt]);

  // Poll while the clock runs.
  const playing = snapshot?.status === 'playing';
  useEffect(() => {
    if (!playing || !auth) return;
    const timer = setInterval(() => {
      getWeek(auth).then(setSnapshot, (err: unknown) => {
        // Session expired (404) or backend restarted: start a fresh one next time.
        setError(err instanceof Error ? err.message : 'Lost the week clock');
        setAuth(null);
      });
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [playing, auth]);

  const run = useCallback(
    async (fn: (a: WeekAuth) => Promise<WeekSnapshot>) => {
      if (!auth) return;
      setBusy(true);
      try {
        setSnapshot(await fn(auth));
        setError(undefined);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong');
      } finally {
        setBusy(false);
      }
    },
    [auth],
  );

  const value = useMemo<WeekValue>(
    () => ({
      snapshot,
      error,
      busy,
      ensure: () => setWanted(true),
      retry: () => {
        setAuth(null);
        setError(undefined);
        setAttempt((n) => n + 1);
      },
      play: () => run((a) => controlWeek(a, 'play')),
      pause: () => run((a) => controlWeek(a, 'pause')),
      jumpTo: (preset: string) => run((a) => seekWeek(a, { preset })),
      setSpeed: (speed: number) => run((a) => setWeekSpeed(a, speed)),
    }),
    [snapshot, error, busy, run],
  );

  return <WeekContext.Provider value={value}>{children}</WeekContext.Provider>;
}

export function useWeek(): WeekValue {
  const ctx = useContext(WeekContext);
  if (!ctx) throw new Error('useWeek must be used inside <WeekProvider>');
  return ctx;
}
