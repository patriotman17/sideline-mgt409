import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { ChoiceList } from '@/components/auth';
import { StoryCard } from '@/components/discover';
import { TeamBadge } from '@/components/game';
import {
  ActionRow,
  BackendStatus,
  ProfileEditor,
  ServerSessionRow,
  SettingRow,
} from '@/components/profile';
import {
  Avatar,
  Button,
  Chip,
  ListGroup,
  Screen,
  ScreenHeader,
  SectionHeader,
} from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import {
  EXPLANATION_STYLES,
  KNOWLEDGE_LEVELS,
  MAX_FAVORITE_TEAMS,
  friendlyAuthError,
  toggleFavorite,
} from '@/lib/account';
import { formatNumber } from '@/lib/format';
import { getDiscoverFeed, getTeam, listTeams } from '@/services';
import { useAppActions, useAppState } from '@/state/AppStore';
import { useAuth } from '@/state/AuthContext';
import { usePersonalization } from '@/state/usePersonalization';
import { colors } from '@/theme';
import type { AccountProfileUpdate } from '@/types';

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('') || '?';

const memberSince = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View className="flex-1 items-center">
      <Text className="font-score text-[26px] leading-[30px] text-ink">{value}</Text>
      <Text className="text-[12px] text-sub">{label}</Text>
    </View>
  );
}

