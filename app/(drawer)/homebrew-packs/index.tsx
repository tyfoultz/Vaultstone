import { useEffect, useMemo, useState } from 'react';
import {
  View,
  ScrollView,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  listHomebrewPacks,
  deleteHomebrewPack,
  type HomebrewPackRow,
} from '@vaultstone/api';
import { useAuthStore } from '@vaultstone/store';
import {
  colors,
  spacing,
  radius,
  Card,
  Chip,
  MetaLabel,
  Text,
  GradientButton,
  ScreenHeader,
  Icon,
} from '@vaultstone/ui';
import { CreateHomebrewPackModal } from '../../../components/homebrew/CreateHomebrewPackModal';

export default function HomebrewPacksScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [packs, setPacks] = useState<HomebrewPackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const { width } = useWindowDimensions();
  const numColumns = width > 1100 ? 3 : width > 700 ? 2 : 1;

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    listHomebrewPacks().then(({ data, error: err }) => {
      if (cancelled) return;
      if (err) setError('Failed to load packs.');
      else setPacks(data ?? []);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const visiblePacks = useMemo(() => packs, [packs]);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.surfaceCanvas }}>
      <ScreenHeader
        title="Homebrew Packs"
        subtitle="Curated bundles of your homebrew content — grouped, named, and toggle-able per campaign."
        actions={
          <GradientButton
            label="New pack"
            icon="add"
            onPress={() => setCreateOpen(true)}
          />
        }
      />

      {loading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} /> : null}
      {error ? (
        <Text
          variant="body-md"
          style={{ color: colors.hpDanger, textAlign: 'center', marginTop: spacing.lg }}
        >
          {error}
        </Text>
      ) : null}

      {!loading && visiblePacks.length === 0 && !error ? (
        <View style={styles.emptyState}>
          <Icon name="inventory-2" size={48} color={colors.outline} />
          <Text
            variant="title-md"
            family="headline"
            weight="bold"
            style={{ marginTop: spacing.md, textAlign: 'center' }}
          >
            No packs yet.
          </Text>
          <Text
            variant="body-md"
            tone="secondary"
            style={{ marginTop: spacing.sm, textAlign: 'center', maxWidth: 420 }}
          >
            A pack is a named collection of your homebrew — house rules, custom monsters,
            campaign-specific items. Create one to get started; you can toggle packs on
            and off per campaign in Content Settings.
          </Text>
        </View>
      ) : null}

      <View style={[styles.grid, { gap: spacing.md }]}>
        {visiblePacks.map((pack) => (
          <PackCard
            key={pack.id}
            pack={pack}
            widthBasis={numColumns}
            onPress={() => router.push(`/homebrew-packs/${pack.id}` as never)}
            onDeleted={() => setPacks((prev) => prev.filter((p) => p.id !== pack.id))}
          />
        ))}
      </View>

      {createOpen ? (
        <CreateHomebrewPackModal
          onClose={() => setCreateOpen(false)}
          onCreated={(pack) => {
            setCreateOpen(false);
            setPacks((prev) => [pack, ...prev]);
            router.push(`/homebrew-packs/${pack.id}` as never);
          }}
        />
      ) : null}
    </ScrollView>
  );
}

function PackCard({
  pack,
  widthBasis,
  onPress,
  onDeleted,
}: {
  pack: HomebrewPackRow;
  widthBasis: number;
  onPress: () => void;
  onDeleted: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  async function handleDelete() {
    setDeleting(true);
    setDeleteError('');
    const { error: err } = await deleteHomebrewPack(pack.id);
    setDeleting(false);
    if (err) {
      setDeleteError(err.message);
      return;
    }
    onDeleted();
  }

  return (
    <Pressable
      onPress={confirming ? undefined : onPress}
      style={{
        flexBasis: `${100 / widthBasis}%`,
        flexGrow: 1,
        maxWidth: widthBasis === 1 ? '100%' : `${100 / widthBasis}%`,
      }}
    >
      <Card tier="high" padding="md" style={{ overflow: 'hidden' }}>
        <View style={styles.cardHeader}>
          <View style={styles.cardIcon}>
            <Icon name="inventory-2" size={28} color={colors.primary} />
          </View>
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              setConfirming(true);
            }}
            style={styles.deleteBtn}
            accessibilityLabel={`Delete ${pack.name}`}
          >
            <Icon name="delete" size={18} color={colors.onSurface} />
          </Pressable>
        </View>

        <View style={{ marginTop: spacing.md, gap: spacing.xs }}>
          <Text
            variant="title-md"
            family="headline"
            weight="bold"
            numberOfLines={1}
            style={{ letterSpacing: -0.25 }}
          >
            {pack.name}
          </Text>
          {pack.description ? (
            <Text
              variant="body-sm"
              tone="secondary"
              numberOfLines={2}
              style={{ color: colors.onSurfaceVariant }}
            >
              {pack.description}
            </Text>
          ) : (
            <MetaLabel size="sm">No description yet</MetaLabel>
          )}
        </View>

        <View style={{ flexDirection: 'row', gap: spacing.xs, marginTop: spacing.md, flexWrap: 'wrap' }}>
          <Chip
            label={pack.campaign_id ? 'Campaign-scoped' : 'Personal library'}
            variant="meta"
          />
          {pack.is_published ? <Chip label="Shared" variant="accent" /> : null}
        </View>

        {confirming ? (
          <View style={styles.confirmRow}>
            <Text variant="body-sm" style={{ color: colors.hpDanger, flex: 1 }}>
              {deleteError || `Delete "${pack.name}"? Entries inside this pack will be deleted too.`}
            </Text>
            <Pressable
              onPress={(e) => {
                e.stopPropagation();
                setConfirming(false);
                setDeleteError('');
              }}
              style={[styles.confirmBtn, styles.confirmCancel]}
            >
              <Text
                variant="label-md"
                weight="semibold"
                uppercase
                style={{ color: colors.onSurfaceVariant, letterSpacing: 1 }}
              >
                Cancel
              </Text>
            </Pressable>
            <Pressable
              onPress={(e) => {
                e.stopPropagation();
                handleDelete();
              }}
              style={[styles.confirmBtn, styles.confirmDelete]}
              disabled={deleting}
            >
              <Text
                variant="label-md"
                weight="semibold"
                uppercase
                style={{ color: '#fff', letterSpacing: 1 }}
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing['2xl'],
    paddingHorizontal: spacing.xl,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    backgroundColor: colors.primaryContainer + '33',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '33',
  },
  confirmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant + '33',
    flexWrap: 'wrap',
  },
  confirmBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  confirmCancel: {
    borderColor: colors.outlineVariant + '55',
    backgroundColor: 'transparent',
  },
  confirmDelete: {
    borderColor: colors.hpDanger,
    backgroundColor: colors.hpDanger,
  },
});
