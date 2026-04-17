import { Pressable, StyleSheet, View } from 'react-native';
import type { StructuredField } from '@vaultstone/types';
import { MetaLabel, Text, colors, radius, spacing } from '@vaultstone/ui';

type Props = {
  field: StructuredField;
  value: unknown;
  onChange: (value: string) => void;
};

export function SelectField({ field, value, onChange }: Props) {
  const options = field.options ?? [];
  const current = typeof value === 'string' ? value : '';

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
});
