import type { ReactNode } from 'react';
import { Pressable, View, type ViewProps } from 'react-native';

interface CardProps extends ViewProps {
  children: ReactNode;
  onPress?: () => void;
  className?: string;
  accessibilityLabel?: string;
}

/** Elevated surface used throughout the app. Becomes pressable when `onPress` is set. */
export function Card({ children, onPress, className = '', accessibilityLabel, ...rest }: CardProps) {
  const base = `rounded-2xl border border-line bg-surface ${className}`;
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        className={`${base} active:opacity-80`}
        {...rest}
      >
        {children}
      </Pressable>
    );
  }
  return (
    <View className={base} {...rest}>
      {children}
    </View>
  );
}
