// Game-Systems-side imported-content surface — Stage 4 wiring.
// Stage 5 will polish this further (per-source-book filter, re-import
// diff UI). For now: an Import button drives the real ImportContentModal,
// the existing batch list shows imports with delete + re-import actions,
// and a __DEV__-only quick-import affordance keeps the bundled sample
// reachable for development.

import { useEffect, useState } from 'react';
import { View, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import {
  colors, spacing,
  Card, Text, Icon,
} from '@vaultstone/ui';
import type { GameSystemDefinition } from '@vaultstone/types';
import {
  listBatches, saveBatch, removeBatch, transformSubclasses,
  type ImportBatch,
} from '@vaultstone/content';
import { ImportContentModal } from '../imported/ImportContentModal';
// Dev-only sample import. Removed once Stage 6 cleanup lands; kept for
// quick smoke-tests during the imported-content arc.
import sampleSubclasses from '../../vendor/5etools/subclasses-sample.json';

type Props = {
  sys: GameSystemDefinition;
  /** Called after a successful import or remove so the parent (Game
   *  Systems page) can re-fetch the imported tier for downstream surfaces
   *  like the Class detail. Optional — the component still keeps its own
   *  local refresh tick for the in-tab batch list. */
  onChanged?: () => void;
};

export function SystemImportedContentList({ sys, onChanged }: Props) {
  const [loading, setLoading] = useState(true);
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [importing, setImporting] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listBatches(sys.id)
      .then((rows) => { if (!cancelled) setBatches(rows); })
      .catch(() => { if (!cancelled) setBatches([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [sys.id, refreshTick]);

  const refresh = () => setRefreshTick((n) => n + 1);
  const fanOutChange = () => { refresh(); onChanged?.(); };

  // Dev-only quick import of the bundled sample. Doesn't run through the
  // user-facing modal — useful for shaving seconds off the test loop.
  async function handleDevImport() {
    setImporting(true);
    try {
      const entries = transformSubclasses(sampleSubclasses as never, {
        systemId: sys.id,
        sourceLabel: 'Sample subclasses (dev)',
      });
      await saveBatch(
        {
          id: `dev-sample-subclasses-${sys.id}`,
          system_id: sys.id,
          content_type: 'subclass',
          source_url: 'vendor/5etools/subclasses-sample.json',
          source_label: 'Sample subclasses (dev)',
          imported_at: new Date().toISOString(),
        },
        entries,
      );
      fanOutChange();
    } catch (err) {
      console.warn('Dev import failed', err);
    } finally {
      setImporting(false);
    }
  }

  async function handleRemove(batchId: string) {
    await removeBatch(batchId).catch(() => {});
    fanOutChange();
  }

  if (loading) {
    return (
      <View style={s.loadingWrap}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const showDevAffordance = __DEV__;
  const isEmpty = batches.length === 0;

  return (
    <View style={s.list}>
      {isEmpty ? (
        <Card>
          <View style={s.emptyWrap}>
            <Icon name="library-add" size={28} color={colors.outline} />
            <Text variant="title-sm" weight="semibold" style={s.emptyTitle}>
              No content imported yet
            </Text>
            <Text variant="body-sm" style={s.emptyBody}>
              Vaultstone supports importing additional game content from
              JSON files (e.g. community-maintained 5e content libraries).
              You provide the file; nothing is fetched on your behalf and
              imported content stays on your device.
            </Text>
            <Text variant="body-sm" style={[s.emptyBody, s.legalNote]}>
              You're responsible for the rights to any content you import.
              Imported content is never transmitted to Vaultstone or shared
              with other party members.
            </Text>
          </View>
        </Card>
      ) : (
        batches.map((b) => (
          <Card key={b.id}>
            <View style={s.batchRow}>
              <View style={{ flex: 1 }}>
                <Text variant="title-sm" weight="semibold">
                  {b.source_label ?? b.content_type}
                </Text>
                <Text variant="body-sm" style={s.batchMeta}>
                  {b.entry_count} {b.content_type}{b.entry_count === 1 ? '' : 's'}
                  {' · '}
                  {new Date(b.imported_at).toLocaleDateString()}
                </Text>
              </View>
              <Pressable
                onPress={() => handleRemove(b.id)}
                style={({ pressed }) => [s.removeBtn, pressed && { opacity: 0.6 }]}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${b.source_label ?? b.content_type}`}
              >
                <Icon name="delete-outline" size={18} color={colors.hpDanger} />
              </Pressable>
            </View>
          </Card>
        ))
      )}

      {/* Primary import affordance — opens the file-picker modal. */}
      <Pressable
        onPress={() => setModalOpen(true)}
        style={({ pressed }) => [s.importBtn, pressed && { opacity: 0.85 }]}
        accessibilityRole="button"
      >
        <Icon name="upload-file" size={18} color={colors.primary} />
        <Text variant="body-sm" weight="semibold" style={{ color: colors.primary }}>
          {isEmpty ? 'Import content' : 'Import another file'}
        </Text>
      </Pressable>

      {/* Dev quick-import — bypasses the modal so iteration is faster. */}
      {showDevAffordance ? (
        <Pressable
          onPress={handleDevImport}
          disabled={importing}
          style={({ pressed }) => [
            s.devBtn,
            (pressed || importing) && { opacity: 0.6 },
          ]}
        >
          {importing ? (
            <ActivityIndicator color={colors.primary} size="small" />
          ) : (
            <Icon name="science" size={14} color={colors.outline} />
          )}
          <Text variant="body-sm" style={{ color: colors.outline, fontSize: 11 }}>
            {importing ? 'Importing…' : 'Dev: import bundled sample'}
          </Text>
        </Pressable>
      ) : null}

      <ImportContentModal
        visible={modalOpen}
        systemId={sys.id}
        onClose={() => setModalOpen(false)}
        onImported={fanOutChange}
      />
    </View>
  );
}

const s = StyleSheet.create({
  list: { gap: spacing.md, paddingHorizontal: spacing.lg },
  loadingWrap: { padding: spacing.xl, alignItems: 'center' },
  emptyWrap: { gap: spacing.sm, alignItems: 'flex-start', padding: spacing.sm },
  emptyTitle: { color: colors.onSurface, marginTop: spacing.xs },
  emptyBody: { color: colors.onSurfaceVariant, lineHeight: 18 },
  legalNote: {
    marginTop: spacing.xs,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.outlineVariant + '44',
  },
  batchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.sm,
  },
  batchMeta: { color: colors.onSurfaceVariant, marginTop: 2 },
  removeBtn: { padding: spacing.xs },

  importBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs + 2,
    paddingVertical: spacing.sm + 4,
    paddingHorizontal: spacing.md,
    borderRadius: 10,
    backgroundColor: colors.primaryContainer + '22',
    borderWidth: 1,
    borderColor: colors.primary + '88',
  },

  devBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.md,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
    borderColor: colors.outlineVariant + '88',
  },
});
