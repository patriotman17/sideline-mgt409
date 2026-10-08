import type { Game } from '@/types';

export const ordinal = (n: number) => ['1st', '2nd', '3rd', '4th'][n - 1] ?? `${n}th`;

export const downAndDistance = (down: number, distance: number) => `${ordinal(down)} & ${distance}`;

/** Short status line for a game, e.g. "Q4 · 4:12", "FINAL", "Sun 4:25 PM ET". */
export function gameStatusLabel(game: Game): string {
  if (game.status === 'live') return `${game.period} · ${game.clock}`;
  if (game.status === 'final') return game.period ?? 'FINAL';
  return game.kickoffLabel;
}

export const formatNumber = (n: number) => n.toLocaleString('en-US');

const WEEKDAYS: Record<string, string> = {
  Mon: 'Monday',
  Tue: 'Tuesday',
  Wed: 'Wednesday',
  Thu: 'Thursday',
  Fri: 'Friday',
  Sat: 'Saturday',
  Sun: 'Sunday',
};

/** "Sun 8:20 PM ET" -> { day: 'Sunday', time: '8:20 PM' } */
export function splitKickoff(label: string): { day: string; time: string } {
  const [day = '', time = '', meridiem = ''] = label.split(' ');
  return { day: WEEKDAYS[day] ?? day, time: `${time} ${meridiem}`.trim() };
}
