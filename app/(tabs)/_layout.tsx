import { Redirect, Tabs } from 'expo-router';
import { useAuthStore } from '@vaultstone/store';
import { colors } from '@vaultstone/ui';

export default function TabsLayout() {
  const session = useAuthStore((state) => state.session);

  if (!session) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.textSecondary,
      }}
    >
      <Tabs.Screen name="campaigns" options={{ title: 'Campaigns' }} />
      <Tabs.Screen name="characters" options={{ title: 'Characters' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}
