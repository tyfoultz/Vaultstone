import { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fonts, spacing, radius } from '@vaultstone/ui';
import type { Dnd5eStats, Dnd5eResources, Dnd5eAbilityScores, Dnd5eEquipmentItem, Dnd5eFeature } from '@vaultstone/types';
import type { RollResult } from './RollToast';

const ABILITY_KEYS: (keyof Dnd5eAbilityScores)[] = [
  'strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma',
];
const ABILITY_SHORT: Record<keyof Dnd5eAbilityScores, string> = {
  strength: 'STR', dexterity: 'DEX', constitution: 'CON',
  intelligence: 'INT', wisdom: 'WIS', charisma: 'CHA',
};
const SLOT_ORDINALS = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];

const ALL_CONDITIONS = [
  'Blinded', 'Charmed', 'Deafened', 'Exhausted', 'Frightened', 'Grappled',
  'Incapacitated', 'Invisible', 'Paralyzed', 'Petrified', 'Poisoned',
  'Prone', 'Restrained', 'Stunned', 'Unconscious',
];

// SRD full-caster level-1 default (fallback for pre-slot-init characters)
const DEFAULT_SLOTS: Dnd5eResources['spellSlots'] = {
  1: { max: 2, remaining: 2 }, 2: { max: 0, remaining: 0 }, 3: { max: 0, remaining: 0 },
  4: { max: 0, remaining: 0 }, 5: { max: 0, remaining: 0 }, 6: { max: 0, remaining: 0 },
  7: { max: 0, remaining: 0 }, 8: { max: 0, remaining: 0 }, 9: { max: 0, remaining: 0 },
};

function abilityMod(score: number) { return Math.floor((score - 10) / 2); }
function fmtMod(n: number) { return n >= 0 ? `+${n}` : `${n}`; }

// SRD standard actions — always available
const SRD_ACTIONS: Dnd5eFeature[] = [
  { id: 'attack',     name: 'Attack',           actionType: 'action',   description: 'Make one melee or ranged attack.' },
  { id: 'dash',       name: 'Dash',             actionType: 'action',   description: 'Gain extra movement equal to your speed for this turn.' },
  { id: 'disengage',  name: 'Disengage',        actionType: 'action',   description: 'Your movement doesn\'t provoke opportunity attacks for the rest of the turn.' },
  { id: 'dodge',      name: 'Dodge',            actionType: 'action',   description: 'Attackers have disadvantage on attacks against you; you have advantage on DEX saves.' },
  { id: 'help',       name: 'Help',             actionType: 'action',   description: 'Give an ally advantage on their next ability check or attack roll.' },
  { id: 'hide',       name: 'Hide',             actionType: 'action',   description: 'Make a Stealth check to become hidden.' },
  { id: 'ready',      name: 'Ready',            actionType: 'action',   description: 'Prepare a reaction to trigger on a specific condition before your next turn.' },
  { id: 'search',     name: 'Search',           actionType: 'action',   description: 'Devote attention to finding something using Perception or Investigation.' },
  { id: 'use-object', name: 'Use an Object',    actionType: 'action',   description: 'Interact with a second object or use a special item feature.' },
];
const SRD_SPELL_ACTION: Dnd5eFeature =
  { id: 'cast-spell', name: 'Cast a Spell',     actionType: 'action',   description: 'Cast a spell with a casting time of 1 action.' };
const SRD_REACTIONS: Dnd5eFeature[] = [
  { id: 'opp-attack', name: 'Opportunity Attack', actionType: 'reaction', description: 'When a creature leaves your reach, you can make one melee attack against it.' },
];

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
  isDesktop?: boolean;
  onOpenHpModal?: () => void;
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

