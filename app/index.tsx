import { Redirect } from 'expo-router';
import { useAuthStore } from '@vaultstone/store';

export default function Index() {
  const session = useAuthStore((state) => state.session);
  return <Redirect href={session ? '/(tabs)/campaigns' : '/(auth)/login'} />;
}
