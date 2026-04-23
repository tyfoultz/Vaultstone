import { useEffect, useMemo, useState } from 'react';
import {
  Image,
  View,
  ScrollView,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { getWorlds, softDeleteWorld } from '@vaultstone/api';
import { useAuthStore, useWorldsStore } from '@vaultstone/store';
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
import type { Database } from '@vaultstone/types';
import { CreateWorldModal } from '../../components/world/CreateWorldModal';

type World = Database['public']['Tables']['worlds']['Row'];

export default function WorldsScreen() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const { worlds, setWorlds } = useWorldsStore();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const { width } = useWindowDimensions();

  const numColumns = width > 1100 ? 3 : width > 700 ? 2 : 1;

  useEffect(() => {
    if (!user) return;
    getWorlds().then(({ data, error: err }) => {
      if (err) {
        setError('Failed to load worlds.');
      } else {
        setWorlds(data ?? []);
      }
      setLoading(false);
    });
  }, [user, setWorlds]);

  const visibleWorlds = useMemo(
    () => worlds.filter((w) => (showArchived ? w.is_archived : !w.is_archived)),
    [worlds, showArchived],
  );

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.surfaceCanvas }}>
      <ScreenHeader
        title="Worlds"
        subtitle="Living settings for your campaigns — lore, maps, and timelines."
        actions={
          <GradientButton
            label="New world"
            icon="add"
            onPress={() => setCreateOpen(true)}
          />
        }
      />

      <View style={styles.filterRow}>
        <Pressable
          onPress={() => setShowArchived(false)}
          style={[
            styles.filterChip,
            !showArchived && styles.filterChipActive,
          ]}
        >
          <Text
            variant="label-md"
            weight="semibold"
            uppercase
            style={{
              color: !showArchived ? colors.primary : colors.onSurfaceVariant,
              letterSpacing: 1,
            }}
          >
            Active
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setShowArchived(true)}
          style={[
            styles.filterChip,
            showArchived && styles.filterChipActive,
          ]}
        >
          <Text
            variant="label-md"
            weight="semibold"
            uppercase
            style={{
              color: showArchived ? colors.primary : colors.onSurfaceVariant,
              letterSpacing: 1,
            }}
          >
            Archived
          </Text>
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : null}
      {error ? (
        <Text
          variant="body-md"
          style={{ color: colors.hpDanger, textAlign: 'center', marginTop: spacing.lg }}
        >
          {error}
        </Text>
      ) : null}

      {!loading && visibleWorlds.length === 0 && !error ? (
        <View style={styles.emptyState}>
          <Icon name="public" size={48} color={colors.outline} />
          <Text
            variant="title-md"
            family="headline"
            weight="bold"
            style={{ marginTop: spacing.md, textAlign: 'center' }}
          >
            {showArchived ? 'No archived worlds.' : 'Chart your first world.'}
          </Text>
          {!showArchived ? (
            <Text
              variant="body-md"
              tone="secondary"
              style={{ marginTop: spacing.sm, textAlign: 'center', maxWidth: 360 }}
            >
              A world holds your setting — regions, timelines, factions — and can
              be linked to any of your campaigns.
            </Text>
          ) : null}
        </View>
      ) : null}

      <View style={[styles.grid, { gap: spacing.md }]}>
        {visibleWorlds.map((world) => (
          <WorldCard
            key={world.id}
            world={world}
            widthBasis={numColumns}
            onPress={() => router.push(`/world/${world.id}`)}
          />
        ))}
      </View>

      {createOpen ? (
        <CreateWorldModal
          onClose={() => setCreateOpen(false)}
          onCreated={(world) => {
            setCreateOpen(false);
            router.push(`/world/${world.id}`);
          }}
        />
      ) : null}
    </ScrollView>
  );
}

function WorldCard({
  world,
  widthBasis,
  onPress,
}: {
  world: World;
  widthBasis: number;
  onPress: () => void;
}) {
  const removeWorld = useWorldsStore((s) => s.removeWorld);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  async function handleDelete() {
    setDeleting(true);
    setDeleteError('');
    const { error: err } = await softDeleteWorld(world.id);
    setDeleting(false);
    if (err) {
      setDeleteError(err.message);
      return;
    }
    removeWorld(world.id);
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
        <View style={{ position: 'relative' }}>
          {world.cover_image_url ? (
            <Image source={{ uri: world.cover_image_url }} style={styles.cover} resizeMode="cover" />
          ) : (
            <LinearGradient
              colors={[colors.primaryContainer, colors.secondaryContainer]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.cover}
            >
              <Icon name="public" size={48} color={colors.onPrimary} />
            </LinearGradient>
          )}
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              setConfirming(true);
            }}
            style={styles.deleteBtn}
            accessibilityLabel={`Delete ${world.name}`}
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
            {world.name}
          </Text>
          {world.description ? (
            <Text
              variant="body-sm"
              tone="secondary"
              numberOfLines={2}
              style={{ color: colors.onSurfaceVariant }}
            >
              {world.description}
            </Text>
          ) : (
            <MetaLabel size="sm">Empty lorebook — start charting</MetaLabel>
          )}
        </View>

        <View style={{ flexDirection: 'row', gap: spacing.xs, marginTop: spacing.md }}>
          {world.is_archived ? <Chip label="Archived" variant="meta" /> : null}
        </View>

        {confirming ? (
          <View style={styles.confirmRow}>
            <Text variant="body-sm" style={{ color: colors.hpDanger, flex: 1 }}>
              {deleteError || `Delete "${world.name}"? This soft-deletes the world.`}
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
  filterRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.lg,
  },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '55',
    backgroundColor: 'transparent',
  },
  filterChipActive: {
    backgroundColor: colors.primaryContainer + '33',
    borderColor: colors.primary + '66',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
  },
  cover: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing['2xl'],
    paddingHorizontal: spacing.xl,
  },
  deleteBtn: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    width: 32,
    height: 32,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(12, 14, 16, 0.55)',
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
