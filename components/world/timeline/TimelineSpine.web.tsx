import { Pressable, StyleSheet, View } from 'react-native';
import type { CalendarUnit, TimelineEvent } from '@vaultstone/types';
import { Icon, Text, colors, spacing } from '@vaultstone/ui';

import { TimelineEventCard } from './TimelineEventCard';

type EraGroup = {
  era: string;
  events: TimelineEvent[];
};

type Props = {
  events: TimelineEvent[];
  calendarSchema: CalendarUnit[];
  isOwner: boolean;
  activeEra: string | null;
  onEditEvent: (event: TimelineEvent) => void;
  onAddEvent: (eraValue?: string) => void;
};

export function TimelineSpine({
  events,
  calendarSchema,
  isOwner,
  activeEra,
  onEditEvent,
  onAddEvent,
}: Props) {
  const topUnit = calendarSchema.length > 0 ? calendarSchema[0] : null;
  const groups = groupByEra(events, topUnit);
  const filtered = activeEra
    ? groups.filter((g) => g.era === activeEra)
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
      {/* Central spine line */}
      <View style={styles.spineLine} />

      {filtered.map((group, gi) => (
        <View key={group.era || `ungrouped-${gi}`}>
          {/* Era divider */}
          {group.era ? (
            <View style={styles.eraDivider}>
              <View style={styles.eraPill}>
                <Text
                  variant="label-md"
                  weight="semibold"
                  style={styles.eraText}
                >
                  {group.era}
                </Text>
              </View>
              <View style={styles.eraDot} />
            </View>
          ) : null}

          {/* Add event button at top of era */}
          {isOwner ? (
            <View style={styles.addBtnRow}>
              <Pressable
                onPress={() => onAddEvent(group.era || undefined)}
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
                      calendarSchema={calendarSchema}
                      isOwner={isOwner}
                      onEdit={() => onEditEvent(event)}
                    />
                  ) : null}
                </View>

                {/* Spine connector */}
                <View style={styles.connectorCol}>
                  <View style={styles.connectorLine} />
                  <View style={styles.spineDot} />
                  <View style={styles.connectorLine} />
                </View>

                <View style={[styles.eventSide, isLeft ? styles.eventRight : styles.eventLeft]}>
                  {!isLeft ? (
                    <TimelineEventCard
                      event={event}
                      calendarSchema={calendarSchema}
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
  topUnit: CalendarUnit | null,
): EraGroup[] {
  if (!topUnit) {
    return events.length > 0 ? [{ era: '', events }] : [];
  }

  const orderMap = new Map<string, number>();
  if (topUnit.type === 'ordered_list' && topUnit.options) {
    topUnit.options.forEach((opt, i) => orderMap.set(opt, i));
  }

  const map = new Map<string, TimelineEvent[]>();

  if (topUnit.type === 'ordered_list' && topUnit.options) {
    for (const opt of topUnit.options) {
      map.set(opt, []);
    }
  }

  for (const ev of events) {
    const dv = ev.date_values as Record<string, unknown>;
    const era = String(dv[topUnit.key] ?? '');
    if (!era) {
      const ungrouped = map.get('') ?? [];
      ungrouped.push(ev);
      map.set('', ungrouped);
      continue;
    }
    if (!map.has(era)) map.set(era, []);
    map.get(era)!.push(ev);
  }

  const groups: EraGroup[] = [];
  for (const [era, evs] of map) {
    if (evs.length > 0 || (topUnit.type === 'ordered_list' && topUnit.options?.includes(era))) {
      groups.push({ era, events: evs });
    }
  }

  groups.sort((a, b) => {
    const ai = orderMap.get(a.era) ?? 9999;
    const bi = orderMap.get(b.era) ?? 9999;
    return ai - bi;
  });

  return groups;
}

const SPINE_WIDTH = 2;
const DOT_SIZE = 12;
const CONNECTOR_WIDTH = 40;

const styles = StyleSheet.create({
  root: {
    position: 'relative',
    paddingBottom: spacing.xl,
  },
  spineLine: {
    position: 'absolute',
    left: '50%',
    marginLeft: -SPINE_WIDTH / 2,
    top: 0,
    bottom: 0,
    width: SPINE_WIDTH,
    backgroundColor: colors.outlineVariant + '44',
  },
  eraDivider: {
    alignItems: 'center',
    marginVertical: spacing.lg,
    zIndex: 1,
  },
  eraPill: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs + 2,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.primary + '55',
    backgroundColor: colors.surfaceCanvas,
  },
  eraText: {
    color: colors.primary,
    fontStyle: 'italic',
    fontSize: 15,
  },
  eraDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
    marginTop: spacing.xs,
  },
  addBtnRow: {
    alignItems: 'center',
    marginVertical: spacing.sm,
    zIndex: 1,
  },
  addBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: colors.cosmic + '55',
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.sm,
  },
  eventSide: {
    flex: 1,
  },
  eventLeft: {
    alignItems: 'flex-end',
    paddingRight: spacing.sm,
  },
  eventRight: {
    alignItems: 'flex-start',
    paddingLeft: spacing.sm,
  },
  connectorCol: {
    width: CONNECTOR_WIDTH,
    alignItems: 'center',
    zIndex: 1,
  },
  connectorLine: {
    width: SPINE_WIDTH,
    flex: 1,
    backgroundColor: colors.outlineVariant + '44',
  },
  spineDot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    backgroundColor: colors.cosmic,
    borderWidth: 2,
    borderColor: colors.surfaceCanvas,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing['2xl'],
  },
});
