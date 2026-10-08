import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { picksView, settlePending, type PendingAnswers } from '@/lib/replayPredictions';
import {
  ApiError,
  answerReplayPrediction,
  explainReplayPrediction,
  getReplayPredictions,
  setPauseForPredictions,
  type ReplayAuth,
  type ReplayPredictions,
} from '@/services';

/**
 * Real, server-scored predictions for one replay session. Refreshes whenever the
 * replay position or playback status changes (questions open/lock/resolve with plays).
 * Answers are optimistic ("sending") and roll back with the server's reason if rejected.
 */
export function useReplayPredictions(
  auth: ReplayAuth | null,
  cursor: number,
  playbackStatus: string | undefined,
  /** Called when answering made the server resume playback (it was paused for this pick). */
  onPlaybackResumed?: () => void,
) {
  const [data, setData] = useState<ReplayPredictions>();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState<PendingAnswers>({});
  const [explanations, setExplanations] = useState<Record<string, { text?: string; error?: string; loading?: boolean }>>({});
  const request = useRef(0);

  const load = useCallback(async () => {
    if (!auth) return;
    const id = ++request.current;
    try {
      const next = await getReplayPredictions(auth);
      if (id !== request.current) return; // a newer response is on its way
      setData(next);
      setPending((p) => settlePending(p, next));
      setError(undefined);
    } catch (err) {
      if (id === request.current) setError(err instanceof Error ? err.message : 'Couldn’t load predictions');
    }
  }, [auth]);

  // Refresh when the replay moves or playback status changes (questions open, lock and resolve with plays).
  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load, cursor, playbackStatus]);

  const answer = useCallback(
    async (predictionId: string, optionId: string) => {
      if (!auth || pending[predictionId]) return;
      setPending((p) => ({ ...p, [predictionId]: { optionId } }));
      try {
        const res = await answerReplayPrediction(auth, predictionId, optionId);
        if (res.resumed_playback) onPlaybackResumed?.();
      } catch (err) {
        const message = err instanceof ApiError ? err.message : 'Couldn’t submit your pick. Try again.';
        setPending((p) => ({ ...p, [predictionId]: { optionId, error: message } }));
      } finally {
        load();
      }
    },
    [auth, pending, load, onPlaybackResumed],
  );

  const setPauseForPicks = useCallback(
    async (enabled: boolean) => {
      if (!auth) return;
      try {
        setData(await setPauseForPredictions(auth, enabled));
      } catch {
        load();
      }
    },
    [auth, load],
  );

  const explain = useCallback(
    async (predictionId: string) => {
      if (!auth) return;
      setExplanations((e) => ({ ...e, [predictionId]: { loading: true } }));
      try {
        const res = await explainReplayPrediction(auth, predictionId);
        setExplanations((e) => ({ ...e, [predictionId]: { text: res.explanation } }));
      } catch (err) {
        const message = err instanceof ApiError ? err.message : 'Couldn’t get an explanation right now.';
        setExplanations((e) => ({ ...e, [predictionId]: { error: message } }));
      }
    },
    [auth],
  );

  const view = useMemo(() => picksView(data, pending), [data, pending]);

  return { data, view, error, reload: load, answer, setPauseForPicks, explain, explanations };
}
