import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { createId } from '@/lib/id';
import { reconcileChat, visibleChat } from '@/lib/replayChat';
import { ApiError, askReplay, getReplayConversation, resetReplayChat, type AskAnswer, type ReplayAuth } from '@/services';

export type ReplayChatItem =
  | { id: string; role: 'user'; text: string; cursor: number; requestId?: string }
  | { id: string; role: 'assistant'; result: AskAnswer; cursor: number; requestId: string }
  | { id: string; role: 'error'; question: string; message: string; code?: string; cursor: number };

/**
 * Ask Sideline chat for one replay session. The conversation history lives on the
 * server (per session), so follow-ups like "What about the other team?" work; this
 * hook only sends the new question.
 *
 * Every message is tied to the replay position it was asked at. When the replay is
 * rewound or restarted, messages from later positions are hidden (and come back once
 * the replay reaches them again), matching what the server uses as context; after a
 * rewind the hook also re-syncs with the server's conversation.
 */
export function useReplayChat(auth: ReplayAuth | null, cursor: number) {
  const [items, setItems] = useState<ReplayChatItem[]>([]);
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const cursorRef = useRef(cursor);
  const lastCursor = useRef(cursor);

  useEffect(() => {
    cursorRef.current = cursor;
  }, [cursor]);

  // Rewound or restarted: reconcile with the server's view of the conversation.
  useEffect(() => {
    const rewound = cursor < lastCursor.current;
    lastCursor.current = cursor;
    if (!rewound || !auth) return;
    let active = true;
    getReplayConversation(auth)
      .then((server) => {
        if (active) setItems((prev) => reconcileChat(prev, server.turns.map((t) => t.request_id), server.cursor));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [cursor, auth]);

  const send = useCallback(
    async (raw: string, { retryOf }: { retryOf?: string } = {}) => {
      const question = raw.trim();
      if (!question || !auth || inFlight.current) return;
      inFlight.current = true;
      setPending(true);
      const askedAt = cursorRef.current;
      const userId = createId('q');
      setItems((prev) => [
        ...prev.filter((i) => i.id !== retryOf),
        ...(retryOf ? [] : [{ id: userId, role: 'user' as const, text: question, cursor: askedAt }]),
      ]);
      try {
        const result = await askReplay(auth, question);
        const at = result.as_of.cursor; // authoritative position of this turn
        setItems((prev) => [
          ...prev.map((i) => (i.id === userId ? { ...i, cursor: at, requestId: result.request_id } : i)),
          { id: createId('a'), role: 'assistant', result, cursor: at, requestId: result.request_id },
        ]);
      } catch (err) {
        const apiErr = err instanceof ApiError ? err : undefined;
        setItems((prev) => [
          ...prev,
          {
            id: createId('e'),
            role: 'error',
            question,
            cursor: askedAt,
            code: apiErr?.code,
            message: apiErr?.message ?? 'Couldn’t reach Sideline AI. Check that the backend is running.',
          },
        ]);
      } finally {
        inFlight.current = false;
        setPending(false);
      }
    },
    [auth],
  );

  const retry = useCallback(
    (item: Extract<ReplayChatItem, { role: 'error' }>) => send(item.question, { retryOf: item.id }),
    [send],
  );

  const reset = useCallback(async () => {
    if (!auth || inFlight.current) return;
    setItems([]);
    await resetReplayChat(auth).catch(() => {});
  }, [auth]);

  const { visible, hidden } = useMemo(() => visibleChat(items, cursor), [items, cursor]);

  return { items: visible, hiddenCount: hidden, pending, send, retry, reset };
}
