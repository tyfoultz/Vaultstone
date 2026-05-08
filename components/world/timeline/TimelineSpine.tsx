import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { EraDefinition, TimelineCalendarSchema, TimelineEvent } from '@vaultstone/types';
import { Chip, Icon, Text, colors, spacing } from '@vaultstone/ui';

import { TimelineEventCard } from './TimelineEventCard';

type EraGroup = {
  era: EraDefinition | null;
  events: TimelineEvent[];
};

type Props = {
  events: TimelineEvent[];
  schema: TimelineCalendarSchema;
  isOwner: boolean;
  activeEra: string | null;
  onEditEvent: (event: TimelineEvent) => void;
  onAddEvent: (eraKey?: string) => void;
};

function groupByEra(
  events: TimelineEvent[],
  schema: TimelineCalendarSchema,
): EraGroup[] {
  const { eras } = schema;
  if (eras.length === 0) {
    return events.length > 0 ? [{ era: null, events }] : [];
  }
  const map = new Map<string, TimelineEvent[]>();
  for (const era of eras) map.set(era.key, []);
  const ungrouped: TimelineEvent[] = [];
  for (const ev of events) {
    const dv = ev.date_values as Record<string, unknown>;
    const eraKey = String(dv.era ?? '');
    if (eraKey && map.has(eraKey)) {
      map.get(eraKey)!.push(ev);
    } else {
      ungrouped.push(ev);
    }
  }
  const groups: EraGroup[] = [];
  for (const era of eras) {
    const erEvents = map.get(era.key) ?? [];
    groups.push({ era, events: erEvents });
  }
  if (ungrouped.length > 0) groups.push({ era: null, events: ungrouped });
  return groups;
}

function formatEventDate(event: TimelineEvent, era: EraDefinition | null): string | null {
  const dv = event.date_values as Record<string, unknown> | null;
  if (!dv || !era) return null;
  const parts: string[] = [];
  for (const level of era.dateLevels) {
    const val = dv[level.key];
    if (val != null && String(val) !== '') {
      parts.push(`${level.label} ${val}`);
    }
  }
  return parts.length > 0 ? parts.join(', ') : null;
}

export function TimelineSpine({
  events,
  schema,
  isOwner,
  activeEra,
  onEditEvent,
  onAddEvent,
}: Props) {
  const groups = groupByEra(events, schema);
  const filtered = activeEra
    ? groups.filter((g) => g.era?.key === activeEra)
    : groups;

  if (filtered.length === 0 && events.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Icon name="event" size={40} color={colors.outlineVariant} />
        <Text variant="body-md" tone="secondary" style={{ marginTop: spacing.sm }}>
          No events yet. Add your first timeline event.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.root}>
      {filtered.map((group, gi) => (
        <View key={group.era?.key ?? `ungrouped-${gi}`}>
          {/* Era header */}
          {group.era ? (
            <View style={styles.eraHeader}>
              <View style={styles.eraDiamond}>
                <Icon name="diamond" size={10} color={colors.primary} family="material-community" />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  variant="title-md"
                  family="serif-display"
                  weight="bold"
                  style={{ color: colors.primary, fontStyle: 'italic' }}
                >
                  {group.era.label}
                </Text>
                {group.era.dateLevels.length > 0 ? (
                  <Text variant="label-sm" style={{ color: colors.onSurfaceVariant, marginTop: 2 }}>
                    {group.era.key}
                  </Text>
                ) : null}
              </View>
            </View>
          ) : null}

          {/* Add button */}
          {isOwner ? (
            <View style={styles.addBtnRow}>
              <Pressable
                style={styles.addBtn}
                onPress={() => onAddEvent(group.era?.key)}
              >
                <Icon name="add" size={14} color={colors.primary} />
              </Pressable>
            </View>
          ) : null}

          {/* Events */}
          {group.events.map((event) => {
            const dateStr = formatEventDate(event, group.era);
            const tags = ((event as Record<string, unknown>).structured_fields as Record<string, unknown> | null)
              ?.tags as string[] | undefined;

            return (
              <View key={event.id} style={styles.eventRow}>
                {/* Spine connector */}
                <View style={styles.connector}>
                  <View style={styles.spineLine} />
                  <View style={styles.spineNode} />
                  <View style={styles.spineLine} />
                </View>

                {/* Event card */}
                <Pressable
                  style={styles.eventCard}
                  onPress={() => onEditEvent(event)}
                >
                  {dateStr ? (
                    <Text variant="label-sm" uppercase style={{ color: colors.onSurfaceVariant, letterSpacing: 0.8, marginBottom: spacing.xs }}>
                      {dateStr}
                    </Text>
                  ) : null}
                  <Text
                    variant="title-md"
                    family="serif-display"
                    weight="bold"
                    style={{ color: colors.onSurface }}
                  >
                    {event.title}
                  </Text>
                  {tags && tags.length > 0 ? (
                    <View style={styles.tagRow}>
                      {tags.map((tag) => (
                        <Chip key={tag} label={tag} variant="category" />
                      ))}
                    </View>
                  ) : null}
                  {event.body_text ? (
                    <Text
                      variant="body-md"
                      style={{ color: colors.onSurfaceVariant, marginTop: spacing.sm }}
                      numberOfLines={4}
                    >
                      {event.body_text}
                    </Text>
                  ) : null}
                </Pressable>
              </View>
            );
          })}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing['2xl'],
  },
  eraHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingLeft: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant + '33',
    marginBottom: spacing.sm,
  },
  eraDiamond: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventRow: {
    flexDirection: 'row',
    minHeight: 100,
  },
  connector: {
    width: 32,
    alignItems: 'center',
  },
  spineLine: {
    flex: 1,
    width: 2,
    backgroundColor: colors.outlineVariant + '55',
  },
  spineNode: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceCanvas,
  },
  eventCard: {
    flex: 1,
    backgroundColor: colors.surfaceContainer,
    borderRadius: 12,
    padding: spacing.md,
    marginLeft: spacing.sm,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '22',
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  addBtnRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingVertical: spacing.xs,
  },
  addBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '44',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
