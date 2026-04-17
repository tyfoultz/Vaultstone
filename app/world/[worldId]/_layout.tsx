import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Slot, useLocalSearchParams, useRouter } from 'expo-router';
import {
  Fraunces_400Regular,
  Fraunces_600SemiBold,
  Fraunces_700Bold,
} from '@expo-google-fonts/fraunces';
import {
  CormorantGaramond_400Regular,
  CormorantGaramond_500Medium,
  CormorantGaramond_400Regular_Italic,
} from '@expo-google-fonts/cormorant-garamond';
import { useFonts } from 'expo-font';
import {
  getPagesForWorld,
  getSectionsForWorld,
  getWorld,
} from '@vaultstone/api';
import {
  useAuthStore,
  useCurrentWorldStore,
  usePagesStore,
  useSectionsStore,
} from '@vaultstone/store';
import type { Database, WorldPage, WorldSection } from '@vaultstone/types';
import { Text, colors, spacing, useBreakpoint } from '@vaultstone/ui';

import { ActiveSectionProvider } from '../../../components/world/ActiveSectionContext';
import { WorldRail } from '../../../components/world/WorldRail';
import { WorldSidebar } from '../../../components/world/WorldSidebar';

type World = Database['public']['Tables']['worlds']['Row'];

export default function WorldLayout() {
  const { worldId } = useLocalSearchParams<{ worldId: string }>();
  const router = useRouter();
  const session = useAuthStore((s) => s.session);
  const setActiveWorld = useCurrentWorldStore((s) => s.setActiveWorld);
  const clearActiveWorld = useCurrentWorldStore((s) => s.clearActiveWorld);
  const setSections = useSectionsStore((s) => s.setSectionsForWorld);
  const setPages = usePagesStore((s) => s.setPagesForWorld);
  const [world, setWorld] = useState<World | null>(null);
  const [firstSectionId, setFirstSectionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { isMobile } = useBreakpoint();

  // Serif typography is scoped to /world/* routes. The rest of the app
  // keeps Space Grotesk + Manrope — any other Text component that requests
  // `family="serif-*"` outside this route simply falls back to system serif.
  const [fontsLoaded] = useFonts({
    Fraunces: Fraunces_400Regular,
    'Fraunces-SemiBold': Fraunces_600SemiBold,
    'Fraunces-Bold': Fraunces_700Bold,
    CormorantGaramond: CormorantGaramond_400Regular,
    'CormorantGaramond-Medium': CormorantGaramond_500Medium,
    'CormorantGaramond-Italic': CormorantGaramond_400Regular_Italic,
  });

  useEffect(() => {
    if (!session || !worldId) return;
    let cancelled = false;

    Promise.all([
      getWorld(worldId),
      getSectionsForWorld(worldId),
      getPagesForWorld(worldId),
    ]).then(([worldRes, sectionsRes, pagesRes]) => {
      if (cancelled) return;
      if (worldRes.error || !worldRes.data) {
        setError('World not found or you lack access.');
        setLoading(false);
        return;
      }
      const w = worldRes.data as World;
      setWorld(w);
      setActiveWorld(w);
      const sections = (sectionsRes.data ?? []) as WorldSection[];
      const pages = (pagesRes.data ?? []) as WorldPage[];
      setSections(worldId, sections);
      setPages(worldId, pages);
      setFirstSectionId(sections[0]?.id ?? null);
      setLoading(false);
    });

    return () => {
      cancelled = true;
      clearActiveWorld();
    };
  }, [session, worldId, setActiveWorld, clearActiveWorld, setSections, setPages]);

  if (!session) return null;

  if (loading || !fontsLoaded) {
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
    <ActiveSectionProvider initialSectionId={firstSectionId}>
      <View style={styles.root}>
        {!isMobile ? <WorldRail world={world} /> : null}
        {!isMobile ? <WorldSidebar world={world} /> : null}
        <View style={styles.content}>
          <Slot />
        </View>
      </View>
    </ActiveSectionProvider>
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
