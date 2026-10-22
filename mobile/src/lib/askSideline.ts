import type { AssistResult } from '@/services/askSideline';

/** Shown before the first question: one per thing the assistant can do. */
export const STARTER_QUESTIONS = [
  'What’s a two-point conversion?',
  'Who leads the NFL in rushing?',
  'How are the Bills doing this season?',
  'What are the scores right now?',
  'What is pass interference?',
] as const;

export type AskItem =
  | { id: string; role: 'user'; text: string }
  | { id: string; role: 'assistant'; result: AssistResult }
  | { id: string; role: 'error'; text: string; question: string };

/** Earlier questions to send as context: the user's own words only (never answers), newest last, max 3. */
export function previousQuestions(items: AskItem[], max = 3): string[] {
  return items
    .filter((i): i is Extract<AskItem, { role: 'user' }> => i.role === 'user')
    .map((i) => i.text)
    .slice(-max);
}

/** The question is sendable: not blank, at most 500 characters (the backend limit). */
export function canAsk(text: string): boolean {
  const t = text.trim();
  return t.length > 0 && t.length <= 500;
}
