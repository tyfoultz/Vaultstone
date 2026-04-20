import { View, Text, TouchableOpacity, TextInput, ScrollView, StyleSheet } from 'react-native';
import { colors, fonts, spacing, radius } from '@vaultstone/ui';
import type { Dnd5eStats, Dnd5eResources, Dnd5eAbilityScores, Dnd5eEquipmentItem } from '@vaultstone/types';
import type { RollResult } from './RollToast';

const ABILITY_KEYS: (keyof Dnd5eAbilityScores)[] = [
  'strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma',
];
const ABILITY_SHORT: Record<keyof Dnd5eAbilityScores, string> = {
  strength: 'STR', dexterity: 'DEX', constitution: 'CON',
  intelligence: 'INT', wisdom: 'WIS', charisma: 'CHA',
};

function abilityMod(score: number) { return Math.floor((score - 10) / 2); }
function fmtMod(n: number) { return n >= 0 ? `+${n}` : `${n}`; }

interface Props {
  stats: Dnd5eStats;
  resources: Dnd5eResources;
  scores: Dnd5eAbilityScores;
  prof: number;
  activeConditions: string[];
  showDeathSaves: boolean;
  isDead: boolean;
  isStabilized: boolean;
  canEditAny: boolean;
  equipment: Dnd5eEquipmentItem[];
  onRoll: (result: RollResult) => void;
  onToggleCondition: (c: string) => void;
  onDeathSave: (type: 'success' | 'failure') => void;
  getAttackBonus: (item: Dnd5eEquipmentItem) => number;
}

function rollD20(label: string, bonus: number, onRoll: (r: RollResult) => void) {
  const r = Math.floor(Math.random() * 20) + 1;
  onRoll({ label, rolls: [r], bonus, total: r + bonus, crit: r === 20, fumble: r === 1 });
}

function rollDamage(label: string, dice: string, onRoll: (r: RollResult) => void) {
  const m = String(dice).match(/(\d+)d(\d+)(?:([+-])(\d+))?/);
  if (!m) return;
  const n = parseInt(m[1]); const sides = parseInt(m[2]);
  const sign = m[3] === '-' ? -1 : 1;
  const base = m[4] ? sign * parseInt(m[4]) : 0;
  const rolls = Array.from({ length: n }, () => Math.floor(Math.random() * sides) + 1);
  onRoll({ label, rolls, bonus: base, total: rolls.reduce((a, b) => a + b, 0) + base });
}

const ALL_CONDITIONS = ['Blinded', 'Charmed', 'Deafened', 'Exhausted', 'Frightened', 'Grappled', 'Incapacitated', 'Invisible', 'Paralyzed', 'Petrified', 'Poisoned', 'Prone', 'Restrained', 'Stunned', 'Unconscious'];

