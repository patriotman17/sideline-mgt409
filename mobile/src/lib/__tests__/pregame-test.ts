import { describe, expect, it } from '@jest/globals';

import { compareRows, ordinal, resultLabel, streakLabel, weeksLabel } from '@/lib/pregame';
import type { TeamForm } from '@/services/pregame';

const form = (over: Partial<TeamForm>): TeamForm => ({
  team: 'BUF',
  games: 4,
  record: '4-0',
  streak: 'W4',
  last_results: [],
  points_per_game: 33.2,
  points_allowed_per_game: 22.5,
  yards_per_game: 407,
  turnover_margin: 3,
  ranks: { points: 2, allowed: 17, yards: 1, turnovers: 6 },
  leaders: [],
  ...over,
});

describe('pregame formatting', () => {
  it('labels results from the team’s side', () => {
    expect(
      resultLabel({
        week: 4,
        opponent: 'NO',
        home: true,
        points_for: 31,
        points_against: 19,
        outcome: 'W',
      }),
    ).toBe('W 31-19 vs NO');
    expect(
      resultLabel({
        week: 3,
        opponent: 'PIT',
        home: false,
        points_for: 14,
        points_against: 21,
        outcome: 'L',
      }),
    ).toBe('L 14-21 @ PIT');
  });

  it('streaks, ordinals and week ranges', () => {
    expect(streakLabel('W4')).toBe('Won 4');
    expect(streakLabel('L1')).toBe('Lost 1');
    expect(streakLabel(null)).toBeNull();
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 32].map(ordinal)).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '11th',
      '12th',
      '13th',
      '21st',
      '22nd',
      '32nd',
    ]);
    expect(weeksLabel([1, 2, 3, 4])).toBe('Weeks 1-4');
    expect(weeksLabel([1])).toBe('Week 1');
  });

  it('compares away vs home, with fewer points allowed counted as better', () => {
    const away = form({
      team: 'NE',
      points_per_game: 25.5,
      points_allowed_per_game: 20.2,
      yards_per_game: 337.5,
      turnover_margin: -3,
    });
    const home = form({});
    const rows = compareRows(away, home);
    expect(rows.map((r) => r.better)).toEqual(['home', 'away', 'home', 'home']);
    expect(rows[3]).toMatchObject({ away: '-3', home: '+3' });
    expect(compareRows(home, home).every((r) => r.better === null)).toBe(true);
  });
});
