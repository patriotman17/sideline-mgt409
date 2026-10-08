// TODO(phase-2): POST to the backend `/api/v1/assistant/chat` endpoint, which
// will run a Pydantic AI agent with game-context tools. Keys stay server-side.
import {
  MOCK_ASSISTANT_FALLBACK,
  MOCK_ASSISTANT_REPLIES,
  MOCK_ASSISTANT_SUGGESTIONS,
  MOCK_GAMES,
} from '@/data/mock';
import type { ChatMessage } from '@/types';
import { createId } from '@/lib/id';
import { mockDelay } from './http';
import { teamAbbr } from './teams';

export interface AskAssistantInput {
  gameId: string;
  message: string;
  history: ChatMessage[];
}

export async function askAssistant({ gameId, message }: AskAssistantInput): Promise<ChatMessage> {
  await mockDelay(900 + Math.random() * 600);
  const game = MOCK_GAMES.find((g) => g.id === gameId);
  let text = 'I couldn’t find that game. Try opening it from the Games tab.';
  if (game) {
    const hit = MOCK_ASSISTANT_REPLIES.find((r) => r.match.test(message));
    text = hit ? hit.reply(game, teamAbbr) : MOCK_ASSISTANT_FALLBACK(game, teamAbbr);
  }
  return { id: createId('msg'), role: 'assistant', text, createdAt: Date.now() };
}

export const getAssistantSuggestions = () => MOCK_ASSISTANT_SUGGESTIONS;
