import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, TextInput, ScrollView, StyleSheet } from 'react-native';
import { useCharacterDraftStore } from '@vaultstone/store';
import { useShallow } from 'zustand/react/shallow';
import { colors } from '@vaultstone/ui';
import type { Dnd5eAbilityScores } from '@vaultstone/types';

const ABILITIES: (keyof Dnd5eAbilityScores)[] = [
  'strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma',
];
const SHORT: Record<keyof Dnd5eAbilityScores, string> = {
  strength: 'STR', dexterity: 'DEX', constitution: 'CON',
  intelligence: 'INT', wisdom: 'WIS', charisma: 'CHA',
};

const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];
const POINT_COST: Record<number, number> = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
const POINT_BUDGET = 27;
const BLANK_SCORES: Dnd5eAbilityScores = {
  strength: 8, dexterity: 8, constitution: 8, intelligence: 8, wisdom: 8, charisma: 8,
};

const METHODS = [
  { key: 'roll_dice' as const, label: 'Roll Dice' },
  { key: 'standard_array' as const, label: 'Array' },
  { key: 'point_buy' as const, label: 'Point Buy' },
  { key: 'roll' as const, label: 'Manual' },
];

type DiceRoll = { dice: number[]; sum: number };

function roll4d6DropLowest(): DiceRoll {
  const raw = Array.from({ length: 4 }, () => Math.floor(Math.random() * 6) + 1);
  const sorted = [...raw].sort((a, b) => b - a);
  return { dice: sorted, sum: sorted[0] + sorted[1] + sorted[2] };
}

function mod(score: number) {
  const m = Math.floor((score - 10) / 2);
  return m >= 0 ? `+${m}` : `${m}`;
}

