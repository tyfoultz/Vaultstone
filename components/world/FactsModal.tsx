import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { updatePage } from '@vaultstone/api';
import { usePagesStore } from '@vaultstone/store';
import type { Json, SectionTemplate, WorldPage } from '@vaultstone/types';
import { GhostButton, Icon, MetaLabel, Text, colors, radius, spacing } from '@vaultstone/ui';

import { FieldRenderer } from './fields';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

type Props = {
  visible: boolean;
  page: WorldPage;
  template: SectionTemplate;
  onClose: () => void;
  onSaveStateChange?: (state: SaveState) => void;
};

export function FactsModal({ visible, page, template, onClose, onSaveStateChange }: Props) {
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

  if (template.fields.length === 0) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.modal} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <View style={styles.headerTitle}>
              <Icon name="info-outline" size={16} color={colors.primary} />
              <Text variant="title-md" family="serif-display" weight="bold">
                Facts
              </Text>
            </View>
            <GhostButton label="Done" onPress={onClose} />
          </View>

          <ScrollView contentContainerStyle={styles.content}>
            <View style={styles.fieldsGrid}>
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
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  modal: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '70%',
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '33',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant + '22',
  },
  headerTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  content: {
    padding: spacing.lg,
  },
  fieldsGrid: {
    display: 'grid' as unknown as undefined,
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: spacing.md,
  } as object,
});