export function CombatTab({
  stats, resources, scores, prof,
  activeConditions, showDeathSaves, isDead, isStabilized,
  canEditAny, equipment, isDesktop, onRoll, onToggleCondition, onDeathSave, getAttackBonus,
}: Props) {
  const weapons = equipment.filter((e) => e.slot === 'weapon' && e.equipped);

  const isSpellcaster = !!stats.spellcastingAbility;
  const spellSlots = resources.spellSlots ?? (isSpellcaster ? DEFAULT_SLOTS : null);
  const activeSlotLevels = spellSlots
    ? ([1, 2, 3, 4, 5, 6, 7, 8, 9] as const).filter((lvl) => spellSlots[lvl].max > 0)
    : [];

  const classResources = resources.classResources ?? [];
  const exhaustionLevel = resources.exhaustionLevel ?? 0;

  // Gather all features with an actionType from class, species, feats
  const allFeatures = [
    ...(resources.classFeatures ?? []),
    ...(resources.speciesTraits ?? []),
    ...(resources.feats ?? []),
  ].filter((f) => f.actionType);

  const featureActions   = allFeatures.filter((f) => f.actionType === 'action');
  const featureBonus     = allFeatures.filter((f) => f.actionType === 'bonus');
  const featureReactions = allFeatures.filter((f) => f.actionType === 'reaction');
  const featureFree      = allFeatures.filter((f) => f.actionType === 'free');

  const actions   = [...SRD_ACTIONS, ...(isSpellcaster ? [SRD_SPELL_ACTION] : []), ...featureActions];
  const bonuses   = featureBonus;
  const reactions = [...SRD_REACTIONS, ...featureReactions];
  const freeActions = featureFree;

  // ── Desktop: 2-column grid layout ──────────────────────────────────────────
  if (isDesktop) {
    return (
      <View style={s.desktopRoot}>

        {/* LEFT COLUMN — Attacks · Spell Slots · Class Resources */}
        <ScrollView style={s.col} contentContainerStyle={s.colContent} showsVerticalScrollIndicator={false}>

          {/* Attacks */}
          <CardBlock title="Attacks">
            {weapons.length === 0 ? (
              <Text style={s.emptyHint}>No weapons equipped — add gear in the Gear tab.</Text>
            ) : (
              <>
                <View style={s.attacksHeader}>
                  <Text style={[s.attacksHdrCell, { flex: 1 }]}>WEAPON</Text>
                  <Text style={[s.attacksHdrCell, { width: 60, textAlign: 'center' }]}>HIT</Text>
                  <Text style={[s.attacksHdrCell, { width: 68, textAlign: 'center' }]}>DMG</Text>
                </View>
                {weapons.map((w, i) => {
                  const atkBonus = getAttackBonus(w);
                  return (
                    <View key={w.id} style={[s.attackRow, i < weapons.length - 1 && s.attackRowBorder]}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.attackName}>{w.name}</Text>
                        <Text style={s.attackSub}>{w.slot}{w.range ? ` · ${w.range} ft` : ''}</Text>
                      </View>
                      <TouchableOpacity
                        style={s.atkBtnHit}
                        onPress={() => rollD20(`${w.name} attack`, atkBonus, onRoll)}
                        activeOpacity={0.7}
                      >
                        <Text style={s.atkBtnHitText}>{fmtMod(atkBonus)} Hit</Text>
                      </TouchableOpacity>
                      {w.damage ? (
                        <TouchableOpacity
                          style={s.atkBtnDmg}
                          onPress={() => rollDamage(`${w.name} damage`, w.damage!, onRoll)}
                          activeOpacity={0.7}
                        >
                          <Text style={s.atkBtnDmgText}>{w.damage.split(' ')[0]}</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  );
                })}
              </>
            )}
          </CardBlock>

          {/* Spell Slots */}
          {isSpellcaster && (
            <CardBlock title="Spell Slots">
              {activeSlotLevels.length === 0 ? (
                <Text style={s.emptyHint}>No spell slots — configure in Spells tab.</Text>
              ) : (
                activeSlotLevels.map((lvl) => {
                  const slot = spellSlots![lvl];
                  return (
                    <View key={lvl} style={s.slotRow}>
                      <Text style={s.slotOrdinal}>{SLOT_ORDINALS[lvl]}</Text>
                      <View style={s.slotPips}>
                        {Array.from({ length: slot.max }).map((_, i) => (
                          <View
                            key={i}
                            style={[s.slotPip, i < slot.remaining ? s.slotPipFull : s.slotPipEmpty]}
                          />
                        ))}
                      </View>
                    </View>
                  );
                })
              )}
            </CardBlock>
          )}

          {/* Class Resources */}
          {classResources.length > 0 && (
            <CardBlock title="Class Resources">
              {classResources.map((res) => (
                <View key={res.key} style={s.resourceRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.resourceName}>{res.label}</Text>
                    <Text style={s.resourceMeta}>
                      {res.max} uses · {res.recharge === 'short' ? 'short rest' : 'long rest'}
                    </Text>
                  </View>
                  <View style={s.resourcePips}>
                    {Array.from({ length: res.max }).map((_, i) => (
                      <View
                        key={i}
                        style={[s.resPip, i < res.current ? s.resPipFull : s.resPipEmpty]}
                      />
                    ))}
                  </View>
                </View>
              ))}
            </CardBlock>
          )}

          {/* Actions */}
          <CardBlock title="Actions">
            <ActionGroup label="Actions" items={actions} />
            {bonuses.length > 0 && <ActionGroup label="Bonus Actions" items={bonuses} />}
            {reactions.length > 0 && <ActionGroup label="Reactions" items={reactions} accent />}
            {freeActions.length > 0 && <ActionGroup label="Free Actions" items={freeActions} />}
          </CardBlock>

        </ScrollView>

        {/* DIVIDER */}
        <View style={s.colDivider} />

        {/* RIGHT COLUMN — Conditions · Exhaustion · Death Saves */}
        <ScrollView style={s.col} contentContainerStyle={s.colContent} showsVerticalScrollIndicator={false}>

          {/* Conditions */}
          <CardBlock title="Conditions">
            <View style={s.conditionsWrap}>
              {ALL_CONDITIONS.map((c) => {
                const active = activeConditions.map((x) => x.toLowerCase()).includes(c.toLowerCase());
                return (
                  <TouchableOpacity
                    key={c}
                    style={[s.condChip, active && s.condChipActive]}
                    onPress={canEditAny ? () => onToggleCondition(c) : undefined}
                    activeOpacity={canEditAny ? 0.7 : 1}
                  >
                    <Text style={[s.condText, active && s.condTextActive]}>{c}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </CardBlock>

          {/* Exhaustion */}
          <CardBlock title="Exhaustion Level" hint="tap to set">
            <View style={s.exhaustionBadges}>
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <TouchableOpacity
                  key={n}
                  style={[s.exBadge, exhaustionLevel >= n && s.exBadgeActive]}
                  onPress={canEditAny ? () => {
                    // tap active level to clear, tap other to set
                  } : undefined}
                  activeOpacity={canEditAny ? 0.7 : 1}
                >
                  <Text style={[s.exBadgeText, exhaustionLevel >= n && s.exBadgeTextActive]}>{n}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </CardBlock>

          {/* Death Saves — always visible */}
          <CardBlock title="Death Saves">
            {(isDead || isStabilized) && (
              <Text style={[s.statusText, { color: isDead ? colors.hpDanger : colors.hpWarning, marginBottom: 8 }]}>
                {isDead ? 'Dead' : 'Stabilized'}
              </Text>
            )}
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
          </CardBlock>

        </ScrollView>
      </View>
    );
  }

  // ── Mobile: single-column scroll ────────────────────────────────────────────
  const passivePerception = 10 + (abilityMod(scores.wisdom) + (stats.skillProficiencies.includes('perception') ? prof : 0));

  return (
    <ScrollView contentContainerStyle={s.mobileContainer} showsVerticalScrollIndicator={false}>

      {/* Ability scores */}
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
              <View style={s.abilityScorePill}><Text style={s.abilityScore}>{score}</Text></View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Saving throws */}
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

      {/* Attacks */}
      <SectionLabel style={{ marginTop: 14 }} accent>ATTACKS</SectionLabel>
      {weapons.length === 0 ? (
        <View style={s.mobileEmptyHint}>
          <Text style={s.emptyHint}>No weapons equipped — add gear in the Gear tab.</Text>
        </View>
      ) : (
        <View style={s.mobileCard}>
          {weapons.map((w, i) => {
            const atkBonus = getAttackBonus(w);
            return (
              <View key={w.id} style={[s.attackRow, i < weapons.length - 1 && s.attackRowBorder]}>
                <View style={{ flex: 1 }}>
                  <Text style={s.attackName}>{w.name}</Text>
                  <Text style={s.attackSub}>{w.slot}</Text>
                </View>
                <TouchableOpacity style={s.atkBtnHit} onPress={() => rollD20(`${w.name} attack`, atkBonus, onRoll)} activeOpacity={0.7}>
                  <Text style={s.atkBtnHitText}>{fmtMod(atkBonus)} Hit</Text>
                </TouchableOpacity>
                {w.damage && (
                  <TouchableOpacity style={s.atkBtnDmg} onPress={() => rollDamage(`${w.name} damage`, w.damage!, onRoll)} activeOpacity={0.7}>
                    <Text style={s.atkBtnDmgText}>{w.damage.split(' ')[0]}</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </View>
      )}

      {/* Spell slots (mobile) */}
      {isSpellcaster && activeSlotLevels.length > 0 && (
        <>
          <SectionLabel style={{ marginTop: 14 }} accent>SPELL SLOTS</SectionLabel>
          <View style={s.mobileCard}>
            {activeSlotLevels.map((lvl, i) => {
              const slot = spellSlots![lvl];
              return (
                <View key={lvl} style={[s.slotRow, { paddingHorizontal: 12, paddingVertical: 8 }, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.outlineVariant }]}>
                  <Text style={s.slotOrdinal}>{SLOT_ORDINALS[lvl]}</Text>
                  <View style={s.slotPips}>
                    {Array.from({ length: slot.max }).map((_, j) => (
                      <View key={j} style={[s.slotPip, j < slot.remaining ? s.slotPipFull : s.slotPipEmpty]} />
                    ))}
                  </View>
                  <Text style={s.slotCount}>{slot.remaining}/{slot.max}</Text>
                </View>
              );
            })}
          </View>
        </>
      )}

      {/* Conditions */}
      <SectionLabel style={{ marginTop: 14 }}>CONDITIONS</SectionLabel>
      <View style={s.conditionsWrap}>
        {ALL_CONDITIONS.map((c) => {
          const active = activeConditions.map((x) => x.toLowerCase()).includes(c.toLowerCase());
          return (
            <TouchableOpacity
              key={c}
              style={[s.condChip, active && s.condChipActive]}
              onPress={canEditAny ? () => onToggleCondition(c) : undefined}
              activeOpacity={canEditAny ? 0.7 : 1}
            >
              <Text style={[s.condText, active && s.condTextActive]}>{c}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Passives */}
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

// ── Shared sub-components ─────────────────────────────────────────────────────

function ActionGroup({ label, items, accent }: { label: string; items: Dnd5eFeature[]; accent?: boolean }) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <View style={s.actionGroup}>
      <TouchableOpacity style={s.actionGroupHead} onPress={() => setCollapsed((v) => !v)} activeOpacity={0.7}>
        <View style={[s.actionGroupBar, accent && s.actionGroupBarAccent]} />
        <Text style={[s.actionGroupLabel, accent && s.actionGroupLabelAccent]}>{label}</Text>
        <Text style={s.actionGroupCount}>{items.length}</Text>
        <MaterialCommunityIcons
          name={collapsed ? 'chevron-down' : 'chevron-up'}
          size={13}
          color={colors.outline}
        />
      </TouchableOpacity>
      {!collapsed && items.map((item) => <ActionRow key={item.id} feature={item} />)}
    </View>
  );
}

function ActionRow({ feature }: { feature: Dnd5eFeature }) {
  const isSrd = ['attack', 'dash', 'disengage', 'dodge', 'help', 'hide', 'ready', 'search', 'use-object', 'cast-spell', 'opp-attack'].includes(feature.id);
  return (
    <View style={s.actionRow}>
      <View style={s.actionRowHeader}>
        <Text style={[s.actionName, isSrd && s.actionNameSrd]}>{feature.name}</Text>
        {feature.uses && (
          <Text style={s.actionUses}>{feature.uses.current}/{feature.uses.max}</Text>
        )}
      </View>
      <Text style={s.actionDesc}>{feature.description}</Text>
    </View>
  );
}

function CardBlock({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={s.card}>
      <View style={s.cardHead}>
        <Text style={s.cardTitle}>{title}</Text>
        {hint && <Text style={s.cardHint}>{hint}</Text>}
      </View>
      <View style={s.cardBody}>{children}</View>
    </View>
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
        {value}{suffix ? <Text style={s.passiveSuffix}>{suffix}</Text> : null}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  // ── Desktop 2-column layout
  desktopRoot: {
    flex: 1, flexDirection: 'row', overflow: 'hidden',
  },
  col: { flex: 1 },
  colContent: { padding: 8, gap: 6 },
  colDivider: { width: StyleSheet.hairlineWidth, backgroundColor: colors.outlineVariant },

  // Card blocks
  card: {
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1, borderColor: colors.outlineVariant,
    borderRadius: radius.lg, overflow: 'hidden',
  },
  cardHead: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 10, paddingVertical: 7,
    backgroundColor: colors.surfaceContainerLowest,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.outlineVariant,
  },
  cardTitle: {
    fontSize: 9, fontFamily: fonts.label, fontWeight: '800',
    letterSpacing: 1, textTransform: 'uppercase', color: colors.onSurface,
  },
  cardHint: { fontSize: 8, fontFamily: fonts.label, color: colors.outline },
  cardBody: { paddingHorizontal: 10, paddingVertical: 8 },

  // Attacks
  attacksHeader: {
    flexDirection: 'row', paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.outlineVariant,
    marginBottom: 2,
  },
  attacksHdrCell: {
    fontSize: 8, fontFamily: fonts.label, fontWeight: '700',
    letterSpacing: 1.2, textTransform: 'uppercase', color: colors.outline,
  },
  attackRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 7,
  },
  attackRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.outlineVariant },
  attackName: { fontSize: 11, fontFamily: fonts.headline, fontWeight: '700', color: colors.onSurface },
  attackSub: { fontSize: 8, color: colors.outline, marginTop: 1 },
  atkBtnHit: {
    paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1, borderColor: `${colors.primary}66`,
    backgroundColor: `${colors.primary}14`,
    borderRadius: radius.lg,
  },
  atkBtnHitText: { fontSize: 9, fontFamily: fonts.label, fontWeight: '700', color: colors.primary },
  atkBtnDmg: {
    paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1, borderColor: `#e6a25566`,
    backgroundColor: `#e6a25514`,
    borderRadius: radius.lg,
  },
  atkBtnDmgText: { fontSize: 9, fontFamily: fonts.label, fontWeight: '700', color: '#e6a255' },

  // Spell slots
  slotRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4,
  },
  slotOrdinal: {
    fontSize: 8, fontFamily: fonts.label, fontWeight: '700',
    letterSpacing: 0.5, color: colors.outline, width: 28,
  },
  slotPips: { flexDirection: 'row', gap: 3, flex: 1 },
  slotPip: { width: 9, height: 9, borderRadius: 2, borderWidth: 1.5 },
  slotPipFull: { backgroundColor: colors.primary, borderColor: colors.primary },
  slotPipEmpty: { backgroundColor: 'transparent', borderColor: colors.outlineVariant },
  slotCount: {
    fontSize: 9, fontFamily: fonts.headline, fontWeight: '600', color: colors.onSurfaceVariant,
  },

  // Class resources
  resourceRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.outlineVariant,
  },
  resourceName: { fontSize: 10, fontFamily: fonts.headline, fontWeight: '700', color: colors.onSurface },
  resourceMeta: { fontSize: 8, color: colors.outline, marginTop: 1 },
  resourcePips: { flexDirection: 'row', gap: 3 },
  resPip: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5 },
  resPipFull: { backgroundColor: colors.secondary, borderColor: colors.secondary },
  resPipEmpty: { backgroundColor: 'transparent', borderColor: colors.outlineVariant },

  // Conditions
  conditionsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  condChip: {
    paddingHorizontal: 8, paddingVertical: 4,
    backgroundColor: colors.surfaceContainerHigh,
    borderWidth: 1, borderColor: colors.outlineVariant,
    borderRadius: 4,
  },
  condChipActive: {
    backgroundColor: `${colors.hpDanger}18`,
    borderColor: colors.hpDanger,
  },
  condText: { fontSize: 9, fontFamily: fonts.label, fontWeight: '700', color: colors.onSurfaceVariant },
  condTextActive: { color: colors.hpDanger },

  // Exhaustion
  exhaustionBadges: { flexDirection: 'row', gap: 4 },
  exBadge: {
    width: 26, height: 26, borderRadius: 5,
    borderWidth: 1.5, borderColor: colors.outlineVariant,
    alignItems: 'center', justifyContent: 'center',
  },
  exBadgeActive: { backgroundColor: `${colors.hpDanger}18`, borderColor: colors.hpDanger },
  exBadgeText: { fontSize: 9, fontFamily: fonts.headline, fontWeight: '800', color: colors.outline },
  exBadgeTextActive: { color: colors.hpDanger },

  // Death saves
  deathSavesRow: { flexDirection: 'row', justifyContent: 'space-around' },
  deathGroup: { alignItems: 'center', gap: 8 },
  deathGroupLabel: { fontSize: 9, fontFamily: fonts.label, fontWeight: '700', letterSpacing: 1 },
  deathDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 1.5 },
  statusText: { fontSize: 16, fontFamily: fonts.headline, fontWeight: '700', textAlign: 'center' },

  // ── Mobile section-based layout
  mobileContainer: { paddingHorizontal: spacing.md, paddingTop: 14, paddingBottom: 16 },
  mobileCard: {
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1, borderColor: colors.outlineVariant,
    borderRadius: radius.lg, overflow: 'hidden',
  },
  mobileEmptyHint: { paddingVertical: 6 },

  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  sectionLabel: {
    fontSize: 9, fontFamily: fonts.label, fontWeight: '700',
    letterSpacing: 1.5, textTransform: 'uppercase', color: colors.outline,
  },
  sectionLabelAccent: { color: colors.primary },
  sectionLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.outlineVariant },
  sectionLineAccent: { backgroundColor: `${colors.primary}44` },

  emptyHint: { fontSize: 11, fontFamily: fonts.body, color: colors.outline, fontStyle: 'italic' },

  // Actions
  actionGroup: { marginBottom: 2 },
  actionGroupHead: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingTop: 8, paddingBottom: 5,
  },
  actionGroupBar: { width: 3, height: 12, borderRadius: 2, backgroundColor: colors.outlineVariant },
  actionGroupBarAccent: { backgroundColor: colors.hpDanger },
  actionGroupLabel: { flex: 1, fontSize: 8, fontFamily: fonts.label, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', color: colors.outline },
  actionGroupLabelAccent: { color: colors.hpDanger },
  actionGroupCount: { fontSize: 9, fontFamily: fonts.label, color: colors.outline },
  actionRow: {
    paddingHorizontal: 10, paddingVertical: 9,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.outlineVariant,
    gap: 3,
  },
  actionRowHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionName: { flex: 1, fontSize: 12, fontFamily: fonts.body, fontWeight: '600', color: colors.onSurface },
  actionNameSrd: { color: colors.onSurfaceVariant },
  actionUses: { fontSize: 11, fontFamily: fonts.label, fontWeight: '700', color: colors.primary },
  actionDesc: { fontSize: 11, fontFamily: fonts.body, color: colors.outline, lineHeight: 16 },

  // Mobile ability scores
  abilityGrid: { flexDirection: 'row', gap: 6 },
  abilityTile: {
    flex: 1, alignItems: 'center', padding: 10,
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1, borderColor: colors.outlineVariant,
    borderRadius: radius.lg,
  },
  abilityShort: { fontSize: 9, fontFamily: fonts.label, fontWeight: '700', letterSpacing: 1.2, color: colors.outline },
  abilityMod: { fontSize: 22, fontFamily: fonts.headline, fontWeight: '800', color: colors.primary, lineHeight: 26 },
  abilityScorePill: {
    marginTop: 2, paddingHorizontal: 8, paddingVertical: 1,
    backgroundColor: colors.surfaceContainerHighest,
    borderRadius: 999, borderWidth: 1, borderColor: colors.outlineVariant,
  },
  abilityScore: { fontSize: 10, fontFamily: fonts.headline, fontWeight: '600', color: colors.onSurfaceVariant },

  // Mobile saving throws
  savesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  saveRow: {
    width: '30.5%', flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 9,
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1, borderColor: colors.outlineVariant,
    borderRadius: radius.lg,
  },
  saveRowProf: { borderColor: `${colors.primary}55`, backgroundColor: `${colors.primaryContainer}22` },
  profDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5, borderColor: colors.outline },
  profDotFilled: { backgroundColor: colors.primary, borderColor: colors.primary },
  saveAbility: { fontSize: 10, fontFamily: fonts.label, fontWeight: '700', letterSpacing: 1, color: colors.onSurfaceVariant, flex: 1 },
  saveAbilityProf: { color: colors.onSurface },
  saveBonus: { fontSize: 12, fontFamily: fonts.headline, fontWeight: '700', color: colors.onSurfaceVariant },
  saveBonusProf: { color: colors.primary },

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
    letterSpacing: 1.2, textTransform: 'uppercase', color: colors.outline, marginBottom: 4,
  },
  passiveValue: { fontSize: 18, fontFamily: fonts.headline, fontWeight: '800', color: colors.primary },
  passiveSuffix: { fontSize: 11, color: colors.outline },
});
