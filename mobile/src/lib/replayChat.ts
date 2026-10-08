/**
 * Replay chat visibility rules — the client mirror of the server's conversation rule:
 * a message belongs to the replay position (play cursor) it was asked at, and is only
 * shown while the replay is at or after that position. Rewinding hides later messages;
 * playing forward again brings them back. Pure functions so they can be unit-tested.
 */

export interface PositionedItem {
  id: string;
  role: 'user' | 'assistant' | 'error';
  /** Replay cursor the message belongs to. */
  cursor: number;
  /** Server request id once known (assistant answers and the questions they answer). */
  requestId?: string;
}

export function visibleChat<T extends PositionedItem>(items: T[], cursor: number): { visible: T[]; hidden: number } {
  const visible = items.filter((i) => i.cursor <= cursor);
  return { visible, hidden: items.length - visible.length };
}

/**
 * Drop answered turns the server no longer has at or before `cursor` (e.g. cleared elsewhere),
 * so the chat shows exactly what the server will use as context. Local-only items (errors,
 * a question still in flight) and turns beyond `cursor` are left alone.
 */
export function reconcileChat<T extends PositionedItem>(items: T[], serverRequestIds: string[], cursor: number): T[] {
  const known = new Set(serverRequestIds);
  return items.filter((i) => !(i.requestId && i.cursor <= cursor && !known.has(i.requestId)));
}
