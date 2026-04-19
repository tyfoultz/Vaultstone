import { Modal, Pressable, StyleSheet, View } from 'react-native';
import type { WorldMap } from '@vaultstone/api';
import {
  Card,
  GhostButton,
  Icon,
  MetaLabel,
  Text,
  colors,
  radius,
  spacing,
} from '@vaultstone/ui';

type Props = {
  worldId: string;
  ownerPageId?: string | null;
  onClose: () => void;
  onUploaded: (map: WorldMap) => void;
};

// Native variant — Phase 5f ships web-only upload. The native upload flow
// (expo-image-picker + Supabase Storage) lands in Phase 5i; until then we
// render a placeholder so the route can still mount the modal.
export function MapUploadModal({ onClose }: Props) {
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()} style={styles.panelWrapper}>
          <Card tier="container" padding="lg" style={styles.panel}>
            <View style={styles.header}>
              <View style={{ flex: 1 }}>
                <MetaLabel size="sm" tone="accent">Upload map</MetaLabel>
                <Text
                  variant="headline-sm"
                  family="serif-display"
                  weight="bold"
                  style={{ marginTop: 4 }}
                >
                  Coming soon on mobile
                </Text>
              </View>
              <Pressable onPress={onClose} style={styles.closeBtn}>
                <Icon name="close" size={22} color={colors.onSurfaceVariant} />
              </Pressable>
            </View>

            <Text variant="body-md" tone="secondary" style={{ marginTop: spacing.md }}>
              Upload maps from the web app for now — native upload ships in a
              follow-up slice.
            </Text>

            <View style={styles.footer}>
              <GhostButton label="Close" onPress={onClose} />
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
    backgroundColor: 'rgba(12, 14, 16, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  panelWrapper: {
    width: '100%',
    maxWidth: 480,
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
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'flex-end',
    marginTop: spacing.xl,
  },
});
