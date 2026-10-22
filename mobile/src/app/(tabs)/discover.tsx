import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';

import { FeatureStory, StandingsTable, StoryCard, TrendingPlayerCard } from '@/components/discover';
import {
  Chip,
  EmptyState,
  ListGroup,
  PreviewBanner,
  Screen,
  ScreenHeader,
  SectionHeader,
  Skeleton,
} from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { getDiscoverFeed, getTeam } from '@/services';
import { usePersonalization } from '@/state/usePersonalization';
import { colors } from '@/theme';
import type { StoryCategory } from '@/types';

type Filter = 'All' | 'My teams' | 'Saved' | StoryCategory;
const CATEGORIES: Filter[] = ['All', 'News', 'Analysis', 'Fantasy', 'Highlights', 'Saved'];

export default function DiscoverScreen() {
  const { data, loading, reload } = useAsync(getDiscoverFeed);
  const { savedStoryIds, toggleSaveStory, favoriteTeamIds } = usePersonalization();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Filter>('All');
  // "My teams" only when there are stories about a followed team in the (sample) feed.
  const hasTeamStories = !!data?.stories.some(
    (s) => s.teamId && favoriteTeamIds.includes(s.teamId),
  );
  const filters: Filter[] = hasTeamStories
    ? ['All', 'My teams', ...CATEGORIES.slice(1)]
    : CATEGORIES;

  const q = query.trim().toLowerCase();
  const browsing = !q && category === 'All';
  const stories =
    data?.stories.filter((s) => {
      if (category === 'Saved' && !savedStoryIds.includes(s.id)) return false;
      if (category === 'My teams' && !(s.teamId && favoriteTeamIds.includes(s.teamId)))
        return false;
      if (
        category !== 'All' &&
        category !== 'Saved' &&
        category !== 'My teams' &&
        s.category !== category
      )
        return false;
      if (!q) return true;
      const team = s.teamId ? getTeam(s.teamId) : undefined;
      return [s.title, s.summary, team?.name, team?.city, team?.abbr].some((f) =>
        f?.toLowerCase().includes(q),
      );
    }) ?? [];
  const [lead, ...rest] = stories;
  const listed = browsing ? rest : stories;

  return (
    <Screen onRefresh={reload} refreshing={loading && !!data}>
      <ScreenHeader eyebrow="Around the league · Sample data" title="Discover" />
      <PreviewBanner
        title="Stories and news, picked for your teams"
        body="A preview of Sideline's news feed with sample stories. Saving stories already syncs to your account; real league news is next."
      />

      <View className="mx-4 h-10 flex-row items-center rounded-xl bg-white/10 px-3">
        <Ionicons name="search" size={17} color={colors.sub} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Teams, stories, players"
          placeholderTextColor={colors.sub}
          className="h-10 flex-1 px-2 text-[16px] text-ink"
          returnKeyType="search"
          autoCorrect={false}
          accessibilityLabel="Search"
        />
        {query ? (
          <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityLabel="Clear search">
            <Ionicons name="close-circle" size={17} color={colors.sub} />
          </Pressable>
        ) : null}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2 px-4 pt-3"
      >
        {filters.map((c) => (
          <Chip key={c} label={c} selected={category === c} onPress={() => setCategory(c)} />
        ))}
      </ScrollView>

      {!data ? (
        <View className="mt-5 gap-3 px-4">
          <Skeleton className="h-72 rounded-3xl" />
          <Skeleton className="h-24" />
        </View>
      ) : (
        <>
          {browsing && lead ? (
            <View className="mt-5">
              <FeatureStory
                story={lead}
                saved={savedStoryIds.includes(lead.id)}
                onToggleSave={() => toggleSaveStory(lead.id)}
              />
            </View>
          ) : null}

          {browsing ? (
            <>
              <SectionHeader title="Trending players" />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerClassName="gap-3 px-4"
              >
                {data.trending.map((p) => (
                  <TrendingPlayerCard key={p.id} player={p} />
                ))}
              </ScrollView>
            </>
          ) : null}

          <SectionHeader
            title={
              category === 'Saved' ? 'Saved' : q ? 'Results' : browsing ? 'More stories' : category
            }
          />
          {listed.length ? (
            <ListGroup>
              {listed.map((s) => (
                <StoryCard
                  key={s.id}
                  story={s}
                  saved={savedStoryIds.includes(s.id)}
                  onToggleSave={() => toggleSaveStory(s.id)}
                />
              ))}
            </ListGroup>
          ) : (
            <EmptyState
              icon={category === 'Saved' ? 'bookmark-outline' : 'search'}
              title={category === 'Saved' ? 'Nothing saved yet' : 'No matches'}
              body={
                category === 'Saved'
                  ? 'Bookmark a story to read it later.'
                  : 'Try a different team or keyword.'
              }
            />
          )}

          {browsing ? (
            <>
              <SectionHeader title="Standings" />
              {data.standings.map((d) => (
                <StandingsTable key={d.name} division={d} highlightTeamIds={favoriteTeamIds} />
              ))}
            </>
          ) : null}
        </>
      )}
    </Screen>
  );
}
