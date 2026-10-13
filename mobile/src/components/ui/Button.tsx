import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, Text } from 'react-native';

import { useHaptics } from '@/lib/haptics';
import { colors } from '@/theme';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  icon?: keyof typeof Ionicons.glyphMap;
  size?: 'sm' | 'md';
  disabled?: boolean;
  /** Shows a spinner and blocks presses (e.g. while a request is in flight). */
  loading?: boolean;
  className?: string;
}

const VARIANTS = {
  primary: { box: 'bg-volt', text: 'text-bg', icon: colors.bg },
  secondary: { box: 'bg-white/15', text: 'text-ink', icon: colors.ink },
  ghost: { box: '', text: 'text-volt', icon: colors.volt },
};

export function Button({ label, onPress, variant = 'primary', icon, size = 'md', disabled, loading, className = '' }: ButtonProps) {
  const { tap } = useHaptics();
  const v = VARIANTS[variant];
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
      className={`flex-row items-center justify-center gap-2 rounded-full active:opacity-80 ${v.box} ${
        size === 'sm' ? 'px-4 py-2' : 'px-5 py-3.5'
      } ${disabled ? 'opacity-40' : ''} ${className}`}
    >
      {loading ? <ActivityIndicator size="small" color={v.icon} /> : null}
      {icon && !loading ? <Ionicons name={icon} size={size === 'sm' ? 14 : 18} color={v.icon} /> : null}
      <Text className={`font-bold ${v.text} ${size === 'sm' ? 'text-[13px]' : 'text-[15px]'}`}>{label}</Text>
    </Pressable>
  );
}
