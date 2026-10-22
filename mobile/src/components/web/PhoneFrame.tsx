import type { ReactNode } from 'react';

/** Native: the app fills the screen as designed. (Web wraps it in a centered phone column.) */
export function PhoneFrame({ children }: { children: ReactNode }) {
  return children;
}
