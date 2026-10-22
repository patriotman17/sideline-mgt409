import type { ReactNode } from 'react';
import { View } from 'react-native';

/** Native: a plain full-screen container (iOS/Android already present these screens as sheets). */
export function SheetView({ children }: { children: ReactNode }) {
  return <View className="flex-1 bg-bg">{children}</View>;
}
