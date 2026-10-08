import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { FeaturedGameCard, GameCard, InsightCard, PredictionCard, TeamBadge } from '@/components/game';
import { Avatar, IconButton, MockBadge, Screen, SectionHeader, Skeleton } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { getFeaturedGame, getTeam, listGames, listOpenPredictions, listTopInsights } from '@/services';
import { useAppActions, useAppState } from '@/state/AppStore';
import { colors } from '@/theme';

async function loadHome() {
  const [featured, live, upcoming, insights, predictions] = await Promise.all([
    getFeaturedGame(),
    listGames('live'),
    listGames('scheduled'),
    listTopInsights(3),
    listOpenPredictions(),
  ]);
  return { featured, live: live.filter((g) => g.id !== featured.id), upcoming, insights, predictions: predictions.slice(0, 4) };
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export default function HomeScreen() {
  const { profile, settings } = useAppState();
  const { setSetting } = useAppActions();
  const { data, loading, reload } = useAsync(loadHome);
  const firstName = profile.displayName.split(' ')[0];

  return (
    <Screen onRefresh={reload} refreshing={loading && !!data}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-5 pb-5 pt-2">
        <View>
          <View className="flex-row items-center gap-1.5">
            <View className="h-2 w-2 rounded-full bg-volt" />
            <Text className="text-[13px] font-black tracking-[3px] text-ink">SIDELINE</Text>
          </View>
          <Text className="mt-1.5 text-2xl font-extrabold text-ink">
            {greeting()}, {firstName}
          </Text>
        </View>
        <View className="flex-row items-center gap-2.5">
          <IconButton
            icon={settings.notifications ? 'notifications' : 'notifications-off-outline'}
            color={settings.notifications ? colors.ink : colors.mute}
            accessibilityLabel={settings.notifications ? 'Turn off game alerts' : 'Turn on game alerts'}
            onPress={() => setSetting('notifications', !settings.notifications)}
          />
          <Pressable onPress={() => router.push('/profile')} accessibilityRole="button" accessibilityLabel="Open profile">
            <Avatar initials={profile.initials} color={colors.volt} size={40} />
          </Pressable>
        </View>
      </View>

      {/* Mock data notice */}
      <View className="mx-5 mb-4 flex-row items-center gap-2 rounded-xl border border-gold/25 bg-gold/5 px-3 py-2">
        <Ionicons name="information-circle" size={15} color={colors.gold} />
        <Text className="flex-1 text-xs text-sub">Preview build — scores, odds, and AI responses are simulated.</Text>
      </View>

      {!data ? (
        <View className="gap-4 px-5">
          <Skeleton className="h-[380px] rounded-3xl" />
          <Skeleton className="h-40" />
        </View>
      ) : (
        <>
          <FeaturedGameCard game={data.featured} />

          {/* Quick actions */}
          <View className="mx-5 mt-4 flex-row gap-3">
            <QuickAction
              icon="sparkles"
              label="Ask AI"
              tint={colors.ai}
              onPress={() => router.push({ pathname: '/game/[id]', params: { id: data.featured.id, tab: 'chat' } })}
            />
            <QuickAction icon="people" label="Watch party" tint={colors.volt} onPress={() => router.push('/party')} />
            <QuickAction
              icon="trophy"
              label="Make picks"
              tint={colors.gold}
              onPress={() => router.push({ pathname: '/game/[id]', params: { id: data.featured.id, tab: 'predict' } })}
            />
          </View>

          {data.live.length ? (
            <>
              <SectionHeader title="Live now" actionLabel="All games" onAction={() => router.push('/games')} />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-3 px-5">
                {data.live.map((g) => (
                  <GameCard key={g.id} game={g} variant="carousel" />
                ))}
              </ScrollView>
            </>
          ) : null}

          {settings.aiCommentary ? (
            <>
              <SectionHeader title="AI Pulse" accessory={<MockBadge />} />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-3 px-5">
                {data.insights.map((i) => (
                  <InsightCard key={i.id} insight={i} compact />
                ))}
              </ScrollView>
            </>
          ) : null}

          <SectionHeader title="Open predictions" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-3 px-5">
            {data.predictions.map((p) => (
              <PredictionCard key={p.id} prediction={p} compact />
            ))}
          </ScrollView>

          <SectionHeader title="Your teams" actionLabel="Edit" onAction={() => router.push('/profile')} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-3 px-5">
            {profile.favoriteTeamIds.map((id) => {
              const t = getTeam(id);
              return (
                <View key={id} className="w-[150px] flex-row items-center gap-3 rounded-2xl border border-line bg-surface p-3">
                  <TeamBadge teamId={id} size={36} />
                  <View>
                    <Text className="text-sm font-bold text-ink">{t.name}</Text>
                    <Text className="text-xs text-mute">{t.record}</Text>
                  </View>
                </View>
              );
            })}
            {profile.favoriteTeamIds.length === 0 ? (
              <Text className="py-3 text-sm text-mute">Follow teams from your profile to see them here.</Text>
            ) : null}
          </ScrollView>

          <SectionHeader title="Coming up" />
          <View className="gap-3 px-5">
            {data.upcoming.map((g) => (
              <GameCard key={g.id} game={g} />
            ))}
          </View>
        </>
      )}
    </Screen>
  );
}

function QuickAction({ icon, label, tint, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; tint: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className="flex-1 items-center gap-1.5 rounded-2xl border border-line bg-surface py-3.5 active:opacity-70"
    >
      <Ionicons name={icon} size={20} color={tint} />
      <Text className="text-xs font-semibold text-ink">{label}</Text>
    </Pressable>
  );
}