export default function ProfileScreen() {
  const { profile, settings } = useAppState();
  const { toggleFollowTeam, setSetting } = useAppActions();
  const { favoriteTeamIds, primaryTeamId, savedStoryIds, toggleSaveStory } = usePersonalization();
  const auth = useAuth();
  const account = auth.status === 'ready' ? auth.profile : null;
  const [editingTeams, setEditingTeams] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [accountMessage, setAccountMessage] = useState<{ error?: string; info?: string } | null>(
    null,
  );
  const { data: feed } = useAsync(getDiscoverFeed);
  const { stats } = profile;
  const saved = feed?.stories.filter((s) => savedStoryIds.includes(s.id)) ?? [];

  // Signed in: identity, teams and preferences come from the account. Guest: the local demo profile.
  const name = account?.displayName ?? profile.displayName;
  const handle = account ? `@${account.username}` : profile.handle;
  const since = account ? memberSince(account.createdAt) : profile.memberSince;
  const teamIds = favoriteTeamIds; // primary first when signed in
  const notifications = account ? account.notificationsEnabled : settings.notifications;
  const spoilerShield = account ? account.spoilerShield : settings.spoilerShield;

  const saveAccount = async (update: AccountProfileUpdate) => {
    setAccountMessage(null);
    try {
      await auth.updateProfile(update);
    } catch (err) {
      setAccountMessage({ error: friendlyAuthError(err) });
    }
  };
  const toggleTeam = async (id: string) => {
    if (!account) return toggleFollowTeam(id);
    setAccountMessage(null);
    try {
      await auth.setFavoriteTeams(toggleFavorite(teamIds, id));
    } catch (err) {
      setAccountMessage({ error: friendlyAuthError(err) });
    }
  };

  return (
    <Screen>
      <ScreenHeader
        eyebrow={account ? 'Your account · Stats are sample data' : 'Demo profile · Sample data'}
        title="You"
      />

      {/* Identity */}
      <View className="mx-4 flex-row items-center rounded-2xl bg-surface p-4">
        <View>
          <Avatar
            initials={account ? initialsOf(name) : profile.initials}
            color={colors.volt}
            size={68}
          />
          <View className="absolute bottom-0.5 right-0.5 h-4 w-4 rounded-full border-[3px] border-surface bg-win" />
        </View>
        <View className="ml-4 flex-1">
          <Text className="text-[22px] font-bold text-ink">{name}</Text>
          <Text className="text-[14px] text-sub">{handle}</Text>
          <Text className="mt-0.5 text-[12px] text-mute">Member since {since}</Text>
        </View>
      </View>
      {!account && auth.status === 'guest' ? (
        <View className="mx-4 mt-3 rounded-2xl bg-volt/10 p-4">
          <Text className="text-[15px] font-semibold text-ink">You’re in demo mode</Text>
          <Text className="mt-1 text-[13px] leading-[18px] text-sub">
            {auth.accountsEnabled
              ? 'Create an account to save your teams and how Sideline AI explains the game.'
              : 'Accounts aren’t set up on this server, so everything here stays on this device.'}
          </Text>
          {auth.accountsEnabled ? (
            <Button
              label="Log in or create account"
              size="sm"
              className="mt-3 self-start"
              onPress={auth.exitDemo}
            />
          ) : null}
        </View>
      ) : null}
      <View className="mx-4 mt-3 flex-row rounded-2xl bg-surface py-3.5">
        <Stat value={formatNumber(stats.points)} label="Points" />
        <View className="w-px bg-white/10" />
        <Stat value={`${stats.accuracy}%`} label="Win rate" />
        <View className="w-px bg-white/10" />
        <Stat value={`#${stats.rank}`} label="Rank" />
      </View>

      {/* Teams */}
      <SectionHeader
        title="Your teams"
        actionLabel={editingTeams ? 'Done' : 'Edit'}
        onAction={() => setEditingTeams((e) => !e)}
      />
      {editingTeams ? (
        <View className="mx-4 flex-row flex-wrap gap-2">
          {account && teamIds.length ? (
            <View className="mb-2 w-full gap-2 rounded-2xl bg-surface p-3">
              <Text className="text-[12px] font-semibold text-sub">
                Your #1 team · shown first everywhere
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {teamIds.map((id) => (
                  <Chip
                    key={id}
                    label={`${id === primaryTeamId ? '★ ' : ''}${getTeam(id).abbr}`}
                    selected={id === primaryTeamId}
                    onPress={() => saveAccount({ primaryTeamId: id })}
                  />
                ))}
              </View>
            </View>
          ) : null}
          {account ? (
            <Text className="w-full text-[12px] text-mute">
              {teamIds.length} of {MAX_FAVORITE_TEAMS} · saved to your account
            </Text>
          ) : null}
          {listTeams().map((t) => (
            <Chip
              key={t.id}
              label={t.abbr}
              selected={teamIds.includes(t.id)}
              onPress={() => toggleTeam(t.id)}
              leading={
                <View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: t.primary }} />
              }
            />
          ))}
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-4 px-4"
        >
          {teamIds.map((id) => (
            <View key={id} className="items-center">
              <TeamBadge teamId={id} size={56} />
              <Text className="mt-1.5 text-[12px] text-sub">
                {account && id === primaryTeamId ? '★ ' : ''}
                {getTeam(id).name}
              </Text>
            </View>
          ))}
          <Pressable
            onPress={() => setEditingTeams(true)}
            accessibilityRole="button"
            accessibilityLabel="Add a team"
            className="items-center"
          >
            <View className="h-14 w-14 items-center justify-center rounded-full bg-white/10">
              <Ionicons name="add" size={24} color={colors.ink} />
            </View>
            <Text className="mt-1.5 text-[12px] text-sub">Add</Text>
          </Pressable>
        </ScrollView>
      )}

      {/* Badges */}
      <SectionHeader title="Badges" />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2 px-4"
      >
        {profile.badges.map((b) => (
          <View
            key={b.id}
            className={`flex-row items-center gap-1.5 rounded-full px-3.5 py-2 ${b.earned ? 'bg-white/10' : 'bg-white/5'}`}
          >
            <Ionicons
              name={(b.earned ? b.icon : 'lock-closed') as keyof typeof Ionicons.glyphMap}
              size={13}
              color={b.earned ? colors.volt : colors.mute}
            />
            <Text className={`text-[13px] font-medium ${b.earned ? 'text-ink' : 'text-mute'}`}>
              {b.label}
            </Text>
          </View>
        ))}
      </ScrollView>

      {/* Saved */}
      <SectionHeader
        title="Saved"
        actionLabel="Discover"
        onAction={() => router.push('/discover')}
      />
      {saved.length ? (
        <ListGroup>
          {saved.map((s) => (
            <StoryCard key={s.id} story={s} saved onToggleSave={() => toggleSaveStory(s.id)} />
          ))}
        </ListGroup>
      ) : (
        <Text className="mx-5 text-[14px] text-mute">
          Bookmark stories in Discover to read them here.
        </Text>
      )}

      {accountMessage?.error ? (
        <Text className="mx-5 mt-3 text-[13px] text-loss">{accountMessage.error}</Text>
      ) : null}

      {/* Sideline AI preferences (saved to the account) */}
      {account ? (
        <>
          <SectionHeader title="Sideline AI" />
          <View className="mx-4 gap-4 rounded-2xl bg-surface p-4">
            <ChoiceList
              compact
              label="Your football knowledge"
              options={KNOWLEDGE_LEVELS}
              value={account.knowledgeLevel}
              onChange={(v) => saveAccount({ knowledgeLevel: v })}
            />
            <ChoiceList
              compact
              label="AI explanation style"
              options={EXPLANATION_STYLES}
              value={account.explanationStyle}
              onChange={(v) => saveAccount({ explanationStyle: v })}
            />
          </View>
        </>
      ) : null}

      {/* Settings */}
      <SectionHeader title="Settings" />
      <ListGroup inset={60}>
        <SettingRow
          divider={false}
          icon="notifications"
          label="Game alerts"
          description="Scoring plays and close finishes"
          value={notifications}
          onChange={(v) => {
            setSetting('notifications', v);
            if (account) saveAccount({ notificationsEnabled: v });
          }}
        />
        <SettingRow
          divider={false}
          icon="eye-off"
          label="Spoiler shield"
          description="Hide final scores in lists"
          value={spoilerShield}
          onChange={(v) => {
            setSetting('spoilerShield', v);
            if (account) saveAccount({ spoilerShield: v });
          }}
        />
        <SettingRow
          divider={false}
          icon="sparkles"
          label="AI insights"
          description="Sideline AI analysis in game summaries"
          value={settings.aiCommentary}
          onChange={(v) => setSetting('aiCommentary', v)}
        />
        <SettingRow
          divider={false}
          icon="phone-portrait"
          label="Haptics"
          value={settings.haptics}
          onChange={(v) => setSetting('haptics', v)}
        />
      </ListGroup>

      {/* Account */}
      {account ? (
        <>
          <SectionHeader title="Account" />
          {editingProfile ? (
            <View className="mx-4 rounded-2xl bg-surface">
              <ProfileEditor
                profile={account}
                onSave={auth.updateProfile}
                onDone={() => setEditingProfile(false)}
              />
            </View>
          ) : (
            <ListGroup inset={60}>
              <ActionRow
                icon="person"
                label="Edit profile"
                value={handle}
                onPress={() => setEditingProfile(true)}
              />
              <ActionRow icon="mail" label="Email" value={auth.email ?? ''} />
              <ActionRow
                icon="key"
                label="Change password"
                onPress={async () => {
                  if (!auth.email) return;
                  setAccountMessage(null);
                  try {
                    await auth.sendPasswordReset(auth.email);
                    setAccountMessage({ info: `We emailed a reset link to ${auth.email}.` });
                  } catch (err) {
                    setAccountMessage({ error: friendlyAuthError(err) });
                  }
                }}
              />
              <ActionRow icon="log-out" label="Log out" destructive onPress={auth.signOut} />
            </ListGroup>
          )}
          {accountMessage?.info ? (
            <Text className="mx-5 mt-2 text-[13px] text-win">{accountMessage.info}</Text>
          ) : null}
        </>
      ) : auth.status === 'guest' ? (
        <>
          <SectionHeader title="Account" />
          <ListGroup inset={60}>
            <ActionRow icon="exit" label="Exit demo" onPress={auth.exitDemo} />
          </ListGroup>
        </>
      ) : null}

      <SectionHeader title="Developer" />
      <ListGroup inset={60}>
        <View className="flex-row items-center px-4 py-3">
          <View className="mr-3 h-8 w-8 items-center justify-center rounded-lg bg-white/10">
            <Ionicons name="information-circle" size={16} color={colors.ink} />
          </View>
          <Text className="flex-1 text-[15px] font-semibold text-ink">Version</Text>
          <Text className="text-[13px] text-mute">
            {Constants.expoConfig?.version ?? '1.0.0'} · Phase 1
          </Text>
        </View>
        <SettingRow
          icon="speedometer"
          label="Show AI usage"
          description="Tokens and cost under every AI answer"
          value={settings.showAiUsage}
          onChange={(v) => setSetting('showAiUsage', v)}
        />
        <BackendStatus />
        {account ? <ServerSessionRow userId={account.id} /> : null}
      </ListGroup>

      <Text className="mx-5 mt-6 text-center text-[11px] leading-4 text-mute">
        Sideline preview. Scores, stats, users, and AI responses are sample data.
      </Text>
    </Screen>
  );
}
