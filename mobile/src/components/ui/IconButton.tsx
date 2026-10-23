import { Ionicons } from '@expo/vector-icons';
import { Pressable } from 'react-native';

import { useHaptics } from '@/lib/haptics';
import { colors } from '@/theme';

interface IconButtonProps {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  accessibilityLabel: string;
  color?: string;
  size?: number;
  variant?: 'filled' | 'ghost';
  disabled?: boolean;
}

export function IconButton({ icon, onPress, accessibilityLabel, color = colors.ink, size = 20, variant = 'filled', disabled }: IconButtonProps) {
  const { tap } = useHaptics();
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      className={`h-11 w-11 items-center justify-center rounded-full active:opacity-70 ${
        variant === 'filled' ? 'bg-white/10' : ''
      } ${disabled ? 'opacity-40' : ''}`}
    >
      <Ionicons name={icon} size={size} color={color} />
    </Pressable>
  );
}
