import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

import { TeamBadge } from '@/components/game';
import { useHaptics } from '@/lib/haptics';
import { colors } from '@/theme';
import type { Story, StoryCategory } from '@/types';

const CATEGORY_COLOR: Record<StoryCategory, string> = {
  News: colors.sub,
  Analysis: colors.ai,
  Fantasy: colors.win,
  Highlights: colors.gold,
};

interface StoryCardProps {
  story: Story;
  saved: boolean;
  onToggleSave: () => void;
}

export function StoryCard({ story, saved, onToggleSave }: StoryCardProps) {
  const { tap } = useHaptics();
  return (
    <View className="mx-5 flex-row border-b border-line py-4">
      <View className="flex-1 pr-3">
        <View className="flex-row items-center gap-2">
          <Text className="text-[11px] font-bold uppercase tracking-widest" style={{ color: CATEGORY_COLOR[story.category] }}>
            {story.category}
          </Text>
          <Text className="text-[11px] text-mute">· {story.timeAgo} ago</Text>
        </View>
        <Text className="mt-1.5 text-[15px] font-bold leading-5 text-ink">{story.title}</Text>
        <Text className="mt-1 text-[13px] leading-5 text-sub" numberOfLines={2}>
          {story.summary}
        </Text>
        <Text className="mt-2 text-[11px] text-mute">
          {story.source} · {story.readMinutes} min read
        </Text>
      </View>
      <View className="items-center justify-between">
        {story.teamId ? <TeamBadge teamId={story.teamId} size={44} /> : (
          <View className="h-11 w-11 items-center justify-center rounded-full bg-elevated">
            <Ionicons name="newspaper" size={18} color={colors.sub} />
          </View>
        )}
        <Pressable
          onPress={() => {
            tap();
            onToggleSave();
          }}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={saved ? 'Remove from saved' : 'Save story'}
        >
          <Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={18} color={saved ? colors.volt : colors.mute} />
        </Pressable>
      </View>
    </View>
  );
}
