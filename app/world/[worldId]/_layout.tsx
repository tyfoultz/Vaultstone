import { useEffect, useMemo, useState } from 'react';
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
  getCampaignsForWorld,
  getPagesForWorld,
  getSectionsForWorld,
  getWorld,
  supabase,
} from '@vaultstone/api';
import {
  useAuthStore,
  useCurrentWorldStore,
  usePagesStore,
  useSectionsStore,
} from '@vaultstone/store';
import type { Database, WorldPage, WorldSection } from '@vaultstone/types';
import { Text, colors, spacing, useBreakpoint } from '@vaultstone/ui';

import { AiAssistantHost } from '../../../components/ai/AiAssistantHost';
import type { AiChatSeed } from '../../../components/ai/AiChatContext';
import { ActiveSectionProvider } from '../../../components/world/ActiveSectionContext';
import { LensSwitchBanner } from '../../../components/world/LensSwitchBanner';
import { MobileWorldTabBar } from '../../../components/world/MobileWorldTabBar';
import { PlayerViewBanner } from '../../../components/world/PlayerViewBanner';
import { WorldSidebar } from '../../../components/world/WorldSidebar';

type World = Database['public']['Tables']['worlds']['Row'];

export default function WorldLayout() {
  const { worldId, lens } = useLocalSearchParams<{
    worldId: string;
    lens?: string;
  }>();
  const router = useRouter();
  const session = useAuthStore((s) => s.session);
  const user = useAuthStore((s) => s.user);
  const storeWorld = useCurrentWorldStore((s) => s.world);
  const lensCampaignId = useCurrentWorldStore((s) => s.lensCampaignId);
  const linkedCampaigns = useCurrentWorldStore((s) => s.linkedCampaigns);
  const setActiveWorld = useCurrentWorldStore((s) => s.setActiveWorld);
  const clearActiveWorld = useCurrentWorldStore((s) => s.clearActiveWorld);
  const setLens = useCurrentWorldStore((s) => s.setLens);
  const setLinkedCampaigns = useCurrentWorldStore((s) => s.setLinkedCampaigns);
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
      getCampaignsForWorld(worldId),
    ]).then(([worldRes, sectionsRes, pagesRes, campaignsRes]) => {
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
      const pages = (pagesRes.data ?? []) as unknown as WorldPage[];
      const linked = (
        (campaignsRes.data ?? []) as unknown as Array<{
          campaigns: Database['public']['Tables']['campaigns']['Row'] | null;
        }>
      )
        .map((row) => row.campaigns)
        .filter((c): c is Database['public']['Tables']['campaigns']['Row'] => !!c);
      setSections(worldId, sections);
      setPages(worldId, pages);
      setLinkedCampaigns(linked);
      // Entry heuristic: ?lens=<campaignId> if present and the campaign is
      // linked; otherwise default to world-only (null). Phase 4g will add the
      // mid-session switch banner if the DM flips lenses during play.
      if (lens && linked.some((c) => c.id === lens)) {
        setLens(lens);
      } else {
        setLens(null);
      }
      setFirstSectionId(sections[0]?.id ?? null);
      setLoading(false);
    });

    return () => {
      cancelled = true;
      clearActiveWorld();
    };
  }, [
    session,
    worldId,
    lens,
    setActiveWorld,
    clearActiveWorld,
    setLens,
    setLinkedCampaigns,
    setSections,
    setPages,
  ]);

  // Realtime: world_page_permissions only. The previous subscription also
  // watched world_pages UPDATEs, but Supabase Realtime ships the full row
  // (including the large `body` JSONB) on every page save — generating
  // megabytes of egress per editing session with just 1-2 users. Metadata
  // changes (title, visibility, sort_order) are rare enough to pick up on
  // the next navigation or manual refresh.
  useEffect(() => {
    if (!session || !worldId) return;
    const name = `world-perms:${worldId}:${Date.now()}`;
    const channel = supabase.channel(name)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'world_page_permissions',
      }, (payload) => {
        const pageId = (payload.new as { page_id?: string })?.page_id
          ?? (payload.old as { page_id?: string })?.page_id;
        const worldPages = usePagesStore.getState().byWorldId[worldId];
        if (pageId && worldPages && !worldPages.some((p) => p.id === pageId)) return;
        getPagesForWorld(worldId).then(({ data }) => {
          if (data) setPages(worldId, data as unknown as WorldPage[]);
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session, worldId, setPages]);

  // AI assistant seed — the assistant is campaign-scoped (the Edge Function
  // authorizes against a campaign), so pick one from the linked list: the
  // active lens campaign when it qualifies, else the first the user DMs, else
  // the first with player access enabled. RLS already trims linkedCampaigns to
  // campaigns the user can see, so a plain world member gets no pill.
  const aiSeed = useMemo<AiChatSeed | null>(() => {
    if (!user || !worldId) return null;
    const ordered = lensCampaignId
      ? [...linkedCampaigns].sort((a, b) =>
          a.id === lensCampaignId ? -1 : b.id === lensCampaignId ? 1 : 0)
      : linkedCampaigns;
    const dmCampaign = ordered.find((c) => c.dm_user_id === user.id);
    const playerCampaign = ordered.find((c) => {
      const ai = (c.ai_settings ?? {}) as { playerAccessEnabled?: boolean };
      return ai.playerAccessEnabled === true;
    });
    const campaign = dmCampaign ?? playerCampaign;
    if (!campaign) return null;
    return {
      userId: user.id,
      role: dmCampaign ? 'dm' : 'player',
      campaignId: campaign.id,
      worldId,
    };
  }, [user, worldId, lensCampaignId, linkedCampaigns]);

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

  const resolvedWorld = storeWorld ?? world;

  return (
    <ActiveSectionProvider initialSectionId={firstSectionId}>
      <View style={isMobile ? styles.rootMobile : styles.root}>
        {!isMobile ? <WorldSidebar world={resolvedWorld} /> : null}
        <View style={styles.content}>
          <PlayerViewBanner />
          <LensSwitchBanner />
          <Slot />
          <AiAssistantHost seed={aiSeed} />
        </View>
        {isMobile ? (
          <MobileWorldTabBar worldId={worldId} world={resolvedWorld} />
        ) : null}
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
  rootMobile: {
    flex: 1,
    flexDirection: 'column',
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
