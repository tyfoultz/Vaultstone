// Composite editor for FeatPrerequisite[]. Each row is one structured
// clause; clauses AND together. Supports the four kinds the wizard's
// prereq checker can gate on: ability-score (with multi-ability OR),
// character-level, class-feature (named), and prose (free-text
// fallback). Used by the homebrew feat authoring form.

import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  Icon, Input, MetaLabel, Text,
  colors, radius, spacing,
} from '@vaultstone/ui';
import type { AbilityKey, FeatPrerequisite } from '@vaultstone/types';

type Props = {
  value: FeatPrerequisite[];
  onChange: (next: FeatPrerequisite[]) => void;
};

const ABILITY_OPTS: Array<{ key: AbilityKey; label: string }> = [
  { key: 'strength',     label: 'STR' },
  { key: 'dexterity',    label: 'DEX' },
  { key: 'constitution', label: 'CON' },
  { key: 'intelligence', label: 'INT' },
  { key: 'wisdom',       label: 'WIS' },
  { key: 'charisma',     label: 'CHA' },
];

const KIND_OPTS: Array<{ key: FeatPrerequisite['kind']; label: string }> = [
  { key: 'ability-score',   label: 'Ability score' },
  { key: 'character-level', label: 'Character level' },
  { key: 'class-feature',   label: 'Class feature' },
  { key: 'prose',           label: 'Other (text)' },
];

function defaultClause(kind: FeatPrerequisite['kind']): FeatPrerequisite {
  switch (kind) {
    case 'ability-score':   return { kind, abilities: ['strength'], minimum: 13 };
    case 'character-level': return { kind, minimum: 4 };
    case 'class-feature':   return { kind, featureName: '' };
    case 'prose':           return { kind, text: '' };
  }
}

export function FeatPrereqEditor({ value, onChange }: Props) {
  function update(idx: number, next: FeatPrerequisite) {
    const arr = [...value];
    arr[idx] = next;
    onChange(arr);
  }
  function remove(idx: number) {
    onChange(value.filter((_, i) => i !== idx));
  }
  function add() {
    onChange([...value, defaultClause('ability-score')]);
  }

  return (
    <View style={styles.wrap}>
      {value.length === 0 ? (
        <Text variant="body-sm" tone="secondary" style={{ marginBottom: spacing.sm }}>
          No structured prerequisites. Add one below — the wizard will check each clause
          against the candidate character. All clauses must be satisfied (AND).
        </Text>
      ) : null}

      {value.map((clause, idx) => (
        <ClauseRow
          key={idx}
          clause={clause}
          onChange={(next) => update(idx, next)}
          onRemove={() => remove(idx)}
        />
      ))}

      <Pressable onPress={add} style={styles.addBtn}>
        <Icon name="add" size={16} color={colors.primary} />
        <Text variant="label-md" weight="semibold" style={{ color: colors.primary }}>
          Add prerequisite clause
        </Text>
      </Pressable>
    </View>
  );
}

function ClauseRow({
  clause, onChange, onRemove,
}: {
  clause: FeatPrerequisite;
  onChange: (next: FeatPrerequisite) => void;
  onRemove: () => void;
}) {
  return (
    <View style={styles.clause}>
      <View style={styles.clauseHead}>
        <KindPicker
          value={clause.kind}
          onChange={(k) => onChange(defaultClause(k))}
        />
        <Pressable onPress={onRemove} style={styles.removeBtn} hitSlop={8}>
          <Icon name="close" size={16} color={colors.onSurfaceVariant} />
        </Pressable>
      </View>
      <ClauseBody clause={clause} onChange={onChange} />
    </View>
  );
}

function KindPicker({
  value, onChange,
}: {
  value: FeatPrerequisite['kind'];
  onChange: (k: FeatPrerequisite['kind']) => void;
}) {
  return (
    <View style={styles.kindRow}>
      {KIND_OPTS.map((opt) => {
        const selected = opt.key === value;
        return (
          <Pressable
            key={opt.key}
            onPress={() => onChange(opt.key)}
            style={[styles.kindChip, selected && styles.kindChipActive]}
          >
            <Text
              variant="label-sm"
              weight="semibold"
              style={{ color: selected ? colors.primary : colors.onSurfaceVariant }}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function ClauseBody({
  clause, onChange,
}: {
  clause: FeatPrerequisite;
  onChange: (next: FeatPrerequisite) => void;
}) {
  if (clause.kind === 'ability-score') {
    return (
      <View style={{ gap: spacing.sm }}>
        <View>
          <MetaLabel size="sm">Abilities (any one satisfies)</MetaLabel>
          <View style={styles.abilityRow}>
            {ABILITY_OPTS.map((opt) => {
              const selected = clause.abilities.includes(opt.key);
              return (
                <Pressable
                  key={opt.key}
                  onPress={() => {
                    const next = selected
                      ? clause.abilities.filter((a) => a !== opt.key)
                      : [...clause.abilities, opt.key];
                    if (next.length === 0) return; // keep at least one
                    onChange({ ...clause, abilities: next });
                  }}
                  style={[styles.abilityChip, selected && styles.abilityChipActive]}
                >
                  <Text
                    variant="label-sm"
                    weight="bold"
                    style={{
                      color: selected ? colors.primary : colors.onSurfaceVariant,
                      letterSpacing: 0.5,
                    }}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        <NumericInput
          label="Minimum score"
          value={clause.minimum}
          onChange={(n) => onChange({ ...clause, minimum: n })}
          min={1}
          max={30}
        />
      </View>
    );
  }
  if (clause.kind === 'character-level') {
    return (
      <NumericInput
        label="Minimum level"
        value={clause.minimum}
        onChange={(n) => onChange({ ...clause, minimum: n })}
        min={1}
        max={20}
      />
    );
  }
  if (clause.kind === 'class-feature') {
    return (
      <Input
        label="Feature name"
        placeholder="Spellcasting"
        value={clause.featureName}
        onChangeText={(t) => onChange({ ...clause, featureName: t })}
      />
    );
  }
  // prose
  return (
    <Input
      label="Prerequisite text"
      placeholder="Proficiency in heavy armor"
      value={clause.text}
      onChangeText={(t) => onChange({ ...clause, text: t })}
    />
  );
}

function NumericInput({
  label, value, onChange, min, max,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
}) {
  return (
    <Input
      label={label}
      keyboardType="number-pad"
      value={String(value)}
      onChangeText={(t) => {
        const n = parseInt(t, 10);
        if (Number.isFinite(n)) onChange(Math.max(min, Math.min(max, n)));
      }}
    />
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  clause: {
    borderWidth: 1,
    borderColor: colors.outlineVariant + '66',
    borderRadius: radius.lg,
    padding: spacing.sm,
    gap: spacing.sm,
    backgroundColor: colors.surfaceContainerLow,
  },
  clauseHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  removeBtn: {
    padding: 4,
    borderRadius: radius.DEFAULT,
  },
  kindRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    flex: 1,
  },
  kindChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '55',
  },
  kindChipActive: {
    backgroundColor: colors.primaryContainer + '33',
    borderColor: colors.primary + '66',
  },
  abilityRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 4,
  },
  abilityChip: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '55',
    minWidth: 44,
    alignItems: 'center',
  },
  abilityChipActive: {
    backgroundColor: colors.primaryContainer + '33',
    borderColor: colors.primary + '66',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderStyle: 'dashed' as const,
    borderColor: colors.primary + '66',
  },
});
