import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { updatePage as apiUpdatePage } from '@vaultstone/api';
import { usePagesStore } from '@vaultstone/store';
import type { WorldPage } from '@vaultstone/types';
import {
  Card,
  GradientButton,
  Icon,
  Input,
  MetaLabel,
  Text,
  colors,
  radius,
  spacing,
} from '@vaultstone/ui';

type Props = {
  page: WorldPage;
  onClose: () => void;
};

export function RenamePageModal({ page, onClose }: Props) {
  const [title, setTitle] = useState(page.title);
  const [saving, setSaving] = useState(false);
  const storeUpdate = usePagesStore((s) => s.updatePage);

  async function handleSave() {
    const trimmed = title.trim();
    if (!trimmed || trimmed === page.title) {
      onClose();
      return;
    }
    setSaving(true);
    storeUpdate(page.id, { title: trimmed });
    const { error } = await apiUpdatePage(page.id, { title: trimmed });
    if (error) {
      storeUpdate(page.id, { title: page.title });
    }
    setSaving(false);
    onClose();
  }

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()} style={styles.wrapper}>
          <Card tier="container" padding="lg" style={styles.panel}>
            <View style={styles.header}>
              <View style={{ flex: 1 }}>
                <MetaLabel size="sm" tone="accent">Rename</MetaLabel>
                <Text
                  variant="headline-sm"
                  family="serif-display"
                  weight="bold"
                  style={{ marginTop: 4 }}
                >
                  {page.title}
                </Text>
              </View>
              <Pressable onPress={onClose} style={styles.closeBtn}>
                <Icon name="close" size={22} color={colors.onSurfaceVariant} />
              </Pressable>
            </View>

            <View style={{ marginTop: spacing.lg, gap: spacing.md }}>
              <Input
                label="New title"
                value={title}
                onChangeText={setTitle}
                autoFocus
                onSubmitEditing={handleSave}
              />
              <GradientButton
                label={saving ? 'Saving...' : 'Rename'}
                onPress={handleSave}
                disabled={saving || !title.trim()}
              />
            </View>
          </Card>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(12, 14, 16, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  wrapper: {
    width: '100%',
    maxWidth: 400,
  },
  panel: {
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  closeBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
  },
});
