import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { trashSection } from '@vaultstone/api';
import { useSectionsStore } from '@vaultstone/store';
import type { WorldSection } from '@vaultstone/types';
import { Icon, Text, colors, radius, spacing } from '@vaultstone/ui';

type Props = {
  visible: boolean;
  anchor: { x: number; y: number } | null;
  section: WorldSection;
  onClose: () => void;
  onAddPage: () => void;
  onSettings: () => void;
};

export function SectionContextMenu({
  visible,
  anchor,
  section,
  onClose,
  onAddPage,
  onSettings,
}: Props) {
  const storeRemove = useSectionsStore((s) => s.removeSection);

  if (!visible) return null;

  async function handleDelete() {
    onClose();
    storeRemove(section.id);
    const { error } = await trashSection(section.id);
    if (error) {
      const store = useSectionsStore.getState();
      store.addSection(section);
    }
  }

  const items = [
    {
      label: 'Add page',
      icon: 'add',
      onPress: () => { onClose(); onAddPage(); },
    },
    {
      label: 'Section settings',
      icon: 'settings',
      onPress: () => { onClose(); onSettings(); },
    },
    'divider' as const,
    {
      label: 'Delete section',
      icon: 'delete',
      onPress: handleDelete,
      destructive: true,
    },
  ];

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={[
            styles.menuWrapper,
            anchor ? { position: 'absolute' as const, left: anchor.x, top: anchor.y } : {},
          ]}
        >
          <View style={styles.menu}>
            {items.map((item, i) => {
              if (item === 'divider') {
                return <View key={`div-${i}`} style={styles.divider} />;
              }
              return (
                <Pressable
                  key={item.label}
                  onPress={item.onPress}
                  style={({ pressed }) => [
                    styles.menuRow,
                    pressed && { backgroundColor: colors.surfaceContainerHigh },
                  ]}
                >
                  <Icon
                    name={item.icon as React.ComponentProps<typeof Icon>['name']}
                    size={16}
                    color={item.destructive ? colors.hpDanger : colors.onSurfaceVariant}
                  />
                  <Text
                    variant="label-md"
                    style={{
                      flex: 1,
                      color: item.destructive ? colors.hpDanger : colors.onSurface,
                    }}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  menuWrapper: {
    width: 200,
  },
  menu: {
    backgroundColor: colors.surfaceContainer,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '33',
    padding: spacing.xs,
    gap: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 7,
    borderRadius: radius.lg,
  },
  divider: {
    height: 1,
    backgroundColor: colors.outlineVariant + '33',
    marginVertical: 2,
  },
});
