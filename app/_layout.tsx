import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Stack, router } from 'expo-router';
import { supabase } from '@vaultstone/api';
import { useAuthStore } from '@vaultstone/store';
import { colors } from '@vaultstone/ui';

export default function RootLayout() {
  const { setSession, setInitialized, initialized } = useAuthStore();
  const [recoveryMode, setRecoveryMode] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setInitialized();
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      if (event === 'PASSWORD_RECOVERY') {
        setRecoveryMode(true);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (initialized && recoveryMode) {
      router.replace('/reset-password');
    }
  }, [initialized, recoveryMode]);

  if (!initialized) {
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="campaign/new" />
      <Stack.Screen name="campaign/join" />
      <Stack.Screen name="campaign/[id]/index" />
      <Stack.Screen name="campaign/[id]/session" />
      <Stack.Screen name="character/[id]" />
      <Stack.Screen name="character/new" />
      <Stack.Screen name="reset-password" />
    </Stack>
  );
}
