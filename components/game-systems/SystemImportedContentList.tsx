// Game-Systems-side imported-content surface.
// Two layers of organisation:
//   1. Source files are grouped together (one card per source filename)
//      so a single 5e.tools class.json that produces multiple batches
//      (subclass, feat, etc. — once future transforms land) reads as
//      one logical import unit.
//   2. Per-content-type batch rows inside the card carry their own
//      delete; remove-file sits at the file level since it affects
//      every batch under that source. Re-import is implicit — re-picking
//      the same file through the import modal overwrites the existing
//      batch (saveBatch's id is derived from systemId + slugified
//      filename).
//
// A breakdown summary at the top shows the source-book counts ("PHB:
// 36 · XGE: 12") so users can confirm at a glance what's currently
// loaded.

import { useEffect, useMemo, useState } from 'react';
import { View, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import {
  colors, spacing,
  Card, Text, Icon,
} from '@vaultstone/ui';
import type { GameSystemDefinition } from '@vaultstone/types';
import {
  listBatches, removeBatch,
  getSourceBreakdown,
  type ImportBatch, type SourceBreakdown,
} from '@vaultstone/content';
import { ImportContentModal } from '../imported/ImportContentModal';

type Props = {
  sys: GameSystemDefinition;
  /** Called after a successful import or remove so the parent (Game
   *  Systems page) can re-fetch the imported tier for downstream surfaces
   *  like the Class detail. */
  onChanged?: () => void;
};

export function SystemImportedContentList({ sys, onChanged }: Props) {
  const [loading, setLoading] = useState(true);
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [breakdown, setBreakdown] = useState<SourceBreakdown[]>([]);
  const [refreshTick, setRefreshTick] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([listBatches(sys.id), getSourceBreakdown(sys.id)])
      .then(([rows, srcs]) => {
        if (cancelled) return;
        setBatches(rows);
        setBreakdown(srcs);
      })
      .catch(() => {
        if (cancelled) return;
        setBatches([]);
        setBreakdown([]);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [sys.id, refreshTick]);

  const refresh = () => setRefreshTick((n) => n + 1);
  const fanOutChange = () => { refresh(); onChanged?.(); };

  async function handleRemoveBatch(batchId: string) {
    await removeBatch(batchId).catch(() => {});
    fanOutChange();
  }

  async function handleRemoveFile(fileBatches: ImportBatch[]) {
    await Promise.all(fileBatches.map((b) => removeBatch(b.id).catch(() => {})));
    fanOutChange();
  }

  // Group batches by source_url so the same logical file (which may produce
  // multiple content-type batches once future transforms land) renders as
  // one card.
  const groupedBatches = useMemo(() => groupBatchesByFile(batches), [batches]);

  if (loading) {
    return (
      <View style={s.loadingWrap}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const isEmpty = batches.length === 0;

  return (
    <View style={s.list}>
      {!isEmpty && breakdown.length > 0 ? (
        <SourceSummary breakdown={breakdown} />
      ) : null}

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
        groupedBatches.map((group) => (
          <FileCard
            key={group.sourceUrl}
            group={group}
            onRemoveBatch={handleRemoveBatch}
            onRemoveFile={handleRemoveFile}
          />
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
          {isEmpty ? 'Import content' : 'Import or re-import a file'}
        </Text>
      </Pressable>

      <ImportContentModal
        visible={modalOpen}
        systemId={sys.id}
        onClose={() => setModalOpen(false)}
        onImported={fanOutChange}
      />
    </View>
  );
}

// ── Source summary ───────────────────────────────────────────────────────

function SourceSummary({ breakdown }: { breakdown: SourceBreakdown[] }) {
  return (
    <View style={s.summaryStrip}>
      <Text variant="body-sm" style={s.summaryLabel}>From</Text>
      {breakdown.map((src) => (
        <View key={src.code} style={s.summaryChip}>
          <Text variant="body-sm" weight="semibold" style={s.summaryChipCode}>
            {src.code === '__unknown__' ? 'Unknown' : src.code}
          </Text>
          <Text variant="body-sm" style={s.summaryChipCount}>{src.total}</Text>
        </View>
      ))}
    </View>
  );
}

// ── File card ────────────────────────────────────────────────────────────

type FileGroup = {
  sourceUrl: string;
  sourceLabel: string;
  importedAt: string;
  batches: ImportBatch[];
  totalEntries: number;
};

function groupBatchesByFile(batches: ImportBatch[]): FileGroup[] {
  const map = new Map<string, FileGroup>();
  for (const b of batches) {
    const slot = map.get(b.source_url);
    if (slot) {
      slot.batches.push(b);
      slot.totalEntries += b.entry_count;
      // Latest import time wins — re-imports update the file's "imported at".
      if (b.imported_at > slot.importedAt) slot.importedAt = b.imported_at;
    } else {
      map.set(b.source_url, {
        sourceUrl: b.source_url,
        sourceLabel: b.source_label ?? b.source_url,
        importedAt: b.imported_at,
        batches: [b],
        totalEntries: b.entry_count,
      });
    }
  }
  // Sort by most-recently imported first.
  return [...map.values()].sort((a, b) => b.importedAt.localeCompare(a.importedAt));
}

function FileCard({
  group, onRemoveBatch, onRemoveFile,
}: {
  group: FileGroup;
  onRemoveBatch: (batchId: string) => void;
  onRemoveFile: (batches: ImportBatch[]) => void;
}) {
  return (
    <Card>
      <View style={s.fileHeader}>
        <View style={{ flex: 1 }}>
          <Text variant="title-sm" weight="semibold" numberOfLines={1}>
            {group.sourceLabel}
          </Text>
          <Text variant="body-sm" style={s.fileMeta}>
            {group.totalEntries} {group.totalEntries === 1 ? 'entry' : 'entries'}
            {' · '}
            Imported {new Date(group.importedAt).toLocaleDateString()}
          </Text>
        </View>
        <Pressable
          onPress={() => onRemoveFile(group.batches)}
          style={({ pressed }) => [s.headerBtn, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
          accessibilityLabel={`Remove all batches from ${group.sourceLabel}`}
        >
          <Icon name="delete-outline" size={18} color={colors.hpDanger} />
        </Pressable>
      </View>

      {group.batches.length > 1 ? (
        <View style={s.batchList}>
          {group.batches.map((b) => (
            <View key={b.id} style={s.batchRow}>
              <Text variant="body-sm" style={s.batchType}>
                {b.entry_count} {b.content_type}{b.entry_count === 1 ? '' : 's'}
              </Text>
              <Pressable
                onPress={() => onRemoveBatch(b.id)}
                style={({ pressed }) => [s.miniBtn, pressed && { opacity: 0.7 }]}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${b.content_type} batch`}
              >
                <Icon name="close" size={14} color={colors.outline} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : (
        // Single-batch file — show the type breakdown inline since there's
        // no point in a sub-list of one row.
        <Text variant="body-sm" style={s.batchTypeInline}>
          {group.batches[0].entry_count} {group.batches[0].content_type}
          {group.batches[0].entry_count === 1 ? '' : 's'}
        </Text>
      )}
    </Card>
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

  summaryStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.xs,
    paddingBottom: spacing.xs,
  },
  summaryLabel: {
    color: colors.outline,
    marginRight: 2,
  },
  summaryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '55',
    backgroundColor: colors.surfaceContainerHighest,
  },
  summaryChipCode: { color: colors.onSurfaceVariant },
  summaryChipCount: {
    color: colors.outline,
    fontSize: 10,
    fontVariant: ['tabular-nums'],
  },

  fileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.xs,
  },
  fileMeta: { color: colors.onSurfaceVariant, marginTop: 2 },
  headerBtn: { padding: spacing.xs },

  batchList: {
    gap: spacing.xs,
    paddingTop: spacing.sm,
    marginTop: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.outlineVariant + '44',
  },
  batchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 2,
    paddingHorizontal: spacing.xs,
  },
  batchType: { color: colors.onSurfaceVariant },
  batchTypeInline: {
    color: colors.onSurfaceVariant,
    paddingTop: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  miniBtn: { padding: 4 },

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

});
