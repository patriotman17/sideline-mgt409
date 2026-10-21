import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, Text, type TextInput } from 'react-native';

import { AuthLayout, FormMessage, TextField } from '@/components/auth';
import { Button } from '@/components/ui';
import {
  EMAIL_DELIVERY,
  emailError,
  friendlyAuthError,
  loginPasswordError,
  normalizeEmail,
} from '@/lib/account';
import { useAuth } from '@/state/AuthContext';

export default function SignInScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const passwordRef = useRef<TextInput>(null);

  const submit = async () => {
    if (emailError(email)) return setError('Enter a valid email address.');
    const passwordProblem = loginPasswordError(password);
    if (passwordProblem) return setError(passwordProblem);
    setBusy(true);
    setError(null);
    setUnconfirmed(false);
    try {
      await signIn(email, password); // the router guard takes it from here
    } catch (err) {
      setError(friendlyAuthError(err));
      setUnconfirmed((err as { code?: string })?.code === 'email_not_confirmed');
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Log in to pick up where you left off."
      footer={
        <>
          <Button label="Log In" loading={busy} onPress={submit} />
          <Button
            label="Create an account"
            variant="ghost"
            onPress={() => router.replace('/sign-up')}
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
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
      />
      <TextField
        ref={passwordRef}
        label="Password"
        password
        value={password}
        onChangeText={setPassword}
        autoCapitalize="none"
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      {EMAIL_DELIVERY ? (
        <Pressable
          onPress={() => router.push({ pathname: '/forgot-password', params: { email } })}
          accessibilityRole="button"
          className="self-start active:opacity-70"
          hitSlop={8}
        >
          <Text className="text-[14px] font-semibold text-volt">Forgot password?</Text>
        </Pressable>
      ) : null}
      <FormMessage error={error} />
      {unconfirmed ? (
        <Button
          label="Enter my confirmation code"
          variant="secondary"
          size="sm"
          className="self-start"
          onPress={() =>
            router.push({
              pathname: '/sign-up',
              params: { email: normalizeEmail(email), verify: '1' },
            })
          }
        />
      ) : null}
    </AuthLayout>
  );
}
