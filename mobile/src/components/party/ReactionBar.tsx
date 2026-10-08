import { Pressable, Text, View } from 'react-native';

import { useHaptics } from '@/lib/haptics';
import { partyReactions } from '@/services';

interface ReactionBarProps {
  counts: Record<string, number>;
  onReact: (emoji: string) => void;
}

export function ReactionBar({ counts, onReact }: ReactionBarProps) {
  const { impact } = useHaptics();
  return (
    <View className="flex-row gap-2">
      {partyReactions.map((emoji) => (
        <Pressable
          key={emoji}
          onPress={() => {
            impact();
            onReact(emoji);
          }}
          accessibilityRole="button"
          accessibilityLabel={`React ${emoji}, ${counts[emoji] ?? 0} so far`}
          className="flex-1 flex-row items-center justify-center gap-1.5 rounded-xl border border-line bg-elevated py-2.5 active:scale-95 active:bg-raised"
        >
          <Text className="text-lg">{emoji}</Text>
          <Text className="text-xs font-bold tabular-nums text-sub">{counts[emoji] ?? 0}</Text>
        </Pressable>
      ))}
    </View>
  );
}
