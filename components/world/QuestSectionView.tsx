import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { SectionTemplate, WorldPage } from '@vaultstone/types';
import { GradientButton, Icon, MetaLabel, Text, colors, radius, spacing } from '@vaultstone/ui';

type Status = 'all' | 'active' | 'completed' | 'failed' | 'on-hold';

const STATUS_FILTERS: { key: Status; label: string }[] = [
  { key: 'active', label: 'Active' },
  { key: 'completed', label: 'Completed' },
  { key: 'failed', label: 'Failed' },
  { key: 'on-hold', label: 'On Hold' },
  { key: 'all', label: 'All' },
];

const STATUS_COLOR: Record<string, string> = {
  active: colors.hpHealthy,
  completed: colors.gm,
  failed: colors.hpDanger,
  'on-hold': colors.outline,
};

const PRIORITY_COLOR: Record<string, string> = {
  main: colors.primary,
  side: colors.cosmic,
  personal: colors.player,
};

type Props = {
  worldId: string;
  pages: WorldPage[];
  template: SectionTemplate;
  onPagePress: (pageId: string) => void;
  onCreatePage: () => void;
};

export function QuestSectionView({ pages, onPagePress, onCreatePage }: Props) {
  const [filter, setFilter] = useState<Status>('active');

  const filtered = useMemo(() => {
    const sorted = [...pages].sort((a, b) => {
      const aStatus = getField(a, 'status');
      const bStatus = getField(b, 'status');
      const statusOrder = ['active', 'on-hold', 'completed', 'failed'];
      const ai = statusOrder.indexOf(aStatus);
      const bi = statusOrder.indexOf(bStatus);
      if (ai !== bi) return ai - bi;
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
    if (filter === 'all') return sorted;
    return sorted.filter((p) => getField(p, 'status') === filter);
  }, [pages, filter]);

  return (
    <View>
      <View style={styles.filterRow}>
        {STATUS_FILTERS.map((f) => {
          const active = filter === f.key;
          const chipColor = f.key === 'all' ? colors.onSurfaceVariant : (STATUS_COLOR[f.key] ?? colors.outline);
          return (
            <Pressable
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={[styles.chip, active && { backgroundColor: chipColor + '22', borderColor: chipColor + '55' }]}
            >
              <Text variant="label-sm" weight={active ? 'semibold' : 'regular'} style={{ color: active ? chipColor : colors.outline }}>
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {filtered.length === 0 ? (
        <View style={styles.empty}>
          <MetaLabel size="sm" tone="muted">
            {filter === 'all' ? 'No quests yet' : `No ${filter} quests`}
          </MetaLabel>
          <View style={{ marginTop: spacing.md }}>
            <GradientButton label="Create quest" onPress={onCreatePage} />
          </View>
        </View>
      ) : (
        <View style={styles.list}>
          {filtered.map((quest) => {
            const status = getField(quest, 'status');
            const priority = getField(quest, 'priority');
            const questGiver = getField(quest, 'quest_giver');
            const statusColor = STATUS_COLOR[status] ?? colors.outline;
            const priorityColor = PRIORITY_COLOR[priority] ?? colors.outline;

            return (
              <Pressable key={quest.id} onPress={() => onPagePress(quest.id)} style={styles.row}>
                <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                <View style={{ flex: 1 }}>
                  <Text variant="body-md" weight="semibold" numberOfLines={1}>{quest.title}</Text>
                  <View style={styles.meta}>
                    <Text variant="label-sm" style={{ color: statusColor, textTransform: 'capitalize' }}>
                      {status || 'No status'}
                    </Text>
                    {priority ? (
                      <>
                        <Text variant="label-sm" style={{ color: colors.outline }}> · </Text>
                        <Text variant="label-sm" style={{ color: priorityColor, textTransform: 'capitalize' }}>
                          {priority}
                        </Text>
                      </>
                    ) : null}
                  </View>
                </View>
                <Icon name="chevron-right" size={16} color={colors.outline} />
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

function getField(page: WorldPage, key: string): string {
  const fields = (page.structured_fields as Record<string, unknown>) ?? {};
  return typeof fields[key] === 'string' ? (fields[key] as string) : '';
}

const styles = StyleSheet.create({
  filterRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.lg,
    flexWrap: 'wrap',
  },
  chip: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '44',
  },
  empty: {
    alignItems: 'center',
    paddingVertical: spacing.xl * 2,
  },
  list: {
    gap: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.lg,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
});
