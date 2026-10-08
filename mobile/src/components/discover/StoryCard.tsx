import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, Text, View } from 'react-native';

import { TeamBadge } from '@/components/game';
import { useHaptics } from '@/lib/haptics';
import { getTeam } from '@/services';
import { colors, withAlpha } from '@/theme';
import type { Story, StoryCategory } from '@/types';

const CATEGORY_COLOR: Record<StoryCategory, string> = {
  News: colors.sub,
  Analysis: colors.volt,
  Fantasy: colors.win,
  Highlights: colors.gold,
};

interface StoryProps {
  story: Story;
  saved: boolean;
  onToggleSave: () => void;
}

function SaveButton({ saved, onPress }: { saved: boolean; onPress: () => void }) {
  const { tap } = useHaptics();
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={saved ? 'Remove from saved' : 'Save story'}
    >
      <Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={18} color={saved ? colors.volt : colors.mute} />
    </Pressable>
  );
}

function Meta({ story }: { story: Story }) {
  return (
    <View className="flex-row items-center gap-1.5">
      <Text className="text-[12px] font-semibold" style={{ color: CATEGORY_COLOR[story.category] }}>
        {story.category}
      </Text>
      <Text className="text-[12px] text-mute">· {story.timeAgo} ago</Text>
    </View>
  );
}

/** Lead story: a team-color "cover" with an oversized monogram, then the headline. */
export function FeatureStory({ story, saved, onToggleSave }: StoryProps) {
  const team = story.teamId ? getTeam(story.teamId) : undefined;
  const base = team?.primary ?? colors.raised;
  return (
    <View className="mx-4 overflow-hidden rounded-3xl bg-surface">
      <View className="h-40 justify-end overflow-hidden">
        <LinearGradient
          colors={[withAlpha(base, 0.95), withAlpha(team?.secondary ?? colors.surface, 0.55)]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
        <Text className="absolute -right-3 -top-6 font-score text-[170px] leading-[180px] text-white/15">{team?.abbr ?? 'NFL'}</Text>
        {team ? (
          <View className="m-4">
            <TeamBadge teamId={team.id} size={40} />
          </View>
        ) : null}
      </View>
      <View className="p-4">
        <View className="flex-row items-center justify-between">
          <Meta story={story} />
          <SaveButton saved={saved} onPress={onToggleSave} />
        </View>
        <Text className="mt-1.5 text-[21px] font-bold leading-[26px] text-ink">{story.title}</Text>
        <Text className="mt-1.5 text-[15px] leading-[21px] text-white/75">{story.summary}</Text>
        <Text className="mt-2.5 text-[12px] text-mute">
          {story.source} · {story.readMinutes} min read
        </Text>
      </View>
    </View>
  );
}

/** Compact story row for grouped lists. */
export function StoryCard({ story, saved, onToggleSave }: StoryProps) {
  return (
    <View className="flex-row px-4 py-3.5">
      <View className="flex-1 pr-3">
        <Meta story={story} />
        <Text className="mt-1 text-[16px] font-semibold leading-[21px] text-ink">{story.title}</Text>
        <Text className="mt-1.5 text-[12px] text-mute">
          {story.source} · {story.readMinutes} min read
        </Text>
      </View>
      <View className="items-center justify-between">
        {story.teamId ? (
          <TeamBadge teamId={story.teamId} size={44} />
        ) : (
          <View className="h-11 w-11 items-center justify-center rounded-full bg-white/10">
            <Ionicons name="newspaper" size={18} color={colors.sub} />
          </View>
        )}
        <SaveButton saved={saved} onPress={onToggleSave} />
      </View>
    </View>
  );
}
