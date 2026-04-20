import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { updatePage } from '@vaultstone/api';
import { usePagesStore } from '@vaultstone/store';
import type { CalendarSchema, CalendarUnit, CalendarUnitType, Json, WorldPage } from '@vaultstone/types';
import { Card, Icon, MetaLabel, Text, colors, radius, spacing } from '@vaultstone/ui';

const UNIT_TYPE_OPTIONS: { value: CalendarUnitType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'ordered_list', label: 'Ordered list' },
];

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
  const [collapsed, setCollapsed] = useState(true);
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

  const addUnit = () => {
    const next: CalendarSchema = [
      ...schema,
      { key: `unit_${schema.length}`, label: '', type: 'text' },
    ];
    save(next);
  };

  const removeUnit = (idx: number) => {
    save(schema.filter((_, i) => i !== idx));
  };

  const updateUnit = (idx: number, patch: Partial<CalendarUnit>) => {
    const next = schema.map((u, i) => {
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
    save(next);
  };

  const addOption = (unitIdx: number) => {
    const unit = schema[unitIdx];
    const opts = [...(unit.options ?? []), ''];
    updateUnit(unitIdx, { options: opts });
  };

  const updateOption = (unitIdx: number, optIdx: number, value: string) => {
    const unit = schema[unitIdx];
    const opts = [...(unit.options ?? [])];
    opts[optIdx] = value;
    updateUnit(unitIdx, { options: opts });
  };

  const removeOption = (unitIdx: number, optIdx: number) => {
    const unit = schema[unitIdx];
    const opts = (unit.options ?? []).filter((_, i) => i !== optIdx);
    updateUnit(unitIdx, { options: opts });
  };

  // Auto-expand when schema is empty (first-time setup)
  const isEmpty = schema.length === 0;
  const isOpen = isEmpty || !collapsed;

  return (
    <Card tier="container" padding="md" style={styles.root}>
      <Pressable
        style={styles.header}
        onPress={() => setCollapsed(!collapsed)}
        accessibilityRole="button"
        accessibilityLabel={isOpen ? 'Collapse calendar schema' : 'Expand calendar schema'}
      >
        <Icon
          name={isOpen ? 'expand-less' : 'expand-more'}
          size={20}
          color={colors.cosmic}
        />
        <Text variant="label-lg" weight="semibold" style={{ color: colors.cosmic }}>
          Calendar Schema
        </Text>
        <MetaLabel size="sm" tone="muted" style={{ marginLeft: 'auto' }}>
          {schema.length} unit{schema.length !== 1 ? 's' : ''}
        </MetaLabel>
      </Pressable>

      {isOpen ? (
        <View style={styles.body}>
          {schema.map((unit, idx) => (
            <View key={idx} style={styles.unitRow}>
              <View style={styles.unitMain}>
                <TextInput
                  style={styles.labelInput}
                  value={unit.label}
                  onChangeText={(text) => updateUnit(idx, { label: text })}
                  placeholder="Label (e.g. Era, Year)"
                  placeholderTextColor={colors.outlineVariant}
                />
                <View style={styles.typeSelector}>
                  {UNIT_TYPE_OPTIONS.map((opt) => (
                    <Pressable
                      key={opt.value}
                      onPress={() => updateUnit(idx, { type: opt.value })}
                      style={[
                        styles.typeChip,
                        unit.type === opt.value && styles.typeChipActive,
                      ]}
                    >
                      <Text
                        variant="label-sm"
                        style={{
                          color: unit.type === opt.value ? colors.cosmic : colors.onSurfaceVariant,
                        }}
                      >
                        {opt.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Pressable onPress={() => removeUnit(idx)} hitSlop={8}>
                  <Icon name="close" size={16} color={colors.outlineVariant} />
                </Pressable>
              </View>

              {unit.type === 'ordered_list' ? (
                <View style={styles.optionsList}>
                  {(unit.options ?? []).map((opt, optIdx) => (
                    <View key={optIdx} style={styles.optionRow}>
                      <Text variant="label-sm" tone="muted" style={{ width: 18 }}>
                        {optIdx + 1}.
                      </Text>
                      <TextInput
                        style={styles.optionInput}
                        value={opt}
                        onChangeText={(text) => updateOption(idx, optIdx, text)}
                        placeholder="Option value"
                        placeholderTextColor={colors.outlineVariant}
                      />
                      <Pressable onPress={() => removeOption(idx, optIdx)} hitSlop={8}>
                        <Icon name="close" size={14} color={colors.outlineVariant} />
                      </Pressable>
                    </View>
                  ))}
                  <Pressable onPress={() => addOption(idx)} style={styles.addOptionBtn}>
                    <Icon name="add" size={14} color={colors.cosmic} />
                    <Text variant="label-sm" style={{ color: colors.cosmic }}>
                      Add option
                    </Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          ))}

          <Pressable onPress={addUnit} style={styles.addUnitBtn}>
            <Icon name="add" size={16} color={colors.cosmic} />
            <Text variant="label-md" style={{ color: colors.cosmic }}>
              Add date unit
            </Text>
          </Pressable>
        </View>
      ) : null}
    </Card>
  );
}

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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  body: {
    marginTop: spacing.md,
    gap: spacing.md,
  },
  unitRow: {
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant + '33',
  },
  unitMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  labelInput: {
    flex: 1,
    color: colors.onSurface,
    fontSize: 14,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '55',
    borderRadius: radius.DEFAULT,
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
  addOptionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  addUnitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
});
