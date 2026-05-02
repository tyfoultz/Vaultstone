import { useEffect, useState } from 'react';
import {
  View,
  ScrollView,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  getHomebrewPack,
  getHomebrewPackEntryCount,
  updateHomebrewPack,
  deleteHomebrewPack,
  type HomebrewPackRow,
} from '@vaultstone/api';
import {
  colors,
  spacing,
  radius,
  Card,
  Chip,
  GhostButton,
  Icon,
  Input,
  MetaLabel,
  ScreenHeader,
  Text,
} from '@vaultstone/ui';

type EditableField = 'name' | 'description';

export default function HomebrewPackDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [pack, setPack] = useState<HomebrewPackRow | null>(null);
  const [entryCount, setEntryCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<EditableField | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftDescription, setDraftDescription] = useState('');
  const [savingField, setSavingField] = useState<EditableField | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    Promise.all([
      getHomebrewPack(id),
      getHomebrewPackEntryCount(id),
    ]).then(([packRes, countRes]) => {
      if (cancelled) return;
      if (packRes.error || !packRes.data) {
        setError('Pack not found.');
        setLoading(false);
        return;
      }
      setPack(packRes.data);
      setEntryCount(countRes.count);
      setDraftName(packRes.data.name);
      setDraftDescription(packRes.data.description ?? '');
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function commitField(field: EditableField) {
    if (!pack) return;
    const patch = field === 'name'
      ? { name: draftName.trim() || pack.name }
      : { description: draftDescription.trim() || null };
    setSavingField(field);
    const { data, error: err } = await updateHomebrewPack(pack.id, patch);
    setSavingField(null);
    if (err || !data) return;
    setPack(data);
    setEditing(null);
  }

  async function togglePublish() {
    if (!pack) return;
    const { data } = await updateHomebrewPack(pack.id, { is_published: !pack.is_published });
    if (data) setPack(data);
  }

  async function handleDelete() {
    if (!pack) return;
    setDeleting(true);
    setDeleteError('');
    const { error: err } = await deleteHomebrewPack(pack.id);
    setDeleting(false);
    if (err) {
      setDeleteError(err.message);
      return;
    }
    router.back();
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (error || !pack) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: colors.surfaceCanvas }}>
        <ScreenHeader title="Homebrew Pack" />
        <View style={styles.centered}>
          <Icon name="error-outline" size={48} color={colors.outline} />
          <Text variant="title-md" family="headline" weight="bold" style={{ marginTop: spacing.md }}>
            {error || 'Pack not found.'}
          </Text>
          <Pressable onPress={() => router.back()} style={{ marginTop: spacing.md }}>
            <Text variant="body-md" style={{ color: colors.primary }}>Back</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.surfaceCanvas }}>
      <ScreenHeader
        title={pack.name}
        subtitle={pack.campaign_id ? 'Campaign-scoped pack' : 'Personal library pack'}
        actions={
          <View style={{ flexDirection: 'row', gap: spacing.xs }}>
            <GhostButton
              label="Back"
              icon="arrow-back"
              onPress={() => router.back()}
            />
            <GhostButton
              label="Delete"
              icon="delete"
              onPress={() => setConfirmingDelete(true)}
            />
          </View>
        }
      />

      {confirmingDelete ? (
        <View style={styles.deleteBanner}>
          <Icon name="warning" size={18} color={colors.hpDanger} />
          <Text variant="body-sm" family="body" style={{ flex: 1, color: colors.onSurface }}>
            {deleteError || (
              <>
                Delete <Text weight="bold">{pack.name}</Text>? This permanently removes the pack
                {entryCount > 0 ? ` and its ${entryCount} ${entryCount === 1 ? 'entry' : 'entries'}` : ''}.
              </>
            )}
          </Text>
          <Pressable
            onPress={() => {
              setConfirmingDelete(false);
              setDeleteError('');
            }}
            style={[styles.bannerBtn, styles.bannerCancel]}
          >
            <Text variant="label-sm" weight="semibold" uppercase style={{ color: colors.onSurfaceVariant, letterSpacing: 1 }}>
              Cancel
            </Text>
          </Pressable>
          <Pressable
            onPress={handleDelete}
            disabled={deleting}
            style={[styles.bannerBtn, styles.bannerDelete]}
          >
            <Text variant="label-sm" weight="semibold" uppercase style={{ color: '#fff', letterSpacing: 1 }}>
              {deleting ? 'Deleting…' : 'Delete'}
            </Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.body}>
        {/* Pack info card */}
        <Card tier="container" padding="lg" style={styles.card}>
          <View style={styles.cardSectionHeader}>
            <MetaLabel size="sm">Details</MetaLabel>
          </View>

          {/* Name (editable) */}
          <View style={styles.fieldRow}>
            <Text variant="label-md" weight="semibold" uppercase style={styles.fieldLabel}>
              Name
            </Text>
            {editing === 'name' ? (
              <View style={styles.fieldEditor}>
                <Input
                  value={draftName}
                  onChangeText={setDraftName}
                  autoFocus
                />
                <View style={styles.editActions}>
                  <Pressable
                    onPress={() => {
                      setDraftName(pack.name);
                      setEditing(null);
                    }}
                    style={[styles.editBtn, styles.editCancel]}
                  >
                    <Text variant="label-sm" weight="semibold" uppercase style={{ color: colors.onSurfaceVariant }}>
                      Cancel
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => commitField('name')}
                    disabled={savingField === 'name'}
                    style={[styles.editBtn, styles.editSave]}
                  >
                    <Text variant="label-sm" weight="semibold" uppercase style={{ color: colors.onPrimary }}>
                      {savingField === 'name' ? 'Saving…' : 'Save'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable
                onPress={() => setEditing('name')}
                style={styles.fieldValue}
              >
                <Text variant="body-md">{pack.name}</Text>
                <Icon name="edit" size={16} color={colors.outline} />
              </Pressable>
            )}
          </View>

          {/* Description (editable) */}
          <View style={styles.fieldRow}>
            <Text variant="label-md" weight="semibold" uppercase style={styles.fieldLabel}>
              Description
            </Text>
            {editing === 'description' ? (
              <View style={styles.fieldEditor}>
                <Input
                  value={draftDescription}
                  onChangeText={setDraftDescription}
                  multiline
                  numberOfLines={3}
                  style={{ minHeight: 72, textAlignVertical: 'top' }}
                />
                <View style={styles.editActions}>
                  <Pressable
                    onPress={() => {
                      setDraftDescription(pack.description ?? '');
                      setEditing(null);
                    }}
                    style={[styles.editBtn, styles.editCancel]}
                  >
                    <Text variant="label-sm" weight="semibold" uppercase style={{ color: colors.onSurfaceVariant }}>
                      Cancel
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => commitField('description')}
                    disabled={savingField === 'description'}
                    style={[styles.editBtn, styles.editSave]}
                  >
                    <Text variant="label-sm" weight="semibold" uppercase style={{ color: colors.onPrimary }}>
                      {savingField === 'description' ? 'Saving…' : 'Save'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable
                onPress={() => setEditing('description')}
                style={styles.fieldValue}
              >
                <Text
                  variant="body-md"
                  style={{ color: pack.description ? colors.onSurface : colors.outline, flex: 1 }}
                >
                  {pack.description ?? 'Add a description…'}
                </Text>
                <Icon name="edit" size={16} color={colors.outline} />
              </Pressable>
            )}
          </View>

          {/* Sharing */}
          {pack.campaign_id ? (
            <View style={styles.fieldRow}>
              <Text variant="label-md" weight="semibold" uppercase style={styles.fieldLabel}>
                Sharing
              </Text>
              <Pressable onPress={togglePublish} style={styles.fieldValue}>
                <View style={{ flexDirection: 'row', gap: spacing.xs, alignItems: 'center', flex: 1 }}>
                  <Chip
                    label={pack.is_published ? 'Visible to party' : 'GM-only'}
                    variant={pack.is_published ? 'accent' : 'meta'}
                  />
                  <Text variant="body-sm" tone="secondary">
                    {pack.is_published
                      ? 'All players in this campaign can see and use entries from this pack.'
                      : 'Only you can see entries from this pack.'}
                  </Text>
                </View>
                <Icon name="swap-horiz" size={16} color={colors.outline} />
              </Pressable>
            </View>
          ) : null}
        </Card>

        {/* Entries section — placeholder for Phase 2 authoring forms */}
        <Card tier="container" padding="lg" style={styles.card}>
          <View style={styles.cardSectionHeader}>
            <MetaLabel size="sm">Contents</MetaLabel>
            <Text variant="body-sm" tone="secondary">
              {entryCount === 0
                ? 'No entries yet'
                : `${entryCount} ${entryCount === 1 ? 'entry' : 'entries'}`}
            </Text>
          </View>

          <View style={styles.placeholderBox}>
            <Icon name="auto-awesome" size={32} color={colors.outline} />
            <Text
              variant="title-sm"
              family="headline"
              weight="bold"
              style={{ marginTop: spacing.sm, textAlign: 'center' }}
            >
              Authoring forms coming soon.
            </Text>
            <Text
              variant="body-sm"
              tone="secondary"
              style={{ marginTop: spacing.xs, textAlign: 'center', maxWidth: 380 }}
            >
              In Phase 2 you'll be able to create homebrew spells, creatures, items,
              species, classes, and features inside this pack — each with structured
              forms matching the SRD content schema.
            </Text>
          </View>
        </Card>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  body: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
    gap: spacing.lg,
  },
  deleteBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.xl,
    marginBottom: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.hpDanger + '14',
    borderWidth: 1,
    borderColor: colors.hpDanger + '55',
    flexWrap: 'wrap',
  },
  bannerBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  bannerCancel: {
    borderColor: colors.outlineVariant + '55',
    backgroundColor: 'transparent',
  },
  bannerDelete: {
    borderColor: colors.hpDanger,
    backgroundColor: colors.hpDanger,
  },
  card: {
    borderWidth: 1,
    borderColor: colors.outlineVariant + '33',
  },
  cardSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  fieldRow: {
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant + '22',
    gap: spacing.xs,
  },
  fieldLabel: {
    color: colors.outline,
    letterSpacing: 1,
  },
  fieldValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  fieldEditor: {
    gap: spacing.sm,
  },
  editActions: {
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'flex-end',
  },
  editBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  editCancel: {
    borderColor: colors.outlineVariant + '55',
    backgroundColor: 'transparent',
  },
  editSave: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  placeholderBox: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surfaceContainerLow + '88',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '22',
    borderStyle: 'dashed',
  },
});
