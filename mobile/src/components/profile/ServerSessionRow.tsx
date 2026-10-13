import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

import { useAsync } from '@/hooks/useAsync';
import { getBackendUser } from '@/services';
import { colors } from '@/theme';

/** Developer diagnostic: the backend verifies this device's login token (`GET /api/v1/me`). */
export function ServerSessionRow({ userId }: { userId: string }) {
  const { data, loading, error, reload } = useAsync(getBackendUser, [userId]);
  const ok = !!data && !error && data.id === userId;
  const color = loading ? colors.mute : ok ? colors.win : colors.loss;
  const label = loading
    ? 'Checking…'
    : ok
      ? 'Verified'
      : error?.message.includes('configured')
        ? 'Not configured'
        : 'Not verified';
  return (
    <Pressable
      onPress={reload}
      accessibilityRole="button"
      accessibilityLabel={`Server session: ${label}. Recheck`}
      className="flex-row items-center px-4 py-3 active:opacity-70"
    >
      <View className="mr-3 h-8 w-8 items-center justify-center rounded-lg bg-white/10">
        <Ionicons name="shield-checkmark" size={16} color={colors.ink} />
      </View>
      <View className="flex-1">
        <Text className="text-[15px] font-semibold text-ink">Server session</Text>
        <Text className="mt-0.5 text-xs text-mute">Backend checks your login token</Text>
      </View>
      <View className="flex-row items-center gap-1.5">
        <View className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
        <Text className="text-xs font-semibold" style={{ color }}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}
