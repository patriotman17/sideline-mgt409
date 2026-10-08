import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

import { useAsync } from '@/hooks/useAsync';
import { API_BASE_URL, getBackendHealth } from '@/services';
import { colors } from '@/theme';

/** Developer diagnostic: pings the FastAPI `/health` endpoint. */
export function BackendStatus() {
  const { data, loading, error, reload } = useAsync(getBackendHealth);
  const ok = !!data && !error;
  const color = loading ? colors.mute : ok ? colors.win : colors.loss;
  const label = loading ? 'Checking…' : ok ? `Online · v${data.version}` : 'Offline';

  return (
    <Pressable onPress={reload} accessibilityRole="button" accessibilityLabel="Recheck backend status" className="flex-row items-center border-t border-line py-3.5 active:opacity-70">
      <View className="mr-3 h-9 w-9 items-center justify-center rounded-xl bg-elevated">
        <Ionicons name="server" size={17} color={colors.sub} />
      </View>
      <View className="flex-1">
        <Text className="text-[15px] font-semibold text-ink">Backend</Text>
        <Text className="mt-0.5 text-xs text-mute" numberOfLines={1}>
          {API_BASE_URL}
        </Text>
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
