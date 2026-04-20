import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { updatePage } from '@vaultstone/api';
import { usePagesStore } from '@vaultstone/store';
import type { CalendarUnit, CalendarUnitType, EraDefinition, Json, TimelineCalendarSchema, WorldPage } from '@vaultstone/types';
import { Card, Icon, MetaLabel, Text, colors, radius, spacing } from '@vaultstone/ui';

function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 32) || 'unit';
}

type Props = {
  page: WorldPage;
  onSaveStateChange?: (state: 'idle' | 'saving' | 'saved' | 'error') => void;
};

export function CalendarSchemaEditor({ page, onSaveStateChange }: Props) {
  const [schema, setSchema] = useState<TimelineCalendarSchema>(
    () => parseSchema(page.structured_fields),
  );
  const [expandedEra, setExpandedEra] = useState<string | null>(null);
  const updatePageInStore = usePagesStore((s) => s.updatePage);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setSchema(parseSchema(page.structured_fields));
  }, [page.id, page.structured_fields]);

  const save = useCallback(
    (next: TimelineCalendarSchema) => {
      setSchema(next);
      onSaveStateChange?.('saving');
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(async () => {
        const fields = {
          ...((page.structured_fields as Record<string, unknown>) ?? {}),
          __calendar_schema: next,
        };
        const { data, error } = await updatePage(page.id, {
          structured_fields: fields as unknown as Json,
        });
        if (error || !data) {
          onSaveStateChange?.('error');
          return;
        }
        updatePageInStore(page.id, { structured_fields: data.structured_fields });
        onSaveStateChange?.('saved');
      }, 800);
    },
    [page.id, page.structured_fields, onSaveStateChange, updatePageInStore],
  );

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  const eras = schema.eras;

  // ── Era CRUD ──
  const addEra = () => {
    const key = `era_${eras.length}`;
    save({ eras: [...eras, { key, label: '', dateLevels: [] }] });
    setExpandedEra(key);
  };

  const updateEraLabel = (idx: number, label: string) => {
    const next = eras.map((e, i) => i === idx ? { ...e, label, key: slugify(label) || e.key } : e);
    save({ eras: next });
  };

  const removeEra = (idx: number) => {
    save({ eras: eras.filter((_, i) => i !== idx) });
  };

  // ── Date level CRUD within an era ──
  const addDateLevel = (eraIdx: number) => {
    const era = eras[eraIdx];
    const next = eras.map((e, i) => i === eraIdx ? {
      ...e,
      dateLevels: [...e.dateLevels, { key: `level_${e.dateLevels.length}`, label: '', type: 'number' as CalendarUnitType }],
    } : e);
    save({ eras: next });
  };

  const updateDateLevel = (eraIdx: number, levelIdx: number, patch: Partial<CalendarUnit>) => {
    const next = eras.map((e, i) => {
      if (i !== eraIdx) return e;
      const levels = e.dateLevels.map((l, j) => {
        if (j !== levelIdx) return l;
        const updated = { ...l, ...patch };
        if (patch.label !== undefined) updated.key = slugify(patch.label) || l.key;
        if (updated.type !== 'ordered_list') delete updated.options;
        return updated;
      });
      return { ...e, dateLevels: levels };
    });
    save({ eras: next });
  };

  const removeDateLevel = (eraIdx: number, levelIdx: number) => {
    const next = eras.map((e, i) => i === eraIdx ? {
      ...e,
      dateLevels: e.dateLevels.filter((_, j) => j !== levelIdx),
    } : e);
    save({ eras: next });
  };

  const addLevelOption = (eraIdx: number, levelIdx: number) => {
    const level = eras[eraIdx].dateLevels[levelIdx];
    updateDateLevel(eraIdx, levelIdx, { options: [...(level.options ?? []), ''] });
  };

  const updateLevelOption = (eraIdx: number, levelIdx: number, optIdx: number, value: string) => {
    const level = eras[eraIdx].dateLevels[levelIdx];
    const opts = [...(level.options ?? [])];
    opts[optIdx] = value;
    updateDateLevel(eraIdx, levelIdx, { options: opts });
  };

  const removeLevelOption = (eraIdx: number, levelIdx: number, optIdx: number) => {
    const level = eras[eraIdx].dateLevels[levelIdx];
    updateDateLevel(eraIdx, levelIdx, { options: (level.options ?? []).filter((_, i) => i !== optIdx) });
  };

  return (
    <Card tier="container" padding="md" style={styles.root}>
      <View style={styles.sectionHeader}>
        <Icon name="auto-awesome" size={16} color={colors.primary} />
        <Text variant="label-lg" weight="semibold" style={{ color: colors.primary }}>
          Eras & Date Structure
        </Text>
      </View>

      {eras.length > 0 ? (
        <View style={styles.eraList}>
          {eras.map((era, eraIdx) => {
            const isExpanded = expandedEra === era.key;
            return (
              <View key={era.key + eraIdx} style={styles.eraBlock}>
                {/* Era header row */}
                <View style={styles.eraRow}>
                  <Text variant="label-sm" tone="muted" style={styles.eraNum}>
                    {eraIdx + 1}
                  </Text>
                  <TextInput
                    style={styles.eraInput}
                    value={era.label}
                    onChangeText={(text) => updateEraLabel(eraIdx, text)}
                    placeholder={`Era ${eraIdx + 1} (e.g. Age of Fire)`}
                    placeholderTextColor={colors.outlineVariant}
                  />
                  <Pressable
                    onPress={() => setExpandedEra(isExpanded ? null : era.key)}
                    style={styles.expandBtn}
                  >
                    <Icon name="event" size={14} color={colors.cosmic} />
                    <Text variant="label-sm" style={{ color: colors.cosmic }}>
                      {era.dateLevels.length > 0 ? `${era.dateLevels.length} level${era.dateLevels.length !== 1 ? 's' : ''}` : 'Dates'}
                    </Text>
                    <Icon
                      name={isExpanded ? 'expand-less' : 'expand-more'}
                      size={14}
                      color={colors.cosmic}
                    />
                  </Pressable>
                  <Pressable onPress={() => removeEra(eraIdx)} hitSlop={8}>
                    <Icon name="close" size={14} color={colors.outlineVariant} />
                  </Pressable>
                </View>

                {/* Expanded: date levels for this era */}
                {isExpanded ? (
                  <View style={styles.dateLevelsPanel}>
                    <MetaLabel size="sm" tone="muted">
                      Date levels for {era.label || `Era ${eraIdx + 1}`} — events in this era will use these fields
                    </MetaLabel>

                    {era.dateLevels.map((level, levelIdx) => (
                      <View key={levelIdx} style={styles.levelRow}>
                        <View style={styles.levelMain}>
                          <TextInput
                            style={styles.levelInput}
                            value={level.label}
                            onChangeText={(text) => updateDateLevel(eraIdx, levelIdx, { label: text })}
                            placeholder="Label (e.g. Year, Season)"
                            placeholderTextColor={colors.outlineVariant}
                          />
                          <View style={styles.typeSelector}>
                            {DATE_LEVEL_TYPES.map((opt) => (
                              <Pressable
                                key={opt.value}
                                onPress={() => updateDateLevel(eraIdx, levelIdx, { type: opt.value })}
                                style={[styles.typeChip, level.type === opt.value && styles.typeChipActive]}
                              >
                                <Text
                                  variant="label-sm"
                                  style={{ color: level.type === opt.value ? colors.cosmic : colors.onSurfaceVariant }}
                                >
                                  {opt.label}
                                </Text>
                              </Pressable>
                            ))}
                          </View>
                          <Pressable onPress={() => removeDateLevel(eraIdx, levelIdx)} hitSlop={8}>
                            <Icon name="close" size={14} color={colors.outlineVariant} />
                          </Pressable>
                        </View>

                        {level.type === 'ordered_list' ? (
                          <View style={styles.optionsList}>
                            {(level.options ?? []).map((opt, optIdx) => (
                              <View key={optIdx} style={styles.optionRow}>
                                <Text variant="label-sm" tone="muted" style={{ width: 18 }}>{optIdx + 1}.</Text>
                                <TextInput
                                  style={styles.optionInput}
                                  value={opt}
                                  onChangeText={(text) => updateLevelOption(eraIdx, levelIdx, optIdx, text)}
                                  placeholder="Option"
                                  placeholderTextColor={colors.outlineVariant}
                                />
                                <Pressable onPress={() => removeLevelOption(eraIdx, levelIdx, optIdx)} hitSlop={8}>
                                  <Icon name="close" size={14} color={colors.outlineVariant} />
                                </Pressable>
                              </View>
                            ))}
                            <Pressable onPress={() => addLevelOption(eraIdx, levelIdx)} style={styles.addBtn}>
                              <Icon name="add" size={12} color={colors.cosmic} />
                              <Text variant="label-sm" style={{ color: colors.cosmic }}>Add option</Text>
                            </Pressable>
                          </View>
                        ) : null}
                      </View>
                    ))}

                    <Pressable onPress={() => addDateLevel(eraIdx)} style={styles.addBtn}>
                      <Icon name="add" size={14} color={colors.cosmic} />
                      <Text variant="label-sm" style={{ color: colors.cosmic }}>Add date level</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}

      <Pressable onPress={addEra} style={styles.addEraBtn}>
        <Icon name="add" size={16} color={colors.primary} />
        <Text variant="label-md" style={{ color: colors.primary }}>
          {eras.length === 0 ? 'Define your first era' : 'Add era'}
        </Text>
      </Pressable>
    </Card>
  );
}

const DATE_LEVEL_TYPES: { value: CalendarUnitType; label: string }[] = [
  { value: 'number', label: 'Number' },
  { value: 'ordered_list', label: 'List' },
  { value: 'text', label: 'Text' },
];

function parseSchema(fields: unknown): TimelineCalendarSchema {
  if (!fields || typeof fields !== 'object') return { eras: [] };
  const obj = fields as Record<string, unknown>;
  const raw = obj.__calendar_schema;
  if (!raw || typeof raw !== 'object') return { eras: [] };
  if (Array.isArray(raw)) return { eras: [] };
  const s = raw as TimelineCalendarSchema;
  if (Array.isArray(s.eras)) return s;
  return { eras: [] };
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  eraList: { gap: 0 },
  eraBlock: {
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant + '22',
    paddingVertical: spacing.sm,
  },
  eraRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  eraNum: { width: 20, textAlign: 'center', color: colors.outlineVariant, fontSize: 12 },
  eraInput: {
    flex: 1, color: colors.onSurface, fontSize: 14,
    paddingVertical: 8, paddingHorizontal: spacing.sm,
    borderWidth: 1, borderColor: colors.outlineVariant + '55',
    borderRadius: radius.lg, backgroundColor: colors.surfaceCanvas,
  },
  expandBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
    borderRadius: radius.lg, borderWidth: 1, borderColor: colors.cosmic + '44',
  },
  dateLevelsPanel: {
    marginLeft: 20 + spacing.sm,
    marginTop: spacing.sm, gap: spacing.sm,
    paddingLeft: spacing.md,
    borderLeftWidth: 2, borderLeftColor: colors.cosmic + '33',
  },
  levelRow: { gap: spacing.xs },
  levelMain: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  levelInput: {
    flex: 1, color: colors.onSurface, fontSize: 13,
    paddingVertical: 6, paddingHorizontal: spacing.sm,
    borderWidth: 1, borderColor: colors.outlineVariant + '44',
    borderRadius: radius.lg, backgroundColor: colors.surfaceCanvas,
  },
  typeSelector: { flexDirection: 'row', gap: 4 },
  typeChip: {
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: radius.DEFAULT, borderWidth: 1, borderColor: colors.outlineVariant + '44',
  },
  typeChipActive: { borderColor: colors.cosmic, backgroundColor: colors.cosmicContainer + '33' },
  optionsList: { marginLeft: spacing.lg, gap: spacing.xs },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  optionInput: {
    flex: 1, color: colors.onSurface, fontSize: 13,
    paddingVertical: 4, paddingHorizontal: spacing.sm,
    borderWidth: 1, borderColor: colors.outlineVariant + '44',
    borderRadius: radius.DEFAULT, backgroundColor: colors.surfaceCanvas,
  },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: spacing.xs },
  addEraBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
    borderRadius: radius.lg, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.primary + '44',
  },
});
