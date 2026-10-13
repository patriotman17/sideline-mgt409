import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { AuthLayout } from '@/components/auth';
import { Button } from '@/components/ui';
import { exchangeCode } from '@/services';
import { colors } from '@/theme';

/**
 * Email-confirmation landing (sideline://auth/callback?code=…). Exchanges the one-time code for a
 * session on this device; the router guards then send a new user to onboarding.
 */
export default function AuthCallbackScreen() {
  const { code, error_description: linkError } = useLocalSearchParams<{
    code?: string;
    error_description?: string;
  }>();
  const [failed, setFailed] = useState(!code || !!linkError);

  useEffect(() => {
    if (!code || linkError) return;
    let alive = true;
    exchangeCode(code)
      .then(() => alive && router.replace('/'))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [code, linkError]);

  if (!failed) {
    return (
      <View className="flex-1 items-center justify-center bg-bg">
        <ActivityIndicator color={colors.volt} />
      </View>
    );
  }

  return (
    <AuthLayout
      title={linkError ? 'Link problem' : 'Email confirmed'}
      subtitle={
        linkError
          ? `${linkError}. Log in, or sign up again to get a fresh link.`
          : 'If you opened this link on another device, your email is still confirmed. Log in to continue.'
      }
      back={() => router.replace('/')}
      footer={<Button label="Log In" onPress={() => router.replace('/sign-in')} />}
    >
      <View />
    </AuthLayout>
  );
}
