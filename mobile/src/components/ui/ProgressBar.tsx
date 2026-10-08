import { View } from 'react-native';

interface ProgressBarProps {
  /** 0–100 */
  value: number;
  color?: string;
  trackClassName?: string;
  height?: number;
}

export function ProgressBar({ value, color, trackClassName = 'bg-raised', height = 6 }: ProgressBarProps) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <View className={`w-full overflow-hidden rounded-full ${trackClassName}`} style={{ height }}>
      <View className="h-full rounded-full bg-volt" style={{ width: `${pct}%`, ...(color ? { backgroundColor: color } : null) }} />
    </View>
  );
}
