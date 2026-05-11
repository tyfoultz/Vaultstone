import { useState, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, TextInput, ScrollView, StyleSheet } from 'react-native';
import { useCharacterDraftStore } from '@vaultstone/store';
import { useShallow } from 'zustand/react/shallow';
import {
  BUNDLED_SYSTEMS_BY_ID, getAbilityAttributes,
  computeAsiContext, type AsiContext,
} from '@vaultstone/systems';
import { ContentResolver } from '@vaultstone/content';
import { colors, fonts, spacing, radius } from '@vaultstone/ui';
import type { BackgroundResult, Dnd5eAbilityScores, SpeciesResult } from '@vaultstone/types';

const ABILITY_CODE: Record<string, string> = {
  strength: 'STR', dexterity: 'DEX', constitution: 'CON',
  intelligence: 'INT', wisdom: 'WIS', charisma: 'CHA',
};

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
  const {
    abilityScoreMethod, abilityScores, setAbilityScoreMethod, setAbilityScores,
    system, srdVersion, speciesKey, backgroundKey,
    speciesAbilityChoices, setSpeciesAbilityChoices,
    campaignId, selectedPackIds, campaignRules,
  } = useCharacterDraftStore(
    useShallow((s) => ({
      abilityScoreMethod: s.abilityScoreMethod,
      abilityScores: s.abilityScores,
      setAbilityScoreMethod: s.setAbilityScoreMethod,
      setAbilityScores: s.setAbilityScores,
      system: s.system,
      srdVersion: s.srdVersion,
      speciesKey: s.speciesKey,
      backgroundKey: s.backgroundKey,
      speciesAbilityChoices: s.speciesAbilityChoices,
      setSpeciesAbilityChoices: s.setSpeciesAbilityChoices,
      campaignId: s.campaignId,
      selectedPackIds: s.selectedPackIds,
      campaignRules: s.campaignRules,
    }))
  );

  // Resolve the picked species + background so the ASI context can
  // figure out who grants the +2/+1 (species in 5.1, background in
  // 5.2) and whether Customize Origin applies. ContentResolver
  // mirrors the StepSpecies / StepBackground scope (campaign packs
  // or standalone opt-in) so imported homebrew flows through.
  const [species, setSpeciesResult] = useState<SpeciesResult | null>(null);
  const [background, setBackgroundResult] = useState<BackgroundResult | null>(null);
  useEffect(() => {
    let cancelled = false;
    const includeHomebrew = !!campaignId || selectedPackIds.length > 0;
    const tiers: Array<'srd' | 'homebrew'> = includeHomebrew ? ['srd', 'homebrew'] : ['srd'];
    const tierArgs = {
      system: 'dnd5e' as const,
      srdVersion,
      tiers,
      campaignId: campaignId ?? undefined,
      packIds: !campaignId && selectedPackIds.length > 0 ? selectedPackIds : undefined,
    };
    Promise.all([
      speciesKey ? ContentResolver.search({ ...tierArgs, type: 'species' }) : Promise.resolve([]),
      backgroundKey ? ContentResolver.search({ ...tierArgs, type: 'background' }) : Promise.resolve([]),
    ]).then(([sp, bg]) => {
      if (cancelled) return;
      setSpeciesResult(((sp as SpeciesResult[]).find((s) => s.key === speciesKey)) ?? null);
      setBackgroundResult(((bg as BackgroundResult[]).find((b) => b.key === backgroundKey)) ?? null);
    });
    return () => { cancelled = true; };
  }, [speciesKey, backgroundKey, srdVersion, campaignId, selectedPackIds.join(',')]);

  // The ASI context — single source of truth for who grants the
  // +2/+1 budget and how the player allocates it. Drives the panel
  // below + the finalize math (via the same helper).
  const customizeOrigin = (campaignRules.customize_origin as boolean | undefined) !== false;
  const asiContext: AsiContext = useMemo(
    () => computeAsiContext({ species, background, srdVersion, customizeOrigin }),
    [species, background, srdVersion, customizeOrigin],
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

      {/* ── Ability Score Increases ─────────────────────────────────────────────
          Single allocator driven by the resolved AsiContext. The
          context resolves to one of four modes based on edition + CYO:

            5.1 + CYO off → species-fixed (Dwarf +2 CON applies, plus
                            any Half-Elf-style choice picker)
            5.1 + CYO on  → species-custom-origin (player allocates the
                            species ASI budget freely)
            5.2 + CYO off → background-fixed (player picks +2/+1 from
                            the background's listed three abilities)
            5.2 + CYO on  → background-custom-origin (player picks +2/+1
                            from any 6 abilities)

          'none' hides the panel entirely (early-step state or a
          non-caster homebrew with no ASI data). */}
      {asiContext.mode !== 'none' && (
        <AsiAllocatorPanel
          context={asiContext}
          abilityRows={abilityRows}
          rawScores={scores}
          picks={speciesAbilityChoices}
          onPicksChange={setSpeciesAbilityChoices}
        />
      )}
    </ScrollView>
  );
}

