import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { StoryCard } from '@/components/discover';
import { TeamBadge } from '@/components/game';
import { BackendStatus, SettingRow } from '@/components/profile';
import { Avatar, Chip, ListGroup, Screen, ScreenHeader, SectionHeader } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { formatNumber } from '@/lib/format';
import { getDiscoverFeed, getTeam, listTeams } from '@/services';
import { useAppActions, useAppState } from '@/state/AppStore';
import { colors } from '@/theme';

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View className="flex-1 items-center">
      <Text className="font-score text-[26px] leading-[30px] text-ink">{value}</Text>
      <Text className="text-[12px] text-sub">{label}</Text>
    </View>
  );
}

export default function ProfileScreen() {
  const { profile, settings, savedStoryIds } = useAppState();
  const { toggleFollowTeam, setSetting, toggleSaveStory } = useAppActions();
  const [editingTeams, setEditingTeams] = useState(false);
  const { data: feed } = useAsync(getDiscoverFeed);
  const { stats } = profile;
  const saved = feed?.stories.filter((s) => savedStoryIds.includes(s.id)) ?? [];

  return (
    <Screen>
      <ScreenHeader eyebrow="Demo profile · Sample data" title="You" />

      {/* Identity */}
      <View className="mx-4 flex-row items-center rounded-2xl bg-surface p-4">
        <View>
          <Avatar initials={profile.initials} color={colors.volt} size={68} />
          <View className="absolute bottom-0.5 right-0.5 h-4 w-4 rounded-full border-[3px] border-surface bg-win" />
        </View>
        <View className="ml-4 flex-1">
          <Text className="text-[22px] font-bold text-ink">{profile.displayName}</Text>
          <Text className="text-[14px] text-sub">{profile.handle}</Text>
          <Text className="mt-0.5 text-[12px] text-mute">Member since {profile.memberSince}</Text>
        </View>
      </View>
      <View className="mx-4 mt-3 flex-row rounded-2xl bg-surface py-3.5">
        <Stat value={formatNumber(stats.points)} label="Points" />
        <View className="w-px bg-white/10" />
        <Stat value={`${stats.accuracy}%`} label="Win rate" />
        <View className="w-px bg-white/10" />
        <Stat value={`#${stats.rank}`} label="Rank" />
      </View>

      {/* Teams */}
      <SectionHeader title="Your teams" actionLabel={editingTeams ? 'Done' : 'Edit'} onAction={() => setEditingTeams((e) => !e)} />
      {editingTeams ? (
        <View className="mx-4 flex-row flex-wrap gap-2">
          {listTeams().map((t) => (
            <Chip
              key={t.id}
              label={t.abbr}
              selected={profile.favoriteTeamIds.includes(t.id)}
              onPress={() => toggleFollowTeam(t.id)}
              leading={<View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: t.primary }} />}
            />
          ))}
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-4 px-4">
          {profile.favoriteTeamIds.map((id) => (
            <View key={id} className="items-center">
              <TeamBadge teamId={id} size={56} />
              <Text className="mt-1.5 text-[12px] text-sub">{getTeam(id).name}</Text>
            </View>
          ))}
          <Pressable onPress={() => setEditingTeams(true)} accessibilityRole="button" accessibilityLabel="Add a team" className="items-center">
            <View className="h-14 w-14 items-center justify-center rounded-full bg-white/10">
              <Ionicons name="add" size={24} color={colors.ink} />
            </View>
            <Text className="mt-1.5 text-[12px] text-sub">Add</Text>
          </Pressable>
        </ScrollView>
      )}

      {/* Badges */}
      <SectionHeader title="Badges" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 px-4">
        {profile.badges.map((b) => (
          <View key={b.id} className={`flex-row items-center gap-1.5 rounded-full px-3.5 py-2 ${b.earned ? 'bg-white/10' : 'bg-white/5'}`}>
            <Ionicons
              name={(b.earned ? b.icon : 'lock-closed') as keyof typeof Ionicons.glyphMap}
              size={13}
              color={b.earned ? colors.volt : colors.mute}
            />
            <Text className={`text-[13px] font-medium ${b.earned ? 'text-ink' : 'text-mute'}`}>{b.label}</Text>
          </View>
        ))}
      </ScrollView>

      {/* Saved */}
      <SectionHeader title="Saved" actionLabel="Discover" onAction={() => router.push('/discover')} />
      {saved.length ? (
        <ListGroup>
          {saved.map((s) => (
            <StoryCard key={s.id} story={s} saved onToggleSave={() => toggleSaveStory(s.id)} />
          ))}
        </ListGroup>
      ) : (
        <Text className="mx-5 text-[14px] text-mute">Bookmark stories in Discover to read them here.</Text>
      )}

      {/* Settings */}
      <SectionHeader title="Settings" />
      <ListGroup inset={60}>
        <SettingRow
          divider={false}
          icon="notifications"
          label="Game alerts"
          description="Scoring plays and close finishes"
          value={settings.notifications}
          onChange={(v) => setSetting('notifications', v)}
        />
        <SettingRow
          divider={false}
          icon="eye-off"
          label="Spoiler shield"
          description="Hide final scores in lists"
          value={settings.spoilerShield}
          onChange={(v) => setSetting('spoilerShield', v)}
        />
        <SettingRow
          divider={false}
          icon="sparkles"
          label="AI insights"
          description="Sideline AI analysis in game summaries"
          value={settings.aiCommentary}
          onChange={(v) => setSetting('aiCommentary', v)}
        />
        <SettingRow divider={false} icon="phone-portrait" label="Haptics" value={settings.haptics} onChange={(v) => setSetting('haptics', v)} />
      </ListGroup>

      <SectionHeader title="Developer" />
      <ListGroup inset={60}>
        <View className="flex-row items-center px-4 py-3">
          <View className="mr-3 h-8 w-8 items-center justify-center rounded-lg bg-white/10">
            <Ionicons name="information-circle" size={16} color={colors.ink} />
          </View>
          <Text className="flex-1 text-[15px] font-semibold text-ink">Version</Text>
          <Text className="text-[13px] text-mute">{Constants.expoConfig?.version ?? '1.0.0'} · Phase 1</Text>
        </View>
        <BackendStatus />
      </ListGroup>

      <Text className="mx-5 mt-6 text-center text-[11px] leading-4 text-mute">
        Sideline preview. Scores, stats, users, and AI responses are sample data.
      </Text>
    </Screen>
  );
}
