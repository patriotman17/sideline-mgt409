import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';

import { colors } from '@/theme';

interface StatTileProps {
  label: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
  accent?: string;
}

export function StatTile({ label, value, icon, accent = colors.volt }: StatTileProps) {
  return (
    <View className="flex-1 rounded-2xl border border-line bg-surface p-3.5">
      <Ionicons name={icon} size={16} color={accent} />
      <Text className="mt-2 text-xl font-extrabold tabular-nums text-ink">{value}</Text>
      <Text className="text-[11px] font-semibold text-mute">{label}</Text>
    </View>
  );
}
