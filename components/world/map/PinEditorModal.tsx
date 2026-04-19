import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { MapPin, PinType } from '@vaultstone/api';
import type { WorldPage } from '@vaultstone/types';
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

import { toMaterialIcon } from '../helpers';

export type PinEditorInitial = {
  id?: string;
  pin_type: string;
  x_pct: number;
  y_pct: number;
  label: string | null;
  linked_page_id: string | null;
  icon_key_override?: string | null;
  color_override?: string | null;
};

type Props = {
  initial: PinEditorInitial;
  pinTypes: PinType[];
  pages: WorldPage[];
  onClose: () => void;
  onSave: (patch: {
    pin_type: string;
    label: string | null;
    linked_page_id: string | null;
  }) => Promise<void>;
  onDelete?: () => Promise<void>;
  onNavigateToLinkedPage?: (pageId: string) => void;
};

// One modal handles both "new" (no id) and "edit" (id present) paths. The
// route owns persistence so this stays dumb about mapId/worldId plumbing.
export function PinEditorModal({
  initial,
  pinTypes,
  pages,
  onClose,
  onSave,
  onDelete,
  onNavigateToLinkedPage,
}: Props) {
  const [pinType, setPinType] = useState<string>(initial.pin_type);
  const [label, setLabel] = useState(initial.label ?? '');
  const [linkedPageId, setLinkedPageId] = useState<string | null>(initial.linked_page_id ?? null);
  const [pageFilter, setPageFilter] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const sortedTypes = useMemo(
    () => [...pinTypes].sort((a, b) => a.sort_order - b.sort_order),
    [pinTypes],
  );

  const pagesByKey = useMemo(() => {
    const map = new Map<string, WorldPage>();
    for (const p of pages) map.set(p.id, p);
    return map;
  }, [pages]);

  const linkedPage = linkedPageId ? pagesByKey.get(linkedPageId) ?? null : null;

  const filteredPages = useMemo(() => {
    const q = pageFilter.trim().toLowerCase();
    if (!q) return pages.slice(0, 8);
    return pages.filter((p) => p.title.toLowerCase().includes(q)).slice(0, 8);
  }, [pages, pageFilter]);

  async function handleSave() {
    setSubmitting(true);
    setError('');
    try {
      await onSave({
        pin_type: pinType,
        label: label.trim() || null,
        linked_page_id: linkedPageId,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save pin.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!onDelete) return;
    setSubmitting(true);
    setError('');
    try {
      await onDelete();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete pin.');
    } finally {
      setSubmitting(false);
    }
  }

  const isNew = !initial.id;

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()} style={styles.panelWrapper}>
          <Card tier="container" padding="lg" style={styles.panel}>
            <ScrollView>
              <View style={styles.header}>
                <View style={{ flex: 1 }}>
                  <MetaLabel size="sm" tone="accent">
                    {isNew ? 'New pin' : 'Edit pin'}
                  </MetaLabel>
                  <Text
                    variant="headline-sm"
                    family="serif-display"
                    weight="bold"
                    style={{ marginTop: 4 }}
                  >
                    {isNew ? 'Drop a pin' : (initial.label ?? 'Pin')}
                  </Text>
                </View>
                <Pressable onPress={onClose} style={styles.closeBtn}>
                  <Icon name="close" size={22} color={colors.onSurfaceVariant} />
                </Pressable>
              </View>

              <View style={{ marginTop: spacing.lg, gap: spacing.md }}>
                <View>
                  <MetaLabel size="sm">Pin type</MetaLabel>
                  <View style={styles.chipRow}>
                    {sortedTypes.map((type) => {
                      const selected = pinType === type.key;
                      return (
                        <Pressable
                          key={type.key}
                          onPress={() => setPinType(type.key)}
                          style={[
                            styles.typeChip,
                            selected && styles.typeChipActive,
                            selected && { borderColor: type.default_color_hex + '99' },
                          ]}
                        >
                          <Icon
                            name={toMaterialIcon(type.default_icon_key) as React.ComponentProps<typeof Icon>['name']}
                            size={14}
                            color={selected ? type.default_color_hex : colors.onSurfaceVariant}
                          />
                          <Text
                            variant="label-sm"
                            weight="semibold"
                            style={{
                              color: selected ? colors.onSurface : colors.onSurfaceVariant,
                              marginLeft: 6,
                            }}
                          >
                            {type.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                <Input
                  label="Label (optional)"
                  placeholder="Silvermoor, Captain Yorrik's camp…"
                  value={label}
                  onChangeText={setLabel}
                />

                <View>
                  <MetaLabel size="sm">Linked page</MetaLabel>
                  {linkedPage ? (
                    <View style={styles.linkedRow}>
                      <View style={styles.linkedInfo}>
                        <Icon name="article" size={16} color={colors.primary} />
                        <Text variant="body-md" style={{ marginLeft: spacing.xs, flex: 1 }}>
                          {linkedPage.title}
                        </Text>
                      </View>
                      <View style={{ flexDirection: 'row', gap: spacing.xs }}>
                        {onNavigateToLinkedPage ? (
                          <GhostButton
                            label="Open"
                            onPress={() => onNavigateToLinkedPage(linkedPage.id)}
                          />
                        ) : null}
                        <GhostButton
                          label="Unlink"
                          onPress={() => setLinkedPageId(null)}
                        />
                      </View>
                    </View>
                  ) : (
                    <>
                      <Input
                        placeholder="Search pages…"
                        value={pageFilter}
                        onChangeText={setPageFilter}
                      />
                      <View style={styles.pageList}>
                        {filteredPages.length === 0 ? (
                          <Text variant="body-sm" tone="secondary" style={{ padding: spacing.sm }}>
                            No pages match.
                          </Text>
                        ) : (
                          filteredPages.map((p) => (
                            <Pressable
                              key={p.id}
                              onPress={() => {
                                setLinkedPageId(p.id);
                                setPageFilter('');
                              }}
                              style={styles.pageItem}
                            >
                              <Icon name="article" size={14} color={colors.onSurfaceVariant} />
                              <Text
                                variant="body-sm"
                                style={{ marginLeft: spacing.xs, flex: 1 }}
                                numberOfLines={1}
                              >
                                {p.title}
                              </Text>
                            </Pressable>
                          ))
                        )}
                      </View>
                    </>
                  )}
                </View>
              </View>

              {error ? (
                <Text variant="body-sm" style={{ color: colors.hpDanger, marginTop: spacing.md }}>
                  {error}
                </Text>
              ) : null}

              <View style={styles.footer}>
                {!isNew && onDelete ? (
                  <GhostButton label="Delete" onPress={handleDelete} />
                ) : null}
                <View style={{ flex: 1 }} />
                <GhostButton label="Cancel" onPress={onClose} />
                <GradientButton
                  label={isNew ? 'Create pin' : 'Save'}
                  onPress={handleSave}
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
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '55',
  },
  typeChipActive: {
    backgroundColor: colors.primaryContainer + '33',
  },
  linkedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
    padding: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '33',
    backgroundColor: colors.surfaceContainerLowest,
    gap: spacing.sm,
  },
  linkedInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  pageList: {
    marginTop: spacing.xs,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '33',
    backgroundColor: colors.surfaceContainerLowest,
    overflow: 'hidden',
  },
  pageItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.outlineVariant + '22',
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
    marginTop: spacing.xl,
  },
});
