import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { colors, fonts, spacing } from '@vaultstone/ui';

interface SheetSoFarProps {
  speciesName?: string | null;
  className?: string | null;
  classDie?: number | null;
  backgroundName?: string | null;
  highestStat?: { label: string; value: number } | null;
  onJumpTo: (step: number) => void;
}

export function SheetSoFar({
  speciesName,
  className,
  classDie,
  backgroundName,
  highestStat,
  onJumpTo,
}: SheetSoFarProps) {
  if (!speciesName && !className && !backgroundName && !highestStat) return null;

  return (
    <View style={s.container}>
      <View style={s.headerRow}>
        <Text style={s.headerLabel}>CHARACTER SHEET · LV 1</Text>
        <View style={s.divider} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
        <Chip label="Species" value={speciesName} onPress={() => onJumpTo(1)} />
        <Chip label="Class" value={className} detail={classDie ? `d${classDie}` : undefined} onPress={() => onJumpTo(2)} />
        <Chip label="Bg" value={backgroundName} onPress={() => onJumpTo(3)} />
        {highestStat && (
          <Chip label="Stats" value={`${highestStat.label} ${highestStat.value}`} onPress={() => onJumpTo(4)} />
        )}
      </ScrollView>
    </View>
  );
}

function Chip({
  label,
  value,
  detail,
  onPress,
}: {
  label: string;
  value?: string | null;
  detail?: string;
  onPress: () => void;
}) {
  const filled = !!value;
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[s.chip, filled ? s.chipFilled : s.chipEmpty]}
      activeOpacity={0.7}
    >
      <Text style={s.chipLabel}>{label}</Text>
      <Text style={[s.chipValue, !filled && s.chipValueEmpty]}>{value ?? '—'}</Text>
      {detail ? <Text style={s.chipDetail}>{detail}</Text> : null}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  container: {
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    backgroundColor: colors.surfaceContainerLow,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  headerLabel: {
    fontSize: 9,
    fontFamily: fonts.label,
    fontWeight: '600',
    letterSpacing: 1.5,
    color: colors.outline,
    textTransform: 'uppercase',
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: colors.outlineVariant,
    opacity: 0.5,
  },
  chips: {
    flexDirection: 'row',
    gap: 6,
    paddingBottom: 2,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  chipFilled: {
    backgroundColor: colors.surfaceContainerHigh,
  },
  chipEmpty: {
    borderWidth: 1,
    borderStyle: 'dashed' as any,
    borderColor: colors.outlineVariant,
  },
  chipLabel: {
    fontSize: 9,
    fontFamily: fonts.label,
    fontWeight: '600',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: colors.outline,
  },
  chipValue: {
    fontSize: 12,
    fontFamily: fonts.headline,
    fontWeight: '600',
    color: colors.onSurface,
  },
  chipValueEmpty: {
    color: colors.outline,
  },
  chipDetail: {
    fontSize: 10,
    color: colors.outline,
    fontFamily: fonts.body,
  },
});
