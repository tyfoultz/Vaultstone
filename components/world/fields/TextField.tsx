import { StyleSheet, TextInput, View } from 'react-native';
import { Input, MetaLabel, Text, colors, radius, spacing } from '@vaultstone/ui';
import type { StructuredField } from '@vaultstone/types';

type Props = {
  field: StructuredField;
  value: unknown;
  onChange: (value: string) => void;
  compact?: boolean;
};

export function TextField({ field, value, onChange, compact }: Props) {
  const stringValue = typeof value === 'string' ? value : '';

  if (compact) {
    return (
      <View style={styles.compactRoot}>
        <MetaLabel size="sm" style={styles.compactLabel}>{field.label}</MetaLabel>
        <TextInput
          value={stringValue}
          onChangeText={onChange}
          placeholder={field.placeholder ?? '—'}
          placeholderTextColor={colors.outline}
          style={styles.compactInput}
        />
      </View>
    );
  }

  return (
    <Input
      label={field.label}
      placeholder={field.placeholder}
      value={stringValue}
      onChangeText={onChange}
    />
  );
}

const styles = StyleSheet.create({
  compactRoot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 28,
  },
  compactLabel: {
    width: 80,
    color: colors.outline,
  },
  compactInput: {
    flex: 1,
    fontSize: 13,
    color: colors.onSurface,
    paddingVertical: 4,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '33',
    backgroundColor: colors.surfaceContainerHigh,
  },
});
