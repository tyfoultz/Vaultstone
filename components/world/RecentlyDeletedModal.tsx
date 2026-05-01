import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import {
  getPagesForWorld,
  getSectionsForWorld,
  listDeletedPages,
  listDeletedSections,
  listDeletedMaps,
  restorePage,
  restoreSection,
  restoreMap,
} from '@vaultstone/api';
import { usePagesStore, useSectionsStore } from '@vaultstone/store';
import type { WorldPage, WorldSection } from '@vaultstone/types';
import { GhostButton, Icon, MetaLabel, Text, colors, radius, spacing } from '@vaultstone/ui';

import { PAGE_KIND_LABEL } from './helpers';

type DeletedPage = {
  id: string;
  title: string;
  page_kind: string;
  section_id: string;
  section_name: string;
  deleted_at: string;
  hard_delete_after: string;
};

type DeletedSection = {
  id: string;
  name: string;
  template_key: string;
  deleted_at: string;
  hard_delete_after: string;
};

type DeletedMap = {
  id: string;
  label: string;
  deleted_at: string;
  hard_delete_after: string;
};

type Props = {
  visible: boolean;
  worldId: string;
  onClose: () => void;
};

function daysUntil(isoDate: string): number {
  return Math.max(0, Math.ceil((new Date(isoDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function RecentlyDeletedModal({ visible, worldId, onClose }: Props) {
  const [pages, setPages] = useState<DeletedPage[]>([]);
  const [sections, setSections] = useState<DeletedSection[]>([]);
  const [maps, setMaps] = useState<DeletedMap[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState<string | null>(null);

  const setPagesForWorld = usePagesStore((s) => s.setPagesForWorld);
  const setSectionsForWorld = useSectionsStore((s) => s.setSectionsForWorld);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const [pRes, sRes, mRes] = await Promise.all([
        listDeletedPages(worldId),
        listDeletedSections(worldId),
        listDeletedMaps(worldId),
      ]);
      if (cancelled) return;
      setPages((pRes.data ?? []) as DeletedPage[]);
      setSections((sRes.data ?? []) as DeletedSection[]);
      setMaps((mRes.data ?? []) as DeletedMap[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [visible, worldId]);

  const totalCount = pages.length + sections.length + maps.length;

  async function handleRestorePage(id: string) {
    setRestoring(id);
    const { error } = await restorePage(id);
    if (!error) {
      setPages((prev) => prev.filter((p) => p.id !== id));
      const { data } = await getPagesForWorld(worldId);
      if (data) setPagesForWorld(worldId, data as WorldPage[]);
    }
    setRestoring(null);
  }

  async function handleRestoreSection(id: string) {
    setRestoring(id);
    const { error } = await restoreSection(id);
    if (!error) {
      setSections((prev) => prev.filter((s) => s.id !== id));
      const { data } = await getSectionsForWorld(worldId);
      if (data) setSectionsForWorld(worldId, data as WorldSection[]);
    }
    setRestoring(null);
  }

  async function handleRestoreMap(id: string) {
    setRestoring(id);
    const { error } = await restoreMap(id);
    if (!error) {
      setMaps((prev) => prev.filter((m) => m.id !== id));
    }
    setRestoring(null);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.card}>
          <View style={styles.header}>
            <Icon name="delete-outline" size={18} color={colors.hpDanger} />
            <Text variant="title-md" family="serif-display" weight="bold" style={{ flex: 1 }}>
              Recently Deleted
            </Text>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <Icon name="close" size={18} color={colors.onSurfaceVariant} />
            </Pressable>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: spacing.lg }}>
            {loading ? (
              <Text variant="body-sm" style={{ color: colors.outline, padding: spacing.md }}>
                Loading…
              </Text>
            ) : totalCount === 0 ? (
              <View style={styles.empty}>
                <Icon name="check-circle-outline" size={32} color={colors.outline} />
                <Text variant="body-sm" style={{ color: colors.outline, marginTop: spacing.sm }}>
                  Nothing in the trash.
                </Text>
              </View>
            ) : (
              <>
                {sections.length > 0 ? (
                  <View style={styles.group}>
                    <MetaLabel size="sm" tone="muted">Sections ({sections.length})</MetaLabel>
                    {sections.map((s) => (
                      <View key={s.id} style={styles.row}>
                        <Icon name="folder-outline" size={16} color={colors.outline} />
                        <View style={{ flex: 1 }}>
                          <Text variant="body-sm" numberOfLines={1}>{s.name}</Text>
                          <Text variant="label-sm" style={{ color: colors.outline }}>
                            Deleted {formatDate(s.deleted_at)} · {daysUntil(s.hard_delete_after)}d left
                          </Text>
                        </View>
                        <GhostButton
                          label={restoring === s.id ? '…' : 'Restore'}
                          onPress={() => handleRestoreSection(s.id)}
                          disabled={restoring !== null}
                        />
                      </View>
                    ))}
                  </View>
                ) : null}

                {pages.length > 0 ? (
                  <View style={styles.group}>
                    <MetaLabel size="sm" tone="muted">Pages ({pages.length})</MetaLabel>
                    {pages.map((p) => (
                      <View key={p.id} style={styles.row}>
                        <Icon name="description" size={16} color={colors.outline} />
                        <View style={{ flex: 1 }}>
                          <Text variant="body-sm" numberOfLines={1}>{p.title}</Text>
                          <Text variant="label-sm" style={{ color: colors.outline }}>
                            {(PAGE_KIND_LABEL as Record<string, string>)[p.page_kind] ?? p.page_kind} · {p.section_name} · {daysUntil(p.hard_delete_after)}d left
                          </Text>
                        </View>
                        <GhostButton
                          label={restoring === p.id ? '…' : 'Restore'}
                          onPress={() => handleRestorePage(p.id)}
                          disabled={restoring !== null}
                        />
                      </View>
                    ))}
                  </View>
                ) : null}

                {maps.length > 0 ? (
                  <View style={styles.group}>
                    <MetaLabel size="sm" tone="muted">Maps ({maps.length})</MetaLabel>
                    {maps.map((m) => (
                      <View key={m.id} style={styles.row}>
                        <Icon name="map" size={16} color={colors.outline} />
                        <View style={{ flex: 1 }}>
                          <Text variant="body-sm" numberOfLines={1}>{m.label}</Text>
                          <Text variant="label-sm" style={{ color: colors.outline }}>
                            Deleted {formatDate(m.deleted_at)} · {daysUntil(m.hard_delete_after)}d left
                          </Text>
                        </View>
                        <GhostButton
                          label={restoring === m.id ? '…' : 'Restore'}
                          onPress={() => handleRestoreMap(m.id)}
                          disabled={restoring !== null}
                        />
                      </View>
                    ))}
                  </View>
                ) : null}
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: '90%',
    maxWidth: 520,
    maxHeight: '80%',
    backgroundColor: colors.surfaceContainer,
    borderRadius: radius.xl,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant + '22',
  },
  closeBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
  },
  body: {
    paddingHorizontal: spacing.lg,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: spacing.xl * 2,
  },
  group: {
    marginTop: spacing.md,
    gap: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.outlineVariant + '22',
  },
});
