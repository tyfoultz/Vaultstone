import { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Modal, TextInput } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fonts, spacing, radius } from '@vaultstone/ui';
import { getSrdContent } from '@vaultstone/content';
import type {
  Dnd5eStats, Dnd5eResources, Dnd5eAbilityScores, Dnd5eEquipmentItem, Dnd5eFeature,
  Dnd5eAbility, ConditionResult, SrdVersion,
  ClassResult, SubclassResult, SpeciesResult,
} from '@vaultstone/types';
import type { RollResult } from './RollToast';
import { AbilitiesCardTab } from './AbilitiesCardTab';

const ABILITY_KEYS: (keyof Dnd5eAbilityScores)[] = [
  'strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma',
];
const ABILITY_SHORT: Record<keyof Dnd5eAbilityScores, string> = {
  strength: 'STR', dexterity: 'DEX', constitution: 'CON',
  intelligence: 'INT', wisdom: 'WIS', charisma: 'CHA',
};
const SLOT_ORDINALS = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];

const EXHAUSTION_MAX = 6;

/**
 * Resolve the bundled condition list for a given SRD edition. Defaults to
 * SRD 2.0 for legacy characters created before `srdVersion` became a required
 * field.
 *
 * Exhaustion is intentionally filtered out: the picker injects its own
 * "Exhaustion" pseudo-entry that routes to the level-track handler
 * (`onSetExhaustion`), since exhaustion in our app is a 0–6 numeric level
 * rather than a binary on/off condition like the others.
 */
function bundledConditionsFor(srdVersion: SrdVersion | null | undefined): ConditionResult[] {
  const all = getSrdContent(srdVersion ?? 'SRD_2.0').conditions;
  return all.filter((c) => c.name.toLowerCase() !== 'exhaustion');
}

// SRD full-caster level-1 default (fallback for pre-slot-init characters)
const DEFAULT_SLOTS: Dnd5eResources['spellSlots'] = {
  1: { max: 2, remaining: 2 }, 2: { max: 0, remaining: 0 }, 3: { max: 0, remaining: 0 },
  4: { max: 0, remaining: 0 }, 5: { max: 0, remaining: 0 }, 6: { max: 0, remaining: 0 },
  7: { max: 0, remaining: 0 }, 8: { max: 0, remaining: 0 }, 9: { max: 0, remaining: 0 },
};

function abilityMod(score: number) { return Math.floor((score - 10) / 2); }
function fmtMod(n: number) { return n >= 0 ? `+${n}` : `${n}`; }

/** Keys of bundled SRD standard actions — used to style the row as built-in vs custom. */
const SRD_ACTION_KEYS = new Set([
  'attack', 'dash', 'disengage', 'dodge', 'help', 'hide', 'ready', 'search',
  'use-an-object', 'utilize', 'cast-a-spell', 'magic',
  'influence', 'study', 'opportunity-attack',
  'two-weapon-fighting', 'nick-offhand',
]);

/**
 * Resolve the bundled standard-action list for the character's edition and
 * shape it into the `Dnd5eFeature` form used by the action group renderer.
 * Replaces an earlier hardcoded SRD_ACTIONS / SRD_REACTIONS / SRD_SPELL_ACTION
 * trio — now data-driven from `@vaultstone/content`.
 */
function srdActionsFor(srdVersion: SrdVersion | null | undefined, isSpellcaster: boolean): {
  actions: Dnd5eFeature[];
  bonusActions: Dnd5eFeature[];
  reactions: Dnd5eFeature[];
} {
  const all = getSrdContent(srdVersion ?? 'SRD_2.0').standardActions;
  const toFeature = (a: { key: string; name: string; description?: string }, slot: 'action' | 'bonus' | 'reaction'): Dnd5eFeature => ({
    id: a.key,
    name: a.name,
    description: a.description ?? '',
    actionType: slot,
  });
  const actions = all
    .filter((a) => a.actionEconomy === 'action')
    .filter((a) => isSpellcaster || (a.key !== 'magic' && a.key !== 'cast-a-spell'))
    .map((a) => toFeature(a, 'action'));
  const bonusActions = all
    .filter((a) => a.actionEconomy === 'bonus-action')
    .map((a) => toFeature(a, 'bonus'));
  const reactions = all
    .filter((a) => a.actionEconomy === 'reaction')
    .map((a) => toFeature(a, 'reaction'));
  return { actions, bonusActions, reactions };
}

