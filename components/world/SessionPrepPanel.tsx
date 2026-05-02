import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { WorldPage } from '@vaultstone/types';
import { updatePage } from '@vaultstone/api';
import { usePagesStore } from '@vaultstone/store';
import { GhostButton, Icon, MetaLabel, Text, colors, radius, spacing } from '@vaultstone/ui';

import { PAGE_KIND_LABEL } from './helpers';

type Props = {
  prepPage: WorldPage;
  allPages: WorldPage[];
  onOpenPage: (pageId: string) => void;
  onAddPage?: () => void;
};

export function SessionPrepPanel({ prepPage, allPages, onOpenPage, onAddPage }: Props) {
  const updatePageInStore = usePagesStore((s) => s.updatePage);

  const pinnedIds: string[] = useMemo(() => {
    const fields = (prepPage.structured_fields as Record<string, unknown>) ?? {};
    return Array.isArray(fields.__pinned_pages) ? (fields.__pinned_pages as string[]) : [];
  }, [prepPage.structured_fields]);

  const pinnedPages = useMemo(() => {
    const pageMap = new Map(allPages.map((p) => [p.id, p]));
    return pinnedIds.map((id) => pageMap.get(id)).filter((p): p is WorldPage => !!p);
  }, [pinnedIds, allPages]);

  async function handleUnpin(pageId: string) {
    const newPinned = pinnedIds.filter((id) => id !== pageId);
    const fields = { ...((prepPage.structured_fields as Record<string, unknown>) ?? {}), __pinned_pages: newPinned };
    await updatePage(prepPage.id, { structured_fields: fields as any });
    updatePageInStore(prepPage.id, { structured_fields: fields as any });
  }

  async function handleClear() {
    const fields = { ...((prepPage.structured_fields as Record<string, unknown>) ?? {}), __pinned_pages: [] };
    await updatePage(prepPage.id, { structured_fields: fields as any });
    updatePageInStore(prepPage.id, { structured_fields: fields as any });
  }

  if (pinnedPages.length === 0) return null;

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Icon name="push-pin" size={14} color={colors.gm} />
        <Text variant="label-sm" weight="semibold" uppercase style={{ color: colors.gm, letterSpacing: 1.2, flex: 1 }}>
          Session Prep
        </Text>
        <Pressable onPress={handleClear} style={styles.clearBtn}>
          <Text variant="label-sm" style={{ color: colors.outline }}>Clear</Text>
        </Pressable>
      </View>

      <View style={styles.grid}>
        {pinnedPages.map((page) => {
          const kindLabel = (PAGE_KIND_LABEL as Record<string, string>)[page.page_kind] ?? page.page_kind;
          return (
            <Pressable key={page.id} onPress={() => onOpenPage(page.id)} style={styles.card}>
              <View style={styles.cardHeader}>
                <Icon name="description" size={14} color={colors.primary} />
                <Text variant="body-sm" weight="semibold" numberOfLines={1} style={{ flex: 1 }}>
                  {page.title}
                </Text>
                <Pressable
                  onPress={(e) => { e.stopPropagation?.(); void handleUnpin(page.id); }}
                  hitSlop={8}
                >
                  <Icon name="close" size={12} color={colors.outline} />
                </Pressable>
              </View>
              <Text variant="label-sm" style={{ color: colors.outline, marginTop: 2 }}>{kindLabel}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export async function pinPageToPrep(prepPage: WorldPage, pageId: string): Promise<WorldPage['structured_fields']> {
  const fields = { ...((prepPage.structured_fields as Record<string, unknown>) ?? {}) };
  const current: string[] = Array.isArray(fields.__pinned_pages) ? (fields.__pinned_pages as string[]) : [];
  if (current.includes(pageId)) return fields as any;
  fields.__pinned_pages = [...current, pageId];
  await updatePage(prepPage.id, { structured_fields: fields as any });
  return fields as any;
}

const styles = StyleSheet.create({
  root: {
    marginTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant + '22',
    paddingTop: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  clearBtn: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  card: {
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: radius.lg,
    padding: spacing.sm,
    minWidth: 140,
    maxWidth: 200,
    flex: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
});
