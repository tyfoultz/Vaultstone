// Game-Systems-side imported-content surface — Stage 2 placeholder.
// Renders an empty state today; Stage 5 fleshes this out into the full
// "list imports / re-import / remove / source-book filter" view once the
// Stage 4 import UI exists to populate the storage layer.

import { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import {
  colors, spacing,
  Card, Text, Icon,
} from '@vaultstone/ui';
import type { GameSystemDefinition } from '@vaultstone/types';
import { listBatches, type ImportBatch } from '@vaultstone/content';

type Props = {
  sys: GameSystemDefinition;
};

export function SystemImportedContentList({ sys }: Props) {
  const [loading, setLoading] = useState(true);
  const [batches, setBatches] = useState<ImportBatch[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listBatches(sys.id)
      .then((rows) => { if (!cancelled) setBatches(rows); })
      .catch(() => { if (!cancelled) setBatches([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [sys.id]);

  if (loading) {
    return (
      <View style={s.loadingWrap}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

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
              community-maintained JSON sources. The default source is the
              5e community content library, but you can point the importer
              at any compatible URL or local file.
            </Text>
            <Text variant="body-sm" style={[s.emptyBody, s.legalNote]}>
              You're responsible for the rights to any content you import.
              Imported content stays on your device only and is never
              transmitted to Vaultstone or shared with other party members.
            </Text>
            <Text variant="body-sm" style={s.emptyBody}>
              The import flow lands in a follow-up — for now, this surface
              is the home for managing imported content once you have it.
            </Text>
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
          </View>
        </Card>
      ))}
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
});
