import { describe, expect, it } from '@jest/globals';

import type { ReplayPredictionItem } from '@/services/replay';
import { countdownLabel, holdProgress, newReveals, watchList } from '../moments';

const g = (
  id: string,
  away: string,
  home: string,
  phase: 'scheduled' | 'live' | 'final' = 'live',
) => ({
  game_id: id,
  away: { abbr: away, city: null, name: null },
  home: { abbr: home, city: null, name: null },
  phase,
});

describe('which games stop the clock', () => {
  const games = [
    g('a', 'DEN', 'PHI'),
    g('b', 'KC', 'JAX', 'scheduled'),
    g('c', 'SF', 'LA', 'final'),
  ];

  it('the game you are viewing and your #1 team’s game', () => {
    expect(watchList(games, 'a', 'kc', 'big')).toEqual(['a', 'b']);
    expect(watchList(games, 'a', 'phi', 'big')).toEqual(['a']); // no duplicates
    expect(watchList(games, null, 'kc', 'all')).toEqual(['b']);
  });

  it('skips finished games, unknown ids, and everything when holds are off', () => {
    expect(watchList(games, null, 'sf', 'big')).toEqual([]);
    expect(watchList(games, 'zzz', null, 'big')).toEqual([]);
    expect(watchList(games, 'a', 'kc', 'off')).toEqual([]);
  });
});

describe('countdown', () => {
  it('labels and progress', () => {
    expect(countdownLabel(11.2)).toBe('12s');
    expect(countdownLabel(-1)).toBe('0s');
    expect(countdownLabel(null)).toBe('0s');
    expect(holdProgress(6)).toBe(0.5);
    expect(holdProgress(30)).toBe(1);
    expect(holdProgress(0)).toBe(0);
  });
});

describe('result reveals', () => {
  const item = (
    id: string,
    outcome: ReplayPredictionItem['outcome'],
    answer: string | null = 'yes',
  ) =>
    ({
      prediction: {
        id,
        question: 'Will they convert?',
        resolution_summary: 'Converted: run for 8 yards',
        void_reason: null,
      },
      your_answer: answer,
      outcome,
      points_awarded: outcome === 'correct' ? 25 : 0,
    }) as unknown as ReplayPredictionItem;

  it('shows each decided answer once', () => {
    const items = [
      item('1', 'correct'),
      item('2', 'incorrect'),
      item('3', 'pending'),
      item('4', 'missed' as never, null),
    ];
    const r = newReveals(items, new Set());
    expect(r.map((x) => [x.id, x.kind, x.title])).toEqual([
      ['1', 'correct', 'Correct · +25'],
      ['2', 'incorrect', 'Missed it'],
    ]);
    expect(newReveals(items, new Set(['1', '2']))).toEqual([]);
  });
});
