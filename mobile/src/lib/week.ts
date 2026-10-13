/**
 * Pure helpers for the synchronized week scoreboard: turn backend week games into the app's
 * score-row shape, and group them by day and TV window. Unit-tested in __tests__/week-test.ts.
 */
import type { WeekGame } from '@/services/week';
import type { Game } from '@/types';

export type WeekDay = 'thu' | 'sun' | 'mon';

export const WEEK_DAYS: { value: WeekDay; label: string }[] = [
  { value: 'thu', label: 'Thursday' },
  { value: 'sun', label: 'Sunday' },
  { value: 'mon', label: 'Monday' },
];

const DAY_BY_PREFIX: Record<string, WeekDay> = { thu: 'thu', sun: 'sun', mon: 'mon' };

/** "thu-night" → thu, "sun-early" → sun. */
export function dayOfWindow(windowKey: string): WeekDay {
  return DAY_BY_PREFIX[windowKey.slice(0, 3)] ?? 'sun';
}

/** The day the clock is on, from the backend's ET label ("Sun, Oct 5 · 2:30 PM ET"). */
export function dayOfClock(simTimeLabel: string): WeekDay {
  const prefix = simTimeLabel.slice(0, 3).toLowerCase();
  if (prefix === 'thu' || prefix === 'fri') return 'thu';
  if (prefix === 'mon' || prefix === 'tue') return 'mon';
  return 'sun';
}

/** "-3.5"-style label from the closing spread (positive = home favored). */
export function spreadLabel(g: Pick<WeekGame, 'spread_line' | 'home' | 'away'>): string {
  const s = g.spread_line;
  if (s === null || s === undefined) return '';
  if (s === 0) return 'Pick ’em';
  const fav = s > 0 ? g.home.abbr : g.away.abbr;
  return `${fav} -${Math.abs(s)}`;
}

const teamId = (abbr: string) => abbr.toLowerCase();

/** Backend week game → the `Game` shape `ScoreRow` renders. Only revealed facts are copied. */
export function toScoreGame(g: WeekGame): Game {
  const live = g.phase === 'live';
  const [period, ...clock] = (g.period_label ?? '').split(' ');
  return {
    id: g.game_id,
    week: 5,
    day: 'today',
    status: g.phase,
    away: { teamId: teamId(g.away.abbr), score: g.away_score ?? 0, timeouts: 0 },
    home: { teamId: teamId(g.home.abbr), score: g.home_score ?? 0, timeouts: 0 },
    period:
      g.phase === 'final' ? (g.quarter && g.quarter > 4 ? 'F/OT' : 'F') : live ? period : undefined,
    clock: live ? clock.join(' ') : undefined,
    kickoffLabel: g.kickoff_label,
    network: g.neutral_site ? 'London' : '',
    venue: g.venue ?? '',
    spread: spreadLabel(g),
    overUnder: 0,
    homeWinProbability: Math.round((g.home_win_probability ?? 0.5) * 100),
    situation:
      live && g.possession
        ? {
            possessionTeamId: teamId(g.possession),
            down: (g.down && g.down >= 1 && g.down <= 4 ? g.down : 1) as 1 | 2 | 3 | 4,
            distance: g.distance ?? 10,
            ballOn: g.ball_on ?? '',
            // yardline_100 = yards to the defense's end zone; the field is drawn from the away end.
            fieldPosition:
              g.possession === g.away.abbr ? 100 - (g.yardline_100 ?? 50) : (g.yardline_100 ?? 50),
            redZone: (g.yardline_100 ?? 100) <= 20,
          }
        : undefined,
  };
}

export interface WeekSection {
  key: string;
  title: string;
  icon?: 'star';
  games: WeekGame[];
}

/**
 * Sections for one day: your teams first (your #1 team's game on top), then each TV window in
 * kickoff order. A game appears once.
 */
export function weekSections(
  games: WeekGame[],
  day: WeekDay,
  favoriteTeamIds: string[],
): WeekSection[] {
  const today = games.filter((g) => dayOfWindow(g.window_key) === day);
  const isFav = (g: WeekGame) =>
    favoriteTeamIds.includes(teamId(g.away.abbr)) || favoriteTeamIds.includes(teamId(g.home.abbr));
  const primary = favoriteTeamIds[0];
  const mine = today
    .filter(isFav)
    .sort(
      (a, b) =>
        Number([teamId(b.away.abbr), teamId(b.home.abbr)].includes(primary ?? '')) -
        Number([teamId(a.away.abbr), teamId(a.home.abbr)].includes(primary ?? '')),
    );
  const sections: WeekSection[] = [];
  if (mine.length) sections.push({ key: 'mine', title: 'Your teams', icon: 'star', games: mine });
  const byWindow = new Map<string, WeekSection>();
  for (const g of today) {
    if (isFav(g)) continue;
    const s = byWindow.get(g.window_key) ?? { key: g.window_key, title: g.window_label, games: [] };
    s.games.push(g);
    byWindow.set(g.window_key, s);
  }
  return [...sections, ...byWindow.values()];
}

/** Live games first count for the tab badge; also used for the "N live" header pill. */
export const liveCount = (games: WeekGame[]) => games.filter((g) => g.phase === 'live').length;
