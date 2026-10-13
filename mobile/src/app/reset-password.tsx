import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { AuthLayout, FormMessage, TextField } from '@/components/auth';
import { Button } from '@/components/ui';
import { friendlyAuthError, passwordError } from '@/lib/account';
import { exchangeCode } from '@/services';
import { useAuth } from '@/state/AuthContext';
import { colors } from '@/theme';

type Phase = 'verifying' | 'ready' | 'invalid' | 'done';

/** Opened from the password-reset email (sideline://reset-password?code=…). */
export default function ResetPasswordScreen() {
  const { code, error_description: linkError } = useLocalSearchParams<{
    code?: string;
    error_description?: string;
  }>();
  const { session, updatePassword } = useAuth();
  const [phase, setPhase] = useState<Phase>(code ? 'verifying' : 'ready');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(linkError ?? null);

  useEffect(() => {
    if (!code) return;
    let alive = true;
    exchangeCode(code)
      .then(() => alive && setPhase('ready'))
      .catch(() => alive && setPhase('invalid'));
    return () => {
      alive = false;
    };
  }, [code]);

  const save = async () => {
    const problem = passwordError(password);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      await updatePassword(password);
      setPhase('done');
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  if (phase === 'verifying') {
    return (
      <View className="flex-1 items-center justify-center bg-bg">
        <ActivityIndicator color={colors.volt} />
      </View>
    );
  }

  if (phase === 'invalid' || (phase === 'ready' && !session)) {
    return (
      <AuthLayout
        title="Link expired"
        subtitle="This reset link has expired or was already used, or it was opened on a different device. Request a new one."
        back={() => router.replace('/')}
        footer={
          <Button label="Request a new link" onPress={() => router.replace('/forgot-password')} />
        }
      >
        <FormMessage error={error} />
      </AuthLayout>
    );
  }

  if (phase === 'done') {
    return (
      <AuthLayout
        title="Password updated"
        subtitle="You’re signed in with your new password."
        back={false}
        footer={<Button label="Continue" onPress={() => router.replace('/')} />}
      >
        <View />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Choose a new password"
      back={() => router.replace('/')}
      footer={<Button label="Save password" loading={busy} onPress={save} />}
    >
      <TextField
        label="New password"
        password
        value={password}
        onChangeText={setPassword}
        hint="At least 8 characters, with letters and numbers."
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="done"
        onSubmitEditing={save}
      />
      <FormMessage error={error} />
    </AuthLayout>
  );
}
