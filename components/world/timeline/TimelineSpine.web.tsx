import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { updateTimelineEvent } from '@vaultstone/api';
import { useTimelineEventsStore } from '@vaultstone/store';
import type { EraDefinition, TimelineCalendarSchema, TimelineEvent } from '@vaultstone/types';
import { Icon, Text, colors, spacing, useBreakpoint } from '@vaultstone/ui';

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
  const { isMobile } = useBreakpoint();
  const groups = groupByEra(events, schema);
  const filtered = activeEra
    ? groups.filter((g) => g.era?.key === activeEra)
    : groups;

  const updateStoreEvent = useTimelineEventsStore((s) => s.updateEvent);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; position: 'before' | 'after' } | null>(null);

  const handleDragStart = useCallback((e: React.DragEvent, eventId: string) => {
    setDragId(eventId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', eventId);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, targetId: string) => {
    if (!dragId || dragId === targetId) { setDropTarget(null); return; }
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    setDropTarget({ id: targetId, position: e.clientY < midY ? 'before' : 'after' });
  }, [dragId]);

  const handleDrop = useCallback(
    (e: React.DragEvent, groupEvents: TimelineEvent[]) => {
      e.preventDefault();
      if (!dragId || !dropTarget) return;

      const oldIdx = groupEvents.findIndex((ev) => ev.id === dragId);
      let newIdx = groupEvents.findIndex((ev) => ev.id === dropTarget.id);
      if (oldIdx < 0 || newIdx < 0) return;
      if (dropTarget.position === 'after') newIdx += 1;
      if (oldIdx < newIdx) newIdx -= 1;
      if (oldIdx === newIdx) return;

      const reordered = [...groupEvents];
      const [moved] = reordered.splice(oldIdx, 1);
      reordered.splice(newIdx, 0, moved);

      for (let i = 0; i < reordered.length; i++) {
        const ev = reordered[i];
        if (ev.tie_breaker !== i) {
          updateStoreEvent(ev.id, { tie_breaker: i });
          void updateTimelineEvent(ev.id, { tie_breaker: i });
        }
      }

      setDragId(null);
      setDropTarget(null);
    },
    [dragId, dropTarget, updateStoreEvent],
  );

  const handleDragEnd = useCallback(() => {
    setDragId(null);
    setDropTarget(null);
  }, []);

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

  if (isMobile) {
    return (
      <View style={mStyles.root}>
        {filtered.map((group, gi) => (
          <View key={group.era?.key ?? `ungrouped-${gi}`}>
            {group.era ? (
              <View style={mStyles.eraHeader}>
                <View style={mStyles.eraDiamond}>
                  <Icon name="diamond" size={10} color={colors.primary} family="material-community" />
                </View>
                <Text variant="title-md" family="serif-display" weight="bold" style={{ color: colors.primary, fontStyle: 'italic' }}>
                  {group.era.label}
                </Text>
              </View>
            ) : null}

            {group.events.map((event) => (
              <View key={event.id} style={mStyles.eventRow}>
                <Pressable style={mStyles.eventCard} onPress={() => onEditEvent(event)}>
                  <TimelineEventCard event={event} era={group.era} isOwner={isOwner} onEdit={() => onEditEvent(event)} />
                </Pressable>
                <View style={mStyles.spineCol}>
                  <View style={mStyles.spineLine} />
                  <View style={mStyles.spineNode} />
                  <View style={mStyles.spineLine} />
                </View>
              </View>
            ))}
          </View>
        ))}
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.spineLine} />

      {filtered.map((group, gi) => (
        <View key={group.era?.key ?? `ungrouped-${gi}`}>
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

          {group.events.map((event, idx) => {
            const isLeft = idx % 2 === 0;
            const isDragging = dragId === event.id;
            const isDropBefore = dropTarget?.id === event.id && dropTarget.position === 'before';
            const isDropAfter = dropTarget?.id === event.id && dropTarget.position === 'after';

            return (
              <div
                key={event.id}
                draggable={isOwner}
                onDragStart={(e) => handleDragStart(e as any, event.id)}
                onDragOver={(e) => handleDragOver(e as any, event.id)}
                onDrop={(e) => handleDrop(e as any, group.events)}
                onDragEnd={handleDragEnd}
                style={{ opacity: isDragging ? 0.4 : 1, position: 'relative' }}
              >
                {isDropBefore ? <div style={dropLineStyle} /> : null}
                <View style={styles.eventRow}>
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
                {isDropAfter ? <div style={dropLineStyle} /> : null}
              </div>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const dropLineStyle: React.CSSProperties = {
  height: 3,
  backgroundColor: colors.cosmic,
  borderRadius: 2,
  margin: '2px 0',
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

const mStyles = StyleSheet.create({
  root: {
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.xl,
  },
  eraHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant + '33',
  },
  eraDiamond: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventRow: {
    flexDirection: 'row',
    minHeight: 80,
  },
  eventCard: {
    flex: 1,
    marginBottom: spacing.sm,
  },
  spineCol: {
    width: 32,
    alignItems: 'center',
    marginLeft: spacing.sm,
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
});
