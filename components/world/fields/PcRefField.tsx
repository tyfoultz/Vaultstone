import { StyleSheet, View } from 'react-native';
import type { StructuredField } from '@vaultstone/types';
import { MetaLabel, Text, colors, radius, spacing } from '@vaultstone/ui';

type Props = {
  field: StructuredField;
  value: unknown;
  onChange: (value: string | null) => void;
};

// Phase 2 placeholder — the real picker arrives in Phase 4 once PC stub
// pages materialize from linked campaigns.
export function PcRefField({ field }: Props) {
  return (
    <View style={styles.root}>
      <MetaLabel size="sm">{field.label}</MetaLabel>
      <View style={styles.chip}>
        <Text variant="label-md" style={{ color: colors.outline }}>
          Players linked in Phase 4
        </Text>
      </View>
      {field.helpText ? (
        <Text variant="body-sm" tone="secondary" style={{ color: colors.onSurfaceVariant }}>
          {field.helpText}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.xs + 2,
  },
  chip: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '55',
    backgroundColor: colors.surfaceContainer,
  },
});
