import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors } from '@vaultstone/ui';
import type { Dnd5eResources, Dnd5eSpellSlotLevel } from '@vaultstone/types';

interface Props {
  spellSlots: Dnd5eResources['spellSlots'];
  /** DM or character owner; when false, pips render but tap is a no-op. */
  canEdit: boolean;
  onChange: (spellSlots: Dnd5eResources['spellSlots']) => void;
}

type SlotKey = keyof NonNullable<Dnd5eResources['spellSlots']>;
const LEVELS: SlotKey[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];

export function SpellSlotPips({ spellSlots, canEdit, onChange }: Props) {
  if (!spellSlots) return null;

  const populatedLevels = LEVELS.filter((lvl) => {
    const slot = spellSlots[lvl];
    return slot && slot.max > 0;
  });
  if (populatedLevels.length === 0) return null;

  function mutate(lvl: SlotKey, delta: number) {
    if (!canEdit || !spellSlots) return;
    const cur = spellSlots[lvl];
    const next: Dnd5eSpellSlotLevel = {
      max: cur.max,
      remaining: Math.max(0, Math.min(cur.max, cur.remaining + delta)),
    };
    onChange({ ...spellSlots, [lvl]: next });
  }

  function resetToMax(lvl: SlotKey) {
    if (!canEdit || !spellSlots) return;
    const cur = spellSlots[lvl];
    onChange({ ...spellSlots, [lvl]: { ...cur, remaining: cur.max } });
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Spell Slots</Text>
      {populatedLevels.map((lvl) => {
        const slot = spellSlots[lvl];
        return (
          <View key={lvl} style={styles.row}>
            <Text style={styles.levelLabel}>{lvl}</Text>
            <View style={styles.pips}>
              {Array.from({ length: slot.max }).map((_, i) => {
                const filled = i < slot.remaining;
                return (
                  <TouchableOpacity
                    key={i}
                    disabled={!canEdit}
                    onPress={() => mutate(lvl, filled ? -1 : 1)}
                    onLongPress={() => resetToMax(lvl)}
                    style={[styles.pip, filled ? styles.pipFilled : styles.pipEmpty]}
                  />
                );
              })}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 4, marginTop: 4 },
  label: {
    fontSize: 10,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 2,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  levelLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '700',
    width: 16,
    textAlign: 'center',
  },
  pips: { flexDirection: 'row', gap: 4, flexWrap: 'wrap' },
  pip: {
    width: 12,
    height: 12,
    borderRadius: 2,
    borderWidth: 1,
  },
  pipFilled: { backgroundColor: colors.brand, borderColor: colors.brand },
  pipEmpty: { backgroundColor: 'transparent', borderColor: colors.border },
});
