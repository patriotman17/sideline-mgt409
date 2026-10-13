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

import AsyncStorage from '@react-native-async-storage/async-storage';

import { watchList } from '@/lib/moments';
import type { MomentHolds } from '@/services/replay';
import {
  controlWeek,
  getWeek,
  releaseWeek,
  seekWeek,
  setWeekSpeed,
  startWeek,
  watchWeek,
  type WeekAuth,
  type WeekSnapshot,
} from '@/services/week';

const POLL_MS = 1000;
const HOLDS_KEY = 'sideline.moment_holds';

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
  /** End a Big Moment hold now (after answering). */
  release: () => void;
  /** Off · Big moments (default) · Every question. Remembered on this device. */
  momentHolds: MomentHolds;
  setMomentHolds: (level: MomentHolds) => void;
  /** The game open on screen (its moments stop the clock); null on Scores. */
  setViewing: (gameId: string | null) => void;
  /** Your #1 team (its game's moments stop the clock too). */
  setPrimaryTeam: (teamId: string | null) => void;
  viewingGameId: string | null;
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
  const [momentHolds, setHolds] = useState<MomentHolds>('big');
  const [viewingGameId, setViewing] = useState<string | null>(null);
  const [primaryTeamId, setPrimaryTeam] = useState<string | null>(null);

  // Restore the Moment holds choice.
  useEffect(() => {
    AsyncStorage.getItem(HOLDS_KEY).then(
      (v) => {
        if (v === 'off' || v === 'big' || v === 'all') setHolds(v);
      },
      () => {},
    );
  }, []);
  const setMomentHolds = useCallback((level: MomentHolds) => {
    setHolds(level);
    AsyncStorage.setItem(HOLDS_KEY, level).catch(() => {});
  }, []);

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

  // Tell the server which games may stop the clock (viewing + #1 team), whenever that changes.
  const games = snapshot?.games;
  const watchKey = games
    ? watchList(games, viewingGameId, primaryTeamId, momentHolds).join(',') + `|${momentHolds}`
    : '';
  const sentWatch = useRef('');
  useEffect(() => {
    if (!auth || !watchKey || sentWatch.current === watchKey) return;
    sentWatch.current = watchKey;
    const [ids, level] = watchKey.split('|');
    watchWeek(auth, ids ? ids.split(',') : [], level === 'all' ? 'all' : 'big').then(
      setSnapshot,
      () => {
        sentWatch.current = ''; // retry on the next change
      },
    );
  }, [auth, watchKey]);

  // Poll while the clock runs (a hold counts: it resumes by itself).
  const playing = snapshot?.status === 'playing' || snapshot?.status === 'held';
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
      release: () => run((a) => releaseWeek(a)),
      momentHolds,
      setMomentHolds,
      setViewing,
      setPrimaryTeam,
      viewingGameId,
    }),
    [snapshot, error, busy, run, momentHolds, setMomentHolds, viewingGameId],
  );

  return <WeekContext.Provider value={value}>{children}</WeekContext.Provider>;
}

export function useWeek(): WeekValue {
  const ctx = useContext(WeekContext);
  if (!ctx) throw new Error('useWeek must be used inside <WeekProvider>');
  return ctx;
}
