import { describe, expect, it } from '@jest/globals';

import type { ReplayPredictionItem, ReplayPredictions } from '@/services';
import { cardFor, formatAccuracy, picksView, settlePending } from '../replayPredictions';

function item(over: Partial<ReplayPredictionItem['prediction']> = {}, extra: Partial<ReplayPredictionItem> = {}): ReplayPredictionItem {
  return {
    prediction: {
      id: 'g:drive_touchdown:2',
      type: 'drive_touchdown',
      question: 'Will this BUF drive end in a touchdown?',
      options: [
        { id: 'yes', label: 'Yes' },
        { id: 'no', label: 'No' },
      ],
      points: 20,
      window: 'w',
      team: 'BUF',
      status: 'open',
      opened_cursor: 2,
      locked_cursor: null,
      resolved_cursor: null,
      correct_option_id: null,
      void_reason: null,
      resolution_summary: null,
      situation: 'Q1 · BUF ball',
      ...over,
    },
    your_answer: null,
    answered_cursor: null,
    outcome: 'unanswered',
    points_awarded: 0,
    result_hidden_until: null,
    ...extra,
  };
}

function overview(parts: Partial<ReplayPredictions>): ReplayPredictions {
  return {
    cursor: 2,
    scoring_mode: 'demo',
    scoring_note: '',
    points_table: { next_play_gain_5: 10, next_score: 15, drive_touchdown: 20, fourth_down_conversion: 25 },
    pause_for_predictions: true,
    paused_for_prediction: false,
    resumes_after_play: null,
    open: [],
    locked: [],
    resolved: [],
    stats: { scoring_mode: 'demo', points: 0, answered: 0, correct: 0, incorrect: 0, void: 0, pending: 0, accuracy: null, current_streak: 0, longest_streak: 0 },
    ...parts,
  };
}

describe('prediction card lifecycle', () => {
  it('open → sending → locked in → correct', () => {
    expect(cardFor(item()).state).toBe('open');
    expect(cardFor(item(), { optionId: 'no' })).toMatchObject({ state: 'sending', selected: 'no' });
    expect(cardFor(item({}, { your_answer: 'no', outcome: 'pending' }))).toMatchObject({ state: 'locked_in', selected: 'no' });
    expect(cardFor(item({ status: 'locked', locked_cursor: 3 }, { your_answer: 'no', outcome: 'pending' })).state).toBe('locked_in');
    const done = item({ status: 'resolved', correct_option_id: 'no', resolved_cursor: 16 }, { your_answer: 'no', outcome: 'correct', points_awarded: 20 });
    expect(cardFor(done)).toMatchObject({ state: 'correct', selected: 'no' });
  });

  it('a rejected answer reopens the card with the error', () => {
    expect(cardFor(item(), { optionId: 'yes', error: 'This prediction is locked' })).toMatchObject({
      state: 'open',
      selected: null,
      error: 'This prediction is locked',
    });
  });

  it('a question that locks unanswered is closed, then missed', () => {
    expect(cardFor(item({ status: 'locked' })).state).toBe('closed');
    expect(cardFor(item({ status: 'resolved', correct_option_id: 'yes' })).state).toBe('missed');
  });

  it('incorrect and void outcomes', () => {
    expect(cardFor(item({ status: 'resolved', correct_option_id: 'yes' }, { your_answer: 'no', outcome: 'incorrect' })).state).toBe('incorrect');
    expect(cardFor(item({ status: 'void', void_reason: 'penalty' }, { your_answer: 'no', outcome: 'void' })).state).toBe('void');
    expect(cardFor(item({ status: 'void' })).state).toBe('void');
  });

  it('hides results revealed later than the current replay position', () => {
    const rewound = item({ status: 'locked' }, { your_answer: 'yes', outcome: 'pending', result_hidden_until: 16 });
    expect(cardFor(rewound)).toMatchObject({ state: 'hidden', selected: 'yes' });
  });
});

describe('picks view', () => {
  it('counts only questions still needing an answer for the badge', () => {
    const a = item({ id: 'a' });
    const b = item({ id: 'b' });
    const answered = item({ id: 'c' }, { your_answer: 'yes', outcome: 'pending' });
    const view = picksView(overview({ open: [a, b, answered] }), { b: { optionId: 'no' } });
    expect(view.open.map((c) => c.state)).toEqual(['open', 'sending', 'locked_in']);
    expect(view.needsAnswer).toBe(1);
  });

  it('is empty before data arrives', () => {
    expect(picksView(undefined, {})).toEqual({ open: [], waiting: [], results: [], needsAnswer: 0 });
  });

  it('settles pending answers once the server has them or the question closed', () => {
    const data = overview({
      open: [item({ id: 'recorded' }, { your_answer: 'yes', outcome: 'pending' }), item({ id: 'still' })],
      locked: [item({ id: 'closed', status: 'locked' })],
    });
    const settled = settlePending({ recorded: { optionId: 'yes' }, still: { optionId: 'no' }, closed: { optionId: 'no' } }, data);
    expect(settled).toEqual({ still: { optionId: 'no' } });
  });
});

describe('formatting', () => {
  it('formats accuracy', () => {
    expect(formatAccuracy(null)).toBe('–');
    expect(formatAccuracy(0.6667)).toBe('67%');
  });
});