// ASI allocator — single panel for all four resolution modes. Reads
// the AsiContext and renders the right UX:
//
//   species-fixed       → read-only fixed bonus chips + Half-Elf-style
//                         choice clause picker (Half-Elf still picks
//                         their two +1s even with CYO off)
//   species-custom-origin
//   background-fixed    → 2024 background grants +2/+1 from the
//                         listed three abilities; player picks which
//                         gets the +2 and which gets a +1
//   background-custom-origin → +2/+1 across any 6 abilities
//
// All four modes share the final-scores preview at the bottom so the
// player always sees the actual values they'll commit.
function AsiAllocatorPanel({
  context, abilityRows, rawScores, picks, onPicksChange,
}: {
  context: AsiContext;
  abilityRows: Array<{ key: string; label: string; short: string; description: string }>;
  rawScores: Record<string, number>;
  picks: Record<string, number>;
  onPicksChange: (next: Record<string, number>) => void;
}) {
  // Player-allocated modes use the same 3-point budget. The 2014
  // species-custom-origin case can have a different budget if the
  // species' fixed ASIs summed to more or less than 3, but in
  // practice every 5.1 species totals exactly 3 (Dwarf +2 alone,
  // Half-Orc +2/+1, Tiefling +2/+1, etc.) so we can treat the
  // player-allocated UI as universal.
  const isPlayerAllocated =
    context.mode === 'species-custom-origin'
    || context.mode === 'background-custom-origin'
    || context.mode === 'background-fixed';

  // For player-allocated modes: derive the active distribution from
  // the current allocation. +2/+1 mode has one ability at 2; +1×3 has
  // three abilities at 1 each.
  const allocated = Object.entries(picks).filter(([, v]) => v > 0);
  const mode21 = allocated.some(([, v]) => v === 2)
    || (allocated.length === 0); // default
  const detectedMode: '2-1' | '1-1-1' = mode21 ? '2-1' : '1-1-1';

  function switchMode(next: '2-1' | '1-1-1') {
    if (next === detectedMode) return;
    onPicksChange({});
  }

  function togglePlayerAllocation(ability: string) {
    const lc = ability.toLowerCase();
    const allowedPool = context.allowedAbilities.map((a) => a.toLowerCase());
    if (!allowedPool.includes(lc)) return;
    const current = picks[lc] ?? 0;

    if (detectedMode === '2-1') {
      const has2 = allocated.find(([, v]) => v === 2);
      const has1 = allocated.find(([, v]) => v === 1);
      if (current === 0) {
        if (!has2) onPicksChange({ ...picks, [lc]: 2 });
        else if (!has1 && has2[0] !== lc) onPicksChange({ ...picks, [lc]: 1 });
        return;
      }
      const next = { ...picks }; delete next[lc];
      onPicksChange(next);
      return;
    }
    if (current === 0) {
      if (allocated.length >= 3) return;
      onPicksChange({ ...picks, [lc]: 1 });
    } else {
      const next = { ...picks }; delete next[lc];
      onPicksChange(next);
    }
  }

  // For species-fixed Half-Elf-style choice clauses, the player still
  // picks ability slots even with CYO off. Toggle behavior mirrors
  // the prior SpeciesAsiPanel since the clause shape is identical.
  function toggleChoice(clauseIdx: number, ability: string) {
    const clause = context.fixedChoices[clauseIdx];
    if (!clause) return;
    const lc = ability.toLowerCase();
    const cur = picks[lc] ?? 0;
    if (cur > 0) {
      const next = { ...picks };
      const remaining = cur - clause.amount;
      if (remaining <= 0) delete next[lc]; else next[lc] = remaining;
      onPicksChange(next);
      return;
    }
    const allowed = clause.count * clause.amount;
    const usedInClause = clause.from
      .map((a) => picks[a.toLowerCase()] ?? 0)
      .reduce((sum, v) => sum + v, 0);
    if (usedInClause + clause.amount > allowed) return;
    onPicksChange({ ...picks, [lc]: cur + clause.amount });
  }

  return (
    <View style={s.asiPanel}>
      <Text style={s.asiPanelTitle}>Ability Score Increases</Text>
      <Text style={s.asiClauseLabel}>{context.sourceLabel}</Text>

      {/* species-fixed: read-only chips for the fixed bonuses. */}
      {context.mode === 'species-fixed' && context.fixedBonuses.length > 0 && (
        <View style={[s.asiChipRow, { marginTop: spacing.sm }]}>
          {context.fixedBonuses.map((a, i) => (
            <View key={`fixed-${i}`} style={s.asiFixedChip}>
              <Text style={s.asiFixedChipText}>
                {`+${a.amount} ${ABILITY_CODE[a.ability.toLowerCase()] ?? a.ability.slice(0, 3).toUpperCase()}`}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* species-fixed: per-clause picker (Half-Elf 5.1). */}
      {context.mode === 'species-fixed' && context.fixedChoices.map((clause, ci) => {
        const usedInClause = clause.from
          .map((a) => picks[a.toLowerCase()] ?? 0)
          .reduce((sum, v) => sum + v, 0);
        const allowed = clause.count * clause.amount;
        return (
          <View key={ci} style={{ marginTop: spacing.sm }}>
            <Text style={s.asiClauseLabel}>
              {`Pick ${clause.count}: +${clause.amount} (${usedInClause}/${allowed} allocated)`}
            </Text>
            <View style={s.asiChipRow}>
              {clause.from.map((ab) => {
                const lc = ab.toLowerCase();
                const isOn = (picks[lc] ?? 0) > 0;
                const atCap = !isOn && usedInClause >= allowed;
                return (
                  <TouchableOpacity
                    key={ab}
                    style={[s.asiChoiceChip, isOn && s.asiChoiceChipOn, atCap && s.asiChoiceChipDisabled]}
                    onPress={() => toggleChoice(ci, ab)}
                    activeOpacity={0.7}
                    disabled={atCap}
                  >
                    <Text style={[s.asiChoiceChipText, isOn && s.asiChoiceChipTextOn]}>
                      {ABILITY_CODE[lc] ?? ab.slice(0, 3).toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        );
      })}

      {/* player-allocated modes: distribution toggle + chip-tap picker. */}
      {isPlayerAllocated && (
        <>
          <View style={[s.asiChipRow, { marginTop: spacing.sm }]}>
            <TouchableOpacity
              style={[s.originModeBtn, detectedMode === '2-1' && s.originModeBtnOn]}
              onPress={() => switchMode('2-1')}
            >
              <Text style={[s.originModeText, detectedMode === '2-1' && s.originModeTextOn]}>+2 / +1</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.originModeBtn, detectedMode === '1-1-1' && s.originModeBtnOn]}
              onPress={() => switchMode('1-1-1')}
            >
              <Text style={[s.originModeText, detectedMode === '1-1-1' && s.originModeTextOn]}>+1 / +1 / +1</Text>
            </TouchableOpacity>
          </View>
          <View style={[s.asiChipRow, { marginTop: spacing.sm }]}>
            {abilityRows.map(({ key: ab, short }) => {
              const lc = ab.toLowerCase();
              const cur = picks[lc] ?? 0;
              const inPool = context.allowedAbilities.length === 0
                || context.allowedAbilities.includes(lc);
              return (
                <TouchableOpacity
                  key={ab}
                  style={[
                    s.asiChoiceChip,
                    cur > 0 && s.asiChoiceChipOn,
                    !inPool && s.asiChoiceChipDisabled,
                  ]}
                  onPress={() => togglePlayerAllocation(ab)}
                  activeOpacity={inPool ? 0.7 : 1}
                  disabled={!inPool}
                >
                  <Text style={[s.asiChoiceChipText, cur > 0 && s.asiChoiceChipTextOn]}>
                    {short}{cur > 0 ? ` +${cur}` : ''}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      )}

      {/* Final-score preview — raw + bonus per ability + mod. */}
      <Text style={[s.asiClauseLabel, { marginTop: spacing.md }]}>Final scores</Text>
      <View style={s.asiPreviewGrid}>
        {abilityRows.map(({ key: ab, short }) => {
          const raw = rawScores[ab] ?? 10;
          // Bonus = fixed (species-fixed mode only) + player picks.
          const fixed = context.mode === 'species-fixed'
            ? context.fixedBonuses
              .filter((a) => a.ability.toLowerCase() === ab.toLowerCase())
              .reduce((sum, a) => sum + a.amount, 0)
            : 0;
          const chosen = picks[ab.toLowerCase()] ?? 0;
          const bonus = fixed + chosen;
          const total = raw + bonus;
          const mod = Math.floor((total - 10) / 2);
          return (
            <View key={ab} style={s.asiPreviewCell}>
              <Text style={s.asiPreviewLabel}>{short}</Text>
              <Text style={s.asiPreviewTotal}>{total}</Text>
              {bonus > 0 ? (
                <Text style={s.asiPreviewBonus}>{`${raw} + ${bonus}`}</Text>
              ) : (
                <Text style={s.asiPreviewBonus}>{`${raw}`}</Text>
              )}
              <Text style={s.asiPreviewMod}>{mod >= 0 ? `+${mod}` : `${mod}`}</Text>
            </View>
          );
        })}
      </View>
    </View>
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
  // ── Species ASI panel ─────────────────────────────────────────────────
  asiPanel: {
    marginTop: spacing.lg,
    padding: spacing.md,
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1, borderColor: `${colors.primary}33`,
    borderRadius: radius.xl,
  },
  asiPanelTitle: {
    fontSize: 14, fontFamily: fonts.headline, fontWeight: '700',
    color: colors.onSurface, marginBottom: spacing.sm,
  },
  asiClauseLabel: {
    fontSize: 11, fontFamily: fonts.label, fontWeight: '600',
    color: colors.onSurfaceVariant, letterSpacing: 0.4,
    marginBottom: 6,
  },
  asiChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  asiFixedChip: {
    paddingHorizontal: 10, paddingVertical: 5,
    backgroundColor: colors.primaryContainer,
    borderWidth: 1, borderColor: `${colors.primary}55`,
    borderRadius: 999,
  },
  asiFixedChipText: {
    fontSize: 11, fontFamily: fonts.label, fontWeight: '700',
    color: colors.primary, letterSpacing: 0.5,
  },
  asiChoiceChip: {
    paddingHorizontal: 10, paddingVertical: 5,
    backgroundColor: colors.surfaceContainerHigh,
    borderWidth: 1, borderColor: colors.outlineVariant,
    borderRadius: 999,
  },
  asiChoiceChipOn: {
    backgroundColor: colors.primaryContainer,
    borderColor: `${colors.primary}55`,
  },
  asiChoiceChipDisabled: { opacity: 0.4 },
  asiChoiceChipText: {
    fontSize: 11, fontFamily: fonts.label, fontWeight: '700',
    color: colors.onSurfaceVariant, letterSpacing: 0.5,
  },
  asiChoiceChipTextOn: { color: colors.primary },
  asiPreviewGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4,
  },
  asiPreviewCell: {
    flexGrow: 1, minWidth: 80,
    paddingVertical: 8, paddingHorizontal: 10,
    backgroundColor: colors.surfaceContainerHigh,
    borderWidth: 1, borderColor: colors.outlineVariant,
    borderRadius: radius.lg,
    alignItems: 'center',
  },
  asiPreviewLabel: {
    fontSize: 9, fontFamily: fonts.label, fontWeight: '700',
    color: colors.outline, letterSpacing: 1.2,
  },
  asiPreviewTotal: {
    fontSize: 18, fontFamily: fonts.headline, fontWeight: '700',
    color: colors.onSurface, marginTop: 2,
  },
  asiPreviewBonus: {
    fontSize: 10, fontFamily: fonts.body, color: colors.outline, marginTop: 1,
  },
  asiPreviewMod: {
    fontSize: 11, fontFamily: fonts.label, fontWeight: '600',
    color: colors.primary, marginTop: 2,
  },
  originModeBtn: {
    paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: colors.surfaceContainerHigh,
    borderWidth: 1, borderColor: colors.outlineVariant,
    borderRadius: 999,
  },
  originModeBtnOn: {
    backgroundColor: colors.primaryContainer,
    borderColor: `${colors.primary}55`,
  },
  originModeText: {
    fontSize: 12, fontFamily: fonts.label, fontWeight: '700',
    color: colors.onSurfaceVariant, letterSpacing: 0.5,
  },
  originModeTextOn: { color: colors.primary },

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
