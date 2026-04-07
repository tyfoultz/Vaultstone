import { Redirect, Stack } from 'expo-router';
import { useAuthStore } from '@vaultstone/store';

export default function AuthLayout() {
  const session = useAuthStore((state) => state.session);

  if (session) {
    return <Redirect href="/(tabs)/campaigns" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
