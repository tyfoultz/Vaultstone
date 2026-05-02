// Small multi-select toggle row used by every homebrew form for fields
// like spell components (V/S/M), saving throws, classes that can prepare
// a spell, etc. Tapping a chip flips its membership in the selected set.

import { Pressable, StyleSheet, View } from 'react-native';
import { Icon, Text, colors, radius, spacing } from '@vaultstone/ui';

type Option<T extends string> = { key: T; label: string };

type Props<T extends string> = {
  options: Option<T>[];
  values: T[];
  onChange: (next: T[]) => void;
};

export function ChipToggleRow<T extends string>({ options, values, onChange }: Props<T>) {
  function toggle(key: T) {
    if (values.includes(key)) {
      onChange(values.filter((v) => v !== key));
    } else {
      onChange([...values, key]);
    }
  }

  return (
    <View style={styles.row}>
      {options.map((opt) => {
        const selected = values.includes(opt.key);
        return (
          <Pressable
            key={opt.key}
            onPress={() => toggle(opt.key)}
            style={[styles.chip, selected && styles.chipActive]}
          >
            {selected ? <Icon name="check" size={14} color={colors.primary} /> : null}
            <Text
              variant="label-md"
              weight="semibold"
              uppercase
              style={{
                color: selected ? colors.primary : colors.onSurfaceVariant,
                letterSpacing: 1,
              }}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs + 2,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
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
