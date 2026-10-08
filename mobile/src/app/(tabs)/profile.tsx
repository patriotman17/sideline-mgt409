import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { Text, View } from 'react-native';

import { TeamBadge } from '@/components/game';
import { BackendStatus, SettingRow, StatTile } from '@/components/profile';
import { Avatar, Card, Chip, MockBadge, Screen, ScreenHeader, SectionHeader } from '@/components/ui';
import { formatNumber } from '@/lib/format';
import { listTeams } from '@/services';
import { useAppActions, useAppState } from '@/state/AppStore';
import { colors } from '@/theme';

export default function ProfileScreen() {
  const { profile, settings, picks } = useAppState();
  const { toggleFollowTeam, setSetting } = useAppActions();
  const { stats } = profile;

  return (
    <Screen>
      <ScreenHeader eyebrow="Your sideline" title="Profile" right={<MockBadge label="DEMO USER" />} />

      <Card className="mx-5 flex-row items-center p-4">
        <Avatar initials={profile.initials} color={colors.volt} size={60} />
        <View className="ml-4 flex-1">
          <Text className="text-xl font-extrabold text-ink">{profile.displayName}</Text>
          <Text className="text-sm text-sub">{profile.handle}</Text>
          <Text className="mt-1 text-xs text-mute">Member since {profile.memberSince}</Text>
        </View>
        <View className="flex-row">
          {profile.favoriteTeamIds.slice(0, 3).map((id, i) => (
            <View key={id} style={{ marginLeft: i ? -8 : 0 }}>
              <TeamBadge teamId={id} size={30} />
            </View>
          ))}
        </View>
      </Card>

      <View className="mx-5 mt-3 flex-row gap-3">
        <StatTile icon="trophy" label="Points" value={formatNumber(stats.points)} />
        <StatTile icon="locate" label="Accuracy" value={`${stats.accuracy}%`} accent={colors.win} />
      </View>
      <View className="mx-5 mt-3 flex-row gap-3">
        <StatTile icon="flame" label="Win streak" value={String(stats.streak)} accent={colors.live} />
        <StatTile icon="podium" label="Global rank" value={`#${stats.rank}`} accent={colors.gold} />
        <StatTile icon="checkmark-done" label="Picks made" value={String(Object.keys(picks).length)} accent={colors.ai} />
      </View>

      <SectionHeader title="Badges" />
      <View className="mx-5 flex-row flex-wrap gap-2">
        {profile.badges.map((b) => (
          <View
            key={b.id}
            className={`flex-row items-center gap-1.5 rounded-full border px-3 py-2 ${b.earned ? 'border-volt/40 bg-voltDim' : 'border-line bg-surface opacity-50'}`}
          >
            <Ionicons name={(b.earned ? b.icon : 'lock-closed') as keyof typeof Ionicons.glyphMap} size={13} color={b.earned ? colors.volt : colors.mute} />
            <Text className={`text-xs font-semibold ${b.earned ? 'text-ink' : 'text-mute'}`}>{b.label}</Text>
          </View>
        ))}
      </View>

      <SectionHeader title="Favorite teams" accessory={<Text className="text-xs text-mute">{profile.favoriteTeamIds.length} following</Text>} />
      <View className="mx-5 flex-row flex-wrap gap-2">
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

      <SectionHeader title="Settings" />
      <Card className="mx-5 px-4">
        <SettingRow
          divider={false}
          icon="notifications"
          label="Game alerts"
          description="Scoring plays and close-game alerts"
          value={settings.notifications}
          onChange={(v) => setSetting('notifications', v)}
        />
        <SettingRow
          icon="eye-off"
          label="Spoiler shield"
          description="Hide final scores until you tap in"
          value={settings.spoilerShield}
          onChange={(v) => setSetting('spoilerShield', v)}
        />
        <SettingRow
          icon="sparkles"
          label="AI commentary"
          description="Show AI insights during live games"
          value={settings.aiCommentary}
          onChange={(v) => setSetting('aiCommentary', v)}
        />
        <SettingRow icon="phone-portrait" label="Haptics" value={settings.haptics} onChange={(v) => setSetting('haptics', v)} />
      </Card>

      <SectionHeader title="Developer" />
      <Card className="mx-5 px-4">
        <View className="flex-row items-center py-3.5">
          <View className="mr-3 h-9 w-9 items-center justify-center rounded-xl bg-elevated">
            <Ionicons name="information-circle" size={17} color={colors.sub} />
          </View>
          <Text className="flex-1 text-[15px] font-semibold text-ink">Version</Text>
          <Text className="text-xs text-mute">{Constants.expoConfig?.version ?? '1.0.0'} · Phase 1</Text>
        </View>
        <BackendStatus />
      </Card>

      <Text className="mx-5 mt-6 text-center text-[11px] leading-4 text-mute">
        Sideline preview. All scores, stats, users, and AI responses shown are mock data.
      </Text>
    </Screen>
  );
}
