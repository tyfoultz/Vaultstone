import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { createPage } from '@vaultstone/api';
import { getLatestVersion, getTemplate } from '@vaultstone/content';
import {
  selectPagesForSection,
  selectSectionsForWorld,
  usePagesStore,
  useSectionsStore,
} from '@vaultstone/store';
import type { PageKind, WorldPage } from '@vaultstone/types';
import {
  Card,
  GhostButton,
  GradientButton,
  Icon,
  Input,
  MetaLabel,
  Text,
  colors,
  radius,
  spacing,
} from '@vaultstone/ui';

import { worldPageHref } from './worldHref';

type Props = {
  worldId: string;
  sectionId: string;
  parentPageId?: string | null;
  onClose: () => void;
  onCreated?: (page: WorldPage) => void;
};

export function CreatePageModal({
  worldId,
  sectionId,
  parentPageId,
  onClose,
  onCreated,
}: Props) {
  const router = useRouter();
  const section = useSectionsStore((s) =>
    selectSectionsForWorld(s, worldId).find((sec) => sec.id === sectionId),
  );
  const nextSortOrder = usePagesStore(
    (s) =>
      (selectPagesForSection(s, worldId, sectionId)
        .filter((p) => (p.parent_page_id ?? null) === (parentPageId ?? null))
        .at(-1)?.sort_order ?? -1) + 1,
  );
  const addPage = usePagesStore((s) => s.addPage);

  const template = useMemo(
    () => (section ? getTemplate(section.template_key) : null),
    [section],
  );

  const [pageKind, setPageKind] = useState<PageKind>(
    template?.defaultPageKind ?? 'custom',
  );
  const [title, setTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!section || !template) return null;

  async function handleSubmit() {
    if (!title.trim()) {
      setError('Page title is required.');
      return;
    }
    if (!template || !section) return;
    setSubmitting(true);
    setError('');
    const { data, error: err } = await createPage({
      worldId,
      sectionId,
      parentPageId: parentPageId ?? null,
      title,
      pageKind,
      templateKey: section.template_key,
      templateVersion: getLatestVersion(section.template_key),
      sortOrder: nextSortOrder,
    });
    setSubmitting(false);
    if (err || !data) {
      setError(err?.message ?? 'Failed to create page.');
      return;
    }
    addPage(data as WorldPage);
    if (onCreated) onCreated(data as WorldPage);
    onClose();
    router.push(worldPageHref(worldId, (data as WorldPage).id));
  }

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()} style={styles.panelWrapper}>
          <Card tier="container" padding="lg" style={styles.panel}>
            <ScrollView>
              <View style={styles.header}>
                <View style={{ flex: 1 }}>
                  <MetaLabel size="sm" tone="accent">
                    New page · {section.name}
                  </MetaLabel>
                  <Text
                    variant="headline-sm"
                    family="serif-display"
                    weight="bold"
                    style={{ marginTop: 4 }}
                  >
                    What are you adding?
                  </Text>
                </View>
                <Pressable onPress={onClose} style={styles.closeBtn}>
                  <Icon name="close" size={22} color={colors.onSurfaceVariant} />
                </Pressable>
              </View>

              <View style={{ marginTop: spacing.lg, gap: spacing.md }}>
                <Input
                  label="Title"
                  placeholder="The Drunken Griffin"
                  value={title}
                  onChangeText={setTitle}
                  autoFocus
                />

                <View>
                  <MetaLabel size="sm">Page kind</MetaLabel>
                  <View style={styles.chipRow}>
                    {template.allowedPageKinds.map((kind) => {
                      const selected = pageKind === kind;
                      return (
                        <Pressable
                          key={kind}
                          onPress={() => setPageKind(kind)}
                          style={[
                            styles.selectChip,
                            selected && styles.selectChipActive,
                          ]}
                        >
                          <Text
                            variant="label-md"
                            weight="semibold"
                            uppercase
                            style={{
                              color: selected
                                ? colors.primary
                                : colors.onSurfaceVariant,
                              letterSpacing: 1,
                            }}
                          >
                            {kind.replace(/_/g, ' ')}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              </View>

              {error ? (
                <Text variant="body-sm" style={{ color: colors.hpDanger, marginTop: spacing.md }}>
                  {error}
                </Text>
              ) : null}

              <View style={styles.footer}>
                <GhostButton label="Cancel" onPress={onClose} />
                <GradientButton
                  label="Create page"
                  onPress={handleSubmit}
                  loading={submitting}
                />
              </View>
            </ScrollView>
          </Card>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(12, 14, 16, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  panelWrapper: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '90%',
  },
  panel: {
    borderWidth: 1,
    borderColor: colors.outlineVariant + '33',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  closeBtn: {
    padding: spacing.xs,
    borderRadius: radius.full,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs + 2,
    marginTop: spacing.sm,
  },
  selectChip: {
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '55',
  },
  selectChipActive: {
    backgroundColor: colors.primaryContainer + '33',
    borderColor: colors.primary + '66',
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'flex-end',
    marginTop: spacing.xl,
  },
});
