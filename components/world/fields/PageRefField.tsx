import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { usePagesStore, useSectionsStore, selectSectionsForWorld } from '@vaultstone/store';

const EMPTY_PAGES: import('@vaultstone/types').WorldPage[] = [];
import type { StructuredField, WorldPage } from '@vaultstone/types';
import { Icon, MetaLabel, Text, colors, radius, spacing } from '@vaultstone/ui';

type Props = {
  field: StructuredField;
  value: unknown;
  onChange: (value: string | null) => void;
  worldId: string;
};

export function PageRefField({ field, value, onChange, worldId }: Props) {
  const pagesByWorld = usePagesStore((s) => s.byWorldId[worldId] ?? EMPTY_PAGES);
  const sections = useSectionsStore((s) => selectSectionsForWorld(s, worldId));

  const candidates = useMemo(() => {
    const kinds = field.pageKindFilter;
    if (!kinds || kinds.length === 0) return pagesByWorld;
    return pagesByWorld.filter((p) => kinds.includes(p.page_kind));
  }, [pagesByWorld, field.pageKindFilter]);

  const sectionName = (page: WorldPage) =>
    sections.find((s) => s.id === page.section_id)?.name ?? '';

  const currentId = typeof value === 'string' ? value : null;

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
});
