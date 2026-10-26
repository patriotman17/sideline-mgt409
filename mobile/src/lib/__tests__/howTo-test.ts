import { describe, expect, it } from '@jest/globals';

import { HOW_TO_STEPS, shouldAutoShowHowTo } from '@/lib/howTo';

describe('first-launch guide', () => {
  it('shows only on a device that has never seen it', () => {
    expect(shouldAutoShowHowTo(null)).toBe(true);
    expect(shouldAutoShowHowTo(undefined)).toBe(true);
    expect(shouldAutoShowHowTo('1')).toBe(false);
  });

  it('covers the four main features in order, briefly', () => {
    expect(HOW_TO_STEPS.map((s) => s.title)).toEqual([
      'Start the clock',
      'Open a live game',
      'Make your call',
      'Ask anything',
    ]);
    for (const s of HOW_TO_STEPS) expect(s.body.length).toBeLessThanOrEqual(170);
  });
});
