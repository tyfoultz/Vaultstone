import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors } from '@vaultstone/ui';

export const SRD_CONDITIONS = [
  'Blinded',
  'Charmed',
  'Deafened',
  'Frightened',
  'Grappled',
  'Incapacitated',
  'Invisible',
  'Paralyzed',
  'Petrified',
  'Poisoned',
  'Prone',
  'Restrained',
  'Stunned',
  'Unconscious',
] as const;

interface Props {
  conditions: string[];
  exhaustionLevel: number;
  onToggle: (condition: string) => void;
  onSetExhaustion: (level: number) => void;
}

export function ConditionsPanel({ conditions, exhaustionLevel, onToggle, onSetExhaustion }: Props) {
  const activeSet = new Set(conditions.map((c) => c.toLowerCase()));

  return (
    <View>
      <View style={styles.grid}>
        {SRD_CONDITIONS.map((cond) => {
          const active = activeSet.has(cond.toLowerCase());
          return (
            <TouchableOpacity
              key={cond}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => onToggle(cond)}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{cond}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.exhaustionRow}>
        <Text style={styles.exhaustionLabel}>Exhaustion</Text>
        <View style={styles.exhaustionPips}>
          {[0, 1, 2, 3, 4, 5, 6].map((level) => (
            <TouchableOpacity
              key={level}
              style={[
                styles.exhaustionPip,
                level === 0 && styles.exhaustionPipZero,
                exhaustionLevel >= level && level > 0 && styles.exhaustionPipFilled,
                exhaustionLevel === level && styles.exhaustionPipActive,
              ]}
              onPress={() => onSetExhaustion(level === exhaustionLevel ? level - 1 : level)}
            >
              <Text
                style={[
                  styles.exhaustionPipText,
                  exhaustionLevel >= level && level > 0 && styles.exhaustionPipTextFilled,
                ]}
              >
                {level}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    paddingVertical: 5,
    paddingHorizontal: 10,
    backgroundColor: colors.background,
  },
  chipActive: {
    borderColor: colors.hpDanger,
    backgroundColor: colors.hpDanger + '22',
  },
  chipText: { fontSize: 12, color: colors.textSecondary, fontWeight: '500' },
  chipTextActive: { color: colors.hpDanger, fontWeight: '700' },

  exhaustionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    gap: 12,
  },
  exhaustionLabel: { fontSize: 13, color: colors.textSecondary, fontWeight: '600' },
  exhaustionPips: { flexDirection: 'row', gap: 6 },
  exhaustionPip: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  exhaustionPipZero: { borderColor: colors.hpHealthy },
  exhaustionPipFilled: {
    backgroundColor: colors.hpWarning + '33',
    borderColor: colors.hpWarning,
  },
  exhaustionPipActive: { borderWidth: 2 },
  exhaustionPipText: { fontSize: 11, fontWeight: '700', color: colors.textSecondary },
  exhaustionPipTextFilled: { color: colors.hpWarning },
});
