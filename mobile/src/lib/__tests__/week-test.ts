import { describe, expect, it } from '@jest/globals';

import type { WeekGame } from '@/services/week';
import {
  dayOfClock,
  dayOfWindow,
  liveCount,
  spreadLabel,
  toScoreGame,
  weekSections,
} from '../week';

function game(over: Partial<WeekGame> = {}): WeekGame {
  return {
    game_id: 'g',
    away: { abbr: 'DAL', city: 'Dallas', name: 'Cowboys' },
    home: { abbr: 'NYJ', city: 'New York', name: 'Jets' },
    kickoff_at: '2025-10-05T17:00:00Z',
    kickoff_label: 'Sun 1:00 PM',
    window_key: 'sun-early',
    window_label: 'Sunday · 1:00 PM',
    venue: 'MetLife Stadium',
    neutral_site: false,
    spread_line: -2.5,
    phase: 'scheduled',
    cursor: 0,
    away_score: null,
    home_score: null,
    quarter: null,
    clock_seconds: null,
    period_label: null,
    possession: null,
    down: null,
    distance: null,
    yardline_100: null,
    ball_on: null,
    home_win_probability: null,
    ...over,
  };
}

describe('days and windows', () => {
  it('maps windows and the clock to Thursday / Sunday / Monday', () => {
    expect(dayOfWindow('thu-night')).toBe('thu');
    expect(dayOfWindow('sun-morning')).toBe('sun');
    expect(dayOfWindow('mon-night')).toBe('mon');
    expect(dayOfClock('Thu, Oct 2 · 8:10 PM ET')).toBe('thu');
    expect(dayOfClock('Fri, Oct 3 · 12:30 AM ET')).toBe('thu'); // still Thursday night's slate
    expect(dayOfClock('Sun, Oct 5 · 2:30 PM ET')).toBe('sun');
    expect(dayOfClock('Tue, Oct 7 · 12:05 AM ET')).toBe('mon');
  });
});

describe('score rows from week games', () => {
  it('scheduled games show kickoff and spread, never a score', () => {
    const row = toScoreGame(game());
    expect(row.status).toBe('scheduled');
    expect(row.away.score).toBe(0);
    expect(row.period).toBeUndefined();
    expect(row.spread).toBe('DAL -2.5'); // negative spread = away favored
  });

  it('live games show the period, clock and who has the ball', () => {
    const row = toScoreGame(
      game({
        phase: 'live',
        away_score: 17,
        home_score: 3,
        quarter: 2,
        period_label: 'Q2 0:19',
        possession: 'DAL',
        down: 3,
        distance: 4,
        yardline_100: 12,
        ball_on: 'NYJ 12',
      }),
    );
    expect([row.period, row.clock]).toEqual(['Q2', '0:19']);
    expect(row.situation).toMatchObject({
      possessionTeamId: 'dal',
      down: 3,
      redZone: true,
      fieldPosition: 88,
    });
  });

  it('finals mark overtime', () => {
    expect(
      toScoreGame(game({ phase: 'final', quarter: 5, away_score: 26, home_score: 23 })).period,
    ).toBe('F/OT');
    expect(
      toScoreGame(game({ phase: 'final', quarter: 4, away_score: 1, home_score: 0 })).period,
    ).toBe('F');
  });

  it('spread labels', () => {
    expect(
      spreadLabel({ spread_line: 3, home: { abbr: 'BUF' }, away: { abbr: 'NE' } } as WeekGame),
    ).toBe('BUF -3');
    expect(
      spreadLabel({ spread_line: 0, home: { abbr: 'A' }, away: { abbr: 'B' } } as WeekGame),
    ).toBe('Pick ’em');
    expect(spreadLabel({ spread_line: null } as WeekGame)).toBe('');
  });
});

describe('sections', () => {
  const games = [
    game({ game_id: 'thu', window_key: 'thu-night', window_label: 'Thursday Night' }),
    game({
      game_id: 'a',
      away: { abbr: 'DEN', city: null, name: null },
      home: { abbr: 'PHI', city: null, name: null },
    }),
    game({
      game_id: 'b',
      away: { abbr: 'KC', city: null, name: null },
      home: { abbr: 'JAX', city: null, name: null },
      window_key: 'mon-night',
      window_label: 'Monday Night',
    }),
    game({ game_id: 'c' }),
    game({
      game_id: 'd',
      window_key: 'sun-late',
      window_label: 'Sunday · 4:05 & 4:25 PM',
      away: { abbr: 'DET', city: null, name: null },
    }),
  ];

  it('groups a day by TV window, in order', () => {
    expect(
      weekSections(games, 'sun', []).map((s) => [s.key, s.games.map((g) => g.game_id)]),
    ).toEqual([
      ['sun-early', ['a', 'c']],
      ['sun-late', ['d']],
    ]);
  });

  it('pins your teams first, #1 team on top, without repeating games', () => {
    const s = weekSections(games, 'sun', ['phi', 'det']);
    expect(s[0]).toMatchObject({ key: 'mine', title: 'Your teams' });
    expect(s[0].games.map((g) => g.game_id)).toEqual(['a', 'd']);
    expect(s.slice(1).flatMap((x) => x.games.map((g) => g.game_id))).toEqual(['c']);
    expect(weekSections(games, 'sun', ['det', 'phi'])[0].games.map((g) => g.game_id)).toEqual([
      'd',
      'a',
    ]);
  });

  it('counts live games', () => {
    expect(liveCount([game({ phase: 'live' }), game(), game({ phase: 'final' })])).toBe(1);
  });
});
