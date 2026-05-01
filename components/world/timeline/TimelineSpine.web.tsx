import { useCallback, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { updateTimelineEvent } from '@vaultstone/api';
import { useTimelineEventsStore } from '@vaultstone/store';
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

const DND_TYPE = 'TIMELINE_EVENT';
type DragItem = { eventId: string; eraKey: string | null };

function DropGap({ index, eraKey, onReorder }: {
  index: number;
  eraKey: string | null;
  onReorder: (dragEventId: string, targetIndex: number, eraKey: string | null) => void;
}) {
  const [{ isOver, canDrop }, drop] = useDrop({
    accept: DND_TYPE,
    canDrop: (item: DragItem) => item.eraKey === eraKey,
    drop: (item: DragItem) => {
      onReorder(item.eventId, index, eraKey);
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
      canDrop: monitor.canDrop(),
    }),
  });

  const active = isOver && canDrop;

  return (
    <div ref={drop as any} style={{ position: 'relative', zIndex: 2 }}>
      <View style={[styles.dropGap, active && styles.dropGapActive]}>
        <View style={styles.dropGapCenter}>
          {active ? (
            <View style={styles.dropGapDot} />
          ) : (
            <View style={styles.dropGapLine} />
          )}
        </View>
      </View>
    </div>
  );
}

function DraggableEventRow({
  event,
  era,
  index,
  eraKey,
  isOwner,
  onEditEvent,
}: {
  event: TimelineEvent;
  era: EraDefinition | null;
  index: number;
  eraKey: string | null;
  isOwner: boolean;
  onEditEvent: (event: TimelineEvent) => void;
}) {
  const isLeft = index % 2 === 0;

  const [{ isDragging }, drag, preview] = useDrag({
    type: DND_TYPE,
    item: (): DragItem => ({ eventId: event.id, eraKey }),
    canDrag: isOwner,
    collect: (monitor) => ({ isDragging: monitor.isDragging() }),
  });

  return (
    <div ref={preview as any} style={{ opacity: isDragging ? 0.3 : 1 }}>
      <View style={styles.eventRow}>
        <View style={[styles.eventSide, isLeft ? styles.eventLeft : styles.eventRight]}>
          {isLeft ? (
            <TimelineEventCard
              event={event}
              era={era}
              isOwner={isOwner}
              onEdit={() => onEditEvent(event)}
              dragRef={isOwner ? drag : undefined}
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
              era={era}
              isOwner={isOwner}
              onEdit={() => onEditEvent(event)}
              dragRef={isOwner ? drag : undefined}
            />
          ) : null}
        </View>
      </View>
    </div>
  );
}

function TimelineSpineInner({
  events,
  schema,
  isOwner,
  activeEra,
  onEditEvent,
  onAddEvent,
}: Props) {
  const setEventsForPage = useTimelineEventsStore((s) => s.setEventsForPage);
  const groups = groupByEra(events, schema);
  const filtered = activeEra
    ? groups.filter((g) => g.era?.key === activeEra)
    : groups;

  const handleReorder = useCallback(
    (dragEventId: string, targetIndex: number, eraKey: string | null) => {
      const group = filtered.find((g) => (g.era?.key ?? null) === eraKey);
      if (!group) return;

      const dragIdx = group.events.findIndex((e) => e.id === dragEventId);
      if (dragIdx < 0) return;

      const reordered = [...group.events];
      const [moved] = reordered.splice(dragIdx, 1);
      const insertAt = dragIdx < targetIndex ? targetIndex - 1 : targetIndex;
      reordered.splice(insertAt, 0, moved);

      const timelinePageId = events[0]?.timeline_page_id;
      if (!timelinePageId) return;

      const updatedEvents = events.map((ev) => {
        const newIdx = reordered.findIndex((r) => r.id === ev.id);
        if (newIdx >= 0 && ev.tie_breaker !== newIdx) {
          return { ...ev, tie_breaker: newIdx };
        }
        return ev;
      });

      setEventsForPage(timelinePageId, updatedEvents);

      for (let i = 0; i < reordered.length; i++) {
        const ev = reordered[i];
        if (ev.tie_breaker !== i) {
          void updateTimelineEvent(ev.id, { tie_breaker: i });
        }
      }
    },
    [events, filtered, setEventsForPage],
  );

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

          {/* Drop zone before first event */}
          {isOwner && group.events.length > 0 ? (
            <DropGap index={0} eraKey={group.era?.key ?? null} onReorder={handleReorder} />
          ) : null}

          {group.events.map((event, idx) => (
            <View key={event.id}>
              <DraggableEventRow
                event={event}
                era={group.era}
                index={idx}
                eraKey={group.era?.key ?? null}
                isOwner={isOwner}
                onEditEvent={onEditEvent}
              />
              {/* Drop zone after each event */}
              {isOwner ? (
                <DropGap index={idx + 1} eraKey={group.era?.key ?? null} onReorder={handleReorder} />
              ) : null}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

export function TimelineSpine(props: Props) {
  return (
    <DndProvider backend={HTML5Backend}>
      <TimelineSpineInner {...props} />
    </DndProvider>
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
  eventRow: { flexDirection: 'row', alignItems: 'center', marginVertical: spacing.xs },
  eventSide: { flex: 1 },
  eventLeft: { alignItems: 'flex-end', paddingRight: spacing.sm },
  eventRight: { alignItems: 'flex-start', paddingLeft: spacing.sm },
  connectorCol: { width: CONNECTOR_WIDTH, alignItems: 'center', zIndex: 1 },
  connectorLine: { width: SPINE_WIDTH, flex: 1, backgroundColor: colors.outlineVariant + '44' },
  spineDot: {
    width: DOT_SIZE, height: DOT_SIZE, borderRadius: DOT_SIZE / 2,
    backgroundColor: colors.cosmic, borderWidth: 2, borderColor: colors.surfaceCanvas,
  },
  dropGap: {
    height: 20,
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: -2,
  },
  dropGapActive: {
    height: 28,
  },
  dropGapCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropGapLine: {
    width: SPINE_WIDTH,
    height: '100%',
    backgroundColor: colors.outlineVariant + '44',
  },
  dropGapDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.surfaceCanvas,
  },
  emptyState: { alignItems: 'center', paddingVertical: spacing['2xl'] },
});
