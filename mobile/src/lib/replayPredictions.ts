/**
 * What each replay prediction card should show, combining the server's
 * authoritative state with any answer the user is currently submitting.
 * Pure functions so the lifecycle is unit-tested (see __tests__/replayPredictions-test.ts).
 */
import type { ReplayPredictionItem, ReplayPredictions } from '@/services';

export type CardState =
  | 'open' // can answer now
  | 'sending' // answer submitted, waiting for the server
  | 'locked_in' // answered; waiting for the result
  | 'closed' // locked without an answer
  | 'correct'
  | 'incorrect'
  | 'void'
  | 'missed' // resolved, never answered
  | 'hidden'; // result revealed later than the current replay position (after a rewind)

/** Answers in flight or rejected, keyed by prediction id. */
export type PendingAnswers = Record<string, { optionId: string; error?: string }>;

export interface PredictionCard {
  item: ReplayPredictionItem;
  state: CardState;
  /** The option to highlight: the user's answer (server) or the one being sent (local). */
  selected: string | null;
  error?: string;
}

export function cardFor(item: ReplayPredictionItem, pending?: PendingAnswers[string]): PredictionCard {
  const p = item.prediction;
  if (item.result_hidden_until !== null) return { item, state: 'hidden', selected: item.your_answer };
  if (p.status === 'open') {
    if (item.your_answer) return { item, state: 'locked_in', selected: item.your_answer };
    if (pending && !pending.error) return { item, state: 'sending', selected: pending.optionId };
    return { item, state: 'open', selected: null, error: pending?.error };
  }
  if (p.status === 'locked') return { item, state: item.your_answer ? 'locked_in' : 'closed', selected: item.your_answer };
  if (item.outcome === 'unanswered') return { item, state: p.status === 'void' ? 'void' : 'missed', selected: null };
  return { item, state: item.outcome as CardState, selected: item.your_answer };
}

export interface PicksView {
  open: PredictionCard[];
  waiting: PredictionCard[];
  results: PredictionCard[];
  /** Open questions not yet answered or being answered — drives the tab badge. */
  needsAnswer: number;
}

export function picksView(data: ReplayPredictions | undefined, pending: PendingAnswers): PicksView {
  if (!data) return { open: [], waiting: [], results: [], needsAnswer: 0 };
  const open = data.open.map((i) => cardFor(i, pending[i.prediction.id]));
  return {
    open,
    waiting: data.locked.map((i) => cardFor(i)),
    results: data.resolved.map((i) => cardFor(i)),
    needsAnswer: open.filter((c) => c.state === 'open').length,
  };
}

/** Drop pending entries the server has now recorded (or that are no longer open). */
export function settlePending(pending: PendingAnswers, data: ReplayPredictions): PendingAnswers {
  const stillOpen = new Map(data.open.map((i) => [i.prediction.id, i]));
  const next: PendingAnswers = {};
  for (const [id, value] of Object.entries(pending)) {
    const item = stillOpen.get(id);
    if (item && !item.your_answer) next[id] = value;
  }
  return next;
}

/** The question to surface inline under the playback controls: the first one still awaiting the user. */
export function inlinePick(view: PicksView): PredictionCard | undefined {
  return view.open.find((c) => c.state === 'open' || c.state === 'sending' || c.state === 'locked_in');
}

/** Footer for an open question: a countdown during the pick window, otherwise when it locks. */
export function lockLabel(secondsLeft: number | null | undefined): string {
  if (secondsLeft && secondsLeft > 0) return `Next snap in ${Math.ceil(secondsLeft)}s`;
  return 'Locks at the next snap';
}

export function formatAccuracy(accuracy: number | null): string {
  return accuracy === null ? '–' : `${Math.round(accuracy * 100)}%`;
}
