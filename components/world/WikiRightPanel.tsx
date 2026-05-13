import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { getTemplate } from '@vaultstone/content';
import { usePagesStore, useSectionsStore } from '@vaultstone/store';
import { Icon, MetaLabel, Text, colors, radius, spacing } from '@vaultstone/ui';
import type { TemplateKey, WorldPage } from '@vaultstone/types';

import { PAGE_KIND_LABEL, toMaterialIcon } from './helpers';
import { worldPageHref } from './worldHref';

type Props = {
  pageId: string;
  worldId: string;
  defaultCollapsed?: boolean;
};

export function WikiRightPanel({ pageId, worldId, defaultCollapsed }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [forceCollapsed, setForceCollapsed] = useState(!!defaultCollapsed);
  const allPages = usePagesStore((s) => s.byWorldId[worldId]);
  const sections = useSectionsStore((s) => s.byWorldId[worldId]);

  const subpages = useMemo(
    () =>
      (allPages ?? [])
        .filter((p) => p.parent_page_id === pageId)
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order),
    [allPages, pageId],
  );

  const isEmpty = subpages.length === 0;

  useEffect(() => {
    setExpanded(false);
    setForceCollapsed(!!defaultCollapsed);
  }, [pageId, defaultCollapsed]);

  const sectionName = (id: string) => sections?.find((s) => s.id === id)?.name ?? '';

  if ((isEmpty && !expanded) || forceCollapsed) {
    return (
      <View style={styles.collapsedRoot}>
        <Pressable
          onPress={() => { setExpanded(true); setForceCollapsed(false); }}
          style={styles.expandPill}
          accessibilityLabel="Show right panel"
        >
          <Icon name="chevron-left" size={14} color={colors.onSurfaceVariant} />
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <MetaLabel size="sm" tone="muted">
          Sub-pages
        </MetaLabel>
        <Pressable
          onPress={() => { setExpanded(false); setForceCollapsed(true); }}
          style={styles.collapseBtn}
          accessibilityLabel="Collapse panel"
        >
          <Icon name="chevron-right" size={14} color={colors.outline} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {subpages.length === 0 ? (
          <Text variant="body-sm" tone="secondary" style={styles.empty}>
            No sub-pages yet.
          </Text>
        ) : (
          subpages.map((p) => (
            <SubpageRow key={p.id} page={p} worldId={worldId} sectionName={sectionName(p.section_id)} />
          ))
        )}
      </ScrollView>
    </View>
  );
}

function SubpageRow({
  page,
  worldId,
  sectionName,
}: {
  page: WorldPage;
  worldId: string;
  sectionName: string;
}) {
  const router = useRouter();
  let iconName = 'article';
  try {
    const tpl = getTemplate(page.template_key as TemplateKey, page.template_version);
    iconName = toMaterialIcon(tpl.icon);
  } catch {
    // fall through with default icon
  }
  const tone = page.visible_to_players ? 'player' : 'gm';
  const iconColor = tone === 'player' ? colors.player : colors.gm;
  return (
    <Pressable
      onPress={() => router.push(worldPageHref(worldId, page.id))}
      style={styles.subpage}
    >
      <Icon
        name={iconName as React.ComponentProps<typeof Icon>['name']}
        size={14}
        color={iconColor}
      />
      <Text variant="body-sm" numberOfLines={1} style={styles.subpageTitle}>
        {page.title}
      </Text>
      {sectionName ? (
        <Text variant="label-sm" tone="secondary" style={styles.subpageMeta} numberOfLines={1}>
          {sectionName}
        </Text>
      ) : null}
      <Icon name="chevron-right" size={12} color={colors.outline} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    width: 280,
    backgroundColor: colors.surfaceContainer,
    borderLeftWidth: 1,
    borderLeftColor: colors.outlineVariant + '55',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  collapsedRoot: {
    width: 32,
    backgroundColor: colors.surfaceContainer,
    borderLeftWidth: 1,
    borderLeftColor: colors.outlineVariant + '55',
    alignItems: 'center',
    paddingTop: spacing.md,
  },
  expandPill: {
    width: 28,
    height: 28,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.outlineVariant + '44',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant + '55',
  },
  collapseBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    padding: spacing.md,
    gap: 6,
  },
  empty: {
    color: colors.onSurfaceVariant,
    fontStyle: 'italic',
    paddingVertical: spacing.sm,
  },
  subpage: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: spacing.sm + 4,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '55',
    borderRadius: radius.lg,
    marginBottom: 6,
  },
  subpageTitle: {
    flex: 1,
    color: colors.onSurface,
    fontSize: 13,
  },
  subpageMeta: {
    color: colors.outline,
    fontSize: 10,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
});
