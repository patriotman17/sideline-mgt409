import { Text, View } from 'react-native';

/** Marks surfaces that show fabricated data, so mock content is never mistaken for real. */
export function MockBadge({ label = 'MOCK DATA' }: { label?: string }) {
  return (
    <View className="self-start rounded-md border border-gold/40 bg-gold/10 px-1.5 py-0.5">
      <Text className="text-[9px] font-bold tracking-widest text-gold">{label}</Text>
    </View>
  );
}
