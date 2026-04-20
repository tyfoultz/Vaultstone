import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import {
  createTimelineEvent,
  updateTimelineEvent,
  trashTimelineEvent,
} from '@vaultstone/api';
import { useTimelineEventsStore } from '@vaultstone/store';
import type { CalendarUnit, Json, TimelineEvent } from '@vaultstone/types';
import { Card, GradientButton, GhostButton, Icon, Text, colors, radius, spacing } from '@vaultstone/ui';

type Props = {
  worldId: string;
  timelinePageId: string;
  calendarSchema: CalendarUnit[];
  event: TimelineEvent | null;
  defaultEra?: string;
  onClose: () => void;
};

export function EventEditorModal({
  worldId,
  timelinePageId,
  calendarSchema,
  event,
  defaultEra,
  onClose,
}: Props) {
  const isEdit = event !== null;
  const [title, setTitle] = useState(event?.title ?? '');
  const [dateValues, setDateValues] = useState<Record<string, string>>(() => {
    if (event?.date_values && typeof event.date_values === 'object') {
      return event.date_values as Record<string, string>;
    }
    if (defaultEra && calendarSchema.length > 0) {
      return { [calendarSchema[0].key]: defaultEra };
    }
    return {};
  });
  const [description, setDescription] = useState(() => {
    return event?.body_text ?? '';
  });
  const [tagsText, setTagsText] = useState(() => {
    const t = (event as TimelineEvent & { tags?: string[] })?.tags ?? [];
    return t.join(', ');
  });
  const [visibleToPlayers, setVisibleToPlayers] = useState(event?.visible_to_players ?? true);
  const [saving, setSaving] = useState(false);

  const addEvent = useTimelineEventsStore((s) => s.addEvent);
  const updateEvent = useTimelineEventsStore((s) => s.updateEvent);
  const removeEvent = useTimelineEventsStore((s) => s.removeEvent);

  const parsedTags = tagsText
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);

    const bodyDoc = description.trim()
      ? {
          type: 'doc',
          content: description.split(/\n{2,}/).map((p) => ({
            type: 'paragraph',
            content: p.trim() ? [{ type: 'text', text: p.trim() }] : [],
          })),
        }
      : {};

    if (isEdit) {
      const { data } = await updateTimelineEvent(event.id, {
        title: title.trim(),
        date_values: dateValues as Json,
        visible_to_players: visibleToPlayers,
        body: bodyDoc as Json,
        body_text: description.trim() || null,
        tags: parsedTags,
      });
      if (data) {
        updateEvent(data.id, data as TimelineEvent);
      }
    } else {
      const { data } = await createTimelineEvent({
        timelinePageId,
        worldId,
        title: title.trim(),
        dateValues: dateValues as Json,
        visibleToPlayers,
        body: bodyDoc as Json,
        bodyText: description.trim() || undefined,
        tags: parsedTags,
      });
      if (data) {
        addEvent(data as TimelineEvent);
      }
    }

    setSaving(false);
    onClose();
  };

  const handleDelete = async () => {
    if (!event) return;
    await trashTimelineEvent(event.id);
    removeEvent(event.id);
    onClose();
  };

  const updateDateField = (key: string, value: string) => {
    setDateValues((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Card tier="high" padding="lg" style={styles.modal}>
          <View style={styles.header}>
            <Text variant="label-lg" weight="semibold">
              {isEdit ? 'Edit Event' : 'Add Event'}
            </Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Icon name="close" size={20} color={colors.onSurfaceVariant} />
            </Pressable>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyInner}>
            {/* Title */}
            <View style={styles.field}>
              <Text variant="label-md" tone="secondary">Title</Text>
              <TextInput
                style={styles.input}
                value={title}
                onChangeText={setTitle}
                placeholder="Event title"
                placeholderTextColor={colors.outlineVariant}
              />
            </View>

            {/* Date fields from calendar schema */}
            {calendarSchema.length > 0 ? (
              <View style={styles.field}>
                <Text variant="label-md" tone="secondary">Date</Text>
                <View style={styles.dateFields}>
                  {calendarSchema.map((unit) => (
                    <View key={unit.key} style={styles.dateFieldRow}>
                      <Text variant="label-sm" tone="muted" style={{ width: 80 }}>
                        {unit.label}
                      </Text>
                      {unit.type === 'ordered_list' && unit.options ? (
                        <View style={styles.optionChips}>
                          {unit.options.map((opt) => (
                            <Pressable
                              key={opt}
                              onPress={() => updateDateField(unit.key, opt)}
                              style={[
                                styles.optionChip,
                                dateValues[unit.key] === opt && styles.optionChipActive,
                              ]}
                            >
                              <Text
                                variant="label-sm"
                                style={{
                                  color:
                                    dateValues[unit.key] === opt
                                      ? colors.cosmic
                                      : colors.onSurfaceVariant,
                                }}
                              >
                                {opt}
                              </Text>
                            </Pressable>
                          ))}
                        </View>
                      ) : (
                        <TextInput
                          style={styles.dateInput}
                          value={dateValues[unit.key] ?? ''}
                          onChangeText={(v) => updateDateField(unit.key, v)}
                          placeholder={unit.label}
                          placeholderTextColor={colors.outlineVariant}
                          keyboardType={unit.type === 'number' ? 'numeric' : 'default'}
                        />
                      )}
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {/* Description */}
            <View style={styles.field}>
              <Text variant="label-md" tone="secondary">Description</Text>
              <TextInput
                style={[styles.input, styles.descInput]}
                value={description}
                onChangeText={setDescription}
                placeholder="A short description of this event…"
                placeholderTextColor={colors.outlineVariant}
                multiline
                textAlignVertical="top"
              />
            </View>

            {/* Tags */}
            <View style={styles.field}>
              <Text variant="label-md" tone="secondary">Tags</Text>
              <TextInput
                style={styles.input}
                value={tagsText}
                onChangeText={setTagsText}
                placeholder="Comma-separated tags (e.g. Combat, Founding)"
                placeholderTextColor={colors.outlineVariant}
              />
              {parsedTags.length > 0 ? (
                <View style={styles.tagPreview}>
                  {parsedTags.map((tag) => (
                    <View key={tag} style={styles.tagChip}>
                      <Text variant="label-sm" uppercase weight="bold" style={styles.tagChipText}>
                        {tag}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>

            {/* Visibility */}
            <View style={styles.field}>
              <Pressable
                style={styles.visibilityRow}
                onPress={() => setVisibleToPlayers(!visibleToPlayers)}
              >
                <Icon
                  name={visibleToPlayers ? 'visibility' : 'visibility-off'}
                  size={18}
                  color={visibleToPlayers ? colors.player : colors.gm}
                />
                <Text variant="label-md">
                  {visibleToPlayers ? 'Visible to players' : 'GM only'}
                </Text>
              </Pressable>
            </View>
          </ScrollView>

          <View style={styles.footer}>
            {isEdit ? (
              <GhostButton label="Delete" onPress={handleDelete} />
            ) : (
              <View />
            )}
            <GradientButton
              label={saving ? 'Saving…' : isEdit ? 'Save' : 'Add Event'}
              onPress={handleSave}
              disabled={saving || !title.trim()}
            />
          </View>
        </Card>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  modal: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '85%',
    gap: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  body: {
    flex: 1,
    minHeight: 0,
  },
  bodyInner: {
    gap: spacing.lg,
  },
  field: {
    gap: spacing.xs,
  },
  input: {
    color: colors.onSurface,
    fontSize: 15,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '55',
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceCanvas,
  },
  descInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  dateFields: {
    gap: spacing.sm,
  },
  dateFieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dateInput: {
    flex: 1,
    color: colors.onSurface,
    fontSize: 14,
    paddingVertical: 8,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '44',
    borderRadius: radius.DEFAULT,
    backgroundColor: colors.surfaceCanvas,
  },
  optionChips: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  optionChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.DEFAULT,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '44',
  },
  optionChipActive: {
    borderColor: colors.cosmic,
    backgroundColor: colors.cosmicContainer + '33',
  },
  visibilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  tagPreview: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  tagChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: colors.cosmic + '66',
    backgroundColor: colors.cosmicContainer + '44',
  },
  tagChipText: {
    color: colors.cosmic,
    fontSize: 9,
    letterSpacing: 0.8,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