export function CombatTab({
  stats, resources, scores, prof,
  activeConditions, showDeathSaves, isDead, isStabilized,
  canEditAny, equipment, onRoll, onToggleCondition, onDeathSave, getAttackBonus,
}: Props) {
  const weapons = equipment.filter((e) => e.slot === 'weapon' && e.equipped);
  const passivePerception = 10 + (abilityMod(scores.wisdom) + (stats.skillProficiencies.includes('perception') ? prof : 0));

  return (
    <ScrollView contentContainerStyle={s.container} showsVerticalScrollIndicator={false}>

      {/* ── ABILITY SCORES ── */}
      <SectionLabel>ABILITIES · TAP TO CHECK</SectionLabel>
      <View style={s.abilityGrid}>
        {ABILITY_KEYS.map((abi) => {
          const score = scores[abi];
          const m = abilityMod(score);
          return (
            <TouchableOpacity
              key={abi}
              style={s.abilityTile}
              onPress={() => rollD20(`${ABILITY_SHORT[abi]} check`, m, onRoll)}
              activeOpacity={0.7}
            >
              <Text style={s.abilityShort}>{ABILITY_SHORT[abi]}</Text>
              <Text style={s.abilityMod}>{fmtMod(m)}</Text>
              <View style={s.abilityScorePill}>
                <Text style={s.abilityScore}>{score}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── SAVING THROWS ── */}
      <SectionLabel style={{ marginTop: 14 }}>SAVING THROWS</SectionLabel>
      <View style={s.savesGrid}>
        {ABILITY_KEYS.map((abi) => {
          const isProf = stats.savingThrowProficiencies.includes(abi);
          const bonus = abilityMod(scores[abi]) + (isProf ? prof : 0);
          return (
            <TouchableOpacity
              key={abi}
              style={[s.saveRow, isProf && s.saveRowProf]}
              onPress={() => rollD20(`${ABILITY_SHORT[abi]} save`, bonus, onRoll)}
              activeOpacity={0.7}
            >
              <View style={[s.profDot, isProf && s.profDotFilled]} />
              <Text style={[s.saveAbility, isProf && s.saveAbilityProf]}>{ABILITY_SHORT[abi]}</Text>
              <Text style={[s.saveBonus, isProf && s.saveBonusProf]}>{fmtMod(bonus)}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── ATTACKS ── */}
      {weapons.length > 0 && (
        <>
          <SectionLabel style={{ marginTop: 14 }} accent>ATTACKS</SectionLabel>
          <View style={s.attacksCard}>
            <View style={s.attacksHeader}>
              <Text style={[s.attacksHeaderCell, { flex: 1 }]}>WEAPON</Text>
              <Text style={[s.attacksHeaderCell, { width: 52, textAlign: 'center' }]}>ATK</Text>
              <Text style={[s.attacksHeaderCell, { width: 80 }]}>DAMAGE</Text>
              <View style={{ width: 44 }} />
            </View>
            {weapons.map((w, i) => {
              const atkBonus = getAttackBonus(w);
              return (
                <View key={w.id} style={[s.attackRow, i < weapons.length - 1 && s.attackRowBorder]}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.attackName}>{w.name}</Text>
                    <Text style={s.attackNotes}>{w.slot}</Text>
                  </View>
                  <TouchableOpacity
                    style={s.rollBtn}
                    onPress={() => rollD20(`${w.name} attack`, atkBonus, onRoll)}
                    activeOpacity={0.7}
                  >
                    <Text style={s.rollBtnText}>{fmtMod(atkBonus)}</Text>
                  </TouchableOpacity>
                  {w.damage ? (
                    <TouchableOpacity
                      style={s.dmgBtn}
                      onPress={() => rollDamage(`${w.name} damage`, w.damage!, onRoll)}
                      activeOpacity={0.7}
                    >
                      <Text style={s.dmgBtnText}>{w.damage.split(' ')[0]}</Text>
                    </TouchableOpacity>
                  ) : <View style={{ width: 44 }} />}
                </View>
              );
            })}
          </View>
        </>
      )}

      {/* ── DEATH SAVES / STATUS ── */}
      {(isDead || isStabilized || showDeathSaves) && (
        <>
          <SectionLabel style={{ marginTop: 14 }}>STATUS</SectionLabel>
          <View style={s.deathCard}>
            {isDead && <Text style={[s.statusText, { color: colors.hpDanger }]}>Dead</Text>}
            {isStabilized && <Text style={[s.statusText, { color: colors.hpWarning }]}>Stabilized</Text>}
            {showDeathSaves && (
              <View style={s.deathSavesRow}>
                <DeathSaveGroup
                  label="Successes"
                  count={resources.deathSaves.successes}
                  max={3}
                  color={colors.hpHealthy}
                  onPress={canEditAny ? () => onDeathSave('success') : undefined}
                />
                <DeathSaveGroup
                  label="Failures"
                  count={resources.deathSaves.failures}
                  max={3}
                  color={colors.hpDanger}
                  onPress={canEditAny ? () => onDeathSave('failure') : undefined}
                />
              </View>
            )}
          </View>
        </>
      )}

      {/* ── CONDITIONS ── */}
      <SectionLabel style={{ marginTop: 14 }}>CONDITIONS</SectionLabel>
      <View style={s.conditionsWrap}>
        {ALL_CONDITIONS.map((c) => {
          const active = activeConditions.map((x) => x.toLowerCase()).includes(c.toLowerCase());
          return (
            <TouchableOpacity
              key={c}
              style={[s.conditionChip, active && s.conditionChipActive]}
              onPress={canEditAny ? () => onToggleCondition(c) : undefined}
              activeOpacity={canEditAny ? 0.7 : 1}
            >
              <Text style={[s.conditionText, active && s.conditionTextActive]}>{c}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── PASSIVES ── */}
      <SectionLabel style={{ marginTop: 14 }}>PASSIVES</SectionLabel>
      <View style={s.passivesRow}>
        <PassiveCard label="Perception" value={passivePerception} />
        <PassiveCard label="Hit Dice" value={`${resources.hitDiceRemaining ?? stats.level}/${stats.level}`} suffix={`d${stats.hitDie}`} />
        <PassiveCard label="Speed" value={stats.speed} suffix=" ft" />
      </View>

      <View style={{ height: 16 }} />
    </ScrollView>
  );
}

function SectionLabel({ children, style, accent }: { children: string; style?: any; accent?: boolean }) {
  return (
    <View style={[s.sectionRow, style]}>
      <Text style={[s.sectionLabel, accent && s.sectionLabelAccent]}>{children}</Text>
      <View style={[s.sectionLine, accent && s.sectionLineAccent]} />
    </View>
  );
}

function DeathSaveGroup({ label, count, max, color, onPress }: {
  label: string; count: number; max: number; color: string; onPress?: () => void;
}) {
  return (
    <TouchableOpacity style={s.deathGroup} onPress={onPress} disabled={!onPress} activeOpacity={0.7}>
      <Text style={[s.deathGroupLabel, { color }]}>{label}</Text>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {Array.from({ length: max }).map((_, i) => (
          <View key={i} style={[s.deathDot, { borderColor: color }, i < count && { backgroundColor: color }]} />
        ))}
      </View>
    </TouchableOpacity>
  );
}

function PassiveCard({ label, value, suffix }: { label: string; value: number | string; suffix?: string }) {
  return (
    <View style={s.passiveCard}>
      <Text style={s.passiveLabel}>{label}</Text>
      <Text style={s.passiveValue}>
        {value}
        {suffix ? <Text style={s.passiveSuffix}>{suffix}</Text> : null}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { paddingHorizontal: spacing.md, paddingTop: 14, paddingBottom: 16 },

  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  sectionLabel: {
    fontSize: 9, fontFamily: fonts.label, fontWeight: '700',
    letterSpacing: 1.5, textTransform: 'uppercase', color: colors.outline,
  },
  sectionLabelAccent: { color: colors.primary },
  sectionLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.outlineVariant },
  sectionLineAccent: { backgroundColor: `${colors.primary}44` },

  // Ability scores
  abilityGrid: { flexDirection: 'row', gap: 6 },
  abilityTile: {
    flex: 1, alignItems: 'center', padding: 10,
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1, borderColor: colors.outlineVariant,
    borderRadius: radius.lg,
  },
  abilityShort: {
    fontSize: 9, fontFamily: fonts.label, fontWeight: '700',
    letterSpacing: 1.2, color: colors.outline,
  },
  abilityMod: {
    fontSize: 22, fontFamily: fonts.headline, fontWeight: '800',
    color: colors.primary, lineHeight: 26,
  },
  abilityScorePill: {
    marginTop: 2, paddingHorizontal: 8, paddingVertical: 1,
    backgroundColor: colors.surfaceContainerHighest,
    borderRadius: 999, borderWidth: 1, borderColor: colors.outlineVariant,
  },
  abilityScore: {
    fontSize: 10, fontFamily: fonts.headline, fontWeight: '600',
    color: colors.onSurfaceVariant,
  },

  // Saving throws
  savesGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 6,
  },
  saveRow: {
    width: '30.5%',
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 9,
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1, borderColor: colors.outlineVariant,
    borderRadius: radius.lg,
  },
  saveRowProf: {
    borderColor: `${colors.primary}55`,
    backgroundColor: `${colors.primaryContainer}22`,
  },
  profDot: {
    width: 10, height: 10, borderRadius: 5,
    borderWidth: 1.5, borderColor: colors.outline,
  },
  profDotFilled: { backgroundColor: colors.primary, borderColor: colors.primary },
  saveAbility: {
    fontSize: 10, fontFamily: fonts.label, fontWeight: '700',
    letterSpacing: 1, color: colors.onSurfaceVariant, flex: 1,
  },
  saveAbilityProf: { color: colors.onSurface },
  saveBonus: {
    fontSize: 12, fontFamily: fonts.headline, fontWeight: '700',
    color: colors.onSurfaceVariant,
  },
  saveBonusProf: { color: colors.primary },

  // Attacks
  attacksCard: {
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1, borderColor: colors.outlineVariant,
    borderRadius: radius.lg, overflow: 'hidden',
  },
  attacksHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, paddingVertical: 7,
    backgroundColor: colors.surfaceContainerLowest,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.outlineVariant,
  },
  attacksHeaderCell: {
    fontSize: 9, fontFamily: fonts.label, fontWeight: '700',
    letterSpacing: 1.5, textTransform: 'uppercase', color: colors.outline,
  },
  attackRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, paddingVertical: 10, gap: 8,
  },
  attackRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.outlineVariant },
  attackName: { fontSize: 13, fontFamily: fonts.headline, fontWeight: '600', color: colors.onSurface },
  attackNotes: { fontSize: 10, color: colors.outline },
  rollBtn: {
    width: 52, paddingVertical: 7,
    backgroundColor: colors.surfaceContainerHighest,
    borderWidth: 1, borderColor: colors.outlineVariant,
    borderRadius: radius.lg, alignItems: 'center',
  },
  rollBtnText: { fontSize: 13, fontFamily: fonts.headline, fontWeight: '800', color: colors.primary },
  dmgBtn: {
    width: 44, paddingVertical: 7,
    backgroundColor: `${colors.hpDanger}22`,
    borderWidth: 1, borderColor: `${colors.hpDanger}44`,
    borderRadius: radius.lg, alignItems: 'center',
  },
  dmgBtnText: { fontSize: 11, fontFamily: fonts.headline, fontWeight: '800', color: colors.hpDanger },

  // Death saves
  deathCard: {
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1, borderColor: colors.outlineVariant,
    borderRadius: radius.lg, padding: 14,
  },
  statusText: { fontSize: 20, fontFamily: fonts.headline, fontWeight: '700', textAlign: 'center' },
  deathSavesRow: { flexDirection: 'row', justifyContent: 'space-around' },
  deathGroup: { alignItems: 'center', gap: 8 },
  deathGroupLabel: { fontSize: 10, fontFamily: fonts.label, fontWeight: '700', letterSpacing: 1 },
  deathDot: {
    width: 14, height: 14, borderRadius: 7, borderWidth: 1.5,
  },

  // Conditions
  conditionsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  conditionChip: {
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderStyle: 'dashed' as any, borderColor: colors.outlineVariant,
    borderRadius: 999,
  },
  conditionChipActive: {
    borderStyle: 'solid' as any,
    borderColor: colors.hpDanger,
    backgroundColor: `${colors.hpDanger}18`,
  },
  conditionText: { fontSize: 11, fontFamily: fonts.body, color: colors.outline },
  conditionTextActive: { color: colors.hpDanger, fontWeight: '600' },

  // Passives
  passivesRow: { flexDirection: 'row', gap: 8 },
  passiveCard: {
    flex: 1, padding: 10, alignItems: 'center',
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1, borderColor: colors.outlineVariant,
    borderRadius: radius.lg,
  },
  passiveLabel: {
    fontSize: 9, fontFamily: fonts.label, fontWeight: '700',
    letterSpacing: 1.2, textTransform: 'uppercase', color: colors.outline,
    marginBottom: 4,
  },
  passiveValue: {
    fontSize: 18, fontFamily: fonts.headline, fontWeight: '800', color: colors.primary,
  },
  passiveSuffix: { fontSize: 11, color: colors.outline },
});
