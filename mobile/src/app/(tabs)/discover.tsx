import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';

import { StandingsTable, StoryCard, TrendingPlayerCard } from '@/components/discover';
import { Chip, EmptyState, MockBadge, Screen, ScreenHeader, SectionHeader, Skeleton } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { getDiscoverFeed, getTeam } from '@/services';
import { useAppActions, useAppState } from '@/state/AppStore';
import { colors } from '@/theme';
import type { StoryCategory } from '@/types';

const CATEGORIES: ('All' | 'Saved' | StoryCategory)[] = ['All', 'News', 'Analysis', 'Fantasy', 'Highlights', 'Saved'];

export default function DiscoverScreen() {
  const { data, loading, reload } = useAsync(getDiscoverFeed);
  const { savedStoryIds, profile } = useAppState();
  const { toggleSaveStory } = useAppActions();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('All');

  const q = query.trim().toLowerCase();
  const stories =
    data?.stories.filter((s) => {
      if (category === 'Saved' && !savedStoryIds.includes(s.id)) return false;
      if (category !== 'All' && category !== 'Saved' && s.category !== category) return false;
      if (!q) return true;
      const team = s.teamId ? getTeam(s.teamId) : undefined;
      return [s.title, s.summary, team?.name, team?.city, team?.abbr].some((f) => f?.toLowerCase().includes(q));
    }) ?? [];

  return (
    <Screen onRefresh={reload} refreshing={loading && !!data}>
      <ScreenHeader eyebrow="Around the league" title="Discover" right={<MockBadge />} />

      <View className="mx-5 flex-row items-center rounded-xl border border-line bg-surface px-3.5">
        <Ionicons name="search" size={18} color={colors.mute} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search teams, stories, players"
          placeholderTextColor={colors.mute}
          className="h-12 flex-1 px-2.5 text-[15px] text-ink"
          returnKeyType="search"
          autoCorrect={false}
          accessibilityLabel="Search"
        />
        {query ? (
          <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityLabel="Clear search">
            <Ionicons name="close-circle" size={18} color={colors.mute} />
          </Pressable>
        ) : null}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 px-5 pt-4">
        {CATEGORIES.map((c) => (
          <Chip key={c} label={c} selected={category === c} onPress={() => setCategory(c)} />
        ))}
      </ScrollView>

      {!data ? (
        <View className="mt-6 gap-3 px-5">
          <Skeleton className="h-32" />
          <Skeleton className="h-24" />
        </View>
      ) : (
        <>
          {!q && category === 'All' ? (
            <>
              <SectionHeader title="Trending players" />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-3 px-5">
                {data.trending.map((p) => (
                  <TrendingPlayerCard key={p.id} player={p} />
                ))}
              </ScrollView>
            </>
          ) : null}

          <SectionHeader title={category === 'Saved' ? 'Saved stories' : q ? 'Results' : 'Top stories'} />
          {stories.length ? (
            stories.map((s) => (
              <StoryCard key={s.id} story={s} saved={savedStoryIds.includes(s.id)} onToggleSave={() => toggleSaveStory(s.id)} />
            ))
          ) : (
            <EmptyState
              icon={category === 'Saved' ? 'bookmark-outline' : 'search'}
              title={category === 'Saved' ? 'No saved stories' : 'No matches'}
              body={category === 'Saved' ? 'Tap the bookmark on any story to save it for later.' : 'Try a different team or keyword.'}
            />
          )}

          {!q && category === 'All' ? (
            <>
              <SectionHeader title="Standings" />
              {data.standings.map((d) => (
                <StandingsTable key={d.name} division={d} highlightTeamIds={profile.favoriteTeamIds} />
              ))}
            </>
          ) : null}
        </>
      )}
    </Screen>
  );
}
