import { describe, expect, it } from '@jest/globals';

import { reconcileChat, visibleChat, type PositionedItem } from '../replayChat';

// A chat built up while watching: two Q&A pairs at plays 10 and 50, and a failed question at play 50.
const chat: PositionedItem[] = [
  { id: 'q1', role: 'user', cursor: 10, requestId: 'r1' },
  { id: 'a1', role: 'assistant', cursor: 10, requestId: 'r1' },
  { id: 'q2', role: 'user', cursor: 50, requestId: 'r2' },
  { id: 'a2', role: 'assistant', cursor: 50, requestId: 'r2' },
  { id: 'e1', role: 'error', cursor: 50 },
];

const ids = (items: PositionedItem[]) => items.map((i) => i.id);

describe('visibleChat', () => {
  it('shows everything when the replay is at or past every message', () => {
    expect(visibleChat(chat, 50)).toEqual({ visible: chat, hidden: 0 });
  });

  it('hides answers from later replay positions after a rewind', () => {
    const { visible, hidden } = visibleChat(chat, 20);
    expect(ids(visible)).toEqual(['q1', 'a1']);
    expect(hidden).toBe(3);
  });

  it('hides everything after a restart to kickoff', () => {
    expect(visibleChat(chat, 0)).toEqual({ visible: [], hidden: 5 });
  });

  it('brings messages back once the replay reaches their position again', () => {
    expect(ids(visibleChat(chat, 20).visible)).toEqual(['q1', 'a1']);
    expect(ids(visibleChat(chat, 60).visible)).toEqual(ids(chat));
  });

  it('keeps a message asked at exactly the current play', () => {
    expect(ids(visibleChat(chat, 10).visible)).toEqual(['q1', 'a1']);
  });
});

describe('reconcileChat', () => {
  it('keeps turns the server still has', () => {
    expect(ids(reconcileChat(chat, ['r1', 'r2'], 50))).toEqual(ids(chat));
  });

  it('drops answered turns the server no longer has (e.g. a new chat started elsewhere)', () => {
    expect(ids(reconcileChat(chat, ['r2'], 50))).toEqual(['q2', 'a2', 'e1']);
  });

  it('leaves turns beyond the current position alone (the server hides those too)', () => {
    // Rewound to play 20: the server only lists r1, but r2 belongs to play 50 and must survive.
    expect(ids(reconcileChat(chat, ['r1'], 20))).toEqual(ids(chat));
  });

  it('keeps local-only items: errors and questions still in flight', () => {
    const inFlight: PositionedItem[] = [...chat, { id: 'q3', role: 'user', cursor: 30 }];
    expect(ids(reconcileChat(inFlight, [], 50))).toEqual(['e1', 'q3']);
  });
});
