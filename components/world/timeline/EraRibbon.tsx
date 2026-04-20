import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { CalendarUnit, TimelineEvent } from '@vaultstone/types';
import { Text, colors, spacing } from '@vaultstone/ui';

type EraGroup = {
  label: string;
  yearRange: string;
  eventCount: number;
};

type Props = {
  events: TimelineEvent[];
  calendarSchema: CalendarUnit[];
  activeEra: string | null;
  onSelectEra: (era: string | null) => void;
};

export function EraRibbon({ events, calendarSchema, activeEra, onSelectEra }: Props) {
  if (calendarSchema.length === 0) return null;

  const topUnit = calendarSchema[0];
  const yearUnit = calendarSchema.find((u) => u.type === 'number');

  const groups = buildEraGroups(events, topUnit, yearUnit);

  if (groups.length === 0) return null;

  return (
    <View style={styles.root}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {groups.map((group) => {
          const isActive = activeEra === group.label;
          return (
            <Pressable
              key={group.label}
              onPress={() => onSelectEra(isActive ? null : group.label)}
              style={[styles.era, isActive && styles.eraActive]}
            >
              <Text
                variant="label-md"
                style={[
                  styles.eraLabel,
                  isActive && styles.eraLabelActive,
                ]}
                numberOfLines={1}
              >
                {group.label}
              </Text>
              {group.yearRange ? (
                <Text
                  variant="label-sm"
                  style={[
                    styles.eraRange,
                    isActive && styles.eraRangeActive,
                  ]}
                >
                  {group.yearRange}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function buildEraGroups(
  events: TimelineEvent[],
  topUnit: CalendarUnit,
  yearUnit: CalendarUnit | undefined,
): EraGroup[] {
  const groupMap = new Map<string, TimelineEvent[]>();

  if (topUnit.type === 'ordered_list' && topUnit.options) {
    for (const opt of topUnit.options) {
      groupMap.set(opt, []);
    }
  }

  for (const ev of events) {
    const dv = ev.date_values as Record<string, unknown>;
    const eraVal = String(dv[topUnit.key] ?? '');
    if (!eraVal) continue;
    if (!groupMap.has(eraVal)) groupMap.set(eraVal, []);
    groupMap.get(eraVal)!.push(ev);
  }

  const groups: EraGroup[] = [];
  for (const [label, evs] of groupMap) {
    let yearRange = '';
    if (yearUnit && evs.length > 0) {
      const years = evs
        .map((e) => {
          const dv = e.date_values as Record<string, unknown>;
          const y = dv[yearUnit.key];
          return typeof y === 'number' ? y : typeof y === 'string' ? parseInt(y, 10) : NaN;
        })
        .filter((y) => !isNaN(y));
      if (years.length > 0) {
        const min = Math.min(...years);
        const max = Math.max(...years);
        const suffix = yearUnit.label ? ` ${yearUnit.label}` : '';
        yearRange = min === max ? `${min}${suffix}` : `${min} – ${max}${suffix}`;
      }
    }
    groups.push({ label, yearRange, eventCount: evs.length });
  }

  return groups;
}

const styles = StyleSheet.create({
  root: {
    marginBottom: spacing.lg,
  },
  scroll: {
    gap: 0,
  },
  era: {
    flex: 1,
    minWidth: 120,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.outlineVariant + '44',
    borderRightWidth: 0,
  },
  eraActive: {
    backgroundColor: colors.primaryContainer,
    borderColor: colors.primary + '66',
    borderRightWidth: 1,
  },
  eraLabel: {
    color: colors.onSurfaceVariant,
    fontStyle: 'italic',
    fontSize: 13,
  },
  eraLabelActive: {
    color: colors.primary,
    fontWeight: '700',
    fontStyle: 'normal',
  },
  eraRange: {
    color: colors.outlineVariant,
    fontSize: 10,
    marginTop: 2,
  },
  eraRangeActive: {
    color: colors.onSurfaceVariant,
  },
});
