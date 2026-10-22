import type { ReactNode } from 'react';
import { View } from 'react-native';

/** Phones show the app full screen; wider than this, it becomes a centered column. */
export const PHONE_MAX_WIDTH = 440;

/**
 * Web only: Sideline is designed for phones, so on a laptop it renders as a centered phone-width
 * column (full height) instead of stretching score rows across the screen. Phone browsers are
 * narrower than the column, so they still get the full-screen layout.
 */
export function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <View className="flex-1 items-center bg-[#0d0f12]">
      <View
        className="w-full flex-1 overflow-hidden bg-bg"
        style={{
          maxWidth: PHONE_MAX_WIDTH,
          // Only visible when there's space around the column.
          boxShadow: '0 0 0 1px rgba(255,255,255,0.06), 0 0 60px rgba(0,0,0,0.6)',
        }}
      >
        {children}
      </View>
    </View>
  );
}
