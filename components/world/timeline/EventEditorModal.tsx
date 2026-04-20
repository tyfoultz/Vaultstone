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
  onClose: () => void;
};

export function EventEditorModal({
  worldId,
  timelinePageId,
  calendarSchema,
  event,
  onClose,
}: Props) {
  const isEdit = event !== null;
  const [title, setTitle] = useState(event?.title ?? '');
  const [dateValues, setDateValues] = useState<Record<string, string>>(() => {
    if (!event?.date_values || typeof event.date_values !== 'object') return {};
    return event.date_values as Record<string, string>;
  });
  const [visibleToPlayers, setVisibleToPlayers] = useState(event?.visible_to_players ?? true);
  const [saving, setSaving] = useState(false);

  const addEvent = useTimelineEventsStore((s) => s.addEvent);
  const updateEvent = useTimelineEventsStore((s) => s.updateEvent);
  const removeEvent = useTimelineEventsStore((s) => s.removeEvent);

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);

    if (isEdit) {
      const { data } = await updateTimelineEvent(event.id, {
        title: title.trim(),
        date_values: dateValues as Json,
        visible_to_players: visibleToPlayers,
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
            <View style={styles.field}>
              <Text variant="label-md" tone="secondary">
                Title
              </Text>
              <TextInput
                style={styles.input}
                value={title}
                onChangeText={setTitle}
                placeholder="Event title"
                placeholderTextColor={colors.outlineVariant}
              />
            </View>

            {calendarSchema.length > 0 ? (
              <View style={styles.field}>
                <Text variant="label-md" tone="secondary">
                  Date
                </Text>
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
              label={saving ? 'Saving…' : isEdit ? 'Save' : 'Add'}
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
    maxHeight: '80%',
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
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
