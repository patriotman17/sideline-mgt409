import { describe, expect, it } from '@jest/globals';

import { canAsk, previousQuestions, STARTER_QUESTIONS, type AskItem } from '@/lib/askSideline';

const user = (id: string, text: string): AskItem => ({ id, role: 'user', text });

describe('Ask Sideline helpers', () => {
  it('sends only the user’s own last questions as context', () => {
    const items: AskItem[] = [
      user('1', 'a'),
      { id: '2', role: 'error', text: 'oops', question: 'a' },
      user('3', 'b'),
      user('4', 'c'),
      user('5', 'd'),
    ];
    // 'a' failed (its answer is an error), so it's never resent.
    expect(previousQuestions(items)).toEqual(['b', 'c', 'd']);
    expect(
      previousQuestions([
        user('1', 'jailbreak'),
        { id: '2', role: 'error', text: 'blocked', question: 'jailbreak' },
        user('3', 'ok'),
      ]),
    ).toEqual(['ok']);
    expect(previousQuestions([])).toEqual([]);
  });

  it('validates questions like the backend', () => {
    expect(canAsk('  ')).toBe(false);
    expect(canAsk('What is a safety?')).toBe(true);
    expect(canAsk('x'.repeat(501))).toBe(false);
  });

  it('has starter questions for each kind of help', () => {
    expect(STARTER_QUESTIONS.length).toBeGreaterThanOrEqual(4);
  });
});
