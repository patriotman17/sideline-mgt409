import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { createId } from '@/lib/id';
import { askAssistant } from '@/services';
import { useAppActions, useAppState } from '@/state/AppStore';

/** Chat session with the (mock) Sideline AI for a single game. */
export function useGameChat(gameId: string) {
  const { chats } = useAppState();
  const { appendChat, clearChat } = useAppActions();
  const messages = useMemo(() => chats[gameId] ?? [], [chats, gameId]);
  const [typing, setTyping] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || typing) return;
      const userMsg = { id: createId('msg'), role: 'user' as const, text, createdAt: Date.now() };
      appendChat(gameId, userMsg);
      setTyping(true);
      try {
        const reply = await askAssistant({ gameId, message: text, history: [...messages, userMsg] });
        appendChat(gameId, reply);
      } catch {
        appendChat(gameId, {
          id: createId('msg'),
          role: 'assistant',
          text: 'Sorry — I couldn’t reach the Sideline AI. Try again in a moment.',
          createdAt: Date.now(),
        });
      } finally {
        if (mounted.current) setTyping(false);
      }
    },
    [appendChat, gameId, messages, typing],
  );

  return { messages, typing, send, clear: () => clearChat(gameId) };
}
