import { Pressable, StyleSheet, View } from 'react-native';
import type { CalendarUnit, TimelineEvent } from '@vaultstone/types';
import { trashTimelineEvent } from '@vaultstone/api';
import { useTimelineEventsStore } from '@vaultstone/store';
import { Card, Icon, MetaLabel, Text, VisibilityBadge, colors, radius, spacing } from '@vaultstone/ui';

type Props = {
  event: TimelineEvent;
  calendarSchema: CalendarUnit[];
  isOwner: boolean;
  onEdit: () => void;
};

export function TimelineEventCard({ event, calendarSchema, isOwner, onEdit }: Props) {
  const removeEvent = useTimelineEventsStore((s) => s.removeEvent);

  const dateLabel = formatDateValues(event.date_values, calendarSchema);
  const bodyPreview = event.body_text?.slice(0, 120) ?? '';

  const handleTrash = async () => {
    await trashTimelineEvent(event.id);
    removeEvent(event.id);
  };

  return (
    <Card tier="container" padding="md" style={styles.card}>
      <View style={styles.header}>
        <View style={styles.dot} />
        <View style={styles.titleBlock}>
          <Text variant="label-lg" weight="semibold" numberOfLines={1}>
            {event.title}
          </Text>
          {dateLabel ? (
            <MetaLabel size="sm" tone="muted">
              {dateLabel}
            </MetaLabel>
          ) : null}
        </View>
        <View style={styles.actions}>
          <VisibilityBadge visibility={event.visible_to_players ? 'player' : 'gm'} />
          {isOwner ? (
            <>
              <Pressable onPress={onEdit} hitSlop={8}>
                <Icon name="edit" size={14} color={colors.onSurfaceVariant} />
              </Pressable>
              <Pressable onPress={handleTrash} hitSlop={8}>
                <Icon name="delete-outline" size={14} color={colors.outlineVariant} />
              </Pressable>
            </>
          ) : null}
        </View>
      </View>

      {bodyPreview ? (
        <Text variant="body-sm" tone="secondary" numberOfLines={3} style={styles.body}>
          {bodyPreview}
        </Text>
      ) : null}

      {event.source_session_id ? (
        <View style={styles.sessionBadge}>
          <Icon name="history" size={12} color={colors.cosmic} />
          <Text variant="label-sm" style={{ color: colors.cosmic }}>
            From session recap
          </Text>
        </View>
      ) : null}
    </Card>
  );
}

function formatDateValues(
  dateValues: unknown,
  schema: CalendarUnit[],
): string {
  if (!dateValues || typeof dateValues !== 'object') return '';
  const dv = dateValues as Record<string, unknown>;
  const parts: string[] = [];
  for (const unit of schema) {
    const val = dv[unit.key];
    if (val != null && val !== '') {
      parts.push(`${String(val)}`);
    }
  }
  return parts.join(' · ');
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: colors.cosmic + '66',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.cosmic,
  },
  titleBlock: {
    flex: 1,
    gap: 2,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  body: {
    marginLeft: 8 + spacing.sm,
  },
  sessionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 8 + spacing.sm,
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: radius.DEFAULT,
    backgroundColor: colors.cosmicContainer + '33',
    alignSelf: 'flex-start',
  },
});
