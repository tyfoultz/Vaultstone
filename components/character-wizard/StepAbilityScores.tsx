import { useState, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, TextInput, ScrollView, StyleSheet } from 'react-native';
import { useCharacterDraftStore } from '@vaultstone/store';
import { useShallow } from 'zustand/react/shallow';
import {
  BUNDLED_SYSTEMS_BY_ID, getAbilityAttributes,
} from '@vaultstone/systems';
import { colors, fonts, spacing, radius } from '@vaultstone/ui';
import type { Dnd5eAbilityScores } from '@vaultstone/types';

// The wizard's draft store stores ability scores in the D&D 5e
// `Dnd5eAbilityScores` shape, which is structurally a
// `Record<AbilityKey, number>`. We treat it as a string-keyed map
// here so the rendering loop is driven by the system's attribute
// list rather than a hardcoded six-key tuple — adding a homebrew
// 5e variant with a seventh ability would just need a new entry
// in `getAbilityAttributes(system.attributes)`.
type AbilityScoreMap = Record<string, number>;

const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];
const POINT_COST: Record<number, number> = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
const POINT_BUDGET = 27;

type DiceRoll = { dice: number[]; sum: number };

function roll4d6Drop(): DiceRoll {
  const raw = Array.from({ length: 4 }, () => Math.floor(Math.random() * 6) + 1);
  const sorted = [...raw].sort((a, b) => b - a);
  return { dice: sorted, sum: sorted[0] + sorted[1] + sorted[2] };
}

function fmtMod(score: number) {
  const m = Math.floor((score - 10) / 2);
  return m >= 0 ? `+${m}` : `${m}`;
}

const METHODS = [
  { key: 'point_buy' as const, label: 'Point Buy' },
  { key: 'standard_array' as const, label: 'Array' },
  { key: 'roll_dice' as const, label: 'Roll 4d6' },
  { key: 'roll' as const, label: 'Manual' },
];

