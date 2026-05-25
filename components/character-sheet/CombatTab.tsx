import { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Modal, TextInput, Pressable } from 'react-native';
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
 * MaterialCommunityIcons glyph for each SRD standard-action key, so a player
 * can scan the action list visually instead of reading every name. Custom /
 * homebrew feature actions (anything not in this map) fall back to a generic
 * sparkle, which also visually distinguishes them from SRD reference rows.
 */
const ACTION_ICONS: Record<string, React.ComponentProps<typeof MaterialCommunityIcons>['name']> = {
  attack: 'sword-cross',
  dash: 'run-fast',
  disengage: 'arrow-expand-right',
  dodge: 'shield-half-full',
  help: 'hand-heart',
  hide: 'eye-off',
  ready: 'timer-sand',
  search: 'magnify',
  'use-an-object': 'cube-outline',
  utilize: 'cube-outline',
  'cast-a-spell': 'auto-fix',
  magic: 'auto-fix',
  influence: 'account-voice',
  study: 'book-open-variant',
  'opportunity-attack': 'sword',
  'two-weapon-fighting': 'sword',
  'nick-offhand': 'knife',
};

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
  /** Open the shared EquipmentDetailModal for a weapon. Wired through
   *  CharacterSheet so the modal state lives at the sheet level — same
   *  affordance the Gear tab uses when tapping an inventory row name. */
  onOpenEquipmentDetail?: (item: Dnd5eEquipmentItem) => void;
  /** Open the shared ItemPickerModal — invoked from the Attacks + button
   *  intermediary modal. Wires to CharacterSheet's existing item picker
   *  state (same one the Gear tab "Add" button uses). */
  onOpenItemPicker?: () => void;
  /** Trigger the abilities add flow. `kind: 'menu'` opens the
   *  Import / Add-custom chooser (used by the Abilities + button);
   *  `kind: 'custom'` skips the chooser and opens the AbilityEditModal
   *  with the supplied actionType preset (used by the Actions + button
   *  to add a custom standard action). Both routes ultimately update
   *  resources.abilities through AbilitiesCardTab. */
  onTriggerAbilityAdd?: (req: { kind: 'menu' } | { kind: 'custom'; actionType?: string }) => void;
  /** Pass-through to the embedded AbilitiesCardTab — see CharacterSheet
   *  for the state shape. CombatTab itself doesn't read this; it just
   *  forwards both prongs of the signal-style trigger. */
  abilityAddRequest?:
    | ({ kind: 'menu' } & { counter: number })
    | ({ kind: 'custom'; actionType?: string } & { counter: number })
    | null;
  onAbilityAddConsumed?: () => void;
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
  onToggleSaveProficiency, onOpenEquipmentDetail, onOpenItemPicker, onTriggerAbilityAdd,
  abilityAddRequest, onAbilityAddConsumed,
}: Props) {
  // Intermediary "Add to <section>" modals. Each section header + button
  // opens its own picker so the user always sees the same modal shape,
  // even when only one option exists (keeps the affordance consistent).
  const [addAttacksOpen, setAddAttacksOpen] = useState(false);
  const [addActionsOpen, setAddActionsOpen] = useState(false);
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
      <>
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
          <SectionLabel
            style={s.deskSectionLabel}
            accent
            right={onOpenItemPicker ? <SectionAddButton label="Add to Attacks" onPress={() => setAddAttacksOpen(true)} /> : undefined}
          >ATTACKS</SectionLabel>
          {weapons.length === 0 ? (
            <Text style={s.emptyHint}>No weapons equipped — add gear in the Gear tab.</Text>
          ) : (
            <View>
              <View style={s.weaponHeaderRow}>
                <Text style={[s.weaponHeaderCell, { flex: 1 }]}>WEAPON</Text>
                <Text style={[s.weaponHeaderCell, s.weaponHitCol]}>HIT</Text>
                <Text style={[s.weaponHeaderCell, s.weaponDmgCol]}>DMG</Text>
              </View>
              <View style={s.equipCardList}>
                {weapons.map((w) => (
                  <WeaponCard
                    key={w.id}
                    item={w}
                    atkBonus={getAttackBonus(w)}
                    onRoll={onRoll}
                    onOpenDetail={onOpenEquipmentDetail}
                  />
                ))}
              </View>
            </View>
          )}

          {/* Pinned equipment — anything the player flagged via the
              pin icon on the Gear tab. Sits between Attacks and Spell
              Slots so consumables are within thumb-reach mid-combat. */}
          {pinnedItems.length > 0 && (
            <>
              <SectionLabel style={s.deskSectionLabel} accent>PINNED</SectionLabel>
              <View style={s.equipCardList}>
                {pinnedItems.map((item) => (
                  <PinnedCard
                    key={item.id}
                    item={item}
                    onRoll={onRoll}
                    onOpenDetail={onOpenEquipmentDetail}
                  />
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
          <SectionLabel
            style={s.deskSectionLabel}
            accent
            right={onTriggerAbilityAdd ? <SectionAddButton label="Add ability" onPress={() => onTriggerAbilityAdd({ kind: 'menu' })} /> : undefined}
          >ABILITIES</SectionLabel>
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
            addRequest={abilityAddRequest}
            onAddRequestConsumed={onAbilityAddConsumed}
          />

          {/* Actions — umbrella section. Inner groups are typed by action
              economy: "Standard Actions" is the 5e canonical Action-cost
              group (Attack, Dash, Dodge, etc.); Bonus / Reactions / Free
              are their own economy types. */}
          <SectionLabel
            style={s.deskSectionLabel}
            accent
            right={onTriggerAbilityAdd ? <SectionAddButton label="Add action" onPress={() => setAddActionsOpen(true)} /> : undefined}
          >ACTIONS</SectionLabel>
          <View>
            <ActionGroup label="Standard Actions" items={actions} color={colors.primary} />
            {bonuses.length > 0 && <ActionGroup label="Bonus Actions" items={bonuses} color={colors.secondary} />}
            {reactions.length > 0 && <ActionGroup label="Reactions" items={reactions} color={colors.hpDanger} />}
            {freeActions.length > 0 && <ActionGroup label="Free Actions" items={freeActions} color={colors.outline} />}
          </View>

      </ScrollView>
      {renderAddModals()}
      </>
    );
  }

  // ── Mobile: single-column scroll ────────────────────────────────────────────
  const passivePerception = 10 + (abilityMod(scores.wisdom) + (stats.skillProficiencies.includes('perception') ? prof : 0));

  return (
    <>
    <ScrollView contentContainerStyle={s.mobileContainer} showsVerticalScrollIndicator={false}>

      {/* Movement stats + saves block laid out as 2 columns sharing
          one row's vertical space. Left column has INIT (top) and SPD
          (bottom) stacked; right column owns the SAVING THROWS header
          + 3×2 grid. Each section divider line stops at its column
          edge instead of running the full width — visually pairs each
          heading with its own content. */}
      <View style={s.savesAndMoveRow}>
        <View style={s.moveCol}>
          <SectionLabel>MOVEMENT</SectionLabel>
          <View style={s.moveCardsStack}>
            <View style={s.moveStatCard}>
              <MaterialCommunityIcons name="lightning-bolt" size={12} color={colors.hpWarning} />
              <Text style={s.moveStatLabel}>INIT</Text>
              <Text style={s.moveStatValue}>
                {fmtMod((manualMode && stats.initiativeOverride != null) ? stats.initiativeOverride : abilityMod(scores.dexterity))}
              </Text>
            </View>
            <View style={s.moveStatCard}>
              <MaterialCommunityIcons name="run-fast" size={12} color={colors.hpWarning} />
              <Text style={s.moveStatLabel}>SPD</Text>
              <Text style={s.moveStatValue}>{stats.speed} ft</Text>
            </View>
          </View>
        </View>
        <View style={s.savesCol}>
          <SectionLabel>SAVING THROWS</SectionLabel>
          <SavingThrowsStrip
            scores={scores}
            stats={stats}
            prof={prof}
            manualMode={manualMode}
            onToggleSaveProficiency={onToggleSaveProficiency}
            onRoll={onRoll}
          />
        </View>
      </View>

      {/* Attacks */}
      <SectionLabel
        style={{ marginTop: 14 }}
        accent
        right={onOpenItemPicker ? <SectionAddButton label="Add to Attacks" onPress={() => setAddAttacksOpen(true)} /> : undefined}
      >ATTACKS</SectionLabel>
      {weapons.length === 0 ? (
        <View style={s.mobileEmptyHint}>
          <Text style={s.emptyHint}>No weapons equipped — add gear in the Gear tab.</Text>
        </View>
      ) : (
        <View>
          <View style={s.weaponHeaderRow}>
            <Text style={[s.weaponHeaderCell, { flex: 1 }]}>WEAPON</Text>
            <Text style={[s.weaponHeaderCell, s.weaponHitCol]}>HIT</Text>
            <Text style={[s.weaponHeaderCell, s.weaponDmgCol]}>DMG</Text>
          </View>
          <View style={s.equipCardList}>
            {weapons.map((w) => (
              <WeaponCard
                key={w.id}
                item={w}
                atkBonus={getAttackBonus(w)}
                onRoll={onRoll}
                onOpenDetail={onOpenEquipmentDetail}
              />
            ))}
          </View>
        </View>
      )}

      {/* Pinned equipment (mobile) — mirrors the desktop "Pinned"
          card. Sits between attacks and spell slots. */}
      {pinnedItems.length > 0 && (
        <>
          <SectionLabel style={{ marginTop: 14 }} accent>PINNED</SectionLabel>
          <View style={s.equipCardList}>
            {pinnedItems.map((item) => (
              <PinnedCard
                key={item.id}
                item={item}
                onRoll={onRoll}
                onOpenDetail={onOpenEquipmentDetail}
              />
            ))}
          </View>
        </>
      )}

      {/* Conditions + Passives sections were here. Both moved into the
          mobile hero card: conditions are now the dedicated supp strip
          below the hero, and passive senses + PROF + HD fit in the
          hero's 5-cell stat row. Hit-die spending lives in the Short
          Rest flow (hero card's corner Rest button). */}

      {/* Active abilities — merged in from the old standalone
          Abilities tab. Mirrors the desktop layout: SectionLabel with
          a + button on the right slot, and the AbilitiesCardTab is
          rendered headerless so the embedded component doesn't
          duplicate the header or stamp Rest buttons (Rest lives in
          the hero card's corner-button cluster now). */}
      <SectionLabel
        style={{ marginTop: 14 }}
        accent
        right={onTriggerAbilityAdd ? <SectionAddButton label="Add ability" onPress={() => onTriggerAbilityAdd({ kind: 'menu' })} /> : undefined}
      >ABILITIES</SectionLabel>
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
        addRequest={abilityAddRequest}
        onAddRequestConsumed={onAbilityAddConsumed}
      />

      {/* Actions — desktop renders these inside a CardBlock; mobile
          used to drop them entirely (so a player on a phone had no
          quick reference for Dash / Dodge / Help / cantrips / class-
          feature actions). Mirror the same ActionGroup composition
          here. */}
      <SectionLabel
        style={{ marginTop: 14 }}
        accent
        right={onTriggerAbilityAdd ? <SectionAddButton label="Add action" onPress={() => setAddActionsOpen(true)} /> : undefined}
      >ACTIONS</SectionLabel>
      <View style={s.mobileCard}>
        <ActionGroup label="Standard Actions" items={actions} color={colors.primary} />
        {bonuses.length > 0 && <ActionGroup label="Bonus Actions" items={bonuses} color={colors.secondary} />}
        {reactions.length > 0 && <ActionGroup label="Reactions" items={reactions} color={colors.hpDanger} />}
        {freeActions.length > 0 && <ActionGroup label="Free Actions" items={freeActions} color={colors.outline} />}
      </View>

      <View style={{ height: 16 }} />
    </ScrollView>
    {renderAddModals()}
    </>
  );

  /**
   * Shared by both desktop and mobile branches. Renders the two
   * intermediary modals owned by this component (Attacks + Actions);
   * the Abilities flow lives in CharacterSheet and is triggered via
   * the `onTriggerAbilityAdd` prop directly from the section header.
   */
  function renderAddModals() {
    return (
      <>
        {addAttacksOpen ? (
          <AddSheetModal
            title="Add to Attacks"
            options={[{
              label: 'Add weapon',
              icon: 'sword',
              description: 'Open the item catalog to pick a weapon for your inventory.',
              onPress: () => onOpenItemPicker?.(),
            }]}
            onClose={() => setAddAttacksOpen(false)}
          />
        ) : null}
        {addActionsOpen ? (
          <AddSheetModal
            title="Add Action"
            options={[{
              label: 'Add custom action',
              icon: 'flash',
              description: 'Create a custom standard-action ability (homebrew). Shows up in Abilities too.',
              onPress: () => onTriggerAbilityAdd?.({ kind: 'custom', actionType: 'action' }),
            }]}
            onClose={() => setAddActionsOpen(false)}
          />
        ) : null}
      </>
    );
  }
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
 * Pick a MaterialCommunityIcons glyph for a weapon based on its name
 * (with a `range` fallback for unknown ranged weapons). Name matching
 * covers the common 5e weapons; unmatched melee weapons land on the
 * generic crossed-swords glyph, unmatched ranged on the bow icon.
 *
 * Conservative icon set — only glyphs verified present in MCI 7.x are
 * referenced so swapping the icon font doesn't break the sheet.
 */
function getWeaponIcon(item: Dnd5eEquipmentItem): React.ComponentProps<typeof MaterialCommunityIcons>['name'] {
  const name = item.name.toLowerCase();
  // Ranged weapons (bows / crossbows / slings / blowguns)
  if (/(crossbow|bow|sling|blowgun)/.test(name)) return 'bow-arrow';
  // Thrown projectiles (darts, javelins)
  if (/(dart|javelin)/.test(name)) return 'arrow-projectile';
  // Slashing — axes
  if (/(axe|hatchet)/.test(name)) return 'axe';
  // Slashing — light blades
  if (/(dagger|knife|dirk|stiletto)/.test(name)) return 'knife';
  // Bludgeoning — hammers
  if (/(warhammer|hammer|maul|mallet)/.test(name)) return 'hammer';
  // Bludgeoning — mace family (gavel reads as a small blunt instrument)
  if (/(mace|flail|morningstar|club|cudgel)/.test(name)) return 'gavel';
  // Quarterstaff / staff — use a generic stick-like glyph
  if (/(staff|quarterstaff)/.test(name)) return 'baseball-bat';
  // Whip — chain/whip-like glyph
  if (/whip/.test(name)) return 'snake';
  // Generic ranged fallback (range field set but name didn't match)
  if (item.range) return 'bow-arrow';
  // Default melee fallback (swords, rapiers, scimitars, etc.)
  return 'sword-cross';
}

/**
 * Equipment card — bordered row with a left accent bar + icon, matching the
 * action-card visual language. Used by both Attacks (weapons) and Pinned
 * items. The whole card is tappable: opens the EquipmentDetailModal when a
 * handler is wired (same affordance the Gear tab uses).
 */
function WeaponCard({
  item, atkBonus, onRoll, onOpenDetail,
}: {
  item: Dnd5eEquipmentItem;
  atkBonus: number;
  onRoll: (r: RollResult) => void;
  onOpenDetail?: (item: Dnd5eEquipmentItem) => void;
}) {
  const iconName = getWeaponIcon(item);
  return (
    <TouchableOpacity
      style={s.equipCard}
      onPress={onOpenDetail ? () => onOpenDetail(item) : undefined}
      activeOpacity={onOpenDetail ? 0.7 : 1}
      disabled={!onOpenDetail}
    >
      <View style={[s.equipCardBar, { backgroundColor: colors.primary }]} />
      <View style={s.equipCardBody}>
        <View style={s.equipCardTitleRow}>
          <MaterialCommunityIcons name={iconName} size={13} color={colors.primary} style={{ marginRight: 2 }} />
          <Text style={s.equipCardName} numberOfLines={1}>{item.name}</Text>
          <View style={s.weaponHitCol}>
            <TouchableOpacity
              style={s.atkBtnHit}
              onPress={(e) => { e.stopPropagation?.(); rollD20(`${item.name} attack`, atkBonus, onRoll); }}
              activeOpacity={0.7}
            >
              <Text style={s.atkBtnHitText}>{fmtMod(atkBonus)} Hit</Text>
            </TouchableOpacity>
          </View>
          <View style={s.weaponDmgCol}>
            {item.damage ? (
              <TouchableOpacity
                style={s.atkBtnDmg}
                onPress={(e) => { e.stopPropagation?.(); rollDamage(`${item.name} damage`, item.damage!, onRoll); }}
                activeOpacity={0.7}
              >
                <Text style={s.atkBtnDmgText}>{item.damage.split(' ')[0]}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
        {item.range ? (
          <Text style={s.equipCardSub}>range {item.range} ft</Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

/**
 * Pinned-item card — same visual chassis as WeaponCard but with a pin icon
 * (signals "you flagged this for quick combat access") and a flexible sub
 * line covering damage / notes / slot+equipped/attuned status.
 */
function PinnedCard({
  item, onRoll, onOpenDetail,
}: {
  item: Dnd5eEquipmentItem;
  onRoll: (r: RollResult) => void;
  onOpenDetail?: (item: Dnd5eEquipmentItem) => void;
}) {
  const subText = item.notes
    ? item.notes
    : item.damage
      ? item.damage
      : `${item.slot}${item.equipped ? ' · equipped' : ''}${item.attuned ? ' · attuned' : ''}`;
  return (
    <TouchableOpacity
      style={s.equipCard}
      onPress={onOpenDetail ? () => onOpenDetail(item) : undefined}
      activeOpacity={onOpenDetail ? 0.7 : 1}
      disabled={!onOpenDetail}
    >
      <View style={[s.equipCardBar, { backgroundColor: colors.secondary }]} />
      <View style={s.equipCardBody}>
        <View style={s.equipCardTitleRow}>
          <MaterialCommunityIcons name="pin" size={13} color={colors.secondary} style={{ marginRight: 2 }} />
          <Text style={s.equipCardName} numberOfLines={1}>{item.name}</Text>
          {item.damage && item.slot === 'weapon' ? (
            <TouchableOpacity
              style={s.atkBtnDmg}
              onPress={(e) => { e.stopPropagation?.(); rollDamage(`${item.name} damage`, item.damage!, onRoll); }}
              activeOpacity={0.7}
            >
              <Text style={s.atkBtnDmgText}>{item.damage.split(' ')[0]}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        <Text style={s.equipCardSub} numberOfLines={1}>{subText}</Text>
      </View>
    </TouchableOpacity>
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
  extras,
}: {
  scores: Dnd5eAbilityScores;
  stats: Dnd5eStats;
  prof: number;
  manualMode?: boolean;
  onToggleSaveProficiency?: (ability: keyof Dnd5eAbilityScores) => void;
  onRoll: (r: RollResult) => void;
  isDesktop?: boolean;
  /** Mobile-only — extra read-only cells appended after the 6 saves so
   *  INIT and SPD fit in the same 4×2 grid (frees up the hero-card
   *  supp strip for Conditions on mobile). On desktop these stats live
   *  in the left sidebar separately. */
  extras?: Array<{ label: string; value: string }>;
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
      {!isDesktop && extras?.map((extra) => (
        <View key={extra.label} style={s.saveRow}>
          <Text style={s.saveAbility}>{extra.label}</Text>
          <Text style={s.saveBonus}>{extra.value}</Text>
        </View>
      ))}
    </View>
  );
}

function ActionGroup({ label, items, color }: { label: string; items: Dnd5eFeature[]; color: string }) {
  // Group-level collapse: groups start collapsed so the Combat tab leads
  // with attacks / abilities / resources without a wall of SRD action
  // text pushing them off-screen. The header chevron expands the group
  // when the player needs the reference (e.g. checking Dodge mechanics
  // or a class-feature action's description).
  const [expanded, setExpanded] = useState(false);
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
  // Description starts hidden so the list scans as a clean roster of action
  // names; tapping the row reveals the prose for the rules-reference use case
  // (e.g. "how does Dodge actually work?"). Rows without a description stay
  // inert — no chevron, no tap target.
  const [expanded, setExpanded] = useState(false);
  const iconName = ACTION_ICONS[feature.id] ?? 'star-four-points';
  const hasDesc = !!feature.description;
  const Wrapper = hasDesc ? TouchableOpacity : View;
  return (
    <Wrapper
      style={s.actionCard}
      onPress={hasDesc ? () => setExpanded((v) => !v) : undefined}
      activeOpacity={0.7}
    >
      <View style={[s.actionCardBar, { backgroundColor: color }]} />
      <View style={s.actionCardBody}>
        <View style={s.actionCardTitleRow}>
          <MaterialCommunityIcons name={iconName} size={13} color={color} style={{ marginRight: 2 }} />
          <Text style={s.actionCardName} numberOfLines={1}>{feature.name}</Text>
          {feature.uses ? (
            <Text style={[s.actionCardUses, { color }]}>
              {feature.uses.current}/{feature.uses.max}
            </Text>
          ) : null}
          {hasDesc ? (
            <MaterialCommunityIcons
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={12}
              color={colors.outline}
            />
          ) : null}
        </View>
        {expanded && feature.description ? (
          <Text style={s.actionCardDesc}>{feature.description}</Text>
        ) : null}
      </View>
    </Wrapper>
  );
}

function SectionLabel({ children, style, accent, right }: { children: string; style?: any; accent?: boolean; right?: React.ReactNode }) {
  return (
    <View style={[s.sectionRow, style]}>
      <Text style={[s.sectionLabel, accent && s.sectionLabelAccent]}>{children}</Text>
      <View style={[s.sectionLine, accent && s.sectionLineAccent]} />
      {right}
    </View>
  );
}

/**
 * Small "+" affordance rendered in a SectionLabel's right slot. Outlined
 * pill matching the design tokens — primary tint at low opacity so it
 * sits alongside the section divider without competing for attention.
 */
function SectionAddButton({ onPress, label }: { onPress: () => void; label: string }) {
  return (
    <TouchableOpacity style={s.sectionAddBtn} onPress={onPress} activeOpacity={0.7} accessibilityLabel={label}>
      <MaterialCommunityIcons name="plus" size={12} color={colors.primary} />
    </TouchableOpacity>
  );
}

/**
 * Reusable bottom-sheet picker used by the section + buttons. Each option
 * is a row with an icon, label, and (optional) one-line description.
 * Selecting an option fires its callback and dismisses the modal.
 */
function AddSheetModal({ title, options, onClose }: {
  title: string;
  options: Array<{
    label: string;
    icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
    description?: string;
    onPress: () => void;
    disabled?: boolean;
  }>;
  onClose: () => void;
}) {
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.addSheetBackdrop} onPress={onClose}>
        <Pressable style={s.addSheetCard} onPress={() => {}}>
          <View style={s.addSheetHeader}>
            <Text style={s.addSheetTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10} activeOpacity={0.7}>
              <MaterialCommunityIcons name="close" size={18} color={colors.outline} />
            </TouchableOpacity>
          </View>
          <View style={{ gap: 6 }}>
            {options.map((opt) => (
              <TouchableOpacity
                key={opt.label}
                style={[s.addSheetOption, opt.disabled && s.addSheetOptionDisabled]}
                onPress={() => { if (opt.disabled) return; opt.onPress(); onClose(); }}
                activeOpacity={opt.disabled ? 1 : 0.7}
                disabled={opt.disabled}
              >
                <MaterialCommunityIcons name={opt.icon} size={18} color={opt.disabled ? colors.outline : colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={[s.addSheetOptionLabel, opt.disabled && { color: colors.outline }]}>{opt.label}</Text>
                  {opt.description ? (
                    <Text style={s.addSheetOptionDesc}>{opt.description}</Text>
                  ) : null}
                </View>
                <MaterialCommunityIcons name="chevron-right" size={16} color={colors.outline} />
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
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

  // Equipment cards (Attacks + Pinned) — mirror the action-card visual:
  // transparent bg, thin outline, full-height accent bar, compact body.
  equipCardList: { gap: 4 },
  equipCard: {
    flexDirection: 'row',
    borderWidth: 1, borderColor: colors.outlineVariant,
    borderRadius: 6, overflow: 'hidden',
  },
  equipCardBar: { width: 2, alignSelf: 'stretch' },
  equipCardBody: { flex: 1, paddingHorizontal: 8, paddingVertical: 5, gap: 1 },
  equipCardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  equipCardName: {
    flex: 1, fontSize: 12, fontFamily: fonts.headline, fontWeight: '600',
    color: colors.onSurface, letterSpacing: -0.1,
  },
  equipCardSub: {
    fontSize: 10, fontFamily: fonts.label, color: colors.outline,
    marginLeft: 17, textTransform: 'capitalize',
  },
  /** Attacks-table header strip — small uppercase labels above the
   *  weapon card list. Padded 10px on the left so the WEAPON label
   *  starts roughly above each card's body content (past the 2px bar
   *  and 8px body padding). */
  weaponHeaderRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.outlineVariant,
    marginBottom: 4,
  },
  weaponHeaderCell: {
    fontSize: 8, fontFamily: fonts.label, fontWeight: '700',
    letterSpacing: 1.2, textTransform: 'uppercase', color: colors.outline,
  },
  /** Fixed-width chip columns shared between the WeaponCard title row
   *  and the header strip above, so Hit / Dmg chips land directly
   *  under their column headers. */
  weaponHitCol: { width: 72, alignItems: 'center', textAlign: 'center' as const },
  weaponDmgCol: { width: 72, alignItems: 'center', textAlign: 'center' as const },
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
  /** Small outlined + affordance that sits in the right slot of a
   *  SectionLabel — opens the section's intermediary "Add to X" modal. */
  sectionAddBtn: {
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: `${colors.primary}66`,
    backgroundColor: `${colors.primary}14`,
  },
  // AddSheetModal — reusable "Add to <section>" intermediary picker.
  addSheetBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  addSheetCard: {
    width: '100%', maxWidth: 380,
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: 12, padding: 16, gap: 12,
  },
  addSheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  addSheetTitle: { fontSize: 14, fontFamily: fonts.headline, fontWeight: '700', color: colors.onSurface },
  addSheetOption: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 10, paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1, borderColor: colors.outlineVariant,
  },
  addSheetOptionDisabled: { opacity: 0.5 },
  addSheetOptionLabel: { fontSize: 13, fontFamily: fonts.headline, fontWeight: '600', color: colors.onSurface },
  addSheetOptionDesc: { fontSize: 10, fontFamily: fonts.body, color: colors.onSurfaceVariant, marginTop: 2 },
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
    // 3 cells per row × 2 rows = 6 saves. 31% width + small gaps
    // leaves a hair of margin so cells don't wrap to 2-per-row when
    // the savesCol gets squeezed by the right column.
    width: '31%', flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 5, paddingVertical: 5,
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1, borderColor: colors.outlineVariant,
    borderRadius: radius.lg,
  },
  /** 2-column saves + movement layout. Left column holds the SAVING
   *  THROWS header + 3×2 grid; right column has INIT (top) and SPD
   *  (bottom) stacked. ~65/35 split — saves block gets enough width
   *  to land 3 cells per row without wrapping to 2; movement column
   *  trims to fit. Visible 8px gap between the two columns. */
  savesAndMoveRow: { flexDirection: 'row', alignItems: 'stretch', gap: 12 },
  savesCol: { flex: 72, minWidth: 0 },
  moveCol: { flex: 28, minWidth: 0 },
  /** Wraps the two movement cards so the inter-card gap doesn't also
   *  push the first card down from the section label — flex:1 lets the
   *  stack absorb the remaining column height (matched to the saves
   *  grid via alignItems:stretch on the outer row), and the cards split
   *  it evenly. Without the wrapper, a gap on moveCol would apply
   *  between SectionLabel→card1 too, offsetting the right column 10px
   *  below the saves grid's top edge. */
  moveCardsStack: { flex: 1, gap: 6 },
  /** Movement stat card — single line: icon · label (flex 1) · value
   *  right-aligned. flex: 1 makes the two cards split the wrapper
   *  height evenly; combined with alignItems:stretch on the outer row,
   *  the bottom of the second card aligns to the bottom of the saves
   *  grid next door. */
  moveStatCard: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 8, paddingVertical: 4,
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1, borderColor: colors.outlineVariant,
    borderRadius: radius.lg,
  },
  moveStatLabel: {
    flex: 1,
    fontSize: 10, fontFamily: fonts.label, fontWeight: '700',
    letterSpacing: 1, color: colors.onSurfaceVariant, textTransform: 'uppercase' as const,
  },
  moveStatValue: {
    fontSize: 12, fontFamily: fonts.headline, fontWeight: '700',
    color: colors.onSurface,
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
