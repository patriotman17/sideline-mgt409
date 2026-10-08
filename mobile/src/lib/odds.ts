import type { Game } from '@/types';

/** American moneyline from a win probability (0–100). Informational only. */
export function moneyline(probability: number): string {
  const p = Math.min(99, Math.max(1, probability)) / 100;
  const v = p >= 0.5 ? -Math.round((100 * p) / (1 - p)) : Math.round((100 * (1 - p)) / p);
  return v > 0 ? `+${v}` : `${v}`;
}

/** Split "KC -2.5" into per-side spreads, e.g. { away: '+2.5', home: '-2.5' }. */
export function sideSpreads(game: Game, awayAbbr: string): { away: string; home: string } {
  const [favorite = '', line = '0'] = game.spread.split(' ');
  const n = Math.abs(Number(line));
  const fav = `-${n}`;
  const dog = `+${n}`;
  return favorite === awayAbbr ? { away: fav, home: dog } : { away: dog, home: fav };
}
