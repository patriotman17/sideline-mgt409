import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Platform, Pressable, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useHaptics } from '@/lib/haptics';
import { colors } from '@/theme';

/** Height of the tab bar the button floats above (native: system bar; web: our 64 pt bar). */
const TAB_BAR = Platform.OS === 'web' ? 64 : Platform.OS === 'ios' ? 56 : 80;

/** Floating "Ask" button on every tab: opens Ask Sideline (general football questions). */
export function AskFab() {
  const { tap } = useHaptics();
  const { bottom } = useSafeAreaInsets();
  return (
    <Pressable
      onPress={() => {
        tap();
        router.push('/assistant');
      }}
      accessibilityRole="button"
      accessibilityLabel="Ask Sideline AI a football question"
      className="absolute right-4 flex-row items-center gap-1.5 rounded-full bg-volt px-4 py-3 shadow-lg active:opacity-85 web:transition-transform web:duration-150 web:active:scale-[0.96]"
      style={{ bottom: bottom + TAB_BAR + 14 }}
    >
      <Ionicons name="sparkles" size={16} color={colors.bg} />
      <Text className="text-[15px] font-bold text-bg">Ask</Text>
    </Pressable>
  );
}
