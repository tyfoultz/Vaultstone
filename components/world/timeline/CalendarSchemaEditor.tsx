import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { updatePage } from '@vaultstone/api';
import { usePagesStore } from '@vaultstone/store';
import type { CalendarSchema, CalendarUnit, CalendarUnitType, Json, WorldPage } from '@vaultstone/types';
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
  const [schema, setSchema] = useState<CalendarSchema>(
    () => parseSchema(page.structured_fields),
  );
  const updatePageInStore = usePagesStore((s) => s.updatePage);
  const dirtyRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setSchema(parseSchema(page.structured_fields));
  }, [page.id, page.structured_fields]);

  const save = useCallback(
    (next: CalendarSchema) => {
      dirtyRef.current = true;
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
        dirtyRef.current = false;
      }, 800);
    },
    [page.id, page.structured_fields, onSaveStateChange, updatePageInStore],
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // --- Derived state ---
  const eraUnit = schema.length > 0 && schema[0].type === 'ordered_list' ? schema[0] : null;
  const dateLevels = eraUnit ? schema.slice(1) : schema;
  const eras = eraUnit?.options ?? [];

  // --- Era management ---
  const setEras = (nextEras: string[]) => {
    const unit: CalendarUnit = {
      key: eraUnit?.key ?? 'era',
      label: eraUnit?.label ?? 'Era',
      type: 'ordered_list',
      options: nextEras,
    };
    save([unit, ...dateLevels]);
  };

  const addEra = () => setEras([...eras, '']);
  const updateEra = (idx: number, value: string) => {
    const next = [...eras];
    next[idx] = value;
    setEras(next);
  };
  const removeEra = (idx: number) => setEras(eras.filter((_, i) => i !== idx));

  const initEras = () => {
    const unit: CalendarUnit = {
      key: 'era',
      label: 'Era',
      type: 'ordered_list',
      options: [''],
    };
    save([unit, ...dateLevels]);
  };

  // --- Date level management ---
  const addDateLevel = () => {
    const base = eraUnit ? [eraUnit] : [];
    save([...base, ...dateLevels, { key: `level_${dateLevels.length}`, label: '', type: 'number' }]);
  };

  const updateDateLevel = (idx: number, patch: Partial<CalendarUnit>) => {
    const next = dateLevels.map((u, i) => {
      if (i !== idx) return u;
      const updated = { ...u, ...patch };
      if (patch.label !== undefined) {
        updated.key = slugify(patch.label);
      }
      if (updated.type !== 'ordered_list') {
        delete updated.options;
      }
      return updated;
    });
    const base = eraUnit ? [eraUnit] : [];
    save([...base, ...next]);
  };

  const removeDateLevel = (idx: number) => {
    const next = dateLevels.filter((_, i) => i !== idx);
    const base = eraUnit ? [eraUnit] : [];
    save([...base, ...next]);
  };

  const addLevelOption = (levelIdx: number) => {
    const level = dateLevels[levelIdx];
    updateDateLevel(levelIdx, { options: [...(level.options ?? []), ''] });
  };
  const updateLevelOption = (levelIdx: number, optIdx: number, value: string) => {
    const level = dateLevels[levelIdx];
    const opts = [...(level.options ?? [])];
    opts[optIdx] = value;
    updateDateLevel(levelIdx, { options: opts });
  };
  const removeLevelOption = (levelIdx: number, optIdx: number) => {
    const level = dateLevels[levelIdx];
    updateDateLevel(levelIdx, { options: (level.options ?? []).filter((_, i) => i !== optIdx) });
  };

  return (
    <Card tier="container" padding="md" style={styles.root}>
      {/* ── Section 1: Eras / Phases ── */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Icon name="auto-awesome" size={16} color={colors.primary} />
          <Text variant="label-lg" weight="semibold" style={{ color: colors.primary }}>
            Eras & Phases
          </Text>
          <MetaLabel size="sm" tone="muted" style={{ marginLeft: 'auto' }}>
            Events are grouped under these
          </MetaLabel>
        </View>

        {eraUnit ? (
          <View style={styles.eraList}>
            {eras.map((era, idx) => (
              <View key={idx} style={styles.eraRow}>
                <Text variant="label-sm" tone="muted" style={styles.eraNum}>
                  {idx + 1}
                </Text>
                <TextInput
                  style={styles.eraInput}
                  value={era}
                  onChangeText={(text) => updateEra(idx, text)}
                  placeholder={`Era ${idx + 1} (e.g. Age of Fire)`}
                  placeholderTextColor={colors.outlineVariant}
                />
                <Pressable onPress={() => removeEra(idx)} hitSlop={8}>
                  <Icon name="close" size={14} color={colors.outlineVariant} />
                </Pressable>
              </View>
            ))}
            <Pressable onPress={addEra} style={styles.addBtn}>
              <Icon name="add" size={14} color={colors.primary} />
              <Text variant="label-sm" style={{ color: colors.primary }}>
                Add era
              </Text>
            </Pressable>
          </View>
        ) : (
          <Pressable onPress={initEras} style={styles.setupBtn}>
            <Icon name="add" size={16} color={colors.primary} />
            <Text variant="label-md" style={{ color: colors.primary }}>
              Define your eras
            </Text>
          </Pressable>
        )}
      </View>

      {/* ── Section 2: Date Levels ── */}
      <View style={[styles.section, { marginTop: spacing.md }]}>
        <View style={styles.sectionHeader}>
          <Icon name="event" size={16} color={colors.cosmic} />
          <Text variant="label-lg" weight="semibold" style={{ color: colors.cosmic }}>
            Date Levels
          </Text>
          <MetaLabel size="sm" tone="muted" style={{ marginLeft: 'auto' }}>
            Optional — adds finer dating within eras
          </MetaLabel>
        </View>

        {dateLevels.length > 0 ? (
          <View style={styles.levelList}>
            {dateLevels.map((level, idx) => (
              <View key={idx} style={styles.levelRow}>
                <View style={styles.levelMain}>
                  <TextInput
                    style={styles.levelLabelInput}
                    value={level.label}
                    onChangeText={(text) => updateDateLevel(idx, { label: text })}
                    placeholder="Label (e.g. Year, Season)"
                    placeholderTextColor={colors.outlineVariant}
                  />
                  <View style={styles.typeSelector}>
                    {DATE_LEVEL_TYPES.map((opt) => (
                      <Pressable
                        key={opt.value}
                        onPress={() => updateDateLevel(idx, { type: opt.value })}
                        style={[
                          styles.typeChip,
                          level.type === opt.value && styles.typeChipActive,
                        ]}
                      >
                        <Text
                          variant="label-sm"
                          style={{
                            color: level.type === opt.value ? colors.cosmic : colors.onSurfaceVariant,
                          }}
                        >
                          {opt.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <Pressable onPress={() => removeDateLevel(idx)} hitSlop={8}>
                    <Icon name="close" size={14} color={colors.outlineVariant} />
                  </Pressable>
                </View>

                {level.type === 'ordered_list' ? (
                  <View style={styles.optionsList}>
                    {(level.options ?? []).map((opt, optIdx) => (
                      <View key={optIdx} style={styles.optionRow}>
                        <Text variant="label-sm" tone="muted" style={{ width: 18 }}>
                          {optIdx + 1}.
                        </Text>
                        <TextInput
                          style={styles.optionInput}
                          value={opt}
                          onChangeText={(text) => updateLevelOption(idx, optIdx, text)}
                          placeholder="Option value"
                          placeholderTextColor={colors.outlineVariant}
                        />
                        <Pressable onPress={() => removeLevelOption(idx, optIdx)} hitSlop={8}>
                          <Icon name="close" size={14} color={colors.outlineVariant} />
                        </Pressable>
                      </View>
                    ))}
                    <Pressable onPress={() => addLevelOption(idx)} style={styles.addBtn}>
                      <Icon name="add" size={14} color={colors.cosmic} />
                      <Text variant="label-sm" style={{ color: colors.cosmic }}>
                        Add option
                      </Text>
                    </Pressable>
                  </View>
                ) : null}

                {level.type === 'number' ? (
                  <MetaLabel size="sm" tone="muted" style={{ marginLeft: spacing.lg }}>
                    Numeric — events sorted by value (e.g. Year 1, Year 42)
                  </MetaLabel>
                ) : level.type === 'text' ? (
                  <MetaLabel size="sm" tone="muted" style={{ marginLeft: spacing.lg }}>
                    Free text — for non-numeric dates (e.g. "The Long Night")
                  </MetaLabel>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}

        <Pressable onPress={addDateLevel} style={styles.addBtn}>
          <Icon name="add" size={14} color={colors.cosmic} />
          <Text variant="label-sm" style={{ color: colors.cosmic }}>
            Add date level
          </Text>
        </Pressable>
      </View>
    </Card>
  );
}

const DATE_LEVEL_TYPES: { value: CalendarUnitType; label: string; hint: string }[] = [
  { value: 'number', label: 'Number', hint: 'Numeric year or day' },
  { value: 'ordered_list', label: 'List', hint: 'Fixed options in order' },
  { value: 'text', label: 'Text', hint: 'Free-form label' },
];

function parseSchema(fields: unknown): CalendarSchema {
  if (!fields || typeof fields !== 'object') return [];
  const obj = fields as Record<string, unknown>;
  const raw = obj.__calendar_schema;
  if (!Array.isArray(raw)) return [];
  return raw as CalendarSchema;
}

const styles = StyleSheet.create({
  root: {
    gap: 0,
  },
  section: {
    gap: spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  // -- Eras --
  eraList: {
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  eraRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  eraNum: {
    width: 20,
    textAlign: 'center',
    color: colors.outlineVariant,
    fontSize: 12,
  },
  eraInput: {
    flex: 1,
    color: colors.onSurface,
    fontSize: 14,
    paddingVertical: 8,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '55',
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceCanvas,
  },
  setupBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.primary + '44',
    marginTop: spacing.xs,
  },
  // -- Date levels --
  levelList: {
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  levelRow: {
    gap: spacing.xs,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant + '22',
  },
  levelMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  levelLabelInput: {
    flex: 1,
    color: colors.onSurface,
    fontSize: 14,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '55',
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceCanvas,
  },
  typeSelector: {
    flexDirection: 'row',
    gap: 4,
  },
  typeChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.DEFAULT,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '44',
  },
  typeChipActive: {
    borderColor: colors.cosmic,
    backgroundColor: colors.cosmicContainer + '33',
  },
  optionsList: {
    marginLeft: spacing.lg,
    gap: spacing.xs,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  optionInput: {
    flex: 1,
    color: colors.onSurface,
    fontSize: 13,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '44',
    borderRadius: radius.DEFAULT,
    backgroundColor: colors.surfaceCanvas,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: spacing.xs,
  },
});
