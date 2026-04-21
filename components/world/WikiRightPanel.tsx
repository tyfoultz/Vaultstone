import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { getPagesLinkingTo } from '@vaultstone/api';
import { getTemplate } from '@vaultstone/content';
import { usePagesStore, useSectionsStore } from '@vaultstone/store';
import { Icon, MetaLabel, Text, colors, radius, spacing } from '@vaultstone/ui';
import type { TemplateKey, WorldPage } from '@vaultstone/types';

import { PAGE_KIND_LABEL, toMaterialIcon } from './helpers';
import { worldPageHref } from './worldHref';

type Props = {
  pageId: string;
  worldId: string;
};

type Tab = 'subpages' | 'backlinks' | 'history';

export function WikiRightPanel({ pageId, worldId }: Props) {
  const [tab, setTab] = useState<Tab>('subpages');
  const [expanded, setExpanded] = useState(false);
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

  const [backlinks, setBacklinks] = useState<WorldPage[]>([]);
  const [backlinksLoaded, setBacklinksLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setBacklinksLoaded(false);
    void (async () => {
      const { data } = await getPagesLinkingTo(worldId, pageId);
      if (cancelled) return;
      setBacklinks(data ?? []);
      setBacklinksLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [pageId, worldId]);

  const isEmpty = subpages.length === 0 && backlinksLoaded && backlinks.length === 0;

  useEffect(() => {
    setExpanded(false);
  }, [pageId]);

  const sectionName = (id: string) => sections?.find((s) => s.id === id)?.name ?? '';

  if (isEmpty && !expanded) {
    return (
      <View style={styles.collapsedRoot}>
        <Pressable
          onPress={() => setExpanded(true)}
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
      <View style={styles.tabs}>
        <TabButton label="Sub-pages" active={tab === 'subpages'} onPress={() => setTab('subpages')} />
        <TabButton
          label="Backlinks"
          active={tab === 'backlinks'}
          onPress={() => setTab('backlinks')}
        />
        <TabButton label="History" active={tab === 'history'} onPress={() => setTab('history')} />
        {isEmpty ? (
          <Pressable
            onPress={() => setExpanded(false)}
            style={styles.collapseBtn}
            accessibilityLabel="Collapse panel"
          >
            <Icon name="chevron-right" size={14} color={colors.outline} />
          </Pressable>
        ) : null}
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {tab === 'subpages' ? (
          <>
            {subpages.length === 0 ? (
              <Text variant="body-sm" tone="secondary" style={styles.empty}>
                No sub-pages yet.
              </Text>
            ) : (
              subpages.map((p) => (
                <SubpageRow key={p.id} page={p} worldId={worldId} sectionName={sectionName(p.section_id)} />
              ))
            )}

            {backlinksLoaded && backlinks.length > 0 ? (
              <View style={styles.backlinksSection}>
                <MetaLabel size="sm" tone="muted" style={styles.sectionLabel}>
                  Linked from
                </MetaLabel>
                {backlinks.slice(0, 5).map((p) => (
                  <BacklinkRow key={p.id} page={p} worldId={worldId} />
                ))}
              </View>
            ) : null}
          </>
        ) : null}

        {tab === 'backlinks' ? (
          backlinksLoaded && backlinks.length > 0 ? (
            <>
              <MetaLabel size="sm" tone="muted" style={styles.sectionLabel}>
                {backlinks.length === 1
                  ? '1 page references this page'
                  : `${backlinks.length} pages reference this page`}
              </MetaLabel>
              {backlinks.map((p) => (
                <BacklinkRow key={p.id} page={p} worldId={worldId} />
              ))}
            </>
          ) : (
            <Text variant="body-sm" tone="secondary" style={styles.empty}>
              No backlinks yet.
            </Text>
          )
        ) : null}

        {tab === 'history' ? (
          <Text variant="body-sm" tone="secondary" style={styles.empty}>
            Revision history is coming soon.
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

function TabButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.tab, active && styles.tabActive]}>
      <Text
        variant="label-sm"
        uppercase
        weight="semibold"
        style={[styles.tabLabel, active && styles.tabLabelActive]}
      >
        {label}
      </Text>
    </Pressable>
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

function BacklinkRow({ page, worldId }: { page: WorldPage; worldId: string }) {
  const router = useRouter();
  const kindLabel = PAGE_KIND_LABEL[page.page_kind] ?? 'Page';
  return (
    <Pressable
      onPress={() => router.push(worldPageHref(worldId, page.id))}
      style={styles.backlink}
    >
      <Text variant="label-md" weight="semibold" style={styles.backlinkTitle} numberOfLines={1}>
        {page.title}
      </Text>
      <Text variant="label-sm" uppercase style={styles.backlinkType} numberOfLines={1}>
        {kindLabel}
      </Text>
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
  collapseBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant + '55',
    paddingHorizontal: spacing.sm,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: 4,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: colors.primary,
  },
  tabLabel: {
    color: colors.outline,
    fontSize: 11,
    letterSpacing: 1.2,
  },
  tabLabelActive: {
    color: colors.onSurface,
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
  sectionLabel: {
    marginBottom: 10,
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
  backlinksSection: {
    marginTop: spacing.lg,
  },
  backlink: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: radius.lg,
    borderLeftWidth: 2,
    borderLeftColor: colors.primary,
    backgroundColor: colors.surfaceContainerHigh,
    marginBottom: 6,
  },
  backlinkTitle: {
    color: colors.onSurface,
    marginBottom: 2,
    fontSize: 12,
  },
  backlinkType: {
    color: colors.outline,
    fontSize: 10,
    letterSpacing: 0.8,
  },
});
