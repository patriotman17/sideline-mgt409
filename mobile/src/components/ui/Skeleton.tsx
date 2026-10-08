import { View } from 'react-native';

/** Simple placeholder block for loading states. */
export function Skeleton({ className = '' }: { className?: string }) {
  return <View className={`rounded-2xl bg-elevated ${className}`} />;
}
