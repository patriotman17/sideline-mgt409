import { Ionicons } from '@expo/vector-icons';
import { Switch, Text, View } from 'react-native';

import { colors } from '@/theme';

interface SettingRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  description?: string;
  value: boolean;
  onChange: (value: boolean) => void;
  divider?: boolean;
}

export function SettingRow({ icon, label, description, value, onChange, divider = true }: SettingRowProps) {
  return (
    <View className={`flex-row items-center px-4 py-3 ${divider ? 'border-t border-white/10' : ''}`}>
      <View className="mr-3 h-8 w-8 items-center justify-center rounded-lg bg-white/10">
        <Ionicons name={icon} size={16} color={colors.ink} />
      </View>
      <View className="flex-1 pr-3">
        <Text className="text-[15px] font-semibold text-ink">{label}</Text>
        {description ? <Text className="mt-0.5 text-xs text-mute">{description}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colors.volt, false: colors.raised }}
        thumbColor="#fff"
        accessibilityLabel={label}
      />
    </View>
  );
}
