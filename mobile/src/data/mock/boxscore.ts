// MOCK DATA — fabricated quarter-by-quarter scoring and team stats.
// The featured game is hand-written to match its timeline; others are derived
// deterministically from the final score so they stay stable between reloads.
import type { Game, Linescore, TeamStatLine } from '@/types';

const FEATURED: Record<string, { linescore: Linescore; teamStats: TeamStatLine[] }> = {
  'g-buf-kc': {
    linescore: { away: [7, 13, 0, 7], home: [7, 7, 7, 3] },
    teamStats: [
      { label: 'Total yards', away: 412, home: 388 },
      { label: 'Passing', away: 281, home: 302 },
      { label: 'Rushing', away: 131, home: 86 },
      { label: '3rd down', away: 58, home: 42, awayText: '7/12', homeText: '5/12' },
      { label: 'Turnovers', away: 0, home: 1, lowerIsBetter: true },
    ],
  },
};

/** Small deterministic PRNG seeded from the game id. */
function seeded(id: string) {
  let h = 2166136261;
  for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

function periodsPlayed(game: Game): number {
  if (game.status === 'scheduled') return 0;
  if (game.status === 'final') return game.period === 'F/OT' ? 5 : 4;
  const q = Number(game.period?.replace(/\D/g, ''));
  return Number.isFinite(q) && q > 0 ? q : 1;
}

/** Decompose a score into realistic scoring plays (TD+PAT 7, FG 3, TD+2pt 8, missed PAT 6, safety 2). */
function scoringPlays(total: number): number[] {
  const sevens = Math.floor(total / 7);
  const plays = Array.from({ length: sevens }, () => 7);
  const r = total % 7;
  const swap = (replacement: number[]) => {
    if (plays.length) plays.pop();
    plays.push(...replacement);
  };
  if (r === 3) plays.push(3);
  else if (r === 6) plays.push(3, 3);
  else if (sevens === 0) plays.push(...({ 1: [1], 2: [2], 4: [2, 2], 5: [3, 2] } as Record<number, number[]>)[r]);
  else if (r === 1) swap([8]);
  else if (r === 2) swap([6, 3]);
  else if (r === 4) swap([8, 3]);
  else if (r === 5) swap([6, 3, 3]);
  return plays;
}

/** Spread scoring plays across the played periods. */
function splitScore(total: number, periods: number, rand: () => number): number[] {
  const out = Array.from({ length: periods }, () => 0);
  for (const play of scoringPlays(total)) out[Math.floor(rand() * periods)] += play;
  return out;
}

function deriveLinescore(game: Game): Linescore {
  const rand = seeded(game.id);
  const played = periodsPlayed(game);
  const pad = (arr: number[]) => [...arr, ...Array.from({ length: Math.max(0, 4 - arr.length) }, () => null)];
  if (played === 5) {
    // Overtime: the winner's walk-off field goal.
    const awayWon = game.away.score > game.home.score;
    const reg = (score: number, won: boolean) => [...splitScore(score - (won ? 3 : 0), 4, rand), won ? 3 : 0];
    return { away: reg(game.away.score, awayWon), home: reg(game.home.score, !awayWon) };
  }
  return { away: pad(splitScore(game.away.score, played, rand)), home: pad(splitScore(game.home.score, played, rand)) };
}

function deriveTeamStats(game: Game): TeamStatLine[] {
  const rand = seeded(`${game.id}-stats`);
  const scale = periodsPlayed(game) / 4;
  const side = (score: number) => {
    const yards = Math.round((180 + score * 9 + rand() * 60) * Math.min(1, scale + 0.15));
    const pass = Math.round(yards * (0.55 + rand() * 0.2));
    const att = Math.max(3, Math.round(12 * scale));
    const conv = Math.min(att, Math.round(att * (0.3 + rand() * 0.3)));
    return { yards, pass, rush: yards - pass, att, conv, to: Math.floor(rand() * 3) };
  };
  const a = side(game.away.score);
  const h = side(game.home.score);
  return [
    { label: 'Total yards', away: a.yards, home: h.yards },
    { label: 'Passing', away: a.pass, home: h.pass },
    { label: 'Rushing', away: a.rush, home: h.rush },
    { label: '3rd down', away: Math.round((a.conv / a.att) * 100), home: Math.round((h.conv / h.att) * 100), awayText: `${a.conv}/${a.att}`, homeText: `${h.conv}/${h.att}` },
    { label: 'Turnovers', away: a.to, home: h.to, lowerIsBetter: true },
  ];
}

/** Attach linescore + team stats to started games. */
export function withBoxScore(game: Game): Game {
  if (game.status === 'scheduled') return game;
  const featured = FEATURED[game.id];
  return {
    ...game,
    linescore: featured?.linescore ?? deriveLinescore(game),
    teamStats: featured?.teamStats ?? deriveTeamStats(game),
  };
}
