import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Text, View, type TextInput } from 'react-native';

import { AuthLayout, CodeField, FormMessage, TextField } from '@/components/auth';
import { Button } from '@/components/ui';
import {
  EMAIL_CODE_LENGTH,
  PASSWORD_HINT,
  codeError,
  emailError,
  friendlyAuthError,
  normalizeEmail,
  passwordError,
} from '@/lib/account';
import { resendConfirmation } from '@/services';
import { useCooldown } from '@/hooks/useCooldown';
import { useAuth } from '@/state/AuthContext';

export default function SignUpScreen() {
  // `verify=1&email=…` reopens the code step (e.g. from Log In when the email isn't confirmed yet).
  const params = useLocalSearchParams<{ email?: string; verify?: string }>();
  const { signUp, verifySignupCode } = useAuth();
  const [email, setEmail] = useState(params.email ?? '');
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(
    params.verify === '1' && params.email ? normalizeEmail(params.email) : null,
  );
  const [code, setCode] = useState('');
  const [cooldown, startCooldown] = useCooldown();
  const passwordRef = useRef<TextInput>(null);

  const emailProblem = touched ? emailError(email) : null;
  const passwordProblem = touched ? passwordError(password) : null;

  const submit = async () => {
    setTouched(true);
    if (emailError(email) || passwordError(password)) return;
    setBusy(true);
    setError(null);
    try {
      const { needsConfirmation } = await signUp(email, password);
      if (needsConfirmation) {
        setSentTo(normalizeEmail(email));
        startCooldown();
      }
      // Otherwise the session starts and the router moves on to onboarding.
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (!sentTo) return;
    const problem = codeError(code);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      await verifySignupCode(sentTo, code); // signed in: the router moves on to onboarding
    } catch (err) {
      setError(friendlyAuthError(err));
      setBusy(false);
    }
  };

  const resend = async () => {
    if (!sentTo) return;
    setError(null);
    try {
      await resendConfirmation(sentTo);
      startCooldown();
      setInfo('New code sent. Only the newest code works.');
    } catch (err) {
      setError(friendlyAuthError(err));
    }
  };

  if (sentTo) {
    return (
      <AuthLayout
        title="Enter your code"
        subtitle={`We emailed an ${EMAIL_CODE_LENGTH}-digit code to ${sentTo}. Enter it here to confirm your account. It works on any device.`}
        footer={
          <>
            <Button label="Confirm" loading={busy} onPress={verify} />
            <Button
              label={cooldown ? `Send a new code in ${cooldown}s` : 'Send a new code'}
              variant="ghost"
              disabled={cooldown > 0}
              onPress={resend}
            />
          </>
        }
      >
        <CodeField value={code} onChange={setCode} onSubmit={verify} />
        <FormMessage error={error} info={error ? null : info} />
        <Text className="text-[13px] leading-[19px] text-mute">
          Can’t find it? Check spam. Codes expire after an hour. Got a link instead of a code? Open
          it on this same device and browser.
        </Text>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Save your teams and preferences across devices."
      footer={
        <>
          <Button label="Create Account" loading={busy} onPress={submit} />
          <Button
            label="I Already Have an Account"
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
        error={emailProblem}
        placeholder="you@example.com"
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
      />
      <TextField
        ref={passwordRef}
        label="Password"
        password
        value={password}
        onChangeText={setPassword}
        error={passwordProblem}
        hint={PASSWORD_HINT}
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      <FormMessage error={error} />
      <View />
    </AuthLayout>
  );
}
