import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { updatePage } from '@vaultstone/api';
import { getTemplate } from '@vaultstone/content';
import {
  selectSectionsForWorld,
  useCurrentWorldStore,
  usePagesStore,
  useSectionsStore,
} from '@vaultstone/store';
import {
  MetaLabel,
  Text,
  VisibilityBadge,
  colors,
  spacing,
} from '@vaultstone/ui';

import { useActiveSection } from '../../../../components/world/ActiveSectionContext';
import { BacklinksPanel } from '../../../../components/world/BacklinksPanel';
import { BodyEditor } from '../../../../components/world/BodyEditor';
import { PageHead } from '../../../../components/world/PageHead';
import { StructuredFieldsForm } from '../../../../components/world/StructuredFieldsForm';
import { WorldTopBar } from '../../../../components/world/WorldTopBar';
import { PAGE_KIND_LABEL } from '../../../../components/world/helpers';
import { worldHref } from '../../../../components/world/worldHref';
import type { Json, TemplateKey, WorldPage } from '@vaultstone/types';

const EMPTY_PAGES: WorldPage[] = [];

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export default function PageDetailScreen() {
  const { worldId, pageId } = useLocalSearchParams<{ worldId: string; pageId: string }>();
  const router = useRouter();
  const world = useCurrentWorldStore((s) => s.world);
  const { setActiveSectionId } = useActiveSection();
  const sections = useSectionsStore((s) => selectSectionsForWorld(s, worldId));
  const allPages = usePagesStore((s) => (worldId ? s.byWorldId[worldId] : undefined));
  const page = useMemo(
    () => (allPages ?? []).find((p) => p.id === pageId),
    [allPages, pageId],
  );
  const mentionablePages = useMemo(
    () => (allPages ?? EMPTY_PAGES).filter((p) => p.id !== pageId),
    [allPages, pageId],
  );
  const sectionLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of sections) map.set(s.id, s.name);
    return (id: string) => map.get(id) ?? '';
  }, [sections]);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const updatePageInStore = usePagesStore((s) => s.updatePage);
  const bodyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingBodyRef = useRef<{
    body: object;
    bodyText: string;
    bodyRefs: string[];
  } | null>(null);

  const section = useMemo(
    () => sections.find((sec) => sec.id === page?.section_id) ?? null,
    [sections, page],
  );

  useEffect(() => {
    if (section) setActiveSectionId(section.id);
  }, [section, setActiveSectionId]);

  useEffect(() => {
    // Flush any pending body write when the page/route changes.
    return () => {
      if (bodyTimerRef.current) {
        clearTimeout(bodyTimerRef.current);
        bodyTimerRef.current = null;
      }
    };
  }, [pageId]);

  function handleBodyChange(body: object, bodyText: string, bodyRefs: string[]) {
    if (!pageId) return;
    pendingBodyRef.current = { body, bodyText, bodyRefs };
    setSaveState('saving');
    if (bodyTimerRef.current) clearTimeout(bodyTimerRef.current);
    bodyTimerRef.current = setTimeout(async () => {
      const pending = pendingBodyRef.current;
      if (!pending) return;
      pendingBodyRef.current = null;
      const { data, error } = await updatePage(pageId, {
        body: pending.body as Json,
        body_text: pending.bodyText,
        body_refs: pending.bodyRefs,
      });
      if (error || !data) {
        setSaveState('error');
        return;
      }
      updatePageInStore(pageId, {
        body: data.body,
        body_text: data.body_text,
        body_refs: data.body_refs,
      });
      setSaveState('saved');
    }, 800);
  }

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

          <View style={styles.bodySection}>
            <MetaLabel size="sm" tone="muted" style={{ marginBottom: spacing.xs }}>
              Body
            </MetaLabel>
            <BodyEditor
              initialContent={(page.body as object) ?? null}
              onChange={handleBodyChange}
              placeholder={`Begin the chronicle of ${page.title}…`}
              mentionablePages={mentionablePages}
              getSectionLabel={sectionLabelById}
            />
          </View>

          <BacklinksPanel pageId={page.id} worldId={worldId} />
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
  bodySection: {
    gap: spacing.xs,
  },
});
