import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { updatePage } from '@vaultstone/api';
import { usePagesStore } from '@vaultstone/store';
import type { Json, SectionTemplate, WorldPage } from '@vaultstone/types';
import { MetaLabel, colors, spacing } from '@vaultstone/ui';

import { FieldRenderer } from './fields';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

type Props = {
  page: WorldPage;
  template: SectionTemplate;
  onSaveStateChange?: (state: SaveState) => void;
  compact?: boolean;
};

export function StructuredFieldsForm({ page, template, onSaveStateChange, compact }: Props) {
  const [draft, setDraft] = useState<Record<string, unknown>>(
    (page.structured_fields as Record<string, unknown>) ?? {},
  );
  const updatePageInStore = usePagesStore((s) => s.updatePage);
  const dirtyRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setDraft((page.structured_fields as Record<string, unknown>) ?? {});
  }, [page.id, page.structured_fields]);

  useEffect(() => {
    if (!dirtyRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    onSaveStateChange?.('saving');
    timerRef.current = setTimeout(async () => {
      const { data, error } = await updatePage(page.id, {
        structured_fields: draft as Json,
      });
      if (error || !data) {
        onSaveStateChange?.('error');
        return;
      }
      updatePageInStore(page.id, { structured_fields: data.structured_fields });
      onSaveStateChange?.('saved');
      dirtyRef.current = false;
    }, 500);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [draft, page.id, onSaveStateChange, updatePageInStore]);

  if (template.fields.length === 0) {
    return null;
  }

  if (compact) {
    return (
      <View style={styles.compactRoot}>
        <MetaLabel size="sm" tone="accent">
          Properties
        </MetaLabel>
        <View style={styles.compactFields}>
          {template.fields.map((field) => (
            <FieldRenderer
              key={field.key}
              field={field}
              value={draft[field.key]}
              worldId={page.world_id}
              onChange={(value) => {
                dirtyRef.current = true;
                setDraft((prev) => ({ ...prev, [field.key]: value }));
              }}
              compact
            />
          ))}
        </View>
      </View>
    );
  }

  const useGrid = template.fields.length >= 3;
  const gridStyle = useGrid
    ? ({
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
        gap: spacing.md,
        marginTop: spacing.md,
      } as object)
    : styles.fields;

  return (
    <View style={styles.root}>
      <MetaLabel size="sm" tone="accent">
        Facts
      </MetaLabel>
      <View style={gridStyle}>
        {template.fields.map((field) => (
          <FieldRenderer
            key={field.key}
            field={field}
            value={draft[field.key]}
            worldId={page.world_id}
            onChange={(value) => {
              dirtyRef.current = true;
              setDraft((prev) => ({ ...prev, [field.key]: value }));
            }}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.xs,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '33',
    borderRadius: 8,
    backgroundColor: colors.surfaceContainer,
  },
  fields: {
    marginTop: spacing.md,
    gap: spacing.md,
  },
  compactRoot: {
    gap: spacing.sm,
  },
  compactFields: {
    gap: spacing.xs,
  },
});
