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
  // Layout: the panelWrapper caps height at 90vh; inside, a fixed header
  // and footer sandwich a flex-1 ScrollView that owns the overflow. Without
  // the explicit flex on the ScrollView the panel sized to content and
  // long forms (Spell, Class) would exceed the viewport with no scroll.
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()} style={styles.panelWrapper}>
          <Card tier="container" padding="lg" style={styles.panel}>
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

            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.body}>{children}</View>

              {error ? (
                <Text
                  variant="body-sm"
                  style={{ color: colors.hpDanger, marginTop: spacing.md }}
                >
                  {error}
                </Text>
              ) : null}
            </ScrollView>

            <View style={styles.footer}>
              <GhostButton label="Cancel" onPress={onClose} />
              <GradientButton
                label={saveLabel ?? 'Save'}
                onPress={onSubmit}
                loading={submitting}
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
    backgroundColor: 'rgba(12, 14, 16, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  panelWrapper: {
    width: '100%',
    maxWidth: 760,
    // Cap the wrapper height so the inner ScrollView has a bounded height
    // to scroll inside. Without this, content sized to itself and overflowed
    // the viewport.
    maxHeight: '90%',
    // Take only as much height as needed (up to maxHeight). flex: 1 here
    // would force-fill the parent, which we don't want for short forms.
    flexShrink: 1,
  },
  panel: {
    borderWidth: 1,
    borderColor: colors.outlineVariant + '33',
    // Card itself becomes the flex column: header / scroll / footer.
    flexShrink: 1,
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
  // Middle band that owns scroll. flexShrink lets it consume only the
  // remaining space inside the bounded panel; the contentContainer holds
  // the form fields.
  scroll: {
    flexShrink: 1,
  },
  scrollContent: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    // Reserve space for the web scrollbar so it doesn't overlap the
    // rightmost form fields (remove buttons, level inputs, etc.).
    paddingRight: spacing.sm,
  },
  body: {
    gap: spacing.md,
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'flex-end',
    marginTop: spacing.md,
  },
});
