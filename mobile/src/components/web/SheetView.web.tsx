import type { ReactNode } from 'react';
import { View } from 'react-native';

/**
 * Web: browsers have no native sheet transition, so screens presented as modals (game, replay) slide
 * up from the bottom on open, like the iOS card sheet (CSS keyframes `sheet-in` in tailwind.config.js;
 * `motion-reduce` turns it off for users who ask for less motion).
 */
export function SheetView({ children }: { children: ReactNode }) {
  return <View className="flex-1 bg-bg animate-sheet-in motion-reduce:animate-none">{children}</View>;
}
