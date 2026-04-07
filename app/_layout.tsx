import { useEffect } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { supabase } from '@vaultstone/api';
import { useAuthStore } from '@vaultstone/store';
import { colors } from '@vaultstone/ui';

export default function RootLayout() {
  const { setSession, setInitialized, initialized } = useAuthStore();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setInitialized();
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (!initialized) {
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="campaign/[id]/index" />
      <Stack.Screen name="campaign/[id]/session" />
      <Stack.Screen name="character/[id]" />
      <Stack.Screen name="character/new" />
    </Stack>
  );
}
