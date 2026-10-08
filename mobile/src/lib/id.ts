let counter = 0;

/** Locally unique id for client-created objects (messages, parties). */
export const createId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(counter++).toString(36)}`;
