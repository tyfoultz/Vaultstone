import { Pressable, StyleSheet, View } from 'react-native';
import type { CalendarUnit, TimelineEvent } from '@vaultstone/types';
import { trashTimelineEvent } from '@vaultstone/api';
import { useTimelineEventsStore } from '@vaultstone/store';
import { Icon, Text, colors, spacing } from '@vaultstone/ui';

type Props = {
  event: TimelineEvent;
  calendarSchema: CalendarUnit[];
  isOwner: boolean;
  onEdit: () => void;
};

export function TimelineEventCard({ event, calendarSchema, isOwner, onEdit }: Props) {
  const removeEvent = useTimelineEventsStore((s) => s.removeEvent);

  const dateLabel = formatDateValues(event.date_values, calendarSchema);
  const bodyPreview = event.body_text?.slice(0, 200) ?? '';
  const tags = (event as TimelineEvent & { tags?: string[] }).tags ?? [];

  const handleTrash = async () => {
    await trashTimelineEvent(event.id);
    removeEvent(event.id);
  };

  return (
    <View style={styles.card}>
      {/* Drag handle + menu row */}
      <View style={styles.topRow}>
        {isOwner ? (
          <View style={styles.dragHandle}>
            <Icon name="drag-indicator" size={14} color={colors.outlineVariant + '88'} />
          </View>
        ) : (
          <View style={styles.dragHandle} />
        )}
        {dateLabel ? (
          <Text variant="label-sm" uppercase style={styles.dateLabel}>
            {dateLabel}
          </Text>
        ) : null}
        <View style={{ flex: 1 }} />
        {isOwner ? (
          <Pressable onPress={onEdit} hitSlop={8} style={styles.menuBtn}>
            <Icon name="more-vert" size={16} color={colors.outlineVariant} />
          </Pressable>
        ) : null}
      </View>

      {/* Title */}
      <Pressable onPress={onEdit}>
        <Text
          variant="title-lg"
          weight="bold"
          style={styles.title}
          numberOfLines={2}
        >
          {event.title}
        </Text>
      </Pressable>

      {/* Description */}
      {bodyPreview ? (
        <Text variant="body-sm" tone="secondary" style={styles.body}>
          {bodyPreview}
        </Text>
      ) : null}

      {/* Tags */}
      {tags.length > 0 ? (
        <View style={styles.tagsRow}>
          {tags.map((tag) => (
            <View key={tag} style={styles.tag}>
              <Text variant="label-sm" uppercase weight="bold" style={styles.tagText}>
                {tag}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
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
    if (unit === schema[0]) continue;
    const val = dv[unit.key];
    if (val != null && val !== '') {
      parts.push(`${String(val)}`);
    }
  }
  return parts.join(', ');
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '33',
    padding: spacing.md,
    gap: spacing.sm,
    maxWidth: 380,
    width: '100%',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  dragHandle: {
    width: 16,
    alignItems: 'center',
  },
  dateLabel: {
    color: colors.onSurfaceVariant,
    fontSize: 10,
    letterSpacing: 1.2,
  },
  menuBtn: {
    padding: 2,
  },
  title: {
    color: colors.onSurface,
    fontSize: 20,
    lineHeight: 26,
  },
  body: {
    color: colors.onSurfaceVariant,
    fontSize: 13,
    lineHeight: 19,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: colors.cosmic + '66',
    backgroundColor: colors.cosmicContainer + '44',
  },
  tagText: {
    color: colors.cosmic,
    fontSize: 9,
    letterSpacing: 0.8,
  },
});