export function StepAbilityScores() {
  const { abilityScoreMethod, abilityScores, setAbilityScoreMethod, setAbilityScores } =
    useCharacterDraftStore(
      useShallow((s) => ({
        abilityScoreMethod: s.abilityScoreMethod,
        abilityScores: s.abilityScores,
        setAbilityScoreMethod: s.setAbilityScoreMethod,
        setAbilityScores: s.setAbilityScores,
      }))
    );

  // --- Roll Dice local state ---
  const [rolls, setRolls] = useState<Partial<Record<keyof Dnd5eAbilityScores, DiceRoll>>>({});

  // Seed roll_dice scores to BLANK on method switch so the step isn't blocked
  useEffect(() => {
    if (abilityScoreMethod === 'roll_dice' && abilityScores === null) {
      setAbilityScores({ ...BLANK_SCORES });
    }
  }, [abilityScoreMethod]);

  // --- Standard Array local state ---
  const [arrayAssignments, setArrayAssignments] = useState<Partial<Record<keyof Dnd5eAbilityScores, number>>>(
    () => {
      if (abilityScoreMethod !== 'standard_array' || !abilityScores) return {};
      return Object.fromEntries(ABILITIES.map((a) => [a, abilityScores[a]])) as Partial<Record<keyof Dnd5eAbilityScores, number>>;
    }
  );
  const [selectedArrayValue, setSelectedArrayValue] = useState<number | null>(null);

  // Working scores for point buy / manual
  const workingScores: Dnd5eAbilityScores =
    abilityScores ?? { ...BLANK_SCORES };

  // ── Roll Dice helpers ──────────────────────────────────────────────────────

  function rollAbility(ability: keyof Dnd5eAbilityScores) {
    const result = roll4d6DropLowest();
    const next = { ...rolls, [ability]: result };
    setRolls(next);
    setAbilityScores({ ...workingScores, [ability]: result.sum });
  }

  function rollAll() {
    const nextRolls: Partial<Record<keyof Dnd5eAbilityScores, DiceRoll>> = {};
    const nextScores = { ...BLANK_SCORES };
    for (const ability of ABILITIES) {
      const result = roll4d6DropLowest();
      nextRolls[ability] = result;
      nextScores[ability] = result.sum;
    }
    setRolls(nextRolls);
    setAbilityScores(nextScores);
  }

  // ── Standard Array helpers ─────────────────────────────────────────────────

  function assignArrayValue(ability: keyof Dnd5eAbilityScores) {
    if (selectedArrayValue === null) {
      const current = arrayAssignments[ability];
      if (current !== undefined) {
        const next = { ...arrayAssignments };
        delete next[ability];
        setArrayAssignments(next);
        syncArray(next);
      }
      return;
    }
    const next = { ...arrayAssignments };
    for (const a of ABILITIES) {
      if (next[a] === selectedArrayValue) delete next[a];
    }
    next[ability] = selectedArrayValue;
    setArrayAssignments(next);
    setSelectedArrayValue(null);
    syncArray(next);
  }

  function syncArray(assignments: Partial<Record<keyof Dnd5eAbilityScores, number>>) {
    const scores = { ...BLANK_SCORES };
    for (const a of ABILITIES) {
      if (assignments[a] !== undefined) scores[a] = assignments[a]!;
    }
    setAbilityScores(scores);
  }

  function usedArrayValues() {
    return Object.values(arrayAssignments).filter((v): v is number => v !== undefined);
  }

  // ── Point Buy helper ───────────────────────────────────────────────────────

  function updatePointBuy(ability: keyof Dnd5eAbilityScores, delta: number) {
    const current = workingScores[ability];
    const next = current + delta;
    if (next < 8 || next > 15) return;
    const newScores = { ...workingScores, [ability]: next };
    const spent = ABILITIES.reduce((acc, a) => acc + (POINT_COST[newScores[a]] ?? 0), 0);
    if (spent > POINT_BUDGET) return;
    setAbilityScores(newScores);
  }

  // ── Manual helper ──────────────────────────────────────────────────────────

  function updateManual(ability: keyof Dnd5eAbilityScores, raw: string) {
    const n = parseInt(raw, 10);
    if (isNaN(n)) return;
    setAbilityScores({ ...workingScores, [ability]: Math.max(1, Math.min(30, n)) });
  }

  const pointsSpent = ABILITIES.reduce((acc, a) => acc + (POINT_COST[workingScores[a]] ?? 0), 0);
  const pointsRemaining = POINT_BUDGET - pointsSpent;
  const allRolled = ABILITIES.every((a) => rolls[a] !== undefined);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Assign Ability Scores</Text>

      {/* Method selector */}
      <View style={styles.methodRow}>
        {METHODS.map(({ key, label }) => (
          <TouchableOpacity
            key={key}
            style={[styles.methodBtn, abilityScoreMethod === key && styles.methodBtnActive]}
            onPress={() => setAbilityScoreMethod(key)}
          >
            <Text style={[styles.methodBtnText, abilityScoreMethod === key && styles.methodBtnTextActive]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Roll Dice ─────────────────────────────────────────────────────── */}
      {abilityScoreMethod === 'roll_dice' && (
        <View>
          <View style={styles.rollHeader}>
            <Text style={styles.rollInstructions}>
              Roll 4d6 per ability — highest 3 dice count.
            </Text>
            <TouchableOpacity style={styles.rollAllBtn} onPress={rollAll}>
              <Text style={styles.rollAllBtnText}>{allRolled ? 'Reroll All' : 'Roll All'}</Text>
            </TouchableOpacity>
          </View>

          {ABILITIES.map((ability) => {
            const roll = rolls[ability];
            const score = workingScores[ability];
            return (
              <View key={ability} style={styles.rollRow}>
                <View style={styles.rollRowLeft}>
                  <Text style={styles.abilityShort}>{SHORT[ability]}</Text>
                  <Text style={styles.abilityName}>{capitalize(ability)}</Text>
                </View>

                {roll ? (
                  <View style={styles.diceGroup}>
                    {roll.dice.map((val, i) => (
                      <View
                        key={i}
                        style={[styles.diePip, i === 3 && styles.diePipDropped]}
                      >
                        <Text style={[styles.diePipText, i === 3 && styles.diePipTextDropped]}>
                          {val}
                        </Text>
                      </View>
                    ))}
                    <Text style={styles.diceEquals}>=</Text>
                    <View style={styles.rollScoreBox}>
                      <Text style={styles.rollScore}>{score}</Text>
                      <Text style={styles.rollMod}>{mod(score)}</Text>
                    </View>
                  </View>
                ) : (
                  <View style={styles.diceGroupEmpty}>
                    {[0, 1, 2, 3].map((i) => (
                      <View key={i} style={[styles.diePip, styles.diePipEmpty]}>
                        <Text style={styles.diePipTextEmpty}>?</Text>
                      </View>
                    ))}
                  </View>
                )}

                <TouchableOpacity style={styles.rerollBtn} onPress={() => rollAbility(ability)}>
                  <Text style={styles.rerollBtnText}>{roll ? '↺' : 'Roll'}</Text>
                </TouchableOpacity>
              </View>
            );
          })}

          {!allRolled && (
            <Text style={styles.rollHint}>Unrolled abilities default to 8.</Text>
          )}
        </View>
      )}

      {/* ── Standard Array ────────────────────────────────────────────────── */}
      {abilityScoreMethod === 'standard_array' && (
        <View>
          <Text style={styles.hint}>
            Tap a value to select it, then tap an ability to assign. Tap an assigned ability to clear it.
          </Text>
          <View style={styles.arrayChips}>
            {STANDARD_ARRAY.map((val) => {
              const used = usedArrayValues().includes(val);
              const selected = selectedArrayValue === val;
              return (
                <TouchableOpacity
                  key={val}
                  style={[styles.arrayChip, used && styles.arrayChipUsed, selected && styles.arrayChipSelected]}
                  onPress={() => setSelectedArrayValue(selected ? null : val)}
                  disabled={used}
                >
                  <Text style={[styles.arrayChipText, selected && styles.arrayChipTextSelected]}>{val}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {ABILITIES.map((ability) => {
            const value = arrayAssignments[ability];
            return (
              <TouchableOpacity
                key={ability}
                style={[styles.abilityRow, value !== undefined && styles.abilityRowAssigned]}
                onPress={() => assignArrayValue(ability)}
              >
                <Text style={styles.abilityShort}>{SHORT[ability]}</Text>
                <Text style={styles.abilityName}>{capitalize(ability)}</Text>
                <View style={styles.abilityScoreBox}>
                  {value !== undefined ? (
                    <>
                      <Text style={styles.abilityScore}>{value}</Text>
                      <Text style={styles.abilityMod}>{mod(value)}</Text>
                    </>
                  ) : (
                    <Text style={styles.abilityEmpty}>—</Text>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* ── Point Buy ─────────────────────────────────────────────────────── */}
      {abilityScoreMethod === 'point_buy' && (
        <View>
          <View style={styles.pointBudget}>
            <Text style={styles.pointBudgetText}>Points remaining: </Text>
            <Text style={[styles.pointBudgetCount, pointsRemaining === 0 && styles.pointBudgetDone]}>
              {pointsRemaining}
            </Text>
          </View>
          {ABILITIES.map((ability) => {
            const score = workingScores[ability];
            const canIncrease = score < 15 && pointsRemaining >= ((POINT_COST[score + 1] ?? 99) - POINT_COST[score]);
            const canDecrease = score > 8;
            return (
              <View key={ability} style={styles.abilityRow}>
                <Text style={styles.abilityShort}>{SHORT[ability]}</Text>
                <Text style={styles.abilityName}>{capitalize(ability)}</Text>
                <View style={styles.stepper}>
                  <TouchableOpacity
                    style={[styles.stepBtn, !canDecrease && styles.stepBtnDisabled]}
                    onPress={() => updatePointBuy(ability, -1)}
                    disabled={!canDecrease}
                  >
                    <Text style={styles.stepBtnText}>−</Text>
                  </TouchableOpacity>
                  <View style={styles.abilityScoreBox}>
                    <Text style={styles.abilityScore}>{score}</Text>
                    <Text style={styles.abilityMod}>{mod(score)}</Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.stepBtn, !canIncrease && styles.stepBtnDisabled]}
                    onPress={() => updatePointBuy(ability, 1)}
                    disabled={!canIncrease}
                  >
                    <Text style={styles.stepBtnText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* ── Manual Entry ──────────────────────────────────────────────────── */}
      {abilityScoreMethod === 'roll' && (
        <View>
          <Text style={styles.hint}>
            Roll your dice outside the app and enter each score next to the ability.
          </Text>
          {ABILITIES.map((ability) => {
            const score = workingScores[ability];
            const isOutOfRange = score < 3 || score > 18;
            return (
              <View key={ability} style={styles.abilityRow}>
                <Text style={styles.abilityShort}>{SHORT[ability]}</Text>
                <Text style={styles.abilityName}>{capitalize(ability)}</Text>
                <View style={styles.manualInputGroup}>
                  {isOutOfRange && <Text style={styles.warningBadge}>!</Text>}
                  <TextInput
                    style={styles.manualInput}
                    keyboardType="number-pad"
                    value={score.toString()}
                    onChangeText={(t) => updateManual(ability, t)}
                    maxLength={2}
                    selectTextOnFocus
                  />
                  <Text style={styles.abilityMod}>{mod(score)}</Text>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 32 },
  heading: { fontSize: 22, fontWeight: '700', color: colors.textPrimary, marginBottom: 16 },

  // Method tabs
  methodRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  methodBtn: {
    paddingVertical: 7, paddingHorizontal: 12,
    borderRadius: 8, borderWidth: 1, borderColor: colors.border,
  },
  methodBtnActive: { borderColor: colors.brand, backgroundColor: colors.brand + '22' },
  methodBtnText: { fontSize: 13, color: colors.textSecondary, fontWeight: '600' },
  methodBtnTextActive: { color: colors.brand },

  hint: { fontSize: 12, color: colors.textSecondary, marginBottom: 14, lineHeight: 17 },

  // Roll Dice
  rollHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  rollInstructions: { fontSize: 13, color: colors.textSecondary, flex: 1 },
  rollAllBtn: {
    backgroundColor: colors.brand,
    paddingVertical: 8, paddingHorizontal: 14,
    borderRadius: 8,
  },
  rollAllBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  rollRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  rollRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 6, width: 90 },
  diceGroup: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
  diceGroupEmpty: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
  diePip: {
    width: 28, height: 28, borderRadius: 6,
    borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  diePipDropped: {
    borderColor: colors.hpDanger + '66',
    backgroundColor: colors.hpDanger + '11',
  },
  diePipEmpty: { borderColor: colors.border, opacity: 0.4 },
  diePipText: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
  diePipTextDropped: { color: colors.hpDanger, textDecorationLine: 'line-through' },
  diePipTextEmpty: { fontSize: 12, color: colors.textSecondary },
  diceEquals: { fontSize: 14, color: colors.textSecondary, marginHorizontal: 2 },
  rollScoreBox: { alignItems: 'center', minWidth: 32 },
  rollScore: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  rollMod: { fontSize: 11, color: colors.textSecondary },
  rerollBtn: {
    paddingVertical: 5, paddingHorizontal: 10,
    borderRadius: 6, borderWidth: 1, borderColor: colors.border,
  },
  rerollBtnText: { fontSize: 14, color: colors.brand, fontWeight: '700' },
  rollHint: { fontSize: 11, color: colors.textSecondary, marginTop: 10, textAlign: 'center' },

  // Standard Array
  arrayChips: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  arrayChip: {
    width: 44, height: 44, borderRadius: 8,
    borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  arrayChipUsed: { opacity: 0.3 },
  arrayChipSelected: { borderColor: colors.brand, backgroundColor: colors.brand + '33' },
  arrayChipText: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  arrayChipTextSelected: { color: colors.brand },

  // Shared ability row
  abilityRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, borderBottomWidth: 1, borderColor: colors.border,
  },
  abilityRowAssigned: { borderColor: colors.brand + '44' },
  abilityShort: { width: 36, fontSize: 13, fontWeight: '700', color: colors.brand },
  abilityName: { flex: 1, fontSize: 14, color: colors.textSecondary },
  abilityScoreBox: { alignItems: 'center', minWidth: 40 },
  abilityScore: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  abilityMod: { fontSize: 12, color: colors.textSecondary },
  abilityEmpty: { fontSize: 18, color: colors.border },

  // Point Buy stepper
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepBtn: {
    width: 32, height: 32, borderRadius: 6,
    borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  stepBtnDisabled: { opacity: 0.3 },
  stepBtnText: { fontSize: 18, color: colors.textPrimary, lineHeight: 22 },
  pointBudget: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  pointBudgetText: { fontSize: 14, color: colors.textSecondary },
  pointBudgetCount: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  pointBudgetDone: { color: colors.hpHealthy },

  // Manual entry
  manualInputGroup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  manualInput: {
    width: 48, height: 40, textAlign: 'center',
    fontSize: 17, fontWeight: '700', color: colors.textPrimary,
    backgroundColor: colors.surface, borderRadius: 6,
    borderWidth: 1, borderColor: colors.border,
  },
  warningBadge: { fontSize: 14, fontWeight: '700', color: colors.hpWarning },
});
