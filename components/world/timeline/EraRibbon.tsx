import { Pressable, StyleSheet, View } from 'react-native';
import type { EraDefinition, TimelineEvent } from '@vaultstone/types';
import { Text, colors, spacing } from '@vaultstone/ui';

type Props = {
  events: TimelineEvent[];
  eras: EraDefinition[];
  activeEra: string | null;
  onSelectEra: (eraKey: string | null) => void;
};

export function EraRibbon({ events, eras, activeEra, onSelectEra }: Props) {
  const visible = eras.filter((e) => e.label);
  if (visible.length === 0) return null;

  return (
    <View style={styles.root}>
      {visible.map((era, idx) => {
        const isActive = activeEra === era.key;
        const eraEvents = events.filter((ev) => {
          const dv = ev.date_values as Record<string, unknown>;
          return dv.era === era.key;
        });
        const yearRange = computeYearRange(eraEvents, era);
        const isFirst = idx === 0;
        const isLast = idx === visible.length - 1;

        return (
          <Pressable
            key={era.key}
            onPress={() => onSelectEra(isActive ? null : era.key)}
            style={[
              styles.era,
              isActive && styles.eraActive,
              isFirst && styles.eraFirst,
              isLast && styles.eraLast,
            ]}
          >
            <Text
              variant="label-md"
              style={[styles.eraLabel, isActive && styles.eraLabelActive]}
              numberOfLines={1}
            >
              {era.label}
            </Text>
            {yearRange ? (
              <Text
                variant="label-sm"
                style={[styles.eraRange, isActive && styles.eraRangeActive]}
              >
                {yearRange}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

function computeYearRange(events: TimelineEvent[], era: EraDefinition): string {
  const numericLevel = era.dateLevels.find((l) => l.type === 'number');
  if (!numericLevel) return '';

  const suffix = numericLevel.label ? ` ${numericLevel.label}` : '';

  if (events.length === 0) return '';

  const years = events
    .map((e) => {
      const dv = e.date_values as Record<string, unknown>;
      const y = dv[numericLevel.key];
      return typeof y === 'number' ? y : typeof y === 'string' ? parseInt(y, 10) : NaN;
    })
    .filter((y) => !isNaN(y));

  if (years.length === 0) return '';
  const min = Math.min(...years);
  const max = Math.max(...years);
  return min === max ? `${min}${suffix}` : `${min} – ${max}${suffix}`;
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.outlineVariant + '33',
    backgroundColor: colors.surfaceContainerLow,
    marginBottom: spacing.lg,
  },
  era: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: colors.outlineVariant + '22',
    minHeight: 48,
  },
  eraFirst: {
    borderTopLeftRadius: 7,
    borderBottomLeftRadius: 7,
  },
  eraLast: {
    borderTopRightRadius: 7,
    borderBottomRightRadius: 7,
    borderRightWidth: 0,
  },
  eraActive: {
    backgroundColor: colors.primaryContainer,
    borderRadius: 6,
    zIndex: 1,
    borderRightWidth: 0,
  },
  eraLabel: {
    color: colors.onSurfaceVariant,
    fontStyle: 'italic',
    fontSize: 14,
  },
  eraLabelActive: {
    color: colors.onPrimaryContainer,
    fontWeight: '700',
    fontStyle: 'normal',
  },
  eraRange: {
    color: colors.outlineVariant,
    fontSize: 10,
    marginTop: 2,
  },
  eraRangeActive: {
    color: colors.primary,
  },
});
