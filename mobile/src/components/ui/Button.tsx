import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text } from 'react-native';

import { useHaptics } from '@/lib/haptics';
import { colors } from '@/theme';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  icon?: keyof typeof Ionicons.glyphMap;
  size?: 'sm' | 'md';
  disabled?: boolean;
  className?: string;
}

const VARIANTS = {
  primary: { box: 'bg-volt', text: 'text-bg', icon: colors.bg },
  secondary: { box: 'border border-line bg-elevated', text: 'text-ink', icon: colors.ink },
  ghost: { box: '', text: 'text-volt', icon: colors.volt },
};

export function Button({ label, onPress, variant = 'primary', icon, size = 'md', disabled, className = '' }: ButtonProps) {
  const { tap } = useHaptics();
  const v = VARIANTS[variant];
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      disabled={disabled}
      accessibilityRole="button"
      className={`flex-row items-center justify-center gap-2 rounded-full active:opacity-80 ${v.box} ${
        size === 'sm' ? 'px-4 py-2' : 'px-5 py-3.5'
      } ${disabled ? 'opacity-40' : ''} ${className}`}
    >
      {icon ? <Ionicons name={icon} size={size === 'sm' ? 14 : 18} color={v.icon} /> : null}
      <Text className={`font-bold ${v.text} ${size === 'sm' ? 'text-[13px]' : 'text-[15px]'}`}>{label}</Text>
    </Pressable>
  );
}
