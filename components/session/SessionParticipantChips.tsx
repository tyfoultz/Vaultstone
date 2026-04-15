import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing } from '@vaultstone/ui';

interface Props {
  names: string[];
  label?: string;
}

export function SessionParticipantChips({ names, label = 'In session' }: Props) {
  if (names.length === 0) return null;
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.chips}>
        {names.map((n) => (
          <View key={n} style={styles.chip}>
            <Text style={styles.chipText} numberOfLines={1}>{n}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 4, gap: 4 },
  label: {
    fontSize: 11, color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  chip: {
    backgroundColor: colors.background,
    borderColor: colors.border, borderWidth: 1,
    borderRadius: 6, paddingHorizontal: spacing.sm, paddingVertical: 3,
    maxWidth: 160,
  },
  chipText: { fontSize: 11, color: colors.textPrimary, fontWeight: '500' },
});
