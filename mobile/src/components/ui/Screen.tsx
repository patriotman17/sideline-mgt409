import type { ReactNode } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { colors } from '@/theme';

interface ScreenProps {
  children: ReactNode;
  /** Wrap content in a ScrollView (default true). */
  scroll?: boolean;
  /** Content rendered above the scroll area (e.g. a sticky header). */
  header?: ReactNode;
  /** Decorative layer rendered behind everything (e.g. a team-color glow). */
  background?: ReactNode;
  edges?: Edge[];
  onRefresh?: () => void;
  refreshing?: boolean;
}

/** Base layout for every screen: dark background, safe areas, optional scroll + pull-to-refresh. */
export function Screen({ children, scroll = true, header, background, edges = ['top'], onRefresh, refreshing = false }: ScreenProps) {
  return (
    <SafeAreaView edges={edges} className="flex-1 bg-bg">
      {background ? (
        <View className="absolute inset-x-0 top-0" style={{ pointerEvents: 'none' }}>
          {background}
        </View>
      ) : null}
      {header}
      {scroll ? (
        <ScrollView
          className="flex-1"
          contentContainerClassName="pb-28"
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            onRefresh ? (
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.volt} />
            ) : undefined
          }
        >
          {children}
        </ScrollView>
      ) : (
        <View className="flex-1">{children}</View>
      )}
    </SafeAreaView>
  );
}
