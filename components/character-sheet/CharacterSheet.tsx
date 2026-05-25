import { useEffect, useMemo, useRef, useState } from 'react';
import { useDrag, useDrop } from 'react-dnd';
import { SharedDndProvider } from '../DndProviderContext';
import {
  View, Text, Image, TouchableOpacity, TextInput,
  ActivityIndicator, Modal, Pressable, Switch, StyleSheet, Platform, useWindowDimensions, Alert,
} from 'react-native';
import { ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  getCharacterById, updateCharacter, updateCharacterState, uploadCharacterPortrait, uploadCharacterCardImage, supabase,
  getCampaignCharacterRules, resolveRuleValues, deleteCharacter,
} from '@vaultstone/api';
import { BUNDLED_SYSTEMS_BY_ID, spellSlotsForCharacter, resolveSubclassCasting, getEffectiveSpellcastingAbility, getEquippedAC as getEquippedACShared } from '@vaultstone/systems';
import { useAuthStore, useCharacterStore } from '@vaultstone/store';
import { colors, spacing, fonts, radius, ImageCropModal } from '@vaultstone/ui';
import { getSrdContent, ContentResolver } from '@vaultstone/content';
import type { Database, Dnd5eStats, Dnd5eResources, Dnd5eAbilityScores, CharacterSettings, Dnd5eEquipmentItem, EquipmentSlot, Dnd5eFeature, Dnd5ePreparedSpell, ClassResult, SubclassResult, SpeciesResult, BackgroundResult, FeatResult, ConditionResult, SkillResult, ItemResult } from '@vaultstone/types';
import { getClassEntries, getSpellbook } from '@vaultstone/types';
import { HpModal } from './HpModal';
import { ConditionsPanel } from './ConditionsPanel';
import { RollToast } from './RollToast';
import type { RollResult } from './RollToast';
import { CombatTab, ConditionsSection } from './CombatTab';
import { SkillsTab } from './SkillsTab';
import { AbilitiesTab } from './AbilitiesTab';
import { SpellsTab } from './SpellsTab';
import { GearTab, EquipmentDetailModal } from './GearTab';
import { LoreTab } from './LoreTab';
import { FeatPickerModal } from './FeatPickerModal';
import { SpellPickerModal } from './SpellPickerModal';
import { ItemPickerModal, itemResultToEquipment } from './ItemPickerModal';

type Character = Database['public']['Tables']['characters']['Row'];

type TabId = 'combat' | 'spells' | 'skills' | 'traits' | 'gear' | 'lore';
type TabLayoutState = {
  left: TabId[];
  right: TabId[];
  activeLeft: TabId;
  activeRight: TabId | null;
};
const DEFAULT_TAB_LAYOUT: TabLayoutState = {
  left: ['combat', 'spells', 'gear'],
  right: ['skills', 'traits', 'lore'],
  activeLeft: 'combat',
  activeRight: 'skills',
};

type ActivityEntry = { id: string; at: number } & (
  | { kind: 'roll'; result: RollResult }
  | { kind: 'hp'; from: number; to: number; delta: number }
  | { kind: 'tempHp'; from: number; to: number; delta: number }
  | { kind: 'condition'; name: string; action: 'added' | 'removed' }
  | { kind: 'exhaustion'; from: number; to: number }
  | { kind: 'deathSave'; result: 'success' | 'failure' }
);
type ActivityInput = ActivityEntry extends infer U
  ? U extends { id: string; at: number }
    ? Omit<U, 'id' | 'at'>
    : never
  : never;

// Module-level cache for resolved content so the sheet doesn't show
// "Resolving…" placeholders on every remount (e.g. after level-up).
type ContentCache = {
  speciesResult: SpeciesResult | null;
  classResultsByKey: Record<string, ClassResult>;
  subclassResultsByKey: Record<string, SubclassResult>;
  backgroundResult: BackgroundResult | null;
  originFeatResult: FeatResult | null;
  conditionResults: ConditionResult[];
  skillResults: SkillResult[];
  fetchedAt: number;
};
const _contentCache = new Map<string, ContentCache>();
const CONTENT_CACHE_TTL = 5 * 60_000;

function getCachedContent(charId: string): ContentCache | null {
  const c = _contentCache.get(charId);
  if (!c) return null;
  if (Date.now() - c.fetchedAt > CONTENT_CACHE_TTL) return null;
  return c;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function abilityMod(score: number) { return Math.floor((score - 10) / 2); }

/**
 * Passive-sense cell rendered in the mobile hero card. Icon + uppercase
 * label + value, sitting in a small bordered tile so the row mirrors
 * the desktop sidebar's Senses panel at a glance.
 */
function SenseCell({ icon, label, value }: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
  value: number;
}) {
  return (
    <View style={s.heroStatCell}>
      <View style={s.heroStatCellTop}>
        <MaterialCommunityIcons name={icon} size={11} color={colors.outline} />
        <Text style={s.heroStatCellLabel}>{label}</Text>
      </View>
      <Text style={s.heroStatCellValue}>{value}</Text>
    </View>
  );
}
function profBonus(level: number) { return Math.floor((level - 1) / 4) + 2; }
function fmtMod(n: number) { return n >= 0 ? `+${n}` : `${n}`; }
function capitalize(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }
function titleCase(s: string) { return s.split(' ').map(capitalize).join(' '); }

// Humanize a content key for display when ContentResolver hasn't returned
// yet (or doesn't carry the entry). SRD keys are slugs like `dwarf` or
// `artificer-srd-2-0` and humanize cleanly. Imported keys are shaped like
// `imported_dnd5e_2014_class_efa_artificer` — strip the leading metadata
// segments (`imported`, system, srdVersion, type, source) so the trailing
// slug is what the user sees. This is a fallback; the real name comes
// from ContentResolver once the lookup resolves.
function humanizeContentKey(key: string): string {
  if (!key) return '';
  let slug = key;
  if (slug.startsWith('imported_')) {
    const parts = slug.split('_');
    if (parts.length > 5) slug = parts.slice(5).join('_');
  }
  slug = slug.replace(/-srd-[\d-]+$/i, '');
  return slug.split(/[-_\s]+/).filter(Boolean).map(capitalize).join(' ');
}

// Spell prep limits surfaced under the Manage Spells / Prepare Spells
// filters. Three buckets, each summed across multiclass entries:
//
//   - cantrips   : `cantrips` (5.2) → `cantripsKnown` (5.1)
//   - spellbook  : `spellsKnown` (5.1 known-list classes only). For
//                  prepare-list classes the spellbook is effectively
//                  uncapped (a Wizard's spellbook holds whatever they
//                  scribe), so this stays undefined for them and the
//                  Manage Spells modal omits the denominator.
//   - prepared   : `preparedSpells` (5.2; rebranded "known" for sorc
//                  in 2024) → ability-mod + classLevel formula for
//                  5.1 prepare-list classes (min 1).
//
// Returns undefined for any bucket no caster contributes to; that
// signals the picker to drop the denominator instead of showing "0/0".
const ABILITY_BY_NAME: Record<string, keyof Dnd5eAbilityScores> = {
  intelligence: 'intelligence',
  wisdom: 'wisdom',
  charisma: 'charisma',
  strength: 'strength',
  dexterity: 'dexterity',
  constitution: 'constitution',
};

// Class names whose 5.1 prep limit is `mod + class level` (min 1). The
// rest either have a structured `spellsKnown` column (handled separately)
// or use the 2024 `preparedSpells` column.
const PREPARE_FORMULA_CLASSES_5_1 = new Set(['wizard', 'cleric', 'druid', 'paladin', 'artificer']);

function computeSpellLimits(
  stats: Dnd5eStats,
  classResultsByKey: Record<string, ClassResult>,
): { cantrips?: number; spellbook?: number; prepared?: number } {
  const entries = getClassEntries(stats);
  const scores = stats.abilityScores;
  let cantrips = 0;
  let spellbook = 0;
  let prepared = 0;
  let sawCantrip = false;
  let sawSpellbook = false;
  let sawPrepared = false;
  for (const e of entries) {
    const cls = classResultsByKey[e.classKey];
    if (!cls?.spellcasting || !cls.progressionTable) continue;
    const row = cls.progressionTable.find((r) => r.level === Math.min(e.level, 20));
    if (!row) continue;

    // Cantrips — try direct keys, then label match. Imported 5e.tools
    // classes use `col2` keyed columns with "Cantrips" as the label.
    const c = readProgressionValue(
      cls, row,
      ['cantrips', 'cantripsKnown'],
      ['Cantrips Known', 'Cantrips'],
    );
    if (c !== null) { cantrips += c; sawCantrip = true; }

    // Known-list classes carry `spellsKnown` (5.1 Sorcerer / Bard /
    // Ranger / Warlock — Warlock 2014 had its own ad-hoc track too).
    // For prepare-list classes the spellbook is uncapped, so we
    // simply don't accumulate a number — sawSpellbook stays false
    // and the Manage Spells modal omits the denominator.
    const sk = readProgressionValue(
      cls, row,
      ['spellsKnown'],
      ['Spells Known'],
    );
    if (sk !== null) { spellbook += sk; sawSpellbook = true; }

    // Prepared — 2024 ships `preparedSpells`. Prepare-list 5.1
    // classes don't, so we compute `mod + classLevel` (min 1) using
    // the class's spellcasting ability + the character's score.
    const pStructured = readProgressionValue(
      cls, row,
      ['preparedSpells'],
      ['Prepared Spells'],
    );
    if (pStructured !== null) {
      prepared += pStructured;
      sawPrepared = true;
    } else if (scores && cls.spellcastingAbility && PREPARE_FORMULA_CLASSES_5_1.has(cls.name.toLowerCase())) {
      const abilityKey = ABILITY_BY_NAME[cls.spellcastingAbility.toLowerCase()];
      if (abilityKey) {
        const score = scores[abilityKey];
        const mod = Math.floor((score - 10) / 2);
        prepared += Math.max(1, mod + e.level);
        sawPrepared = true;
      }
    }
  }
  return {
    cantrips: sawCantrip ? cantrips : undefined,
    spellbook: sawSpellbook ? spellbook : undefined,
    prepared: sawPrepared ? prepared : undefined,
  };
}

function parseProgressionInt(raw: string | number | undefined): number | null {
  if (raw == null || raw === '—') return null;
  const n = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : null;
}

// Read a progression-table value by trying each known column key, then
// falling back to a label match through `progressionColumns`. Imported
// 5e.tools classes (notably Artificer) use generic `col0`/`col1`/...
// keys with the human label carrying the meaning ("Cantrips Known",
// "Prepared Spells"), so a key-only probe misses them.
function readProgressionValue(
  cls: ClassResult,
  row: { values: Record<string, string | number> },
  candidateKeys: string[],
  candidateLabels: string[],
): number | null {
  for (const k of candidateKeys) {
    const v = parseProgressionInt(row.values[k]);
    if (v !== null) return v;
  }
  if (cls.progressionColumns) {
    for (const col of cls.progressionColumns) {
      const labelLc = col.label.toLowerCase();
      if (candidateLabels.some((cand) => labelLc === cand.toLowerCase() || labelLc.includes(cand.toLowerCase()))) {
        const v = parseProgressionInt(row.values[col.key]);
        if (v !== null) return v;
      }
    }
  }
  return null;
}

// Per-class spellcasting payload for the Spells tab. Mixes structured
// data (always present — ability, cantrips known, prep limit) with the
// class-shipped prose (optional — some classes ship only a thin "see
// the PHB" stub, so we surface synthesized stats alongside whatever
// prose exists). The synthesized core-stats grid renders above the
// prose; a class with no prose still gets the actionable numbers.
function spellcastingExplainersFor(
  stats: Dnd5eStats,
  classResultsByKey: Record<string, ClassResult>,
  subclassResultsByKey?: Record<string, SubclassResult>,
): Array<{
  className: string;
  spellcastingAbility: string | null;
  cantripsKnown?: number;
  spellsKnownOrPrepared?: number;
  preparedLabel?: string;
  preparedFormula?: string;
  description?: string;
}> {
  const out: Array<{
    className: string;
    spellcastingAbility: string | null;
    cantripsKnown?: number;
    spellsKnownOrPrepared?: number;
    preparedLabel?: string;
    preparedFormula?: string;
    description?: string;
  }> = [];
  for (const e of getClassEntries(stats)) {
    const cls = classResultsByKey[e.classKey];
    const sub = e.subclassKey && subclassResultsByKey ? subclassResultsByKey[e.subclassKey] : undefined;
    const subCasting = resolveSubclassCasting(sub);

    if (!cls?.spellcasting && !subCasting) continue;

    if (cls?.spellcasting) {
      const feat = (cls.features ?? []).find(
        (f) => f.name.toLowerCase() === 'spellcasting' && f.level === 1,
      ) ?? (cls.features ?? []).find((f) => f.name.toLowerCase() === 'spellcasting');

      const row = cls.progressionTable?.find((r) => r.level === Math.min(e.level, 20));
      const cantripsKnown = row
        ? (readProgressionValue(cls, row, ['cantrips', 'cantripsKnown'], ['Cantrips Known', 'Cantrips']) ?? undefined)
        : undefined;
      const sk = row
        ? readProgressionValue(cls, row, ['spellsKnown'], ['Spells Known'])
        : null;
      const ps = row
        ? readProgressionValue(cls, row, ['preparedSpells'], ['Prepared Spells'])
        : null;

      let spellsKnownOrPrepared: number | undefined;
      let preparedLabel: string | undefined;
      let preparedFormula: string | undefined;
      if (sk !== null) {
        spellsKnownOrPrepared = sk;
        preparedLabel = 'Spells Known';
      } else if (ps !== null) {
        spellsKnownOrPrepared = ps;
        preparedLabel = 'Prepared Spells';
      } else if (cls.spellcastingAbility && PREPARE_FORMULA_CLASSES_5_1.has(cls.name.toLowerCase())) {
        const abilityKey = ABILITY_BY_NAME[cls.spellcastingAbility.toLowerCase()];
        if (abilityKey && stats.abilityScores) {
          const score = stats.abilityScores[abilityKey];
          const mod = Math.floor((score - 10) / 2);
          spellsKnownOrPrepared = Math.max(1, mod + e.level);
          preparedLabel = 'Prepared Spells';
          preparedFormula = `${cls.spellcastingAbility} mod + ${cls.name} level`;
        }
      }

      out.push({
        className: cls.name,
        spellcastingAbility: cls.spellcastingAbility ?? null,
        cantripsKnown,
        spellsKnownOrPrepared,
        preparedLabel,
        preparedFormula,
        description: feat?.description,
      });
    } else if (subCasting) {
      const scFeat = sub?.features?.find(
        (f) => f.name.toLowerCase() === 'spellcasting' || f.name.toLowerCase().includes('spellcasting'),
      );
      let cantripsKnown: number | undefined;
      let spellsKnown: number | undefined;
      // Read from the subclass's progression table when available
      const subRow = sub?.progressionTable?.find((r) => r.level === Math.min(e.level, 20));
      if (subRow && sub?.progressionColumns) {
        const readSubVal = (keys: string[], labels: string[]): number | undefined => {
          for (const k of keys) { const v = parseProgressionInt(subRow.values[k]); if (v !== null) return v; }
          for (const col of sub!.progressionColumns!) {
            const lc = col.label.toLowerCase();
            if (labels.some((l) => lc === l.toLowerCase() || lc.includes(l.toLowerCase()))) {
              const v = parseProgressionInt(subRow.values[col.key]); if (v !== null) return v;
            }
          }
          return undefined;
        };
        cantripsKnown = readSubVal(['cantrips', 'cantripsKnown'], ['Cantrips Known', 'Cantrips']);
        spellsKnown = readSubVal(['spellsKnown'], ['Spells Known']);
      }
      // Fallback for existing imports without progression tables
      if (cantripsKnown === undefined && spellsKnown === undefined && subCasting.casterProgression === 'third') {
        const thirdCantrips: Record<number, number> = { 3:3,4:3,5:3,6:3,7:3,8:3,9:3,10:4,11:4,12:4,13:4,14:4,15:4,16:4,17:4,18:4,19:4,20:4 };
        const thirdSpells: Record<number, number> = { 3:3,4:4,5:4,6:4,7:5,8:6,9:6,10:7,11:8,12:8,13:9,14:10,15:10,16:11,17:11,18:11,19:12,20:13 };
        cantripsKnown = thirdCantrips[e.level];
        spellsKnown = thirdSpells[e.level];
      }
      out.push({
        className: sub?.name ?? cls?.name ?? 'Subclass',
        spellcastingAbility: subCasting.ability,
        cantripsKnown,
        spellsKnownOrPrepared: spellsKnown,
        preparedLabel: spellsKnown !== undefined ? 'Spells Known' : undefined,
        description: scFeat?.description,
      });
    }
  }
  return out;
}

