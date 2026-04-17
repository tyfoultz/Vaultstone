import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getTemplate } from '@vaultstone/content';
import {
  selectSectionsForWorld,
  useCurrentWorldStore,
  usePagesStore,
  useSectionsStore,
} from '@vaultstone/store';
import {
  Card,
  MetaLabel,
  Text,
  VisibilityBadge,
  colors,
  spacing,
} from '@vaultstone/ui';

import { useActiveSection } from '../../../../components/world/ActiveSectionContext';
import { PageHead } from '../../../../components/world/PageHead';
import { StructuredFieldsForm } from '../../../../components/world/StructuredFieldsForm';
import { WorldTopBar } from '../../../../components/world/WorldTopBar';
import { PAGE_KIND_LABEL } from '../../../../components/world/helpers';
import { worldHref } from '../../../../components/world/worldHref';
import type { TemplateKey } from '@vaultstone/types';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export default function PageDetailScreen() {
  const { worldId, pageId } = useLocalSearchParams<{ worldId: string; pageId: string }>();
  const router = useRouter();
  const world = useCurrentWorldStore((s) => s.world);
  const { setActiveSectionId } = useActiveSection();
  const sections = useSectionsStore((s) => selectSectionsForWorld(s, worldId));
  const page = usePagesStore((s) =>
    worldId ? (s.byWorldId[worldId] ?? []).find((p) => p.id === pageId) : undefined,
  );
  const [saveState, setSaveState] = useState<SaveState>('idle');

  const section = useMemo(
    () => sections.find((sec) => sec.id === page?.section_id) ?? null,
    [sections, page],
  );

  useEffect(() => {
    if (section) setActiveSectionId(section.id);
  }, [section, setActiveSectionId]);

  if (!world || !worldId || !pageId) return null;

  if (!page || !section) {
    return (
      <View style={styles.missing}>
        <Text variant="body-md" tone="secondary">
          Page not found.
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

  const template = getTemplate(page.template_key as TemplateKey, page.template_version);
  const kindLabel = PAGE_KIND_LABEL[page.page_kind] ?? 'Page';

  return (
    <View style={styles.root}>
      <WorldTopBar
        crumbs={[
          { key: 'world', label: world.name },
          { key: 'section', label: section.name },
          { key: 'page', label: page.title },
        ]}
        saveState={saveState}
        actions={
          <VisibilityBadge visibility={page.visible_to_players ? 'player' : 'gm'} />
        }
      />

      <ScrollView contentContainerStyle={styles.container}>
        <PageHead
          icon={template.icon}
          title={page.title}
          meta={`${kindLabel} · ${section.name}`}
          accentToken={template.accentToken}
          actions={
            <VisibilityBadge visibility={page.visible_to_players ? 'player' : 'gm'} />
          }
        />

        <View style={{ marginTop: spacing.xl, gap: spacing.lg }}>
          <StructuredFieldsForm
            page={page}
            template={template}
            onSaveStateChange={setSaveState}
          />

          <Card tier="container" padding="lg" style={styles.bodyPlaceholder}>
            <MetaLabel size="sm" tone="muted">
              Body
            </MetaLabel>
            <Text
              variant="body-md"
              family="serif-body"
              tone="secondary"
              style={{
                marginTop: spacing.sm,
                color: colors.onSurfaceVariant,
                fontStyle: 'italic',
              }}
            >
              Rich body editor arrives in Phase 3. For now, facts above are the
              canonical record for this page.
            </Text>
          </Card>
        </View>
      </ScrollView>
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
    maxWidth: 880,
  },
  missing: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceCanvas,
  },
  bodyPlaceholder: {
    borderWidth: 1,
    borderColor: colors.outlineVariant + '33',
    borderStyle: 'dashed',
  },
});
