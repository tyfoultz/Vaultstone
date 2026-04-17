import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Slot, useLocalSearchParams, useRouter } from 'expo-router';
import { getWorld } from '@vaultstone/api';
import { useAuthStore, useCurrentWorldStore } from '@vaultstone/store';
import { colors, spacing, Text, useBreakpoint } from '@vaultstone/ui';
import type { Database } from '@vaultstone/types';
import { WorldSidebar } from '../../../components/world/WorldSidebar';

type World = Database['public']['Tables']['worlds']['Row'];

export default function WorldLayout() {
  const { worldId } = useLocalSearchParams<{ worldId: string }>();
  const router = useRouter();
  const session = useAuthStore((s) => s.session);
  const setActiveWorld = useCurrentWorldStore((s) => s.setActiveWorld);
  const clearActiveWorld = useCurrentWorldStore((s) => s.clearActiveWorld);
  const [world, setWorld] = useState<World | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { isMobile } = useBreakpoint();

  useEffect(() => {
    if (!session || !worldId) return;
    getWorld(worldId).then(({ data, error: err }) => {
      if (err || !data) {
        setError('World not found or you lack access.');
        setLoading(false);
        return;
      }
      setWorld(data as World);
      setActiveWorld(data as World);
      setLoading(false);
    });
    return () => clearActiveWorld();
  }, [session, worldId, setActiveWorld, clearActiveWorld]);

  if (!session) return null;

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (error || !world) {
    return (
      <View style={styles.centered}>
        <Text variant="body-md" style={{ color: colors.hpDanger }}>
          {error || 'World not found.'}
        </Text>
        <Text
          variant="label-md"
          tone="accent"
          onPress={() => router.replace('/worlds')}
          style={{ marginTop: spacing.md, textDecorationLine: 'underline' }}
        >
          Back to worlds
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {!isMobile ? <WorldSidebar world={world} /> : null}
      <View style={styles.content}>
        <Slot />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: colors.surfaceCanvas,
  },
  content: {
    flex: 1,
    backgroundColor: colors.surfaceCanvas,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceCanvas,
  },
});
