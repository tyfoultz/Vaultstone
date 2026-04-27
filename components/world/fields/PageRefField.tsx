import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { usePagesStore, useSectionsStore, selectSectionsForWorld } from '@vaultstone/store';

const EMPTY_PAGES: import('@vaultstone/types').WorldPage[] = [];
import type { StructuredField, WorldPage } from '@vaultstone/types';
import { Icon, MetaLabel, Text, colors, radius, spacing } from '@vaultstone/ui';

type Props = {
  field: StructuredField;
  value: unknown;
  onChange: (value: string | null) => void;
  worldId: string;
  compact?: boolean;
};

export function PageRefField({ field, value, onChange, worldId, compact }: Props) {
  const pagesByWorld = usePagesStore((s) => s.byWorldId[worldId] ?? EMPTY_PAGES);
  const sections = useSectionsStore((s) => selectSectionsForWorld(s, worldId));
  const [pickerOpen, setPickerOpen] = useState(false);

  const candidates = useMemo(() => {
    const kinds = field.pageKindFilter;
    if (!kinds || kinds.length === 0) return pagesByWorld;
    return pagesByWorld.filter((p) => kinds.includes(p.page_kind));
  }, [pagesByWorld, field.pageKindFilter]);

  const sectionName = (page: WorldPage) =>
    sections.find((s) => s.id === page.section_id)?.name ?? '';

  const currentId = typeof value === 'string' ? value : null;
  const currentPage = currentId ? candidates.find((p) => p.id === currentId) : null;

  if (compact) {
    return (
      <View style={styles.compactRoot}>
        <MetaLabel size="sm" style={styles.compactLabel}>{field.label}</MetaLabel>
        <Pressable
          onPress={() => setPickerOpen(true)}
          style={styles.compactPill}
        >
          <Text
            variant="body-sm"
            numberOfLines={1}
            style={{ flex: 1, color: currentPage ? colors.onSurface : colors.outline, fontSize: 13 }}
          >
            {currentPage?.title ?? '—'}
          </Text>
          <Icon name="expand-more" size={14} color={colors.outline} />
        </Pressable>

        {pickerOpen ? (
          <Modal transparent visible animationType="fade" onRequestClose={() => setPickerOpen(false)}>
            <Pressable style={styles.pickerBackdrop} onPress={() => setPickerOpen(false)}>
              <Pressable onPress={(e) => e.stopPropagation()} style={styles.pickerWrapper}>
                <View style={styles.pickerMenu}>
                  <MetaLabel size="sm" tone="muted" style={{ paddingHorizontal: spacing.xs, paddingBottom: spacing.xs }}>
                    {field.label}
                  </MetaLabel>
                  {currentId ? (
                    <Pressable
                      onPress={() => { onChange(null); setPickerOpen(false); }}
                      style={styles.pickerClear}
                    >
                      <Icon name="close" size={14} color={colors.outline} />
                      <Text variant="label-sm" style={{ color: colors.outline }}>Clear</Text>
                    </Pressable>
                  ) : null}
                  <ScrollView style={{ maxHeight: 300 }}>
                    {candidates.map((page) => {
                      const selected = currentId === page.id;
                      return (
                        <Pressable
                          key={page.id}
                          onPress={() => { onChange(selected ? null : page.id); setPickerOpen(false); }}
                          style={({ pressed }) => [
                            styles.pickerRow,
                            selected && styles.pickerRowActive,
                            pressed && { backgroundColor: colors.surfaceContainerHigh },
                          ]}
                        >
                          <Icon
                            name={selected ? 'check-circle' : 'radio-button-unchecked'}
                            size={14}
                            color={selected ? colors.primary : colors.outline}
                          />
                          <Text variant="body-sm" numberOfLines={1} style={{ flex: 1, color: colors.onSurface }}>
                            {page.title}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>
              </Pressable>
            </Pressable>
          </Modal>
        ) : null}
      </View>
    );
  }

  // Full inline list (original behavior)
  return (
    <View style={styles.root}>
      <MetaLabel size="sm">{field.label}</MetaLabel>
      {field.helpText ? (
        <Text variant="body-sm" tone="secondary" style={{ color: colors.onSurfaceVariant }}>
          {field.helpText}
        </Text>
      ) : null}
      {candidates.length === 0 ? (
        <Text variant="body-sm" style={{ color: colors.outline }}>
          No candidate pages yet.
        </Text>
      ) : (
        <View style={styles.list}>
          {candidates.map((page) => {
            const selected = currentId === page.id;
            return (
              <Pressable
                key={page.id}
                onPress={() => onChange(selected ? null : page.id)}
                style={[styles.row, selected && styles.rowActive]}
              >
                <Icon
                  name={selected ? 'check-circle' : 'radio-button-unchecked'}
                  size={16}
                  color={selected ? colors.primary : colors.outline}
                />
                <Text variant="body-sm" style={{ flex: 1, color: colors.onSurface }}>
                  {page.title}
                </Text>
                <Text variant="label-md" tone="secondary" style={{ color: colors.outline }}>
                  {sectionName(page)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.xs + 2,
  },
  list: {
    borderWidth: 1,
    borderColor: colors.outlineVariant + '33',
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.sm,
  },
  rowActive: {
    backgroundColor: colors.primaryContainer + '22',
  },
  // Compact mode
  compactRoot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 28,
  },
  compactLabel: {
    width: 80,
    color: colors.outline,
  },
  compactPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '33',
    backgroundColor: colors.surfaceContainerHigh,
  },
  // Picker modal
  pickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(12, 14, 16, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  pickerWrapper: {
    width: '100%',
    maxWidth: 360,
  },
  pickerMenu: {
    backgroundColor: colors.surfaceContainer,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '33',
    padding: spacing.sm,
    gap: 2,
  },
  pickerClear: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    marginBottom: 4,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    borderRadius: radius.lg,
  },
  pickerRowActive: {
    backgroundColor: colors.primaryContainer + '22',
  },
});
