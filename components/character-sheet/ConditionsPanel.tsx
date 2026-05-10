import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Pressable, ScrollView } from 'react-native';
import { colors, fonts, radius, spacing } from '@vaultstone/ui';
import type { ConditionResult } from '@vaultstone/types';

// SRD-baseline fallback list. Used when ContentResolver hasn't returned
// yet (or has returned an empty set, e.g. an offline non-SRD pack-only
// character). The grid renders the merged set so a homebrew pack adding
// a custom condition surfaces alongside the canonical 14.
const SRD_CONDITION_FALLBACK = [
  'Blinded', 'Charmed', 'Deafened', 'Frightened', 'Grappled',
  'Incapacitated', 'Invisible', 'Paralyzed', 'Petrified', 'Poisoned',
  'Prone', 'Restrained', 'Stunned', 'Unconscious',
] as const;

export const SRD_CONDITIONS = SRD_CONDITION_FALLBACK;

interface Props {
  conditions: string[];
  exhaustionLevel: number;
  /** Optional ContentResolver entries — when supplied, the grid is
   *  driven by these (so homebrew + imported conditions appear) and
   *  each chip exposes a tap-to-detail with the rule effects. */
  conditionCatalog?: ConditionResult[];
  onToggle: (condition: string) => void;
  onSetExhaustion: (level: number) => void;
}

export function ConditionsPanel({ conditions, exhaustionLevel, conditionCatalog, onToggle, onSetExhaustion }: Props) {
  const activeSet = new Set(conditions.map((c) => c.toLowerCase()));
  const [detailFor, setDetailFor] = useState<ConditionResult | null>(null);

  // Catalog entries take precedence (carry descriptions + effects); merge
  // in any fallback names that aren't covered so the grid never shrinks
  // below the SRD baseline.
  const catalogByName = new Map(
    (conditionCatalog ?? []).map((c) => [c.name.toLowerCase(), c]),
  );
  const renderedNames = new Set(catalogByName.keys());
  const merged: Array<{ name: string; entry?: ConditionResult }> = [];
  for (const c of conditionCatalog ?? []) {
    merged.push({ name: c.name, entry: c });
  }
  for (const fallback of SRD_CONDITION_FALLBACK) {
    if (!renderedNames.has(fallback.toLowerCase())) {
      merged.push({ name: fallback });
    }
  }
  // Stable alpha sort so homebrew additions don't visually shuffle the
  // canonical set.
  merged.sort((a, b) => a.name.localeCompare(b.name));

  return (
    <View>
      <View style={styles.grid}>
        {merged.map(({ name, entry }) => {
          const active = activeSet.has(name.toLowerCase());
          return (
            <TouchableOpacity
              key={name}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => onToggle(name)}
              onLongPress={entry ? () => setDetailFor(entry) : undefined}
              delayLongPress={250}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{name}</Text>
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

      <Modal visible={!!detailFor} transparent animationType="fade" onRequestClose={() => setDetailFor(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setDetailFor(null)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{detailFor?.name}</Text>
              <TouchableOpacity onPress={() => setDetailFor(null)} hitSlop={8}>
                <Text style={styles.modalClose}>Close</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 360 }}>
              {detailFor?.description ? (
                <Text style={styles.modalDesc}>{detailFor.description}</Text>
              ) : null}
              {(detailFor?.effects ?? []).map((eff, i) => (
                <Text key={i} style={styles.modalBullet}>• {eff}</Text>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
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

  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center', padding: spacing.lg,
  },
  modalCard: {
    width: '100%', maxWidth: 520,
    backgroundColor: colors.surfaceContainer,
    borderRadius: radius.lg, padding: spacing.lg,
    borderWidth: 1, borderColor: colors.outlineVariant,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  modalTitle: { fontSize: 16, fontFamily: fonts.headline, fontWeight: '700', color: colors.onSurface },
  modalClose: { fontSize: 13, color: colors.primary, fontFamily: fonts.label, fontWeight: '600' },
  modalDesc: { fontSize: 13, color: colors.onSurfaceVariant, lineHeight: 19, marginBottom: spacing.sm },
  modalBullet: { fontSize: 13, color: colors.onSurfaceVariant, lineHeight: 19, marginBottom: 4 },
});
