// Game-Systems-side imported-content surface — Stage 2 placeholder.
// Renders an empty state today; Stage 5 fleshes this out into the full
// "list imports / re-import / remove / source-book filter" view once the
// Stage 4 import UI exists to populate the storage layer.

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
// Dev-only sample. Stage 4 replaces this with a real file picker. The
// bundled file is small (~6KB) and only referenced when __DEV__ is true,
// so production builds tree-shake it via the conditional.
import sampleSubclasses from '../../vendor/5etools/subclasses-sample.json';

type Props = {
  sys: GameSystemDefinition;
};

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function SystemImportedContentList({ sys }: Props) {
  const [loading, setLoading] = useState(true);
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [importing, setImporting] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

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

  // Dev-only end-to-end sanity check. Imports the bundled sample file as a
  // batch under the active system. Removed in Stage 4 once the real file-
  // pick + parse + ToS-gate flow lands. Production builds short-circuit on
  // the __DEV__ check below so this never renders for end users.
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
      refresh();
    } catch (err) {
      console.warn('Dev import failed', err);
    } finally {
      setImporting(false);
    }
  }

  async function handleRemove(batchId: string) {
    await removeBatch(batchId).catch(() => {});
    refresh();
  }
  // Avoid unused-variable warning when __DEV__ is false at build time.
  void uuid;

  if (loading) {
    return (
      <View style={s.loadingWrap}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const showDevAffordance = __DEV__;

  if (batches.length === 0) {
    return (
      <View style={s.list}>
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
            <Text variant="body-sm" style={s.emptyBody}>
              The file-picker flow lands in a follow-up — for now this surface
              is the home for managing imported content once you have it.
            </Text>
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
                  <Icon name="science" size={16} color={colors.primary} />
                )}
                <Text variant="body-sm" weight="semibold" style={{ color: colors.primary }}>
                  {importing ? 'Importing…' : 'Dev: import sample subclasses'}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </Card>
      </View>
    );
  }

  // Stage 5 fleshes out the populated state. For now we render a minimal
  // batch list so we can validate end-to-end storage.
  return (
    <View style={s.list}>
      {batches.map((b) => (
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
      ))}
      {showDevAffordance ? (
        <Pressable
          onPress={handleDevImport}
          disabled={importing}
          style={({ pressed }) => [
            s.devBtnSolo,
            (pressed || importing) && { opacity: 0.6 },
          ]}
        >
          {importing ? (
            <ActivityIndicator color={colors.primary} size="small" />
          ) : (
            <Icon name="science" size={16} color={colors.primary} />
          )}
          <Text variant="body-sm" weight="semibold" style={{ color: colors.primary }}>
            {importing ? 'Importing…' : 'Dev: re-import sample subclasses'}
          </Text>
        </Pressable>
      ) : null}
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
  devBtn: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.primary + '88',
  },
  devBtnSolo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.primary + '88',
  },
});
