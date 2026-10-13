import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';

import { AuthLayout, CodeField, FormMessage, TextField } from '@/components/auth';
import { Button } from '@/components/ui';
import { useCooldown } from '@/hooks/useCooldown';
import {
  EMAIL_CODE_LENGTH,
  codeError,
  emailError,
  friendlyAuthError,
  normalizeEmail,
  passwordError,
} from '@/lib/account';
import { useAuth } from '@/state/AuthContext';

/**
 * Forgot password, entirely in the app: request a code by email, then enter the code and a new
 * password. No email links, so it works on any device and email app.
 */
export default function ForgotPasswordScreen() {
  const params = useLocalSearchParams<{ email?: string }>();
  const { sendPasswordReset, resetPasswordWithCode } = useAuth();
  const [email, setEmail] = useState(params.email ?? '');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, startCooldown] = useCooldown();

  const send = async () => {
    const problem = emailError(email);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      await sendPasswordReset(email);
      setSentTo(normalizeEmail(email));
      startCooldown();
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    if (!sentTo) return;
    const problem = codeError(code) ?? passwordError(password);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      // Verifies the code (signing this device in), then sets the new password. The router then
      // opens the app, already signed in with the new password.
      await resetPasswordWithCode(sentTo, code, password);
    } catch (err) {
      setError(friendlyAuthError(err));
      setBusy(false);
    }
  };

  if (sentTo) {
    return (
      <AuthLayout
        title="Choose a new password"
        // Same message whether or not the account exists, so emails can't be probed.
        subtitle={`If an account exists for ${sentTo}, we emailed it an ${EMAIL_CODE_LENGTH}-digit code. Enter it with your new password.`}
        back={() => setSentTo(null)}
        footer={
          <>
            <Button label="Reset password" loading={busy} onPress={reset} />
            <Button
              label={cooldown ? `Send a new code in ${cooldown}s` : 'Send a new code'}
              variant="ghost"
              disabled={cooldown > 0 || busy}
              onPress={send}
            />
          </>
        }
      >
        <CodeField value={code} onChange={setCode} />
        <TextField
          label="New password"
          password
          value={password}
          onChangeText={setPassword}
          hint="At least 8 characters, with letters and numbers."
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="go"
          onSubmitEditing={reset}
        />
        <FormMessage error={error} />
        <Text className="text-[13px] leading-[19px] text-mute">
          Codes expire after an hour, and only the newest code works. Got a link instead of a code?
          Open it on this same device and browser.
        </Text>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Reset your password"
      subtitle={`We’ll email you an ${EMAIL_CODE_LENGTH}-digit code to choose a new password.`}
      footer={
        <>
          <Button label="Send code" loading={busy} onPress={send} />
          <Button
            label="Back to Log In"
            variant="ghost"
            onPress={() => router.replace('/sign-in')}
          />
        </>
      }
    >
      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="send"
        onSubmitEditing={send}
      />
      <FormMessage error={error} />
    </AuthLayout>
  );
}
