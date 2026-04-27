import { Pressable, StyleSheet, View } from 'react-native';
import type { StructuredField } from '@vaultstone/types';
import { MetaLabel, Text, colors, radius, spacing } from '@vaultstone/ui';

type Props = {
  field: StructuredField;
  value: unknown;
  onChange: (value: string) => void;
  compact?: boolean;
};

export function SelectField({ field, value, onChange, compact }: Props) {
  const options = field.options ?? [];
  const current = typeof value === 'string' ? value : '';

  if (compact) {
    return (
      <View style={styles.compactRoot}>
        <MetaLabel size="sm" style={styles.compactLabel}>{field.label}</MetaLabel>
        <View style={styles.compactRow}>
          {options.map((opt) => {
            const selected = current === opt;
            return (
              <Pressable
                key={opt}
                onPress={() => onChange(selected ? '' : opt)}
                style={[styles.compactChip, selected && styles.compactChipActive]}
              >
                <Text
                  variant="label-sm"
                  weight="semibold"
                  style={{
                    color: selected ? colors.primary : colors.onSurfaceVariant,
                    fontSize: 10,
                    letterSpacing: 0.5,
                    textTransform: 'capitalize',
                  }}
                >
                  {opt}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <MetaLabel size="sm">{field.label}</MetaLabel>
      <View style={styles.row}>
        {options.map((opt) => {
          const selected = current === opt;
          return (
            <Pressable
              key={opt}
              onPress={() => onChange(selected ? '' : opt)}
              style={[styles.chip, selected && styles.chipActive]}
            >
              <Text
                variant="label-md"
                weight="semibold"
                uppercase
                style={{
                  color: selected ? colors.primary : colors.onSurfaceVariant,
                  letterSpacing: 1,
                }}
              >
                {opt}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.xs + 2,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs + 2,
  },
  chip: {
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '55',
  },
  chipActive: {
    backgroundColor: colors.primaryContainer + '33',
    borderColor: colors.primary + '66',
  },
  compactRoot: {
    gap: spacing.xs,
  },
  compactLabel: {
    color: colors.outline,
  },
  compactRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  compactChip: {
    paddingHorizontal: spacing.xs + 4,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '44',
  },
  compactChipActive: {
    backgroundColor: colors.primaryContainer + '33',
    borderColor: colors.primary + '66',
  },
});
