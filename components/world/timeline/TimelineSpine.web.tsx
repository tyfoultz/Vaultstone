import { Pressable, StyleSheet, View } from 'react-native';
import type { EraDefinition, TimelineCalendarSchema, TimelineEvent } from '@vaultstone/types';
import { Icon, Text, colors, spacing } from '@vaultstone/ui';

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
    <View style={styles.root}>
      <View style={styles.spineLine} />

      {filtered.map((group, gi) => (
        <View key={group.era?.key ?? `ungrouped-${gi}`}>
          {/* Era divider */}
          {group.era ? (
            <View style={styles.eraDivider}>
              <View style={styles.eraPill}>
                <Text variant="label-md" weight="semibold" style={styles.eraText}>
                  {group.era.label}
                </Text>
              </View>
              <View style={styles.eraDot} />
            </View>
          ) : null}

          {/* Add event at top of era */}
          {isOwner ? (
            <View style={styles.addBtnRow}>
              <Pressable
                onPress={() => onAddEvent(group.era?.key)}
                style={styles.addBtn}
              >
                <Icon name="add" size={14} color={colors.cosmic} />
              </Pressable>
            </View>
          ) : null}

          {/* Events alternating L/R */}
          {group.events.map((event, idx) => {
            const isLeft = idx % 2 === 0;
            return (
              <View key={event.id} style={styles.eventRow}>
                <View style={[styles.eventSide, isLeft ? styles.eventLeft : styles.eventRight]}>
                  {isLeft ? (
                    <TimelineEventCard
                      event={event}
                      era={group.era}
                      isOwner={isOwner}
                      onEdit={() => onEditEvent(event)}
                    />
                  ) : null}
                </View>

                <View style={styles.connectorCol}>
                  <View style={styles.connectorLine} />
                  <View style={styles.spineDot} />
                  <View style={styles.connectorLine} />
                </View>

                <View style={[styles.eventSide, isLeft ? styles.eventRight : styles.eventLeft]}>
                  {!isLeft ? (
                    <TimelineEventCard
                      event={event}
                      era={group.era}
                      isOwner={isOwner}
                      onEdit={() => onEditEvent(event)}
                    />
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

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
    const evs = map.get(era.key) ?? [];
    if (evs.length > 0 || era.label) {
      groups.push({ era, events: evs });
    }
  }
  if (ungrouped.length > 0) {
    groups.push({ era: null, events: ungrouped });
  }
  return groups;
}

const SPINE_WIDTH = 2;
const DOT_SIZE = 12;
const CONNECTOR_WIDTH = 40;

const styles = StyleSheet.create({
  root: { position: 'relative', paddingBottom: spacing.xl },
  spineLine: {
    position: 'absolute', left: '50%', marginLeft: -SPINE_WIDTH / 2,
    top: 0, bottom: 0, width: SPINE_WIDTH, backgroundColor: colors.outlineVariant + '44',
  },
  eraDivider: { alignItems: 'center', marginVertical: spacing.lg, zIndex: 1 },
  eraPill: {
    paddingHorizontal: spacing.lg, paddingVertical: spacing.xs + 2,
    borderRadius: 20, borderWidth: 1, borderColor: colors.primary + '55',
    backgroundColor: colors.surfaceCanvas,
  },
  eraText: { color: colors.primary, fontStyle: 'italic', fontSize: 15 },
  eraDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: colors.primary, marginTop: spacing.xs,
  },
  addBtnRow: { alignItems: 'center', marginVertical: spacing.sm, zIndex: 1 },
  addBtn: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: colors.surfaceContainerHigh,
    borderWidth: 1, borderColor: colors.cosmic + '55',
    alignItems: 'center', justifyContent: 'center',
  },
  eventRow: { flexDirection: 'row', alignItems: 'center', marginVertical: spacing.sm },
  eventSide: { flex: 1 },
  eventLeft: { alignItems: 'flex-end', paddingRight: spacing.sm },
  eventRight: { alignItems: 'flex-start', paddingLeft: spacing.sm },
  connectorCol: { width: CONNECTOR_WIDTH, alignItems: 'center', zIndex: 1 },
  connectorLine: { width: SPINE_WIDTH, flex: 1, backgroundColor: colors.outlineVariant + '44' },
  spineDot: {
    width: DOT_SIZE, height: DOT_SIZE, borderRadius: DOT_SIZE / 2,
    backgroundColor: colors.cosmic, borderWidth: 2, borderColor: colors.surfaceCanvas,
  },
  emptyState: { alignItems: 'center', paddingVertical: spacing['2xl'] },
});
