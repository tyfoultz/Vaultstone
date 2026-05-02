// Shared modal scaffolding for every homebrew authoring form. Each content
// type's form (Spell/Creature/Item/Feat/Class/Species) renders inside this
// shell so the backdrop, panel sizing, header, and footer are consistent
// without each form re-implementing them.

import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import {
  Card,
  GhostButton,
  GradientButton,
  Icon,
  MetaLabel,
  Text,
  colors,
  radius,
  spacing,
} from '@vaultstone/ui';
import type { ReactNode } from 'react';

type Props = {
  /** Pre-title meta line ("New homebrew spell" / "Edit spell"). */
  eyebrow: string;
  /** Modal title. */
  title: string;
  /** Form body — fields, sections, etc. */
  children: ReactNode;
  /** Top-level error message (e.g. "Failed to save"). Empty when no error. */
  error?: string;
  /** True while the save request is in flight; disables Save and shows "Saving…". */
  submitting?: boolean;
  /** Save button label override (defaults to "Save"). */
  saveLabel?: string;
  onClose: () => void;
  onSubmit: () => void;
};

export function HomebrewFormShell({
  eyebrow,
  title,
  children,
  error,
  submitting,
  saveLabel,
  onClose,
  onSubmit,
}: Props) {
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()} style={styles.panelWrapper}>
          <Card tier="container" padding="lg" style={styles.panel}>
            <ScrollView>
              <View style={styles.header}>
                <View style={{ flex: 1 }}>
                  <MetaLabel size="sm" tone="accent">{eyebrow}</MetaLabel>
                  <Text
                    variant="headline-sm"
                    family="headline"
                    weight="bold"
                    style={{ marginTop: 4 }}
                  >
                    {title}
                  </Text>
                </View>
                <Pressable onPress={onClose} style={styles.closeBtn}>
                  <Icon name="close" size={22} color={colors.onSurfaceVariant} />
                </Pressable>
              </View>

              <View style={styles.body}>{children}</View>

              {error ? (
                <Text
                  variant="body-sm"
                  style={{ color: colors.hpDanger, marginTop: spacing.md }}
                >
                  {error}
                </Text>
              ) : null}

              <View style={styles.footer}>
                <GhostButton label="Cancel" onPress={onClose} />
                <GradientButton
                  label={saveLabel ?? 'Save'}
                  onPress={onSubmit}
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
    maxWidth: 640,
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
  body: {
    marginTop: spacing.lg,
    gap: spacing.md,
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'flex-end',
    marginTop: spacing.xl,
  },
});
