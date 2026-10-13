import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { FormMessage, TextField } from '@/components/auth';
import { Button } from '@/components/ui';
import {
  displayNameError,
  friendlyAuthError,
  normalizeUsername,
  usernameError,
} from '@/lib/account';
import { isUsernameAvailable } from '@/services';
import type { AccountProfile, AccountProfileUpdate } from '@/types';
import { colors } from '@/theme';

interface ActionRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  onPress?: () => void;
  destructive?: boolean;
}

/** A tappable settings row (Edit profile, Change password, Log out…). */
export function ActionRow({ icon, label, value, onPress, destructive }: ActionRowProps) {
  const tint = destructive ? colors.loss : colors.ink;
  const body = (
    <View className="flex-row items-center px-4 py-3">
      <View
        className={`mr-3 h-8 w-8 items-center justify-center rounded-lg ${destructive ? 'bg-loss/15' : 'bg-white/10'}`}
      >
        <Ionicons name={icon} size={16} color={tint} />
      </View>
      <Text
        className={`flex-1 text-[15px] font-semibold ${destructive ? 'text-loss' : 'text-ink'}`}
      >
        {label}
      </Text>
      {value ? (
        <Text className="ml-3 max-w-[55%] text-[13px] text-mute" numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {onPress && !destructive ? (
        <Ionicons name="chevron-forward" size={16} color={colors.mute} style={{ marginLeft: 6 }} />
      ) : null}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}, ${value}` : label}
      className="active:opacity-70"
    >
      {body}
    </Pressable>
  );
}

interface EditorProps {
  profile: AccountProfile;
  onSave: (update: AccountProfileUpdate) => Promise<unknown>;
  onDone: () => void;
}

/** Inline editor for display name + username on the You screen. */
export function ProfileEditor({ profile, onSave, onDone }: EditorProps) {
  const [displayName, setDisplayName] = useState(profile.displayName ?? '');
  const [username, setUsername] = useState(profile.username ?? '');
  const [taken, setTaken] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameProblem = displayNameError(displayName);
  const handleProblem = usernameError(username);
  const changedHandle = username !== profile.username;

  useEffect(() => {
    if (handleProblem || !changedHandle) return;
    let alive = true;
    const t = setTimeout(() => {
      isUsernameAvailable(username)
        .then((ok) => alive && setTaken(!ok))
        .catch(() => {});
    }, 400);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [username, handleProblem, changedHandle]);

  const save = async () => {
    if (nameProblem || handleProblem || (changedHandle && taken)) return;
    setBusy(true);
    setError(null);
    try {
      await onSave({ displayName: displayName.trim(), username });
      onDone();
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="gap-4 p-4">
      <TextField
        label="Display name"
        value={displayName}
        onChangeText={setDisplayName}
        error={nameProblem}
        maxLength={40}
        autoCapitalize="words"
      />
      <TextField
        label="Username"
        prefix="@"
        value={username}
        onChangeText={(t) => {
          setTaken(false);
          setUsername(normalizeUsername(t));
        }}
        error={handleProblem ?? (changedHandle && taken ? 'That username is taken.' : null)}
        maxLength={20}
        autoCapitalize="none"
      />
      <FormMessage error={error} />
      <View className="flex-row gap-2">
        <Button label="Cancel" variant="secondary" size="sm" className="flex-1" onPress={onDone} />
        <Button label="Save" size="sm" className="flex-1" loading={busy} onPress={save} />
      </View>
    </View>
  );
}
