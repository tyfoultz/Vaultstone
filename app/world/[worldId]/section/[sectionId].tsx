import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getTemplate } from '@vaultstone/content';
import {
  filterPagesBySection,
  selectSectionsForWorld,
  useCurrentWorldStore,
  usePagesStore,
  useSectionsStore,
} from '@vaultstone/store';
import type { WorldPage } from '@vaultstone/types';
import {
  GhostButton,
  GradientButton,
  Icon,
  MetaLabel,
  Text,
  colors,
  radius,
  spacing,
} from '@vaultstone/ui';
import { Pressable as RNPressable } from 'react-native';

import { useActiveSection } from '../../../../components/world/ActiveSectionContext';
import { CreatePageModal } from '../../../../components/world/CreatePageModal';
import { PageHead } from '../../../../components/world/PageHead';
import { PlayerViewToggle } from '../../../../components/world/PlayerViewToggle';
import { SectionPageGrid } from '../../../../components/world/SectionPageGrid';
import { SectionPageList } from '../../../../components/world/SectionPageList';
import { SectionSettingsModal } from '../../../../components/world/SectionSettingsModal';
import { WorldTopBar } from '../../../../components/world/WorldTopBar';
import { worldHref, worldPageHref } from '../../../../components/world/worldHref';

export default function SectionDetailScreen() {
  const { worldId, sectionId } = useLocalSearchParams<{ worldId: string; sectionId: string }>();
  const router = useRouter();
  const world = useCurrentWorldStore((s) => s.world);
  const { setActiveSectionId } = useActiveSection();
  const sections = useSectionsStore((s) => selectSectionsForWorld(s, worldId));
  // Subscribe to the stable raw pages array; filter locally via useMemo so
  // we don't return a fresh array from the Zustand selector (React #185).
  const rawPages = usePagesStore((s) => (worldId ? s.byWorldId[worldId] : undefined));
  const pages = useMemo(
    () => (sectionId ? filterPagesBySection(rawPages, sectionId) : []),
    [rawPages, sectionId],
  );
  const [createPageOpen, setCreatePageOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const section = useMemo(
    () => sections.find((sec) => sec.id === sectionId) ?? null,
    [sections, sectionId],
  );

  useEffect(() => {
    if (section) setActiveSectionId(section.id);
  }, [section, setActiveSectionId]);

  if (!world || !worldId || !sectionId) return null;

  if (!section) {
    return (
      <View style={styles.missing}>
        <Text variant="body-md" tone="secondary">
          Section not found.
        </Text>
        <Text
          variant="label-md"
          tone="accent"
          onPress={() => router.replace(worldHref(worldId))}
          style={{ marginTop: spacing.md, textDecorationLine: 'underline' }}
        >
          Back to world
        </Text>
      </View>
    );
  }

  const template = getTemplate(section.template_key);
  const rootPages = pages.filter((p) => !p.parent_page_id);

  const openPage = (page: WorldPage) => router.push(worldPageHref(worldId, page.id));

  return (
    <View style={styles.root}>
      <WorldTopBar
        crumbs={[
          { key: 'world', label: world.name },
          { key: 'section', label: section.name },
        ]}
        actions={
          <>
            <PlayerViewToggle />
            <GhostButton label="Back to Atlas" onPress={() => router.push(worldHref(worldId))} />
            <RNPressable
              onPress={() => setSettingsOpen(true)}
              style={{
                padding: 8,
                borderRadius: radius.full,
                borderWidth: 1,
                borderColor: colors.outlineVariant + '55',
              }}
              accessibilityLabel="Section settings"
            >
              <Icon name="settings" size={16} color={colors.onSurfaceVariant} />
            </RNPressable>
            <GradientButton label="New page" onPress={() => setCreatePageOpen(true)} />
          </>
        }
      />

      <ScrollView contentContainerStyle={styles.container}>
        <PageHead
          icon={template.icon}
          title={section.name}
          meta={`${template.label} · ${rootPages.length} ${rootPages.length === 1 ? 'page' : 'pages'}`}
          accentToken={template.accentToken}
        />

        {template.description ? (
          <Text
            variant="body-md"
            family="serif-body"
            tone="secondary"
            style={{
              marginTop: spacing.md,
              color: colors.onSurfaceVariant,
              fontStyle: 'italic',
              maxWidth: 720,
            }}
          >
            {template.description}
          </Text>
        ) : null}

        <View style={{ marginTop: spacing.xl }}>
          {rootPages.length === 0 ? (
            <View style={styles.empty}>
              <MetaLabel size="sm" tone="muted">
                Empty section
              </MetaLabel>
              <Text
                variant="title-md"
                family="serif-display"
                weight="semibold"
                style={{ marginTop: spacing.xs, textAlign: 'center' }}
              >
                Nothing here yet
              </Text>
              <Text
                variant="body-sm"
                tone="secondary"
                style={{
                  marginTop: spacing.sm,
                  textAlign: 'center',
                  color: colors.onSurfaceVariant,
                  maxWidth: 420,
                }}
              >
                Create the first page to start populating this section of the chronicle.
              </Text>
              <View style={{ marginTop: spacing.lg }}>
                <GradientButton label="Create page" onPress={() => setCreatePageOpen(true)} />
              </View>
            </View>
          ) : section.section_view === 'grid' ? (
            <SectionPageGrid pages={rootPages} template={template} onPagePress={openPage} />
          ) : (
            <SectionPageList pages={rootPages} template={template} onPagePress={openPage} />
          )}
        </View>
      </ScrollView>

      {createPageOpen ? (
        <CreatePageModal
          worldId={worldId}
          sectionId={sectionId}
          onClose={() => setCreatePageOpen(false)}
        />
      ) : null}

      {settingsOpen ? (
        <SectionSettingsModal
          section={section}
          onClose={() => setSettingsOpen(false)}
          onDeleted={() => router.replace(worldHref(worldId))}
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
  missing: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceCanvas,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing['2xl'],
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainerLowest,
  },
});
