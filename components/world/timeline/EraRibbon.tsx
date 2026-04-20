import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { EraDefinition, TimelineEvent } from '@vaultstone/types';
import { Text, colors, spacing } from '@vaultstone/ui';

type Props = {
  events: TimelineEvent[];
  eras: EraDefinition[];
  activeEra: string | null;
  onSelectEra: (eraKey: string | null) => void;
};

export function EraRibbon({ events, eras, activeEra, onSelectEra }: Props) {
  if (eras.length === 0) return null;

  return (
    <View style={styles.root}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {eras.filter((e) => e.label).map((era) => {
          const isActive = activeEra === era.key;
          const eraEvents = events.filter((ev) => {
            const dv = ev.date_values as Record<string, unknown>;
            return dv.era === era.key;
          });
          const yearRange = computeYearRange(eraEvents, era);

          return (
            <Pressable
              key={era.key}
              onPress={() => onSelectEra(isActive ? null : era.key)}
              style={[styles.era, isActive && styles.eraActive]}
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
      </ScrollView>
    </View>
  );
}

function computeYearRange(events: TimelineEvent[], era: EraDefinition): string {
  const numericLevel = era.dateLevels.find((l) => l.type === 'number');
  if (!numericLevel || events.length === 0) return '';

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
  const suffix = numericLevel.label ? ` ${numericLevel.label}` : '';
  return min === max ? `${min}${suffix}` : `${min} – ${max}${suffix}`;
}

const styles = StyleSheet.create({
  root: { marginBottom: spacing.lg },
  scroll: { gap: 0 },
  era: {
    flex: 1, minWidth: 120,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
    alignItems: 'center',
    borderWidth: 1, borderColor: colors.outlineVariant + '44', borderRightWidth: 0,
  },
  eraActive: {
    backgroundColor: colors.primaryContainer,
    borderColor: colors.primary + '66', borderRightWidth: 1,
  },
  eraLabel: { color: colors.onSurfaceVariant, fontStyle: 'italic', fontSize: 13 },
  eraLabelActive: { color: colors.primary, fontWeight: '700', fontStyle: 'normal' },
  eraRange: { color: colors.outlineVariant, fontSize: 10, marginTop: 2 },
  eraRangeActive: { color: colors.onSurfaceVariant },
});
