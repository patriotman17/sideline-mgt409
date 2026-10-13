/**
 * Big Moment helpers (pure, unit-tested in __tests__/moments-test.ts).
 *
 * Holds follow attention: the clock stops for big moments in the game you're watching and in your #1
 * team's game; everything else just shows a "Big moment" chip. The server decides what a moment is.
 */
import type { MomentHolds, ReplayPredictionItem } from '@/services/replay';
import type { WeekGame } from '@/services/week';

export const MOMENT_HOLD_OPTIONS: { value: MomentHolds; label: string; hint: string }[] = [
  { value: 'off', label: 'Off', hint: 'Play never stops; questions appear inline' },
  { value: 'big', label: 'Big moments', hint: 'Play holds ~12 s at the biggest moments' },
  { value: 'all', label: 'Every question', hint: 'Play stops at every question until you answer' },
];

/**
 * Games whose moments should stop the week clock: the one you're viewing, plus your #1 team's game
 * (if it isn't over). "off" watches nothing.
 */
export function watchList(
  games: Pick<WeekGame, 'game_id' | 'away' | 'home' | 'phase'>[],
  viewingGameId: string | null,
  primaryTeamId: string | null,
  level: MomentHolds,
): string[] {
  if (level === 'off') return [];
  const ids: string[] = [];
  if (viewingGameId && games.some((g) => g.game_id === viewingGameId)) ids.push(viewingGameId);
  if (primaryTeamId) {
    const abbr = primaryTeamId.toUpperCase();
    const mine = games.find(
      (g) => (g.away.abbr === abbr || g.home.abbr === abbr) && g.phase !== 'final',
    );
    if (mine && !ids.includes(mine.game_id)) ids.push(mine.game_id);
  }
  return ids;
}

/** "12s" countdown label (never negative, rounds up so "0s" only shows at the very end). */
export function countdownLabel(seconds: number | null | undefined): string {
  return `${Math.max(0, Math.ceil(seconds ?? 0))}s`;
}

/** 0-1 progress of a hold, for the countdown ring. */
export function holdProgress(secondsLeft: number | null | undefined, total = 12): number {
  if (!secondsLeft || secondsLeft <= 0) return 0;
  return Math.min(1, secondsLeft / total);
}

export interface Reveal {
  id: string;
  kind: 'correct' | 'incorrect' | 'void';
  title: string;
  detail: string;
}

/** Answered predictions that have just been decided and haven't been shown yet. */
export function newReveals(items: ReplayPredictionItem[], seen: ReadonlySet<string>): Reveal[] {
  return items
    .filter((i) => !seen.has(i.prediction.id) && i.your_answer !== null)
    .filter((i) => i.outcome === 'correct' || i.outcome === 'incorrect' || i.outcome === 'void')
    .map((i) => ({
      id: i.prediction.id,
      kind: i.outcome as Reveal['kind'],
      title:
        i.outcome === 'correct'
          ? `Correct · +${i.points_awarded}`
          : i.outcome === 'incorrect'
            ? 'Missed it'
            : 'No result',
      detail: i.prediction.void_reason ?? i.prediction.resolution_summary ?? i.prediction.question,
    }));
}