function StatCell({ icon, value, label, color, centered, editable, onPress }: { icon: string; value: string; label: string; color: string; centered?: boolean; editable?: boolean; onPress?: () => void }) {
  // `onPress` alone makes the cell tappable (e.g. hit-die spend). The
  // `editable` flag is reserved for manual-mode overrides — it adds
  // the hashed-border edit-affordance treatment + the pencil glyph,
  // signaling "tap to set a custom value". Action-only cells skip
  // both decorations.
  const Wrapper = onPress ? TouchableOpacity : View;
  return (
    <Wrapper style={[statCellStyle.cell, centered && statCellStyle.cellCentered, editable && statCellStyle.cellEditable]} onPress={onPress} activeOpacity={0.7}>
      <MaterialCommunityIcons name={icon as any} size={16} color={color} style={{ opacity: 0.75 }} />
      <View style={statCellStyle.text}>
        <Text style={[statCellStyle.value, { color }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
        <Text style={statCellStyle.label}>{label}</Text>
      </View>
      {editable && <MaterialCommunityIcons name="pencil" size={8} color={colors.outline} style={{ position: 'absolute', top: 4, right: 4 }} />}
    </Wrapper>
  );
}
const statCellStyle = StyleSheet.create({
  cell: {
    flex: 1,
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1, borderColor: colors.outlineVariant,
    borderRadius: radius.lg, paddingVertical: 8, paddingHorizontal: 8,
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  cellCentered: { justifyContent: 'center' },
  cellEditable: { borderColor: colors.primary, borderStyle: 'dashed' as any },
  text: { flex: 1, minWidth: 0, gap: 1 },
  value: { fontSize: 14, fontFamily: fonts.headline, fontWeight: '800', lineHeight: 17 },
  label: { fontSize: 8, fontFamily: fonts.label, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: colors.outline },
});

const SKILL_ABILITY: Record<string, keyof Dnd5eAbilityScores> = {
  acrobatics: 'dexterity', 'animal handling': 'wisdom', arcana: 'intelligence',
  athletics: 'strength', deception: 'charisma', history: 'intelligence',
  insight: 'wisdom', intimidation: 'charisma', investigation: 'intelligence',
  medicine: 'wisdom', nature: 'intelligence', perception: 'wisdom',
  performance: 'charisma', persuasion: 'charisma', religion: 'intelligence',
  'sleight of hand': 'dexterity', stealth: 'dexterity', survival: 'wisdom',
};
const ALL_SKILLS = Object.keys(SKILL_ABILITY);

const ABILITY_KEYS: (keyof Dnd5eAbilityScores)[] = [
  'strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma',
];
const ABILITY_SHORT: Record<keyof Dnd5eAbilityScores, string> = {
  strength: 'STR', dexterity: 'DEX', constitution: 'CON',
  intelligence: 'INT', wisdom: 'WIS', charisma: 'CHA',
};

type CardId = 'combat' | 'weapons-equipment' | 'class-features' | 'species-traits' | 'feats' | 'proficiencies' | 'conditions' | 'coins' | 'scratchpad';
type CardItem = { id: CardId };

const DEFAULT_CARD_ORDER: CardId[] = [
  'combat', 'weapons-equipment', 'class-features', 'species-traits',
  'feats', 'proficiencies', 'conditions', 'coins', 'scratchpad',
];

const CARD_LABELS: Record<CardId, string> = {
  'combat': 'HP / Movement / Ability Scores / Skills',
  'weapons-equipment': 'Weapons & Equipment',
  'class-features': 'Class Features',
  'species-traits': 'Species Traits',
  'feats': 'Feats',
  'proficiencies': 'Proficiencies & Training',
  'conditions': 'Conditions',
  'coins': 'Coins',
  'scratchpad': 'Scratchpad',
};

type EntryDescriptor = { icon: string; label: string; detail: string; accent: string; total: string };

function describeEntry(e: ActivityEntry): EntryDescriptor {
  switch (e.kind) {
    case 'roll': {
      const { label, rolls, bonus, total, crit, fumble } = e.result;
      const rollStr = `[${rolls.join(', ')}]${bonus !== 0 ? (bonus > 0 ? ` + ${bonus}` : ` − ${Math.abs(bonus)}`) : ''}`;
      return {
        icon: 'dice-d20',
        label,
        detail: `${rollStr}${crit ? ' · CRIT' : fumble ? ' · FUMBLE' : ''}`,
        accent: crit ? colors.hpHealthy : fumble ? colors.hpDanger : colors.primary,
        total: String(total),
      };
    }
    case 'hp': {
      const healed = e.delta > 0;
      return {
        icon: healed ? 'heart-plus' : 'sword',
        label: healed ? 'Healed' : 'Damage',
        detail: `${e.from} → ${e.to}`,
        accent: healed ? colors.hpHealthy : colors.hpDanger,
        total: `${healed ? '+' : ''}${e.delta}`,
      };
    }
    case 'tempHp': {
      return {
        icon: 'shield-plus-outline',
        label: 'Temp HP',
        detail: `${e.from} → ${e.to}`,
        accent: '#3B82F6',
        total: `${e.delta > 0 ? '+' : ''}${e.delta}`,
      };
    }
    case 'condition': {
      const added = e.action === 'added';
      return {
        icon: added ? 'alert-circle-outline' : 'close-circle-outline',
        label: added ? `+ ${e.name}` : `− ${e.name}`,
        detail: added ? 'Condition applied' : 'Condition cleared',
        accent: added ? colors.hpDanger : colors.outline,
        total: '',
      };
    }
    case 'exhaustion': {
      return {
        icon: 'battery-low',
        label: 'Exhaustion',
        detail: `Lv ${e.from} → ${e.to}`,
        accent: colors.hpDanger,
        total: `${e.to > e.from ? '+' : ''}${e.to - e.from}`,
      };
    }
    case 'deathSave': {
      const success = e.result === 'success';
      return {
        icon: success ? 'shield-check-outline' : 'skull-outline',
        label: `Death ${success ? 'Success' : 'Failure'}`,
        detail: '',
        accent: success ? colors.hpHealthy : colors.hpDanger,
        total: '',
      };
    }
  }
}

// ─── TabPane (desktop two-column support) ──────────────────────────────────

const ALL_TAB_DEFS: { id: TabId; icon: any; label: string }[] = [
  { id: 'combat',    icon: 'sword-cross',             label: 'Combat' },
  { id: 'spells',    icon: 'auto-fix',                label: 'Spells' },
  { id: 'skills',    icon: 'star-outline',            label: 'Skills' },
  { id: 'traits',    icon: 'lightning-bolt-outline',  label: 'Traits' },
  { id: 'gear',      icon: 'bag-personal-outline',    label: 'Gear' },
  { id: 'lore',      icon: 'book-open-outline',       label: 'Lore' },
];
const TAB_ORDER: Record<TabId, number> = Object.fromEntries(
  ALL_TAB_DEFS.map((d, i) => [d.id, i])
) as Record<TabId, number>;
function sortTabs(tabs: TabId[]): TabId[] {
  return [...tabs].sort((a, b) => TAB_ORDER[a] - TAB_ORDER[b]);
}

const DND_TAB = 'char-tab';
type TabDragItem = { id: TabId; fromSide: 'left' | 'right' };

function TabPane({
  tabs, activeId, side, onActivate, onMoveToSide, renderTab,
}: {
  tabs: TabId[];
  activeId: TabId;
  side: 'left' | 'right';
  onActivate: (id: TabId) => void;
  onMoveToSide: (id: TabId, toSide: 'left' | 'right') => void;
  renderTab: (id: TabId) => React.ReactNode;
}) {
  const [{ isOver, canDrop }, dropRef] = useDrop<TabDragItem, void, { isOver: boolean; canDrop: boolean }>(() => ({
    accept: DND_TAB,
    canDrop: (item) => item.fromSide !== side,
    drop: (item) => { onMoveToSide(item.id, side); },
    collect: (m) => ({ isOver: m.isOver(), canDrop: m.canDrop() }),
  }), [side, onMoveToSide]);

  return (
    <View style={paneStyle.pane}>
      <View
        ref={dropRef as any}
        style={[
          paneStyle.tabBar,
          canDrop && paneStyle.tabBarDroppable,
          canDrop && isOver && paneStyle.tabBarDropHot,
        ]}
      >
        {tabs.map((id) => {
          const def = ALL_TAB_DEFS.find((d) => d.id === id)!;
          return (
            <DraggableTab
              key={id}
              id={id}
              side={side}
              icon={def.icon}
              label={def.label}
              active={id === activeId}
              onPress={() => onActivate(id)}
            />
          );
        })}
        {canDrop && tabs.length === 0 && (
          <Text style={paneStyle.tabBarHint}>Drop tab here</Text>
        )}
      </View>
      <View style={{ flex: 1 }}>{renderTab(activeId)}</View>
    </View>
  );
}

function DraggableTab({
  id, side, icon, label, active, onPress,
}: {
  id: TabId;
  side: 'left' | 'right';
  icon: any;
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const [{ isDragging }, dragRef] = useDrag<TabDragItem, void, { isDragging: boolean }>(() => ({
    type: DND_TAB,
    item: { id, fromSide: side },
    collect: (m) => ({ isDragging: m.isDragging() }),
  }), [id, side]);
  return (
    <View ref={dragRef as any} style={{ opacity: isDragging ? 0.4 : 1 }}>
      <TouchableOpacity
        style={[paneStyle.tabBtn, active && paneStyle.tabBtnActive]}
        onPress={onPress}
        activeOpacity={0.7}
      >
        <MaterialCommunityIcons name={icon} size={16} color={active ? colors.primary : colors.outline} />
        <Text style={[paneStyle.tabLabel, active && paneStyle.tabLabelActive]}>{label}</Text>
      </TouchableOpacity>
    </View>
  );
}

function SplitDropZone({ onMove }: { onMove: (id: TabId) => void }) {
  const [{ isOver, canDrop }, dropRef] = useDrop<TabDragItem, void, { isOver: boolean; canDrop: boolean }>(() => ({
    accept: DND_TAB,
    canDrop: (item) => item.fromSide === 'left',
    drop: (item) => onMove(item.id),
    collect: (m) => ({ isOver: m.isOver(), canDrop: m.canDrop() }),
  }), [onMove]);
  if (!canDrop) return null;
  return (
    <View ref={dropRef as any} style={[paneStyle.splitZone, isOver && paneStyle.splitZoneHot]}>
      <Text style={paneStyle.splitZoneLabel}>Drop here to split</Text>
    </View>
  );
}

const paneStyle = StyleSheet.create({
  pane: { flex: 1, flexDirection: 'column' },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.outlineVariant,
    paddingHorizontal: 6, paddingTop: 6, gap: 2,
    flexWrap: 'wrap',
  },
  tabBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 7,
    borderRadius: 6, borderWidth: 1, borderColor: 'transparent',
    backgroundColor: colors.surfaceContainerLowest,
  },
  tabBtnActive: { borderColor: colors.primary, backgroundColor: `${colors.primary}14` },
  tabLabel: { fontSize: 11, fontFamily: fonts.label, fontWeight: '700', color: colors.outline },
  tabLabelActive: { color: colors.primary },
  tabBarDroppable: { backgroundColor: `${colors.primary}08` },
  tabBarDropHot: { backgroundColor: `${colors.primary}22` },
  tabBarHint: {
    fontSize: 11, fontFamily: fonts.label, color: colors.outline, fontStyle: 'italic',
    paddingVertical: 8, paddingHorizontal: 10, alignSelf: 'center',
  },
  splitZone: {
    width: 120, alignItems: 'center', justifyContent: 'center',
    backgroundColor: `${colors.primary}0a`,
    borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.outlineVariant,
    borderStyle: 'dashed', borderRightWidth: 2, borderRightColor: `${colors.primary}55`,
  },
  splitZoneHot: { backgroundColor: `${colors.primary}22` },
  splitZoneLabel: {
    fontSize: 11, fontFamily: fonts.label, fontWeight: '700',
    color: colors.primary, textAlign: 'center', paddingHorizontal: 8,
  },
});

// ─── Screen ─────────────────────────────────────────────────────────────────

/**
 * Reusable character sheet component. Originally a default-exported
 * screen at `app/character/[id]/index.tsx`; lifted out so the same UI
 * can render either as its own page or embedded inside the campaign
 * page's split pane.
 *
 *  - `characterId` replaces the prior `useLocalSearchParams<{id}>`.
 *  - `onClose` overrides the default back-button behavior. When
 *    omitted, falls back to `router.back()` → `router.replace`. The
 *    same callback fires on the delete-success path so an embedded
 *    instance can drop the split target instead of routing away.
 *  - `embedded` is a hint for chrome decisions (currently unused; the
 *    sheet renders the same chrome either way). Reserved so future
 *    tweaks have a single switch.
 */
export type CharacterSheetProps = {
  characterId: string;
  onClose?: () => void;
  embedded?: boolean;
};

export function CharacterSheet({ characterId, onClose, embedded: _embedded }: CharacterSheetProps) {
  const id = characterId;
  const router = useRouter();
  // Closing behavior — embedded callers pass `onClose` to drop the
  // split target; standalone callers go straight to the character list.
  // We used to call router.back() first, but on web with multi-tab
  // workspace history accumulating, "back" sometimes popped to a
  // previous internal state instead of the list. The playtester
  // described it as "cycling through tab changes". Always replace to
  // the canonical destination — the back button on the character
  // sheet means "exit to my characters", not "undo my last nav".
  const handleClose = () => {
    if (onClose) { onClose(); return; }
    router.replace('/(drawer)/characters');
  };
  const { updateCharacterLocally, setActiveCharacter } = useCharacterStore();
  const authUser = useAuthStore((state) => state.user);

  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  const [character, setCharacter] = useState<Character | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hpModalVisible, setHpModalVisible] = useState(false);
  const [settingsModal, setSettingsModal] = useState(false);
  // Two-step delete: first tap arms the destructive confirm UI inside
  // the same modal, second tap commits. Resets whenever the modal closes.
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [editingField, setEditingField] = useState<string | null>(null);
  const [fieldInput, setFieldInput] = useState('');
  const [hpQuickMode, setHpQuickMode] = useState<'damage' | 'heal' | null>(null);
  const [equipModal, setEquipModal] = useState(false);
  const [editEquip, setEditEquip] = useState<Dnd5eEquipmentItem | null>(null);
  const [xpAddMode, setXpAddMode] = useState(false);
  const [xpAddInput, setXpAddInput] = useState('');
  const [featureModal, setFeatureModal] = useState(false);
  const [editFeature, setEditFeature] = useState<Dnd5eFeature | null>(null);
  const [featureCategory, setFeatureCategory] = useState<'classFeatures' | 'speciesTraits' | 'feats'>('classFeatures');
  const [featPickerOpen, setFeatPickerOpen] = useState(false);
  const [spellPickerOpen, setSpellPickerOpen] = useState(false);
  // 'short' | 'long' | null — tracks which rest the player is about to
  // confirm. Resets to null on dismiss.
  const [restConfirm, setRestConfirm] = useState<'short' | 'long' | null>(null);
  /** Tiny picker shown when the player taps the corner Rest button on
   *  the mobile hero card — chooses Short vs Long before opening the
   *  existing restConfirm modal. */
  const [restChooserOpen, setRestChooserOpen] = useState(false);
  // Open the spend-hit-die confirm dialog. The actual roll + HP /
  // remaining mutation happens in handleSpendHitDie; this just gates
  // the side effect behind a confirm so a stray tap doesn't burn a
  // hit die mid-combat.
  const [spendHitDieOpen, setSpendHitDieOpen] = useState(false);
  // Equipment-row delete confirmation. We can't use Alert.alert here —
  // React Native Web's port doesn't reliably invoke button callbacks,
  // so the user just sees a no-op when tapping the row's X. Mirroring
  // the restConfirm pattern with a state-driven modal works on both
  // native and web.
  const [removeEquipId, setRemoveEquipId] = useState<string | null>(null);
  const [itemPickerOpen, setItemPickerOpen] = useState(false);
  // Lifted from GearTab so the Combat tab (and any future surface)
  // can open the same EquipmentDetailModal without duplicating it.
  const [detailEquipment, setDetailEquipment] = useState<Dnd5eEquipmentItem | null>(null);
  // Cross-tab trigger for the Abilities add flow. Combat's section + buttons
  // (Abilities header + Actions header) set this, AbilitiesCardTab consumes
  // it via a useEffect to open either the Import / Add-custom chooser
  // (kind='menu') or the AbilityEditModal with a preset actionType
  // (kind='custom'). `counter` is a freshness marker — re-firing the same
  // request bumps the value so the useEffect re-runs even when {kind} is
  // identical to last time.
  const [pendingAbilityAdd, setPendingAbilityAdd] = useState<
    | ({ kind: 'menu' } & { counter: number })
    | ({ kind: 'custom'; actionType?: string } & { counter: number })
    | null
  >(null);
  /** Campaign rule `enforce_feat_prerequisites` resolved from the
   *  character's linked campaign. Standalone characters fall through
   *  to true (the system's bundled default). */
  const [enforceFeatPrereqs, setEnforceFeatPrereqs] = useState(true);
  const [tempHpFieldInput, setTempHpFieldInput] = useState('');
  const [hpQuickInput, setHpQuickInput] = useState('');
  const [scratchpad, setScratchpad] = useState('');
  const [isDmOfLinkedCampaign, setIsDmOfLinkedCampaign] = useState(false);
  const [linkedCampaignName, setLinkedCampaignName] = useState<string | null>(null);
  const [portraitUploading, setPortraitUploading] = useState(false);
  const [editLayout, setEditLayout] = useState(false);
  const [cardItems, setCardItems] = useState<CardItem[]>(DEFAULT_CARD_ORDER.map((id) => ({ id })));
  const [activeTab, setActiveTab] = useState<TabId>('combat');
  const [tabLayout, setTabLayout] = useState<TabLayoutState>(DEFAULT_TAB_LAYOUT);
  const [rightRailCollapsed, setRightRailCollapsed] = useState(false);
  const [rollResult, setRollResult] = useState<RollResult | null>(null);
  const [activityLog, setActivityLog] = useState<ActivityEntry[]>([]);
  const [logModal, setLogModal] = useState(false);
  const rollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const _cached = typeof id === 'string' ? getCachedContent(id) : null;
  const [speciesResult, setSpeciesResult] = useState<SpeciesResult | null>(_cached?.speciesResult ?? null);
  const [classResultsByKey, setClassResultsByKey] = useState<Record<string, ClassResult>>(_cached?.classResultsByKey ?? {});
  const [subclassResultsByKey, setSubclassResultsByKey] = useState<Record<string, SubclassResult>>(_cached?.subclassResultsByKey ?? {});
  const [backgroundResult, setBackgroundResult] = useState<BackgroundResult | null>(_cached?.backgroundResult ?? null);
  const [originFeatResult, setOriginFeatResult] = useState<FeatResult | null>(_cached?.originFeatResult ?? null);
  // Catalog lookup for all feats the character has on resources.feats —
  // surfaced to the Traits tab so it can render the per-feat
  // grant-pickers (Skilled → "Pick 3 Skills" affordance) without
  // refetching. Keyed by feat catalog key (`Dnd5eFeature.id`) which
  // the wizard sets from `FeatResult.key`.
  const [featResultsByKey, setFeatResultsByKey] = useState<Map<string, FeatResult>>(new Map());
  const [conditionResults, setConditionResults] = useState<ConditionResult[]>(_cached?.conditionResults ?? []);
  const [skillResults, setSkillResults] = useState<SkillResult[]>(_cached?.skillResults ?? []);
  // Item catalog, indexed by `ItemResult.key`. Lets getEquippedAC
  // re-derive mechanical fields (acBase, dexCap, acBonus, miscACBonus)
  // for equipment items that were stored before the current parser
  // existed. Without this, characters created early carry stub
  // equipment items with only name+slot and the AC math silently
  // falls back to defaults.
  const [itemResultsByKey, setItemResultsByKey] = useState<Map<string, ItemResult>>(new Map());

  useEffect(() => {
    if (!id) return;
    getCharacterById(id).then(({ data, error: err }) => {
      if (err) setError('Failed to load character.');
      else {
        setCharacter(data);
        if (data) setActiveCharacter(data);
        const res = data?.resources as Dnd5eResources | null;
        if (res?.notes) setScratchpad(res.notes);
        const st = data?.base_stats as Dnd5eStats | null;
        if (st?.settings?.cardOrder) {
          setCardItems(st.settings.cardOrder.map((id) => ({ id: id as CardId })));
        }
        if (st?.settings?.tabLayout) {
          // Drop the legacy "abilities" tab from saved layouts —
          // its content is now embedded in the Combat tab. If a
          // saved layout had it active, fall back to combat/skills.
          const raw = st.settings.tabLayout as TabLayoutState;
          const saved: TabLayoutState = {
            left: raw.left.filter((t) => (t as string) !== 'abilities'),
            right: raw.right.filter((t) => (t as string) !== 'abilities'),
            activeLeft: (raw.activeLeft as string) === 'abilities' ? 'combat' : raw.activeLeft,
            activeRight: (raw.activeRight as string) === 'abilities' ? 'skills' : raw.activeRight,
          };
          setTabLayout(saved);
        }
      }
      setLoading(false);
    });
  }, [id]);

  // Is the viewer the DM of any campaign this character is linked to?
  // Drives edit-permission on the sheet — the DM gets write access to the
  // RPC-whitelisted session-state fields (HP, conditions, slots, etc.)
  // while non-owner / non-DM viewers stay read-only.
  useEffect(() => {
    if (!id || !authUser?.id || !character) return;
    let cancelled = false;
    (async () => {
      // Check two paths: (1) the character's campaign_id directly,
      // (2) the campaign_members linkage via character_id. Path 1
      // covers characters that exist in a campaign but haven't been
      // linked in the membership row yet.
      if (character.campaign_id) {
        const { data: camp } = await supabase
          .from('campaigns')
          .select('dm_user_id, name')
          .eq('id', character.campaign_id)
          .single();
        if (!cancelled && camp?.name) setLinkedCampaignName(camp.name);
        if (!cancelled && camp?.dm_user_id === authUser.id) {
          setIsDmOfLinkedCampaign(true);
          return;
        }
      }
      const { data } = await supabase
        .from('campaign_members')
        .select('campaigns!inner(dm_user_id)')
        .eq('character_id', id);
      if (cancelled) return;
      const isDm = (data ?? []).some(
        (row) => (row as { campaigns?: { dm_user_id?: string } }).campaigns?.dm_user_id === authUser.id,
      );
      setIsDmOfLinkedCampaign(isDm);
    })();
    return () => { cancelled = true; };
  }, [id, authUser?.id, character?.campaign_id]);

  // Resolve the campaign's enforce_feat_prerequisites rule so the
  // FeatPickerModal knows whether to gate prereq-bearing feats.
  // Standalone characters (no linked campaign) fall through to the
  // system's bundled default (true).
  useEffect(() => {
    const campaignId = character?.campaign_id ?? null;
    if (!campaignId) {
      setEnforceFeatPrereqs(true);
      return;
    }
    let cancelled = false;
    (async () => {
      const [{ data: rulesBag }, { data: campaignRow }] = await Promise.all([
        getCampaignCharacterRules(campaignId),
        supabase.from('campaigns').select('system').eq('id', campaignId).single(),
      ]);
      if (cancelled) return;
      const sys = campaignRow?.system ? BUNDLED_SYSTEMS_BY_ID[campaignRow.system] : null;
      if (!sys || !rulesBag) {
        setEnforceFeatPrereqs(true);
        return;
      }
      const resolved = resolveRuleValues(sys.optionalRules, rulesBag);
      setEnforceFeatPrereqs(resolved.enforce_feat_prerequisites !== false);
    })();
    return () => { cancelled = true; };
  }, [character?.campaign_id]);

  // Resolve content for the character's identity (species, class(es),
  // subclass(es), background, origin feat) plus the SRD condition catalog.
  // ContentResolver merges SRD + homebrew + imported tiers; we scope to
  // the character's campaign + pack opt-in so imported homebrew flows
  // through (mirrors the wizard / level-up flow). Names AND full payloads
  // are kept so the sheet can render live features / traits / descriptions
  // without snapshotting at creation time.
  useEffect(() => {
    const stats = character?.base_stats as Dnd5eStats | null;
    const charResources = character?.resources as Dnd5eResources | null;
    if (!stats) return;
    const speciesKey = stats.speciesKey;
    const entries = getClassEntries(stats);
    const classKeys = Array.from(new Set(entries.map((e) => e.classKey).filter(Boolean)));
    const subclassKeys = Array.from(new Set(entries.map((e) => e.subclassKey).filter((k): k is string => !!k)));
    const backgroundKey = stats.backgroundKey;
    const originFeatName = stats.originFeat?.trim() || null;
    // Any feats on the character — L1-feat picks, ASI feats, etc.
    // Their catalog entries are needed for the Traits-tab grant pickers
    // (Skilled), so trigger the feats fetch when any exist.
    const hasFeats = (charResources?.feats ?? []).length > 0;

    let cancelled = false;
    (async () => {
      const includeHomebrew = !!character?.campaign_id || (character?.pack_ids ?? []).length > 0;
      const tiers: Array<'srd' | 'homebrew'> = includeHomebrew ? ['srd', 'homebrew'] : ['srd'];
      const tierArgs = {
        system: 'dnd5e' as const,
        srdVersion: stats.srdVersion,
        tiers,
        campaignId: character?.campaign_id ?? undefined,
        packIds: !character?.campaign_id && (character?.pack_ids ?? []).length > 0
          ? (character?.pack_ids as string[])
          : undefined,
      };
      const hasEquipment = (charResources?.equipment ?? []).length > 0;
      const [speciesResults, classResults, subclassResults, backgroundResults, featResults, conditionResultsAll, skillResultsAll, itemResultsAll] = await Promise.all([
        speciesKey ? ContentResolver.search({ ...tierArgs, type: 'species' }) : Promise.resolve([]),
        classKeys.length > 0 ? ContentResolver.search({ ...tierArgs, type: 'class' }) : Promise.resolve([]),
        subclassKeys.length > 0 ? ContentResolver.search({ ...tierArgs, type: 'subclass' }) : Promise.resolve([]),
        backgroundKey ? ContentResolver.search({ ...tierArgs, type: 'background' }) : Promise.resolve([]),
        (originFeatName || hasFeats) ? ContentResolver.search({ ...tierArgs, type: 'feat' }) : Promise.resolve([]),
        ContentResolver.search({ ...tierArgs, type: 'condition' }),
        ContentResolver.search({ ...tierArgs, type: 'skill' }),
        hasEquipment ? ContentResolver.search({ ...tierArgs, type: 'item' }) : Promise.resolve([]),
      ]);
      if (cancelled) return;

      if (speciesKey) {
        const hit = speciesResults.find((r) => r.key === speciesKey) as SpeciesResult | undefined;
        setSpeciesResult(hit ?? null);
      } else {
        setSpeciesResult(null);
      }

      if (classKeys.length > 0) {
        const map: Record<string, ClassResult> = {};
        for (const k of classKeys) {
          const hit = classResults.find((r) => r.key === k) as ClassResult | undefined;
          if (hit) map[k] = hit;
        }
        setClassResultsByKey(map);
      } else {
        setClassResultsByKey({});
      }

      if (subclassKeys.length > 0) {
        const map: Record<string, SubclassResult> = {};
        const stripEdition = (s: string) => s.replace(/-srd-.*$/i, '');
        for (const k of subclassKeys) {
          // Subclass keys may diverge between editions; an exact match is
          // best, fall back to a slug match so legacy stored keys still
          // resolve.
          const exact = subclassResults.find((r) => r.key === k);
          const target = stripEdition(k);
          const lenient = subclassResults.find((r) => stripEdition(r.key) === target);
          const hit = (exact ?? lenient) as SubclassResult | undefined;
          if (hit) map[k] = hit;
        }
        setSubclassResultsByKey(map);
      } else {
        setSubclassResultsByKey({});
      }

      if (backgroundKey) {
        const hit = backgroundResults.find((r) => r.key === backgroundKey) as BackgroundResult | undefined;
        setBackgroundResult(hit ?? null);
      } else {
        setBackgroundResult(null);
      }

      if (originFeatName) {
        const lower = originFeatName.toLowerCase();
        const hit = featResults.find((r) => r.name.toLowerCase() === lower) as FeatResult | undefined;
        setOriginFeatResult(hit ?? null);
      } else {
        setOriginFeatResult(null);
      }
      // Build a key->result lookup for all loaded feats. The Traits
      // tab reads this to surface `grants` pickers on each feat row.
      const byKey = new Map<string, FeatResult>();
      for (const r of (featResults as FeatResult[])) byKey.set(r.key, r);
      setFeatResultsByKey(byKey);

      setConditionResults(conditionResultsAll as ConditionResult[]);
      setSkillResults(skillResultsAll as SkillResult[]);
      if (hasEquipment) {
        const map = new Map<string, ItemResult>();
        for (const r of itemResultsAll as ItemResult[]) map.set(r.key, r);
        setItemResultsByKey(map);
      }

      if (typeof id === 'string') {
        const specHit = speciesKey ? speciesResults.find((r) => r.key === speciesKey) as SpeciesResult | undefined : null;
        _contentCache.set(id, {
          speciesResult: specHit ?? null,
          classResultsByKey: classKeys.length > 0 ? Object.fromEntries(classKeys.map((k) => [k, classResults.find((r) => r.key === k)]).filter(([, v]) => v) as [string, ClassResult][]) : {},
          subclassResultsByKey: subclassKeys.length > 0 ? (() => { const m: Record<string, SubclassResult> = {}; const strip = (ss: string) => ss.replace(/-srd-.*$/i, ''); for (const k of subclassKeys) { const hit = (subclassResults.find((r) => r.key === k) ?? subclassResults.find((r) => strip(r.key) === strip(k))) as SubclassResult | undefined; if (hit) m[k] = hit; } return m; })() : {},
          backgroundResult: backgroundKey ? (backgroundResults.find((r) => r.key === backgroundKey) as BackgroundResult | undefined) ?? null : null,
          originFeatResult: originFeatName ? (featResults.find((r) => r.name.toLowerCase() === originFeatName.toLowerCase()) as FeatResult | undefined) ?? null : null,
          conditionResults: conditionResultsAll as ConditionResult[],
          skillResults: skillResultsAll as SkillResult[],
          fetchedAt: Date.now(),
        });
      }
    })();
    return () => { cancelled = true; };
  }, [
    character?.campaign_id,
    character?.pack_ids,
    (character?.base_stats as Dnd5eStats | null)?.speciesKey,
    (character?.base_stats as Dnd5eStats | null)?.classKey,
    (character?.base_stats as Dnd5eStats | null)?.classes,
    (character?.base_stats as Dnd5eStats | null)?.backgroundKey,
    (character?.base_stats as Dnd5eStats | null)?.originFeat,
    // Refire when the feat list count changes (added / removed via the
    // sheet's FeatPickerModal) so featResultsByKey reflects the new set.
    ((character?.resources as Dnd5eResources | null)?.feats ?? []).length,
  ]);

  // Realtime: when another viewer (e.g. the DM via Party View) mutates this
  // character, merge the payload into local state so the sheet reflects the
  // change without a refresh. We intentionally don't sync the scratchpad
  // field — it has in-progress notes that would clobber local edits.
  useEffect(() => {
    if (!id) return;
    // Per-mount channel name. supabase.channel(name) caches by name,
    // so re-mounting the sheet (e.g. after the level-up wizard's
    // router.replace) hands back the already-subscribed channel —
    // and adding `.on('postgres_changes', ...)` to a subscribed
    // channel throws. A unique name per mount sidesteps the cache
    // entirely, mirroring the world-layout's pattern.
    const channelName = `character:${id}:${Date.now()}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'characters',
          filter: `id=eq.${id}`,
        },
        (payload) => {
          // Merge into existing state instead of replacing. Postgres logical
          // replication marks unchanged TOASTed columns (large JSONB values
          // stored out-of-line) as "unchanged" in the WAL, and Supabase
          // Realtime surfaces those as `null` in `payload.new`. Our base_stats
          // / resources columns easily exceed the TOAST threshold, so an
          // UPDATE that touched only one of them returns the other as null
          // here — replacing wholesale would clobber it client-side and trip
          // the load gate on the next render. Merging + skipping nullish
          // values keeps the prior value for any column the WAL didn't ship.
          const next = payload.new as Partial<Character>;
          const merge: Partial<Character> = {};
          if (next.base_stats != null) merge.base_stats = next.base_stats;
          if (next.resources != null) merge.resources = next.resources;
          if (next.conditions != null) merge.conditions = next.conditions;
          if (next.name != null) merge.name = next.name;
          setCharacter((prev) => (prev ? ({ ...prev, ...merge } as Character) : prev));
          updateCharacterLocally(id, merge);
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id]);

  const stats = character?.base_stats as Dnd5eStats | null;
  const resources = character?.resources as Dnd5eResources | null;
  const settings: CharacterSettings = stats?.settings ?? { manualMode: false };
  const manualMode = settings.manualMode;
  // Defaults to true — pre-flag characters stay active. Campaign-side
  // Members card reads this to chip inactive characters separately.
  const characterActive = settings.active !== false;
  const prof = stats ? profBonus(stats.level) : 2;
  const scores = stats?.abilityScores;

  // Header subtitle pieces — fall back to a humanized key while the
  // ContentResolver lookup is in flight (or when the entry isn't in the
  // tier we searched, e.g. a deleted homebrew pack). Multiclass shows
  // each class joined with " / ".
  const speciesLabel = stats?.speciesKey
    ? (speciesResult?.name ?? humanizeContentKey(stats.speciesKey))
    : '';
  const classLabel = stats
    ? getClassEntries(stats)
        .map((e) => classResultsByKey[e.classKey]?.name ?? humanizeContentKey(e.classKey))
        .filter(Boolean)
        .join(' / ')
    : '';

  function skillMod(skillName: string): number {
    if (!scores || !stats) return 0;
    const base = abilityMod(scores[SKILL_ABILITY[skillName]]);
    return base + (stats.skillProficiencies.includes(skillName) ? prof : 0);
  }

  function saveMod(ability: keyof Dnd5eAbilityScores): number {
    if (!scores || !stats) return 0;
    const base = abilityMod(scores[ability]);
    return base + (stats.savingThrowProficiencies.includes(ability) ? prof : 0);
  }

  // Re-hydrate equipment items from the live catalog. Existing
  // characters carry equipment shapes from older versions of the
  // parser — some are missing acBase, dexCap, miscACBonus, or carry
  // a stale slot (Shield routed to 'armor' before the SRD fix). We
  // look each item up by id (which equals the catalog's ItemResult.key
  // for catalog-picked items, with an optional `-N` wizard suffix),
  // re-run the current parser, and overlay the freshly-derived
  // mechanical fields onto the stored user-state (id / equipped /
  // attuned / notes stay as the player set them).
  function hydrateEquipment(e: Dnd5eEquipmentItem): Dnd5eEquipmentItem {
    if (itemResultsByKey.size === 0) return e;
    // The wizard appends `-0`, `-1`, etc. for quantity duplicates;
    // strip the last numeric suffix to find the catalog key.
    const baseKey = e.id.replace(/-\d+$/, '');
    const catalog = itemResultsByKey.get(e.id) ?? itemResultsByKey.get(baseKey);
    if (!catalog) return e;
    const fresh = itemResultToEquipment(catalog);
    return {
      ...e,
      slot: fresh.slot,
      damage: e.damage ?? fresh.damage,
      acBase: e.acBase ?? fresh.acBase,
      dexCap: e.dexCap ?? fresh.dexCap,
      acBonus: e.acBonus ?? fresh.acBonus,
      miscACBonus: e.miscACBonus ?? fresh.miscACBonus,
      properties: e.properties ?? fresh.properties,
      requiresAttunement: e.requiresAttunement ?? fresh.requiresAttunement,
      weight: e.weight ?? fresh.weight,
    };
  }
  // Memoized so the array identity is stable across renders that don't
  // actually change equipment — critical for downstream React.memo
  // checks on CombatTab / GearTab (otherwise every keystroke / HP tap
  // shipped a fresh equipment array and re-rendered both tabs from
  // scratch).
  const equipment: Dnd5eEquipmentItem[] = useMemo(
    () => (resources?.equipment ?? []).map(hydrateEquipment),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resources?.equipment, itemResultsByKey],
  );
  // computedAC depends on scores + equipment; memoize so AC doesn't
  // recompute on every render.
  const computedAC = useMemo(
    () => (scores ? getEquippedAC() : 10),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scores, equipment, stats?.acOverride],
  );
  // Class-table-derived spell limits, before any manual override.
  // Surfaced into the Manage Spells modal and into the AC-style edit
  // modal's "Computed from class: N" hint when the player taps the
  // CANTRIPS / PREPARED stat in Manual Mode.
  const baseSpellLimits = useMemo(
    () => (stats ? computeSpellLimits(stats, classResultsByKey) : { cantrips: undefined, spellbook: undefined, prepared: undefined }),
    [stats, classResultsByKey],
  );
  // Computed spell attack / save DC, used by the edit-modal hint when
  // Manual Mode overrides are in play. Mirrors the formula in SpellsTab
  // (prof + spellMod for attack; 8 + prof + spellMod for DC). Returns
  // null when the character has no spellcasting ability resolved.
  const spellcastingAbilityForHint = useMemo(
    () => (stats ? getEffectiveSpellcastingAbility(stats, classResultsByKey, subclassResultsByKey) : null),
    [stats, classResultsByKey, subclassResultsByKey],
  );
  const computedSpellMod = spellcastingAbilityForHint && scores
    ? abilityMod(scores[spellcastingAbilityForHint.toLowerCase() as keyof Dnd5eAbilityScores] ?? 10)
    : null;
  const computedSpellAttack = computedSpellMod !== null ? prof + computedSpellMod : null;
  const computedSpellDC = computedSpellMod !== null ? 8 + prof + computedSpellMod : null;

  // Spell-slot max overrides — applied only in Manual Mode. The
  // synthesized `effectiveSpellSlots` becomes the source of truth for
  // any descendant that reads `resources.spellSlots`; we splice it
  // into the resources clone passed down to the Spells / Combat tabs.
  // `remaining` is clamped to the override max so reducing the cap
  // doesn't leave a stale higher remaining value showing.
  const SLOT_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
  type SpellSlotKey = typeof SLOT_LEVELS[number];
  const effectiveSpellSlots = useMemo(() => {
    const raw = resources?.spellSlots;
    if (!raw) return null;
    if (!manualMode || !stats?.spellSlotMaxOverrides) return raw;
    const overrides = stats.spellSlotMaxOverrides;
    const out = { ...raw } as typeof raw;
    let touched = false;
    for (const lvl of SLOT_LEVELS) {
      const ov = overrides[lvl];
      if (ov == null) continue;
      out[lvl] = {
        max: ov,
        remaining: Math.min(raw[lvl]?.remaining ?? ov, ov),
      };
      touched = true;
    }
    return touched ? out : raw;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resources?.spellSlots, manualMode, stats?.spellSlotMaxOverrides]);
  // Manual-mode overrides only apply when Manual Mode is actually on.
  // Without this gate, a stray value typed once stays as a silent
  // override forever — exactly the playtest bug where Oswald's AC was
  // stuck at 14 despite armor/shield/cloak all wired correctly.
  const ac = manualMode && stats?.acOverride != null ? stats.acOverride : computedAC;
  const computedInitiative = scores ? abilityMod(scores.dexterity) : 0;
  const initiative = manualMode && stats?.initiativeOverride != null ? stats.initiativeOverride : computedInitiative;
  const passivePerception = 10 + skillMod('perception');
  const passiveInvestigation = 10 + skillMod('investigation');
  const passiveInsight = 10 + skillMod('insight');

  const liveActionFeatures: Dnd5eFeature[] = useMemo(() => {
    if (!stats) return [];
    const entries = getClassEntries(stats);
    const features: Dnd5eFeature[] = [];
    const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const inferActionType = (f: { actionType?: string; description?: string }): 'bonus' | 'reaction' | undefined => {
      if (f.actionType === 'bonus' || f.actionType === 'reaction') return f.actionType;
      const desc = (f.description ?? '').toLowerCase();
      if (desc.includes('bonus action')) return 'bonus';
      if (desc.includes('use your reaction') || desc.includes('as a reaction')) return 'reaction';
      return undefined;
    };
    for (const entry of entries) {
      const cls = classResultsByKey[entry.classKey];
      if (cls) {
        for (const f of cls.features ?? []) {
          const at = inferActionType(f);
          if (at && f.level <= entry.level) {
            features.push({ id: `class-${cls.key}-${slugify(f.name)}`, name: f.name, description: f.description ?? '', actionType: at });
          }
        }
      }
      if (entry.subclassKey) {
        const sc = subclassResultsByKey[entry.subclassKey];
        if (sc) {
          for (const f of sc.features ?? []) {
            const at = inferActionType(f);
            if (at && f.level <= entry.level) {
              features.push({ id: `sub-${sc.key}-${slugify(f.name)}`, name: f.name, description: f.description ?? '', actionType: at });
            }
          }
        }
      }
    }
    return features;
  }, [stats, classResultsByKey, subclassResultsByKey]);

  /** Memoized spellbook — `getSpellbook(resources)` was called 5×
   *  per render (Spells props, prepared toggle, Manage Spells modal
   *  prep, two existingKeys/existingSpells props, picker onPick). */
  const spellbook = useMemo(
    () => (resources ? getSpellbook(resources) : []),
    [resources],
  );
  /** Id set of the spellbook — Manage Spells modal uses this to gray
   *  out already-added entries. Lives at the top level (hook) so the
   *  picker's prop reference stays stable across renders. */
  const spellbookIdSet = useMemo(
    () => new Set(spellbook.map((s) => s.id)),
    [spellbook],
  );

  /** Memoized explainers — `spellcastingExplainersFor` walks every
   *  class entry; no point re-walking on every render. */
  const spellcastingExplainers = useMemo(
    () => (stats ? spellcastingExplainersFor(stats, classResultsByKey, subclassResultsByKey) : []),
    [stats, classResultsByKey, subclassResultsByKey],
  );

  /** Memoized version of the resources blob passed into the spellcasting
   *  child tabs. Splicing in `effectiveSpellSlots` produced a brand-new
   *  object every render — the receiving tabs failed React.memo's
   *  shallow check and re-rendered for every parent state update. */
  const resourcesForTabs = useMemo(
    () => (resources ? { ...resources, spellSlots: effectiveSpellSlots ?? resources.spellSlots } : null),
    [resources, effectiveSpellSlots],
  );

  function hpColor(): string {
    if (!resources || !stats) return colors.textPrimary;
    if (resources.hpCurrent === 0) return colors.hpDanger;
    const ratio = resources.hpCurrent / stats.hpMax;
    if (ratio >= 1) return colors.hpHealthy;       // 100% — green
    if (ratio > 0.75) return '#A3D977';             // 75-99% — yellow-green
    if (ratio > 0.5) return colors.hpWarning;       // 50-75% — yellow
    if (ratio > 0.25) return '#F97316';             // 25-50% — orange
    return colors.hpDanger;                          // <25% — red
  }

  // ── Persist ─────────────────────────────────────────────────────────────

  // Ownership + authorization for this sheet:
  // - Owner: full edit access (direct table update).
  // - DM of a linked campaign: may edit session-state fields (the RPC
  //   whitelist) but not durable sheet fields (name, stats, equipment).
  // - Anyone else (cross-view guest): read-only.
  const isOwner = !!character && !!authUser && character.user_id === authUser.id;
  const canEditAny = isOwner || isDmOfLinkedCampaign;
  const isReadOnly = !canEditAny;

  // Sheet-access guard. Players can see each other's party-card vitals
  // (HP, conditions) but not the full sheet — that's reserved for the
  // owner and the DM of the linked campaign. If a viewer navigates
  // here without those rights (deep link, refresh from a stale tab),
  // bounce them back to their characters list.
  const canViewSheet = isOwner || isDmOfLinkedCampaign;
  useEffect(() => {
    if (!character || !authUser) return;
    if (canViewSheet) return;
    if (onClose) onClose();
    else router.replace('/(drawer)/characters');
  }, [character, authUser, canViewSheet, onClose]);

  // Keys inside resources that the RPC's whitelist accepts. Anything not in
  // this set is owner-only — the DM sheet silently skips writes for them.
  const RPC_RESOURCE_KEYS: (keyof Dnd5eResources)[] = [
    'hpCurrent', 'hpTemp', 'exhaustionLevel', 'spellSlots',
    'classResources', 'deathSaves', 'inspiration', 'concentrationSpell',
  ];

  async function persistResources(updated: Dnd5eResources) {
    if (!character || !canEditAny) return;
    const prev = (character.resources ?? {}) as unknown as Dnd5eResources;
    if (prev.hpCurrent !== undefined && prev.hpCurrent !== updated.hpCurrent) {
      logActivity({ kind: 'hp', from: prev.hpCurrent, to: updated.hpCurrent, delta: updated.hpCurrent - prev.hpCurrent });
    }
    if (prev.hpTemp !== undefined && prev.hpTemp !== updated.hpTemp) {
      logActivity({ kind: 'tempHp', from: prev.hpTemp, to: updated.hpTemp, delta: updated.hpTemp - prev.hpTemp });
    }
    const res = updated as unknown as import('@vaultstone/types').Json;
    setCharacter({ ...character, resources: res });
    updateCharacterLocally(character.id, { resources: res });

    if (isOwner) {
      await updateCharacter(character.id, { resources: res });
      return;
    }

    // DM path: send only whitelisted resource-key diffs via the RPC. Any
    // non-whitelisted changes (equipment, coins, features, notes, …) are
    // silently dropped — the sheet controls for those are disabled anyway.
    const current = (character.resources ?? {}) as unknown as Dnd5eResources;
    const patch: Record<string, unknown> = {};
    for (const key of RPC_RESOURCE_KEYS) {
      if (JSON.stringify(updated[key]) !== JSON.stringify(current[key])) {
        patch[key] = updated[key];
      }
    }
    if (Object.keys(patch).length > 0) {
      await updateCharacterState(character.id, patch);
    }
  }

  // Self-heal spell slots — characters bootstrapped before the slot
  // reader learned alternate progression-table column shapes (notably
  // imported homebrew classes like 5e.tools Artificer that ship
  // `spell1` / `spell2` / ... instead of `1st` / `2nd` / ...) wrote
  // an all-zero slot table to the row. Now that the reader handles
  // those keys, recompute on first sheet load and persist if the
  // recompute would add slots that aren't there. Owner-only so
  // non-owner viewers don't accidentally trip the write.
  useEffect(() => {
    if (!isOwner) return;
    const stats = character?.base_stats as Dnd5eStats | null;
    const resources = character?.resources as Dnd5eResources | null;
    if (!stats || !resources) return;
    if (Object.keys(classResultsByKey).length === 0) return;
    const entries = getClassEntries(stats);
    const map = new Map(Object.entries(classResultsByKey));
    const subMap = new Map(Object.entries(subclassResultsByKey));
    const computed = spellSlotsForCharacter(entries, map, subMap);
    const current = resources.spellSlots;
    const computedHasSlots = ([1, 2, 3, 4, 5, 6, 7, 8, 9] as const)
      .some((l) => computed[l].max > 0);
    const currentHasSlots = current
      ? ([1, 2, 3, 4, 5, 6, 7, 8, 9] as const).some((l) => (current[l]?.max ?? 0) > 0)
      : false;
    if (!computedHasSlots || currentHasSlots) return;
    persistResources({
      ...resources,
      spellSlots: computed,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwner, classResultsByKey, subclassResultsByKey, character?.id]);

  // Short Rest — restores resources whose recharge cadence is 'short'.
  // Per 5e: Warlock pact slots (which we treat as a regular slot bucket,
  // since the spellSlots reader merges pact slots into the same table)
  // and any classResources flagged short-rest. Doesn't touch HP, slots
  // generally, exhaustion, or hit dice — those are long-rest only or
  // require explicit player action.
  /**
   * Spend one hit die during a short rest: roll 1d(hitDie) + CON mod
   * (min 1), add the result to HP (capped at hpMax), decrement
   * remaining hit dice. Mirrors the 5e short-rest healing rule.
   * Surfaces the roll via the RollToast like every other dice action.
   */
  function handleSpendHitDie() {
    if (!resources || !stats || !scores || !canEditAny) return;
    const remaining = resources.hitDiceRemaining ?? stats.level;
    if (remaining <= 0) return;
    const die = stats.hitDie || 8;
    const conMod = abilityMod(scores.constitution);
    const roll = Math.floor(Math.random() * die) + 1;
    const heal = Math.max(1, roll + conMod);
    const next: Dnd5eResources = {
      ...resources,
      hitDiceRemaining: remaining - 1,
      hpCurrent: Math.min(stats.hpMax, (resources.hpCurrent ?? 0) + heal),
    };
    persistResources(next);
    handleRoll({
      label: `Spent hit die (d${die}${conMod >= 0 ? '+' : ''}${conMod} CON)`,
      rolls: [roll],
      bonus: conMod,
      total: roll + conMod,
    });
  }

  function handleShortRest() {
    if (!resources || !canEditAny) return;
    const next: Dnd5eResources = { ...resources };
    if (resources.classResources && resources.classResources.length > 0) {
      next.classResources = resources.classResources.map((r) =>
        r.recharge === 'short' ? { ...r, current: r.max } : r,
      );
    }
    // Tracked abilities live alongside classResources but on the
    // `abilities[]` array. AbilitiesCardTab used to expose its own
    // rest buttons; now that we route through the sidebar's Rest
    // controls only, this is the place to restore short-rest uses.
    if (resources.abilities && resources.abilities.length > 0) {
      next.abilities = resources.abilities.map((a) =>
        a.uses && a.uses.recharge === 'short' ? { ...a, uses: { ...a.uses, current: a.uses.max } } : a,
      );
    }
    persistResources(next);
  }

  // Long Rest — full reset: spell slots, hit dice (capped at total
  // class levels), exhaustion -1, all classResources, death saves
  // cleared. HP also restores to max. Concentration drops too. The
  // player still triggers it manually because some campaigns gate
  // long rests behind narrative beats.
  function handleLongRest() {
    if (!resources || !stats || !canEditAny) return;
    const next: Dnd5eResources = { ...resources };
    if (resources.spellSlots) {
      const restored: typeof resources.spellSlots = { ...resources.spellSlots };
      ([1, 2, 3, 4, 5, 6, 7, 8, 9] as const).forEach((l) => {
        const slot = resources.spellSlots![l];
        restored[l] = { max: slot.max, remaining: slot.max };
      });
      next.spellSlots = restored;
    }
    if (resources.classResources && resources.classResources.length > 0) {
      next.classResources = resources.classResources.map((r) => ({ ...r, current: r.max }));
    }
    // Long rest restores both short- and long-recharge abilities,
    // plus features that recharge on dawn (treated like long rest
    // for daily-cycle purposes — the SRD draws no distinction here).
    if (resources.abilities && resources.abilities.length > 0) {
      next.abilities = resources.abilities.map((a) =>
        a.uses ? { ...a, uses: { ...a.uses, current: a.uses.max } } : a,
      );
    }
    next.hpCurrent = stats.hpMax;
    next.hpTemp = 0;
    next.hitDiceRemaining = stats.level;
    next.exhaustionLevel = Math.max(0, (resources.exhaustionLevel ?? 0) - 1);
    next.deathSaves = { successes: 0, failures: 0 };
    next.concentrationSpell = null;
    persistResources(next);
  }

  async function handleDragEnd(newItems: CardItem[]) {
    setCardItems(newItems);
    const order = newItems.map((i) => i.id);
    const newSettings: CharacterSettings = { ...stats.settings, manualMode: stats.settings?.manualMode ?? false, cardOrder: order };
    persistStats({ ...stats, settings: newSettings });
  }

  const [portraitCropUri, setPortraitCropUri] = useState<string | null>(null);
  const originalPickUriRef = useRef<string | null>(null);

  async function handlePickPortrait() {
    if (!character) return;
    const isWeb = Platform.OS === 'web';
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: !isWeb,
      // 3:4 portrait crop — matches the card-style frame the sheet
      // renders. On native, the OS picker enforces this aspect. On
      // web, the post-pick ImageCropModal handles the crop.
      aspect: [3, 4],
      quality: 0.7,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    originalPickUriRef.current = asset.uri;
    if (isWeb) {
      setPortraitCropUri(asset.uri);
    } else {
      await uploadPortrait(asset.uri, asset.mimeType ?? 'image/jpeg');
    }
  }

  async function handlePortraitCropConfirm(croppedUri: string) {
    setPortraitCropUri(null);
    // Single crop for both surfaces — upload the same image to the
    // portrait and card slots so we don't prompt the player to crop
    // twice. The character list tile renders the same content as the
    // sheet header (just framed differently by CSS), so one crop is
    // enough. originalPickUriRef cleared once both uploads finish.
    if (!character) {
      originalPickUriRef.current = null;
      return;
    }
    setPortraitUploading(true);
    const [portraitRes, cardRes] = await Promise.all([
      uploadCharacterPortrait(character.id, croppedUri, 'image/jpeg'),
      uploadCharacterCardImage(character.id, croppedUri, 'image/jpeg'),
    ]);
    setPortraitUploading(false);
    const merged: Partial<Character> = {};
    if (portraitRes.url) merged.avatar_url = portraitRes.url;
    if (cardRes.url) merged.avatar_card_url = cardRes.url;
    if (Object.keys(merged).length > 0) {
      setCharacter((prev) => (prev ? { ...prev, ...merged } : prev));
      updateCharacterLocally(character.id, merged);
    }
    originalPickUriRef.current = null;
  }

  async function uploadPortrait(uri: string, mime: string) {
    if (!character) return;
    setPortraitUploading(true);
    const { url } = await uploadCharacterPortrait(character.id, uri, mime);
    setPortraitUploading(false);
    if (url) {
      const updated = { ...character, avatar_url: url };
      setCharacter(updated);
      updateCharacterLocally(character.id, { avatar_url: url });
    }
  }

  async function persistConditions(newConditions: string[]) {
    if (!character || !canEditAny) return;
    setCharacter({ ...character, conditions: newConditions });
    updateCharacterLocally(character.id, { conditions: newConditions });
    if (isOwner) {
      await updateCharacter(character.id, { conditions: newConditions });
    } else {
      await updateCharacterState(character.id, { conditions: newConditions });
    }
  }

  async function persistStats(updated: Dnd5eStats) {
    if (!character || !isOwner) return;
    const bs = updated as unknown as import('@vaultstone/types').Json;
    setCharacter({ ...character, base_stats: bs });
    updateCharacterLocally(character.id, { base_stats: bs });
    await updateCharacter(character.id, { base_stats: bs });
  }

  function persistTabLayout(next: TabLayoutState) {
    setTabLayout(next);
    if (stats && isOwner) {
      const currentSettings = stats.settings ?? { manualMode: false };
      persistStats({ ...stats, settings: { ...currentSettings, tabLayout: next } });
    }
  }

  function moveTab(tabId: TabId, toSide: 'left' | 'right') {
    const current = tabLayout;
    const fromSide: 'left' | 'right' = current.left.includes(tabId) ? 'left' : 'right';
    if (fromSide === toSide) return;
    const fromList = current[fromSide].filter((t) => t !== tabId);
    const toList = sortTabs([...current[toSide], tabId]);
    const originActive: 'activeLeft' | 'activeRight' = fromSide === 'left' ? 'activeLeft' : 'activeRight';
    const targetActive: 'activeLeft' | 'activeRight' = toSide === 'left' ? 'activeLeft' : 'activeRight';
    const next: TabLayoutState = {
      ...current,
      [fromSide]: sortTabs(fromList),
      [toSide]: toList,
    } as TabLayoutState;
    next[targetActive] = tabId;
    if (current[originActive] === tabId) {
      next[originActive] = (sortTabs(fromList)[0] ?? null) as any;
    }
    persistTabLayout(next);
  }

  function setSideActive(side: 'left' | 'right', tabId: TabId) {
    persistTabLayout({
      ...tabLayout,
      [side === 'left' ? 'activeLeft' : 'activeRight']: tabId,
    });
  }

  async function persistName(newName: string) {
    if (!character || !isOwner) return;
    setCharacter({ ...character, name: newName });
    updateCharacterLocally(character.id, { name: newName });
    await updateCharacter(character.id, { name: newName });
    if (stats) {
      persistStats({ ...stats, characterName: newName });
    }
  }

  function handleToggleActive() {
    if (!stats) return;
    persistStats({ ...stats, settings: { ...settings, active: !characterActive } });
  }

  function handleToggleManualMode() {
    if (!stats) return;
    persistStats({ ...stats, settings: { ...settings, manualMode: !manualMode } });
  }

  async function handleDeleteCharacter() {
    if (!character) return;
    setDeleting(true);
    const { error: deleteError } = await deleteCharacter(character.id);
    if (deleteError) {
      setDeleting(false);
      setError(deleteError.message);
      return;
    }
    // Drop the row from the in-memory list so the destination screen
    // doesn't briefly re-render the just-deleted card.
    useCharacterStore.getState().setCharacters(
      useCharacterStore.getState().characters.filter((c) => c.id !== character.id),
    );
    // Embedded → drops the split target; standalone → router replace.
    if (onClose) onClose();
    else router.replace('/(drawer)/characters');
  }

  function startEditField(field: string, currentValue: string | number) {
    setEditingField(field);
    setFieldInput(String(currentValue));
  }

  /**
   * Drop a manual-mode override for AC or Initiative so the computed
   * value takes over again. Without this, a player who once typed a
   * value into the AC stat cell has no in-app way to "undo" the
   * override short of overwriting it with another number — which just
   * persists a new override.
   */
  function resetEditField() {
    if (!stats || !editingField) return;
    if (editingField === 'ac') {
      const { acOverride, ...rest } = stats;
      persistStats(rest as Dnd5eStats);
    } else if (editingField === 'initiative') {
      const { initiativeOverride, ...rest } = stats;
      persistStats(rest as Dnd5eStats);
    } else if (editingField === 'cantripsLimit') {
      const { cantripsKnownOverride, ...rest } = stats;
      persistStats(rest as Dnd5eStats);
    } else if (editingField === 'preparedLimit') {
      const { preparedSpellsOverride, ...rest } = stats;
      persistStats(rest as Dnd5eStats);
    } else if (editingField === 'spellAttack') {
      const { spellAttackOverride, ...rest } = stats;
      persistStats(rest as Dnd5eStats);
    } else if (editingField === 'spellSaveDc') {
      const { spellSaveDcOverride, ...rest } = stats;
      persistStats(rest as Dnd5eStats);
    } else if (typeof editingField === 'string' && editingField.startsWith('slotMax_')) {
      const lvl = parseInt(editingField.slice('slotMax_'.length), 10);
      if (Number.isFinite(lvl) && lvl >= 1 && lvl <= 9 && stats.spellSlotMaxOverrides) {
        const { [lvl as keyof NonNullable<Dnd5eStats['spellSlotMaxOverrides']>]: _, ...remainingOverrides } = stats.spellSlotMaxOverrides;
        const next: Dnd5eStats = { ...stats };
        if (Object.keys(remainingOverrides).length === 0) {
          delete next.spellSlotMaxOverrides;
        } else {
          next.spellSlotMaxOverrides = remainingOverrides as NonNullable<Dnd5eStats['spellSlotMaxOverrides']>;
        }
        persistStats(next);
      }
    }
    setEditingField(null);
  }

  function saveEditField() {
    if (!stats || !scores || !editingField) return;
    const val = fieldInput.trim();
    if (!val) { setEditingField(null); return; }

    const num = parseInt(val, 10);

    if (ABILITY_KEYS.includes(editingField as any)) {
      if (isNaN(num) || num < 1 || num > 30) { setEditingField(null); return; }
      persistStats({
        ...stats,
        abilityScores: { ...scores, [editingField]: num },
        // Recalc HP max if CON changed
        ...(editingField === 'constitution'
          ? { hpMax: stats.hitDie + abilityMod(num) + (stats.level - 1) * (Math.floor(stats.hitDie / 2) + 1 + abilityMod(num)) }
          : {}),
      });
    } else if (editingField === 'speed') {
      if (isNaN(num) || num < 0) { setEditingField(null); return; }
      persistStats({ ...stats, speed: num });
    } else if (editingField === 'ac') {
      if (isNaN(num) || num < 0) { setEditingField(null); return; }
      persistStats({ ...stats, acOverride: num });
    } else if (editingField === 'initiative') {
      const signed = parseInt(val, 10);
      if (isNaN(signed)) { setEditingField(null); return; }
      persistStats({ ...stats, initiativeOverride: signed });
    } else if (editingField === 'cantripsLimit') {
      if (isNaN(num) || num < 0) { setEditingField(null); return; }
      persistStats({ ...stats, cantripsKnownOverride: num });
    } else if (editingField === 'preparedLimit') {
      if (isNaN(num) || num < 0) { setEditingField(null); return; }
      persistStats({ ...stats, preparedSpellsOverride: num });
    } else if (editingField === 'spellAttack') {
      const signed = parseInt(val, 10);
      if (isNaN(signed)) { setEditingField(null); return; }
      persistStats({ ...stats, spellAttackOverride: signed });
    } else if (editingField === 'spellSaveDc') {
      if (isNaN(num) || num < 0) { setEditingField(null); return; }
      persistStats({ ...stats, spellSaveDcOverride: num });
    } else if (typeof editingField === 'string' && editingField.startsWith('slotMax_')) {
      if (isNaN(num) || num < 0) { setEditingField(null); return; }
      const lvl = parseInt(editingField.slice('slotMax_'.length), 10);
      if (!Number.isFinite(lvl) || lvl < 1 || lvl > 9) { setEditingField(null); return; }
      const prev = stats.spellSlotMaxOverrides ?? {};
      persistStats({
        ...stats,
        spellSlotMaxOverrides: { ...prev, [lvl]: num },
      });
    } else if (editingField === 'hpMax') {
      if (isNaN(num) || num < 1) { setEditingField(null); return; }
      persistStats({ ...stats, hpMax: num });
    } else if (editingField === 'hitDiceRemaining') {
      if (isNaN(num) || num < 0) { setEditingField(null); return; }
      persistResources({ ...resources!, hitDiceRemaining: Math.min(num, stats.level) });
    } else if (editingField === 'hpCurrent') {
      if (isNaN(num) || num < 0) { setEditingField(null); return; }
      const tempVal = parseInt(tempHpFieldInput, 10);
      persistResources({
        ...resources!,
        hpCurrent: Math.min(num, stats.hpMax),
        hpTemp: isNaN(tempVal) || tempVal < 0 ? resources!.hpTemp : tempVal,
      });
    } else if (editingField === 'tempHp') {
      if (isNaN(num) || num < 0) { setEditingField(null); return; }
      persistResources({ ...resources!, hpTemp: num });
    } else if (editingField === 'xp') {
      if (isNaN(num) || num < 0) { setEditingField(null); return; }
      persistResources({ ...resources!, xp: num });
    } else if (typeof editingField === 'string' && editingField.startsWith('coin_')) {
      if (isNaN(num) || num < 0) { setEditingField(null); return; }
      const denom = editingField.replace('coin_', '') as 'cp' | 'sp' | 'ep' | 'gp' | 'pp';
      const coins = resources!.coins ?? { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
      persistResources({ ...resources!, coins: { ...coins, [denom]: num } });
    } else if (editingField === 'concentrationSpell') {
      const trimmed = val.slice(0, 80);
      persistResources({ ...resources!, concentrationSpell: trimmed || null });
    }

    setEditingField(null);
  }

  function applyAddXp() {
    if (!resources) { setXpAddMode(false); return; }
    const n = parseInt(xpAddInput, 10);
    if (isNaN(n) || n <= 0) { setXpAddMode(false); return; }
    persistResources({ ...resources, xp: (resources.xp ?? 0) + n });
    setXpAddMode(false);
    setXpAddInput('');
  }

  function getAttackBonus(item: Dnd5eEquipmentItem): number {
    if (item.attackBonus !== undefined) return item.attackBonus;
    if (!scores) return 0;
    let ability: 'strength' | 'dexterity' = 'strength';
    if (item.attackAbility === 'dexterity') ability = 'dexterity';
    else if (item.attackAbility === 'finesse') {
      ability = abilityMod(scores.dexterity) > abilityMod(scores.strength) ? 'dexterity' : 'strength';
    }
    return abilityMod(scores[ability]) + prof;
  }

  // AC math is shared with the party views via @vaultstone/systems.
  // The local wrapper feeds in the hydrated equipment so re-parsed
  // miscACBonus / acBase values from the catalog apply here too.
  function getEquippedAC(): number {
    if (!stats || !resources || !scores) return 10;
    return getEquippedACShared(stats, { ...resources, equipment });
  }

  function saveEquipment(items: Dnd5eEquipmentItem[]) {
    if (!resources) return;
    persistResources({ ...resources, equipment: items });
  }

  function handleSaveEquipItem(item: Dnd5eEquipmentItem) {
    const existing = equipment.findIndex((e) => e.id === item.id);
    if (existing >= 0) {
      const updated = [...equipment];
      updated[existing] = item;
      saveEquipment(updated);
    } else {
      saveEquipment([...equipment, item]);
    }
    setEditEquip(null);
    setEquipModal(false);
  }

  function handleRemoveEquipItem(id: string) {
    saveEquipment(equipment.filter((e) => e.id !== id));
    setEditEquip(null);
    setEquipModal(false);
  }

  function handleToggleEquipped(id: string) {
    saveEquipment(equipment.map((e) => e.id === id ? { ...e, equipped: !e.equipped } : e));
  }

  function handleTogglePinnedToCombat(id: string) {
    saveEquipment(equipment.map((e) =>
      e.id === id ? { ...e, pinnedToCombat: !e.pinnedToCombat } : e,
    ));
  }

  function handleUpdateItemValue(id: string, value: string) {
    const trimmed = value.trim();
    saveEquipment(equipment.map((e) =>
      e.id === id ? { ...e, value: trimmed ? trimmed : undefined } : e,
    ));
  }

  function handleUpdateItemQuantity(id: string, quantity: number) {
    // Clamp to non-negative integers. 1 is the implicit default so we
    // strip the field rather than write `1` back — keeps the JSON small
    // and matches how older rows look on the wire.
    const clamped = Number.isFinite(quantity) ? Math.max(0, Math.floor(quantity)) : 1;
    saveEquipment(equipment.map((e) =>
      e.id === id ? { ...e, quantity: clamped === 1 ? undefined : clamped } : e,
    ));
  }

  function handleToggleAttuned(id: string) {
    const target = equipment.find((e) => e.id === id);
    if (!target?.requiresAttunement) return;
    // Enforce the 3-slot 5e attunement cap. Only fire when the user
    // is attempting to attune (not unattune) and would exceed.
    if (!target.attuned) {
      const currentAttuned = equipment.filter((e) => e.requiresAttunement && e.attuned).length;
      if (currentAttuned >= 3) {
        Alert.alert(
          'Attunement slots full',
          'You can be attuned to at most 3 items at once. Unattune another item first.',
        );
        return;
      }
    }
    saveEquipment(equipment.map((e) => e.id === id ? { ...e, attuned: !e.attuned } : e));
  }

  function getFeatureList(cat: 'classFeatures' | 'speciesTraits' | 'feats'): Dnd5eFeature[] {
    return resources?.[cat] ?? [];
  }

  function saveFeature(cat: 'classFeatures' | 'speciesTraits' | 'feats', feature: Dnd5eFeature) {
    if (!resources) return;
    const list = getFeatureList(cat);
    const idx = list.findIndex((f) => f.id === feature.id);
    const updated = idx >= 0 ? list.map((f, i) => i === idx ? feature : f) : [...list, feature];
    persistResources({ ...resources, [cat]: updated });
    setEditFeature(null);
    setFeatureModal(false);
  }

  function removeFeature(cat: 'classFeatures' | 'speciesTraits' | 'feats', id: string) {
    if (!resources) return;
    persistResources({ ...resources, [cat]: getFeatureList(cat).filter((f) => f.id !== id) });
    setEditFeature(null);
    setFeatureModal(false);
  }

  function toggleFeatureUse(cat: 'classFeatures' | 'speciesTraits' | 'feats', id: string, delta: number) {
    if (!resources) return;
    const list = getFeatureList(cat);
    persistResources({
      ...resources,
      [cat]: list.map((f) => {
        if (f.id !== id || !f.uses) return f;
        return { ...f, uses: { ...f.uses, current: Math.max(0, Math.min(f.uses.max, f.uses.current + delta)) } };
      }),
    });
  }

  function applyQuickHp() {
    if (!resources || !stats || !hpQuickMode) { setHpQuickMode(null); return; }
    const n = parseInt(hpQuickInput, 10);
    if (isNaN(n) || n <= 0) { setHpQuickMode(null); return; }
    if (hpQuickMode === 'damage') {
      const tempAbsorb = Math.min(resources.hpTemp, n);
      const remaining = n - tempAbsorb;
      persistResources({
        ...resources,
        hpCurrent: Math.max(0, resources.hpCurrent - remaining),
        hpTemp: resources.hpTemp - tempAbsorb,
      });
    } else {
      persistResources({
        ...resources,
        hpCurrent: Math.min(stats.hpMax, resources.hpCurrent + n),
      });
    }
    setHpQuickMode(null);
    setHpQuickInput('');
  }

  function applyTempHp() {
    if (!resources || !stats) { setHpQuickMode(null); return; }
    const n = parseInt(hpQuickInput, 10);
    if (isNaN(n) || n <= 0) { setHpQuickMode(null); return; }
    // Temp HP doesn't stack — take the higher value
    persistResources({ ...resources, hpTemp: Math.max(resources.hpTemp, n) });
    setHpQuickMode(null);
    setHpQuickInput('');
  }

  function handleToggleCondition(condition: string) {
    if (!character) return;
    const current = character.conditions ?? [];
    const lower = condition.toLowerCase();
    const exists = current.map((c) => c.toLowerCase()).includes(lower);
    logActivity({ kind: 'condition', name: condition, action: exists ? 'removed' : 'added' });
    persistConditions(exists ? current.filter((c) => c.toLowerCase() !== lower) : [...current, condition]);
  }

  function handleSetExhaustion(level: number) {
    if (!resources) return;
    const clamped = Math.max(0, level);
    const from = resources.exhaustionLevel ?? 0;
    if (from !== clamped) logActivity({ kind: 'exhaustion', from, to: clamped });
    persistResources({ ...resources, exhaustionLevel: clamped });
  }

  function logActivity(entry: ActivityInput) {
    setActivityLog((prev) => [
      { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, at: Date.now(), ...entry } as ActivityEntry,
      ...prev,
    ].slice(0, 50));
  }

  function handleRoll(result: RollResult) {
    setRollResult(result);
    logActivity({ kind: 'roll', result });
    if (rollTimeoutRef.current) clearTimeout(rollTimeoutRef.current);
    rollTimeoutRef.current = setTimeout(() => setRollResult(null), 3000);
  }

  function handleDeathSave(type: 'success' | 'failure') {
    if (!resources) return;
    const ds = resources.deathSaves;
    const nextVal = type === 'success' ? (ds.successes + 1) % 4 : (ds.failures + 1) % 4;
    const prevVal = type === 'success' ? ds.successes : ds.failures;
    if (nextVal > prevVal) logActivity({ kind: 'deathSave', result: type });
    if (type === 'success') {
      persistResources({ ...resources, deathSaves: { ...ds, successes: nextVal } });
    } else {
      persistResources({ ...resources, deathSaves: { ...ds, failures: nextVal } });
    }
  }

  // ── Loading / Error ─────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={s.loadingContainer}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  if (error || !character) {
    return (
      <View style={s.loadingContainer}>
        <TouchableOpacity onPress={() => handleClose()} style={{ marginBottom: spacing.lg }}>
          <Text style={{ color: colors.brand, fontSize: 14 }}>← Back</Text>
        </TouchableOpacity>
        <Text style={{ color: colors.hpDanger }}>{error || 'Character not found.'}</Text>
      </View>
    );
  }

  // The row exists but its JSON payload is missing pieces the sheet needs to
  // render. Surface a specific diagnostic instead of the generic "Character
  // not found" — this state is recoverable from (open the row in a debug
  // tool or finish creation) and lying about it confuses the player.
  if (!stats || !resources || !scores) {
    const missing = [
      !stats && 'base stats',
      !resources && 'resources',
      stats && !scores && 'ability scores',
    ].filter(Boolean).join(', ');
    return (
      <View style={s.loadingContainer}>
        <TouchableOpacity onPress={() => handleClose()} style={{ marginBottom: spacing.lg }}>
          <Text style={{ color: colors.brand, fontSize: 14 }}>← Back</Text>
        </TouchableOpacity>
        <Text style={{ color: colors.hpDanger, marginBottom: spacing.sm }}>This character is missing required data: {missing}.</Text>
        <Text style={{ color: colors.outline, fontSize: 12 }}>Character ID: {character.id}</Text>
      </View>
    );
  }

  const isDead = resources.deathSaves.failures >= 3;
  const isStabilized = resources.hpCurrent === 0 && resources.deathSaves.successes >= 3;
  const showDeathSaves = resources.hpCurrent === 0 && !isDead;
  const activeConditions = character.conditions ?? [];
  const exhaustionLevel = resources.exhaustionLevel ?? 0;
  const hpC = hpColor();


  const hpRatio = Math.max(0, Math.min(1, resources.hpCurrent / stats.hpMax));

  // ── Tab definitions. ──
  const DESKTOP_TAB_DEFS = [
    { id: 'combat',    icon: 'sword-cross' as const,        label: 'Combat' },
    { id: 'spells',    icon: 'auto-fix' as const,           label: 'Spells' },
    { id: 'skills',    icon: 'star-outline' as const,       label: 'Skills' },
    { id: 'traits',    icon: 'lightning-bolt-outline' as const, label: 'Traits' },
    { id: 'gear',      icon: 'bag-personal-outline' as const, label: 'Gear' },
    { id: 'lore',      icon: 'book-open-outline' as const,  label: 'Lore' },
  ];
  const MOBILE_TAB_DEFS = [
    { id: 'combat',    icon: 'sword-cross' as const,        label: 'Combat' },
    { id: 'spells',    icon: 'auto-fix' as const,           label: 'Spells' },
    { id: 'skills',    icon: 'star-outline' as const,       label: 'Skills' },
    { id: 'traits',    icon: 'lightning-bolt-outline' as const, label: 'Traits' },
    { id: 'gear',      icon: 'bag-personal-outline' as const, label: 'Gear' },
    { id: 'lore',      icon: 'book-open-outline' as const,  label: 'Lore' },
  ];
  const TAB_DEFS = isDesktop ? DESKTOP_TAB_DEFS : MOBILE_TAB_DEFS;

  // ── Tab panel content ────────────────────────────────────────────────────
  function renderTab(id: TabId) {
    if (!stats || !resources || !scores) return null;
    switch (id) {
      case 'combat':
        return (
          <CombatTab
            stats={stats}
            resources={resourcesForTabs ?? resources}
            scores={scores}
            onSpendHitDie={() => setSpendHitDieOpen(true)}
            prof={prof}
            activeConditions={activeConditions}
            canEditAny={canEditAny}
            equipment={equipment}
            isDesktop={isDesktop}
            manualMode={manualMode}
            conditionCatalog={conditionResults}
            liveActionFeatures={liveActionFeatures}
            onRoll={handleRoll}
            onEditField={manualMode ? startEditField : undefined}
            onToggleCondition={handleToggleCondition}
            onSetExhaustion={handleSetExhaustion}
            getAttackBonus={getAttackBonus}
            onOpenHpModal={() => setHpModalVisible(true)}
            classResultsByKey={classResultsByKey}
            subclassResultsByKey={subclassResultsByKey}
            speciesResult={speciesResult}
            onUpdateAbilities={(abilities) => persistResources({ ...resources, abilities })}
            onOpenEquipmentDetail={setDetailEquipment}
            onOpenItemPicker={() => setItemPickerOpen(true)}
            onTriggerAbilityAdd={(req) => setPendingAbilityAdd({ ...req, counter: Date.now() })}
            abilityAddRequest={pendingAbilityAdd}
            onAbilityAddConsumed={() => setPendingAbilityAdd(null)}
            onToggleSaveProficiency={manualMode ? (ability) => {
              const profs = [...(stats.savingThrowProficiencies ?? [])];
              const next = profs.includes(ability)
                ? profs.filter((p) => p !== ability)
                : [...profs, ability];
              persistStats({ ...stats, savingThrowProficiencies: next });
            } : undefined}
          />
        );
      case 'spells':
        return (
          <SpellsTab
            stats={stats}
            resources={resourcesForTabs ?? resources}
            scores={scores}
            prof={prof}
            isOwner={isOwner}
            manualMode={manualMode}
            onEditField={manualMode ? startEditField : undefined}
            effectiveSpellcastingAbility={spellcastingAbilityForHint}
            onSpellSlotChange={(level, delta) => {
              if (!resources.spellSlots) return;
              const slot = resources.spellSlots[level];
              const next = Math.max(0, Math.min(slot.max, slot.remaining + delta));
              persistResources({
                ...resources,
                spellSlots: { ...resources.spellSlots, [level]: { ...slot, remaining: next } },
              });
            }}
            onConcentrationClear={() => persistResources({ ...resources, concentrationSpell: null })}
            onOpenManage={() => setSpellPickerOpen(true)}
            spellbook={spellbook}
            onSetPrepStatus={(spell, status) => {
              // Cantrips are auto-prepared by being in the spellbook;
              // ignore the chip cycle for them at the parent level too.
              if (spell.level === 0) return;
              const current = resources.preparedSpells ?? [];
              const without = current.filter((sp) => sp.id !== spell.id);
              let next: typeof current;
              if (status === 'unprepared') {
                next = without;
              } else if (status === 'prepared') {
                next = [...without, { ...spell, alwaysPrepared: false }];
              } else {
                next = [...without, { ...spell, alwaysPrepared: true }];
              }
              persistResources({ ...resources, preparedSpells: next });
            }}
            spellcastingExplainers={spellcastingExplainers}
            onSaveSpellNotes={(spell, notes) => {
              // Player notes layer onto the spell entry. The spellbook
              // is the master record (catalog spells live here too); we
              // also mirror into preparedSpells when present, so both
              // views show the latest text without a refetch.
              const trimmed = notes.trim();
              const noteVal = trimmed.length > 0 ? trimmed : undefined;
              const patch = (sp: Dnd5ePreparedSpell) =>
                sp.id === spell.id ? { ...sp, notes: noteVal } : sp;
              const nextBook = getSpellbook(resources).map(patch);
              const nextPrepared = (resources.preparedSpells ?? []).map(patch);
              persistResources({
                ...resources,
                spellbook: nextBook,
                preparedSpells: nextPrepared,
              });
            }}
          />
        );
      case 'skills':
        return (
          <SkillsTab
            stats={stats}
            scores={scores}
            prof={prof}
            onRoll={handleRoll}
            skillCatalog={skillResults}
            isOwner={isOwner}
            manualMode={manualMode}
            onEditField={manualMode ? startEditField : undefined}
            onUpdateProficiencies={(profs, exp) => {
              if (!stats) return;
              persistStats({ ...stats, skillProficiencies: profs, skillExpertise: exp });
            }}
            onUpdateToolProficiencies={(profs, exp) => {
              if (!stats) return;
              persistStats({ ...stats, toolProficiencies: profs, toolExpertise: exp });
            }}
          />
        );
      case 'traits':
        return (
          <AbilitiesTab
            stats={stats}
            resources={resources}
            isOwner={isOwner}
            classResultsByKey={classResultsByKey}
            subclassResultsByKey={subclassResultsByKey}
            speciesResult={speciesResult}
            backgroundResult={backgroundResult}
            originFeatResult={originFeatResult}
            featResultsByKey={featResultsByKey}
            onSaveFeatPicks={(featKey, picks) => {
              if (!stats || !resources) return;
              // Update both `resources.featPicks` (source of truth)
              // and `base_stats.skillProficiencies` (merged display
              // for the Skills tab). The Skills tab reads
              // skillProficiencies directly, so the merged form makes
              // existing display code work unchanged.
              //
              // Recompute skills as: (existing skills) minus (the
              // previous picks for this feat) plus (the new picks).
              // That way deselecting Acrobatics on Skilled actually
              // removes it, instead of leaving stale grants behind.
              const prev = resources.featPicks?.[featKey];
              const nextFeatPicks = { ...(resources.featPicks ?? {}), [featKey]: picks };
              const removed = new Set((prev?.skills ?? []).map((s) => s.toLowerCase()));
              const baseline = (stats.skillProficiencies ?? []).filter((s) => !removed.has(s.toLowerCase()));
              const merged = new Set(baseline.map((s) => s.toLowerCase()));
              for (const sk of (picks.skills ?? [])) merged.add(sk.toLowerCase());
              const nextStats: Dnd5eStats = {
                ...stats,
                skillProficiencies: Array.from(merged),
              };
              const nextResources: Dnd5eResources = {
                ...resources,
                featPicks: nextFeatPicks,
              };
              persistStats(nextStats);
              persistResources(nextResources);
            }}
            onToggleFeatureUse={toggleFeatureUse}
            onAddFeature={(cat) => {
              if (cat === 'feats') {
                // Catalog picker — replaces the freeform modal so
                // players can only add catalog feats and the prereq
                // checker can gate them.
                setFeatPickerOpen(true);
                return;
              }
              setFeatureCategory(cat);
              setEditFeature({ id: Date.now().toString(), name: '', description: '' });
              setFeatureModal(true);
            }}
            onEditFeature={(cat, feature) => {
              setFeatureCategory(cat);
              setEditFeature(feature);
              setFeatureModal(true);
            }}
            onTraitChoice={(traitName, optionName) => {
              if (!stats) return;
              const updated = {
                ...stats,
                traitChoices: { ...stats.traitChoices, [traitName]: optionName },
              };
              persistStats(updated);
            }}
            onToggleHidden={(key) => {
              if (!resources) return;
              const current = resources.hiddenFeatures ?? [];
              const next = current.includes(key)
                ? current.filter((k) => k !== key)
                : [...current, key];
              persistResources({ ...resources, hiddenFeatures: next });
            }}
          />
        );
      case 'gear':
        return (
          <GearTab
            stats={stats}
            resources={{ ...resources, equipment }}
            isOwner={isOwner}
            strengthScore={scores.strength}
            onUpdateCoins={(coins) => persistResources({ ...resources, coins })}
            onToggleEquipped={handleToggleEquipped}
            onToggleAttuned={handleToggleAttuned}
            onTogglePinnedToCombat={handleTogglePinnedToCombat}
            onUpdateNotes={(notes) => persistResources({ ...resources, notes })}
            onUpdateTreasure={(treasure) => persistResources({ ...resources, treasure })}
            onOpenItemPicker={() => setItemPickerOpen(true)}
            onRemoveItem={(id) => setRemoveEquipId(id)}
            onUpdateItemValue={handleUpdateItemValue}
            onUpdateItemQuantity={handleUpdateItemQuantity}
            onOpenEquipmentDetail={setDetailEquipment}
          />
        );
      case 'lore':
        return (
          <LoreTab
            stats={stats}
            resources={resources}
            isOwner={isOwner}
            speciesLabel={speciesResult?.name ?? null}
            classLabel={stats.classKey ? classResultsByKey[stats.classKey]?.name ?? null : null}
            backgroundLabel={backgroundResult?.name ?? null}
            onPersonalityChange={(field, value) =>
              persistResources({ ...resources, personality: { ...resources.personality, [field]: value } })
            }
            onAppearanceChange={(field, value) =>
              persistResources({ ...resources, appearance: { ...resources.appearance, [field]: value } })
            }
            onUpdateJournal={(entries) =>
              persistResources({ ...resources, journal: entries })
            }
          />
        );
    }
  }

  // ── Portrait helper ──────────────────────────────────────────────────────
  const portraitContent = portraitUploading
    ? <ActivityIndicator color={colors.primary} size="small" />
    : (character as any).avatar_url
      ? <Image source={{ uri: (character as any).avatar_url }} style={isDesktop ? s.deskPortraitImg : s.heroPortraitImg} />
      : <MaterialCommunityIcons name="account-outline" size={isDesktop ? 32 : 28} color={colors.outline} />;

  return (
    <View style={s.root}>

      {isDesktop ? (
        /* ════════════════════════════════════════════════════════════════
           DESKTOP LAYOUT — two-column sidebar
           ════════════════════════════════════════════════════════════════ */
        <SharedDndProvider>
        <View style={s.deskShell}>

          {/* ── Left rail ───────────────────────────────────────────── */}
          <LinearGradient
            colors={[`${colors.primary}26`, colors.surfaceContainerLowest, colors.surfaceContainerLowest]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0.4, y: 1 }}
            style={s.deskRail}
          >
          <ScrollView
            style={s.deskRailInner}
            contentContainerStyle={s.deskRailContent}
            showsVerticalScrollIndicator={false}
          >

            {/* Back + portrait + name */}
            <View style={s.deskHeader}>
              <TouchableOpacity onPress={() => handleClose()} style={s.deskBackBtn} hitSlop={8}>
                <MaterialCommunityIcons name="chevron-left" size={20} color={colors.onSurfaceVariant} />
                <Text style={s.deskBackLabel}>Characters</Text>
              </TouchableOpacity>

              <View style={s.deskIdentityRow}>
                <TouchableOpacity style={s.deskPortrait} onPress={handlePickPortrait} disabled={portraitUploading} activeOpacity={0.85}>
                  {portraitContent}
                </TouchableOpacity>

                <View style={s.deskNameBlock}>
                  {editingName ? (
                    <TextInput
                      style={s.deskNameInput}
                      value={nameInput}
                      onChangeText={setNameInput}
                      onBlur={() => { if (nameInput.trim()) persistName(nameInput.trim()); setEditingName(false); }}
                      onSubmitEditing={() => { if (nameInput.trim()) persistName(nameInput.trim()); setEditingName(false); }}
                      autoFocus returnKeyType="done"
                    />
                  ) : (
                    <TouchableOpacity onPress={() => isOwner && (setNameInput(stats.characterName), setEditingName(true))} activeOpacity={isOwner ? 0.7 : 1}>
                      <Text style={s.deskName} numberOfLines={2}>{stats.characterName}</Text>
                    </TouchableOpacity>
                  )}
                  <Text style={s.deskSub} numberOfLines={1}>
                    {[speciesLabel, classLabel].filter(Boolean).join(' ')}
                  </Text>
                  <Text style={s.deskLevel}>Level {stats.level}</Text>
                </View>

                <View style={s.deskHeaderIcons}>
                  {isOwner && stats.level < 20 ? (
                    <TouchableOpacity
                      style={s.deskIconBtn}
                      onPress={() => router.push(`/character/${id}/level-up`)}
                      hitSlop={6}
                      activeOpacity={0.7}
                    >
                      <MaterialCommunityIcons name="arrow-up-bold-circle-outline" size={16} color={colors.primary} />
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity style={s.deskIconBtn} onPress={() => setSettingsModal(true)} hitSlop={6}>
                    <MaterialCommunityIcons name="cog-outline" size={16} color={colors.outline} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* ── Stats block ─────────────────────────────────────── */}
            <View style={s.deskStats}>
              {/* HP section */}
              <View style={s.deskHpBox}>
                <Text style={s.deskHpSectionLabel}>Hit Points</Text>
                <View style={s.deskHpCenterRow}>
                  <TouchableOpacity
                    style={s.deskHpActionBtn}
                    onPress={() => canEditAny && (setHpQuickInput(''), setHpQuickMode('damage'))}
                    disabled={!canEditAny}
                    activeOpacity={0.7}
                    hitSlop={6}
                  >
                    <MaterialCommunityIcons name="sword" size={20} color={colors.hpDanger} />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={s.deskHpNumsCenter}
                    onPress={() => canEditAny && (manualMode ? startEditField('hpCurrent', resources.hpCurrent) : setHpModalVisible(true))}
                    onLongPress={() => canEditAny && setHpModalVisible(true)}
                    activeOpacity={0.7}
                  >
                    <Text style={[s.deskHpCurrent, { color: hpC }]}>{resources.hpCurrent}</Text>
                    <Text style={s.deskHpSep}>/</Text>
                    {manualMode ? (
                      <TouchableOpacity onPress={(e) => { e.stopPropagation(); startEditField('hpMax', stats.hpMax); }} activeOpacity={0.7}>
                        <Text style={[s.deskHpMax, { textDecorationLine: 'underline', textDecorationStyle: 'dashed' }]}>{stats.hpMax}</Text>
                      </TouchableOpacity>
                    ) : (
                      <Text style={s.deskHpMax}>{stats.hpMax}</Text>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={s.deskHpActionBtn}
                    onPress={() => canEditAny && (setHpQuickInput(''), setHpQuickMode('heal'))}
                    disabled={!canEditAny}
                    activeOpacity={0.7}
                    hitSlop={6}
                  >
                    <MaterialCommunityIcons name="heart-plus" size={20} color={colors.hpHealthy} />
                  </TouchableOpacity>
                </View>

                <View style={s.deskHpTrack}>
                  <View style={[s.deskHpFill, { width: `${hpRatio * 100}%` as any, backgroundColor: hpC }]} />
                  {resources.hpTemp > 0 && (
                    <View style={[s.deskHpTempFill, {
                      width: `${Math.min((1 - hpRatio) * 100, (resources.hpTemp / stats.hpMax) * 100)}%` as any,
                    }]} />
                  )}
                </View>

                <View style={s.deskHpMeta}>
                  {resources.hpTemp > 0
                    ? <Text style={s.deskHpTempLabel}>+{resources.hpTemp} temp</Text>
                    : <View />}
                  {resources.inspiration && (
                    <View style={s.deskHpInspired}>
                      <MaterialCommunityIcons name="star" size={11} color={colors.gm} />
                      <Text style={s.deskHpInspiredLabel}>Inspired</Text>
                    </View>
                  )}
                </View>
              </View>

              {/* ── Death Saves (only at 0 HP) ── */}
              {resources.hpCurrent === 0 && (
                <View style={s.deskDeathBox}>
                  <Text style={[
                    s.deskDeathLabel,
                    isDead && { color: colors.hpDanger },
                    isStabilized && { color: colors.hpHealthy },
                  ]}>
                    {isDead ? 'DEAD' : isStabilized ? 'STABLE' : 'DEATH SAVES'}
                  </Text>
                  {!isDead && (
                    <View style={s.deskDeathPipRows}>
                      <View style={s.deskDeathPipRow}>
                        <Text style={[s.deskDeathPipLabel, { color: colors.hpHealthy }]}>S</Text>
                        {[0, 1, 2].map((i) => (
                          <TouchableOpacity
                            key={i}
                            onPress={() => canEditAny && handleDeathSave('success')}
                            activeOpacity={canEditAny ? 0.7 : 1}
                          >
                            <View style={[s.deskDeathPip, i < resources.deathSaves.successes && s.deskDeathPipSuccess]} />
                          </TouchableOpacity>
                        ))}
                      </View>
                      <View style={s.deskDeathPipRow}>
                        <Text style={[s.deskDeathPipLabel, { color: colors.hpDanger }]}>F</Text>
                        {[0, 1, 2].map((i) => (
                          <TouchableOpacity
                            key={i}
                            onPress={() => canEditAny && handleDeathSave('failure')}
                            activeOpacity={canEditAny ? 0.7 : 1}
                          >
                            <View style={[s.deskDeathPip, i < resources.deathSaves.failures && s.deskDeathPipFailure]} />
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  )}
                </View>
              )}

              {/* Conditions */}
              <View style={s.deskConditions}>
                <Text style={s.deskSectionLabel}>Conditions</Text>
                <ConditionsSection
                  activeConditions={activeConditions}
                  exhaustionLevel={exhaustionLevel}
                  canEditAny={canEditAny}
                  onToggle={handleToggleCondition}
                  onSetExhaustion={handleSetExhaustion}
                  bundledConditions={getSrdContent(stats.srdVersion ?? 'SRD_2.0').conditions}
                />
              </View>

              {/* Stat grid — AC full row, then 2+2 */}
              <View style={s.deskStatGrid}>
                {/* Row 1: AC solo — masked metallic shield holds the
                    value, label sits to the right. Mirrors the
                    party-card / mobile-hero AC shield treatment so the
                    defense stat reads the same on every surface. */}
                <View style={s.deskStatRow}>
                  {(() => {
                    const Wrapper = manualMode ? TouchableOpacity : View;
                    return (
                      <Wrapper
                        style={[statCellStyle.cell, statCellStyle.cellCentered, manualMode && statCellStyle.cellEditable, s.deskAcCell]}
                        onPress={manualMode ? () => startEditField('ac', ac) : undefined}
                        activeOpacity={0.7}
                      >
                        <View style={s.deskAcShieldWrap}>
                          {/* Solid metallic silver shield — MaskedView
                              doesn't render on RN Web. */}
                          <MaterialCommunityIcons name="shield" size={44} color="#b8bdc7" />
                          <Text style={s.deskAcShieldNum}>{ac}</Text>
                        </View>
                        <View style={statCellStyle.text}>
                          <Text style={s.deskAcLabel}>Armor Class</Text>
                        </View>
                        {manualMode && <MaterialCommunityIcons name="pencil" size={8} color={colors.outline} style={{ position: 'absolute', top: 4, right: 4 }} />}
                      </Wrapper>
                    );
                  })()}
                </View>
                {/* Row 2: Speed | Initiative */}
                <View style={s.deskStatRow}>
                  <StatCell icon="run-fast" value={`${stats.speed} ft`} label="Speed" color={colors.onSurface}
                    editable={manualMode} onPress={manualMode ? () => startEditField('speed', stats.speed) : undefined} />
                  <StatCell icon="lightning-bolt" value={fmtMod(initiative)} label="Initiative" color={colors.onSurface}
                    editable={manualMode} onPress={manualMode ? () => startEditField('initiative', initiative) : undefined} />
                </View>
                {/* Row 3: Prof | Hit Die */}
                <View style={s.deskStatRow}>
                  <StatCell icon="star-four-points" value={fmtMod(prof)} label="Prof" color={colors.onSurface} />
                  {/* Hit die cell shows remaining/max and, in canEdit
                      mode with dice left, doubles as the spend button —
                      rolls 1dN+CON, heals HP, decrements remaining. */}
                  <StatCell
                    icon="dice-d8-outline"
                    value={`${resources?.hitDiceRemaining ?? stats.level}/${stats.level}`}
                    label={`Hit Die · d${stats.hitDie}`}
                    color={colors.onSurface}
                    onPress={canEditAny && (resources?.hitDiceRemaining ?? stats.level) > 0
                      ? () => setSpendHitDieOpen(true)
                      : undefined}
                  />
                </View>
              </View>
            </View>

            {/* ── Rest ─────────────────────────────────────────────── */}
            {canEditAny && (
              <View style={s.deskSection}>
                <Text style={s.deskSectionLabel}>Rest</Text>
                <View style={s.deskRestRow}>
                  <TouchableOpacity
                    style={s.deskRestBtn}
                    onPress={() => setRestConfirm('short')}
                    activeOpacity={0.7}
                  >
                    <MaterialCommunityIcons name="campfire" size={14} color={colors.primary} />
                    <Text style={s.deskRestBtnText}>Short Rest</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={s.deskRestBtn}
                    onPress={() => setRestConfirm('long')}
                    activeOpacity={0.7}
                  >
                    <MaterialCommunityIcons name="bed" size={14} color={colors.primary} />
                    <Text style={s.deskRestBtnText}>Long Rest</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* ── Inspiration ──────────────────────────────────────────
                Moved out of the desktop header into its own section
                directly under Rest, where it sits with the other
                player-controlled toggles. Inactive shows an outlined
                star + "Inspiration"; active flips to a filled gold
                star + "Inspired". */}
            {canEditAny && (
              <View style={s.deskSection}>
                <TouchableOpacity
                  style={[s.deskRestBtn, resources.inspiration && s.deskRestBtnActive]}
                  onPress={() => persistResources({ ...resources, inspiration: !resources.inspiration })}
                  activeOpacity={0.7}
                >
                  <MaterialCommunityIcons
                    name={resources.inspiration ? 'star' : 'star-outline'}
                    size={14}
                    color={resources.inspiration ? colors.gm : colors.outline}
                  />
                  <Text style={[s.deskRestBtnText, resources.inspiration && { color: colors.gm }]}>
                    {resources.inspiration ? 'Inspired' : 'Inspiration'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* ── Senses (passive skills) ───────────────────────────── */}
            <View style={s.deskSection}>
              <Text style={s.deskSectionLabel}>Senses</Text>
              {(['perception', 'investigation', 'insight'] as const).map((skill) => {
                const abi: keyof Dnd5eAbilityScores = skill === 'investigation' ? 'intelligence' : 'wisdom';
                const isProficient = stats.skillProficiencies?.includes(skill) ?? false;
                const passive = 10 + abilityMod(scores[abi]) + (isProficient ? prof : 0);
                return (
                  <TouchableOpacity
                    key={skill}
                    style={s.deskAbilityRow}
                    activeOpacity={manualMode ? 0.7 : 1}
                    onPress={manualMode ? () => {
                      const profs = [...(stats.skillProficiencies ?? [])];
                      if (isProficient) {
                        persistStats({ ...stats, skillProficiencies: profs.filter((s) => s !== skill) });
                      } else {
                        profs.push(skill);
                        persistStats({ ...stats, skillProficiencies: profs });
                      }
                    } : undefined}
                  >
                    <View style={[s.deskAbilDot, isProficient && s.deskAbilDotProf]} />
                    <Text style={s.deskAbilName}>Passive {capitalize(skill)}</Text>
                    <Text style={[s.deskAbilSaveVal, isProficient && { color: colors.primary }]}>{passive}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Saving throws were here; they now live at the top of the
                Combat tab (see CombatTab → SavingThrowsStrip) so the
                most-rolled stat on a turn is in the player's primary
                eyeline instead of tucked into the left rail. */}

            {/* ── Campaign link ─────────────────────────────────────── */}
            <TouchableOpacity
              style={s.deskCampSection}
              activeOpacity={character?.campaign_id ? 0.7 : 1}
              onPress={() => character?.campaign_id && router.push(`/campaign/${character.campaign_id}`)}
            >
              <View style={s.deskCampCard}>
                <MaterialCommunityIcons name="castle" size={16} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={s.deskCampCardLbl}>Campaign</Text>
                  <Text style={s.deskCampCardName} numberOfLines={1}>
                    {linkedCampaignName ?? 'Not linked'}
                  </Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={16} color={colors.primary} style={{ opacity: 0.6 }} />
              </View>
            </TouchableOpacity>

          </ScrollView>
          </LinearGradient>

          {/* ── Center content pane ─────────────────────────────────── */}
          <View style={s.deskContent}>
            <View style={s.deskPanes}>
              {/* Left pane */}
              <TabPane
                tabs={tabLayout.left}
                activeId={tabLayout.activeLeft}
                side="left"
                onActivate={(id) => setSideActive('left', id)}
                onMoveToSide={(id, toSide) => moveTab(id, toSide)}
                renderTab={renderTab}
              />
              {tabLayout.right.length > 0 ? (
                <>
                  <View style={s.deskPaneDivider} />
                  <TabPane
                    tabs={tabLayout.right}
                    activeId={tabLayout.activeRight ?? tabLayout.right[0]}
                    side="right"
                    onActivate={(id) => setSideActive('right', id)}
                    onMoveToSide={(id, toSide) => moveTab(id, toSide)}
                    renderTab={renderTab}
                  />
                </>
              ) : (
                <SplitDropZone onMove={(id) => moveTab(id, 'right')} />
              )}
            </View>
          </View>

          {/* ── Activity log rail (right side, collapsible) ─────────── */}
          {!rightRailCollapsed && (
            <LinearGradient
              colors={[`${colors.gm}26`, colors.surfaceContainerLowest, colors.surfaceContainerLowest]}
              start={{ x: 1, y: 0 }}
              end={{ x: 0.6, y: 1 }}
              style={s.skillsRail}
            >
              <View style={s.skillsRailHead}>
                <View>
                  <Text style={s.skillsRailTitle}>Activity Log</Text>
                  <Text style={s.skillsRailSub}>{activityLog.length} event{activityLog.length === 1 ? '' : 's'}</Text>
                </View>
                <TouchableOpacity onPress={() => setRightRailCollapsed(true)} hitSlop={8}>
                  <MaterialCommunityIcons name="chevron-right" size={18} color={colors.outline} />
                </TouchableOpacity>
              </View>
              {activityLog.length === 0 ? (
                <Text style={s.logRailEmpty}>No activity yet.</Text>
              ) : (
                <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
                  {activityLog.map((entry) => {
                    const d = describeEntry(entry);
                    return (
                      <View key={entry.id} style={s.logRailRow}>
                        <MaterialCommunityIcons name={d.icon as any} size={12} color={d.accent} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={s.logRailLabel} numberOfLines={1}>{d.label}</Text>
                          {!!d.detail && <Text style={s.logRailDice} numberOfLines={1}>{d.detail}</Text>}
                        </View>
                        {!!d.total && <Text style={[s.logRailTotal, { color: d.accent }]}>{d.total}</Text>}
                      </View>
                    );
                  })}
                </ScrollView>
              )}
            </LinearGradient>
          )}
          {rightRailCollapsed && (
            <LinearGradient
              colors={[`${colors.gm}26`, colors.surfaceContainerLowest, colors.surfaceContainerLowest]}
              start={{ x: 1, y: 0 }}
              end={{ x: 0.6, y: 1 }}
              style={s.skillsRailCollapsed}
            >
              <TouchableOpacity
                style={s.skillsRailCollapsedInner}
                onPress={() => setRightRailCollapsed(false)}
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons name="chevron-left" size={16} color={colors.outline} />
                <Text style={s.skillsRailCollapsedLabel}>Log</Text>
              </TouchableOpacity>
            </LinearGradient>
          )}

        </View>
        </SharedDndProvider>

      ) : (
        /* ════════════════════════════════════════════════════════════════
           MOBILE LAYOUT — stacked HUD
           ════════════════════════════════════════════════════════════════ */
        <>
          {/* Utility bar — Home + Campaign on the left; Lv↑ / Log /
              Settings on the right. The chunky Home button goes all the
              way back to the home screen (drawer entry point); Campaign
              jumps into the linked campaign hub. */}
          <View style={s.utilityBar}>
            <TouchableOpacity
              onPress={() => router.replace('/(drawer)/home')}
              style={s.homeBtn}
              hitSlop={6}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons name="chevron-left" size={22} color={colors.onSurfaceVariant} />
              <Text style={s.homeBtnLabel}>Home</Text>
            </TouchableOpacity>
            {character?.campaign_id && linkedCampaignName ? (
              <TouchableOpacity
                style={s.campaignChip}
                onPress={() => router.push(`/campaign/${character.campaign_id}`)}
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons name="castle" size={13} color={colors.primary} />
                <Text style={s.campaignChipLabel} numberOfLines={1}>{linkedCampaignName}</Text>
              </TouchableOpacity>
            ) : null}
            <View style={{ flex: 1 }} />
            {isOwner && stats.level < 20 ? (
              <TouchableOpacity
                onPress={() => router.push(`/character/${id}/level-up`)}
                hitSlop={8}
                style={s.settingsIconBtn}
              >
                <MaterialCommunityIcons name="arrow-up-bold-circle-outline" size={20} color={colors.primary} />
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity onPress={() => setLogModal(true)} hitSlop={8} style={s.settingsIconBtn}>
              <MaterialCommunityIcons name="notebook-outline" size={20} color={colors.outline} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setSettingsModal(true)} hitSlop={8} style={s.settingsIconBtn}>
              <MaterialCommunityIcons name="cog-outline" size={20} color={colors.outline} />
            </TouchableOpacity>
          </View>

          {/* Hero card — mirrors the campaign PartyMemberCard chassis:
              left-edge HP-tier stripe, 3:4 portrait, body column with
              name + subtitle + HP block + passive senses + chips, AC
              shield top-right. Adapted for self-view so taps are
              actionable (HP → quick damage/heal modal, name → edit,
              portrait → upload, inspiration / conditions → toggle). */}
          <View style={[s.heroCard, isDead && s.heroCardUnconscious]}>
            {/* Top-right corner buttons — Inspiration toggle + Rest
                chooser. Rest taps open a small picker modal that flows
                into the existing restConfirm. */}
            <View style={s.heroCornerBtns}>
              <TouchableOpacity
                style={[s.heroCornerBtn, resources.inspiration && s.heroCornerBtnInspActive]}
                onPress={() => canEditAny && persistResources({ ...resources, inspiration: !resources.inspiration })}
                disabled={!canEditAny}
                activeOpacity={canEditAny ? 0.7 : 1}
                accessibilityLabel={resources.inspiration ? 'Inspired — tap to clear' : 'Mark inspired'}
              >
                <MaterialCommunityIcons
                  name={resources.inspiration ? 'star' : 'star-outline'}
                  size={16}
                  color={resources.inspiration ? colors.gm : colors.outline}
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={s.heroCornerBtn}
                onPress={() => canEditAny && setRestChooserOpen(true)}
                disabled={!canEditAny}
                activeOpacity={canEditAny ? 0.7 : 1}
                accessibilityLabel="Take a rest"
              >
                <MaterialCommunityIcons name="bed" size={16} color={colors.outline} />
              </TouchableOpacity>
            </View>

            {/* 3:4 portrait fills card height */}
            <TouchableOpacity
              style={s.heroPortrait}
              onPress={handlePickPortrait}
              disabled={portraitUploading || !isOwner}
              activeOpacity={isOwner ? 0.85 : 1}
            >
              {portraitContent}
            </TouchableOpacity>

            {/* Body column */}
            <View style={s.heroBody}>
              {/* Title row — AC shield inline at left, name + subtitle
                  filling the remainder. Right padding clears the corner
                  buttons (INSP + REST) absolute-positioned above. */}
              <View style={[s.heroTitleRow, s.heroNamePad]}>
                <View style={s.heroAcInline}>
                  <MaterialCommunityIcons name="shield" size={36} color="#b8bdc7" />
                  <Text style={s.heroAcNum}>{ac}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  {editingName ? (
                    <TextInput
                      style={s.heroNameInput}
                      value={nameInput}
                      onChangeText={setNameInput}
                      onBlur={() => { if (nameInput.trim()) persistName(nameInput.trim()); setEditingName(false); }}
                      onSubmitEditing={() => { if (nameInput.trim()) persistName(nameInput.trim()); setEditingName(false); }}
                      autoFocus returnKeyType="done"
                    />
                  ) : (
                    <TouchableOpacity
                      onPress={() => isOwner && (setNameInput(stats.characterName), setEditingName(true))}
                      activeOpacity={isOwner ? 0.7 : 1}
                    >
                      <Text style={s.heroName} numberOfLines={1}>{stats.characterName}</Text>
                    </TouchableOpacity>
                  )}
                  <Text style={s.heroSub} numberOfLines={1}>
                    L{stats.level} — {[speciesLabel, classLabel].filter(Boolean).join(' ')}
                  </Text>
                </View>
              </View>

              {/* HP block — tap to open the quick damage / heal modal,
                  long-press to heal. */}
              <TouchableOpacity
                style={s.heroHpBlock}
                onPress={() => canEditAny && (setHpQuickInput(''), setHpQuickMode('damage'))}
                onLongPress={() => canEditAny && (setHpQuickInput(''), setHpQuickMode('heal'))}
                activeOpacity={canEditAny ? 0.7 : 1}
                disabled={!canEditAny}
              >
                <View style={s.heroHpRow}>
                  <View style={s.heroHpNumWrap}>
                    <Text style={[s.heroHpNum, { color: hpC }]}>{resources.hpCurrent}</Text>
                    <Text style={s.heroHpMax}> / {stats.hpMax}</Text>
                  </View>
                  {resources.hpTemp > 0 ? (
                    <View style={s.heroTempPill}>
                      <Text style={s.heroTempPillText}>+{resources.hpTemp} TEMP</Text>
                    </View>
                  ) : null}
                  {(showDeathSaves || isDead || isStabilized) && (
                    <Text style={[
                      s.heroHpState,
                      isDead && { color: colors.hpDanger },
                      isStabilized && { color: colors.hpHealthy },
                    ]}>
                      {isDead ? 'DEAD' : isStabilized ? 'STABLE' : 'DEATH SAVES'}
                    </Text>
                  )}
                </View>
                <View style={s.heroHpTrack}>
                  <View style={[s.heroHpFill, { width: `${hpRatio * 100}%` as any, backgroundColor: hpC }]} />
                  {resources.hpTemp > 0 && (
                    <View style={[s.heroHpTempFill, {
                      width: `${Math.min((1 - hpRatio) * 100, (resources.hpTemp / stats.hpMax) * 100)}%` as any,
                    }]} />
                  )}
                </View>
              </TouchableOpacity>

              {/* Passive senses row with icons. Eye → Perception,
                  Magnify → Investigation, Brain → Insight. */}
              <View style={s.heroStatsRow}>
                <SenseCell icon="eye-outline" label="PER" value={passivePerception} />
                <SenseCell icon="magnify" label="INV" value={passiveInvestigation} />
                <SenseCell icon="brain" label="INS" value={passiveInsight} />
              </View>

              {/* Chip row — concentration + active conditions + exhaustion.
                  INSP moved to the top-right corner button. */}
              {(resources.concentrationSpell || activeConditions.length > 0 || (resources.exhaustionLevel ?? 0) > 0) ? (
                <View style={s.heroChipsRow}>
                  {resources.concentrationSpell ? (
                    <View style={[s.heroChip, s.heroChipConc]}>
                      <Text style={[s.heroChipText, s.heroChipTextConc]}>✦ {resources.concentrationSpell.toUpperCase()}</Text>
                    </View>
                  ) : null}
                  {activeConditions.map((c) => (
                    <View key={c} style={[s.heroChip, s.heroChipCond]}>
                      <Text style={[s.heroChipText, s.heroChipTextCond]}>{c.toUpperCase()}</Text>
                    </View>
                  ))}
                  {(resources.exhaustionLevel ?? 0) > 0 ? (
                    <View style={[s.heroChip, s.heroChipCond]}>
                      <Text style={[s.heroChipText, s.heroChipTextCond]}>EXHAUSTION {resources.exhaustionLevel}</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          </View>

          {/* Supplementary strip — sidebar-overflow stats. Rest
              buttons moved up to the hero card's corner-button cluster. */}
          <View style={s.heroSuppRow}>
            <View style={s.suppStat}>
              <Text style={s.suppStatLabel}>INIT</Text>
              <Text style={s.suppStatValue}>{fmtMod(initiative)}</Text>
            </View>
            <View style={s.suppStat}>
              <Text style={s.suppStatLabel}>SPD</Text>
              <Text style={s.suppStatValue}>{stats.speed}</Text>
            </View>
            <View style={s.suppStat}>
              <Text style={s.suppStatLabel}>PROF</Text>
              <Text style={[s.suppStatValue, { color: colors.primary }]}>{fmtMod(prof)}</Text>
            </View>
            <View style={s.suppStat}>
              <Text style={s.suppStatLabel}>HD</Text>
              <Text style={s.suppStatValue}>{resources.hitDiceRemaining ?? stats.level}/{stats.level}</Text>
            </View>
          </View>

          {/* Tab content */}
          <View style={{ flex: 1 }}>{renderTab(activeTab)}</View>

          {/* Bottom tab bar */}
          <View style={s.tabBar}>
            {TAB_DEFS.map((tab) => (
              <TouchableOpacity
                key={tab.id}
                style={[s.tabBtn, activeTab === tab.id && s.tabBtnActive]}
                onPress={() => setActiveTab(tab.id as TabId)}
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons
                  name={tab.icon}
                  size={20}
                  color={activeTab === tab.id ? colors.primary : colors.outline}
                />
                <Text style={[s.tabLabel, activeTab === tab.id && s.tabLabelActive]}>{tab.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      {/* Roll Toast — works for both layouts */}
      <RollToast result={rollResult} />

      {/* ── Modals ───────────────────────────────────────────────────── */}
      <HpModal
        visible={hpModalVisible}
        resources={resources}
        hpMax={stats.hpMax}
        onClose={() => setHpModalVisible(false)}
        onApply={persistResources}
      />

      {/* Activity log modal */}
      <Modal visible={logModal} transparent animationType="fade">
        <Pressable style={s.modalBackdrop} onPress={() => setLogModal(false)}>
          <Pressable style={s.modalCard} onPress={() => {}}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Activity Log</Text>
              <TouchableOpacity onPress={() => setLogModal(false)}>
                <MaterialCommunityIcons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            {activityLog.length === 0 ? (
              <Text style={s.logEmpty}>No activity yet — your rolls and changes will appear here.</Text>
            ) : (
              <ScrollView style={s.logList} showsVerticalScrollIndicator={false}>
                {activityLog.map((entry) => {
                  const d = describeEntry(entry);
                  return (
                    <View key={entry.id} style={s.logRow}>
                      <MaterialCommunityIcons name={d.icon as any} size={18} color={d.accent} style={{ marginRight: 4 }} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={s.logLabel} numberOfLines={1}>{d.label}</Text>
                        {!!d.detail && <Text style={s.logDice}>{d.detail}</Text>}
                      </View>
                      {!!d.total && <Text style={[s.logTotal, { color: d.accent }]}>{d.total}</Text>}
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Settings modal */}
      <Modal visible={settingsModal} transparent animationType="fade">
        <Pressable
          style={s.modalBackdrop}
          onPress={() => { setSettingsModal(false); setDeleteArmed(false); }}
        >
          <Pressable style={s.modalCard} onPress={() => {}}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Character Settings</Text>
              <TouchableOpacity onPress={() => { setSettingsModal(false); setDeleteArmed(false); }}>
                <MaterialCommunityIcons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Active in campaign — only meaningful when the character
                is linked to a campaign. Inactive characters still
                appear in that campaign's Members card but stay hidden
                from the Party / Combat surfaces by default. */}
            <View style={s.settingRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.settingLabel}>Active in Campaign</Text>
                <Text style={s.settingDesc}>
                  Show this character in the party / combat surfaces. Turn off to
                  bench retired or backup characters without deleting them.
                </Text>
              </View>
              <Switch
                value={characterActive}
                onValueChange={handleToggleActive}
                trackColor={{ false: colors.border, true: colors.brand + '66' }}
                thumbColor={characterActive ? colors.brand : colors.textSecondary}
              />
            </View>

            <View style={s.settingRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.settingLabel}>Manual Mode</Text>
                <Text style={s.settingDesc}>
                  Edit all stats freely — ability scores, speed, HP max, and more.
                </Text>
              </View>
              <Switch
                value={manualMode}
                onValueChange={handleToggleManualMode}
                trackColor={{ false: colors.border, true: colors.brand + '66' }}
                thumbColor={manualMode ? colors.brand : colors.textSecondary}
              />
            </View>

            {/* Destructive zone. Two-step: first tap arms the row, the
                second commits. Backdrop tap / close button disarms. */}
            <View style={s.dangerZone}>
              {!deleteArmed ? (
                <TouchableOpacity
                  style={s.deleteRow}
                  onPress={() => setDeleteArmed(true)}
                  activeOpacity={0.75}
                >
                  <MaterialCommunityIcons name="trash-can-outline" size={18} color={colors.hpDanger} />
                  <Text style={s.deleteRowText}>Delete Character</Text>
                </TouchableOpacity>
              ) : (
                <View>
                  <Text style={s.deleteConfirmText}>
                    Delete {stats?.characterName ?? 'this character'}? This cannot be undone.
                  </Text>
                  <View style={s.deleteConfirmRow}>
                    <TouchableOpacity
                      style={s.deleteCancelBtn}
                      onPress={() => setDeleteArmed(false)}
                      disabled={deleting}
                    >
                      <Text style={s.deleteCancelText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.deleteConfirmBtn, deleting && s.deleteConfirmBtnDisabled]}
                      onPress={handleDeleteCharacter}
                      disabled={deleting}
                    >
                      <Text style={s.deleteConfirmBtnText}>
                        {deleting ? 'Deleting…' : 'Delete'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          </Pressable>
        </Pressable>
      </Modal>


      {/* Field edit modal */}
      <Modal visible={!!editingField} transparent animationType="fade">
        <Pressable style={s.modalBackdrop} onPress={() => setEditingField(null)}>
          <Pressable style={s.modalCard} onPress={() => {}}>
            <Text style={s.modalTitle}>
              {editingField === 'hpCurrent' ? 'Edit Hit Points'
                : editingField === 'ac' ? 'Edit Armor Class'
                : editingField === 'initiative' ? 'Edit Initiative'
                : editingField === 'hpMax' ? 'Edit HP Max'
                : editingField === 'cantripsLimit' ? 'Edit Cantrips Known'
                : editingField === 'preparedLimit' ? 'Edit Spells Prepared'
                : editingField === 'spellAttack' ? 'Edit Spell Attack'
                : editingField === 'spellSaveDc' ? 'Edit Spell Save DC'
                : typeof editingField === 'string' && editingField.startsWith('slotMax_')
                  ? `Edit Spell Slots (Level ${editingField.slice('slotMax_'.length)})`
                : `Edit ${editingField ? (ABILITY_SHORT[editingField as keyof Dnd5eAbilityScores] || capitalize(editingField)) : ''}`}
            </Text>
            {editingField === 'hpCurrent' ? (
              <>
                <View style={s.hpEditRow}>
                  <View style={s.hpEditField}>
                    <Text style={s.hpEditLabel}>Current HP</Text>
                    <TextInput
                      style={s.fieldInput}
                      value={fieldInput}
                      onChangeText={setFieldInput}
                      keyboardType="number-pad"
                      autoFocus
                      returnKeyType="next"
                    />
                  </View>
                  <View style={s.hpEditField}>
                    <Text style={[s.hpEditLabel, { color: '#3B82F6' }]}>Temp HP</Text>
                    <TextInput
                      style={[s.fieldInput, { borderColor: '#3B82F6' }]}
                      value={tempHpFieldInput}
                      onChangeText={setTempHpFieldInput}
                      keyboardType="number-pad"
                      returnKeyType="done"
                      onSubmitEditing={saveEditField}
                    />
                  </View>
                </View>
              </>
            ) : editingField === 'concentrationSpell' ? (
              <TextInput
                style={s.fieldInput}
                value={fieldInput}
                onChangeText={setFieldInput}
                placeholder="Spell name"
                placeholderTextColor={colors.textSecondary}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={saveEditField}
              />
            ) : (
              <TextInput
                style={s.fieldInput}
                value={fieldInput}
                onChangeText={setFieldInput}
                keyboardType="number-pad"
                autoFocus
                returnKeyType="done"
                onSubmitEditing={saveEditField}
              />
            )}
            {/* Show what the equipment-based calculation would yield,
                so the user can see whether their override matches or
                diverges. AC + Initiative are the two calculated stats
                that carry overrides today. */}
            {editingField === 'ac' && (
              <Text style={s.fieldHint}>
                Computed from gear: {computedAC}
                {stats?.acOverride != null && stats.acOverride !== computedAC
                  ? `  ·  override active (${stats.acOverride})`
                  : ''}
              </Text>
            )}
            {editingField === 'initiative' && (
              <Text style={s.fieldHint}>
                Computed from DEX: {fmtMod(computedInitiative)}
                {stats?.initiativeOverride != null && stats.initiativeOverride !== computedInitiative
                  ? `  ·  override active (${fmtMod(stats.initiativeOverride)})`
                  : ''}
              </Text>
            )}
            {editingField === 'cantripsLimit' && (
              <Text style={s.fieldHint}>
                {baseSpellLimits.cantrips !== undefined
                  ? `Computed from class: ${baseSpellLimits.cantrips}`
                  : 'No class table value — set a custom cap.'}
                {stats?.cantripsKnownOverride != null && stats.cantripsKnownOverride !== baseSpellLimits.cantrips
                  ? `  ·  override active (${stats.cantripsKnownOverride})`
                  : ''}
              </Text>
            )}
            {editingField === 'preparedLimit' && (
              <Text style={s.fieldHint}>
                {baseSpellLimits.prepared !== undefined
                  ? `Computed from class: ${baseSpellLimits.prepared}`
                  : baseSpellLimits.spellbook !== undefined
                    ? `Computed from class: ${baseSpellLimits.spellbook} (known)`
                    : 'No class table value — set a custom cap.'}
                {stats?.preparedSpellsOverride != null
                  && stats.preparedSpellsOverride !== baseSpellLimits.prepared
                  && stats.preparedSpellsOverride !== baseSpellLimits.spellbook
                  ? `  ·  override active (${stats.preparedSpellsOverride})`
                  : ''}
              </Text>
            )}
            {editingField === 'spellAttack' && (
              <Text style={s.fieldHint}>
                {computedSpellAttack !== null
                  ? `Computed (prof + spell mod): ${fmtMod(computedSpellAttack)}`
                  : 'No spellcasting ability — set a custom bonus.'}
                {stats?.spellAttackOverride != null && stats.spellAttackOverride !== computedSpellAttack
                  ? `  ·  override active (${fmtMod(stats.spellAttackOverride)})`
                  : ''}
              </Text>
            )}
            {editingField === 'spellSaveDc' && (
              <Text style={s.fieldHint}>
                {computedSpellDC !== null
                  ? `Computed (8 + prof + spell mod): ${computedSpellDC}`
                  : 'No spellcasting ability — set a custom DC.'}
                {stats?.spellSaveDcOverride != null && stats.spellSaveDcOverride !== computedSpellDC
                  ? `  ·  override active (${stats.spellSaveDcOverride})`
                  : ''}
              </Text>
            )}
            {typeof editingField === 'string' && editingField.startsWith('slotMax_') && (() => {
              const lvl = parseInt(editingField.slice('slotMax_'.length), 10);
              const k = lvl as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
              const computedMax = resources?.spellSlots?.[k]?.max ?? 0;
              const override = stats?.spellSlotMaxOverrides?.[k];
              return (
                <Text style={s.fieldHint}>
                  Computed from class: {computedMax}
                  {override != null && override !== computedMax
                    ? `  ·  override active (${override})`
                    : ''}
                </Text>
              );
            })()}
            <View style={s.fieldBtnRow}>
              {((editingField === 'ac' && stats?.acOverride != null)
                || (editingField === 'initiative' && stats?.initiativeOverride != null)
                || (editingField === 'cantripsLimit' && stats?.cantripsKnownOverride != null)
                || (editingField === 'preparedLimit' && stats?.preparedSpellsOverride != null)
                || (editingField === 'spellAttack' && stats?.spellAttackOverride != null)
                || (editingField === 'spellSaveDc' && stats?.spellSaveDcOverride != null)
                || (typeof editingField === 'string'
                    && editingField.startsWith('slotMax_')
                    && stats?.spellSlotMaxOverrides?.[parseInt(editingField.slice('slotMax_'.length), 10) as 1|2|3|4|5|6|7|8|9] != null)) && (
                <TouchableOpacity style={s.fieldResetBtn} onPress={resetEditField}>
                  <Text style={s.fieldResetBtnText}>Reset to computed</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={[s.fieldSaveBtn, { flex: 1 }]} onPress={saveEditField}>
                <Text style={s.fieldSaveBtnText}>Save</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Feature edit modal */}
      <Modal visible={featureModal && !!editFeature} transparent animationType="fade">
        <Pressable style={s.modalBackdrop} onPress={() => setFeatureModal(false)}>
          <Pressable style={[s.modalCard, { maxWidth: 440 }]} onPress={() => {}}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>
                {editFeature?.name ? 'Edit Feature' : 'Add Feature'}
              </Text>
              <TouchableOpacity onPress={() => setFeatureModal(false)}>
                <MaterialCommunityIcons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {editFeature && (
              <ScrollView style={{ maxHeight: 400 }}>
                <Text style={s.eqLabel}>Name</Text>
                <TextInput
                  style={s.eqInput}
                  value={editFeature.name}
                  onChangeText={(t) => setEditFeature({ ...editFeature, name: t })}
                  placeholder="e.g. Second Wind, Darkvision"
                  placeholderTextColor={colors.textSecondary}
                  autoFocus
                />

                <Text style={s.eqLabel}>Description</Text>
                <TextInput
                  style={[s.eqInput, { minHeight: 80, textAlignVertical: 'top' }]}
                  value={editFeature.description}
                  onChangeText={(t) => setEditFeature({ ...editFeature, description: t })}
                  placeholder="What does this feature do?"
                  placeholderTextColor={colors.textSecondary}
                  multiline
                />

                <Text style={s.eqLabel}>Flavor / Notes</Text>
                <TextInput
                  style={[s.eqInput, { minHeight: 50, textAlignVertical: 'top' }]}
                  value={editFeature.notes ?? ''}
                  onChangeText={(t) => setEditFeature({
                    ...editFeature,
                    notes: t.length > 0 ? t : undefined,
                  })}
                  placeholder="Personal take, table rulings, RP flavor — kept separate from the description."
                  placeholderTextColor={colors.textSecondary}
                  multiline
                />

                <Text style={s.eqLabel}>Action Type</Text>
                <View style={s.eqSlotRow}>
                  {([
                    { value: undefined, label: 'None' },
                    { value: 'action', label: 'Action' },
                    { value: 'bonus', label: 'Bonus' },
                    { value: 'reaction', label: 'Reaction' },
                    { value: 'free', label: 'Free' },
                  ] as Array<{ value: Dnd5eFeature['actionType']; label: string }>).map((opt) => {
                    const active = (editFeature.actionType ?? undefined) === opt.value;
                    return (
                      <TouchableOpacity
                        key={opt.label}
                        style={[s.eqSlotBtn, active && s.eqSlotBtnActive]}
                        onPress={() => {
                          const next = { ...editFeature };
                          if (opt.value === undefined) delete next.actionType;
                          else next.actionType = opt.value;
                          setEditFeature(next);
                        }}
                      >
                        <Text style={[s.eqSlotText, active && s.eqSlotTextActive]}>{opt.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <Text style={s.fieldHint}>
                  Action / Bonus / Reaction / Free entries also appear on the Combat tab.
                </Text>

                <Text style={s.eqLabel}>Has Limited Uses?</Text>
                <View style={s.eqSlotRow}>
                  <TouchableOpacity
                    style={[s.eqSlotBtn, !editFeature.uses && s.eqSlotBtnActive]}
                    onPress={() => setEditFeature({ ...editFeature, uses: undefined })}
                  >
                    <Text style={[s.eqSlotText, !editFeature.uses && s.eqSlotTextActive]}>Passive</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.eqSlotBtn, !!editFeature.uses && s.eqSlotBtnActive]}
                    onPress={() => setEditFeature({ ...editFeature, uses: editFeature.uses ?? { current: 1, max: 1, recharge: 'long' } })}
                  >
                    <Text style={[s.eqSlotText, !!editFeature.uses && s.eqSlotTextActive]}>Has Uses</Text>
                  </TouchableOpacity>
                </View>

                {editFeature.uses && (
                  <>
                    <Text style={s.eqLabel}>Max Uses</Text>
                    <TextInput
                      style={s.eqInput}
                      value={String(editFeature.uses.max)}
                      onChangeText={(t) => {
                        const n = parseInt(t, 10) || 1;
                        setEditFeature({ ...editFeature, uses: { ...editFeature.uses!, max: n, current: Math.min(editFeature.uses!.current, n) } });
                      }}
                      keyboardType="number-pad"
                    />
                    <Text style={s.eqLabel}>Recharge</Text>
                    <View style={s.eqSlotRow}>
                      <TouchableOpacity
                        style={[s.eqSlotBtn, editFeature.uses.recharge === 'short' && s.eqSlotBtnActive]}
                        onPress={() => setEditFeature({ ...editFeature, uses: { ...editFeature.uses!, recharge: 'short' } })}
                      >
                        <Text style={[s.eqSlotText, editFeature.uses.recharge === 'short' && s.eqSlotTextActive]}>Short Rest</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[s.eqSlotBtn, editFeature.uses.recharge === 'long' && s.eqSlotBtnActive]}
                        onPress={() => setEditFeature({ ...editFeature, uses: { ...editFeature.uses!, recharge: 'long' } })}
                      >
                        <Text style={[s.eqSlotText, editFeature.uses.recharge === 'long' && s.eqSlotTextActive]}>Long Rest</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}

                <TouchableOpacity
                  style={[s.fieldSaveBtn, { marginTop: spacing.md }]}
                  onPress={() => saveFeature(featureCategory, editFeature)}
                >
                  <Text style={s.fieldSaveBtnText}>Save</Text>
                </TouchableOpacity>

                {getFeatureList(featureCategory).some((f) => f.id === editFeature.id) && (
                  <TouchableOpacity
                    style={s.eqDeleteBtn}
                    onPress={() => removeFeature(featureCategory, editFeature.id)}
                  >
                    <Text style={s.eqDeleteText}>Remove</Text>
                  </TouchableOpacity>
                )}
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Catalog feat picker — replaces the freeform feat-add modal
          so players pick from the system's feat catalog and the
          prereq checker can gate prereq-bearing feats. */}
      {stats && resources ? (
        <FeatPickerModal
          visible={featPickerOpen}
          onClose={() => setFeatPickerOpen(false)}
          stats={stats}
          existing={resources.feats ?? []}
          enforcePrereqs={enforceFeatPrereqs}
          campaignId={character?.campaign_id ?? null}
          packIds={character?.pack_ids ?? []}
          srdVersion={stats.srdVersion}
          onPick={(feature) => saveFeature('feats', feature)}
        />
      ) : null}

      {/* Equipment removal confirmation. Pulls the item name fresh on
          each render so the prompt always matches the row the user
          tapped. Uses the same restConfirmCard styling so the two
          dialogs feel like one pattern. */}
      <Modal visible={!!removeEquipId} transparent animationType="fade" onRequestClose={() => setRemoveEquipId(null)}>
        <Pressable style={s.modalBackdrop} onPress={() => setRemoveEquipId(null)}>
          <Pressable style={s.restConfirmCard} onPress={() => {}}>
            <View style={s.restConfirmHeader}>
              <MaterialCommunityIcons name="trash-can-outline" size={20} color={colors.primary} />
              <Text style={s.modalTitle}>Remove item?</Text>
            </View>
            <Text style={s.restConfirmBody}>
              Remove {(resources?.equipment ?? []).find((it) => it.id === removeEquipId)?.name ?? 'this item'} from your gear?
              This can't be undone — you'll need to re-add it from the catalog.
            </Text>
            <View style={s.restConfirmActions}>
              <TouchableOpacity
                style={[s.restConfirmBtn, s.restConfirmCancel]}
                onPress={() => setRemoveEquipId(null)}
                activeOpacity={0.7}
              >
                <Text style={s.restConfirmCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.restConfirmBtn, s.restConfirmCommit]}
                onPress={() => {
                  if (!resources || !removeEquipId) { setRemoveEquipId(null); return; }
                  const next = (resources.equipment ?? []).filter((it) => it.id !== removeEquipId);
                  persistResources({ ...resources, equipment: next });
                  setRemoveEquipId(null);
                }}
                activeOpacity={0.85}
              >
                <Text style={s.restConfirmCommitText}>Remove</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Spend Hit Die confirm — same shape as the rest-confirm so the
          two interactions feel like one pattern. Surfaces the roll
          preview ("1d8 + 2 CON") and the remaining count so the player
          can see what they're about to commit. */}
      <Modal visible={spendHitDieOpen} transparent animationType="fade" onRequestClose={() => setSpendHitDieOpen(false)}>
        <Pressable style={s.modalBackdrop} onPress={() => setSpendHitDieOpen(false)}>
          <Pressable style={s.restConfirmCard} onPress={() => {}}>
            <View style={s.restConfirmHeader}>
              <MaterialCommunityIcons name="dice-d8-outline" size={20} color={colors.primary} />
              <Text style={s.modalTitle}>Spend a Hit Die?</Text>
            </View>
            {stats && resources && scores ? (() => {
              const remaining = resources.hitDiceRemaining ?? stats.level;
              const conMod = abilityMod(scores.constitution);
              return (
                <Text style={s.restConfirmBody}>
                  Roll 1d{stats.hitDie}{conMod >= 0 ? ` + ${conMod}` : ` − ${Math.abs(conMod)}`} (CON)
                  {' '}and add the result to your HP (capped at max).
                  {' '}You have {remaining}/{stats.level} hit dice remaining.
                </Text>
              );
            })() : null}
            <View style={s.restConfirmActions}>
              <TouchableOpacity
                style={[s.restConfirmBtn, s.restConfirmCancel]}
                onPress={() => setSpendHitDieOpen(false)}
                activeOpacity={0.7}
              >
                <Text style={s.restConfirmCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.restConfirmBtn, s.restConfirmCommit]}
                onPress={() => {
                  handleSpendHitDie();
                  setSpendHitDieOpen(false);
                }}
                activeOpacity={0.85}
              >
                <Text style={s.restConfirmCommitText}>Spend &amp; Roll</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Rest chooser — opened from the mobile hero card's Rest
          corner button. Two big options, each flows into the existing
          restConfirm modal so the player still sees what the rest will
          actually do before committing. */}
      <Modal visible={restChooserOpen} transparent animationType="fade" onRequestClose={() => setRestChooserOpen(false)}>
        <Pressable style={s.modalBackdrop} onPress={() => setRestChooserOpen(false)}>
          <Pressable style={s.restConfirmCard} onPress={() => {}}>
            <View style={s.restChooserHeader}>
              <MaterialCommunityIcons name="bed" size={20} color={colors.primary} />
              <Text style={s.restConfirmTitle}>Take a rest</Text>
            </View>
            <View style={s.restChooserRow}>
              <TouchableOpacity
                style={s.restChooserBtn}
                onPress={() => { setRestChooserOpen(false); setRestConfirm('short'); }}
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons name="campfire" size={20} color={colors.primary} />
                <Text style={s.restChooserBtnText}>Short Rest</Text>
                <Text style={s.restChooserBtnSub}>1 hour · spend hit dice</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.restChooserBtn}
                onPress={() => { setRestChooserOpen(false); setRestConfirm('long'); }}
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons name="bed" size={20} color={colors.primary} />
                <Text style={s.restChooserBtnText}>Long Rest</Text>
                <Text style={s.restChooserBtnSub}>8 hours · full reset</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Rest confirmation modal — gates short/long rest commits since
          the underlying writes touch a lot of state (HP, slots, hit
          dice, exhaustion) that's painful to undo. The body lists what
          the rest will reset so the player knows what they're agreeing
          to. */}
      <Modal visible={!!restConfirm} transparent animationType="fade" onRequestClose={() => setRestConfirm(null)}>
        <Pressable style={s.modalBackdrop} onPress={() => setRestConfirm(null)}>
          <Pressable style={s.restConfirmCard} onPress={() => {}}>
            <View style={s.restConfirmHeader}>
              <MaterialCommunityIcons
                name={restConfirm === 'long' ? 'bed' : 'campfire'}
                size={20}
                color={colors.primary}
              />
              <Text style={s.modalTitle}>
                Take a {restConfirm === 'long' ? 'Long' : 'Short'} Rest?
              </Text>
            </View>
            <Text style={s.restConfirmBody}>
              {restConfirm === 'long' ? (
                <>
                  Restores spell slots, class resources, hit dice, and HP to maximum.
                  Reduces exhaustion by 1 and clears death saves and concentration.
                </>
              ) : (
                <>
                  Restores class resources that recharge on a short rest. Doesn't
                  touch HP, spell slots, or hit dice — those stay where they are.
                </>
              )}
            </Text>
            <View style={s.restConfirmActions}>
              <TouchableOpacity
                style={[s.restConfirmBtn, s.restConfirmCancel]}
                onPress={() => setRestConfirm(null)}
                activeOpacity={0.7}
              >
                <Text style={s.restConfirmCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.restConfirmBtn, s.restConfirmCommit]}
                onPress={() => {
                  if (restConfirm === 'long') handleLongRest();
                  else if (restConfirm === 'short') handleShortRest();
                  setRestConfirm(null);
                }}
                activeOpacity={0.85}
              >
                <Text style={s.restConfirmCommitText}>
                  Take {restConfirm === 'long' ? 'Long' : 'Short'} Rest
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Catalog spell picker — wires the Spells tab's "MANAGE SPELLS"
          affordance. Class scoping uses resolved class names so a
          Wizard sees Wizard spells (and any homebrew spells the
          character's pack opt-in surfaces). */}
      {stats && resources ? (
        <SpellPickerModal
          visible={spellPickerOpen}
          onClose={() => setSpellPickerOpen(false)}
          classNames={[
            ...Object.values(classResultsByKey).map((c) => c.name),
            ...Object.values(subclassResultsByKey)
              .map((sc) => resolveSubclassCasting(sc)?.spellListClass)
              .filter((n): n is string => !!n),
          ]}
          existingKeys={spellbookIdSet}
          existingSpells={spellbook}
          spellLimits={{
            ...baseSpellLimits,
            ...(manualMode && stats?.cantripsKnownOverride != null
              ? { cantrips: stats.cantripsKnownOverride } : {}),
            ...(manualMode && stats?.preparedSpellsOverride != null
              ? { prepared: stats.preparedSpellsOverride } : {}),
          }}
          campaignId={character?.campaign_id ?? null}
          packIds={character?.pack_ids ?? []}
          srdVersion={stats.srdVersion}
          onPick={(spell) => {
            // Manage Spells writes to the spellbook (the master list).
            // Cantrips also auto-prepare since 5e cantrips are always
            // available; leveled spells flow to prepared via the
            // separate Prepare Spells modal.
            const currentBook = getSpellbook(resources);
            const nextBook = [...currentBook, spell];
            const isCantrip = spell.level === 0;
            const nextPrepared = isCantrip
              ? [...(resources.preparedSpells ?? []), spell]
              : (resources.preparedSpells ?? []);
            persistResources({
              ...resources,
              spellbook: nextBook,
              preparedSpells: nextPrepared,
            });
          }}
          onRemove={(spellId) => {
            // Removing from the spellbook also removes from prepared
            // (you can't have a prepared spell that isn't in your book).
            const currentBook = getSpellbook(resources);
            const nextBook = currentBook.filter((sp) => sp.id !== spellId);
            const nextPrepared = (resources.preparedSpells ?? []).filter((sp) => sp.id !== spellId);
            persistResources({
              ...resources,
              spellbook: nextBook,
              preparedSpells: nextPrepared,
            });
          }}
        />
      ) : null}

      {/* Catalog item picker — wires the Gear tab "+ Add" affordance.
          Pulls from ContentResolver's items merge so SRD weapons +
          armor + adventuring gear + magic items all appear, plus
          anything imported via the character's homebrew packs. */}
      {stats && resources ? (
        <ItemPickerModal
          visible={itemPickerOpen}
          onClose={() => setItemPickerOpen(false)}
          campaignId={character?.campaign_id ?? null}
          packIds={character?.pack_ids ?? []}
          srdVersion={stats.srdVersion}
          onPick={(item) => {
            // ID collisions across "add same item twice" — re-stamp on
            // the second instance so React keys stay unique and the
            // toggle/remove handlers don't double-fire.
            const existing = resources.equipment ?? [];
            const id = existing.some((e) => e.id === item.id)
              ? `${item.id}-${Date.now()}`
              : item.id;
            // Auto-equip newly-added weapons/armor/shields when the slot
            // is currently empty. The first sword/armor you pick up is
            // overwhelmingly the one you want active — making the user
            // hunt for a toggle to make AC respond was the playtest bug.
            const slotEquipped = item.slot === 'armor' || item.slot === 'shield'
              ? existing.some((e) => e.equipped && e.slot === item.slot)
              : false;
            const equipped = item.equipped
              || (!slotEquipped && (item.slot === 'armor' || item.slot === 'shield' || item.slot === 'weapon'));
            const next = [...existing, { ...item, id, equipped }];
            persistResources({ ...resources, equipment: next });
          }}
        />
      ) : null}

      {/* Equipment detail modal — lifted from GearTab so it can be
          triggered from the Combat tab's weapon rows too. */}
      {detailEquipment ? (
        <EquipmentDetailModal
          item={detailEquipment}
          onClose={() => setDetailEquipment(null)}
          onUpdateValue={isOwner
            ? (v: string) => handleUpdateItemValue(detailEquipment.id, v)
            : undefined}
          onUpdateQuantity={isOwner
            ? (q: number) => handleUpdateItemQuantity(detailEquipment.id, q)
            : undefined}
          canEdit={isOwner}
        />
      ) : null}

      {/* Portrait crop modal — web only */}
      {portraitCropUri ? (
        <ImageCropModal
          visible
          imageUri={portraitCropUri}
          aspect={[1, 1]}
          usageHint="Crop your character portrait."
          onCancel={() => setPortraitCropUri(null)}
          onConfirm={handlePortraitCropConfirm}
        />
      ) : null}

      {/* Add XP modal */}
      <Modal visible={xpAddMode} transparent animationType="fade">
        <Pressable style={s.modalBackdrop} onPress={() => setXpAddMode(false)}>
          <Pressable style={s.modalCard} onPress={() => {}}>
            <View style={s.quickHpHeader}>
              <MaterialCommunityIcons name="star-four-points-outline" size={24} color={colors.brand} />
              <Text style={s.modalTitle}>Add XP</Text>
            </View>
            <TextInput
              style={[s.quickHpInput, { borderColor: colors.brand }]}
              value={xpAddInput}
              onChangeText={setXpAddInput}
              keyboardType="number-pad"
              placeholder="Amount"
              placeholderTextColor={colors.textSecondary}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={applyAddXp}
            />
            <TouchableOpacity
              style={[s.fieldSaveBtn, { opacity: xpAddInput.trim() ? 1 : 0.4 }]}
              onPress={applyAddXp}
              disabled={!xpAddInput.trim()}
            >
              <Text style={s.fieldSaveBtnText}>Add XP</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Equipment edit modal */}
      <Modal visible={equipModal && !!editEquip} transparent animationType="fade">
        <Pressable style={s.modalBackdrop} onPress={() => setEquipModal(false)}>
          <Pressable style={[s.modalCard, { maxWidth: 440 }]} onPress={() => {}}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>
                {editEquip?.name ? 'Edit Item' : 'Add Item'}
              </Text>
              <TouchableOpacity onPress={() => setEquipModal(false)}>
                <MaterialCommunityIcons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {editEquip && (
              <ScrollView style={{ maxHeight: 400 }}>
                <Text style={s.eqLabel}>Name</Text>
                <TextInput
                  style={s.eqInput}
                  value={editEquip.name}
                  onChangeText={(t) => setEditEquip({ ...editEquip, name: t })}
                  placeholder="e.g. Longsword, Chain Mail"
                  placeholderTextColor={colors.textSecondary}
                  autoFocus
                />

                <Text style={s.eqLabel}>Type</Text>
                <View style={s.eqSlotRow}>
                  {(['weapon', 'armor', 'shield', 'other'] as EquipmentSlot[]).map((sl) => (
                    <TouchableOpacity
                      key={sl}
                      style={[s.eqSlotBtn, editEquip.slot === sl && s.eqSlotBtnActive]}
                      onPress={() => setEditEquip({ ...editEquip, slot: sl })}
                    >
                      <Text style={[s.eqSlotText, editEquip.slot === sl && s.eqSlotTextActive]}>
                        {capitalize(sl)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {editEquip.slot === 'weapon' && (
                  <>
                    <Text style={s.eqLabel}>Damage (e.g. 1d8+3 slashing)</Text>
                    <TextInput
                      style={s.eqInput}
                      value={editEquip.damage ?? ''}
                      onChangeText={(t) => setEditEquip({ ...editEquip, damage: t })}
                      placeholder="1d8+3 slashing"
                      placeholderTextColor={colors.textSecondary}
                    />
                    <Text style={s.eqLabel}>Attack Ability</Text>
                    <View style={s.eqSlotRow}>
                      {(['strength', 'dexterity', 'finesse'] as const).map((ab) => (
                        <TouchableOpacity
                          key={ab}
                          style={[s.eqSlotBtn, editEquip.attackAbility === ab && s.eqSlotBtnActive]}
                          onPress={() => setEditEquip({ ...editEquip, attackAbility: ab })}
                        >
                          <Text style={[s.eqSlotText, editEquip.attackAbility === ab && s.eqSlotTextActive]}>
                            {capitalize(ab)}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <Text style={s.eqLabel}>Range (ft)</Text>
                    <TextInput
                      style={s.eqInput}
                      value={editEquip.range ?? ''}
                      onChangeText={(t) => setEditEquip({ ...editEquip, range: t })}
                      placeholder="5 or 80/320"
                      placeholderTextColor={colors.textSecondary}
                    />
                    <Text style={s.eqLabel}>Properties (comma separated)</Text>
                    <TextInput
                      style={s.eqInput}
                      value={(editEquip.properties ?? []).join(', ')}
                      onChangeText={(t) => setEditEquip({ ...editEquip, properties: t.split(',').map((p) => p.trim()).filter(Boolean) })}
                      placeholder="finesse, light, versatile"
                      placeholderTextColor={colors.textSecondary}
                    />
                  </>
                )}

                {editEquip.slot === 'armor' && (
                  <>
                    <Text style={s.eqLabel}>Base AC</Text>
                    <TextInput
                      style={s.eqInput}
                      value={editEquip.acBase !== undefined ? String(editEquip.acBase) : ''}
                      onChangeText={(t) => setEditEquip({ ...editEquip, acBase: parseInt(t, 10) || undefined })}
                      keyboardType="number-pad"
                      placeholder="e.g. 14"
                      placeholderTextColor={colors.textSecondary}
                    />
                    <Text style={s.eqLabel}>Max DEX Bonus (blank = no cap)</Text>
                    <TextInput
                      style={s.eqInput}
                      value={editEquip.dexCap !== undefined && editEquip.dexCap !== null ? String(editEquip.dexCap) : ''}
                      onChangeText={(t) => {
                        const n = parseInt(t, 10);
                        setEditEquip({ ...editEquip, dexCap: isNaN(n) ? null : n });
                      }}
                      keyboardType="number-pad"
                      placeholder="e.g. 2 (or blank for full DEX)"
                      placeholderTextColor={colors.textSecondary}
                    />
                  </>
                )}

                {editEquip.slot === 'shield' && (
                  <>
                    <Text style={s.eqLabel}>AC Bonus</Text>
                    <TextInput
                      style={s.eqInput}
                      value={editEquip.acBonus !== undefined ? String(editEquip.acBonus) : '2'}
                      onChangeText={(t) => setEditEquip({ ...editEquip, acBonus: parseInt(t, 10) || 2 })}
                      keyboardType="number-pad"
                      placeholder="2"
                      placeholderTextColor={colors.textSecondary}
                    />
                  </>
                )}

                {/* Attunement toggles */}
                <TouchableOpacity
                  style={s.eqToggleRow}
                  onPress={() => setEditEquip({ ...editEquip, requiresAttunement: !editEquip.requiresAttunement, attuned: false })}
                >
                  <MaterialCommunityIcons
                    name={editEquip.requiresAttunement ? 'checkbox-marked-outline' : 'checkbox-blank-outline'}
                    size={20} color={colors.brand}
                  />
                  <Text style={s.eqToggleText}>Requires Attunement</Text>
                </TouchableOpacity>

                {editEquip.requiresAttunement && (() => {
                  const currentlyAttuned = equipment.filter((e) => e.attuned && e.id !== editEquip.id).length;
                  const canAttune = currentlyAttuned < 3 || editEquip.attuned;
                  return (
                    <TouchableOpacity
                      style={[s.eqToggleRow, !canAttune && { opacity: 0.4 }]}
                      onPress={() => {
                        if (!canAttune) return;
                        setEditEquip({ ...editEquip, attuned: !editEquip.attuned });
                      }}
                    >
                      <MaterialCommunityIcons
                        name={editEquip.attuned ? 'star-four-points' : 'star-four-points-outline'}
                        size={20} color={colors.brand}
                      />
                      <Text style={s.eqToggleText}>
                        {editEquip.attuned ? 'Attuned' : 'Attune'}{!canAttune ? ' (max 3)' : ''}
                      </Text>
                    </TouchableOpacity>
                  );
                })()}

                <Text style={s.eqLabel}>Notes</Text>
                <TextInput
                  style={s.eqInput}
                  value={editEquip.notes ?? ''}
                  onChangeText={(t) => setEditEquip({ ...editEquip, notes: t })}
                  placeholder="Optional notes"
                  placeholderTextColor={colors.textSecondary}
                />

                <TouchableOpacity
                  style={[s.fieldSaveBtn, { marginTop: spacing.md }]}
                  onPress={() => handleSaveEquipItem(editEquip)}
                >
                  <Text style={s.fieldSaveBtnText}>Save</Text>
                </TouchableOpacity>

                {equipment.some((e) => e.id === editEquip.id) && (
                  <TouchableOpacity
                    style={s.eqDeleteBtn}
                    onPress={() => handleRemoveEquipItem(editEquip.id)}
                  >
                    <Text style={s.eqDeleteText}>Remove Item</Text>
                  </TouchableOpacity>
                )}
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Quick damage/heal modal */}
      <Modal visible={!!hpQuickMode} transparent animationType="fade">
        <Pressable style={s.modalBackdrop} onPress={() => setHpQuickMode(null)}>
          <Pressable style={s.modalCard} onPress={() => {}}>
            <View style={s.quickHpHeader}>
              <MaterialCommunityIcons
                name={hpQuickMode === 'damage' ? 'sword' : 'heart-plus'}
                size={24}
                color={hpQuickMode === 'damage' ? colors.hpDanger : colors.hpHealthy}
              />
              <Text style={s.modalTitle}>
                {hpQuickMode === 'damage' ? 'Deal Damage' : 'Heal'}
              </Text>
            </View>
            <TextInput
              style={[s.quickHpInput, {
                borderColor: hpQuickMode === 'damage' ? colors.hpDanger : colors.hpHealthy,
              }]}
              value={hpQuickInput}
              onChangeText={setHpQuickInput}
              keyboardType="number-pad"
              placeholder="Amount"
              placeholderTextColor={colors.textSecondary}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={applyQuickHp}
            />
            {hpQuickMode === 'damage' ? (
              <TouchableOpacity
                style={[s.fieldSaveBtn, { backgroundColor: colors.hpDanger, opacity: hpQuickInput.trim() ? 1 : 0.4 }]}
                onPress={applyQuickHp}
                disabled={!hpQuickInput.trim()}
              >
                <Text style={s.fieldSaveBtnText}>Apply Damage</Text>
              </TouchableOpacity>
            ) : (
              <View style={s.healBtnRow}>
                <TouchableOpacity
                  style={[s.healBtn, { backgroundColor: colors.hpHealthy, opacity: hpQuickInput.trim() ? 1 : 0.4 }]}
                  onPress={applyQuickHp}
                  disabled={!hpQuickInput.trim()}
                >
                  <Text style={s.fieldSaveBtnText}>Apply Healing</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.healBtn, { backgroundColor: '#3B82F6', opacity: hpQuickInput.trim() ? 1 : 0.4 }]}
                  onPress={applyTempHp}
                  disabled={!hpQuickInput.trim()}
                >
                  <Text style={s.fieldSaveBtnText}>Apply Temp HP</Text>
                </TouchableOpacity>
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const CARD = {
  backgroundColor: colors.surface,
  borderColor: colors.border,
  borderWidth: 1,
  borderRadius: 14,
  padding: spacing.md,
  overflow: 'hidden' as const,
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceCanvas },
  scroll: { flex: 1 },
  container: { padding: spacing.lg, paddingBottom: 48 },
  loadingContainer: {
    flex: 1, backgroundColor: colors.surfaceCanvas,
    justifyContent: 'center', alignItems: 'center',
  },

  // ── HUD layout ──────────────────────────────────────────────────────────────
  // Desktop AC shield cell — masked metallic shield containing the AC
  // value, label sits to the right. Matches the party-card / mobile-
  // hero shield treatment.
  deskAcCell: { gap: 10 },
  deskAcShieldWrap: {
    width: 44, height: 48,
    alignItems: 'center', justifyContent: 'center',
  },
  deskAcShieldNum: {
    position: 'absolute', top: 14, left: 0, right: 0,
    textAlign: 'center',
    fontFamily: fonts.headline, fontSize: 16, fontWeight: '800',
    color: colors.onPrimary,
  },
  deskAcLabel: {
    fontSize: 11, fontFamily: fonts.label, fontWeight: '600',
    letterSpacing: 0.8, color: colors.onSurfaceVariant,
    textTransform: 'uppercase',
  },

  // Mobile utility bar — Home + Campaign on the left; Lv↑ / Log /
  // Settings on the right. Sits above the hero card.
  utilityBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 10, paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainerLowest,
  },
  /** Chunky Home button — icon + label, sized up from the original
   *  back chevron so it feels like a primary surface action and reads
   *  as "go all the way home" rather than "go back one step". */
  homeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    paddingHorizontal: 8, paddingVertical: 5,
    borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainer,
  },
  homeBtnLabel: {
    fontSize: 12, fontFamily: fonts.label, fontWeight: '700',
    color: colors.onSurfaceVariant, letterSpacing: 0.3,
    marginRight: 2,
  },
  /** Campaign chip next to Home — castle icon + campaign name, taps
   *  to the linked campaign hub. Only rendered when the character is
   *  on a campaign. */
  campaignChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 5,
    borderRadius: radius.lg,
    borderWidth: 1, borderColor: `${colors.primary}55`,
    backgroundColor: `${colors.primary}14`,
    maxWidth: 160,
  },
  campaignChipLabel: {
    fontSize: 11, fontFamily: fonts.label, fontWeight: '700',
    color: colors.primary, letterSpacing: 0.3,
  },
  backBtn: { padding: 4 },
  // 3:4 card frame. Width fixed; height = width × 4/3. Square corners
  // would scream "iPhone Photos thumbnail", so we keep a small radius
  // for the rounded-card look used elsewhere on the sheet.
  chromePortrait: {
    width: 42, height: 56, borderRadius: 4,
    backgroundColor: colors.surfaceContainerHigh,
    borderWidth: 1, borderColor: colors.outlineVariant,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0,
  },
  chromePortraitImg: { width: 42, height: 56, borderRadius: 4 },
  chromeIdentity: { flex: 1, minWidth: 0 },
  chromeName: {
    fontSize: 15, fontFamily: fonts.headline, fontWeight: '700',
    color: colors.onSurface, letterSpacing: -0.2,
  },
  chromeNameInput: {
    fontSize: 15, fontFamily: fonts.headline, fontWeight: '700',
    color: colors.primary, borderBottomWidth: 1, borderBottomColor: colors.primary,
    paddingVertical: 1,
  },
  chromeSub: {
    fontSize: 11, fontFamily: fonts.label, color: colors.outline,
    marginTop: 1, textTransform: 'capitalize',
  },
  inspirationBtn: {
    width: 30, height: 30, borderRadius: 15,
    borderWidth: 1, borderColor: colors.outlineVariant,
    alignItems: 'center', justifyContent: 'center',
  },
  inspirationBtnActive: { borderColor: colors.gm, backgroundColor: colors.gmContainer },
  settingsIconBtn: { padding: 4 },

  // Mobile hero card — chassis lifted from the campaign PartyMemberCard
  // and adapted for self-view (all taps actionable for the owner).
  heroCard: {
    flexDirection: 'row', alignItems: 'stretch',
    gap: spacing.sm + 4,
    paddingTop: spacing.sm + 4, paddingBottom: spacing.sm + 4,
    paddingLeft: spacing.sm + 4, paddingRight: spacing.sm + 4,
    marginHorizontal: 10, marginTop: 10,
    borderRadius: 12,
    borderWidth: 1, borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainer,
    position: 'relative', overflow: 'hidden',
  },
  heroCardUnconscious: {
    borderColor: 'rgba(226,75,74,0.4)',
    backgroundColor: 'rgba(226,75,74,0.06)',
  },
  /** 3:4 portrait that fills the card's full vertical space. */
  /** Explicit 96×128 (3:4) instead of `aspectRatio + alignSelf:stretch`
   *  — that combo collapses the portrait to ~0 width on RN Web when
   *  the parent's height is content-driven (no portrait visible at all
   *  in playtest). Fixed dimensions are predictable; card height becomes
   *  max(portrait, body) which still reads well across content states. */
  heroPortrait: {
    width: 96, height: 128,
    borderRadius: 6,
    borderWidth: 1, borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainerLow,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden', flexShrink: 0,
  },
  heroPortraitImg: { width: 96, height: 128 },
  heroBody: { flex: 1, minWidth: 0, gap: 6 },
  /** First row of the body — AC shield inline at left, name/subtitle
   *  block flexing to fill the remainder. Right padding clears the
   *  absolute corner-buttons (INSP + REST) anchored top-right. */
  heroTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  /** Inline AC shield wrapper — used inside heroTitleRow. */
  heroAcInline: {
    width: 36, height: 40,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  heroName: {
    fontSize: 15, fontFamily: fonts.headline, fontWeight: '700',
    color: colors.onSurface, letterSpacing: -0.1,
  },
  heroNameInput: {
    fontSize: 15, fontFamily: fonts.headline, fontWeight: '700',
    color: colors.primary, borderBottomWidth: 1, borderBottomColor: colors.primary,
    paddingVertical: 1,
  },
  /** Right padding on the title row so name + sub don't run under the
   *  absolute-positioned INSP / REST corner-button cluster. */
  heroNamePad: { paddingRight: 70 },
  heroSub: {
    fontSize: 11, fontFamily: fonts.body, color: colors.outline, letterSpacing: 0.2,
  },

  /** Corner button cluster — top-right of the card, two small icon
   *  toggles (Inspiration + Rest). Rest opens a chooser modal that
   *  flows into the existing restConfirm. */
  heroCornerBtns: {
    position: 'absolute', top: 8, right: 8,
    flexDirection: 'row', gap: 4,
    zIndex: 1,
  },
  heroCornerBtn: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainerLow,
  },
  heroCornerBtnInspActive: { borderColor: colors.gm, backgroundColor: `${colors.gm}22` },
  heroAcNum: {
    position: 'absolute', top: 12, left: 0, right: 0,
    textAlign: 'center',
    fontFamily: fonts.headline, fontSize: 13, fontWeight: '800',
    // Dark engraved-style text against the metallic shield fill —
    // onPrimary is the Noir palette's "deep ink" purple, ties the
    // shield to the rest of the primary-accented sheet.
    color: colors.onPrimary,
  },

  // HP block — tap to open quick damage/heal modal; long-press to heal.
  heroHpBlock: { marginTop: 2 },
  heroHpRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  heroHpNumWrap: { flexDirection: 'row', alignItems: 'baseline' },
  heroHpNum: {
    fontSize: 20, fontFamily: fonts.headline, fontWeight: '800',
    color: colors.onSurface, lineHeight: 22,
  },
  heroHpMax: { fontSize: 12, color: colors.outline },
  heroHpState: {
    marginLeft: 'auto',
    fontSize: 9, fontFamily: fonts.label, fontWeight: '700',
    letterSpacing: 0.8, color: colors.outline,
  },
  heroTempPill: {
    paddingHorizontal: 6, paddingVertical: 1,
    borderRadius: 999,
    borderWidth: 1, borderColor: 'rgba(173,198,255,0.3)',
    backgroundColor: 'rgba(173,198,255,0.12)',
  },
  heroTempPillText: {
    fontFamily: fonts.headline, fontSize: 10, fontWeight: '700',
    color: colors.secondary, letterSpacing: 0.4,
  },
  heroHpTrack: {
    height: 6, borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden', marginTop: 6,
    flexDirection: 'row',
  },
  heroHpFill: { height: '100%', borderRadius: 999 },
  heroHpTempFill: { height: '100%', backgroundColor: colors.secondary },

  // Passive senses row — Eye / Magnify / Brain icons + label + value.
  heroStatsRow: { flexDirection: 'row', gap: 6, marginTop: 4 },
  heroStatCell: {
    flex: 1, alignItems: 'center',
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: colors.surfaceContainerLow,
    borderWidth: 1, borderColor: colors.outlineVariant,
  },
  heroStatCellTop: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  heroStatCellLabel: {
    fontSize: 8, fontFamily: fonts.label, fontWeight: '600',
    letterSpacing: 1.2, color: colors.outline, textTransform: 'uppercase',
  },
  heroStatCellValue: {
    fontSize: 13, fontFamily: fonts.headline, fontWeight: '700',
    color: colors.onSurface, marginTop: 1,
  },

  // Status chip row — inspiration, concentration, conditions, exhaustion.
  heroChipsRow: { flexDirection: 'row', gap: 4, flexWrap: 'wrap', marginTop: 4, minHeight: 18 },
  heroChip: {
    paddingHorizontal: 7, paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1, borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainerLow,
  },
  heroChipText: {
    fontFamily: fonts.label, fontSize: 9, fontWeight: '700',
    letterSpacing: 0.6, color: colors.onSurfaceVariant,
  },
  heroChipInsp: { borderColor: 'rgba(230,162,85,0.35)', backgroundColor: 'rgba(230,162,85,0.12)' },
  heroChipTextInsp: { color: colors.gm },
  heroChipConc: { borderColor: 'rgba(211,187,255,0.3)', backgroundColor: 'rgba(211,187,255,0.1)' },
  heroChipTextConc: { color: colors.primary },
  heroChipCond: { borderColor: 'rgba(239,159,39,0.3)', backgroundColor: 'rgba(239,159,39,0.1)' },
  heroChipTextCond: { color: colors.hpWarning },

  // Supplementary strip under the hero card — INIT/SPD/PROF/HD inline +
  // Short/Long rest buttons. Reads as one continuous row.
  heroSuppRow: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainerLowest,
  },
  suppStat: {
    flex: 1, alignItems: 'center', gap: 1,
  },
  suppStatLabel: {
    fontSize: 8, fontFamily: fonts.label, fontWeight: '700',
    letterSpacing: 1, color: colors.outline, textTransform: 'uppercase',
  },
  suppStatValue: {
    fontSize: 13, fontFamily: fonts.headline, fontWeight: '700',
    color: colors.onSurface,
  },
  suppRestBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 8, paddingVertical: 5,
    borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainer,
  },
  suppRestText: {
    fontSize: 10, fontFamily: fonts.label, fontWeight: '700',
    letterSpacing: 0.5, color: colors.onSurfaceVariant,
  },

  // ── Tab bar ──────────────────────────────────────────────────────────────────
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainerLowest,
    paddingBottom: Platform.OS === 'ios' ? 20 : 6,
  },
  tabBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingTop: 8, paddingBottom: 4, gap: 3,
  },
  tabBtnActive: {},
  tabLabel: {
    fontSize: 9, fontFamily: fonts.label, fontWeight: '700',
    letterSpacing: 0.8, textTransform: 'uppercase', color: colors.outline,
  },
  tabLabelActive: { color: colors.primary },

  // ── Desktop two-column layout ────────────────────────────────────────────
  deskShell: {
    flex: 1, flexDirection: 'row',
  },

  // Left rail — now a vertical ScrollView so long content (lots of
  // skill rows, conditions, plus the campaign card) can scroll
  // independently of the main pane. ScrollView on React Native Web
  // doesn't honor `width` the same way View does (the outer becomes a
  // flex item that can grow). Lock the width with flexBasis +
  // flexGrow/flexShrink so the rail stays exactly 260px regardless of
  // the parent's flex direction.
  /** Left rail container — width + flex constraints live here so the
   *  LinearGradient wrapper sizes correctly. Background is painted by
   *  the gradient (primary-tinted top-left fading to surface) instead
   *  of a flat fill. */
  deskRail: {
    width: 260,
    flexBasis: 260,
    flexGrow: 0,
    flexShrink: 0,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.outlineVariant,
  },
  /** Inner ScrollView — transparent so the LinearGradient wrapper
   *  shows through. flex: 1 to fill the gradient container. */
  deskRailInner: { flex: 1, backgroundColor: 'transparent' },
  deskRailContent: {
    flexDirection: 'column',
    paddingBottom: 24,
  },
  deskHeader: {
    paddingTop: 16, paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.outlineVariant,
  },
  deskBackBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 14, paddingBottom: 12,
  },
  deskBackLabel: {
    fontSize: 12, fontFamily: fonts.label, fontWeight: '600',
    color: colors.outline, letterSpacing: 0.3,
  },
  deskIdentityRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: 14, gap: 10,
  },
  // 3:4 card frame on the desktop header (75 × 100). The
  // deskIdentityRow uses `alignItems: 'flex-start'` so the taller
  // portrait sits flush with the top of the name/level block.
  deskPortrait: {
    width: 75, height: 100, borderRadius: 6, flexShrink: 0,
    backgroundColor: colors.surfaceContainerHigh,
    borderWidth: 1, borderColor: colors.outlineVariant,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  deskPortraitImg: { width: 75, height: 100, borderRadius: 6 },
  deskNameBlock: { flex: 1, minWidth: 0, paddingTop: 2 },
  deskName: {
    fontSize: 14, fontFamily: fonts.headline, fontWeight: '700',
    color: colors.onSurface, letterSpacing: -0.2, lineHeight: 18,
  },
  deskNameInput: {
    fontSize: 14, fontFamily: fonts.headline, fontWeight: '700',
    color: colors.primary, borderBottomWidth: 1, borderBottomColor: colors.primary,
    paddingVertical: 1,
  },
  deskSub: {
    fontSize: 11, fontFamily: fonts.label, color: colors.outline,
    marginTop: 2, textTransform: 'capitalize',
  },
  deskLevel: {
    fontSize: 10, fontFamily: fonts.label, fontWeight: '600',
    color: colors.outline, marginTop: 2, letterSpacing: 0.3,
  },
  deskHeaderIcons: {
    flexDirection: 'column', gap: 6, paddingTop: 2,
  },
  deskIconBtn: {
    width: 26, height: 26, borderRadius: 13,
    borderWidth: 1, borderColor: colors.outlineVariant,
    alignItems: 'center', justifyContent: 'center',
  },
  deskIconBtnActive: { borderColor: colors.gm, backgroundColor: colors.gmContainer },

  // Stats block
  deskStats: {
    paddingHorizontal: 14, paddingTop: 10, paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.outlineVariant,
    gap: 4,
  },
  deskHpBox: {
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.outlineVariant,
    paddingBottom: 12,
    gap: 6,
  },
  deskHpSectionLabel: {
    fontSize: 8, fontFamily: fonts.label, fontWeight: '700',
    letterSpacing: 1.2, textTransform: 'uppercase', color: colors.outline,
  },
  deskHpRow: { gap: 6 },
  deskHpNums: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  deskHpCenterRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  deskHpNumsCenter: {
    flexDirection: 'row', alignItems: 'baseline', gap: 2, paddingHorizontal: 10, paddingVertical: 4,
  },
  deskHpActionBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surfaceContainerLowest,
    borderWidth: 1, borderColor: colors.outlineVariant,
  },
  deskHpCurrent: {
    fontSize: 28, fontFamily: fonts.headline, fontWeight: '800', lineHeight: 30,
  },
  deskHpSep: { fontSize: 14, color: colors.outline, marginHorizontal: 2 },
  deskHpMax: { fontSize: 14, fontFamily: fonts.headline, fontWeight: '600', color: colors.outline },
  deskHpTemp: { fontSize: 11, fontFamily: fonts.label, fontWeight: '700', color: '#3B82F6', marginLeft: 4 },
  deskHpTrack: {
    height: 5, borderRadius: 3,
    backgroundColor: colors.outlineVariant, flexDirection: 'row', overflow: 'hidden',
  },
  deskHpFill: { height: '100%', borderRadius: 3 },
  deskHpTempFill: { height: '100%', backgroundColor: '#3B82F6' },
  deskHpMeta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  deskHpTempLabel: {
    fontSize: 10, fontFamily: fonts.label, fontWeight: '700', color: '#3B82F6',
  },
  deskHpInspired: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
  },
  deskHpInspiredLabel: {
    fontSize: 10, fontFamily: fonts.label, fontWeight: '700', color: colors.gm,
  },
  // Inline death saves (shown below HP when hpCurrent === 0)
  deskDeathBox: {
    paddingVertical: 8, gap: 5,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.outlineVariant,
  },
  deskDeathLabel: {
    fontSize: 8, fontFamily: fonts.label, fontWeight: '700',
    letterSpacing: 1.2, textTransform: 'uppercase', color: colors.outline,
  },
  deskDeathPipRows: { gap: 5 },
  deskDeathPipRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  deskDeathPipLabel: {
    fontSize: 8, fontFamily: fonts.label, fontWeight: '800', letterSpacing: 1, width: 10,
  },
  deskDeathPip: {
    width: 13, height: 13, borderRadius: 7,
    borderWidth: 1.5, borderColor: colors.outlineVariant,
  },
  deskDeathPipSuccess: { backgroundColor: colors.hpHealthy, borderColor: colors.hpHealthy },
  deskDeathPipFailure: { backgroundColor: colors.hpDanger, borderColor: colors.hpDanger },

  deskStatGrid: { gap: 6 },
  deskConditions: { gap: 6, marginBottom: 10 },
  deskStatRow: { flexDirection: 'row', gap: 6 },

  // Horizontal tab bar (top of right pane)
  deskTabBar: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainerLowest,
  },
  deskTabBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 22, paddingVertical: 18,
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  deskTabBtnActive: {
    borderBottomColor: colors.primary,
  },
  deskTabLabel: {
    fontSize: 14, fontFamily: fonts.body, fontWeight: '600',
    color: colors.outline,
  },
  deskTabLabelActive: { color: colors.primary },

  // Right content pane
  deskContent: {
    flex: 1,
    backgroundColor: colors.surfaceCanvas,
  },
  deskPanes: { flex: 1, flexDirection: 'row' },
  deskPaneDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: colors.outlineVariant,
  },
  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: spacing.md,
  },
  backText: { color: colors.brand, fontSize: 14 },
  settingsBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  settingsBtnText: {
    fontSize: 13, color: colors.textSecondary,
  },

  // (Legacy "Hero" card styles from an earlier sheet design were
  // removed here — none of them were referenced. The mobile hero card
  // above owns the `hero*` namespace now.)

  // Grid
  grid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md,
  },
  dragHandle: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 6, paddingHorizontal: spacing.md,
    marginBottom: spacing.xs,
    backgroundColor: colors.background, borderRadius: 8,
    borderWidth: 1, borderColor: colors.border,
  },
  dragHandleLabel: {
    fontSize: 11, color: colors.textSecondary, fontStyle: 'italic',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  dragArrow: {
    padding: 2,
  },

  fourColRow: {
    flexDirection: 'row', gap: spacing.md, width: '100%',
  },
  // Generic card
  card: { ...CARD, minWidth: 200, flex: 1, flexBasis: 200 },
  cardWide: { flexBasis: '100%' },
  profTrainingGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg, marginTop: spacing.xs,
  },
  profTrainingCol: {
    flex: 1, minWidth: 140,
  },
  profTrainingHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    marginBottom: spacing.xs,
    paddingBottom: 4, borderBottomColor: colors.border, borderBottomWidth: 1,
  },
  profTrainingLabel: {
    fontSize: 11, fontWeight: '700', color: colors.brand,
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  profTrainingItem: {
    fontSize: 13, color: colors.textPrimary, paddingVertical: 2,
  },
  profTrainingEmpty: {
    fontSize: 12, color: colors.textSecondary, fontStyle: 'italic',
  },
  attunementSlot: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: 6, borderBottomColor: colors.border, borderBottomWidth: 1,
  },
  attunementItemName: { fontSize: 13, color: colors.textPrimary },
  attunementEmpty: { fontSize: 12, color: colors.border, fontStyle: 'italic' },
  eqToggleRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: 10, borderBottomColor: colors.border, borderBottomWidth: 1,
    marginBottom: spacing.sm,
  },
  eqToggleText: { fontSize: 14, color: colors.textPrimary },
  coinRow: {
    flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm,
  },
  coinCell: {
    flex: 1, alignItems: 'center',
  },
  coinArrow: {
    padding: 2,
  },
  coinValueBox: {
    backgroundColor: colors.background, borderColor: colors.border,
    borderWidth: 1, borderRadius: 8,
    width: '100%', paddingVertical: 8, alignItems: 'center',
  },
  coinValue: {
    fontSize: 18, fontWeight: '700', color: colors.textPrimary,
  },
  coinLabel: {
    fontSize: 10, fontWeight: '600', color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4,
  },
  scratchpadInput: {
    backgroundColor: colors.background, borderColor: colors.border,
    borderWidth: 1, borderRadius: 8, color: colors.textPrimary,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14,
    minHeight: 120, lineHeight: 20,
  },
  cardLabel: {
    fontSize: 11, fontWeight: '700', color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10,
  },

  // HP card
  hpCard: {
    ...CARD, minWidth: 200, flex: 1, flexBasis: 200, alignItems: 'center',
  },
  hpRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', width: '100%' },
  hpBox: {
    borderWidth: 2, borderRadius: 10,
    flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center',
    paddingHorizontal: 12, paddingVertical: 2,
  },
  hpTempInline: {
    fontSize: 20, fontWeight: '700', color: '#3B82F6', marginLeft: 2,
  },
  hpValue: { fontSize: 40, fontWeight: '700', lineHeight: 44 },
  hpSep: { fontSize: 20, color: colors.textSecondary, marginHorizontal: 6 },
  hpMax: { fontSize: 20, color: colors.textSecondary },
  hpBarTrack: {
    width: '100%', height: 10, backgroundColor: colors.border,
    borderRadius: 5, marginTop: spacing.sm, overflow: 'hidden',
    flexDirection: 'row',
  },
  hpBarFill: { height: 10, borderRadius: 5 },
  hpBarTemp: { height: 10, backgroundColor: '#3B82F6' },
  hpQuickBtn: {
    width: 44, height: 44,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 8,
    borderColor: colors.border,
  },
  hpQuickBtnLeft: { marginRight: 'auto' },
  tapHint: { fontSize: 12, color: colors.brand, marginTop: spacing.sm, fontWeight: '600' },

  // Quick HP modal
  quickHpHeader: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md,
  },
  healBtnRow: {
    flexDirection: 'row', gap: spacing.sm,
  },
  healBtn: {
    flex: 1, borderRadius: 8, paddingVertical: 12, alignItems: 'center',
  },
  quickHpInput: {
    backgroundColor: colors.background, borderWidth: 2,
    borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 28, fontWeight: '700', color: colors.textPrimary,
    textAlign: 'center', marginBottom: spacing.md,
  },


  // Combat stats (inside HP card)
  combatDivider: {
    height: 1, backgroundColor: colors.border,
    marginVertical: spacing.md, width: '100%',
  },
  combatGrid: {
    flexDirection: 'row', gap: spacing.sm, width: '100%',
    marginTop: spacing.sm,
  },
  combatStat: {
    alignItems: 'center', justifyContent: 'center', flex: 1,
    backgroundColor: colors.background, borderRadius: 10,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.sm,
    position: 'relative', overflow: 'hidden', gap: 4,
  },
  combatBgIcon: {
    position: 'absolute',
  },
  shieldToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    marginTop: spacing.sm, paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 6, borderWidth: 1, borderColor: colors.border,
  },
  shieldToggleActive: {
    borderColor: colors.brand, backgroundColor: colors.brand + '22',
  },
  shieldToggleText: {
    fontSize: 11, fontWeight: '600', color: colors.textSecondary,
  },
  combatValue: { fontSize: 28, fontWeight: '700', color: colors.textPrimary },
  combatLabel: {
    fontSize: 11, fontWeight: '600', color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4,
  },

  // Ability scores
  movGrid: {
    flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm,
  },
  movStat: {
    flex: 1, backgroundColor: colors.background, borderRadius: 10,
    paddingVertical: spacing.lg, alignItems: 'center',
  },
  abilityQuickStats: {
    flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg,
  },
  abilityQuickStat: {
    flex: 1, backgroundColor: colors.background, borderRadius: 10,
    paddingVertical: spacing.lg, alignItems: 'center',
  },
  abilityQuickValue: {
    fontSize: 28, fontWeight: '700', color: colors.textPrimary,
  },
  abilityQuickLabel: {
    fontSize: 11, fontWeight: '600', color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4,
    textAlign: 'center', lineHeight: 16,
  },
  abilityHeaderRow: {
    flexDirection: 'row', alignItems: 'center', paddingBottom: 6,
    borderBottomColor: colors.border, borderBottomWidth: 1, marginBottom: 0,
  },
  abilityHeaderText: {
    fontSize: 10, fontWeight: '600', color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  abilityRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 8,
    borderBottomColor: colors.border, borderBottomWidth: 1,
  },
  abilityLabel: {
    fontSize: 13, fontWeight: '700', color: colors.textSecondary, width: 36,
  },
  abilityScore: {
    fontSize: 17, fontWeight: '700', color: colors.brand, width: 32, textAlign: 'center',
  },
  abilityModCol: {
    fontSize: 14, fontWeight: '600', color: colors.textPrimary,
    width: 36, textAlign: 'center',
  },
  abilityBody: {
    position: 'relative',
  },
  saveSpacer: { flex: 1 },
  saveCell: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    width: 54, gap: 6,
  },
  saveModText: {
    fontSize: 14, fontWeight: '700', color: colors.textPrimary,
  },
  profDotSmall: {
    width: 7, height: 7, borderRadius: 4,
    borderWidth: 1, borderColor: colors.border,
  },

  // Skills / saves
  skillRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 3 },
  profDot: {
    width: 8, height: 8, borderRadius: 4,
    borderWidth: 1, borderColor: colors.border, marginRight: 8,
  },
  profDotFilled: { backgroundColor: colors.brand, borderColor: colors.brand },
  skillName: { fontSize: 13, color: colors.textSecondary, flex: 1 },
  skillAbility: { fontSize: 11, color: colors.textSecondary, marginRight: 8 },
  skillModText: {
    fontSize: 13, fontWeight: '700', color: colors.textPrimary,
    minWidth: 28, textAlign: 'right',
  },

  // Death saves
  deathSavesRow: { flexDirection: 'row', gap: 24, justifyContent: 'center' },
  deathSaveSide: { alignItems: 'center', gap: 8 },
  deathSaveLabel: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
  savePips: { flexDirection: 'row', gap: 8 },
  savePip: {
    width: 24, height: 24, borderRadius: 12,
    borderWidth: 2, borderColor: colors.border,
  },
  savePipSuccess: { backgroundColor: colors.hpHealthy, borderColor: colors.hpHealthy },
  savePipFailure: { backgroundColor: colors.hpDanger, borderColor: colors.hpDanger },
  stabilizedHint: { fontSize: 12, textAlign: 'center', marginTop: 10, color: colors.hpHealthy },

  concentrationRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6,
  },
  concentrationSpell: {
    flex: 1, fontSize: 14, fontWeight: '600', color: colors.textPrimary,
  },
  concentrationClearBtn: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 6,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  concentrationClearText: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
  concentrationSetBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6,
    alignSelf: 'flex-start',
  },
  concentrationSetText: { fontSize: 12, color: colors.textSecondary, fontStyle: 'italic' },


  // Level grid
  lvlGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm,
  },
  lvlXpBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.background, borderRadius: 10,
    paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  lvlSection: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    flexShrink: 0,
  },
  lvlLabel: {
    fontSize: 11, fontWeight: '600', color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  lvlValue: {
    fontSize: 20, fontWeight: '700', color: colors.textPrimary,
  },
  lvlDivider: {
    width: 1, height: 24, backgroundColor: colors.border,
    marginHorizontal: spacing.sm,
  },
  xpSection: {
    flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1,
  },
  xpValue: {
    fontSize: 20, fontWeight: '700', color: colors.textPrimary, flexShrink: 1,
  },
  xpAddBtn: {
    width: 26, height: 26, borderRadius: 13,
    borderWidth: 1, borderColor: colors.brand,
    alignItems: 'center', justifyContent: 'center',
  },
  lvlStat: {
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.background, borderRadius: 10,
    paddingVertical: spacing.lg, position: 'relative', overflow: 'hidden',
    flex: 1, minWidth: '45%',
  },

  // Attack table
  atkTableHeader: {
    flexDirection: 'row', borderBottomColor: colors.border, borderBottomWidth: 1,
    paddingBottom: 6, marginBottom: 2,
  },
  atkHeaderText: {
    fontSize: 10, fontWeight: '600', color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  atkTableRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 8, borderBottomColor: colors.border, borderBottomWidth: 1,
  },
  atkCellName: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  atkCellText: { fontSize: 13, color: colors.textPrimary },
  atkCellNotes: { fontSize: 11, color: colors.textSecondary },

  // Equipment
  equipHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  equipEmpty: { fontSize: 13, color: colors.textSecondary, marginTop: spacing.sm },
  equipSubLabel: {
    fontSize: 10, fontWeight: '700', color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.8, marginTop: spacing.xs, marginBottom: 4,
  },
  equipRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 8, borderBottomColor: colors.border, borderBottomWidth: 1,
  },
  equipRowDim: { opacity: 0.45 },
  equipToggle: { marginRight: spacing.sm },
  equipInfo: { flex: 1 },
  equipName: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  equipDetail: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  equipProps: { fontSize: 11, color: colors.textSecondary, fontStyle: 'italic' },

  // Equipment modal
  eqLabel: {
    fontSize: 11, fontWeight: '600', color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5, marginTop: spacing.md, marginBottom: spacing.xs,
  },
  eqInput: {
    backgroundColor: colors.background, borderColor: colors.border,
    borderWidth: 1, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    color: colors.textPrimary, fontSize: 15,
  },
  eqSlotRow: { flexDirection: 'row', gap: spacing.sm },
  eqSlotBtn: {
    flex: 1, paddingVertical: 8, borderRadius: 8,
    borderWidth: 1, borderColor: colors.border, alignItems: 'center',
  },
  eqSlotBtnActive: {
    borderColor: colors.brand, backgroundColor: colors.brand + '22',
  },
  eqSlotText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  eqSlotTextActive: { color: colors.brand },
  eqDeleteBtn: {
    alignItems: 'center', paddingVertical: spacing.md,
  },
  eqDeleteText: { fontSize: 14, color: colors.hpDanger, fontWeight: '600' },

  // Features
  featureRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 8, borderBottomColor: colors.border, borderBottomWidth: 1,
  },
  featureInfo: { flex: 1 },
  featureName: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  featureDesc: { fontSize: 12, color: colors.textSecondary, marginTop: 2, lineHeight: 17 },
  featureUses: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: spacing.sm,
  },
  featureUsesText: { fontSize: 14, fontWeight: '700', color: colors.textPrimary, minWidth: 28, textAlign: 'center' },

  // Attribution
  attribution: {
    fontSize: 11, color: colors.textSecondary,
    textAlign: 'center', lineHeight: 16, marginTop: spacing.md,
  },

  // Modals
  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center', alignItems: 'center',
  },
  modalCard: {
    backgroundColor: colors.surface, borderRadius: 14,
    borderColor: colors.border, borderWidth: 1,
    width: '90%', maxWidth: 400, padding: spacing.lg,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: spacing.lg,
  },
  modalTitle: {
    fontSize: 18, fontWeight: '700', color: colors.textPrimary,
    marginBottom: spacing.md,
  },

  // Rest chooser — shown when the player taps the corner Rest button
  // on the mobile hero card. Two big options flow into the existing
  // restConfirm modal (the chooser commits the rest TYPE; the confirm
  // commits the rest itself).
  restChooserHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginBottom: spacing.md,
  },
  restConfirmTitle: {
    fontSize: 15, fontFamily: fonts.headline, fontWeight: '700',
    color: colors.onSurface,
  },
  restChooserRow: { flexDirection: 'row', gap: 10 },
  restChooserBtn: {
    flex: 1,
    paddingVertical: spacing.md, paddingHorizontal: spacing.sm,
    borderRadius: 10,
    borderWidth: 1, borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainerLow,
    alignItems: 'center', gap: 4,
  },
  restChooserBtnText: {
    fontSize: 13, fontFamily: fonts.headline, fontWeight: '700',
    color: colors.onSurface,
  },
  restChooserBtnSub: {
    fontSize: 10, fontFamily: fonts.label, color: colors.outline,
    letterSpacing: 0.3, textAlign: 'center',
  },

  // Short / Long rest confirm dialog. Inherits modalBackdrop above.
  restConfirmCard: {
    backgroundColor: colors.surface, borderRadius: 14,
    borderColor: colors.border, borderWidth: 1,
    width: '90%', maxWidth: 420, padding: spacing.lg,
  },
  restConfirmHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginBottom: spacing.md,
  },
  restConfirmBody: {
    fontSize: 13, fontFamily: fonts.body, color: colors.onSurfaceVariant,
    lineHeight: 19, marginBottom: spacing.lg,
  },
  restConfirmActions: { flexDirection: 'row', gap: 10 },
  restConfirmBtn: {
    flex: 1, paddingVertical: 11, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  restConfirmCancel: {
    borderWidth: 1, borderColor: colors.outlineVariant,
    backgroundColor: 'transparent',
  },
  restConfirmCancelText: {
    fontSize: 13, fontFamily: fonts.label, fontWeight: '600',
    color: colors.onSurfaceVariant, letterSpacing: 0.3,
  },
  restConfirmCommit: { backgroundColor: colors.primary },
  restConfirmCommitText: {
    fontSize: 13, fontFamily: fonts.label, fontWeight: '700',
    color: colors.onPrimary, letterSpacing: 0.3,
  },

  // Activity log
  logList: { maxHeight: 360 },
  logRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.outlineVariant,
  },
  logLabel: {
    fontSize: 13, fontWeight: '600', color: colors.textPrimary,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  logDice: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  logTotal: { fontSize: 20, fontWeight: '800' },
  logEmpty: {
    fontSize: 13, color: colors.textSecondary, fontStyle: 'italic',
    paddingVertical: spacing.md,
  },

  // Settings
  settingRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
  },
  settingLabel: {
    fontSize: 15, fontWeight: '600', color: colors.textPrimary,
    marginBottom: 4,
  },
  settingDesc: {
    fontSize: 13, color: colors.textSecondary, lineHeight: 18,
  },

  // Destructive zone — visually separated from the toggle rows above.
  dangerZone: {
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant,
  },
  deleteRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.xs,
  },
  deleteRowText: {
    fontSize: 14, fontWeight: '600', color: colors.hpDanger,
  },
  deleteConfirmText: {
    fontSize: 13, color: colors.textPrimary, marginBottom: spacing.md,
    lineHeight: 18,
  },
  deleteConfirmRow: {
    flexDirection: 'row', gap: spacing.sm,
  },
  deleteCancelBtn: {
    flex: 1, paddingVertical: 10, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.outlineVariant,
    alignItems: 'center', justifyContent: 'center',
  },
  deleteCancelText: {
    fontSize: 14, fontWeight: '600', color: colors.textSecondary,
  },
  deleteConfirmBtn: {
    flex: 1, paddingVertical: 10, borderRadius: radius.lg,
    backgroundColor: colors.hpDanger,
    alignItems: 'center', justifyContent: 'center',
  },
  deleteConfirmBtnDisabled: { opacity: 0.6 },
  deleteConfirmBtnText: {
    fontSize: 14, fontWeight: '700', color: colors.onPrimary,
    letterSpacing: 0.3,
  },

  // Field edit
  hpEditRow: {
    flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md,
  },
  hpEditField: { flex: 1 },
  hpEditLabel: {
    fontSize: 11, fontWeight: '600', color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.xs,
  },
  fieldInput: {
    backgroundColor: colors.background, borderColor: colors.border,
    borderWidth: 1, borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 24, fontWeight: '700', color: colors.textPrimary,
    textAlign: 'center', marginBottom: spacing.md,
  },
  fieldSaveBtn: {
    backgroundColor: colors.brand, borderRadius: 8,
    paddingVertical: 12, alignItems: 'center',
  },
  fieldSaveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  fieldHint: {
    fontSize: 11, fontFamily: fonts.body,
    color: colors.outline, textAlign: 'center',
    marginTop: -spacing.sm, marginBottom: spacing.sm,
  },
  fieldBtnRow: {
    flexDirection: 'row', gap: spacing.sm, alignItems: 'stretch',
  },
  fieldResetBtn: {
    paddingHorizontal: 12, paddingVertical: 12,
    borderRadius: 8, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainer,
  },
  fieldResetBtnText: {
    color: colors.onSurfaceVariant, fontSize: 12, fontWeight: '600',
    fontFamily: fonts.label, letterSpacing: 0.3,
  },

  // ── Left rail: ability scores + saves (Option C combined rows) ──────────
  deskSection: {
    paddingHorizontal: 12, paddingTop: 10, paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.outlineVariant,
  },
  deskSectionLabel: {
    fontSize: 8, fontFamily: fonts.label, fontWeight: '700',
    letterSpacing: 1.2, textTransform: 'uppercase', color: colors.outline, marginBottom: 4,
  },
  deskAbilityRow: {
    flexDirection: 'row', alignItems: 'center', gap: 0,
    paddingVertical: 3, paddingHorizontal: 4,
    borderRadius: 6,
  },
  // Short / Long rest buttons in the desktop sidebar Rest section.
  // Two-up flex row so they share width evenly; primary-bordered to
  // signal they're action affordances, not info.
  deskRestRow: { flexDirection: 'row', gap: 6, marginTop: 4 },
  deskRestBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 8, paddingHorizontal: 8,
    borderWidth: 1, borderColor: colors.primary, borderRadius: 6,
    backgroundColor: `${colors.primary}10`,
  },
  deskRestBtnText: {
    fontSize: 11, fontFamily: fonts.label, fontWeight: '700',
    color: colors.primary, letterSpacing: 0.4,
  },
  /** Active state for the inspiration toggle — gold border + tint to
   *  match the GM accent on the filled star icon. */
  deskRestBtnActive: {
    borderColor: colors.gm,
    backgroundColor: `${colors.gm}14`,
  },
  deskAbilDot: {
    width: 7, height: 7, borderRadius: 4,
    borderWidth: 1.5, borderColor: colors.outline,
    flexShrink: 0, marginRight: 7,
  },
  deskAbilDotProf: {
    backgroundColor: colors.primary, borderColor: colors.primary,
  },
  deskAbilName: {
    flex: 1, fontSize: 11, fontFamily: fonts.body, color: colors.onSurfaceVariant,
  },
  deskAbilBadge: {
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1, borderColor: colors.outlineVariant,
    borderRadius: 5, paddingVertical: 2, paddingHorizontal: 7,
    alignItems: 'center', minWidth: 40, marginRight: 4,
  },
  deskAbilBadgeHot: { borderColor: colors.primaryContainer },
  deskAbilMod: {
    fontSize: 14, fontFamily: fonts.headline, fontWeight: '700', color: colors.onSurface, lineHeight: 16,
  },
  deskAbilRaw: {
    fontSize: 9, color: colors.outline,
  },
  deskAbilSep: {
    width: 1, height: 22,
    backgroundColor: colors.outlineVariant,
    marginHorizontal: 8,
  },
  deskAbilSaveArea: {
    alignItems: 'flex-end', minWidth: 28,
  },
  deskAbilSaveVal: {
    fontSize: 14, fontFamily: fonts.headline, fontWeight: '700', color: colors.onSurface, lineHeight: 16,
  },
  deskAbilSaveLbl: {
    fontSize: 9, color: colors.outline,
  },

  // ── Left rail: campaign link ─────────────────────────────────────────────
  deskCampSection: {
    padding: 10,
  },
  deskCampCard: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.primaryContainer,
    borderWidth: 1, borderColor: colors.primary,
    borderRadius: radius.lg, padding: 9,
  },
  deskCampCardLbl: {
    fontSize: 7, fontFamily: fonts.label, fontWeight: '700',
    letterSpacing: 1, textTransform: 'uppercase', color: colors.outline,
  },
  deskCampCardName: {
    fontSize: 10, fontFamily: fonts.headline, fontWeight: '700', color: colors.primary,
    marginTop: 1,
  },

  // ── Right skills rail ────────────────────────────────────────────────────
  /** Right activity rail container — sizing + border live here; the
   *  LinearGradient wrapper paints the background (gm-orange tint top-
   *  right fading to surface) so the rail mirrors the left rail's
   *  purple gradient with the team's alt accent. */
  skillsRail: {
    width: 200, flexShrink: 0,
    borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.outlineVariant,
    flexDirection: 'column',
  },
  skillsRailHead: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 10, paddingBottom: 7,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.outlineVariant,
  },
  skillsRailTitle: {
    fontSize: 10, fontFamily: fonts.headline, fontWeight: '800', color: colors.onSurface,
  },
  skillsRailSub: {
    fontSize: 8, fontFamily: fonts.label, color: colors.outline, marginTop: 1,
  },
  skillsRailRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 8, paddingVertical: 4,
    borderBottomWidth: 1, borderBottomColor: '#ffffff06',
  },
  skillsRailDot: {
    width: 6, height: 6, borderRadius: 3,
    borderWidth: 1.5, borderColor: colors.outline, flexShrink: 0,
  },
  skillsRailDotProf: { backgroundColor: colors.primary, borderColor: colors.primary },
  skillsRailName: {
    flex: 1, fontSize: 9, fontFamily: fonts.body, color: colors.onSurfaceVariant,
  },
  skillsRailNameProf: { color: colors.onSurface, fontWeight: '600' },
  skillsRailAbi: {
    fontSize: 7, fontFamily: fonts.label, fontWeight: '700',
    letterSpacing: 0.5, textTransform: 'uppercase', color: colors.outline,
  },
  skillsRailVal: {
    fontSize: 10, fontFamily: fonts.headline, fontWeight: '800',
    color: colors.onSurfaceVariant, minWidth: 24, textAlign: 'right',
  },
  skillsRailValProf: { color: colors.primary },
  logRailRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 8, paddingVertical: 6,
    borderBottomWidth: 1, borderBottomColor: '#ffffff06',
  },
  logRailLabel: {
    fontSize: 9, fontFamily: fonts.label, fontWeight: '700',
    letterSpacing: 0.5, textTransform: 'uppercase', color: colors.onSurface,
  },
  logRailDice: { fontSize: 8, color: colors.outline, marginTop: 1 },
  logRailTotal: {
    fontSize: 13, fontFamily: fonts.headline, fontWeight: '800',
    minWidth: 24, textAlign: 'right',
  },
  logRailEmpty: {
    fontSize: 10, fontFamily: fonts.body, color: colors.outline, fontStyle: 'italic',
    padding: 10,
  },
  /** Collapsed-state rail container — gm-orange gradient mirrors the
   *  expanded rail so the team accent reads even when the log is
   *  tucked away. Width + border live here on the gradient wrapper;
   *  the inner TouchableOpacity handles tap + alignment. */
  skillsRailCollapsed: {
    width: 28, flexShrink: 0,
    borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.outlineVariant,
  },
  skillsRailCollapsedInner: {
    flex: 1, alignItems: 'center', paddingTop: 12, gap: 8,
  },
  skillsRailCollapsedLabel: {
    fontSize: 8, fontFamily: fonts.label, fontWeight: '700',
    letterSpacing: 1.5, textTransform: 'uppercase', color: colors.outline,
    transform: [{ rotate: '90deg' }],
  },
});
