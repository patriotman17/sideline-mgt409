import { router } from 'expo-router';

import { Button, EmptyState, Screen } from '@/components/ui';

export default function NotFoundScreen() {
  return (
    <Screen scroll={false}>
      <EmptyState icon="help-circle-outline" title="Out of bounds" body="That screen doesn’t exist.">
        <Button label="Back to Home" onPress={() => router.replace('/')} />
      </EmptyState>
    </Screen>
  );
}
