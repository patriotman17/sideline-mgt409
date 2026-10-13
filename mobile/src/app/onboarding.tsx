import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { AuthLayout, ChoiceList, FormMessage, TeamPicker, TextField } from '@/components/auth';
import { TeamBadge } from '@/components/game';
import { SettingRow } from '@/components/profile';
import { Button, ListGroup } from '@/components/ui';
import {
  EXPLANATION_STYLES,
  KNOWLEDGE_LEVELS,
  displayNameError,
  friendlyAuthError,
  normalizeUsername,
  usernameError,
} from '@/lib/account';
import { getTeam, isUsernameAvailable } from '@/services';
import { useAuth } from '@/state/AuthContext';
import type { ExplanationStyle, KnowledgeLevel } from '@/types';

type Availability = 'idle' | 'checking' | 'available' | 'taken' | 'error';
const STEPS = 4;

export default function OnboardingScreen() {
  const { profile, favoriteTeams, completeOnboarding, signOut } = useAuth();
  const [step, setStep] = useState(1);
  // Step 1: identity
  const [displayName, setDisplayName] = useState(profile?.displayName ?? '');
  const [username, setUsername] = useState(profile?.username ?? '');
  const [usernameEdited, setUsernameEdited] = useState(!!profile?.username);
  const [availability, setAvailability] = useState<Availability>('idle');
  const [touched, setTouched] = useState(false);
  // Step 2: teams
  const [teams, setTeams] = useState<string[]>(favoriteTeams);
  const [primary, setPrimary] = useState<string | null>(
    profile?.primaryTeamId ?? favoriteTeams[0] ?? null,
  );
  // Step 3: personalize
  const [knowledge, setKnowledge] = useState<KnowledgeLevel>(profile?.knowledgeLevel ?? 'regular');
  const [style, setStyle] = useState<ExplanationStyle>(profile?.explanationStyle ?? 'balanced');
  const [spoilerShield, setSpoilerShield] = useState(profile?.spoilerShield ?? false);
  const [notifications, setNotifications] = useState(profile?.notificationsEnabled ?? true);
  // Step 4: save
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Suggest a username from the display name until the user types their own.
  const handle = usernameEdited
    ? username
    : normalizeUsername(displayName)
        .replace(/[^a-z0-9_]/g, '')
        .slice(0, 20);
  const handleProblem = usernameError(handle);

  // Debounced availability check (the unique constraint is still the final word on save).
  useEffect(() => {
    if (handleProblem) return;
    let alive = true;
    const t = setTimeout(() => {
      setAvailability('checking');
      isUsernameAvailable(handle)
        .then((ok) => alive && setAvailability(ok ? 'available' : 'taken'))
        .catch(() => alive && setAvailability('error'));
    }, 400);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [handle, handleProblem]);

  const nameProblem = touched ? displayNameError(displayName) : null;
  const usernameMessage =
    touched && handleProblem
      ? handleProblem
      : !handleProblem && availability === 'taken'
        ? 'That username is taken.'
        : null;
  const usernameHint = handleProblem
    ? 'Letters, numbers, and underscores (3-20).'
    : availability === 'checking'
      ? 'Checking…'
      : availability === 'available'
        ? `@${handle} is available`
        : availability === 'error'
          ? 'Couldn’t check right now. We’ll confirm when you finish.'
          : null;

  const toTeams = () => {
    setTouched(true);
    if (displayNameError(displayName) || handleProblem || availability === 'taken') return;
    setError(null);
    setStep(2);
  };

  const finish = async () => {
    setBusy(true);
    setError(null);
    try {
      await completeOnboarding({
        username: handle,
        displayName: displayName.trim(),
        teamIds: teams,
        primaryTeamId: primary,
        knowledgeLevel: knowledge,
        explanationStyle: style,
        spoilerShield,
        notificationsEnabled: notifications,
      });
      // The router guard moves into the app as soon as the profile is marked onboarded.
    } catch (err) {
      const message = friendlyAuthError(err);
      setError(message);
      if (message === 'That username is taken.') {
        setAvailability('taken');
        setStep(1);
      }
      setBusy(false);
    }
  };

  if (step === 1) {
    return (
      <AuthLayout
        progress={[1, STEPS]}
        motionKey={1}
        eyebrow="Your identity"
        title="What should we call you?"
        subtitle="Your name and a unique username."
        back={false}
        footer={
          <>
            <Button label="Continue" onPress={toTeams} />
            <Pressable
              onPress={signOut}
              accessibilityRole="button"
              className="items-center py-1 active:opacity-70"
            >
              <Text className="text-[13px] text-mute">Not you? Log out</Text>
            </Pressable>
          </>
        }
      >
        <TextField
          label="Display name"
          value={displayName}
          onChangeText={setDisplayName}
          error={nameProblem}
          placeholder="Jordan Lee"
          autoCapitalize="words"
          autoComplete="name"
          textContentType="name"
          maxLength={40}
          returnKeyType="next"
        />
        <TextField
          label="Username"
          prefix="@"
          value={handle}
          onChangeText={(t) => {
            setUsernameEdited(true);
            setUsername(normalizeUsername(t));
          }}
          error={usernameMessage}
          hint={usernameHint}
          placeholder="jordan_lee"
          autoCapitalize="none"
          autoComplete="username"
          textContentType="username"
          maxLength={20}
          returnKeyType="done"
          onSubmitEditing={toTeams}
        />
        <FormMessage error={error} />
      </AuthLayout>
    );
  }

  if (step === 2) {
    return (
      <AuthLayout
        progress={[2, STEPS]}
        motionKey={2}
        eyebrow="Your teams"
        title="Who do you root for?"
        subtitle="Pick as many as you like (up to 8), then star your #1."
        back={() => setStep(1)}
        footer={
          <Button label={teams.length ? 'Continue' : 'Skip for now'} onPress={() => setStep(3)} />
        }
      >
        <TeamPicker
          value={teams}
          onChange={setTeams}
          primary={primary}
          onPrimaryChange={setPrimary}
        />
      </AuthLayout>
    );
  }

  if (step === 3) {
    return (
      <AuthLayout
        progress={[3, STEPS]}
        motionKey={3}
        eyebrow="Personalize"
        title="Make Sideline yours"
        subtitle="Sideline AI adapts its explanations. Game facts never change."
        back={() => setStep(2)}
        footer={<Button label="Continue" onPress={() => setStep(4)} />}
      >
        <ChoiceList
          label="Your football knowledge"
          options={KNOWLEDGE_LEVELS}
          value={knowledge}
          onChange={setKnowledge}
        />
        <ChoiceList
          label="AI explanation style"
          options={EXPLANATION_STYLES}
          value={style}
          onChange={setStyle}
        />
        {/* ListGroup is inset 16pt for full-width screens; cancel that inside the form column. */}
        <View className="-mx-4">
          <ListGroup inset={60}>
            <SettingRow
              divider={false}
              icon="eye-off"
              label="Spoiler shield"
              description="Hide final scores until you open a game"
              value={spoilerShield}
              onChange={setSpoilerShield}
            />
            <SettingRow
              divider={false}
              icon="notifications"
              label="Game alerts"
              description="Scoring plays and close finishes"
              value={notifications}
              onChange={setNotifications}
            />
          </ListGroup>
        </View>
      </AuthLayout>
    );
  }

  const knowledgeLabel = KNOWLEDGE_LEVELS.find((k) => k.value === knowledge)?.label;
  const styleLabel = EXPLANATION_STYLES.find((k) => k.value === style)?.label;
  return (
    <AuthLayout
      progress={[4, STEPS]}
      motionKey={4}
      eyebrow="All set"
      title={`Welcome, ${displayName.trim().split(/\s+/)[0]}.`}
      subtitle="Here’s how Sideline will set things up. You can change anything later in You."
      back={busy ? false : () => setStep(3)}
      footer={
        <>
          <FormMessage error={error} />
          <Button label="Start watching" loading={busy} onPress={finish} />
        </>
      }
    >
      <View className="rounded-2xl bg-surface p-4">
        <Text className="text-[20px] font-bold text-ink">{displayName.trim()}</Text>
        <Text className="text-[14px] text-sub">@{handle}</Text>
        {teams.length ? (
          <View className="mt-4 flex-row flex-wrap gap-3">
            {[...(primary ? [primary] : []), ...teams.filter((t) => t !== primary)].map((id) => (
              <View key={id} className="items-center">
                <TeamBadge teamId={id} size={40} />
                <Text className="mt-1 text-[11px] text-sub">
                  {id === primary ? '★ ' : ''}
                  {getTeam(id).abbr}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <Text className="mt-3 text-[13px] text-mute">No teams yet. Add them anytime in You.</Text>
        )}
      </View>
      <View className="gap-2 rounded-2xl bg-surface p-4">
        <Summary label="Knowledge" value={knowledgeLabel} />
        <Summary label="AI explanations" value={styleLabel} />
        <Summary label="Spoiler shield" value={spoilerShield ? 'On' : 'Off'} />
        <Summary label="Game alerts" value={notifications ? 'On' : 'Off'} />
      </View>
    </AuthLayout>
  );
}

function Summary({ label, value }: { label: string; value?: string }) {
  return (
    <View className="flex-row justify-between">
      <Text className="text-[14px] text-sub">{label}</Text>
      <Text className="text-[14px] font-semibold text-ink">{value}</Text>
    </View>
  );
}
