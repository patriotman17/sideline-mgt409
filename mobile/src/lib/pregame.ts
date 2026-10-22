import type { PregameResult, TeamForm } from '@/services/pregame';

/** "W 31-19 vs NO" / "L 14-21 @ PIT". */
export function resultLabel(r: PregameResult): string {
  return `${r.outcome} ${r.points_for}-${r.points_against} ${r.home ? 'vs' : '@'} ${r.opponent}`;
}

/** "W4" → "Won 4", "L1" → "Lost 1". */
export function streakLabel(streak: string | null): string | null {
  if (!streak) return null;
  const n = streak.slice(1);
  return streak[0] === 'W' ? `Won ${n}` : streak[0] === 'L' ? `Lost ${n}` : `Tied ${n}`;
}

export function ordinal(n: number): string {
  const mod100 = n % 100;
  const suffix =
    mod100 >= 11 && mod100 <= 13
      ? 'th'
      : (({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th');
  return `${n}${suffix}`;
}

export interface CompareRow {
  label: string;
  away: string;
  home: string;
  /** Which side is better on this stat (null = even). */
  better: 'away' | 'home' | null;
}

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

function better(away: number, home: number, higherIsBetter: boolean): CompareRow['better'] {
  if (away === home) return null;
  return away > home === higherIsBetter ? 'away' : 'home';
}

/** Side-by-side season numbers, away team first (as on the scoreboard). */
export function compareRows(away: TeamForm, home: TeamForm): CompareRow[] {
  return [
    {
      label: 'Points / game',
      away: away.points_per_game.toFixed(1),
      home: home.points_per_game.toFixed(1),
      better: better(away.points_per_game, home.points_per_game, true),
    },
    {
      label: 'Allowed / game',
      away: away.points_allowed_per_game.toFixed(1),
      home: home.points_allowed_per_game.toFixed(1),
      better: better(away.points_allowed_per_game, home.points_allowed_per_game, false),
    },
    {
      label: 'Yards / game',
      away: away.yards_per_game.toFixed(0),
      home: home.yards_per_game.toFixed(0),
      better: better(away.yards_per_game, home.yards_per_game, true),
    },
    {
      label: 'Turnover margin',
      away: signed(away.turnover_margin),
      home: signed(home.turnover_margin),
      better: better(away.turnover_margin, home.turnover_margin, true),
    },
  ];
}

/** "Weeks 1-4" / "Week 1". */
export function weeksLabel(weeks: number[]): string {
  if (!weeks.length) return 'No games yet';
  const first = weeks[0];
  const last = weeks[weeks.length - 1];
  return first === last ? `Week ${first}` : `Weeks ${first}-${last}`;
}
