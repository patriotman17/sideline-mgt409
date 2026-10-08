import { Text } from 'react-native';

/**
 * Quiet marker for surfaces showing fabricated data. Use once per screen,
 * so mock content is never mistaken for real without cluttering the UI.
 */
export function MockBadge({ label = 'Sample data' }: { label?: string }) {
  return <Text className="text-[11px] font-medium text-mute">{label}</Text>;
}