interface Props {
  stats: Dnd5eStats;
  resources: Dnd5eResources;
  scores: Dnd5eAbilityScores;
  prof: number;
  activeConditions: string[];
  canEditAny: boolean;
  equipment: Dnd5eEquipmentItem[];
  isDesktop?: boolean;
  manualMode?: boolean;
  /** ContentResolver condition catalog scoped to the character's
   *  campaign/packs. When supplied, drives the picker so homebrew /
   *  imported conditions surface alongside SRD ones. Falls back to the
   *  edition-filtered bundled list when null/empty. */
  conditionCatalog?: ConditionResult[] | null;
  liveActionFeatures?: Dnd5eFeature[];
  onOpenHpModal?: () => void;
  onEditField?: (field: string, currentValue: number | string) => void;
  onRoll: (result: RollResult) => void;
  onToggleCondition: (c: string) => void;
  onSetExhaustion: (level: number) => void;
  /** Spend one hit die for short-rest healing. Rolls 1dN+CON, adds
   *  result to HP (capped at max), decrements remaining. */
  onSpendHitDie?: () => void;
  getAttackBonus: (item: Dnd5eEquipmentItem) => number;
  // ── Abilities-card embed ─────────────────────────────────────────
  // The old standalone Abilities tab now renders inside this tab so
  // active-ability cards sit next to attacks and actions. These props
  // are forwarded straight to AbilitiesCardTab.
  classResultsByKey: Record<string, ClassResult>;
  subclassResultsByKey: Record<string, SubclassResult>;
  speciesResult: SpeciesResult | null;
  onUpdateAbilities: (abilities: Dnd5eAbility[]) => void;
  /** Toggle save proficiency for an ability. Only fires while
   *  manualMode is on (the strip rolls the save instead when
   *  manual mode is off). */
  onToggleSaveProficiency?: (ability: keyof Dnd5eAbilityScores) => void;
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
  activeConditions, canEditAny, equipment, isDesktop, manualMode, conditionCatalog,
  liveActionFeatures, onRoll, onEditField, onToggleCondition, onSetExhaustion, onSpendHitDie, getAttackBonus,
  classResultsByKey, subclassResultsByKey, speciesResult, onUpdateAbilities,
  onToggleSaveProficiency,
}: Props) {
  const weapons = equipment.filter((e) => e.slot === 'weapon' && e.equipped);
  // Player-pinned equipment surfaces in its own quick-access section.
  // Independent of the equipped/attuned filter so consumables (potions,
  // scrolls), thrown weapons, and ad-hoc utility items can sit here
  // without being "worn".
  const pinnedItems = equipment.filter((e) => e.pinnedToCombat);

  const isSpellcaster = !!stats.spellcastingAbility;
  const spellSlots = resources.spellSlots ?? (isSpellcaster ? DEFAULT_SLOTS : null);
  const activeSlotLevels = spellSlots
    ? ([1, 2, 3, 4, 5, 6, 7, 8, 9] as const).filter((lvl) => spellSlots[lvl].max > 0)
    : [];

  const classResources = resources.classResources ?? [];
  const exhaustionLevel = resources.exhaustionLevel ?? 0;

  // Gather all features with an actionType. Live ContentResolver
  // features (with actionType tags from SRD data) take priority;
  // stored resources fill in any custom/homebrew entries.
  const liveIds = new Set((liveActionFeatures ?? []).map((f) => f.id));
  const storedFeatures = [
    ...(resources.classFeatures ?? []),
    ...(resources.speciesTraits ?? []),
    ...(resources.feats ?? []),
  ].filter((f) => f.actionType && !liveIds.has(f.id));
  const allFeatures = [...(liveActionFeatures ?? []), ...storedFeatures];

  const featureActions   = allFeatures.filter((f) => f.actionType === 'action');
  const featureBonus     = allFeatures.filter((f) => f.actionType === 'bonus');
  const featureReactions = allFeatures.filter((f) => f.actionType === 'reaction');
  const featureFree      = allFeatures.filter((f) => f.actionType === 'free');

  const { actions: srdActions, bonusActions: srdBonusActions, reactions: srdReactions } = srdActionsFor(stats.srdVersion, isSpellcaster);
  const actions     = [...srdActions, ...featureActions];
  const bonuses     = [...srdBonusActions, ...featureBonus];
  const reactions   = [...srdReactions, ...featureReactions];
  const freeActions = featureFree;

  // ── Desktop: single-column flat layout ────────────────────────────────────
  // No outer CardBlock wrappers — sections are bare label + content rows,
  // matching the Spells-tab visual language for cross-tab cohesion. The
  // Saving Throws strip leads the tab (moved out of the left sidebar).
  if (isDesktop) {
    return (
      <ScrollView style={{ flex: 1 }} contentContainerStyle={s.deskScrollContent} showsVerticalScrollIndicator={false}>

          <SectionLabel accent>SAVING THROWS</SectionLabel>
          <SavingThrowsStrip
            scores={scores}
            stats={stats}
            prof={prof}
            manualMode={manualMode}
            onToggleSaveProficiency={onToggleSaveProficiency}
            onRoll={onRoll}
            isDesktop
          />

          {/* Attacks */}
          <SectionLabel style={s.deskSectionLabel} accent>ATTACKS</SectionLabel>
          {weapons.length === 0 ? (
            <Text style={s.emptyHint}>No weapons equipped — add gear in the Gear tab.</Text>
          ) : (
            <View>
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
            </View>
          )}

          {/* Pinned equipment — anything the player flagged via the
              pin icon on the Gear tab. Sits between Attacks and Spell
              Slots so consumables are within thumb-reach mid-combat. */}
          {pinnedItems.length > 0 && (
            <>
              <SectionLabel style={s.deskSectionLabel} accent>PINNED</SectionLabel>
              <View>
                {pinnedItems.map((item, i) => (
                  <View key={item.id} style={[s.pinnedRow, i < pinnedItems.length - 1 && s.pinnedRowBorder]}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.pinnedName}>{item.name}</Text>
                      {item.damage ? (
                        <Text style={s.pinnedSub}>{item.damage}</Text>
                      ) : item.notes ? (
                        <Text style={s.pinnedSub} numberOfLines={1}>{item.notes}</Text>
                      ) : (
                        <Text style={s.pinnedSub}>{item.slot}{item.equipped ? ' · equipped' : ''}{item.attuned ? ' · attuned' : ''}</Text>
                      )}
                    </View>
                    {item.damage && item.slot === 'weapon' ? (
                      <TouchableOpacity
                        style={s.atkBtnDmg}
                        onPress={() => rollDamage(`${item.name} damage`, item.damage!, onRoll)}
                        activeOpacity={0.7}
                      >
                        <Text style={s.atkBtnDmgText}>{item.damage.split(' ')[0]}</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                ))}
              </View>
            </>
          )}

          {/* Class Resources */}
          {classResources.length > 0 && (
            <>
              <SectionLabel style={s.deskSectionLabel} accent>CLASS RESOURCES</SectionLabel>
              <View>
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
              </View>
            </>
          )}

          {/* Active abilities — merged in from the old standalone
              Abilities tab. Sits above Actions since tracked-use class
              features are typically resolved before falling back to
              generic actions on the same turn. */}
          <SectionLabel style={s.deskSectionLabel} accent>ABILITIES</SectionLabel>
          <AbilitiesCardTab
            embedded
            headerless
            resources={resources}
            isOwner={canEditAny}
            classResultsByKey={classResultsByKey}
            subclassResultsByKey={subclassResultsByKey}
            speciesResult={speciesResult}
            characterLevel={stats.level}
            onUpdateAbilities={onUpdateAbilities}
          />

          {/* Standard Actions */}
          <SectionLabel style={s.deskSectionLabel} accent>STANDARD ACTIONS</SectionLabel>
          <View>
            <ActionGroup label="Actions" items={actions} color={colors.primary} />
            {bonuses.length > 0 && <ActionGroup label="Bonus Actions" items={bonuses} color={colors.secondary} />}
            {reactions.length > 0 && <ActionGroup label="Reactions" items={reactions} color={colors.hpDanger} />}
            {freeActions.length > 0 && <ActionGroup label="Free Actions" items={freeActions} color={colors.outline} />}
          </View>

      </ScrollView>
    );
  }

  // ── Mobile: single-column scroll ────────────────────────────────────────────
  const passivePerception = 10 + (abilityMod(scores.wisdom) + (stats.skillProficiencies.includes('perception') ? prof : 0));

  return (
    <ScrollView contentContainerStyle={s.mobileContainer} showsVerticalScrollIndicator={false}>

      {/* Saving throws */}
      <SectionLabel>SAVING THROWS</SectionLabel>
      <SavingThrowsStrip
        scores={scores}
        stats={stats}
        prof={prof}
        manualMode={manualMode}
        onToggleSaveProficiency={onToggleSaveProficiency}
        onRoll={onRoll}
      />

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

      {/* Pinned equipment (mobile) — mirrors the desktop "Pinned"
          card. Sits between attacks and spell slots. */}
      {pinnedItems.length > 0 && (
        <>
          <SectionLabel style={{ marginTop: 14 }} accent>PINNED</SectionLabel>
          <View style={s.mobileCard}>
            {pinnedItems.map((item, i) => (
              <View key={item.id} style={[s.pinnedRow, { paddingHorizontal: 12 }, i < pinnedItems.length - 1 && s.pinnedRowBorder]}>
                <View style={{ flex: 1 }}>
                  <Text style={s.pinnedName}>{item.name}</Text>
                  {item.damage ? (
                    <Text style={s.pinnedSub}>{item.damage}</Text>
                  ) : item.notes ? (
                    <Text style={s.pinnedSub} numberOfLines={1}>{item.notes}</Text>
                  ) : (
                    <Text style={s.pinnedSub}>{item.slot}{item.equipped ? ' · equipped' : ''}{item.attuned ? ' · attuned' : ''}</Text>
                  )}
                </View>
                {item.damage && item.slot === 'weapon' ? (
                  <TouchableOpacity
                    style={s.atkBtnDmg}
                    onPress={() => rollDamage(`${item.name} damage`, item.damage!, onRoll)}
                    activeOpacity={0.7}
                  >
                    <Text style={s.atkBtnDmgText}>{item.damage.split(' ')[0]}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ))}
          </View>
        </>
      )}

      {/* Conditions */}
      <SectionLabel style={{ marginTop: 14 }}>CONDITIONS</SectionLabel>
      <ConditionsSection
        activeConditions={activeConditions}
        exhaustionLevel={exhaustionLevel}
        canEditAny={canEditAny}
        onToggle={onToggleCondition}
        onSetExhaustion={onSetExhaustion}
        bundledConditions={
          conditionCatalog && conditionCatalog.length > 0
            ? conditionCatalog.filter((c) => c.name.toLowerCase() !== 'exhaustion')
            : bundledConditionsFor(stats.srdVersion)
        }
      />

      {/* Passives */}
      <SectionLabel style={{ marginTop: 14 }}>PASSIVES</SectionLabel>
      <View style={s.passivesRow}>
        <PassiveCard label="Perception" value={passivePerception} />
        <PassiveCard
          label="Hit Dice"
          value={`${resources.hitDiceRemaining ?? stats.level}/${stats.level}`}
          suffix={`d${stats.hitDie}`}
          editable={canEditAny && (resources.hitDiceRemaining ?? stats.level) > 0 && !!onSpendHitDie}
          onPress={canEditAny && onSpendHitDie ? onSpendHitDie : undefined}
        />
        <PassiveCard
          label="Speed"
          value={stats.speed}
          suffix=" ft"
          editable={manualMode}
          onPress={manualMode && onEditField ? () => onEditField('speed', stats.speed) : undefined}
        />
      </View>

      {/* Active abilities — merged in from the old standalone
          Abilities tab. */}
      <View style={{ marginTop: 14 }}>
        <AbilitiesCardTab
          embedded
          resources={resources}
          isOwner={canEditAny}
          classResultsByKey={classResultsByKey}
          subclassResultsByKey={subclassResultsByKey}
          speciesResult={speciesResult}
          characterLevel={stats.level}
          onUpdateAbilities={onUpdateAbilities}
        />
      </View>

      {/* Actions — desktop renders these inside a CardBlock; mobile
          used to drop them entirely (so a player on a phone had no
          quick reference for Dash / Dodge / Help / cantrips / class-
          feature actions). Mirror the same ActionGroup composition
          here. */}
      <SectionLabel style={{ marginTop: 14 }} accent>ACTIONS</SectionLabel>
      <View style={s.mobileCard}>
        <ActionGroup label="Actions" items={actions} color={colors.primary} />
        {bonuses.length > 0 && <ActionGroup label="Bonus Actions" items={bonuses} color={colors.secondary} />}
        {reactions.length > 0 && <ActionGroup label="Reactions" items={reactions} color={colors.hpDanger} />}
        {freeActions.length > 0 && <ActionGroup label="Free Actions" items={freeActions} color={colors.outline} />}
      </View>

      <View style={{ height: 16 }} />
    </ScrollView>
  );
}

// ── Shared sub-components ─────────────────────────────────────────────────────

export function ConditionsSection({
  activeConditions, exhaustionLevel, canEditAny, onToggle, onSetExhaustion,
  bundledConditions,
}: {
  activeConditions: string[];
  exhaustionLevel: number;
  canEditAny: boolean;
  onToggle: (c: string) => void;
  onSetExhaustion: (level: number) => void;
  /** Bundled SRD condition catalog filtered to the character's edition. */
  bundledConditions: ConditionResult[];
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');
  const normalizedActive = activeConditions.map((x) => x.toLowerCase());

  // Pickable list: bundled SRD conditions, plus a synthetic "Exhaustion" entry
  // (handled separately because it's a level track, not a binary condition).
  type Pickable = { name: string; description?: string };
  const pickable: Pickable[] = useMemo(() => {
    const conds: Pickable[] = bundledConditions
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => ({ name: c.name, description: c.description }));
    if (exhaustionLevel === 0) {
      conds.unshift({
        name: 'Exhaustion',
        description: 'Track exhaustion as a 1–6 level. Higher levels stack penalties; level 6 is death.',
      });
    }
    return conds;
  }, [bundledConditions, exhaustionLevel]);

  const available = pickable.filter((c) => !normalizedActive.includes(c.name.toLowerCase()));
  const filtered = search.trim()
    ? available.filter((c) =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        (c.description ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : available;

  const hasActive = activeConditions.length > 0 || exhaustionLevel > 0;

  function closePicker() { setPickerOpen(false); setSearch(''); }
  function handlePick(name: string) {
    if (name === 'Exhaustion') onSetExhaustion(1);
    else onToggle(name);
    if (available.length === 1) closePicker();
  }

  return (
    <View style={{ gap: 6 }}>
      {/* Active condition chips */}
      {hasActive && (
        <View style={s.conditionsWrap}>
          {exhaustionLevel > 0 && (
            <View style={s.exhaustionChip}>
              {canEditAny && (
                <TouchableOpacity
                  style={s.exhaustionStep}
                  onPress={() => onSetExhaustion(Math.max(0, exhaustionLevel - 1))}
                  activeOpacity={0.7}
                >
                  <MaterialCommunityIcons name="minus" size={11} color={colors.hpDanger} />
                </TouchableOpacity>
              )}
              <Text style={s.condTextActive}>Exhaustion {exhaustionLevel}</Text>
              {canEditAny && (
                <TouchableOpacity
                  style={s.exhaustionStep}
                  onPress={() => onSetExhaustion(Math.min(EXHAUSTION_MAX, exhaustionLevel + 1))}
                  activeOpacity={0.7}
                  disabled={exhaustionLevel >= EXHAUSTION_MAX}
                >
                  <MaterialCommunityIcons
                    name="plus"
                    size={11}
                    color={exhaustionLevel >= EXHAUSTION_MAX ? colors.outline : colors.hpDanger}
                  />
                </TouchableOpacity>
              )}
            </View>
          )}
          {activeConditions.map((c) => (
            <TouchableOpacity
              key={c}
              style={s.condChipActive}
              onPress={canEditAny ? () => onToggle(c) : undefined}
              activeOpacity={canEditAny ? 0.7 : 1}
            >
              <Text style={s.condTextActive}>{c}</Text>
              {canEditAny && (
                <MaterialCommunityIcons name="close" size={9} color={colors.hpDanger} style={{ marginLeft: 3 }} />
              )}
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Add condition button */}
      {canEditAny && (
        <TouchableOpacity style={s.addCondBtn} onPress={() => setPickerOpen(true)} activeOpacity={0.7}>
          <MaterialCommunityIcons name="plus" size={12} color={colors.outline} />
          <Text style={s.addCondText}>Add condition</Text>
        </TouchableOpacity>
      )}
      {!canEditAny && !hasActive && (
        <Text style={s.condNone}>No active conditions</Text>
      )}

      {/* Condition picker modal */}
      <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={closePicker}>
        <TouchableOpacity style={s.modalBackdrop} activeOpacity={1} onPress={closePicker}>
          <View style={s.modalSheet} onStartShouldSetResponder={() => true}>

            {/* Header */}
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Add Condition</Text>
              <TouchableOpacity onPress={closePicker} activeOpacity={0.7}>
                <MaterialCommunityIcons name="close" size={18} color={colors.outline} />
              </TouchableOpacity>
            </View>

            {/* Search */}
            <View style={s.modalSearch}>
              <MaterialCommunityIcons name="magnify" size={14} color={colors.outline} />
              <TextInput
                style={s.modalSearchInput}
                placeholder="Search conditions..."
                placeholderTextColor={colors.outline}
                value={search}
                onChangeText={setSearch}
                autoFocus
              />
              {search.length > 0 && (
                <TouchableOpacity onPress={() => setSearch('')} activeOpacity={0.7}>
                  <MaterialCommunityIcons name="close-circle" size={13} color={colors.outline} />
                </TouchableOpacity>
              )}
            </View>

            {/* Scrollable list */}
            <ScrollView style={s.modalList} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {filtered.length > 0 ? filtered.map((c, i) => (
                <TouchableOpacity
                  key={c.name}
                  style={[s.condRow, i < filtered.length - 1 && s.condRowBorder]}
                  onPress={() => handlePick(c.name)}
                  activeOpacity={0.7}
                >
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={s.condRowText}>{c.name}</Text>
                    {c.description ? (
                      <Text style={s.condRowDesc} numberOfLines={2}>{c.description}</Text>
                    ) : null}
                  </View>
                  <MaterialCommunityIcons name="plus-circle-outline" size={16} color={colors.outline} />
                </TouchableOpacity>
              )) : (
                <Text style={[s.condNone, { paddingVertical: 12 }]}>
                  {available.length === 0 ? 'All conditions are active' : 'No matches'}
                </Text>
              )}
            </ScrollView>

          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

/**
 * Saving Throws strip — six rollable cells (STR/DEX/CON/INT/WIS/CHA),
 * one per ability. Shared between desktop and mobile; desktop renders a
 * 6-across horizontal strip and mobile keeps the 3-across grid.
 *
 * Tap behavior depends on Manual Mode: when off, the cell rolls a save
 * (d20 + ability mod + proficiency); when on, the cell toggles save
 * proficiency for that ability (replaces the old left-sidebar editor).
 */
function SavingThrowsStrip({
  scores, stats, prof, manualMode, onToggleSaveProficiency, onRoll, isDesktop,
}: {
  scores: Dnd5eAbilityScores;
  stats: Dnd5eStats;
  prof: number;
  manualMode?: boolean;
  onToggleSaveProficiency?: (ability: keyof Dnd5eAbilityScores) => void;
  onRoll: (r: RollResult) => void;
  isDesktop?: boolean;
}) {
  return (
    <View style={isDesktop ? s.savesStripDesktop : s.savesGrid}>
      {ABILITY_KEYS.map((abi) => {
        const isProf = stats.savingThrowProficiencies.includes(abi);
        const bonus = abilityMod(scores[abi]) + (isProf ? prof : 0);
        const handlePress = () => {
          if (manualMode && onToggleSaveProficiency) {
            onToggleSaveProficiency(abi);
          } else {
            rollD20(`${ABILITY_SHORT[abi]} save`, bonus, onRoll);
          }
        };
        return (
          <TouchableOpacity
            key={abi}
            style={[
              isDesktop ? s.saveCellDesktop : s.saveRow,
              isProf && s.saveRowProf,
              manualMode && s.saveCellManual,
            ]}
            onPress={handlePress}
            activeOpacity={0.7}
          >
            <View style={[s.profDot, isProf && s.profDotFilled]} />
            <Text style={[s.saveAbility, isProf && s.saveAbilityProf]}>{ABILITY_SHORT[abi]}</Text>
            <Text style={[s.saveBonus, isProf && s.saveBonusProf]}>{fmtMod(bonus)}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function ActionGroup({ label, items, color }: { label: string; items: Dnd5eFeature[]; color: string }) {
  // Group-level collapse: groups start open so all actions are visible
  // at a glance; the chevron on the header lets the player fold groups
  // they don't care about this turn (e.g. collapse Reactions when on
  // their own turn). Individual action descriptions are always shown
  // when the group is open — no per-row expand.
  const [expanded, setExpanded] = useState(true);
  return (
    <View style={s.actionGroup}>
      <TouchableOpacity
        style={s.actionGroupHead}
        onPress={() => setExpanded((v) => !v)}
        activeOpacity={0.7}
      >
        <View style={[s.actionGroupBar, { backgroundColor: color }]} />
        <Text style={[s.actionGroupLabel, { color }]}>{label}</Text>
        <Text style={s.actionGroupCount}>{items.length}</Text>
        <MaterialCommunityIcons
          name={expanded ? 'chevron-down' : 'chevron-right'}
          size={16}
          color={colors.outline}
        />
      </TouchableOpacity>
      {expanded ? (
        <View style={s.actionCards}>
          {items.map((item) => <ActionRow key={item.id} feature={item} color={color} />)}
        </View>
      ) : null}
    </View>
  );
}

function ActionRow({ feature, color }: { feature: Dnd5eFeature; color: string }) {
  return (
    <View style={s.actionCard}>
      <View style={[s.actionCardBar, { backgroundColor: color }]} />
      <View style={s.actionCardBody}>
        <View style={s.actionCardTitleRow}>
          <Text style={s.actionCardName} numberOfLines={1}>{feature.name}</Text>
          {feature.uses ? (
            <Text style={[s.actionCardUses, { color }]}>
              {feature.uses.current}/{feature.uses.max}
            </Text>
          ) : null}
        </View>
        {feature.description ? (
          <Text style={s.actionCardDesc}>{feature.description}</Text>
        ) : null}
      </View>
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


function PassiveCard({ label, value, suffix, editable, onPress }: { label: string; value: number | string; suffix?: string; editable?: boolean; onPress?: () => void }) {
  const Wrapper = editable && onPress ? TouchableOpacity : View;
  return (
    <Wrapper style={[s.passiveCard, editable && s.hexEditable]} onPress={onPress} activeOpacity={0.7}>
      <Text style={s.passiveLabel}>{label}</Text>
      <Text style={s.passiveValue}>
        {value}{suffix ? <Text style={s.passiveSuffix}>{suffix}</Text> : null}
      </Text>
      {editable && <MaterialCommunityIcons name="pencil" size={8} color={colors.outline} style={{ position: 'absolute', top: 4, right: 4 }} />}
    </Wrapper>
  );
}

const s = StyleSheet.create({
  // ── Desktop layout
  /** Desktop scroll padding. No `gap` — section spacing is handled by the
   *  `marginTop` on each SectionLabel so the first section (saves strip)
   *  hugs the top while subsequent sections get breathing room. */
  deskScrollContent: { padding: 12, paddingTop: 12 },
  /** Top margin applied to every SectionLabel after the first one, so the
   *  bare (no-CardBlock) sections still read as discrete blocks. */
  deskSectionLabel: { marginTop: 18 },

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
  pinnedRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 7,
  },
  pinnedRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.outlineVariant },
  pinnedName: { fontSize: 11, fontFamily: fonts.headline, fontWeight: '700', color: colors.onSurface },
  pinnedSub: { fontSize: 8, color: colors.outline, marginTop: 1, textTransform: 'capitalize' },
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
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 8, paddingVertical: 4,
    backgroundColor: `${colors.hpDanger}18`,
    borderWidth: 1, borderColor: colors.hpDanger,
    borderRadius: 4,
  },
  condText: { fontSize: 9, fontFamily: fonts.label, fontWeight: '700', color: colors.onSurfaceVariant },
  condTextActive: { fontSize: 9, fontFamily: fonts.label, fontWeight: '700', color: colors.hpDanger },
  condNone: { fontSize: 11, fontFamily: fonts.label, color: colors.outline, fontStyle: 'italic' },
  addCondBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start',
    paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1, borderColor: colors.outlineVariant, borderStyle: 'dashed',
    borderRadius: 4,
  },
  addCondText: { fontSize: 9, fontFamily: fonts.label, fontWeight: '700', color: colors.outline },

  // Condition picker modal
  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  modalSheet: {
    width: '100%', maxWidth: 360,
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: 12, padding: 16, gap: 10,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { fontSize: 14, fontFamily: fonts.headline, fontWeight: '700', color: colors.onSurface },
  modalSearch: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1, borderColor: colors.outlineVariant,
    borderRadius: radius.lg, paddingHorizontal: 10, paddingVertical: 7,
  },
  modalSearchInput: { flex: 1, fontSize: 13, fontFamily: fonts.body, color: colors.onSurface },
  modalList: { maxHeight: 280 },
  condRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 11, paddingHorizontal: 2,
  },
  condRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.outlineVariant },
  condRowText: { fontSize: 14, fontFamily: fonts.body, fontWeight: '500', color: colors.onSurface },
  condRowDesc: { fontSize: 11, fontFamily: fonts.body, color: colors.onSurfaceVariant, lineHeight: 15 },

  // Editable-field hint — dashed primary border on tappable manual-mode
  // cells (e.g. the speed passive card). Kept after the desktop hex
  // ability strip moved to the Skills tab.
  hexEditable: { borderColor: colors.primary, borderStyle: 'dashed' as const },

  // Exhaustion (inline chip inside conditions list)
  exhaustionChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 4, paddingVertical: 2,
    backgroundColor: `${colors.hpDanger}18`,
    borderWidth: 1, borderColor: colors.hpDanger,
    borderRadius: 4,
  },
  exhaustionStep: {
    width: 18, height: 18, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: `${colors.hpDanger}22`,
  },


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
  actionGroup: { marginBottom: 8 },
  actionGroupHead: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 2, paddingTop: 4, paddingBottom: 6,
  },
  actionGroupBar: { width: 3, height: 12, borderRadius: 2 },
  actionGroupLabel: { flex: 1, fontSize: 8, fontFamily: fonts.label, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },
  actionGroupCount: { fontSize: 9, fontFamily: fonts.label, color: colors.outline },
  actionCards: { gap: 3 },
  actionCard: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceContainerLowest,
    borderWidth: 1, borderColor: colors.outlineVariant,
    borderRadius: 6, overflow: 'hidden',
  },
  /** Color stripe at the left edge — accent for action type. */
  actionCardBar: { width: 2, alignSelf: 'stretch' },
  /** Tighter body padding for the condensed two-row layout. */
  actionCardBody: { flex: 1, paddingHorizontal: 8, paddingVertical: 5, gap: 1 },
  actionCardTitleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  actionCardName: {
    flex: 1, fontSize: 12, fontFamily: fonts.headline, fontWeight: '600',
    color: colors.onSurface, letterSpacing: -0.1,
  },
  /** Compact uses chip — just the fraction, no "uses" suffix. */
  actionCardUses: { fontSize: 10, fontFamily: fonts.label, fontWeight: '700' },
  actionCardDesc: {
    fontSize: 11, fontFamily: fonts.body, color: colors.onSurfaceVariant, lineHeight: 15,
  },

  // Saving throws (shared mobile + desktop)
  /** Mobile grid: 3 cells per row, wrap. */
  savesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  /** Desktop strip: single horizontal row of 6 equal-width cells. */
  savesStripDesktop: { flexDirection: 'row', gap: 6 },
  saveRow: {
    width: '30.5%', flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 9,
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1, borderColor: colors.outlineVariant,
    borderRadius: radius.lg,
  },
  /** Desktop cell: same anatomy as the mobile saveRow but flex-1 for
   *  even distribution across 6 columns instead of fixed-percent width. */
  saveCellDesktop: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 8,
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1, borderColor: colors.outlineVariant,
    borderRadius: radius.lg,
  },
  /** Visual hint when Manual Mode is on so tapping toggles proficiency
   *  instead of rolling — dashed primary border mirrors the editable-field
   *  affordance used elsewhere on the sheet. */
  saveCellManual: { borderColor: colors.primary, borderStyle: 'dashed' as const },
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