export function StepAbilityScores() {
  const { abilityScoreMethod, abilityScores, setAbilityScoreMethod, setAbilityScores, system, srdVersion } =
    useCharacterDraftStore(
      useShallow((s) => ({
        abilityScoreMethod: s.abilityScoreMethod,
        abilityScores: s.abilityScores,
        setAbilityScoreMethod: s.setAbilityScoreMethod,
        setAbilityScores: s.setAbilityScores,
        system: s.system,
        srdVersion: s.srdVersion,
      }))
    );

  // Pull the raw-ability rows from the chosen system's `attributes[]`
  // schema. For D&D 5e (both editions) this is the canonical six —
  // the same set the constants above used to spell out — but reading
  // it from the system definition means a homebrew 5e variant could
  // legitimately add or rename an ability without code edits here.
  const abilityRows = useMemo(() => {
    const sysId = system === 'dnd5e' && srdVersion === 'SRD_5.1' ? 'dnd5e_2014' : 'dnd5e_2024';
    const sys = BUNDLED_SYSTEMS_BY_ID[sysId];
    return sys ? getAbilityAttributes(sys.attributes) : [];
  }, [system, srdVersion]);
  const ABILITIES = useMemo(() => abilityRows.map((a) => a.key), [abilityRows]);
  const BLANK = useMemo<AbilityScoreMap>(() => {
    const out: AbilityScoreMap = {};
    for (const k of ABILITIES) out[k] = 8;
    return out;
  }, [ABILITIES]);

  const [rolls, setRolls] = useState<Record<string, DiceRoll>>({});
  const [arrayAssignments, setArrayAssignments] = useState<Record<string, number>>(() => {
    if (abilityScoreMethod !== 'standard_array' || !abilityScores) return {};
    const out: Record<string, number> = {};
    for (const k of ABILITIES) {
      const v = (abilityScores as unknown as AbilityScoreMap)[k];
      if (typeof v === 'number') out[k] = v;
    }
    return out;
  });
  const [selectedArrayValue, setSelectedArrayValue] = useState<number | null>(null);

  useEffect(() => {
    if (abilityScoreMethod === 'roll_dice' && abilityScores === null) {
      setAbilityScores({ ...BLANK } as unknown as Dnd5eAbilityScores);
    }
  }, [abilityScoreMethod, BLANK]);

  const scores: AbilityScoreMap = (abilityScores as unknown as AbilityScoreMap) ?? BLANK;

  // ── Roll Dice ──────────────────────────────────────────────────────────────
  function rollAbility(ab: string) {
    const r = roll4d6Drop();
    const next = { ...rolls, [ab]: r };
    setRolls(next);
    setAbilityScores({ ...scores, [ab]: r.sum } as unknown as Dnd5eAbilityScores);
  }
  function rollAll() {
    const nr: Record<string, DiceRoll> = {};
    const ns: AbilityScoreMap = { ...BLANK };
    for (const ab of ABILITIES) { const r = roll4d6Drop(); nr[ab] = r; ns[ab] = r.sum; }
    setRolls(nr); setAbilityScores(ns as unknown as Dnd5eAbilityScores);
  }
  const allRolled = ABILITIES.every((a) => rolls[a] !== undefined);

  // ── Standard Array ─────────────────────────────────────────────────────────
  function assignArrayValue(ab: string) {
    if (selectedArrayValue === null) {
      const cur = arrayAssignments[ab];
      if (cur !== undefined) {
        const next = { ...arrayAssignments };
        delete next[ab];
        setArrayAssignments(next);
        syncArray(next);
      }
      return;
    }
    const next = { ...arrayAssignments };
    for (const a of ABILITIES) { if (next[a] === selectedArrayValue) delete next[a]; }
    next[ab] = selectedArrayValue;
    setArrayAssignments(next);
    setSelectedArrayValue(null);
    syncArray(next);
  }
  function syncArray(asgn: Record<string, number>) {
    const s: AbilityScoreMap = { ...BLANK };
    for (const a of ABILITIES) { if (asgn[a] !== undefined) s[a] = asgn[a]; }
    setAbilityScores(s as unknown as Dnd5eAbilityScores);
  }
  const usedArrayVals = Object.values(arrayAssignments).filter((v): v is number => v !== undefined);

  // ── Point Buy ──────────────────────────────────────────────────────────────
  function stepPointBuy(ab: string, delta: number) {
    const next = scores[ab] + delta;
    if (next < 8 || next > 15) return;
    const ns: AbilityScoreMap = { ...scores, [ab]: next };
    const spent = ABILITIES.reduce((acc, a) => acc + (POINT_COST[ns[a]] ?? 0), 0);
    if (spent > POINT_BUDGET) return;
    setAbilityScores(ns as unknown as Dnd5eAbilityScores);
  }
  const pointsSpent = ABILITIES.reduce((acc, a) => acc + (POINT_COST[scores[a]] ?? 0), 0);
  const pointsRemaining = POINT_BUDGET - pointsSpent;

  // ── Manual ─────────────────────────────────────────────────────────────────
  function updateManual(ab: string, raw: string) {
    const n = parseInt(raw, 10);
    if (isNaN(n)) return;
    setAbilityScores({ ...scores, [ab]: Math.max(1, Math.min(30, n)) } as unknown as Dnd5eAbilityScores);
  }

  return (
    <ScrollView contentContainerStyle={s.container} showsVerticalScrollIndicator={false}>
      <Text style={s.title}>Assign ability scores</Text>
      <Text style={s.guidance}>Pick a method. Your modifier (shown next to each score) is what matters at the table.</Text>

      {/* Segmented method switcher */}
      <View style={s.methodBar}>
        {METHODS.map((m) => (
          <TouchableOpacity
            key={m.key}
            style={[s.methodBtn, abilityScoreMethod === m.key && s.methodBtnActive]}
            onPress={() => setAbilityScoreMethod(m.key)}
          >
            <Text style={[s.methodBtnText, abilityScoreMethod === m.key && s.methodBtnTextActive]}>
              {m.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── POINT BUY ─────────────────────────────────────────────────────── */}
      {abilityScoreMethod === 'point_buy' && (
        <>
          <View style={s.budgetCard}>
            <Text style={s.budgetLabel}>POINTS REMAINING</Text>
            <Text style={[
              s.budgetNum,
              pointsRemaining === 0 && { color: colors.hpHealthy },
              pointsRemaining < 0 && { color: colors.hpDanger },
            ]}>{pointsRemaining}</Text>
          </View>
          {abilityRows.map(({ key: ab, label, short, description }) => (
            <AbilityRow key={ab} label={label} short={short} description={description} right={
              <View style={s.stepperRow}>
                <StepBtn onPress={() => stepPointBuy(ab, -1)} disabled={scores[ab] <= 8}>−</StepBtn>
                <ScorePill score={scores[ab]} />
                <StepBtn
                  onPress={() => stepPointBuy(ab, 1)}
                  disabled={scores[ab] >= 15 || pointsRemaining < ((POINT_COST[scores[ab] + 1] ?? 99) - POINT_COST[scores[ab]])}
                >+</StepBtn>
              </View>
            } />
          ))}
        </>
      )}

      {/* ── STANDARD ARRAY ────────────────────────────────────────────────── */}
      {abilityScoreMethod === 'standard_array' && (
        <>
          <Text style={s.subGuidance}>Pick a value, then tap an ability to assign it. Tap an assigned ability to clear it.</Text>
          <View style={s.arrayValues}>
            {STANDARD_ARRAY.map((v) => {
              const used = usedArrayVals.includes(v);
              const sel = selectedArrayValue === v;
              return (
                <TouchableOpacity
                  key={v}
                  style={[s.arrayVal, sel && s.arrayValSelected, used && s.arrayValUsed]}
                  onPress={() => setSelectedArrayValue(sel ? null : v)}
                  disabled={used}
                >
                  <Text style={[s.arrayValText, sel && s.arrayValTextSelected]}>{v}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {abilityRows.map(({ key: ab, label, short, description }) => {
            const val = arrayAssignments[ab];
            return (
              <AbilityRow key={ab} label={label} short={short} description={description} right={
                <TouchableOpacity
                  style={[s.assignSlot, val !== undefined && s.assignSlotFilled]}
                  onPress={() => assignArrayValue(ab)}
                >
                  {val !== undefined ? (
                    <>
                      <Text style={s.assignScore}>{val}</Text>
                      <Text style={s.assignMod}>{fmtMod(val)}</Text>
                    </>
                  ) : (
                    <Text style={s.assignEmpty}>
                      {selectedArrayValue !== null ? `Assign ${selectedArrayValue}` : 'Tap to assign'}
                    </Text>
                  )}
                </TouchableOpacity>
              } />
            );
          })}
        </>
      )}

      {/* ── ROLL 4D6 ──────────────────────────────────────────────────────── */}
      {abilityScoreMethod === 'roll_dice' && (
        <>
          <View style={s.rollHeader}>
            <Text style={s.subGuidance} >Roll 4d6, drop the lowest for each ability.</Text>
            <TouchableOpacity style={s.rollAllBtn} onPress={rollAll}>
              <Text style={s.rollAllBtnText}>{allRolled ? '↺ REROLL ALL' : '🎲 ROLL ALL'}</Text>
            </TouchableOpacity>
          </View>
          {abilityRows.map(({ key: ab, label, short, description }) => {
            const r = rolls[ab];
            return (
              <AbilityRow key={ab} label={label} short={short} description={description} right={
                <View style={s.rollRight}>
                  <View style={s.diceRow}>
                    {(r ? r.dice : [0, 0, 0, 0]).map((d, i) => (
                      <View key={i} style={[
                        s.diePip,
                        i === 3 && (r ? s.diePipDropped : s.diePipEmpty),
                        !r && s.diePipEmpty,
                      ]}>
                        <Text style={[
                          s.diePipText,
                          i === 3 && r && s.diePipTextDropped,
                          !r && s.diePipTextEmpty,
                        ]}>{r ? d : '?'}</Text>
                      </View>
                    ))}
                  </View>
                  <TouchableOpacity
                    style={[s.rollBtn, r && s.rollBtnUsed]}
                    onPress={() => rollAbility(ab)}
                  >
                    <Text style={[s.rollBtnText, r && s.rollBtnTextUsed]}>{r ? '↺' : 'Roll'}</Text>
                  </TouchableOpacity>
                  {r && <ScorePill score={scores[ab]} />}
                </View>
              } />
            );
          })}
          {!allRolled && (
            <Text style={s.rollHint}>Unrolled abilities default to 8.</Text>
          )}
        </>
      )}

      {/* ── MANUAL ────────────────────────────────────────────────────────── */}
      {abilityScoreMethod === 'roll' && (
        <>
          <Text style={s.subGuidance}>Enter scores rolled outside the app. Typical range: 3–18.</Text>
          {abilityRows.map(({ key: ab, label, short, description }) => (
            <AbilityRow key={ab} label={label} short={short} description={description} right={
              <View style={s.manualRow}>
                <TextInput
                  style={s.manualInput}
                  keyboardType="number-pad"
                  value={String(scores[ab])}
                  onChangeText={(t) => updateManual(ab, t)}
                  maxLength={2}
                  selectTextOnFocus
                />
                <Text style={s.manualMod}>{fmtMod(scores[ab])}</Text>
              </View>
            } />
          ))}
        </>
      )}
    </ScrollView>
  );
}

function AbilityRow({ label, short, description, right }: {
  label: string;
  short: string;
  description: string;
  right: React.ReactNode;
}) {
  return (
    <View style={s.abilityRow}>
      <View style={s.abilityBadge}>
        <Text style={s.abilityShort}>{short}</Text>
      </View>
      <View style={s.abilityInfo}>
        <Text style={s.abilityName}>{label}</Text>
        <Text style={s.abilityBlurb}>{description}</Text>
      </View>
      <View style={s.abilityRight}>{right}</View>
    </View>
  );
}

function ScorePill({ score }: { score: number }) {
  return (
    <View style={s.scorePill}>
      <Text style={s.scorePillScore}>{score}</Text>
      <Text style={s.scorePillMod}>{fmtMod(score)}</Text>
    </View>
  );
}

function StepBtn({ children, onClick, onPress, disabled }: {
  children: string; onClick?: () => void; onPress?: () => void; disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[s.stepBtn, disabled && s.stepBtnDisabled]}
      onPress={onPress ?? onClick}
      disabled={disabled}
    >
      <Text style={[s.stepBtnText, disabled && s.stepBtnTextDisabled]}>{children}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  container: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl },
  title: {
    fontSize: 26, fontFamily: fonts.headline, fontWeight: '700',
    color: colors.onSurface, letterSpacing: -0.5, marginTop: 12, marginBottom: 8, lineHeight: 30,
  },
  guidance: { fontSize: 13, fontFamily: fonts.body, color: colors.onSurfaceVariant, lineHeight: 19, marginBottom: 14 },
  subGuidance: { fontSize: 12, fontFamily: fonts.body, color: colors.onSurfaceVariant, lineHeight: 17, marginBottom: 12 },
  // Method switcher
  methodBar: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: 999,
    padding: 3,
    marginBottom: 16,
  },
  methodBtn: {
    flex: 1, paddingVertical: 8, paddingHorizontal: 6, borderRadius: 999,
    alignItems: 'center',
  },
  methodBtnActive: { backgroundColor: colors.primary },
  methodBtnText: {
    fontSize: 11, fontFamily: fonts.label, fontWeight: '600',
    letterSpacing: 0.5, textTransform: 'uppercase', color: colors.onSurfaceVariant,
  },
  methodBtnTextActive: { color: colors.onPrimary },
  // Budget card
  budgetCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: colors.surfaceContainerLow, borderWidth: 1,
    borderColor: colors.outlineVariant, borderRadius: radius.xl, marginBottom: 6,
  },
  budgetLabel: {
    fontSize: 10, fontFamily: fonts.label, fontWeight: '600',
    letterSpacing: 1.5, textTransform: 'uppercase', color: colors.secondary,
  },
  budgetNum: { fontSize: 22, fontFamily: fonts.headline, fontWeight: '800', color: colors.primary },
  // Ability row
  abilityRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.outlineVariant,
  },
  abilityBadge: {
    width: 46, height: 40, borderRadius: radius.lg,
    backgroundColor: colors.surfaceContainerHigh, borderWidth: 1, borderColor: colors.outlineVariant,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  abilityShort: { fontSize: 12, fontFamily: fonts.headline, fontWeight: '800', color: colors.primary, letterSpacing: 0.8 },
  abilityInfo: { flex: 1, minWidth: 0 },
  abilityName: { fontSize: 14, fontFamily: fonts.headline, fontWeight: '600', color: colors.onSurface, textTransform: 'capitalize' },
  abilityBlurb: { fontSize: 10, fontFamily: fonts.body, color: colors.outline, lineHeight: 14, marginTop: 1 },
  abilityRight: { flexShrink: 0 },
  // Score pill
  scorePill: {
    flexDirection: 'row', alignItems: 'baseline', gap: 4,
    paddingHorizontal: 10, paddingVertical: 4,
    backgroundColor: colors.surfaceContainerHighest, borderWidth: 1, borderColor: colors.outlineVariant,
    borderRadius: radius.lg,
  },
  scorePillScore: { fontSize: 16, fontFamily: fonts.headline, fontWeight: '800', color: colors.onSurface },
  scorePillMod: { fontSize: 11, fontFamily: fonts.body, fontWeight: '700', color: colors.primary },
  // Point buy stepper
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepBtn: {
    width: 30, height: 30, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainerHigh,
    alignItems: 'center', justifyContent: 'center',
  },
  stepBtnDisabled: { opacity: 0.4 },
  stepBtnText: { fontSize: 18, fontFamily: fonts.body, fontWeight: '600', color: colors.onSurface, lineHeight: 22 },
  stepBtnTextDisabled: { color: colors.outlineVariant },
  // Standard array
  arrayValues: { flexDirection: 'row', gap: 6, marginBottom: 14, flexWrap: 'wrap' },
  arrayVal: {
    width: 48, height: 48, borderRadius: radius.xl,
    borderWidth: 1, borderColor: colors.outlineVariant, backgroundColor: colors.surfaceContainerHigh,
    alignItems: 'center', justifyContent: 'center',
  },
  arrayValSelected: {
    borderColor: colors.primary,
    backgroundColor: `${colors.primary}33`,
    shadowColor: colors.primary, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.4, shadowRadius: 6,
  },
  arrayValUsed: { opacity: 0.25 },
  arrayValText: { fontSize: 18, fontFamily: fonts.headline, fontWeight: '800', color: colors.onSurface },
  arrayValTextSelected: { color: colors.primary },
  assignSlot: {
    minWidth: 84, height: 40, borderRadius: radius.lg,
    borderWidth: 1, borderStyle: 'dashed' as any, borderColor: colors.outlineVariant,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 8,
  },
  assignSlotFilled: { borderStyle: 'solid', borderColor: 'transparent', backgroundColor: colors.surfaceContainerHighest },
  assignScore: { fontSize: 18, fontFamily: fonts.headline, fontWeight: '800', color: colors.onSurface },
  assignMod: { fontSize: 11, fontFamily: fonts.body, fontWeight: '700', color: colors.primary },
  assignEmpty: { fontSize: 12, fontFamily: fonts.body, color: colors.outline },
  // Roll dice
  rollHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, gap: 8 },
  rollAllBtn: {
    paddingVertical: 8, paddingHorizontal: 14, borderRadius: radius.lg,
    backgroundColor: colors.primary, flexShrink: 0,
  },
  rollAllBtnText: { fontSize: 12, fontFamily: fonts.label, fontWeight: '700', color: colors.onPrimary, letterSpacing: 0.5, textTransform: 'uppercase' },
  rollRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  diceRow: { flexDirection: 'row', gap: 3 },
  diePip: {
    width: 22, height: 22, borderRadius: 4,
    borderWidth: 1, borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainerHighest,
    alignItems: 'center', justifyContent: 'center',
  },
  diePipDropped: { borderColor: `${colors.hpDanger}66`, backgroundColor: `${colors.hpDanger}15` },
  diePipEmpty: { borderStyle: 'dashed' as any, opacity: 0.5 },
  diePipText: { fontSize: 11, fontFamily: fonts.headline, fontWeight: '700', color: colors.onSurface },
  diePipTextDropped: { color: colors.hpDanger, textDecorationLine: 'line-through' },
  diePipTextEmpty: { fontSize: 11, color: colors.outlineVariant },
  rollBtn: {
    width: 46, height: 32, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.primary,
    backgroundColor: `${colors.primary}22`,
    alignItems: 'center', justifyContent: 'center',
  },
  rollBtnUsed: { borderColor: colors.outlineVariant, backgroundColor: 'transparent' },
  rollBtnText: { fontSize: 13, fontFamily: fonts.headline, fontWeight: '700', color: colors.primary },
  rollBtnTextUsed: { color: colors.onSurfaceVariant },
  rollHint: { fontSize: 11, fontFamily: fonts.body, color: colors.outline, textAlign: 'center', marginTop: 12 },
  // Manual
  manualRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  manualInput: {
    width: 52, height: 40, textAlign: 'center',
    fontSize: 17, fontFamily: fonts.headline, fontWeight: '800',
    color: colors.onSurface, backgroundColor: colors.surfaceContainerHigh,
    borderWidth: 1, borderColor: colors.outlineVariant, borderRadius: radius.lg,
  },
  manualMod: { fontSize: 11, fontFamily: fonts.body, fontWeight: '700', color: colors.primary, minWidth: 28 },
});
