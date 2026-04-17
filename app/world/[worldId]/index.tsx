import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getCampaignsForWorld } from '@vaultstone/api';
import { getTemplate } from '@vaultstone/content';
import {
  selectSectionsForWorld,
  useCurrentWorldStore,
  usePagesStore,
  useSectionsStore,
} from '@vaultstone/store';
import { Chip, GhostButton, GradientButton, MetaLabel, Text, colors, spacing } from '@vaultstone/ui';
import type { Database, WorldSection } from '@vaultstone/types';

import { useActiveSection } from '../../../components/world/ActiveSectionContext';
import { CreatePageModal } from '../../../components/world/CreatePageModal';
import { CreateSectionModal } from '../../../components/world/CreateSectionModal';
import { PageHead } from '../../../components/world/PageHead';
import {
  WorldSectionAddCard,
  WorldSectionCard,
} from '../../../components/world/WorldSectionCard';
import { WorldTopBar } from '../../../components/world/WorldTopBar';
import { worldSectionHref } from '../../../components/world/worldHref';

type Campaign = Database['public']['Tables']['campaigns']['Row'];

// CSS grid lives inline; see note in SectionPageGrid.tsx.
const ATLAS_GRID_STYLE = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
  gap: spacing.md,
} as const;

export default function WorldLandingScreen() {
  const { worldId } = useLocalSearchParams<{ worldId: string }>();
  const router = useRouter();
  const world = useCurrentWorldStore((s) => s.world);
  const sections = useSectionsStore((s) => selectSectionsForWorld(s, worldId));
  const pagesByWorld = usePagesStore((s) => (worldId ? s.byWorldId[worldId] : undefined));
  const { setActiveSectionId } = useActiveSection();
  const [linkedCampaigns, setLinkedCampaigns] = useState<Campaign[]>([]);
  const [createSectionOpen, setCreateSectionOpen] = useState(false);
  const [createPageSectionId, setCreatePageSectionId] = useState<string | null>(null);

  useEffect(() => {
    if (!worldId) return;
    getCampaignsForWorld(worldId).then(({ data }) => {
      const rows = (data ?? []) as unknown as Array<{ campaigns: Campaign | null }>;
      setLinkedCampaigns(rows.map((r) => r.campaigns).filter((c): c is Campaign => !!c));
    });
  }, [worldId]);

  const pageCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    const pages = pagesByWorld ?? [];
    for (const p of pages) {
      counts[p.section_id] = (counts[p.section_id] ?? 0) + 1;
    }
    return counts;
  }, [pagesByWorld]);

  if (!world || !worldId) return null;

  const handleSectionPress = (section: WorldSection) => {
    setActiveSectionId(section.id);
    router.push(worldSectionHref(worldId, section.id));
  };

  return (
    <View style={styles.root}>
      <WorldTopBar
        crumbs={[
          { key: 'chronicle', label: 'Chronicle' },
          { key: 'world', label: world.name },
        ]}
        actions={
          <>
            <GhostButton label="New page" onPress={() => setCreatePageSectionId(sections[0]?.id ?? null)} />
            <GradientButton label="New section" onPress={() => setCreateSectionOpen(true)} />
          </>
        }
      />

      <ScrollView contentContainerStyle={styles.container}>
        <PageHead
          icon="globe"
          title={world.name}
          meta="Chronicle"
          accentToken="primary"
        />

        {world.description ? (
          <Text
            variant="body-lg"
            family="serif-body"
            tone="secondary"
            style={{
              marginTop: spacing.md,
              color: colors.onSurfaceVariant,
              maxWidth: 720,
              fontStyle: 'italic',
            }}
          >
            {world.description}
          </Text>
        ) : null}

        {linkedCampaigns.length > 0 ? (
          <View style={{ marginTop: spacing.xl, gap: spacing.sm }}>
            <MetaLabel size="sm" tone="muted">
              Linked campaigns
            </MetaLabel>
            <View style={styles.chipRow}>
              {linkedCampaigns.map((c) => (
                <Chip key={c.id} label={c.name} variant="category" />
              ))}
            </View>
          </View>
        ) : null}

        <View style={{ marginTop: spacing.xl + spacing.sm, gap: spacing.md }}>
          <MetaLabel size="sm" tone="accent">
            The Atlas
          </MetaLabel>
          <Text
            variant="headline-sm"
            family="serif-display"
            weight="bold"
            style={{ color: colors.onSurface }}
          >
            Sections in this world
          </Text>
          <View style={ATLAS_GRID_STYLE as object}>
            {sections.map((section) => {
              const template = getTemplate(section.template_key);
              return (
                <WorldSectionCard
                  key={section.id}
                  section={section}
                  template={template}
                  pageCount={pageCounts[section.id] ?? 0}
                  onPress={() => handleSectionPress(section)}
                />
              );
            })}
            <WorldSectionAddCard onPress={() => setCreateSectionOpen(true)} />
          </View>
        </View>
      </ScrollView>

      {createSectionOpen ? (
        <CreateSectionModal worldId={worldId} onClose={() => setCreateSectionOpen(false)} />
      ) : null}

      {createPageSectionId ? (
        <CreatePageModal
          worldId={worldId}
          sectionId={createPageSectionId}
          onClose={() => setCreatePageSectionId(null)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surfaceCanvas,
  },
  container: {
    padding: spacing.xl,
    paddingBottom: spacing['2xl'],
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs + 2,
  },
});
