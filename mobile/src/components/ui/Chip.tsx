import { Pressable, Text } from 'react-native';

import { useHaptics } from '@/lib/haptics';

interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  leading?: React.ReactNode;
}

export function Chip({ label, selected = false, onPress, leading }: ChipProps) {
  const { tap } = useHaptics();
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress?.();
      }}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className={`flex-row items-center gap-1.5 rounded-full border px-4 py-2 active:opacity-70 ${
        selected ? 'border-volt bg-volt' : 'border-transparent bg-white/10'
      }`}
    >
      {leading}
      <Text className={`text-sm font-semibold ${selected ? 'text-bg' : 'text-ink'}`}>{label}</Text>
    </Pressable>
  );
}
