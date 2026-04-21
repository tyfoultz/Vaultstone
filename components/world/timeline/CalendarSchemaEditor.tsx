import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { updatePage } from '@vaultstone/api';
import { usePagesStore } from '@vaultstone/store';
import type { CalendarUnit, CalendarUnitType, EraDefinition, Json, TimelineCalendarSchema, WorldPage } from '@vaultstone/types';
import { Card, GradientButton, Icon, MetaLabel, Text, colors, radius, spacing } from '@vaultstone/ui';

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
  // Draft era names are local-only until the user clicks Save.
  const [draftEraNames, setDraftEraNames] = useState<string[]>(() =>
    parseSchema(page.structured_fields).eras.map((e) => e.label),
  );
  const [erasDirty, setErasDirty] = useState(false);
  const [expandedEra, setExpandedEra] = useState<string | null>(null);
  const updatePageInStore = usePagesStore((s) => s.updatePage);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const parsed = parseSchema(page.structured_fields);
    setSchema(parsed);
    setDraftEraNames(parsed.eras.map((e) => e.label));
    setErasDirty(false);
  }, [page.id, page.structured_fields]);

  const persist = useCallback(
    async (next: TimelineCalendarSchema) => {
      onSaveStateChange?.('saving');
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
    },
    [page.id, page.structured_fields, onSaveStateChange, updatePageInStore],
  );

  const debouncedPersist = useCallback(
    (next: TimelineCalendarSchema) => {
      setSchema(next);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => void persist(next), 800);
    },
    [persist],
  );

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  // ── Era names: local draft, explicit save ──
  const updateDraftEra = (idx: number, value: string) => {
    setDraftEraNames((prev) => prev.map((n, i) => (i === idx ? value : n)));
    setErasDirty(true);
  };
  const addDraftEra = () => {
    setDraftEraNames((prev) => [...prev, '']);
    setErasDirty(true);
  };
  const removeDraftEra = (idx: number) => {
    setDraftEraNames((prev) => prev.filter((_, i) => i !== idx));
    setErasDirty(true);
  };

  const saveEras = async () => {
    const existingMap = new Map(schema.eras.map((e) => [e.label, e]));
    const nextEras: EraDefinition[] = draftEraNames
      .filter((n) => n.trim())
      .map((label) => {
        const existing = existingMap.get(label);
        if (existing) return { ...existing, label, key: slugify(label) || existing.key };
        return { key: slugify(label), label, dateLevels: [] };
      });
    const next: TimelineCalendarSchema = { eras: nextEras };
    setSchema(next);
    setErasDirty(false);
    await persist(next);
    if (nextEras.length > 0 && !expandedEra) {
      setExpandedEra(nextEras[0].key);
    }
  };

  // ── Date level CRUD (debounced auto-save) ──
  const addDateLevel = (eraIdx: number) => {
    const next: TimelineCalendarSchema = {
      eras: schema.eras.map((e, i) => i === eraIdx ? {
        ...e,
        dateLevels: [...e.dateLevels, { key: `level_${e.dateLevels.length}`, label: '', type: 'number' as CalendarUnitType }],
      } : e),
    };
    debouncedPersist(next);
  };

  const updateDateLevel = (eraIdx: number, levelIdx: number, patch: Partial<CalendarUnit>) => {
    const next: TimelineCalendarSchema = {
      eras: schema.eras.map((e, i) => {
        if (i !== eraIdx) return e;
        const levels = e.dateLevels.map((l, j) => {
          if (j !== levelIdx) return l;
          const updated = { ...l, ...patch };
          if (patch.label !== undefined) updated.key = slugify(patch.label) || l.key;
          if (updated.type !== 'ordered_list') delete updated.options;
          return updated;
        });
        return { ...e, dateLevels: levels };
      }),
    };
    debouncedPersist(next);
  };

  const removeDateLevel = (eraIdx: number, levelIdx: number) => {
    const next: TimelineCalendarSchema = {
      eras: schema.eras.map((e, i) => i === eraIdx ? {
        ...e, dateLevels: e.dateLevels.filter((_, j) => j !== levelIdx),
      } : e),
    };
    debouncedPersist(next);
  };

  const addLevelOption = (eraIdx: number, levelIdx: number) => {
    const level = schema.eras[eraIdx].dateLevels[levelIdx];
    updateDateLevel(eraIdx, levelIdx, { options: [...(level.options ?? []), ''] });
  };
  const updateLevelOption = (eraIdx: number, levelIdx: number, optIdx: number, value: string) => {
    const level = schema.eras[eraIdx].dateLevels[levelIdx];
    const opts = [...(level.options ?? [])];
    opts[optIdx] = value;
    updateDateLevel(eraIdx, levelIdx, { options: opts });
  };
  const removeLevelOption = (eraIdx: number, levelIdx: number, optIdx: number) => {
    const level = schema.eras[eraIdx].dateLevels[levelIdx];
    updateDateLevel(eraIdx, levelIdx, { options: (level.options ?? []).filter((_, i) => i !== optIdx) });
  };

  const savedEras = schema.eras;

  return (
    <Card tier="container" padding="md" style={styles.root}>
      {/* ── Step 1: Era names (local draft) ── */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Icon name="auto-awesome" size={16} color={colors.primary} />
          <Text variant="label-lg" weight="semibold" style={{ color: colors.primary }}>
            Eras & Phases
          </Text>
        </View>

        <View style={styles.eraList}>
          {draftEraNames.map((name, idx) => (
            <View key={idx} style={styles.eraRow}>
              <Text variant="label-sm" tone="muted" style={styles.eraNum}>{idx + 1}</Text>
              <TextInput
                style={styles.eraInput}
                value={name}
                onChangeText={(text) => updateDraftEra(idx, text)}
                placeholder={`Era ${idx + 1} (e.g. Age of Fire)`}
                placeholderTextColor={colors.outlineVariant}
              />
              <Pressable onPress={() => removeDraftEra(idx)} hitSlop={8}>
                <Icon name="close" size={14} color={colors.outlineVariant} />
              </Pressable>
            </View>
          ))}
          <View style={styles.eraActions}>
            <Pressable onPress={addDraftEra} style={styles.addBtn}>
              <Icon name="add" size={14} color={colors.primary} />
              <Text variant="label-sm" style={{ color: colors.primary }}>
                {draftEraNames.length === 0 ? 'Add your first era' : 'Add era'}
              </Text>
            </Pressable>
            {erasDirty ? (
              <GradientButton label="Save Eras" onPress={saveEras} />
            ) : null}
          </View>
        </View>
      </View>

      {/* ── Step 2: Date levels per era (only shown for saved eras) ── */}
      {savedEras.length > 0 ? (
        <View style={[styles.section, { marginTop: spacing.md }]}>
          <View style={styles.sectionHeader}>
            <Icon name="event" size={16} color={colors.cosmic} />
            <Text variant="label-lg" weight="semibold" style={{ color: colors.cosmic }}>
              Date Structure
            </Text>
            <MetaLabel size="sm" tone="muted" style={{ marginLeft: 'auto' }}>
              Configure dates for each era
            </MetaLabel>
          </View>

          {savedEras.map((era, eraIdx) => {
            if (!era.label) return null;
            const isExpanded = expandedEra === era.key;
            return (
              <View key={era.key} style={styles.eraDateBlock}>
                <Pressable
                  onPress={() => setExpandedEra(isExpanded ? null : era.key)}
                  style={styles.eraDateHeader}
                >
                  <Text variant="label-md" weight="semibold" style={{ color: colors.onSurface, flex: 1 }}>
                    {era.label}
                  </Text>
                  <Text variant="label-sm" style={{ color: colors.cosmic }}>
                    {era.dateLevels.length > 0
                      ? era.dateLevels.map((l) => l.label || l.key).join(' › ')
                      : 'No dates configured'}
                  </Text>
                  <Icon
                    name={isExpanded ? 'expand-less' : 'expand-more'}
                    size={16}
                    color={colors.cosmic}
                  />
                </Pressable>

                {isExpanded ? (
                  <View style={styles.dateLevelsPanel}>
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
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { eras: [] };
  const s = raw as TimelineCalendarSchema;
  if (Array.isArray(s.eras)) return s;
  return { eras: [] };
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm },
  section: { gap: spacing.sm },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  eraList: { gap: spacing.xs, marginTop: spacing.xs },
  eraRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  eraNum: { width: 20, textAlign: 'center', color: colors.outlineVariant, fontSize: 12 },
  eraInput: {
    flex: 1, color: colors.onSurface, fontSize: 14,
    paddingVertical: 8, paddingHorizontal: spacing.sm,
    borderWidth: 1, borderColor: colors.outlineVariant + '55',
    borderRadius: radius.lg, backgroundColor: colors.surfaceCanvas,
  },
  eraActions: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: spacing.xs,
  },
  // -- Date structure per era --
  eraDateBlock: {
    borderBottomWidth: 1, borderBottomColor: colors.outlineVariant + '22',
  },
  eraDateHeader: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  dateLevelsPanel: {
    marginLeft: spacing.md, gap: spacing.sm,
    paddingLeft: spacing.md, paddingBottom: spacing.sm,
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
});
