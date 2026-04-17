import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { updatePage } from '@vaultstone/api';
import { usePagesStore } from '@vaultstone/store';
import type { Json, SectionTemplate, WorldPage } from '@vaultstone/types';
import { Card, MetaLabel, Text, colors, spacing } from '@vaultstone/ui';

import { FieldRenderer } from './fields';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

type Props = {
  page: WorldPage;
  template: SectionTemplate;
  onSaveStateChange?: (state: SaveState) => void;
};

// Facts card above the body. Renders one field row per `template.fields`
// entry; writes are debounced 500ms and merged into
// `world_pages.structured_fields`.
export function StructuredFieldsForm({ page, template, onSaveStateChange }: Props) {
  const [draft, setDraft] = useState<Record<string, unknown>>(
    (page.structured_fields as Record<string, unknown>) ?? {},
  );
  const updatePageInStore = usePagesStore((s) => s.updatePage);
  const dirtyRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync when the page row changes underneath us (e.g., another tab edits).
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

  return (
    <Card tier="container" padding="lg" style={styles.root}>
      <MetaLabel size="sm" tone="accent">
        Facts
      </MetaLabel>
      <Text
        variant="body-sm"
        tone="secondary"
        style={{ color: colors.onSurfaceVariant, marginTop: 2 }}
      >
        Structured fields derived from the <Text weight="semibold">{template.label}</Text> template.
      </Text>
      <View style={styles.fields}>
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
    </Card>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.sm,
  },
  fields: {
    marginTop: spacing.md,
    gap: spacing.md,
  },
});
