import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import {
  createHomebrewPack,
  type HomebrewPackRow,
} from '@vaultstone/api';
import { useAuthStore } from '@vaultstone/store';
import {
  Card,
  GhostButton,
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
  /** Game system the pack belongs to (e.g. 'dnd5e_2024'). Inherited by entries. */
  system: string;
  /** Optional system display name shown as context in the modal header. */
  systemDisplayName?: string;
  onClose: () => void;
  onCreated: (pack: HomebrewPackRow) => void;
};

/**
 * Create-a-pack modal. Packs always start in the owner's library — there
 * is no upfront campaign-scope choice. A pack becomes available to a
 * campaign's other members only when its owner enables it on that
 * campaign via the Manage Packs flow on the campaign side.
 */
export function CreateHomebrewPackModal({ system, systemDisplayName, onClose, onCreated }: Props) {
  const user = useAuthStore((s) => s.user);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit() {
    if (!user) return;
    if (!name.trim()) {
      setError('Pack name is required.');
      return;
    }
    setSubmitting(true);
    setError('');

    const { data, error: err } = await createHomebrewPack({
      ownerUserId: user.id,
      system,
      name: name.trim(),
      description: description.trim() || null,
    });

    setSubmitting(false);

    if (err || !data) {
      setError(err?.message ?? 'Failed to create pack.');
      return;
    }
    onCreated(data);
  }

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()} style={styles.panelWrapper}>
          <Card tier="container" padding="lg" style={styles.panel}>
            <ScrollView>
              <View style={styles.header}>
                <View style={{ flex: 1 }}>
                  <MetaLabel size="sm" tone="accent">
                    {systemDisplayName ? `New pack for ${systemDisplayName}` : 'New content pack'}
                  </MetaLabel>
                  <Text
                    variant="headline-sm"
                    family="headline"
                    weight="bold"
                    style={{ marginTop: 4 }}
                  >
                    Create a pack
                  </Text>
                </View>
                <Pressable onPress={onClose} style={styles.closeBtn}>
                  <Icon name="close" size={22} color={colors.onSurfaceVariant} />
                </Pressable>
              </View>

              <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
                <Input
                  label="Pack name"
                  placeholder="House Rules — Power Word: Stub"
                  value={name}
                  onChangeText={setName}
                  autoFocus
                />
                <Input
                  label="Description (optional)"
                  placeholder="What's in this pack and where it's intended to be used."
                  value={description}
                  onChangeText={setDescription}
                  multiline
                  numberOfLines={3}
                  style={{ minHeight: 72, textAlignVertical: 'top' }}
                />
              </View>

              {error ? (
                <Text
                  variant="body-sm"
                  style={{
                    color: colors.hpDanger,
                    marginTop: spacing.md,
                  }}
                >
                  {error}
                </Text>
              ) : null}

              <View style={styles.footer}>
                <GhostButton label="Cancel" onPress={onClose} />
                <GradientButton
                  label="Create pack"
                  onPress={handleSubmit}
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
    maxWidth: 560,
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
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'flex-end',
    marginTop: spacing.xl,
  },
});
