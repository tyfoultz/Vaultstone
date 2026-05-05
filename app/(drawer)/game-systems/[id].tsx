import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  View, ScrollView, Pressable, TextInput, StyleSheet, useWindowDimensions, Modal,
} from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import {
  colors, spacing, radius,
  Card, Chip, ContentWidth, MarkdownText, MetaLabel, SourceBadge, Text, ScreenHeader, Icon,
} from '@vaultstone/ui';
import { BUNDLED_SYSTEMS_BY_ID } from '@vaultstone/systems';
import {
  getSrdContent, SEED_ONLY_TYPES, type SrdContent,
} from '@vaultstone/content';
import { DetailModal, DetailSection, DetailSectionHeading } from '../../../components/DetailModal';
import { useSystemHomebrewContent } from '../../../components/game-systems/useSystemHomebrewContent';
import { SystemPacksRow } from '../../../components/game-systems/SystemPacksRow';
import type { GameSystemDefinition } from '@vaultstone/types';
import type {
  SpeciesResult, ClassResult, BackgroundResult,
  SubclassResult, ConditionResult, RuleResult, SpellResult,
  ItemResult, FeatResult, OptionalFeatureResult, OptionalFeatureKind, DeityResult, VariantRuleResult, CreatureResult,
  SkillResult, DamageTypeResult, SchoolResult, SizeResult,
  LanguageResult, ActionTypeResult, WeaponPropertyResult, WeaponMasteryResult,
  StandardActionResult, SenseResult, SpeedResult, CreatureTypeResult,
  AlignmentResult, CurrencyResult, ToolResult, MagicItemCategoryResult, CoverResult,
  ContentTier, ImportSource,
} from '@vaultstone/types';

const EMPTY_CONTENT: SrdContent = {
  species: [], classes: [], subclasses: [], backgrounds: [],
  conditions: [], rules: [], spells: [], items: [], feats: [], optionalFeatures: [], deities: [], variantRules: [], creatures: [],
  skills: [], damageTypes: [], schools: [], sizes: [], languages: [],
  actionTypes: [], weaponProperties: [], weaponMasteries: [],
  standardActions: [], senses: [], speeds: [], creatureTypes: [],
  alignments: [], currencies: [], tools: [], magicItemCategories: [], cover: [],
};

const BUNDLED = BUNDLED_SYSTEMS_BY_ID;

// Sub-tab `contentKey === '__schema__'` is a synthetic marker — it routes to
// the SchemaPanel rather than a SrdContent list.
type SubTabContentKey = keyof SrdContent | '__schema__';

type ItemCategory = ItemResult['category'];

type SubTab = {
  key: string;
  label: string;
  contentKey: SubTabContentKey;
  /**
   * Optional filter when contentKey === 'items'. Used to split the single
   * items list into per-category sub-tabs (Weapons / Armor / etc.) without
   * duplicating the underlying data.
   */
  itemCategories?: ItemCategory[];
};

type GroupKey =
  | 'character' | 'spells' | 'equipment' | 'bestiary'
  | 'rules' | 'reference' | 'schema';

type Group = {
  key: GroupKey;
  label: string;
  subTabs: SubTab[];
};

// Top-level grouping of the per-system detail page. Within each group the
// sub-tabs map 1:1 to a SrdContent key (or '__schema__' for the system-
// definition view). Hiding behavior: if a sub-tab's content list is empty,
// it's filtered out; if every sub-tab in a group is filtered out, the group
// itself is filtered out — except Schema, which is always available.
const GROUPS: Group[] = [
  {
    key: 'character',
    label: 'Character Options',
    subTabs: [
      // Subclasses are folded into the Classes view (rendered alongside the
      // class they branch from) rather than a separate sub-tab.
      { key: 'species',           label: 'Species',           contentKey: 'species' },
      { key: 'classes',           label: 'Classes',           contentKey: 'classes' },
      { key: 'backgrounds',       label: 'Backgrounds',       contentKey: 'backgrounds' },
      { key: 'feats',             label: 'Feats',             contentKey: 'feats' },
      // Class-feature choices made during levelling — Eldritch Invocations,
      // Metamagic, Maneuvers, Fighting Styles, etc. The list filters by
      // kind so per-class pickers (eventually) can narrow without a
      // separate sub-tab per kind.
      { key: 'optional-features', label: 'Optional Features', contentKey: 'optionalFeatures' },
      // Cleric / Paladin patron deities. The 2024 SRD ships 27 Greyhawk
      // deities under XDMG; older sources (PHB, SCAG, MTF) carry the
      // legacy 2014 alignment + domain fields. Lives under Character
      // Options because patron choice is a creation-time decision, not
      // a reference lookup.
      { key: 'deities',           label: 'Deities',           contentKey: 'deities' },
    ],
  },
  {
    key: 'spells',
    label: 'Spells & Magic',
    subTabs: [
      { key: 'spells', label: 'Spells', contentKey: 'spells' },
    ],
  },
  {
    key: 'equipment',
    label: 'Equipment',
    subTabs: [
      { key: 'weapons',            label: 'Weapons',            contentKey: 'items', itemCategories: ['weapon'] },
      { key: 'armor',              label: 'Armor',              contentKey: 'items', itemCategories: ['armor', 'shield'] },
      { key: 'adventuring-gear',   label: 'Adventuring Gear',   contentKey: 'items', itemCategories: ['adventuring-gear'] },
      { key: 'magic-items',        label: 'Magic Items',        contentKey: 'items', itemCategories: ['magic-item'] },
      { key: 'tools',              label: 'Tools',              contentKey: 'tools' },
    ],
  },
  {
    key: 'bestiary',
    label: 'Bestiary',
    subTabs: [
      { key: 'creatures', label: 'Monsters', contentKey: 'creatures' },
    ],
  },
  {
    key: 'reference',
    label: 'Glossary',
    subTabs: [
      // Rules-of-play prose imported from Open5e /rules/. Sectioned by
      // chapter inside the RulesList renderer. Surfaced as the lead
      // sub-tab under Glossary because it's the densest rules-reference
      // surface — chapters like Combat, Damage and Healing, etc. all
      // resolve here.
      { key: 'rules',                 label: 'Rules',                 contentKey: 'rules' },
      // Variant rules + the XPHB compendium glossary share one sub-tab
      // — both come out of 5e.tools' `variantrule` array. The list
      // exposes a Kind chip facet so the user can narrow to just
      // glossary entries (XPHB compendium) or just DM-side variants
      // (Flanking, Hero Points, Cleaving).
      { key: 'variant-rules',         label: 'Variant Rules',         contentKey: 'variantRules' },
      { key: 'standard-actions',      label: 'Standard Actions',      contentKey: 'standardActions' },
      { key: 'action-types',          label: 'Action Types',          contentKey: 'actionTypes' },
      { key: 'cover',                 label: 'Cover',                 contentKey: 'cover' },
      // Small enumerated catalogs — system vocabulary. Read-only lookup
      // tables, grouped here so they don't crowd the topical tabs.
      { key: 'conditions',            label: 'Conditions',            contentKey: 'conditions' },
      { key: 'skills',                label: 'Skills',                contentKey: 'skills' },
      { key: 'languages',             label: 'Languages',             contentKey: 'languages' },
      { key: 'damage-types',          label: 'Damage Types',          contentKey: 'damageTypes' },
      { key: 'schools',               label: 'Schools',               contentKey: 'schools' },
      { key: 'sizes',                 label: 'Sizes',                 contentKey: 'sizes' },
      { key: 'senses',                label: 'Senses',                contentKey: 'senses' },
      { key: 'speeds',                label: 'Speeds',                contentKey: 'speeds' },
      { key: 'creature-types',        label: 'Creature Types',        contentKey: 'creatureTypes' },
      { key: 'alignments',            label: 'Alignments',            contentKey: 'alignments' },
      { key: 'currencies',            label: 'Currencies',            contentKey: 'currencies' },
      { key: 'weapon-properties',     label: 'Weapon Properties',     contentKey: 'weaponProperties' },
      { key: 'weapon-masteries',      label: 'Weapon Masteries',      contentKey: 'weaponMasteries' },
      { key: 'magic-item-categories', label: 'Magic Item Categories', contentKey: 'magicItemCategories' },
    ],
  },
  // Schema tab is dev-only — it inspects the GameSystemDefinition and is
  // useful for system-author debugging but noise for end users. The
  // __DEV__ check is statically evaluable so production bundles drop it.
  ...(__DEV__ ? [{
    key: 'schema' as const,
    label: 'Schema',
    subTabs: [
      { key: 'schema', label: 'Schema', contentKey: '__schema__' as const },
    ],
  }] : []),
];

function subTabItemCount(t: SubTab, content: SrdContent): number {
  if (t.contentKey === '__schema__') return 0;
  if (t.itemCategories && t.contentKey === 'items') {
    const set = new Set<ItemCategory>(t.itemCategories);
    return distinctNamedCount(content.items.filter((i) => set.has(i.category)));
  }
  return distinctNamedCount(content[t.contentKey]);
}

/**
 * Count entries by distinct lowercased name. Matches the table view's
 * same-name grouping (an entry appearing in both SRD 5.1 and SRD 2024
 * collapses into one row), so the tab count reflects what the user
 * actually sees in the table rather than the raw row count.
 *
 * Subclasses use `${parentClassKey}::${name}` as the unique key on the
 * table side to keep two same-named subclasses across different
 * parent classes apart; we mirror that here so the count agrees.
 */
function distinctNamedCount(items: ReadonlyArray<{ name: string; parentClassKey?: string | null }>): number {
  const seen = new Set<string>();
  for (const it of items) {
    const key = it.parentClassKey != null
      ? `${it.parentClassKey}::${it.name.toLowerCase()}`
      : it.name.toLowerCase();
    seen.add(key);
  }
  return seen.size;
}

function isSubTabAvailable(t: SubTab, content: SrdContent): boolean {
  // Schema is always available — it isn't backed by SRD content. Renders
  // its own panel inside the body.
  if (t.contentKey === '__schema__') return true;
  return subTabItemCount(t, content) > 0;
}

function visibleSubTabs(group: Group, content: SrdContent): SubTab[] {
  return group.subTabs.filter((t) => isSubTabAvailable(t, content));
}

export default function GameSystemDetailScreen() {
  const router = useRouter();
  const { id, group } = useLocalSearchParams<{ id: string; group?: string }>();
  const sys = BUNDLED[id ?? ''];

  if (!sys) {
    return <NotFound onBack={() => router.push('/game-systems' as Href)} />;
  }

  return (
    <GameSystemDetail
      sys={sys}
      initialGroupParam={group ?? null}
      onBack={() => router.push('/game-systems' as Href)}
    />
  );
}

function GameSystemDetail({
  sys, initialGroupParam, onBack,
}: {
  sys: GameSystemDefinition;
  initialGroupParam: string | null;
  onBack: () => void;
}) {
  // Filter bundled SRD content to records tagged with this system's edition.
  // Systems without an SRD version (Custom, future homebrew systems) get nothing.
  const srdContent = useMemo(
    () => (sys.srdVersion ? getSrdContent(sys.srdVersion) : EMPTY_CONTENT),
    [sys.srdVersion],
  );

  // Fetch the user's homebrew entries scoped to this system. Loads async on
  // top of the synchronous SRD content — the page renders SRD immediately
  // and homebrew entries fade in once the query resolves. Each homebrew
  // entry already comes shaped as the matching `*Result` thanks to the
  // ContentResolver mapping in packages/content/src/homebrew/index.ts.
  // Both authored homebrew and imported content land in this stream —
  // the homebrew tier reader merges them under the unified pack umbrella.
  // refreshTick is bumped by SystemPacksRow after a pack/import lands so
  // downstream surfaces (Class detail, etc.) re-render without a remount.
  const [homebrewRefreshTick, setHomebrewRefreshTick] = useState(0);
  const homebrew = useSystemHomebrewContent(sys.id, homebrewRefreshTick);
  const refreshHomebrew = () => setHomebrewRefreshTick((n) => n + 1);

  // Merge: spread SRD first, concat homebrew per bucket. Order matters
  // because the existing list sorts (alphabetical, by-CR, etc.) re-sort
  // each merged array; the spread order doesn't affect final display
  // order, but it does affect which entry "wins" when a downstream
  // dedupe-by-name pass collapses collisions (caller-side or future).
  // Schema and reference catalog buckets pass through untouched — those
  // aren't user-authorable.
  const content = useMemo(() => {
    const merged: typeof srdContent = { ...srdContent };
    for (const [k, list] of Object.entries(homebrew.buckets)) {
      if (!list || list.length === 0) continue;
      const key = k as keyof typeof srdContent;
      // Cast through unknown — the per-bucket array types are heterogeneous
      // (SpellResult[], ItemResult[], etc.) but the indexer only sees the
      // union, so the spread is provably correct at runtime.
      (merged[key] as unknown[]) = [...(merged[key] as unknown[]), ...list];
    }
    return merged;
  }, [srdContent, homebrew.buckets]);

  // Build the visible group + sub-tab tree once per content change. A group
  // disappears entirely when none of its sub-tabs have content — except
  // Schema, which is always present.
  const groups = useMemo(() => {
    return GROUPS
      .map((g) => ({ ...g, subTabs: visibleSubTabs(g, content) }))
      .filter((g) => g.subTabs.length > 0);
  }, [content]);

  // Default selection priority:
  //   1. ?group= URL param if it points at a visible group (deep-links from
  //      campaign cards land users straight on Rulebooks)
  //   2. First non-Schema group with content
  //   3. Schema
  const initialGroup: GroupKey = useMemo(() => {
    if (initialGroupParam) {
      const match = groups.find((g) => g.key === initialGroupParam);
      if (match) return match.key;
    }
    return groups[0]?.key ?? 'schema';
  }, [initialGroupParam, groups]);
  const [activeGroup, setActiveGroup] = useState<GroupKey>(initialGroup);
  const currentGroup = groups.find((g) => g.key === activeGroup) ?? groups[0];

  // Per-group remembered sub-tab. Switching groups defaults to the first
  // visible sub-tab; coming back later restores the last one viewed.
  const [subByGroup, setSubByGroup] = useState<Partial<Record<GroupKey, string>>>({});
  const activeSubKey = subByGroup[activeGroup] ?? currentGroup?.subTabs[0]?.key ?? '';
  const activeSub = currentGroup?.subTabs.find((s) => s.key === activeSubKey) ?? currentGroup?.subTabs[0];

  function selectGroup(key: GroupKey) { setActiveGroup(key); }
  function selectSub(key: string) {
    setSubByGroup((prev) => ({ ...prev, [activeGroup]: key }));
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.surfaceCanvas }}>
      <ContentWidth size="wide">
      {/* Back link */}
      <Pressable
        onPress={onBack}
        style={({ pressed }) => [styles.backRow, pressed && { opacity: 0.6 }]}
        accessibilityRole="button"
        accessibilityLabel="Back to game systems"
      >
        <Icon name="chevron-left" size={18} color={colors.onSurfaceVariant} />
        <Text variant="body-sm" family="body" weight="medium" style={{ color: colors.onSurfaceVariant }}>
          Game Systems
        </Text>
      </Pressable>

      <ScreenHeader
        title={sys.displayName}
        subtitle={`v${sys.version} · ${sys.license === 'CC-BY-4.0' ? 'CC-BY 4.0' : sys.license}`}
        actions={<Chip label={sys.isBundled ? 'Bundled' : 'Custom'} variant="accent" />}
      />

      {/* Homebrew packs scoped to this system. Pinned above the SRD content
          tabs so users see their custom content first. */}
      <SystemPacksRow system={sys} onPacksChanged={refreshHomebrew} />

      {/* Group tabs — primary navigation (horizontal scroll on narrow screens). */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabsBar}
        style={styles.tabsScroll}
      >
        {groups.map((g) => {
          const active = activeGroup === g.key;
          const groupCount = g.subTabs.reduce((sum, s) => sum + subTabItemCount(s, content), 0);
          return (
            <Pressable
              key={g.key}
              onPress={() => selectGroup(g.key)}
              style={({ pressed }) => [
                styles.tabBtn,
                active && styles.tabBtnActive,
                pressed && { opacity: 0.85 },
              ]}
            >
              <Text
                variant="body-sm"
                family="body"
                weight={active ? 'bold' : 'medium'}
                style={{ color: active ? colors.primary : colors.onSurfaceVariant }}
              >
                {g.label}
              </Text>
              {groupCount > 0 ? (
                <Text variant="body-sm" family="body" style={styles.tabCount}>{groupCount}</Text>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Sub-tab strip — only when the active group has more than one sub-tab.
          Wraps so long lists (Glossary has 14 chips) don't run off-screen. */}
      {currentGroup && currentGroup.subTabs.length > 1 ? (
        <View style={styles.subTabsBar}>
          {currentGroup.subTabs.map((t) => {
            const active = activeSubKey === t.key;
            const subCount = t.contentKey === '__schema__' ? undefined : subTabItemCount(t, content);
            return (
              <Pressable
                key={t.key}
                onPress={() => selectSub(t.key)}
                style={({ pressed }) => [
                  styles.subTabBtn,
                  active && styles.subTabBtnActive,
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Text
                  variant="body-sm"
                  family="body"
                  weight={active ? 'bold' : 'medium'}
                  style={{ color: active ? colors.onPrimaryContainer : colors.onSurfaceVariant }}
                >
                  {t.label}
                </Text>
                {typeof subCount === 'number' ? (
                  <Text variant="body-sm" family="body" style={styles.subTabCount}>{subCount}</Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <View style={styles.body}>
        {renderSubBody(activeSub, content, sys)}
      </View>

      {sys.srdVersion ? (
        <View style={styles.body}>
          <SrdAttribution srdVersion={sys.srdVersion} />
        </View>
      ) : null}

      <View style={{ height: spacing.xl }} />
      </ContentWidth>
    </ScrollView>
  );
}

/**
 * Per-system attribution panel. Names the SRD document(s) bundled for
 * this system and credits the upstream sources under CC-BY 4.0. Sits
 * at the bottom of the system detail page so the credit travels with
 * the content the user is browsing.
 */
function SrdAttribution({ srdVersion }: { srdVersion: string }) {
  // Currently each system pins to one SRD version, but the data layer
  // already supports cross-edition entries (`srdVersions` array per
  // entry), so a future "all editions" system would render both lines.
  const lines = srdVersion === 'SRD_2.0'
    ? ['System Reference Document 5.2 (2024)']
    : srdVersion === 'SRD_5.1'
    ? ['System Reference Document 5.1 (2014)']
    : [];
  if (lines.length === 0) return null;
  return (
    <View style={styles.attribution}>
      <View style={styles.attributionHead}>
        <Icon name="info-outline" size={14} color={colors.outline} />
        <MetaLabel size="sm">Content sources</MetaLabel>
      </View>
      <Text variant="body-sm" family="body" style={styles.attributionBody}>
        SRD content bundled with Vaultstone is sourced from{' '}
        <Text weight="semibold">{lines.join(' and ')}</Text>, distributed
        under{' '}
        <Text weight="semibold">CC-BY 4.0</Text>. Pulled from the{' '}
        <Text weight="semibold">Open5e</Text> v2 API
        (api.open5e.com), with item flavor text patched from the{' '}
        <Text weight="semibold">BTMorton SRD 5.1</Text> dataset where
        the Open5e payload omits prose. © Wizards of the Coast LLC, used
        under license.
      </Text>
      <Text variant="body-sm" family="body" style={styles.attributionBody}>
        Imported content (homebrew packs you create or import) is your
        own responsibility — see the per-import notice when adding
        sources to a pack.
      </Text>
    </View>
  );
}

// ── Body dispatcher ──────────────────────────────────────────────────────────

function renderSubBody(
  active: SubTab | undefined,
  content: SrdContent,
  sys: GameSystemDefinition,
): React.ReactNode {
  if (!active) return null;
  // Item sub-tabs share the single `content.items` source but filter by
  // category (Weapons, Armor, Adventuring Gear, Magic Items, Crafting).
  if (active.contentKey === 'items' && active.itemCategories) {
    const set = new Set<ItemCategory>(active.itemCategories);
    return <ItemsList items={content.items.filter((i) => set.has(i.category))} srdVersion={sys.srdVersion ?? undefined} />;
  }
  const srdVersion = sys.srdVersion ?? undefined;
  switch (active.contentKey) {
    case 'species':          return <SpeciesList     items={content.species}     srdVersion={srdVersion} />;
    case 'classes':          return <ClassesList     items={content.classes} allSubclasses={content.subclasses} srdVersion={srdVersion} />;
    case 'backgrounds':      return <BackgroundsList items={content.backgrounds} srdVersion={srdVersion} />;
    case 'spells':           return <SpellsList      items={content.spells}      srdVersion={srdVersion} />;
    case 'feats':            return <FeatsList       items={content.feats}       srdVersion={srdVersion} />;
    case 'optionalFeatures': return <OptionalFeaturesList items={content.optionalFeatures} srdVersion={srdVersion} />;
    case 'deities':          return <DeitiesList         items={content.deities}          srdVersion={srdVersion} />;
    case 'variantRules':     return <VariantRulesList    items={content.variantRules}     srdVersion={srdVersion} />;
    case 'items':            return <ItemsList       items={content.items}       srdVersion={srdVersion} />;
    case 'creatures':        return <CreaturesList   items={content.creatures}   srdVersion={srdVersion} />;
    case 'conditions':       return <ConditionsList  items={content.conditions}  srdVersion={srdVersion} />;
    case 'rules':            return <RulesList       items={content.rules} />;
    case 'skills':           return <SkillsList           items={content.skills} />;
    case 'languages':        return <LanguagesList        items={content.languages} />;
    case 'schools':          return <SchoolsList          items={content.schools} />;
    case 'sizes':            return <SizesList            items={content.sizes} />;
    case 'damageTypes':      return <DamageTypesList      items={content.damageTypes} />;
    case 'actionTypes':      return <ActionTypesList      items={content.actionTypes} />;
    case 'weaponProperties': return <WeaponPropertiesList items={content.weaponProperties} />;
    case 'weaponMasteries':  return <WeaponMasteriesList  items={content.weaponMasteries} />;
    case 'standardActions':     return <StandardActionsList     items={content.standardActions} />;
    case 'senses':              return <SensesList              items={content.senses} />;
    case 'speeds':              return <SpeedsList              items={content.speeds} />;
    case 'creatureTypes':       return <CreatureTypesList       items={content.creatureTypes} />;
    case 'alignments':          return <AlignmentsList          items={content.alignments} />;
    case 'currencies':          return <CurrenciesList          items={content.currencies} />;
    case 'tools':               return <ToolsList               items={content.tools} />;
    case 'magicItemCategories': return <MagicItemCategoriesList items={content.magicItemCategories} />;
    case 'cover':               return <CoverList               items={content.cover} />;
    case '__schema__':       return <SchemaPanel sys={sys} />;
    default:                 return null;
  }
}

// ── Content lists ─────────────────────────────────────────────────────────────

function SearchBar({ value, onChange, placeholder }: { value: string; onChange: (s: string) => void; placeholder: string }) {
  return (
    <View style={styles.searchBox}>
      <Icon name="search" size={16} color={colors.outline} />
      <TextInput
        style={styles.searchInput}
        placeholder={placeholder}
        placeholderTextColor={colors.outline}
        value={value}
        onChangeText={onChange}
      />
      {value.length > 0 ? (
        <Pressable onPress={() => onChange('')} accessibilityLabel="Clear search">
          <Icon name="close" size={14} color={colors.outline} />
        </Pressable>
      ) : null}
    </View>
  );
}

function ExpandRow({
  title, summary, expanded, onToggle, children, badge, tier, importSource, extraSources, footSource,
}: {
  title: string;
  summary: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  /** Optional adornment (e.g. a Chip) anchored to the right of the row head. */
  badge?: React.ReactNode;
  /** When 'homebrew', adds a Homebrew chip and a left border accent so users can
   *  tell user-authored content apart from bundled SRD at a glance. */
  tier?: ContentTier;
  /** Source-book provenance — surfaced as a compact badge in the row head and
   *  the full label inside the expanded body. Undefined = no badge. */
  importSource?: ImportSource;
  /** Additional source badges rendered to the left of the primary one, for
   *  entries that exist in multiple sources (e.g. SRD 2014 + SRD 2024 + an
   *  imported PHB version, all collapsed into one row by groupSpellVariants).
   *  Only the primary `importSource` gets the full-label foot in the body. */
  extraSources?: ImportSource[];
  /** Override for the body-foot full-name source label. When set, replaces
   *  `importSource` for the foot only — used when the head needs a sorted
   *  multi-source row but the foot should still reflect a single "active"
   *  variant. Defaults to `importSource` when unset. */
  footSource?: ImportSource;
}) {
  const isHomebrew = tier === 'homebrew';
  return (
    <View style={[styles.row, expanded && styles.rowExpanded, isHomebrew && styles.rowHomebrew]}>
      <Pressable
        onPress={onToggle}
        style={({ pressed }) => [
          styles.rowHead,
          expanded && styles.rowHeadExpanded,
          pressed && { opacity: 0.85 },
        ]}
        accessibilityRole="button"
      >
        <View style={{ flex: 1 }}>
          <Text
            variant="title-sm"
            family="headline"
            weight="bold"
            style={{ color: expanded ? colors.primary : colors.onSurface }}
          >
            {title}
          </Text>
          {summary ? (
            <Text variant="body-sm" family="body" style={styles.rowMeta} numberOfLines={2}>
              {summary}
            </Text>
          ) : null}
        </View>
        {extraSources?.map((src, i) => (
          <SourceBadge key={`extra-${i}`} source={src} size="sm" />
        ))}
        {importSource ? <SourceBadge source={importSource} size="sm" /> : null}
        {isHomebrew && !importSource && !(extraSources && extraSources.length > 0) ? <Chip label="Homebrew" variant="accent" /> : null}
        {badge ? <View style={styles.rowBadge}>{badge}</View> : null}
        <Icon
          name={expanded ? 'expand-less' : 'expand-more'}
          size={20}
          color={expanded ? colors.primary : colors.outline}
        />
      </Pressable>
      {expanded ? (
        <View style={[styles.rowBody, styles.rowBodyExpanded]}>
          {children}
          {(footSource ?? importSource) ? (
            <View style={styles.sourceFooter}>
              <SourceBadge source={footSource ?? importSource} size="md" />
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function useExpanded() {
  const [openKey, setOpenKey] = useState<string | null>(null);
  return {
    isOpen: (k: string) => openKey === k,
    toggle: (k: string) => setOpenKey((cur) => (cur === k ? null : k)),
  };
}

function filterByName<T extends { name: string; description?: string }>(items: T[], q: string): T[] {
  if (!q.trim()) return items;
  const t = q.toLowerCase();
  return items.filter((i) => i.name.toLowerCase().includes(t) || (i.description ?? '').toLowerCase().includes(t));
}

export function SpeciesList({
  items, srdVersion, rowActions, headerExtra,
}: {
  items: SpeciesResult[];
  srdVersion?: string;
  rowActions?: (active: SpeciesResult) => React.ReactNode;
  headerExtra?: React.ReactNode;
}) {
  return (
    <TableShell<SpeciesResult>
      items={items}
      fingerprint={speciesFingerprint}
      searchPlaceholder="Search species…"
      activeSrdVersion={srdVersion}
      rowActions={rowActions}
      headerExtra={headerExtra}
      columns={[
        { key: 'name', label: 'Name', cell: (s) => s.name, compare: (a, b) => a.name.localeCompare(b.name), width: 160, defaultSort: 'asc' },
        { key: 'size', label: 'Size', cell: (s) => s.size ?? '—', compare: (a, b) => (a.size ?? '').localeCompare(b.size ?? ''), width: 100 },
        { key: 'speed', label: 'Speed', cell: (s) => (typeof s.speed === 'number' ? `${s.speed} ft` : '—'), compare: (a, b) => (a.speed ?? 0) - (b.speed ?? 0), width: 90 },
      ]}
      facets={[
        { key: 'size', label: 'Size', getValues: (s) => (s.size ? [s.size] : []) },
      ]}
      renderBody={(s) => (
        <>
          {s.description ? <MarkdownText style={styles.bodyText}>{s.description}</MarkdownText> : null}
          {Array.isArray(s.traits) && s.traits.length > 0 ? (
            <View style={styles.subBlock}>
              <MetaLabel size="sm">Traits</MetaLabel>
              {s.traits.map((t: any, i: number) => (
                <View key={i} style={styles.bullet}>
                  <Text variant="body-sm" family="body" weight="bold" style={{ color: colors.onSurface }}>{t.name}</Text>
                  <MarkdownText style={styles.bodyText}>{t.description}</MarkdownText>
                </View>
              ))}
            </View>
          ) : null}
        </>
      )}
    />
  );
}

function speciesFingerprint(s: SpeciesResult): string {
  return JSON.stringify({
    description: s.description ?? '',
    size: s.size ?? '',
    speed: s.speed ?? '',
    traits: (s.traits ?? []).map((t: any) => `${t.name}|${t.description}`).sort(),
  });
}

function ClassesList({ items, allSubclasses, srdVersion }: { items: ClassResult[]; allSubclasses: SubclassResult[]; srdVersion?: string }) {
  // Tapping a row opens the detail modal with the full variant group
  // (groupVariants sorts so [0] is the priority winner — imported >
  // SRD 2024 > SRD 5.1). The modal renders SourceTabs above its content
  // when there are 2+ variants so the user can flip between editions /
  // imported overrides without closing the modal.
  const [activeVariants, setActiveVariants] = useState<ClassResult[] | null>(null);

  // Subclass counts per class name. We match by parent class *name* (lowercased)
  // rather than parentClassKey because class keys are edition-suffixed
  // (`barbarian-srd-5-1` vs. `barbarian-srd-2-0`); name-based counting
  // collapses across editions so the column shows a single total per class.
  // Subclasses themselves are also edition-keyed, so dedupe by name within
  // a parent so e.g. Champion (5.1) + Champion (2024) only counts once.
  const subclassCountByClassName = useMemo(() => {
    const buckets = new Map<string, Set<string>>();
    for (const sc of allSubclasses) {
      const parentName = sc.parentClassName ?? sc.parentClassKey;
      if (!parentName) continue;
      const k = parentName.toLowerCase().replace(/-srd-\d.*$/, '');
      const set = buckets.get(k) ?? new Set<string>();
      set.add(sc.name.toLowerCase());
      buckets.set(k, set);
    }
    const out = new Map<string, number>();
    for (const [k, set] of buckets) out.set(k, set.size);
    return out;
  }, [allSubclasses]);

  function subclassCount(c: ClassResult): number {
    return subclassCountByClassName.get(c.name.toLowerCase()) ?? 0;
  }

  return (
    <>
      <TableShell<ClassResult>
        items={items}
        fingerprint={classFingerprint}
        searchPlaceholder="Search classes…"
        activeSrdVersion={srdVersion}
        columns={[
          { key: 'name', label: 'Name', cell: (c) => c.name, compare: (a, b) => a.name.localeCompare(b.name), width: 160, defaultSort: 'asc' },
          {
            key: 'hit-die',
            label: 'Hit die',
            cell: (c) => {
              const hd = (c as any).hitDie;
              return typeof hd === 'number' ? `d${hd}` : '—';
            },
            compare: (a, b) => ((a as any).hitDie ?? 99) - ((b as any).hitDie ?? 99),
            width: 80,
          },
          {
            key: 'primary',
            label: 'Primary',
            cell: (c) => {
              const pa = (c as any).primaryAbility;
              return pa ? (Array.isArray(pa) ? pa.join('/') : String(pa)) : '—';
            },
            compare: (a, b) => {
              const ap = (a as any).primaryAbility;
              const bp = (b as any).primaryAbility;
              return String(Array.isArray(ap) ? ap.join('/') : ap ?? '').localeCompare(
                String(Array.isArray(bp) ? bp.join('/') : bp ?? '')
              );
            },
            width: 110,
          },
          {
            key: 'weapons',
            label: 'Weapons',
            cell: (c) => {
              const wp = (c as any).weaponProficiencies as string[] | undefined;
              return wp?.length ? wp.join(', ') : '—';
            },
            compare: (a, b) => {
              const aw = ((a as any).weaponProficiencies ?? []).join(',');
              const bw = ((b as any).weaponProficiencies ?? []).join(',');
              return aw.localeCompare(bw);
            },
            width: 180,
          },
          {
            key: 'armor',
            label: 'Armor',
            cell: (c) => {
              const ap = (c as any).armorProficiencies as string[] | undefined;
              return ap?.length ? ap.join(', ') : '—';
            },
            compare: (a, b) => {
              const aa = ((a as any).armorProficiencies ?? []).join(',');
              const ba = ((b as any).armorProficiencies ?? []).join(',');
              return aa.localeCompare(ba);
            },
            width: 160,
          },
          {
            key: 'spellcaster',
            label: 'Spellcaster',
            cell: (c) => {
              const cAny = c as any;
              if (!cAny.spellcasting) return 'No';
              return cAny.spellcastingAbility
                ? `Yes (${capitalize(cAny.spellcastingAbility)})`
                : 'Yes';
            },
            compare: (a, b) => Number((b as any).spellcasting ?? 0) - Number((a as any).spellcasting ?? 0),
            width: 130,
          },
          {
            key: 'subclass-count',
            label: 'Subclasses',
            cell: (c) => {
              const n = subclassCount(c);
              return n === 0 ? '—' : `${n}`;
            },
            compare: (a, b) => subclassCount(a) - subclassCount(b),
            width: 110,
          },
        ]}
        facets={[
          {
            key: 'hit-die',
            label: 'Hit die',
            getValues: (c) => {
              const hd = (c as any).hitDie;
              return typeof hd === 'number' ? [`d${hd}`] : [];
            },
            staticOptions: ['d6', 'd8', 'd10', 'd12'],
          },
          {
            key: 'primary',
            label: 'Primary ability',
            getValues: (c) => {
              const pa = (c as any).primaryAbility;
              if (!pa) return [];
              return Array.isArray(pa) ? pa : [pa];
            },
          },
        ]}
        onRowTap={(g) => setActiveVariants(g.variants)}
      />
      {activeVariants ? (
        <ClassDetailModal variants={activeVariants} allSubclasses={allSubclasses} onClose={() => setActiveVariants(null)} />
      ) : null}
    </>
  );
}

function classFingerprint(c: ClassResult): string {
  return JSON.stringify({
    description: c.description ?? '',
    hitDie: (c as any).hitDie ?? null,
    primaryAbility: (c as any).primaryAbility ?? null,
    saves: [...(((c as any).savingThrows) ?? [])].sort(),
    armor: [...(((c as any).armorProficiencies) ?? [])].sort(),
    weapons: [...(((c as any).weaponProficiencies) ?? [])].sort(),
    tools: [...(((c as any).toolProficiencies) ?? [])].sort(),
    skills: (c as any).skillChoices ?? null,
    features: ((c as any).features ?? []).map((f: any) => `${f.level}|${f.name}|${f.description}`).sort(),
    subclassFeatureLevels: [...(((c as any).subclassFeatureLevels) ?? [])].sort((a, b) => a - b),
  });
}

function ClassDetailModal({
  variants, allSubclasses, onClose,
}: {
  variants: ClassResult[];
  allSubclasses: SubclassResult[];
  onClose: () => void;
}) {
  // SourceTabs flips between editions/imports without closing the modal.
  // [0] is the priority winner (imported > SRD 2024 > SRD 5.1) and is
  // shown by default. Reset the index when the variants array identity
  // changes so a new row tap doesn't keep a stale index.
  const [activeIdx, setActiveIdx] = useState(0);
  useEffect(() => {
    setActiveIdx(0);
  }, [variants]);
  const c = variants[Math.min(activeIdx, variants.length - 1)] ?? variants[0];

  // Match by parent-class key (the canonical link) and fall back to
  // case-insensitive name match. The fallback covers imported subclasses
  // whose source-edition mapping doesn't line up with the active class
  // (e.g. an unrecognized source code, or a homebrew pack that stores a
  // custom parentClassKey). Class names are stable across editions, so
  // matching on name is a reliable safety net.
  const classNameLower = c.name.toLowerCase();
  const matchingSubclasses = allSubclasses.filter(
    (s) =>
      s.parentClassKey === c.key
      || (s.parentClassName ?? '').toLowerCase() === classNameLower,
  );
  // Group same-named variants and pick the richest one to render. The
  // SRD bundle ships a thin Life Domain (2 features); an imported XPHB
  // pack ships a fuller Life Domain (5 features). Picking by feature
  // count surfaces the more complete entry by default. We carry every
  // variant's sources alongside so the card head shows badges for all
  // editions/imports the entry exists in.
  const subclasses = useMemo(() => {
    const buckets = new Map<string, SubclassResult[]>();
    for (const sc of matchingSubclasses) {
      const k = sc.name.toLowerCase();
      const arr = buckets.get(k) ?? [];
      arr.push(sc);
      buckets.set(k, arr);
    }
    const out: Array<{ active: SubclassResult; sources: ImportSource[] }> = [];
    for (const variants of buckets.values()) {
      // Prefer the variant with the most features, tiebreaking by
      // source priority (imported > homebrew > SRD 2024 > SRD 5.1).
      const sorted = variants.slice().sort((a, b) => {
        const ad = a.features?.length ?? 0;
        const bd = b.features?.length ?? 0;
        if (ad !== bd) return bd - ad;
        return sourcePriority(a) - sourcePriority(b);
      });
      const active = sorted[0];
      const sources = collectSources(variants).slice().sort((a, b) => a.code.localeCompare(b.code));
      out.push({ active, sources });
    }
    // Stable ordering: preserve the original list order using the first
    // occurrence of each lowercased name.
    const firstSeen = new Map<string, number>();
    matchingSubclasses.forEach((sc, i) => {
      const k = sc.name.toLowerCase();
      if (!firstSeen.has(k)) firstSeen.set(k, i);
    });
    out.sort(
      (a, b) =>
        (firstSeen.get(a.active.name.toLowerCase()) ?? 0)
        - (firstSeen.get(b.active.name.toLowerCase()) ?? 0),
    );
    return out;
  }, [matchingSubclasses]);
  const featureGroups = groupFeaturesByLevel(
    c.features ?? [],
    (c as { subclassFeatureLevels?: number[] }).subclassFeatureLevels ?? [],
  );

  // L1 features used to render in both Becoming and the Features
  // detailed list; the duplicate copy was dropped from Becoming so
  // Becoming reads as character-creation guidance (gear + multiclass)
  // and Features owns the leveled feature list end-to-end.
  const hasBecoming =
    (c.startingEquipment ?? []).length > 0 ||
    !!c.multiclassPrerequisite ||
    !!c.multiclassProficiencies;

  const anchors = useMemo(() => {
    const list: { id: string; label: string }[] = [
      { id: 'core', label: 'Core Traits' },
    ];
    if (hasBecoming)              list.push({ id: 'becoming',   label: 'Becoming' });
    if (featureGroups.length > 0) list.push({ id: 'features',   label: 'Features' });
    if (subclasses.length > 0)    list.push({ id: 'subclasses', label: 'Subclasses' });
    return list;
  }, [hasBecoming, featureGroups.length, subclasses.length]);

  return (
    <DetailModal
      visible
      onClose={onClose}
      title={c.name}
      subtitle={c.description}
      anchors={anchors}
      headerExtra={
        variants.length > 1 ? (
          <SourceTabs variants={variants} activeIdx={activeIdx} onChange={setActiveIdx} />
        ) : null
      }
    >
      {/* ── Core Traits ──────────────────────────────────────────────── */}
      <DetailSection id="core" style={styles.modalSection}>
        <DetailSectionHeading>{`Core ${c.name} Traits`}</DetailSectionHeading>

        {/* Order mirrors D&D Beyond's class page: primary → hit die →
            saves → skills → weapons → armor → tools, with Spellcasting
            Ability appended only for casters. */}
        {Array.isArray(c.primaryAbility) && c.primaryAbility.length > 0 ? (
          <ProfBlock label="Primary ability" items={c.primaryAbility} />
        ) : null}
        {c.hitDie ? <ProfBlock label="Hit die" items={[`d${c.hitDie} per ${c.name} level`]} /> : null}
        {Array.isArray(c.savingThrows) && c.savingThrows.length > 0 ? (
          <ProfBlock label="Saving throws" items={c.savingThrows} />
        ) : null}
        {c.skillChoices?.from ? (
          <View style={styles.subBlock}>
            <MetaLabel size="sm">{`Skills (choose ${c.skillChoices.count ?? 1})`}</MetaLabel>
            <View style={styles.chipRow}>
              {c.skillChoices.from.map((it) => <Chip key={it} label={it} variant="meta" />)}
            </View>
          </View>
        ) : null}
        <ProfBlock label="Weapons" items={c.weaponProficiencies} />
        <ProfBlock label="Armor"   items={c.armorProficiencies} />
        {Array.isArray(c.toolProficiencies) && c.toolProficiencies.length > 0 ? (
          <ProfBlock label="Tools" items={c.toolProficiencies} joiner="and" />
        ) : null}
        {c.spellcasting ? (
          <ProfBlock label="Spellcasting ability" items={[c.spellcastingAbility ?? '—']} />
        ) : null}
      </DetailSection>

      {/* ── Becoming a [Class] ──────────────────────────────────────── */}
      {hasBecoming ? (
        <DetailSection id="becoming" style={styles.modalSection}>
          <DetailSectionHeading>{`Becoming a ${c.name}`}</DetailSectionHeading>

          {/* As a Level 1 Character — SRD-style bullet prose */}
          <View style={styles.subSection}>
            <Text variant="body-sm" family="body" weight="bold" style={styles.featureLevelLabel}>
              As a Level 1 Character
            </Text>
            <BecomingBullet>
              Gain all the traits in the <Text weight="bold" style={{ color: colors.onSurface }}>{`Core ${c.name} Traits`}</Text> table.
            </BecomingBullet>
            <BecomingBullet>
              Gain the {c.name}'s level 1 features, which are listed in the <Text weight="bold" style={{ color: colors.onSurface }}>{`${c.name} Features`}</Text> table.
            </BecomingBullet>
          </View>

          {/* As a Multiclass Character */}
          {(c.multiclassPrerequisite || c.multiclassProficiencies) ? (
            <View style={styles.subSection}>
              <Text variant="body-sm" family="body" weight="bold" style={styles.featureLevelLabel}>
                As a Multiclass Character
              </Text>
              {c.multiclassPrerequisite ? (
                <Text variant="body-sm" family="body" style={[styles.bodyText, { marginBottom: spacing.xs }]}>
                  Prerequisite: <Text weight="bold" style={{ color: colors.onSurface }}>{c.multiclassPrerequisite}</Text>
                </Text>
              ) : null}
              <BecomingBullet>
                Gain the following traits from the <Text weight="bold" style={{ color: colors.onSurface }}>{`Core ${c.name} Traits`}</Text> table: {multiclassTraitsSentence(c)}
              </BecomingBullet>
              <BecomingBullet>
                Gain the {c.name}'s level 1 features, which are listed in the <Text weight="bold" style={{ color: colors.onSurface }}>{`${c.name} Features`}</Text> table.
              </BecomingBullet>
              {c.multiclassProficiencies?.skills?.from ? (
                <View style={[styles.subBlock, { marginTop: spacing.xs }]}>
                  <MetaLabel size="sm">{`Gain skills (choose ${c.multiclassProficiencies.skills.count ?? 1})`}</MetaLabel>
                  <View style={styles.chipRow}>
                    {c.multiclassProficiencies.skills.from.map((it) => <Chip key={it} label={it} variant="meta" />)}
                  </View>
                </View>
              ) : null}
            </View>
          ) : null}

          {/* Starting equipment — Becoming covers character-creation
              choices (gear + multiclass prereqs). Level 1 features
              live exclusively in the Features section's detailed list
              now to avoid duplication. */}
          {Array.isArray(c.startingEquipment) && c.startingEquipment.length > 0 ? (
            <View style={styles.subSection}>
              <MetaLabel size="sm">Starting equipment</MetaLabel>
              {c.startingEquipment.map((opt, i) => (
                <View key={i} style={styles.bullet}>
                  <Text variant="body-sm" family="body" weight="bold" style={{ color: colors.onSurface }}>
                    Option {opt.label ?? String.fromCharCode(65 + i)}
                  </Text>
                  {opt.items && opt.items.length > 0 ? (
                    <Text variant="body-sm" family="body" style={styles.bodyText}>
                      {opt.items.join(', ')}
                    </Text>
                  ) : null}
                  {opt.gold ? (
                    <Text variant="body-sm" family="body" style={styles.bodyText}>
                      {opt.gold.amount} {opt.gold.currency}
                    </Text>
                  ) : null}
                </View>
              ))}
            </View>
          ) : null}
        </DetailSection>
      ) : null}

      {/* ── Class Features (table + detailed list) ──────────────────── */}
      {featureGroups.length > 0 ? (
        <DetailSection id="features" style={styles.modalSection}>
          <DetailSectionHeading>{`${c.name} Class Features`}</DetailSectionHeading>
          <Text variant="body-sm" family="body" style={[styles.bodyText, { marginBottom: spacing.sm }]}>
            As a {c.name}, you gain the following class features when you reach the specified {c.name} levels. These features are listed in the {c.name} Features table.
          </Text>

          {/* Class table — Level → feature names per level */}
          <View style={styles.subSection}>
            <MetaLabel size="sm">Class table</MetaLabel>
            <ClassFeatureTable klass={c} groups={featureGroups} />
          </View>

          {/* Detailed list — full descriptions grouped by level. Uses
              the same heading style as DetailSection titles so it reads
              as the dominant header inside the Features tab, not a
              minor sub-label like the table caption above it. */}
          <View style={styles.subSection}>
            <DetailSectionHeading>Feature Details by Level</DetailSectionHeading>
            {featureGroups.map(([level, feats]) => (
              <View key={level} style={styles.featureLevelGroup}>
                <Text variant="body-sm" family="body" weight="bold" style={styles.featureLevelLabel}>
                  Level {level}
                </Text>
                {feats.map((f, i) => {
                  const isChild = !!f.parentName;
                  return (
                    <View key={i} style={[styles.bullet, isChild ? styles.bulletNested : null]}>
                      <View style={isChild ? styles.bulletNestedHeading : undefined}>
                        {isChild ? (
                          <Text variant="body-sm" family="body" style={styles.bulletNestedMarker}>↳</Text>
                        ) : null}
                        <Text variant="body-sm" family="body" weight="bold" style={{ color: colors.onSurface }}>{f.name}</Text>
                      </View>
                      {f.description ? (
                        <MarkdownText style={styles.bodyText}>{f.description}</MarkdownText>
                      ) : /subclass feature/i.test(f.name) ? (
                        <Text variant="body-sm" family="body" style={[styles.bodyText, { fontStyle: 'italic', color: colors.onSurfaceVariant }]}>
                          Gain a feature granted by your chosen subclass.
                        </Text>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
        </DetailSection>
      ) : null}

      {/* ── Subclasses (nested cards) ───────────────────────────────── */}
      {subclasses.length > 0 ? (
        <DetailSection id="subclasses" style={styles.modalSection}>
          <DetailSectionHeading>{`Subclasses · unlock at L${c.subclassUnlockLevel}`}</DetailSectionHeading>
          {subclasses.map(({ active: sc, sources }) => (
            <View key={sc.key} style={styles.subclassCard}>
              <View style={styles.subclassHeadRow}>
                <Text variant="title-sm" family="headline" weight="bold" style={{ color: colors.primary, flex: 1 }}>
                  {sc.name}
                </Text>
                {/* Source badges for every variant this subclass exists
                    in — SRD 5.1, SRD 2024, imported pack codes (XPHB,
                    PHB, etc.). The card body shows the richest variant
                    selected by the dedupe logic above. */}
                <View style={styles.subclassSourceStack}>
                  {sources.map((src, i) => (
                    <SourceBadge key={`${sc.key}-src-${i}`} source={src} size="sm" />
                  ))}
                </View>
              </View>
              {sc.description ? (
                <MarkdownText style={[styles.bodyText, { marginTop: 4 }]}>
                  {sc.description}
                </MarkdownText>
              ) : null}
              {Array.isArray(sc.features) && sc.features.length > 0 ? (
                <View style={[styles.subBlock, { marginTop: spacing.xs + 2 }]}>
                  {sc.features.map((f, i) => (
                    <View key={i} style={styles.bullet}>
                      <Text variant="body-sm" family="body" weight="bold" style={{ color: colors.onSurface }}>
                        L{f.level} · {f.name}
                      </Text>
                      <MarkdownText style={styles.bodyText}>{f.description}</MarkdownText>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          ))}
        </DetailSection>
      ) : null}

      {Array.isArray(c.srdVersions) && c.srdVersions.length > 0 ? (
        <View style={styles.modalSection}>
          <SrdVersionsRow versions={c.srdVersions} />
        </View>
      ) : null}
    </DetailModal>
  );
}

/**
 * Class progression table — mirrors the per-class table on D&D Beyond.
 * Always shows Level + Features columns; additional columns are read
 * from `klass.progressionColumns` (e.g. Prof Bonus, Rages, Spell Slots
 * per level for casters). Supports horizontal scrolling so wide tables
 * like Wizard or Warlock don't blow out the modal width.
 */
function ClassFeatureTable({
  klass: c,
  groups,
}: {
  klass: ClassResult;
  groups: Array<[number, Array<{ name: string }>]>;
}) {
  const cols = c.progressionColumns ?? [];
  const rowsByLevel = new Map<number, Record<string, string | number>>();
  (c.progressionTable ?? []).forEach((row) => rowsByLevel.set(row.level, row.values));

  // Derive the level set as the union of progressionTable levels and feature
  // groups, ascending. Lets the table show a row for any level that has data,
  // even if one source omits it.
  // Subclass-feature levels already have a "Subclass feature" entry
  // injected into `groups` by `groupFeaturesByLevel`, so there's no
  // separate stitcher pass here — that would duplicate the cell text.
  const levels = new Set<number>();
  groups.forEach(([lvl]) => levels.add(lvl));
  (c.progressionTable ?? []).forEach((r) => levels.add(r.level));
  const orderedLevels = [...levels].sort((a, b) => a - b);
  const featuresByLevel = new Map<number, string>();
  groups.forEach(([lvl, feats]) => {
    featuresByLevel.set(lvl, feats.map((f) => f.name).join(', '));
  });

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator style={{ flexGrow: 0 }}>
      <View style={styles.classTable}>
        <View style={[styles.classTableRow, styles.classTableHeadRow]}>
          <Text variant="label-sm" weight="bold" uppercase style={[styles.classTableCell, styles.classTableLevelCell]}>
            Level
          </Text>
          {cols.map((col) => (
            <Text
              key={col.key}
              variant="label-sm"
              weight="bold"
              uppercase
              style={[styles.classTableCell, styles.classTableMetaCell]}
            >
              {col.label}
            </Text>
          ))}
          <Text variant="label-sm" weight="bold" uppercase style={[styles.classTableCell, styles.classTableFeaturesCell]}>
            Features
          </Text>
        </View>
        {orderedLevels.map((lvl, i) => {
          const values = rowsByLevel.get(lvl) ?? {};
          const featuresText = featuresByLevel.get(lvl) ?? '—';
          return (
            <View
              key={lvl}
              style={[styles.classTableRow, i === orderedLevels.length - 1 && styles.classTableRowLast]}
            >
              <Text variant="body-sm" family="body" weight="bold" style={[styles.classTableCell, styles.classTableLevelCell, { color: colors.primary }]}>
                {lvl}
              </Text>
              {cols.map((col) => {
                const v = values[col.key];
                return (
                  <Text
                    key={col.key}
                    variant="body-sm"
                    family="body"
                    style={[styles.classTableCell, styles.classTableMetaCell, { color: colors.onSurface }]}
                  >
                    {v == null ? '—' : String(v)}
                  </Text>
                );
              })}
              <Text variant="body-sm" family="body" style={[styles.classTableCell, styles.classTableFeaturesCell, { color: colors.onSurface }]}>
                {featuresText}
              </Text>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

/**
 * Reorder a flat feature list so parents-with-children come first,
 * children sit immediately after their parent, and orphan children go
 * last. Same invariant the per-level bucket uses inside
 * groupFeaturesByLevel — extracted so the Becoming L1 list (which
 * doesn't bucket by level since it's already filtered) can apply the
 * same shape.
 */
function nestParentsAndChildren<T extends { name: string; parentName?: string }>(list: T[]): T[] {
  const parents = list.filter((f) => !f.parentName);
  const childrenByParent = new Map<string, T[]>();
  for (const f of list) {
    if (!f.parentName) continue;
    const arr = childrenByParent.get(f.parentName) ?? [];
    arr.push(f);
    childrenByParent.set(f.parentName, arr);
  }
  const parentsWithKids = parents.filter((p) => childrenByParent.has(p.name));
  const parentsWithoutKids = parents.filter((p) => !childrenByParent.has(p.name));
  const out: T[] = [];
  for (const p of parentsWithKids) {
    out.push(p);
    out.push(...(childrenByParent.get(p.name) ?? []));
    childrenByParent.delete(p.name);
  }
  out.push(...parentsWithoutKids);
  for (const orphans of childrenByParent.values()) out.push(...orphans);
  return out;
}

/** Group features by level, preserving insertion order within each level. */
function groupFeaturesByLevel(
  features: Array<{ level: number; name: string; description?: string; parentName?: string }>,
  subclassFeatureLevels: number[] = [],
): Array<[number, Array<{ name: string; description?: string; parentName?: string }>]> {
  const buckets = new Map<number, Array<{ name: string; description?: string; parentName?: string }>>();
  for (const f of features) {
    const list = buckets.get(f.level) ?? [];
    list.push({ name: f.name, description: f.description, parentName: f.parentName });
    buckets.set(f.level, list);
  }
  // Re-order each bucket so parents-with-children come first, children
  // sit immediately after their parent, childless parents follow, and
  // orphan children go last. See nestParentsAndChildren for details.
  for (const [lvl, list] of buckets) {
    buckets.set(lvl, nestParentsAndChildren(list));
  }
  // Inject a "Subclass feature" placeholder at every level the class
  // gains one, unless a real subclass-themed feature is already in
  // the bucket (e.g. XPHB's "Fighter Subclass" / "Primal Path" /
  // "Bardic College" — these resolve through gainSubclassFeature
  // markers and carry prose). 5.1 SRD markers are bare, so the
  // placeholder is needed there. Match common subclass-feature names
  // so we don't double up.
  const SUBCLASS_NAME_PATTERN = /subclass feature|subclass$|^(?:fighter|barbarian|bard|cleric|druid|monk|paladin|ranger|rogue|sorcerer|warlock|wizard|primal|martial|sacred|divine|otherworldly|arcane|roguish|monastic|ranger|sorcerous|bardic)\s+(?:archetype|college|domain|circle|origin|patron|path|tradition|subclass|conclave|oath)/i;
  for (const lvl of subclassFeatureLevels) {
    const list = buckets.get(lvl) ?? [];
    if (!list.some((f) => SUBCLASS_NAME_PATTERN.test(f.name))) {
      list.push({ name: 'Subclass feature' });
      buckets.set(lvl, list);
    }
  }
  return [...buckets.entries()].sort((a, b) => a[0] - b[0]);
}

/** Bullet row used inside the Becoming-a-Class section. */
function BecomingBullet({ children }: { children: ReactNode }) {
  return (
    <View style={styles.becomingBullet}>
      <Text variant="body-sm" family="body" style={[styles.bodyText, styles.becomingBulletDot]}>•</Text>
      <Text variant="body-sm" family="body" style={[styles.bodyText, styles.becomingBulletText]}>{children}</Text>
    </View>
  );
}

/**
 * Build the SRD-style sentence describing what a multiclass character pulls
 * from the Core Class Traits table. The Hit Point Die is always included
 * (you always inherit the new class's HD); proficiencies follow as a
 * comma-separated list with "and" before the last item, using the SRD's
 * verbal style:
 *   weapons → "proficiency with X"
 *   armor   → "training with X" (2024 phrasing — was "proficiency with" in 5.1
 *             but the 2024 SRD universally uses "training with"; we use the
 *             newer phrasing across the board for consistency)
 *   tools   → "proficiency with X"
 */
function multiclassTraitsSentence(c: ClassResult): string {
  const phrases: string[] = ['Hit Point Die'];
  const mc = c.multiclassProficiencies;
  if (mc?.weapons && mc.weapons.length > 0) {
    phrases.push(`proficiency with ${joinList(mc.weapons.map(formatTraitWord))}`);
  }
  if (mc?.tools && mc.tools.length > 0) {
    phrases.push(`proficiency with ${joinList(mc.tools.map(formatTraitWord))}`);
  }
  if (mc?.armor && mc.armor.length > 0) {
    phrases.push(`training with ${joinList(mc.armor.map(formatTraitWord))}`);
  }
  // Skills: a few classes (Bard/Ranger/Rogue) grant a skill choice on
  // multiclass. Render as "proficiency with N skills of your choice"
  // — listing the full pool inline would balloon the sentence, and
  // most lists are dense enough to be unhelpful (Bard lets you pick
  // from all 18 skills).
  if (mc?.skills && mc.skills.count > 0) {
    const n = mc.skills.count;
    phrases.push(`proficiency with ${n} ${n === 1 ? 'skill' : 'skills'} of your choice`);
  }
  return joinList(phrases) + '.';
}

/**
 * Inline-trait formatter. Lowercases all entries so the multiclass
 * sentence reads naturally ("training with light armor", "proficiency
 * with one musical instrument of your choice"). Specific proper nouns
 * that need to stay capitalized (e.g. "Thieves' Tools", "Vicious
 * Mockery") are rare in the proficiency lists; if any surface, special-
 * case them here.
 */
function formatTraitWord(s: string): string {
  return s.toLowerCase();
}

/** Comma-separated list with an Oxford "and" before the final item. */
function joinList(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

export function BackgroundsList({
  items, srdVersion, rowActions, headerExtra,
}: {
  items: BackgroundResult[];
  srdVersion?: string;
  rowActions?: (active: BackgroundResult) => React.ReactNode;
  headerExtra?: React.ReactNode;
}) {
  return (
    <TableShell<BackgroundResult>
      items={items}
      fingerprint={backgroundFingerprint}
      searchPlaceholder="Search backgrounds…"
      activeSrdVersion={srdVersion}
      rowActions={rowActions}
      headerExtra={headerExtra}
      columns={[
        { key: 'name', label: 'Name', cell: (b) => b.name, compare: (a, b) => a.name.localeCompare(b.name), width: 160, defaultSort: 'asc' },
        {
          key: 'skills',
          label: 'Skills',
          cell: (b) => {
            const skills: string[] = (b as any).skillProficiencies ?? [];
            return skills.length > 0 ? skills.join(', ') : '—';
          },
          compare: (a, b) => {
            const aS = ((a as any).skillProficiencies ?? []).join(',');
            const bS = ((b as any).skillProficiencies ?? []).join(',');
            return aS.localeCompare(bS);
          },
          width: 200,
        },
        {
          key: 'ability-options',
          label: 'Ability options',
          cell: (b) => {
            const opts: string[] = (b as any).abilityScoreOptions ?? [];
            return opts.length > 0 ? opts.join(', ') : '—';
          },
          compare: (a, b) => {
            const aO = ((a as any).abilityScoreOptions ?? []).join(',');
            const bO = ((b as any).abilityScoreOptions ?? []).join(',');
            return aO.localeCompare(bO);
          },
          width: 160,
        },
        {
          key: 'tool',
          label: 'Tool',
          cell: (b) => (b as any).toolProficiency ?? '—',
          compare: (a, b) => ((a as any).toolProficiency ?? '').localeCompare((b as any).toolProficiency ?? ''),
          width: 140,
        },
        {
          key: 'origin-feat',
          label: 'Origin feat',
          cell: (b) => (b as any).originFeat ?? '—',
          compare: (a, b) => ((a as any).originFeat ?? '').localeCompare((b as any).originFeat ?? ''),
          width: 140,
        },
      ]}
      facets={[
        {
          key: 'skill',
          label: 'Skill',
          getValues: (b) => ((b as any).skillProficiencies ?? []) as string[],
        },
        {
          key: 'origin-feat',
          label: 'Origin feat',
          getValues: (b) => ((b as any).originFeat ? ['Has origin feat'] : ['No origin feat']),
          staticOptions: ['Has origin feat', 'No origin feat'],
        },
      ]}
      renderBody={(b) => {
        const bAny = b as any;
        const skills: string[] = bAny.skillProficiencies ?? [];
        return (
          <>
            {b.description ? <MarkdownText style={styles.bodyText}>{b.description}</MarkdownText> : null}
            <ProfBlock label="Skill proficiencies" items={skills} />
            {Array.isArray(bAny.abilityScoreOptions) && bAny.abilityScoreOptions.length > 0 ? (
              <ProfBlock label="Ability score options" items={bAny.abilityScoreOptions} />
            ) : null}
            {bAny.toolProficiency ? (
              <View style={styles.subBlock}>
                <MetaLabel size="sm">Tool</MetaLabel>
                <Text variant="body-sm" family="body" style={styles.bodyText}>{bAny.toolProficiency}</Text>
              </View>
            ) : null}
            {bAny.originFeat ? (
              <View style={styles.subBlock}>
                <MetaLabel size="sm">Origin feat</MetaLabel>
                <Text variant="body-sm" family="body" style={styles.bodyText}>{bAny.originFeat}</Text>
              </View>
            ) : null}
            {bAny.startingEquipment ? (
              <View style={styles.subBlock}>
                <MetaLabel size="sm">Starting equipment</MetaLabel>
                <MarkdownText style={styles.bodyText}>{bAny.startingEquipment}</MarkdownText>
              </View>
            ) : null}
          </>
        );
      }}
    />
  );
}

function backgroundFingerprint(b: BackgroundResult): string {
  const bAny = b as any;
  return JSON.stringify({
    description: b.description ?? '',
    skillProficiencies: [...(bAny.skillProficiencies ?? [])].sort(),
    abilityScoreOptions: [...(bAny.abilityScoreOptions ?? [])].sort(),
    toolProficiency: bAny.toolProficiency ?? '',
    originFeat: bAny.originFeat ?? '',
    startingEquipment: bAny.startingEquipment ?? '',
  });
}

export function SubclassesList({
  items, srdVersion, rowActions, headerExtra,
}: {
  items: SubclassResult[];
  srdVersion?: string;
  rowActions?: (active: SubclassResult) => React.ReactNode;
  headerExtra?: React.ReactNode;
}) {
  return (
    <TableShell<SubclassResult>
      items={items}
      fingerprint={subclassFingerprint}
      // Group by `<parentClass>::<name>` so a subclass renamed across editions
      // (Evocation → Evoker) doesn't collide, and same-named subclasses
      // across different parent classes don't merge.
      groupKey={(s) => `${s.parentClassKey ?? ''}::${s.name.toLowerCase()}`}
      searchPlaceholder="Search subclasses…"
      activeSrdVersion={srdVersion}
      rowActions={rowActions}
      headerExtra={headerExtra}
      columns={[
        { key: 'name', label: 'Name', cell: (s) => s.name, compare: (a, b) => a.name.localeCompare(b.name), width: 160, defaultSort: 'asc' },
        {
          key: 'parent',
          label: 'Class',
          cell: (s) => s.parentClassName ?? (s.parentClassKey ? capitalize(s.parentClassKey) : '—'),
          compare: (a, b) => (a.parentClassName ?? a.parentClassKey ?? '').localeCompare(b.parentClassName ?? b.parentClassKey ?? ''),
          width: 130,
        },
        {
          key: 'unlock',
          label: 'Unlock',
          cell: (s) => typeof s.unlockLevel === 'number' ? `L${s.unlockLevel}` : '—',
          compare: (a, b) => (typeof a.unlockLevel === 'number' ? a.unlockLevel : 99) - (typeof b.unlockLevel === 'number' ? b.unlockLevel : 99),
          width: 80,
        },
      ]}
      facets={[
        {
          key: 'parent',
          label: 'Class',
          getValues: (s) => (s.parentClassName ? [s.parentClassName] : (s.parentClassKey ? [capitalize(s.parentClassKey)] : [])),
        },
      ]}
      renderBody={(s) => (
        <>
          {s.description ? <MarkdownText style={styles.bodyText}>{s.description}</MarkdownText> : null}
          {Array.isArray(s.features) && s.features.length > 0 ? (
            <View style={styles.subBlock}>
              <MetaLabel size="sm">Features</MetaLabel>
              {s.features.map((f, i) => (
                <View key={i} style={styles.bullet}>
                  <Text variant="body-sm" family="body" weight="bold" style={{ color: colors.onSurface }}>
                    L{f.level} · {f.name}
                  </Text>
                  <MarkdownText style={styles.bodyText}>{f.description}</MarkdownText>
                </View>
              ))}
            </View>
          ) : null}
        </>
      )}
    />
  );
}

function subclassFingerprint(s: SubclassResult): string {
  return JSON.stringify({
    description: s.description ?? '',
    parentClassKey: s.parentClassKey ?? '',
    unlockLevel: s.unlockLevel ?? null,
    features: (s.features ?? []).map((f) => `${f.level}|${f.name}|${f.description}`).sort(),
  });
}

export function SpellsList({
  items, srdVersion, rowActions, headerExtra,
}: {
  items: SpellResult[];
  srdVersion?: string;
  rowActions?: (active: SpellResult) => React.ReactNode;
  headerExtra?: React.ReactNode;
}) {
  return (
    <TableShell<SpellResult>
      items={items}
      fingerprint={spellFingerprint}
      searchPlaceholder="Search spells…"
      banner={<SeedBanner type="spells" />}
      activeSrdVersion={srdVersion}
      rowActions={rowActions}
      headerExtra={headerExtra}
      columns={[
        { key: 'name', label: 'Name', cell: (s) => s.name, compare: (a, b) => a.name.localeCompare(b.name), width: 160 },
        {
          key: 'level',
          label: 'Level',
          cell: (s) => s.level === 0 ? 'Cantrip' : `${s.level}`,
          compare: (a, b) => a.level - b.level,
          width: 70,
          defaultSort: 'asc',
        },
        { key: 'school', label: 'School', cell: (s) => s.school ?? '—', compare: (a, b) => (a.school ?? '').localeCompare(b.school ?? ''), width: 120 },
        { key: 'casting-time', label: 'Casting', cell: (s) => s.castingTime ?? '—', compare: (a, b) => (a.castingTime ?? '').localeCompare(b.castingTime ?? ''), width: 110 },
        { key: 'range', label: 'Range', cell: (s) => s.range ?? '—', compare: (a, b) => (a.range ?? '').localeCompare(b.range ?? ''), width: 110 },
        { key: 'duration', label: 'Duration', cell: (s) => s.duration ?? '—', compare: (a, b) => (a.duration ?? '').localeCompare(b.duration ?? ''), width: 130 },
        {
          key: 'classes',
          label: 'Classes',
          cell: (s) => (s.classes?.length ? s.classes.join(', ') : '—'),
          compare: (a, b) => (a.classes?.[0] ?? '').localeCompare(b.classes?.[0] ?? ''),
          width: 180,
        },
      ]}
      facets={[
        {
          key: 'level',
          label: 'Level',
          getValues: (s) => [s.level === 0 ? 'Cantrip' : `Level ${s.level}`],
          staticOptions: ['Cantrip', 'Level 1', 'Level 2', 'Level 3', 'Level 4', 'Level 5', 'Level 6', 'Level 7', 'Level 8', 'Level 9'],
        },
        { key: 'school', label: 'School', getValues: (s) => (s.school ? [s.school] : []) },
        { key: 'casting-time', label: 'Casting time', getValues: (s) => (s.castingTime ? [s.castingTime] : []) },
        {
          key: 'concentration',
          label: 'Concentration',
          getValues: (s) => [s.concentration ? 'Concentration' : 'No concentration'],
          staticOptions: ['Concentration', 'No concentration'],
        },
        { key: 'class', label: 'Class', getValues: (s) => s.classes ?? [] },
      ]}
      renderBody={(s) => (
        <>
          {s.description ? <MarkdownText style={styles.bodyText}>{s.description}</MarkdownText> : null}
          <View style={styles.subBlock}>
            <View style={styles.chipRow}>
              {s.range ? <Chip label={`Range: ${s.range}`} variant="meta" /> : null}
              {s.duration ? <Chip label={`Duration: ${s.duration}`} variant="meta" /> : null}
              {s.concentration ? <Chip label="Concentration" variant="accent" /> : null}
            </View>
          </View>
          {Array.isArray(s.components) && s.components.length > 0 ? <ProfBlock label="Components" items={s.components} /> : null}
          {Array.isArray(s.classes) && s.classes.length > 0 ? <ProfBlock label="Classes" items={s.classes} /> : null}
        </>
      )}
    />
  );
}

function spellFingerprint(s: SpellResult): string {
  return JSON.stringify({
    description: s.description ?? '',
    level: s.level,
    school: s.school,
    castingTime: s.castingTime,
    range: s.range,
    duration: s.duration,
    concentration: !!s.concentration,
    ritual: !!s.ritual,
    components: [...(s.components ?? [])].sort(),
    classes: [...(s.classes ?? [])].sort(),
  });
}

// ── Generic source-grouping infrastructure ─────────────────────────────────
//
// Lists with multiple-source content (SRD 5.1 + SRD 2024 + imported
// pack books) collapse same-named entries into one row, with a tab strip
// inside the expanded body to switch between non-identical variants and
// alphabetically-sorted source badges in the row head. `groupVariants`
// + `<TableShell>` factor the boilerplate out of every list.

/** Anything that can flow through groupVariants — name + provenance fields. */
type Variant = {
  name: string;
  tier?: ContentTier;
  importSource?: ImportSource;
  srdVersions?: string[];
};

type VariantGroup<T extends Variant> = {
  /** Stable list-key — lowercased name so React preserves expand state across filter changes. */
  id: string;
  variants: T[];
};

/**
 * Group same-named entries into one row. Variants are deduped by the
 * caller-supplied `fingerprint` (rendered fields only, never provenance)
 * and sorted by source priority: imported > homebrew > SRD 2024 > SRD 5.1.
 *
 * `groupKey` defaults to lowercased name. Lists with non-unique names per
 * sub-scope (e.g. same-named subclasses across different parent classes)
 * pass a custom key — typically `${scope}::${name.toLowerCase()}`.
 */
function groupVariants<T extends Variant>(
  items: T[],
  fingerprint: (v: T) => string,
  groupKey: (v: T) => string = (v) => v.name.toLowerCase(),
  variantSort: (a: T, b: T) => number = variantPrioritySort,
): VariantGroup<T>[] {
  const buckets = new Map<string, T[]>();
  for (const it of items) {
    const k = groupKey(it);
    const arr = buckets.get(k) ?? [];
    arr.push(it);
    buckets.set(k, arr);
  }
  const out: VariantGroup<T>[] = [];
  for (const [id, list] of buckets) {
    out.push({ id, variants: dedupeIdenticalVariants(list, fingerprint).sort(variantSort) });
  }
  return out;
}

function dedupeIdenticalVariants<T extends Variant>(list: T[], fingerprint: (v: T) => string): T[] {
  const seen = new Map<string, T>();
  for (const v of list) {
    const fp = fingerprint(v);
    if (!seen.has(fp)) seen.set(fp, v);
  }
  return [...seen.values()];
}

function variantPrioritySort<T extends Variant>(a: T, b: T): number {
  return sourcePriority(a) - sourcePriority(b);
}

function sourcePriority(v: Variant): number {
  // Tier wins first — homebrew tier (which includes both authored
  // homebrew and imported_content) always outranks SRD. Without this,
  // an SRD entry that ships an `importSource` for badge rendering
  // (e.g. "SRD 2024" provenance) would tie with a real imported entry,
  // and the SRD one would win on insertion order.
  if (v.tier === 'homebrew') return 0;
  if (v.srdVersions?.includes('SRD_2.0')) return 1;
  if (v.srdVersions?.includes('SRD_5.1')) return 2;
  return 3;
}

/**
 * Build the full source set across a group's variants, splitting SRD
 * entries by srdVersions so a 5.1 + 2.0 entry shows two badges instead
 * of the collapsed "SRD" code from srdSource().
 *
 * `activeSrdVersion` (when set) suppresses off-edition SRD badges — on
 * the 2024 system page, an SRD entry tagged with both 5.1 and 2.0 only
 * shows the SRD 2024 badge; the 5.1 badge would be redundant context.
 * Imported sources (PHB etc.) are unaffected.
 */
function collectSources(variants: Variant[], activeSrdVersion?: string): ImportSource[] {
  const out: ImportSource[] = [];
  const seen = new Set<string>();
  for (const v of variants) {
    if (v.tier === 'srd' && v.srdVersions && v.srdVersions.length > 0) {
      for (const ver of v.srdVersions) {
        if (activeSrdVersion && ver !== activeSrdVersion) continue;
        const src = srdVersionSource(ver);
        const k = sourceKey(src);
        if (!seen.has(k)) { seen.add(k); out.push(src); }
      }
    } else if (v.importSource) {
      const k = sourceKey(v.importSource);
      if (!seen.has(k)) { seen.add(k); out.push(v.importSource); }
    }
  }
  return out;
}

/**
 * Primary source for the active variant. SRD variants synthesize a
 * per-edition source (preferring 2024) instead of using the collapsed
 * "SRD" code, so the head badge matches the alphabetical extras list.
 *
 * `activeSrdVersion` pins the choice to that edition when the variant
 * is in it, so the foot label on the 2024 system page reads "SRD 2024"
 * even if the variant is also in 5.1.
 */
function activeVariantPrimarySource(v: Variant, activeSrdVersion?: string): ImportSource | null {
  if (v.tier !== 'srd') return v.importSource ?? null;
  if (activeSrdVersion && v.srdVersions?.includes(activeSrdVersion)) {
    return srdVersionSource(activeSrdVersion);
  }
  if (v.srdVersions?.includes('SRD_2.0')) return srdVersionSource('SRD_2.0');
  if (v.srdVersions?.includes('SRD_5.1')) return srdVersionSource('SRD_5.1');
  return v.importSource ?? null;
}

function srdVersionSource(version: string): ImportSource {
  if (version === 'SRD_2.0') return { code: 'SRD 2024', name: 'Systems Reference Document 2.0 (2024)' };
  if (version === 'SRD_5.1') return { code: 'SRD 2014', name: 'Systems Reference Document 5.1 (2014)' };
  return { code: 'SRD', name: 'Systems Reference Document' };
}

function sourceKey(s: ImportSource): string {
  return `${s.code}|${s.page ?? ''}`;
}

function variantLabel(v: Variant, groupIsItemVariantSet?: boolean): string {
  // Magic-item variants stamp a `data.variantLabel` ("+1", "Adamantine",
  // …) at transform time. When the group contains at least one such
  // variant, the tab UI flips into "variant picker" mode — every tab
  // reads as a variant label and the base item (no label) gets "Base".
  // For groups without that signal we fall back to source-tab labels.
  if (groupIsItemVariantSet) {
    const itemVariantLabel = (v as { data?: { variantLabel?: unknown } }).data?.variantLabel;
    if (typeof itemVariantLabel === 'string' && itemVariantLabel.length > 0) {
      return itemVariantLabel;
    }
    return 'Base';
  }
  if (v.importSource?.code) return v.importSource.code;
  if (v.tier === 'homebrew') return 'Homebrew';
  if (v.srdVersions?.includes('SRD_2.0')) return 'SRD 2024';
  if (v.srdVersions?.includes('SRD_5.1')) return 'SRD 2014';
  return 'Source';
}

function SourceTabs<T extends Variant>({
  variants, activeIdx, onChange,
}: {
  variants: T[];
  activeIdx: number;
  onChange: (i: number) => void;
}) {
  // Detect "magic-item variant" mode by checking whether any sibling in
  // the group carries a `data.variantLabel`. When at least one does,
  // the tabs flip into variant-picker mode (Base / +1 / +2 / Adamantine
  // / …) instead of source-picker mode (XPHB / SRD 2024 / …). The two
  // modes never mix — magic-item variants always carry their base's
  // source provenance, so the source-tab story is uniform within the
  // group.
  const isItemVariantSet = variants.some((v) =>
    typeof (v as { data?: { variantLabel?: unknown } }).data?.variantLabel === 'string',
  );
  return (
    <View style={styles.sourceTabs}>
      {variants.map((v, i) => {
        const active = i === activeIdx;
        return (
          <Pressable
            key={i}
            onPress={() => onChange(i)}
            style={[styles.sourceTab, active && styles.sourceTabActive]}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
          >
            <Text
              variant="label-sm"
              weight="bold"
              uppercase
              style={{
                color: active ? colors.onPrimaryContainer : colors.onSurfaceVariant,
                letterSpacing: 1.25,
              }}
            >
              {variantLabel(v, isItemVariantSet)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ── Compact-table shell ────────────────────────────────────────────────────
//
// Lists with multi-source content can run into thousands of entries
// (items 1500+, monsters 655, spells 341). The shell renders a compact
// table with a Name column pinned left, a chevron + alphabetical source
// badges pinned right, and a horizontally scrollable middle region for
// the type-specific columns. Tapping a column header sorts the list;
// tapping the row expands it inline. Filters live in a separate sheet
// reachable from a button next to the search bar.
//
// State is per-mount (resets on sub-tab change) — persisting filters
// across navigation is more state than the feature warrants.

/**
 * Column spec for the table. Each column contributes:
 * - a header label that tap-sorts the list (toggles asc/desc)
 * - a per-row cell renderer that returns a compact string
 *   (the table renders cells as Text; multi-line content goes in the
 *   expanded body, not a column)
 *
 * `compare` runs against the *head* variant of each group
 * (groupVariants already sorts within a group by source priority, so [0]
 * is the canonical entry).
 */
type TableColumn<T extends Variant> = {
  /** Stable key. */
  key: string;
  /** Header label. */
  label: string;
  /** Cell text for a single entry. */
  cell: (v: T) => string;
  /** Comparator for sort. */
  compare: (a: T, b: T) => number;
  /** Fixed cell width. Required because the middle region is
   *  horizontally scrollable — flex sizing has nothing to flex within. */
  width: number;
  /** Default column for first-mount sort. Only one column should set this. */
  defaultSort?: 'asc' | 'desc';
};

/**
 * Filter facet — one column / category that can be filtered. Values are
 * derived from the data unless `staticOptions` is supplied (used for
 * boolean facets like "Concentration" or "Has prerequisites" where we
 * want the option list fixed regardless of which entries are loaded).
 *
 * `predicate` runs once per group; a group passes if *any* of its
 * variants satisfies the predicate for *all* selected values within the
 * facet (OR within facet, AND across facets — the standard filter UX).
 */
type FilterFacet<T extends Variant> = {
  /** Stable key. */
  key: string;
  /** User-facing label ("School", "Source", "Class"). */
  label: string;
  /**
   * Pull the values this entry contributes to the facet. An entry can
   * contribute multiple values (e.g. a spell's classes). Returning [] is
   * fine — that entry just won't match this facet.
   */
  getValues: (v: T) => string[];
  /** Optional fixed option list. Falls back to dynamic discovery. */
  staticOptions?: string[];
  /** Optional display transform (e.g. lowercase → Title Case). */
  formatValue?: (v: string) => string;
};

type TableShellProps<T extends Variant> = {
  items: T[];
  fingerprint: (v: T) => string;
  /** Optional custom group-key (defaults to lowercased name). */
  groupKey?: (v: T) => string;
  /** Optional comparator that orders the variants[] inside each group.
   *  Defaults to `variantPrioritySort` (homebrew/imported tier first,
   *  then SRD 2024, then SRD 5.1). Items override this so base rows
   *  sort ahead of their magic variants — the row should display
   *  "Greatsword" rather than "+1 Greatsword" by default. */
  variantSort?: (a: T, b: T) => number;
  searchPlaceholder: string;
  /** Column specs. Tap-sort headers, fixed widths, scrollable middle region. */
  columns: TableColumn<T>[];
  /** Filter facets shown in the Filters sheet. Source is auto-included. */
  facets: FilterFacet<T>[];
  /** Optional banner above the search bar (e.g. SeedBanner). */
  banner?: React.ReactNode;
  /** Render the expanded body for a single active variant. Required unless
   *  `onRowTap` is supplied — that mode disables inline expand. */
  renderBody?: (active: T) => React.ReactNode;
  /** When set, tapping a row calls this instead of toggling expand.
   *  Used by classes, which open a separate detail modal. */
  onRowTap?: (group: VariantGroup<T>) => void;
  /** When set, suppresses off-edition SRD badges so the 2024 system page
   *  only shows "SRD 2024" badges (and vice versa). */
  activeSrdVersion?: string;
  /** Optional per-row action affordances rendered in the pinned right
   *  gutter alongside the chevron — used by the homebrew pack page to
   *  surface edit / delete buttons on authored rows. The callback runs
   *  once per active variant; return null to skip the slot entirely
   *  (e.g. for read-only imported variants). */
  rowActions?: (active: T) => React.ReactNode;
  /** Optional content rendered above the table header row (inside the
   *  list shell, below the search bar + filter chips). The pack page
   *  uses this to host its per-tab "+ Add" button so authoring lives
   *  next to the entries it adds to. */
  headerExtra?: React.ReactNode;
};

function TableShell<T extends Variant>({
  items, fingerprint, groupKey, variantSort, searchPlaceholder,
  columns, facets, banner, renderBody, onRowTap, activeSrdVersion,
  rowActions, headerExtra,
}: TableShellProps<T>) {
  const [q, setQ] = useState('');
  // Sort state: which column key, asc or desc. Default = first column
  // with `defaultSort` set, else first column ascending.
  const defaultCol = columns.find((c) => c.defaultSort) ?? columns[0];
  const [sortKey, setSortKey] = useState(defaultCol?.key ?? '');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(defaultCol?.defaultSort ?? 'asc');
  const [filters, setFilters] = useState<Record<string, Set<string>>>({});
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const exp = useExpanded();

  const activeColumn = columns.find((c) => c.key === sortKey) ?? columns[0];

  // Always include Source as the universal facet (every list can be
  // filtered by which book / pack the entry came from). Built from the
  // collected sources across the entire item set so the picker shows
  // every value the user could plausibly select, even if a search query
  // narrows the visible rows below.
  const allFacets = useMemo<FilterFacet<T>[]>(() => {
    return [
      ...facets,
      {
        key: 'source',
        label: 'Source',
        getValues: (v) => collectSources([v], activeSrdVersion).map((s) => s.code),
      },
    ];
  }, [facets, activeSrdVersion]);

  // Discover dynamic option lists across the full item set.
  const facetOptions = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const f of allFacets) {
      if (f.staticOptions) { out[f.key] = f.staticOptions; continue; }
      const seen = new Set<string>();
      for (const it of items) {
        for (const val of f.getValues(it)) {
          if (val) seen.add(val);
        }
      }
      out[f.key] = [...seen].sort();
    }
    return out;
  }, [allFacets, items]);

  const groups = useMemo(() => {
    const filteredByText = filterByName(items, q);
    const filteredByFacets = filteredByText.filter((it) => {
      for (const f of allFacets) {
        const sel = filters[f.key];
        if (!sel || sel.size === 0) continue;
        const vals = f.getValues(it);
        const hit = vals.some((v) => sel.has(v));
        if (!hit) return false;
      }
      return true;
    });
    const grouped = groupVariants(filteredByFacets, fingerprint, groupKey, variantSort);
    if (activeColumn) {
      const sign = sortDir === 'asc' ? 1 : -1;
      grouped.sort((a, b) => sign * activeColumn.compare(a.variants[0], b.variants[0]));
    }
    return grouped;
  }, [items, q, filters, allFacets, fingerprint, groupKey, variantSort, activeColumn, sortDir]);

  function onColumnTap(colKey: string) {
    if (sortKey === colKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(colKey);
      setSortDir('asc');
    }
  }

  function toggleFacetValue(facetKey: string, value: string) {
    setFilters((prev) => {
      const next = { ...prev };
      const existing = new Set(next[facetKey] ?? []);
      if (existing.has(value)) existing.delete(value);
      else existing.add(value);
      next[facetKey] = existing;
      return next;
    });
  }

  function clearAllFilters() { setFilters({}); }

  const activeFilterCount = Object.values(filters).reduce((n, s) => n + s.size, 0);

  return (
    <View style={styles.list}>
      {banner}
      <View style={styles.shellTopRow}>
        <View style={{ flex: 1 }}>
          <SearchBar value={q} onChange={setQ} placeholder={searchPlaceholder} />
        </View>
        <Pressable
          onPress={() => setFilterSheetOpen(true)}
          style={[styles.filtersBtn, activeFilterCount > 0 && styles.filtersBtnActive]}
          accessibilityRole="button"
          accessibilityLabel={`Filters${activeFilterCount > 0 ? `, ${activeFilterCount} active` : ''}`}
        >
          <Icon
            name="filter-list"
            size={16}
            color={activeFilterCount > 0 ? colors.onPrimaryContainer : colors.onSurfaceVariant}
          />
          <Text
            variant="label-sm"
            weight="bold"
            uppercase
            style={{
              color: activeFilterCount > 0 ? colors.onPrimaryContainer : colors.onSurfaceVariant,
              letterSpacing: 1.25,
            }}
          >
            Filters{activeFilterCount > 0 ? ` · ${activeFilterCount}` : ''}
          </Text>
        </Pressable>
      </View>

      {headerExtra}

      <TableHeader
        columns={columns}
        sortKey={sortKey}
        sortDir={sortDir}
        onColumnTap={onColumnTap}
      />

      {groups.map((g) => (
        <TableRow
          key={g.id}
          group={g}
          columns={columns}
          expanded={!onRowTap && exp.isOpen(g.id)}
          onToggle={() => onRowTap ? onRowTap(g) : exp.toggle(g.id)}
          renderBody={renderBody}
          showChevron={!onRowTap}
          activeSrdVersion={activeSrdVersion}
          rowActions={rowActions}
        />
      ))}
      {groups.length === 0 ? <EmptyHit q={q} /> : null}

      {filterSheetOpen ? (
        <FiltersSheet
          facets={allFacets}
          options={facetOptions}
          selected={filters}
          onToggle={toggleFacetValue}
          onClearAll={clearAllFilters}
          onClose={() => setFilterSheetOpen(false)}
          activeCount={activeFilterCount}
        />
      ) : null}
    </View>
  );
}

/** Header row. Pinned-name + horizontal-scroll middle + pinned chevron gutter. */
function TableHeader<T extends Variant>({
  columns, sortKey, sortDir, onColumnTap,
}: {
  columns: TableColumn<T>[];
  sortKey: string;
  sortDir: 'asc' | 'desc';
  onColumnTap: (key: string) => void;
}) {
  const [nameCol, ...restCols] = columns;
  if (!nameCol) return null;
  return (
    <View style={styles.tableRow}>
      <Pressable
        onPress={() => onColumnTap(nameCol.key)}
        style={[styles.tableHeadCell, styles.tableNameCol, { width: nameCol.width }]}
      >
        <HeaderCellLabel label={nameCol.label} sorted={sortKey === nameCol.key ? sortDir : null} />
      </Pressable>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tableScrollContent}
        style={{ flex: 1 }}
      >
        {restCols.map((c) => (
          <Pressable
            key={c.key}
            onPress={() => onColumnTap(c.key)}
            style={[styles.tableHeadCell, { width: c.width }]}
          >
            <HeaderCellLabel label={c.label} sorted={sortKey === c.key ? sortDir : null} />
          </Pressable>
        ))}
      </ScrollView>
      {/* Right gutter mirrors TableRow's chevron + sources area. The
          "Sources" label sits over the badge stack; the chevron column
          stays unlabelled. */}
      <View style={styles.tableRightGutterHead}>
        <Text
          variant="label-sm"
          weight="bold"
          uppercase
          style={{ color: colors.onSurfaceVariant, letterSpacing: 1.25 }}
          numberOfLines={1}
        >
          Sources
        </Text>
      </View>
    </View>
  );
}

function HeaderCellLabel({ label, sorted }: { label: string; sorted: 'asc' | 'desc' | null }) {
  return (
    <View style={styles.headerCellInner}>
      <Text
        variant="label-sm"
        weight="bold"
        uppercase
        style={{
          color: sorted ? colors.primary : colors.onSurfaceVariant,
          letterSpacing: 1.25,
        }}
        numberOfLines={1}
      >
        {label}
      </Text>
      {sorted ? (
        <Icon
          name={sorted === 'asc' ? 'arrow-upward' : 'arrow-downward'}
          size={12}
          color={colors.primary}
        />
      ) : null}
    </View>
  );
}

/** One data row. Pinned name + scroll middle + pinned chevron/sources;
 *  expanded body renders below at full width. */
function TableRow<T extends Variant>({
  group, columns, expanded, onToggle, renderBody, showChevron, activeSrdVersion, rowActions,
}: {
  group: VariantGroup<T>;
  columns: TableColumn<T>[];
  expanded: boolean;
  onToggle: () => void;
  renderBody?: (active: T) => React.ReactNode;
  showChevron: boolean;
  activeSrdVersion?: string;
  rowActions?: (active: T) => React.ReactNode;
}) {
  const [activeIdx, setActiveIdx] = useState(0);
  const active = group.variants[activeIdx] ?? group.variants[0];
  const allSources = collectSources(group.variants, activeSrdVersion)
    .slice()
    .sort((a, b) => a.code.localeCompare(b.code));
  const footSource = activeVariantPrimarySource(active, activeSrdVersion);
  const isHomebrew = active.tier === 'homebrew';
  const [nameCol, ...restCols] = columns;
  if (!nameCol) return null;

  return (
    <View style={[styles.tableRowOuter, isHomebrew && styles.rowHomebrew, expanded && styles.tableRowExpanded]}>
      <View style={styles.tableRow}>
        <Pressable
          onPress={onToggle}
          style={[styles.tableNameCol, { width: nameCol.width }]}
          accessibilityRole="button"
        >
          <Text
            variant="body-sm"
            family="body"
            weight="bold"
            style={{ color: expanded ? colors.primary : colors.onSurface }}
            numberOfLines={2}
          >
            {nameCol.cell(active)}
          </Text>
        </Pressable>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tableScrollContent}
          style={{ flex: 1 }}
        >
          {restCols.map((c) => (
            <Pressable
              key={c.key}
              onPress={onToggle}
              style={[styles.tableCell, { width: c.width }]}
              accessibilityRole="button"
            >
              <Text variant="body-sm" family="body" style={styles.tableCellText} numberOfLines={2}>
                {c.cell(active)}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
        <Pressable onPress={onToggle} style={styles.tableRightGutter} accessibilityRole="button">
          <View style={styles.tableSourceStack}>
            {allSources.map((src, i) => (
              <SourceBadge key={`src-${i}`} source={src} size="sm" />
            ))}
          </View>
          {rowActions ? (
            // Wrap actions in a non-tap-propagating View so the buttons
            // inside don't double as toggle taps. Pressable children
            // capture their own onPress and stop event propagation in
            // RN, so this just isolates layout, not gesture routing.
            <View style={styles.tableRowActions}>
              {rowActions(active)}
            </View>
          ) : null}
          <Icon
            name={showChevron ? (expanded ? 'expand-less' : 'expand-more') : 'chevron-right'}
            size={20}
            color={expanded ? colors.primary : colors.outline}
          />
        </Pressable>
      </View>

      {expanded && renderBody ? (
        <View style={styles.tableRowBody}>
          {group.variants.length > 1 ? (
            <SourceTabs variants={group.variants} activeIdx={activeIdx} onChange={setActiveIdx} />
          ) : null}
          {renderBody(active)}
          {footSource ? (
            <View style={styles.sourceFooter}>
              <SourceBadge source={footSource} size="md" />
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** Filter sheet — modal containing every facet with its option list. */
function FiltersSheet<T extends Variant>({
  facets, options, selected, onToggle, onClearAll, onClose, activeCount,
}: {
  facets: FilterFacet<T>[];
  options: Record<string, string[]>;
  selected: Record<string, Set<string>>;
  onToggle: (facetKey: string, value: string) => void;
  onClearAll: () => void;
  onClose: () => void;
  activeCount: number;
}) {
  return (
    <PopoverModal
      onClose={onClose}
      title="Filters"
      rightAction={activeCount > 0 ? { label: 'Clear all', onPress: () => { onClearAll(); onClose(); } } : undefined}
    >
      {facets.map((f) => {
        const opts = options[f.key] ?? [];
        const sel = selected[f.key] ?? new Set<string>();
        return (
          <View key={f.key} style={styles.filterFacetSection}>
            <Text variant="label-sm" weight="bold" uppercase style={styles.filterFacetHeader}>
              {f.label}{sel.size > 0 ? ` · ${sel.size}` : ''}
            </Text>
            {opts.length === 0 ? (
              <Text variant="body-sm" family="body" style={styles.filterFacetEmpty}>
                No values
              </Text>
            ) : (
              <View style={styles.filterFacetChips}>
                {opts.map((opt) => {
                  const isSel = sel.has(opt);
                  return (
                    <Pressable
                      key={opt}
                      onPress={() => onToggle(f.key, opt)}
                      style={[styles.filterValueChip, isSel && styles.filterValueChipActive]}
                    >
                      <Text
                        variant="label-sm"
                        weight="bold"
                        uppercase
                        style={{
                          color: isSel ? colors.onPrimaryContainer : colors.onSurfaceVariant,
                          letterSpacing: 1.25,
                        }}
                      >
                        {f.formatValue ? f.formatValue(opt) : opt}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
        );
      })}
    </PopoverModal>
  );
}

function PopoverModal({
  onClose, title, rightAction, children,
}: {
  onClose: () => void;
  title: string;
  rightAction?: { label: string; onPress: () => void };
  children: React.ReactNode;
}) {
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.popoverBackdrop} onPress={onClose}>
        <Pressable style={styles.popoverCard} onPress={() => {}}>
          <View style={styles.popoverHeader}>
            <Text variant="label-sm" weight="bold" uppercase style={{ color: colors.onSurfaceVariant, letterSpacing: 1.25 }}>
              {title}
            </Text>
            {rightAction ? (
              <Pressable onPress={rightAction.onPress}>
                <Text variant="label-sm" weight="bold" uppercase style={{ color: colors.primary, letterSpacing: 1.25 }}>
                  {rightAction.label}
                </Text>
              </Pressable>
            ) : null}
          </View>
          <ScrollView style={styles.popoverScroll}>
            {children}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function FeatsList({
  items, srdVersion, rowActions, headerExtra,
}: {
  items: FeatResult[];
  srdVersion?: string;
  rowActions?: (active: FeatResult) => React.ReactNode;
  headerExtra?: React.ReactNode;
}) {
  return (
    <TableShell<FeatResult>
      items={items}
      fingerprint={featFingerprint}
      searchPlaceholder="Search feats…"
      activeSrdVersion={srdVersion}
      rowActions={rowActions}
      headerExtra={headerExtra}
      columns={[
        { key: 'name', label: 'Name', cell: (f) => f.name, compare: (a, b) => a.name.localeCompare(b.name), width: 160, defaultSort: 'asc' },
        {
          key: 'category',
          label: 'Category',
          cell: (f) => f.category ? capitalize(f.category.replace('-', ' ')) : '—',
          compare: (a, b) => (a.category ?? '').localeCompare(b.category ?? ''),
          width: 130,
        },
        {
          key: 'prereq',
          label: 'Prerequisites',
          cell: (f) => f.prerequisites || '—',
          compare: (a, b) => (a.prerequisites ?? '').localeCompare(b.prerequisites ?? ''),
          width: 180,
        },
      ]}
      facets={[
        {
          key: 'category',
          label: 'Category',
          getValues: (f) => (f.category ? [f.category] : []),
          formatValue: (v) => capitalize(v.replace('-', ' ')),
        },
        {
          key: 'prereq',
          label: 'Prerequisites',
          getValues: (f) => [f.prerequisites ? 'Has prerequisites' : 'No prerequisites'],
          staticOptions: ['Has prerequisites', 'No prerequisites'],
        },
      ]}
      renderBody={(f) => (
        <>
          {f.prerequisites ? (
            <View style={styles.subBlock}>
              <MetaLabel size="sm">Prerequisite</MetaLabel>
              <Text variant="body-sm" family="body" style={styles.bodyText}>{f.prerequisites}</Text>
            </View>
          ) : null}
          {f.description ? <MarkdownText style={styles.bodyText}>{f.description}</MarkdownText> : null}
          {Array.isArray(f.benefits) && f.benefits.length > 0 ? (
            <View style={styles.subBlock}>
              <MetaLabel size="sm">Benefits</MetaLabel>
              {f.benefits.map((b, i) => (
                <View key={i} style={styles.bullet}>
                  <MarkdownText style={styles.bodyText}>{`• ${b}`}</MarkdownText>
                </View>
              ))}
            </View>
          ) : null}
        </>
      )}
    />
  );
}

function featFingerprint(f: FeatResult): string {
  return JSON.stringify({
    description: f.description ?? '',
    category: f.category ?? '',
    prerequisites: f.prerequisites ?? '',
    benefits: [...(f.benefits ?? [])].sort(),
  });
}

/** Display label for an OptionalFeatureKind. Used by both the Kind
 *  column cell and the Kind facet chip — keep them in lockstep so the
 *  filter chip and the row text never disagree. */
const OPTIONAL_FEATURE_KIND_LABELS: Record<OptionalFeatureKind, string> = {
  invocation:             'Invocation',
  metamagic:              'Metamagic',
  maneuver:               'Maneuver',
  'fighting-style':       'Fighting Style',
  'pact-boon':            'Pact Boon',
  'artificer-infusion':   'Artificer Infusion',
  'arcane-shot':          'Arcane Shot',
  'elemental-discipline': 'Elemental Discipline',
  rune:                   'Rune',
  other:                  'Other',
};

function formatOptionalFeatureKinds(kinds: OptionalFeatureKind[] | undefined): string {
  if (!kinds || kinds.length === 0) return '—';
  return kinds.map((k) => OPTIONAL_FEATURE_KIND_LABELS[k] ?? k).join(', ');
}

export function OptionalFeaturesList({
  items, srdVersion, rowActions, headerExtra,
}: {
  items: OptionalFeatureResult[];
  srdVersion?: string;
  rowActions?: (active: OptionalFeatureResult) => React.ReactNode;
  headerExtra?: React.ReactNode;
}) {
  return (
    <TableShell<OptionalFeatureResult>
      items={items}
      fingerprint={optionalFeatureFingerprint}
      searchPlaceholder="Search optional features…"
      activeSrdVersion={srdVersion}
      rowActions={rowActions}
      headerExtra={headerExtra}
      columns={[
        { key: 'name', label: 'Name', cell: (f) => f.name, compare: (a, b) => a.name.localeCompare(b.name), width: 200, defaultSort: 'asc' },
        {
          key: 'kind',
          label: 'Kind',
          cell: (f) => formatOptionalFeatureKinds(f.kinds),
          compare: (a, b) => (a.kinds?.[0] ?? '').localeCompare(b.kinds?.[0] ?? ''),
          width: 160,
        },
        {
          key: 'prereq',
          label: 'Prerequisites',
          cell: (f) => f.prerequisites || '—',
          compare: (a, b) => (a.prerequisites ?? '').localeCompare(b.prerequisites ?? ''),
          width: 200,
        },
        {
          key: 'consumes',
          label: 'Cost',
          cell: (f) => f.consumes || '—',
          compare: (a, b) => (a.consumes ?? '').localeCompare(b.consumes ?? ''),
          width: 130,
        },
      ]}
      facets={[
        {
          // Multi-value facet — Fighting Styles list every class they're
          // available to (e.g. Defense → fighter, paladin, ranger), so a
          // user filtering "Fighting Style" gets every row that includes
          // it regardless of which classes share it.
          key: 'kind',
          label: 'Kind',
          getValues: (f) => (f.kinds ?? []),
          formatValue: (v) => OPTIONAL_FEATURE_KIND_LABELS[v as OptionalFeatureKind] ?? v,
        },
        {
          key: 'prereq',
          label: 'Prerequisites',
          getValues: (f) => [f.prerequisites ? 'Has prerequisites' : 'No prerequisites'],
          staticOptions: ['Has prerequisites', 'No prerequisites'],
        },
        {
          key: 'consumes',
          label: 'Resource',
          getValues: (f) => (f.consumes ? [f.consumes] : ['At-will']),
        },
      ]}
      renderBody={(f) => (
        <>
          {f.prerequisites ? (
            <View style={styles.subBlock}>
              <MetaLabel size="sm">Prerequisite</MetaLabel>
              <Text variant="body-sm" family="body" style={styles.bodyText}>{f.prerequisites}</Text>
            </View>
          ) : null}
          {f.consumes ? (
            <View style={styles.subBlock}>
              <MetaLabel size="sm">Cost</MetaLabel>
              <Text variant="body-sm" family="body" style={styles.bodyText}>1 {f.consumes}</Text>
            </View>
          ) : null}
          {f.description ? <MarkdownText style={styles.bodyText}>{f.description}</MarkdownText> : null}
        </>
      )}
    />
  );
}

function optionalFeatureFingerprint(f: OptionalFeatureResult): string {
  return JSON.stringify({
    description: f.description ?? '',
    kinds: [...(f.kinds ?? [])].sort(),
    prerequisites: f.prerequisites ?? '',
    consumes: f.consumes ?? '',
  });
}

/** Expand 5e.tools alignment codes ("LG", "N", "CE") into prose. The
 *  2024 SRD dropped alignment-as-mechanic, so XDMG entries omit this
 *  field — when they do carry it, we render it for the legacy 2014
 *  audience. Unknown codes (multi-letter combos beyond LG/CE/etc.)
 *  pass through verbatim. */
function formatAlignment(codes: string[] | undefined): string {
  if (!codes || codes.length === 0) return '';
  const labels: Record<string, string> = {
    L: 'Lawful', N: 'Neutral', C: 'Chaotic',
    G: 'Good',   E: 'Evil',
    LG: 'Lawful Good',     NG: 'Neutral Good',     CG: 'Chaotic Good',
    LN: 'Lawful Neutral',  CN: 'Chaotic Neutral',
    LE: 'Lawful Evil',     NE: 'Neutral Evil',     CE: 'Chaotic Evil',
    A: 'Any',  U: 'Unaligned',
  };
  return codes.map((c) => labels[c] ?? c).join(' ');
}

export function DeitiesList({
  items, srdVersion, rowActions, headerExtra,
}: {
  items: DeityResult[];
  srdVersion?: string;
  rowActions?: (active: DeityResult) => React.ReactNode;
  headerExtra?: React.ReactNode;
}) {
  return (
    <TableShell<DeityResult>
      items={items}
      fingerprint={deityFingerprint}
      searchPlaceholder="Search deities…"
      activeSrdVersion={srdVersion}
      rowActions={rowActions}
      headerExtra={headerExtra}
      columns={[
        { key: 'name', label: 'Name', cell: (d) => d.name, compare: (a, b) => a.name.localeCompare(b.name), width: 160, defaultSort: 'asc' },
        {
          key: 'pantheon',
          label: 'Pantheon',
          cell: (d) => d.pantheon || '—',
          compare: (a, b) => (a.pantheon ?? '').localeCompare(b.pantheon ?? ''),
          width: 130,
        },
        {
          key: 'title',
          label: 'Title',
          cell: (d) => d.title || '—',
          compare: (a, b) => (a.title ?? '').localeCompare(b.title ?? ''),
          width: 220,
        },
        {
          key: 'domains',
          label: 'Domains',
          cell: (d) => Array.isArray(d.domains) && d.domains.length > 0 ? d.domains.join(', ') : '—',
          compare: (a, b) => (a.domains?.join(',') ?? '').localeCompare(b.domains?.join(',') ?? ''),
          width: 180,
        },
      ]}
      facets={[
        {
          key: 'pantheon',
          label: 'Pantheon',
          getValues: (d) => (d.pantheon ? [d.pantheon] : []),
        },
        {
          key: 'domain',
          label: 'Domain',
          // Multi-value — a deity granting multiple domains shows up
          // under each one, so a player filtering "Light" sees every
          // god offering it regardless of their other domains.
          getValues: (d) => d.domains ?? [],
        },
        {
          key: 'alignment',
          label: 'Alignment',
          getValues: (d) => (Array.isArray(d.alignment) && d.alignment.length > 0 ? [formatAlignment(d.alignment)] : []),
        },
      ]}
      renderBody={(d) => {
        const alignment = formatAlignment(d.alignment);
        return (
          <>
            <View style={styles.itemStatTable}>
              <ItemStatRow label="Pantheon" value={d.pantheon} />
              {d.title ? <ItemStatRow label="Title" value={d.title} /> : null}
              {alignment ? <ItemStatRow label="Alignment" value={alignment} /> : null}
              {Array.isArray(d.domains) && d.domains.length > 0
                ? <ItemStatRow label="Domains" value={d.domains.join(', ')} />
                : null}
              {d.symbol ? <ItemStatRow label="Symbol" value={d.symbol} /> : null}
              {d.plane ? <ItemStatRow label="Plane" value={d.plane} /> : null}
              {d.worshipers ? <ItemStatRow label="Worshipers" value={d.worshipers} /> : null}
            </View>
            {d.description ? (
              <MarkdownText style={styles.bodyText}>{d.description}</MarkdownText>
            ) : null}
          </>
        );
      }}
    />
  );
}

function deityFingerprint(d: DeityResult): string {
  return JSON.stringify({
    description: d.description ?? '',
    pantheon: d.pantheon ?? '',
    title: d.title ?? '',
    alignment: [...(d.alignment ?? [])].sort(),
    domains: [...(d.domains ?? [])].sort(),
    symbol: d.symbol ?? '',
    plane: d.plane ?? '',
    worshipers: d.worshipers ?? '',
  });
}

const VARIANT_RULE_KIND_LABELS: Record<VariantRuleResult['kind'], string> = {
  glossary: 'Glossary',
  variant:  'Variant',
  optional: 'Optional',
  other:    'Other',
};

export function VariantRulesList({
  items, srdVersion, rowActions, headerExtra,
}: {
  items: VariantRuleResult[];
  srdVersion?: string;
  rowActions?: (active: VariantRuleResult) => React.ReactNode;
  headerExtra?: React.ReactNode;
}) {
  return (
    <TableShell<VariantRuleResult>
      items={items}
      fingerprint={variantRuleFingerprint}
      searchPlaceholder="Search rules…"
      activeSrdVersion={srdVersion}
      rowActions={rowActions}
      headerExtra={headerExtra}
      columns={[
        { key: 'name', label: 'Name', cell: (r) => r.name, compare: (a, b) => a.name.localeCompare(b.name), width: 220, defaultSort: 'asc' },
        {
          key: 'kind',
          label: 'Kind',
          cell: (r) => VARIANT_RULE_KIND_LABELS[r.kind] ?? r.kind,
          compare: (a, b) => a.kind.localeCompare(b.kind),
          width: 120,
        },
      ]}
      facets={[
        {
          // Kind facet is the primary affordance — XPHB compendium
          // glossary entries (Ability Check, Cover, …) live alongside
          // DM-side variant/optional toggles (Flanking, Hero Points)
          // in the same source array. Most users want one or the
          // other, not both at once.
          key: 'kind',
          label: 'Kind',
          getValues: (r) => [r.kind],
          formatValue: (v) => VARIANT_RULE_KIND_LABELS[v as VariantRuleResult['kind']] ?? v,
        },
      ]}
      renderBody={(r) => (
        <>
          {r.description ? (
            <MarkdownText style={styles.bodyText}>{r.description}</MarkdownText>
          ) : null}
        </>
      )}
    />
  );
}

function variantRuleFingerprint(r: VariantRuleResult): string {
  return JSON.stringify({
    description: r.description ?? '',
    kind: r.kind,
  });
}

/**
 * Pull recognized fields out of an item's flat `properties` string array
 * so we can render them as a structured stat table. Anything that doesn't
 * match a known pattern stays in `others`.
 */
function parseItemProperties(props: string[]): {
  typeText: string | null;
  ac: string | null;
  damage: string | null;
  strengthReq: string | null;
  stealthDisadvantage: boolean;
  others: string[];
} {
  let typeText: string | null = null;
  let ac: string | null = null;
  let damage: string | null = null;
  let strengthReq: string | null = null;
  let stealthDisadvantage = false;
  const others: string[] = [];
  for (const p of props ?? []) {
    if (/^(Light|Medium|Heavy)\s+Armor$/.test(p)) { typeText = p; continue; }
    if (/^(Simple|Martial|Improvised)\s+(Melee|Ranged)$/.test(p)) { typeText = p; continue; }
    if (p.startsWith('AC ')) { ac = p.slice(3); continue; }
    if (p.startsWith('Damage: ')) { damage = p.slice(8); continue; }
    const sm = p.match(/^Strength\s+(\d+)\s+required$/);
    if (sm) { strengthReq = `${sm[1]}`; continue; }
    if (p === 'Disadvantage on Stealth') { stealthDisadvantage = true; continue; }
    others.push(p);
  }
  return { typeText, ac, damage, strengthReq, stealthDisadvantage, others };
}

/** Fall-back human-readable type label when properties don't supply one. */
function fallbackTypeLabel(category: ItemResult['category']): string {
  switch (category) {
    case 'weapon':              return 'Weapon';
    case 'armor':               return 'Armor';
    case 'shield':              return 'Shield';
    case 'adventuring-gear':    return 'Adventuring Gear';
    case 'magic-item':          return 'Magic Item';
    default:                    return capitalize(category);
  }
}

/**
 * Pick a Chip variant for a magic-item rarity. Legendary/artifact use the
 * accent palette so the rarest items pop visually while browsing the
 * catalog; lower tiers use the secondary palette to differentiate from
 * the meta-variant type chip beside them.
 */
function rarityVariant(rarity: ItemResult['rarity']): 'category' | 'meta' | 'accent' {
  if (rarity === 'legendary' || rarity === 'artifact') return 'accent';
  if (rarity === 'rare' || rarity === 'very-rare') return 'category';
  return 'meta';
}

/**
 * Resolve the most specific type label for an item — prefers the magic-item
 * sub-category (Wand / Potion / Ring) over the generic "Magic Item" so
 * browsing the catalog is more informative.
 */
function itemTypeLabel(it: ItemResult, parsedTypeText: string | null): string {
  if (parsedTypeText) return parsedTypeText;
  if (it.category === 'magic-item') {
    const kind = (it.data as { magicItemKind?: string } | undefined)?.magicItemKind;
    if (kind) {
      // 'wondrous-item' → 'Wondrous Item'
      return kind
        .split('-')
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
        .join(' ');
    }
  }
  // Adventuring-gear sub-bucket: prefer the specific kind ("Poison",
  // "Equipment Pack", "Ammunition") over the generic "Adventuring Gear"
  // so the Type column carries real information for the ~30% of gear
  // that has a known kind.
  if (it.category === 'adventuring-gear') {
    const kind = (it.data as { gearKind?: string } | undefined)?.gearKind;
    if (kind) {
      return kind
        .split('-')
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
        .join(' ');
    }
  }
  return fallbackTypeLabel(it.category);
}

export function ItemsList({
  items, srdVersion, rowActions, headerExtra,
}: {
  items: ItemResult[];
  srdVersion?: string;
  rowActions?: (active: ItemResult) => React.ReactNode;
  headerExtra?: React.ReactNode;
}) {
  return (
    <TableShell<ItemResult>
      items={items}
      fingerprint={itemFingerprint}
      // Magic-item variants ("+1 Greatsword", "Adamantine Greatsword",
      // …) collapse under their base item via `data.baseItemRef.name`.
      // The base row's `name` matches the variants' `baseItemRef.name`
      // so all rows for one base item share a group key, render as one
      // expandable row, and surface their variants as detail tabs.
      // Items without a baseItemRef (mundane gear, named magic items
      // like Vorpal Sword) fall through to the default name-based key
      // and behave unchanged.
      groupKey={itemGroupKey}
      variantSort={itemVariantSort}
      searchPlaceholder="Search items…"
      banner={<SeedBanner type="items" />}
      activeSrdVersion={srdVersion}
      rowActions={rowActions}
      headerExtra={headerExtra}
      columns={[
        { key: 'name', label: 'Name', cell: (it) => it.name, compare: (a, b) => a.name.localeCompare(b.name), width: 180, defaultSort: 'asc' },
        {
          key: 'type',
          label: 'Type',
          cell: (it) => {
            const parsed = parseItemProperties(it.properties ?? []);
            return itemTypeLabel(it, parsed.typeText ?? null);
          },
          compare: (a, b) => (a.category ?? '').localeCompare(b.category ?? ''),
          width: 130,
        },
        {
          key: 'rarity',
          label: 'Rarity',
          cell: (it) => it.rarity ? capitalize(it.rarity.replace('-', ' ')) : '—',
          compare: (a, b) => itemRarityRank(a.rarity) - itemRarityRank(b.rarity),
          width: 110,
        },
        {
          key: 'cost',
          label: 'Cost',
          cell: (it) =>
            it.cost ? `${it.cost.amount} ${it.cost.currency}`
              : it.rarity ? magicItemRarityCost(it.rarity)
              : '—',
          compare: (a, b) => itemCostInGp(a) - itemCostInGp(b),
          width: 130,
        },
        {
          key: 'weight',
          label: 'Weight',
          cell: (it) => typeof it.weight === 'number' ? `${it.weight} lb` : '—',
          compare: (a, b) => (a.weight ?? 0) - (b.weight ?? 0),
          width: 90,
        },
      ]}
      facets={[
        {
          key: 'category',
          label: 'Category',
          getValues: (it) => (it.category ? [it.category] : []),
          formatValue: (v) => capitalize(v.replace('-', ' ')),
        },
        {
          key: 'gearKind',
          label: 'Gear Type',
          // Adventuring-gear sub-bucket. SRD + imported items both stamp
          // `data.gearKind` ('ammunition' | 'equipment-pack' | 'poison'
          // | 'spellcasting-focus'); generic gear has no kind and groups
          // under "Other". Non-gear categories return [] so the facet
          // skips them entirely (the chip won't render for those rows).
          getValues: (it) => {
            if (it.category !== 'adventuring-gear') return [];
            const kind = (it.data as { gearKind?: string } | undefined)?.gearKind;
            return [kind ?? 'other'];
          },
          formatValue: (v) =>
            v === 'ammunition'         ? 'Ammunition' :
            v === 'equipment-pack'     ? 'Equipment Pack' :
            v === 'poison'             ? 'Poison' :
            v === 'spellcasting-focus' ? 'Spellcasting Focus' :
            v === 'other'              ? 'Other Gear' :
            capitalize(v.replace('-', ' ')),
        },
        {
          key: 'rarity',
          label: 'Rarity',
          getValues: (it) => (it.rarity ? [it.rarity] : []),
          formatValue: (v) => capitalize(v.replace('-', ' ')),
        },
        {
          key: 'attunement',
          label: 'Attunement',
          getValues: (it) => [it.requiresAttunement ? 'Requires attunement' : 'No attunement'],
          staticOptions: ['Requires attunement', 'No attunement'],
        },
      ]}
      renderBody={(it) => {
        const parsed = parseItemProperties(it.properties ?? []);
        const typeText = itemTypeLabel(it, parsed.typeText ?? null);
        const cost = it.cost ? `${it.cost.amount} ${it.cost.currency}` : null;
        const weight = typeof it.weight === 'number' ? `${it.weight} lb` : null;
        return (
          <>
            <View style={styles.itemStatTable}>
              <ItemStatRow label="Type"     value={typeText} />
              {parsed.ac      ? <ItemStatRow label="AC"      value={parsed.ac} /> : null}
              {parsed.damage  ? <ItemStatRow label="Damage"  value={parsed.damage} /> : null}
              {weight         ? <ItemStatRow label="Weight"  value={weight} /> : null}
              {cost           ? <ItemStatRow label="Cost"    value={cost} />
                : it.rarity   ? <ItemStatRow label="Cost"    value={magicItemRarityCost(it.rarity)} />
                : null}
              {parsed.strengthReq ? <ItemStatRow label="Str Req" value={parsed.strengthReq} /> : null}
              {parsed.stealthDisadvantage ? <ItemStatRow label="Stealth" value="Disadvantage" /> : null}
              {it.rarity ? <ItemStatRow label="Rarity" value={capitalize(it.rarity.replace('-', ' '))} /> : null}
              {it.requiresAttunement ? <ItemStatRow label="Attunement" value="Required" /> : null}
            </View>
            {Array.isArray(it.packContents) && it.packContents.length > 0 ? (
              <View style={styles.subBlock}>
                <MetaLabel size="sm">Contents</MetaLabel>
                {it.packContents.map((p, i) => (
                  <Text key={i} variant="body-sm" family="body" style={styles.bodyText}>
                    • {p.quantity > 1 ? `${p.quantity}× ` : ''}{p.name}
                  </Text>
                ))}
              </View>
            ) : null}
            {it.description ? (
              <MarkdownText style={styles.bodyText}>{it.description}</MarkdownText>
            ) : null}
            {parsed.others.length > 0 ? (
              <View style={styles.subBlock}>
                <MetaLabel size="sm">Properties</MetaLabel>
                {parsed.others.map((p, i) => (
                  <Text key={i} variant="body-sm" family="body" style={styles.bodyText}>• {p}</Text>
                ))}
              </View>
            ) : null}
          </>
        );
      }}
    />
  );
}

/**
 * SRD / DMG-2024 price bands by magic-item rarity. Neither Open5e nor
 * 5e.tools ships per-item prices for magic items because the official
 * rules don't either — the DMG only gives a range per rarity tier. We
 * surface that range as a fallback so the user has *some* economy
 * anchor when haggling at the table, instead of a blank Cost row.
 *
 * Bands match the 2024 DMG "Magic Item Rarity" guidance (the 2014 DMG
 * uses the same tiers). Common items have a defined low end; artifacts
 * are intentionally priceless.
 */
function magicItemRarityCost(rarity: NonNullable<ItemResult['rarity']>): string {
  switch (rarity) {
    case 'common':    return '50–100 gp';
    case 'uncommon':  return '101–500 gp';
    case 'rare':      return '501–5,000 gp';
    case 'very-rare': return '5,001–50,000 gp';
    case 'legendary': return '50,001+ gp';
    case 'artifact':  return 'Priceless';
    default:          return '—';
  }
}

/** Sort rank for rarity (Common → Artifact). Items without rarity (mundane) sort first. */
function itemRarityRank(rarity: ItemResult['rarity']): number {
  switch (rarity) {
    case undefined: return 0;
    case 'common': return 1;
    case 'uncommon': return 2;
    case 'rare': return 3;
    case 'very-rare': return 4;
    case 'legendary': return 5;
    case 'artifact': return 6;
    default: return 99;
  }
}

/** Convert an item's cost to gold-piece equivalent for sorting. */
function itemCostInGp(it: ItemResult): number {
  if (!it.cost) return 0;
  const amt = it.cost.amount ?? 0;
  switch (it.cost.currency) {
    case 'cp': return amt / 100;
    case 'sp': return amt / 10;
    case 'ep': return amt / 2;
    case 'gp': return amt;
    case 'pp': return amt * 10;
    default: return amt;
  }
}

/**
 * Read the magic-variant base-item pointer (`data.baseItemRef`) on an
 * item result. Returns null for items that aren't magic variants.
 */
function readBaseItemRef(it: ItemResult): { name: string; source?: string } | null {
  const ref = (it.data as { baseItemRef?: unknown } | undefined)?.baseItemRef;
  if (!ref || typeof ref !== 'object') return null;
  const r = ref as { name?: unknown; source?: unknown };
  if (typeof r.name !== 'string') return null;
  return { name: r.name, source: typeof r.source === 'string' ? r.source : undefined };
}

/**
 * Read the variant tab label (`data.variantLabel`) on a magic-variant
 * row. Falls back to the row's own name when the field is absent —
 * which happens on legacy variants imported before the field was
 * added.
 */
function readVariantLabel(it: ItemResult): string {
  const label = (it.data as { variantLabel?: unknown } | undefined)?.variantLabel;
  return typeof label === 'string' && label.length > 0 ? label : it.name;
}

/**
 * Group key for the items table. Magic variants collapse under their
 * base item via `baseItemRef.name`; everything else uses the standard
 * lowercased-name key. The base row and its variants share the same
 * key, so they render as one expandable row whose detail then exposes
 * the variants as tabs.
 */
function itemGroupKey(it: ItemResult): string {
  const ref = readBaseItemRef(it);
  return (ref?.name ?? it.name).toLowerCase();
}

/**
 * Variant sort for the items table. Base items (no `baseItemRef`) sort
 * ahead of their variants so the table row's display values come from
 * the base — "Greatsword" rather than "+1 Greatsword". Within the
 * variants, +N forms sort numerically before non-numeric labels
 * (Adamantine, Silvered) so the detail tabs read +1 / +2 / +3 /
 * Adamantine / Silvered in that order.
 */
function itemVariantSort(a: ItemResult, b: ItemResult): number {
  const aIsBase = !readBaseItemRef(a);
  const bIsBase = !readBaseItemRef(b);
  if (aIsBase !== bIsBase) return aIsBase ? -1 : 1;
  if (aIsBase) return variantPrioritySort(a, b);
  // Both variants — pull the +N number out of the label and sort by
  // that first; non-numeric labels fall back to alphabetical.
  const ax = bonusVariantNumber(readVariantLabel(a));
  const bx = bonusVariantNumber(readVariantLabel(b));
  if (ax !== null && bx !== null) return ax - bx;
  if (ax !== null) return -1;
  if (bx !== null) return 1;
  return readVariantLabel(a).localeCompare(readVariantLabel(b));
}

/** Extract the numeric bonus from a variant label like "+1" or "+2".
 *  Returns null for non-numeric labels (Adamantine, Silvered, etc.). */
function bonusVariantNumber(label: string): number | null {
  const m = label.trim().match(/^\+(\d+)$/);
  return m ? Number(m[1]) : null;
}

function itemFingerprint(it: ItemResult): string {
  return JSON.stringify({
    description: it.description ?? '',
    category: it.category ?? '',
    rarity: it.rarity ?? '',
    requiresAttunement: !!it.requiresAttunement,
    weight: typeof it.weight === 'number' ? it.weight : null,
    cost: it.cost ? `${it.cost.amount}|${it.cost.currency}` : '',
    properties: [...(it.properties ?? [])].sort(),
    // Variant grouping fields — fingerprint independently so two rows
    // for the same (name, base) but different variant labels stay
    // distinct in the dedupe pass.
    baseItemRef: readBaseItemRef(it)?.name ?? '',
    variantLabel: readVariantLabel(it),
  });
}

function ItemStatRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.itemStatRow}>
      <Text variant="label-sm" weight="bold" uppercase style={styles.itemStatLabel}>{label}</Text>
      <Text variant="body-sm" family="body" style={styles.itemStatValue}>{value}</Text>
    </View>
  );
}

/** Format a signed modifier ("+3", "-1", "+0"). */
function fmtSigned(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

/** Skill snake_case → display label ("sleight_of_hand" → "Sleight of Hand"). */
function skillLabel(key: string): string {
  return key
    .split('_')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');
}

function CreatureAbilityBlock({ scores, mods }: {
  scores: NonNullable<CreatureResult['abilityScores']>;
  mods: NonNullable<CreatureResult['abilityModifiers']>;
}) {
  const cells: Array<['STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA', number, number]> = [
    ['STR', scores.str, mods.str], ['DEX', scores.dex, mods.dex], ['CON', scores.con, mods.con],
    ['INT', scores.int, mods.int], ['WIS', scores.wis, mods.wis], ['CHA', scores.cha, mods.cha],
  ];
  return (
    <View style={styles.creatureAbilityGrid}>
      {cells.map(([label, score, mod]) => (
        <View key={label} style={styles.creatureAbilityCell}>
          <Text variant="label-sm" weight="bold" uppercase style={styles.creatureAbilityLabel}>{label}</Text>
          <Text variant="body-md" family="headline" style={styles.creatureAbilityScore}>{score}</Text>
          <Text variant="body-sm" family="body" style={styles.creatureAbilityMod}>{fmtSigned(mod)}</Text>
        </View>
      ))}
    </View>
  );
}

function CreatureLineRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.itemStatRow}>
      <Text variant="label-sm" weight="bold" uppercase style={styles.itemStatLabel}>{label}</Text>
      <Text variant="body-sm" family="body" style={styles.itemStatValue}>{value}</Text>
    </View>
  );
}

export function CreaturesList({
  items, srdVersion, rowActions, headerExtra,
}: {
  items: CreatureResult[];
  srdVersion?: string;
  rowActions?: (active: CreatureResult) => React.ReactNode;
  headerExtra?: React.ReactNode;
}) {
  return (
    <TableShell<CreatureResult>
      items={items}
      fingerprint={creatureFingerprint}
      searchPlaceholder="Search monsters…"
      activeSrdVersion={srdVersion}
      rowActions={rowActions}
      headerExtra={headerExtra}
      columns={[
        { key: 'name', label: 'Name', cell: (c) => c.name, compare: (a, b) => a.name.localeCompare(b.name), width: 180 },
        {
          key: 'cr',
          label: 'CR',
          cell: (c) => `${c.challengeRating}`,
          compare: (a, b) => crSortValue(a.challengeRating) - crSortValue(b.challengeRating),
          width: 70,
          defaultSort: 'asc',
        },
        {
          key: 'type',
          label: 'Type',
          cell: (c) => c.creatureType ?? '—',
          compare: (a, b) => (a.creatureType ?? '').localeCompare(b.creatureType ?? ''),
          width: 130,
        },
        {
          key: 'size',
          label: 'Size',
          cell: (c) => c.size ?? '—',
          compare: (a, b) => (a.size ?? '').localeCompare(b.size ?? ''),
          width: 100,
        },
        {
          key: 'ac',
          label: 'AC',
          cell: (c) => `${c.ac}`,
          compare: (a, b) => (a.ac ?? 0) - (b.ac ?? 0),
          width: 60,
        },
        {
          key: 'hp',
          label: 'HP',
          cell: (c) => `${c.hp}`,
          compare: (a, b) => (a.hp ?? 0) - (b.hp ?? 0),
          width: 70,
        },
        {
          key: 'environment',
          label: 'Environment',
          cell: (c) => (c.environments?.length ? c.environments.join(', ') : '—'),
          compare: (a, b) => (a.environments?.[0] ?? '').localeCompare(b.environments?.[0] ?? ''),
          width: 180,
        },
      ]}
      facets={[
        { key: 'type', label: 'Type', getValues: (c) => (c.creatureType ? [c.creatureType] : []) },
        { key: 'size', label: 'Size', getValues: (c) => (c.size ? [c.size] : []) },
        { key: 'environment', label: 'Environment', getValues: (c) => c.environments ?? [] },
      ]}
      renderBody={(c) => {
            const savesText = c.savingThrows
              ? Object.entries(c.savingThrows)
                  .map(([ab, v]) => `${ab.toUpperCase()} ${fmtSigned(v as number)}`)
                  .join(', ')
              : '';
            const skillsText = c.skills
              ? Object.entries(c.skills)
                  .map(([k, v]) => `${skillLabel(k)} ${fmtSigned(v as number)}`)
                  .join(', ')
              : '';
            const sensesParts: string[] = [];
            if (c.senses?.darkvision) sensesParts.push(`darkvision ${c.senses.darkvision} ft.`);
            if (c.senses?.blindsight) sensesParts.push(`blindsight ${c.senses.blindsight} ft.`);
            if (c.senses?.tremorsense) sensesParts.push(`tremorsense ${c.senses.tremorsense} ft.`);
            if (c.senses?.truesight) sensesParts.push(`truesight ${c.senses.truesight} ft.`);
            if (typeof c.senses?.passivePerception === 'number') sensesParts.push(`passive Perception ${c.senses.passivePerception}`);
            const sensesText = sensesParts.join(', ');
            return (
              <>
                <View style={styles.itemStatTable}>
                  {c.size ? <CreatureLineRow label="Size" value={c.size} /> : null}
                  {c.creatureType ? <CreatureLineRow label="Type" value={c.creatureType} /> : null}
                  {c.alignment ? <CreatureLineRow label="Alignment" value={c.alignment} /> : null}
                  <CreatureLineRow label="AC" value={c.armorDetail ? `${c.ac} (${c.armorDetail})` : `${c.ac}`} />
                  <CreatureLineRow label="HP" value={c.hitDice ? `${c.hp} (${c.hitDice})` : `${c.hp}`} />
                  {c.speed ? <CreatureLineRow label="Speed" value={c.speed} /> : null}
                  {typeof c.proficiencyBonus === 'number' ? <CreatureLineRow label="Prof" value={fmtSigned(c.proficiencyBonus)} /> : null}
                  {typeof c.xp === 'number' ? <CreatureLineRow label="XP" value={c.xp.toLocaleString()} /> : null}
                </View>

                {c.abilityScores && c.abilityModifiers ? (
                  <View style={styles.subBlock}>
                    <CreatureAbilityBlock scores={c.abilityScores} mods={c.abilityModifiers} />
                  </View>
                ) : null}

                {(savesText || skillsText || sensesText || c.languages) ? (
                  <View style={styles.itemStatTable}>
                    {savesText ? <CreatureLineRow label="Saves"  value={savesText} /> : null}
                    {skillsText ? <CreatureLineRow label="Skills" value={skillsText} /> : null}
                    {sensesText ? <CreatureLineRow label="Senses" value={sensesText} /> : null}
                    {c.languages ? <CreatureLineRow label="Languages" value={c.languages} /> : null}
                  </View>
                ) : null}

                {(c.damageResistances?.length || c.damageImmunities?.length || c.damageVulnerabilities?.length || c.conditionImmunities?.length) ? (
                  <View style={styles.itemStatTable}>
                    {c.damageResistances?.length ? <CreatureLineRow label="Resist"   value={c.damageResistances.join(', ')} /> : null}
                    {c.damageImmunities?.length ? <CreatureLineRow label="Immune"   value={c.damageImmunities.join(', ')} /> : null}
                    {c.damageVulnerabilities?.length ? <CreatureLineRow label="Vuln"     value={c.damageVulnerabilities.join(', ')} /> : null}
                    {c.conditionImmunities?.length ? <CreatureLineRow label="Cond Imm" value={c.conditionImmunities.join(', ')} /> : null}
                  </View>
                ) : null}

                {c.traits?.length ? (
                  <View style={styles.subBlock}>
                    <MetaLabel size="sm">Traits</MetaLabel>
                    {c.traits.map((t, i) => (
                      <View key={i} style={styles.bullet}>
                        <Text variant="body-sm" weight="bold" family="body" style={styles.bodyText}>{t.name}.</Text>
                        <MarkdownText style={styles.bodyText}>{t.description}</MarkdownText>
                      </View>
                    ))}
                  </View>
                ) : null}

                {c.actions?.length ? (
                  <View style={styles.subBlock}>
                    <MetaLabel size="sm">Actions</MetaLabel>
                    {c.actions.map((a, i) => (
                      <View key={i} style={styles.bullet}>
                        <Text variant="body-sm" weight="bold" family="body" style={styles.bodyText}>{a.name}.</Text>
                        <MarkdownText style={styles.bodyText}>{a.description}</MarkdownText>
                      </View>
                    ))}
                  </View>
                ) : null}

              </>
            );
          }}
    />
  );
}

function creatureFingerprint(c: CreatureResult): string {
  return JSON.stringify({
    cr: c.challengeRating,
    size: c.size ?? '',
    type: c.creatureType ?? '',
    ac: c.ac,
    hp: c.hp,
    speed: c.speed ?? '',
    pb: c.proficiencyBonus ?? null,
    xp: c.xp ?? null,
    abilityScores: c.abilityScores ?? null,
    saves: c.savingThrows ?? null,
    skills: c.skills ?? null,
    senses: c.senses ?? null,
    languages: c.languages ?? '',
    res: [...(c.damageResistances ?? [])].sort(),
    imm: [...(c.damageImmunities ?? [])].sort(),
    vuln: [...(c.damageVulnerabilities ?? [])].sort(),
    condImm: [...(c.conditionImmunities ?? [])].sort(),
    traits: (c.traits ?? []).map((t) => `${t.name}|${t.description}`).sort(),
    actions: (c.actions ?? []).map((a) => `${a.name}|${a.description}`).sort(),
    environments: [...(c.environments ?? [])].sort(),
    alignment: c.alignment ?? '',
  });
}

/** Numeric sort key for CR — accepts number, "1/2", "10", etc. */
function crSortValue(cr: CreatureResult['challengeRating']): number {
  if (typeof cr === 'number') return cr;
  const m = String(cr).match(/^(\d+)\/(\d+)$/);
  if (m) return parseInt(m[1], 10) / parseInt(m[2], 10);
  const n = parseFloat(String(cr));
  return Number.isFinite(n) ? n : 0;
}

export function ConditionsList({
  items, srdVersion, rowActions, headerExtra,
}: {
  items: ConditionResult[];
  srdVersion?: string;
  rowActions?: (active: ConditionResult) => React.ReactNode;
  headerExtra?: React.ReactNode;
}) {
  return (
    <TableShell<ConditionResult>
      items={items}
      fingerprint={conditionFingerprint}
      searchPlaceholder="Search conditions…"
      activeSrdVersion={srdVersion}
      rowActions={rowActions}
      headerExtra={headerExtra}
      columns={[
        { key: 'name', label: 'Name', cell: (c) => c.name, compare: (a, b) => a.name.localeCompare(b.name), width: 180, defaultSort: 'asc' },
      ]}
      facets={[]}
      renderBody={(c) => (
        <>
          {c.description ? (
            <MarkdownText style={styles.bodyText}>{c.description}</MarkdownText>
          ) : null}
          {Array.isArray(c.effects) && c.effects.length > 0 ? (
            <View style={styles.subBlock}>
              <MetaLabel size="sm">Effects</MetaLabel>
              {c.effects.map((e, i) => (
                <View key={i} style={styles.bullet}>
                  <Text variant="body-sm" family="body" style={styles.bodyText}>• {e}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </>
      )}
    />
  );
}

function conditionFingerprint(c: ConditionResult): string {
  return JSON.stringify({
    description: c.description ?? '',
    effects: [...(c.effects ?? [])].sort(),
  });
}

// Rules-of-play. Open5e ships these as a flat list with `chapter` and
// `order` fields — group by chapter, sort within by order, and render
// each section as an expandable row (the bodies are long-form prose,
// often with embedded markdown tables).
function RulesList({ items }: { items: RuleResult[] }) {
  const [q, setQ] = useState('');
  const exp = useExpanded();

  // Per-chapter collapse state. Tracks *collapsed* keys (not expanded), so
  // every chapter is open by default and the user opts in to hiding noise.
  // While searching we ignore this set entirely — hits should always be
  // visible regardless of the chapter's prior collapse state.
  const [collapsedChapters, setCollapsedChapters] = useState<Set<string>>(() => new Set());
  const toggleChapter = (chapter: string) => {
    setCollapsedChapters((prev) => {
      const next = new Set(prev);
      if (next.has(chapter)) next.delete(chapter); else next.add(chapter);
      return next;
    });
  };

  const searching = q.trim().length > 0;

  // Group by chapter. Sections inside a chapter follow Open5e's per-chapter
  // order; chapters themselves sort alphabetically (the 5.1 / 2024 chapter
  // taxonomies don't overlap, so we never see mixed editions in one chapter).
  const grouped = useMemo(() => {
    const filtered = filterByName(items, q);
    const buckets = new Map<string, RuleResult[]>();
    for (const r of filtered) {
      const arr = buckets.get(r.chapter) ?? [];
      arr.push(r);
      buckets.set(r.chapter, arr);
    }
    for (const arr of buckets.values()) {
      arr.sort((a, b) => a.order - b.order);
    }
    return [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [items, q]);

  const totalHits = grouped.reduce((n, [, arr]) => n + arr.length, 0);

  return (
    <View style={styles.list}>
      <SearchBar value={q} onChange={setQ} placeholder="Search rules…" />
      {grouped.map(([chapter, sections]) => {
        const collapsed = !searching && collapsedChapters.has(chapter);
        return (
          <View key={chapter} style={styles.rulesChapter}>
            <Pressable
              onPress={() => toggleChapter(chapter)}
              style={({ pressed }) => [
                styles.rulesChapterHeader,
                collapsed && styles.rulesChapterHeaderCollapsed,
                pressed && { opacity: 0.85 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`${collapsed ? 'Expand' : 'Collapse'} ${chapter} chapter`}
            >
              <Text
                variant="title-md"
                family="headline"
                weight="bold"
                style={styles.rulesChapterTitle}
              >
                {chapter}
              </Text>
              <View style={styles.rulesChapterCountPill}>
                <Text variant="body-sm" family="body" weight="semibold" style={styles.rulesChapterCountText}>
                  {sections.length}
                </Text>
              </View>
              <Icon
                name={collapsed ? 'expand-more' : 'expand-less'}
                size={20}
                color={colors.primary}
              />
            </Pressable>
            {!collapsed
              ? sections.map((r) => (
                  <ExpandRow
                    key={r.key}
                    title={r.name}
                    summary={r.description ?? ''}
                    expanded={exp.isOpen(r.key)}
                    onToggle={() => exp.toggle(r.key)}
                    tier={r.tier}
                    importSource={r.importSource}
                  >
                    {r.description ? (
                      <MarkdownText style={styles.bodyText}>{r.description}</MarkdownText>
                    ) : null}
                  </ExpandRow>
                ))
              : null}
          </View>
        );
      })}
      {totalHits === 0 ? <EmptyHit q={q} /> : null}
    </View>
  );
}

// ── Catalog lists ────────────────────────────────────────────────────────────
// Compact list views for short SRD lookup tables (skills, damage types, etc.).
// They don't need ExpandRow's collapse/expand affordance — every item fits in
// a few lines, so they render as a flat list of name + meta + description rows.

type CatalogItem = {
  key: string;
  name: string;
  description?: string;
};

function CatalogList<T extends CatalogItem>({
  items, placeholder, sub, sort,
}: {
  items: T[];
  placeholder: string;
  /** Render the meta line under the name. */
  sub?: (item: T) => string | undefined;
  /** Custom sort. Defaults to alphabetical by name. */
  sort?: (a: T, b: T) => number;
}) {
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const ordered = sort ? items.slice().sort(sort) : items.slice().sort((a, b) => a.name.localeCompare(b.name));
    if (!q.trim()) return ordered;
    const t = q.toLowerCase();
    return ordered.filter(
      (i) => i.name.toLowerCase().includes(t) || (i.description ?? '').toLowerCase().includes(t)
    );
  }, [items, q, sort]);

  return (
    <View style={styles.list}>
      <SearchBar value={q} onChange={setQ} placeholder={placeholder} />
      {filtered.map((it) => (
        <View key={it.key} style={styles.refRow}>
          <View style={styles.refRowHead}>
            <Text variant="body-sm" family="body" weight="bold" style={{ color: colors.onSurface }}>
              {it.name}
            </Text>
            {sub?.(it) ? (
              <Text variant="body-sm" family="body" style={styles.refRowSub}>{sub(it)}</Text>
            ) : null}
          </View>
          {it.description ? (
            <MarkdownText style={styles.bodyText}>{it.description}</MarkdownText>
          ) : null}
        </View>
      ))}
      {filtered.length === 0 ? <EmptyHit q={q} /> : null}
    </View>
  );
}

function SkillsList({ items }: { items: SkillResult[] }) {
  return <CatalogList items={items} placeholder="Search skills…" sub={(s) => s.ability.toUpperCase()} />;
}

function LanguagesList({ items }: { items: LanguageResult[] }) {
  return (
    <CatalogList
      items={items}
      placeholder="Search languages…"
      sub={(l) => [capitalize(l.rarity), l.script ?? 'no script'].join(' · ')}
      sort={(a, b) =>
        (a.rarity === b.rarity ? 0 : a.rarity === 'standard' ? -1 : 1) || a.name.localeCompare(b.name)
      }
    />
  );
}

function SchoolsList({ items }: { items: SchoolResult[] }) {
  return <CatalogList items={items} placeholder="Search schools of magic…" />;
}

function SizesList({ items }: { items: SizeResult[] }) {
  // Preserve canonical Tiny → Gargantuan order from the source array.
  const order = items;
  return (
    <CatalogList
      items={items}
      placeholder="Search sizes…"
      sub={(s) => s.space}
      sort={(a, b) => order.indexOf(a) - order.indexOf(b)}
    />
  );
}

function DamageTypesList({ items }: { items: DamageTypeResult[] }) {
  return <CatalogList items={items} placeholder="Search damage types…" sub={(d) => capitalize(d.category)} />;
}

function ActionTypesList({ items }: { items: ActionTypeResult[] }) {
  // Canonical action-economy order: Action → Bonus → Reaction → Free.
  const order = items;
  return (
    <CatalogList
      items={items}
      placeholder="Search action types…"
      sub={(a) => a.economy}
      sort={(a, b) => order.indexOf(a) - order.indexOf(b)}
    />
  );
}

function WeaponPropertiesList({ items }: { items: WeaponPropertyResult[] }) {
  return <CatalogList items={items} placeholder="Search weapon properties…" />;
}

function WeaponMasteriesList({ items }: { items: WeaponMasteryResult[] }) {
  return <CatalogList items={items} placeholder="Search weapon masteries…" />;
}

function StandardActionsList({ items }: { items: StandardActionResult[] }) {
  // Group order: Action → Bonus Action → Reaction → Free, then alpha within.
  const economyOrder: Record<string, number> = { action: 0, 'bonus-action': 1, reaction: 2, free: 3 };
  return (
    <CatalogList
      items={items}
      placeholder="Search standard actions…"
      sub={(a) => formatEconomy(a.actionEconomy)}
      sort={(a, b) =>
        (economyOrder[a.actionEconomy] ?? 9) - (economyOrder[b.actionEconomy] ?? 9) ||
        a.name.localeCompare(b.name)
      }
    />
  );
}

function SensesList({ items }: { items: SenseResult[] }) {
  return (
    <CatalogList
      items={items}
      placeholder="Search senses…"
      sub={(s) => (s.defaultRange ? `Typical range: ${s.defaultRange} ft` : undefined)}
    />
  );
}

function SpeedsList({ items }: { items: SpeedResult[] }) {
  return <CatalogList items={items} placeholder="Search speeds…" />;
}

function CreatureTypesList({ items }: { items: CreatureTypeResult[] }) {
  return <CatalogList items={items} placeholder="Search creature types…" />;
}

function AlignmentsList({ items }: { items: AlignmentResult[] }) {
  // Canonical alignment grid order from the source array (LG → CE, then Unaligned).
  const order = items;
  return (
    <CatalogList
      items={items}
      placeholder="Search alignments…"
      sub={(a) => a.morality === 'unaligned'
        ? 'Unaligned'
        : `${capitalize(a.ethics)} · ${capitalize(a.morality)}`
      }
      sort={(a, b) => order.indexOf(a) - order.indexOf(b)}
    />
  );
}

function CurrenciesList({ items }: { items: CurrencyResult[] }) {
  // Canonical denomination order: cp → sp → ep → gp → pp.
  return (
    <CatalogList
      items={items}
      placeholder="Search currencies…"
      sub={(c) => `${c.abbreviation.toUpperCase()} · 1 = ${c.conversionToCopper} cp`}
      sort={(a, b) => a.conversionToCopper - b.conversionToCopper}
    />
  );
}

/**
 * Tools list — rich renderer (not the shared CatalogList) since the
 * 2024 SRD ships structured Ability / Utilize / Craft fields per tool
 * and those drive character-creation pickers downstream. Falls back
 * cleanly when a tool only has prose (5.1 entries don't carry the
 * structured fields).
 */
function ToolsList({ items }: { items: ToolResult[] }) {
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const ordered = items.slice().sort(
      (a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name),
    );
    if (!q.trim()) return ordered;
    const t = q.toLowerCase();
    return ordered.filter((it) =>
      it.name.toLowerCase().includes(t) ||
      (it.description ?? '').toLowerCase().includes(t) ||
      (it.ability ?? '').toLowerCase().includes(t) ||
      (it.utilize ?? []).some((u) => u.toLowerCase().includes(t)) ||
      (it.craft ?? []).some((c) => c.toLowerCase().includes(t)),
    );
  }, [items, q]);

  return (
    <View style={styles.list}>
      <SearchBar value={q} onChange={setQ} placeholder="Search tools…" />
      {filtered.map((it) => {
        const cat = capitalize(it.category.replace('-', ' '));
        const cost = it.cost ? `${it.cost.amount} ${it.cost.currency}` : null;
        const subLine = [cat, cost].filter(Boolean).join(' · ');
        return (
          <View key={it.key} style={styles.refRow}>
            <View style={styles.refRowHead}>
              <Text variant="body-sm" family="body" weight="bold" style={{ color: colors.onSurface }}>
                {it.name}
              </Text>
              <Text variant="body-sm" family="body" style={styles.refRowSub}>{subLine}</Text>
            </View>
            {it.ability ? (
              <Text variant="body-sm" family="body" style={styles.bodyText}>
                <Text weight="bold">Ability: </Text>{it.ability}
              </Text>
            ) : null}
            {Array.isArray(it.utilize) && it.utilize.length > 0 ? (
              <View style={styles.subBlock}>
                <MetaLabel size="sm">Utilize</MetaLabel>
                {it.utilize.map((u, i) => (
                  <Text key={i} variant="body-sm" family="body" style={styles.bodyText}>• {u}</Text>
                ))}
              </View>
            ) : null}
            {Array.isArray(it.craft) && it.craft.length > 0 ? (
              <Text variant="body-sm" family="body" style={styles.bodyText}>
                <Text weight="bold">Craft: </Text>{it.craft.join(', ')}
              </Text>
            ) : null}
            {it.description ? (
              <MarkdownText style={styles.bodyText}>{it.description}</MarkdownText>
            ) : null}
          </View>
        );
      })}
      {filtered.length === 0 ? <EmptyHit q={q} /> : null}
    </View>
  );
}

function MagicItemCategoriesList({ items }: { items: MagicItemCategoryResult[] }) {
  return <CatalogList items={items} placeholder="Search magic item categories…" />;
}

function CoverList({ items }: { items: CoverResult[] }) {
  // Order by AC bonus: half (+2) → three-quarters (+5) → total (blocks).
  return (
    <CatalogList
      items={items}
      placeholder="Search cover…"
      sub={(c) => c.blocksAttacks ? "Can't be targeted directly" : `+${c.acBonus} AC and Dex saves`}
      sort={(a, b) => {
        if (a.blocksAttacks !== b.blocksAttacks) return a.blocksAttacks ? 1 : -1;
        return a.acBonus - b.acBonus;
      }}
    />
  );
}

/** Render an action-economy slot key as a display label. */
function formatEconomy(slot: 'action' | 'bonus-action' | 'reaction' | 'free'): string {
  switch (slot) {
    case 'action': return 'Action';
    case 'bonus-action': return 'Bonus Action';
    case 'reaction': return 'Reaction';
    case 'free': return 'Free';
  }
}

function SeedBanner({ type }: { type: keyof SrdContent }) {
  if (!SEED_ONLY_TYPES.has(type)) return null;
  return (
    <View style={styles.seedBanner}>
      <Icon name="info-outline" size={14} color={colors.primary} />
      <Text variant="body-sm" family="body" style={styles.seedBannerText}>
        Seed only — a small representative sample. The full SRD bundle for this
        category lands in a follow-up data import.
      </Text>
    </View>
  );
}

function capitalize(s: string) {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

function ProfBlock({
  label,
  items,
  joiner,
}: {
  label: string;
  items?: string[] | null;
  /** When set, renders a small label between consecutive chips so the
   *  block reads as a conjunction (e.g. "A and B and C"). Used for
   *  proficiency lists that are AND'd together — the bare chip row
   *  reads ambiguously as either AND or OR otherwise. */
  joiner?: 'and' | 'or';
}) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return (
    <View style={styles.subBlock}>
      <MetaLabel size="sm">{label}</MetaLabel>
      <View style={styles.chipRow}>
        {items.map((it, i) => (
          <Fragment key={`${i}-${it}`}>
            {joiner && i > 0 ? (
              <Text variant="body-sm" family="body" style={styles.profJoiner}>{joiner}</Text>
            ) : null}
            <Chip label={it} variant="meta" />
          </Fragment>
        ))}
      </View>
    </View>
  );
}

function SrdVersionsRow({ versions }: { versions: string[] }) {
  return (
    <View style={[styles.subBlock, { marginTop: spacing.sm }]}>
      <MetaLabel size="sm">SRD versions</MetaLabel>
      <View style={styles.chipRow}>
        {versions.map((v) => <Chip key={v} label={srdVersionDisplay(v)} variant="category" />)}
      </View>
    </View>
  );
}

/** User-facing label for an `srdVersions` tag — year-shorthand to match
 *  the source-badge convention from packages/content/src/srd/index.ts. */
function srdVersionDisplay(v: string): string {
  if (v === 'SRD_2.0') return 'SRD 2024';
  if (v === 'SRD_5.1') return 'SRD 2014';
  return v.replace('_', ' ');
}

function EmptyHit({ q }: { q: string }) {
  return (
    <View style={styles.emptyHit}>
      <Text variant="body-sm" family="body" style={styles.bodyText}>
        {q.trim() ? `No results for “${q}”.` : 'No items.'}
      </Text>
    </View>
  );
}

// ── Schema panel ──────────────────────────────────────────────────────────────

function SchemaPanel({ sys }: { sys: GameSystemDefinition }) {
  const { width } = useWindowDimensions();
  const isWide = width > 900;
  return (
    <View style={[styles.schemaGrid, { gap: spacing.md }]}>
      <Card tier="container" padding="md" style={isWide ? styles.schemaHalf : styles.schemaFull}>
        <CardTitle icon="tune" label="Attributes" count={sys.attributes.length} />
        {sys.attributes.length === 0 ? (
          <Text variant="body-sm" family="body" style={styles.bodyText}>None defined.</Text>
        ) : (
          sys.attributes.map((a) => (
            <View key={a.key} style={styles.kv}>
              <Text variant="body-sm" family="body" weight="bold" style={{ color: colors.onSurface }}>{a.label}</Text>
              <Text variant="body-sm" family="body" style={styles.bodyText}>
                {a.key} · {a.type}
                {a.derivedFrom ? ` · derived from ${a.derivedFrom}` : ''}
                {a.derivation ? ` · ${a.derivation}` : ''}
              </Text>
            </View>
          ))
        )}
      </Card>

      <Card tier="container" padding="md" style={isWide ? styles.schemaHalf : styles.schemaFull}>
        <CardTitle icon="bolt" label="Resource pools" count={sys.resourcePools.length} />
        {sys.resourcePools.length === 0 ? (
          <Text variant="body-sm" family="body" style={styles.bodyText}>None defined.</Text>
        ) : (
          sys.resourcePools.map((r) => (
            <View key={r.key} style={styles.kv}>
              <Text variant="body-sm" family="body" weight="bold" style={{ color: colors.onSurface }}>{r.label}</Text>
              <Text variant="body-sm" family="body" style={styles.bodyText}>
                {r.key} · max {r.max == null ? 'derived' : r.max} · recharge {r.recharge}
              </Text>
            </View>
          ))
        )}
      </Card>

      <Card tier="container" padding="md" style={isWide ? styles.schemaHalf : styles.schemaFull}>
        <CardTitle icon="view-list" label="Sheet sections" count={sys.sheetSections.length} />
        {sys.sheetSections.length === 0 ? (
          <Text variant="body-sm" family="body" style={styles.bodyText}>None defined.</Text>
        ) : (
          [...sys.sheetSections].sort((a, b) => a.order - b.order).map((s) => (
            <View key={s.key} style={styles.kv}>
              <Text variant="body-sm" family="body" weight="bold" style={{ color: colors.onSurface }}>{s.label}</Text>
              <Text variant="body-sm" family="body" style={styles.bodyText}>
                {s.key} · order {s.order}
              </Text>
            </View>
          ))
        )}
      </Card>

      <Card tier="container" padding="md" style={isWide ? styles.schemaHalf : styles.schemaFull}>
        <CardTitle icon="route" label="Creation steps" count={sys.creationSteps.length} />
        {sys.creationSteps.length === 0 ? (
          <Text variant="body-sm" family="body" style={styles.bodyText}>None defined.</Text>
        ) : (
          sys.creationSteps.map((c) => (
            <View key={c.key} style={styles.kv}>
              <Text variant="body-sm" family="body" weight="bold" style={{ color: colors.onSurface }}>{c.label}</Text>
              <Text variant="body-sm" family="body" style={styles.bodyText}>
                {c.key} · {c.contentCollection}{c.required ? ' · required' : ''}
              </Text>
            </View>
          ))
        )}
      </Card>
    </View>
  );
}

function CardTitle({ icon, label, count }: { icon: string; label: string; count: number }) {
  return (
    <View style={styles.cardTitleRow}>
      <Icon name={icon as any} size={16} color={colors.primary} />
      <Text variant="title-sm" family="headline" weight="bold" style={{ color: colors.onSurface, flex: 1 }}>
        {label}
      </Text>
      <MetaLabel size="sm">{String(count)}</MetaLabel>
    </View>
  );
}

// ── Not found ─────────────────────────────────────────────────────────────────

function NotFound({ onBack }: { onBack: () => void }) {
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.surfaceCanvas }}>
      <Pressable onPress={onBack} style={({ pressed }) => [styles.backRow, pressed && { opacity: 0.6 }]}>
        <Icon name="chevron-left" size={18} color={colors.onSurfaceVariant} />
        <Text variant="body-sm" family="body" weight="medium" style={{ color: colors.onSurfaceVariant }}>
          Game Systems
        </Text>
      </Pressable>
      <ScreenHeader title="System not found" />
      <View style={{ paddingHorizontal: spacing.lg }}>
        <Card tier="low" padding="lg">
          <Text variant="body-md" family="body" style={styles.bodyText}>
            That game system isn't bundled. Try heading back to the catalog.
          </Text>
        </Card>
      </View>
    </ScrollView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },

  // Group tabs (primary)
  tabsScroll: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.outlineVariant + '88',
    flexGrow: 0,
  },
  tabsBar: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    gap: spacing.lg,
  },
  tabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: spacing.sm,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabBtnActive: { borderBottomColor: colors.primary },
  tabCount: { color: colors.outline, fontSize: 11 },

  // Sub-tabs (secondary, chip style — appears under group tabs when the
  // active group has more than one sub-tab). Wraps to multiple rows when
  // the chip count exceeds the row width (e.g. Glossary's 14 entries).
  subTabsBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    marginBottom: spacing.md,
    gap: spacing.xs + 2,
  },
  subTabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '44',
  },
  subTabBtnActive: {
    backgroundColor: colors.primaryContainer + '55',
    borderColor: colors.primary + '88',
  },
  subTabCount: { color: colors.outline, fontSize: 10 },

  body: { paddingHorizontal: spacing.lg },

  // Per-system content-attribution panel at the bottom of the page.
  // Reads as a quiet footnote — outline border, no fill, secondary text.
  attribution: {
    marginTop: spacing.lg,
    padding: spacing.md,
    gap: spacing.xs,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '55',
    backgroundColor: 'transparent',
  },
  attributionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  attributionBody: {
    color: colors.onSurfaceVariant,
    lineHeight: 18,
  },

  // Search
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.xs + 2,
    backgroundColor: colors.surfaceContainer,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '66',
    marginBottom: spacing.sm + 4,
  },
  searchInput: {
    flex: 1,
    color: colors.onSurface,
    fontSize: 14,
  },

  // List
  list: { gap: 0 },
  row: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.outlineVariant + '66',
  },
  // Active expand-row state — lifts the card off the surrounding list with
  // a tinted background, primary-coloured accent bar, and rounded corners
  // so it reads as the focused tile rather than another item in the list.
  rowExpanded: {
    backgroundColor: colors.surfaceContainer,
    borderRadius: radius.lg,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
    borderBottomWidth: 0,
    marginVertical: spacing.xs + 2,
  },
  // Subtle accent for homebrew-tier rows — primaryContainer-tinted left
  // edge so they read as user-authored without overpowering the SRD
  // content sitting next to them. The Homebrew Chip in the row head does
  // the explicit labeling.
  rowHomebrew: {
    borderLeftWidth: 2,
    borderLeftColor: colors.primaryContainer,
    paddingLeft: 4,
  },
  rowHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm + 2,
  },
  rowHeadExpanded: {
    paddingHorizontal: spacing.sm + 4,
    paddingTop: spacing.sm + 4,
    paddingBottom: spacing.xs + 2,
  },
  rowMeta: { color: colors.onSurfaceVariant, marginTop: 2 },
  rowBadge: {
    flexShrink: 0,
    alignSelf: 'flex-start',
    marginLeft: spacing.sm,
  },
  rowBody: {
    paddingTop: spacing.xs,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  rowBodyExpanded: {
    paddingHorizontal: spacing.sm + 4,
    paddingBottom: spacing.md,
  },
  sourceFooter: {
    marginTop: spacing.sm,
    paddingTop: spacing.xs + 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.outlineVariant + '44',
  },
  bodyText: { color: colors.onSurfaceVariant, lineHeight: 20 },
  subBlock: { gap: 6, marginTop: spacing.xs + 2 },

  sourceTabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: spacing.sm,
  },
  sourceTab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceContainerHighest,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  sourceTabActive: {
    backgroundColor: colors.primaryContainer,
    borderColor: colors.primary,
  },

  // Compact-table chrome above each list.
  shellTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  filtersBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceContainerHighest,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  filtersBtnActive: {
    backgroundColor: colors.primaryContainer,
    borderColor: colors.primary,
  },

  // Table layout. Rows are flex-row with a fixed-width name column on the
  // left, a horizontally-scrolling middle, and a fixed-width right gutter
  // (chevron + source badges).
  tableRowOuter: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.outlineVariant + '55',
  },
  tableRowExpanded: {
    backgroundColor: colors.surfaceContainer,
    borderRadius: radius.lg,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
    borderBottomWidth: 0,
    marginVertical: spacing.xs + 2,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
  },
  tableNameCol: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    justifyContent: 'center',
  },
  tableScrollContent: {
    flexGrow: 1,
    alignItems: 'center',
  },
  tableHeadCell: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    justifyContent: 'center',
  },
  headerCellInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  tableCell: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    justifyContent: 'center',
  },
  tableCellText: {
    color: colors.onSurfaceVariant,
  },
  tableRightGutter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  tableRowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  tableRightGutterHead: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    minWidth: 100,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  tableSourceStack: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    maxWidth: 180,
    justifyContent: 'flex-end',
  },
  tableRowBody: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },

  // Filter sheet — facet sections stacked inside a PopoverModal.
  filterFacetSection: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.outlineVariant + '33',
  },
  filterFacetHeader: {
    color: colors.onSurfaceVariant,
    letterSpacing: 1.25,
  },
  filterFacetEmpty: {
    color: colors.onSurfaceVariant,
    fontStyle: 'italic',
  },
  filterFacetChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  filterValueChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceContainerHighest,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  filterValueChipActive: {
    backgroundColor: colors.primaryContainer,
    borderColor: colors.primary,
  },
  popoverBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  popoverCard: {
    width: '100%',
    maxWidth: 360,
    maxHeight: '70%',
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '55',
    overflow: 'hidden',
  },
  popoverHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.outlineVariant + '55',
  },
  popoverScroll: {
    maxHeight: 360,
  },
  popoverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  popoverRowActive: {
    backgroundColor: colors.primaryContainer + '33',
  },

  // Rules list — chapter accordion. Headers read as a card-like band so they
  // stand apart from the white-on-canvas section rows below them.
  rulesChapter: { marginTop: spacing.md },
  rulesChapterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceContainerHigh,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  rulesChapterHeaderCollapsed: {
    marginBottom: 0,
  },
  rulesChapterTitle: {
    flex: 1,
    color: colors.onSurface,
    letterSpacing: -0.3,
  },
  rulesChapterCountPill: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: radius.full,
    backgroundColor: colors.primaryContainer + '55',
    borderWidth: 1,
    borderColor: colors.primary + '88',
  },
  rulesChapterCountText: {
    color: colors.onSurface,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  profJoiner: { color: colors.onSurfaceVariant, opacity: 0.7 },
  bullet: { gap: 4, marginTop: spacing.sm },
  /** Indented bullet for refClassFeature children (sub-options of a
   *  parent feature, e.g. Cleric's Protector / Thaumaturge under
   *  Divine Order). Stronger visual cue than a thin border alone:
   *  deeper indent, a primary-color left rule, and a tinted background
   *  so the parent/child relationship reads at a glance. */
  bulletNested: {
    marginLeft: spacing.lg,
    paddingLeft: spacing.md,
    paddingRight: spacing.sm,
    paddingVertical: spacing.xs + 2,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary + 'aa',
    backgroundColor: colors.primary + '0a',
    borderRadius: 4,
    marginTop: spacing.xs,
  },
  /** Heading row for a nested feature — `↳` marker + bold name. */
  bulletNestedHeading: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  /** Subtle arrow prefix that signals "sub-option of the feature above". */
  bulletNestedMarker: {
    color: colors.primary,
    opacity: 0.85,
  },
  becomingBullet: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    marginTop: 4,
  },
  becomingBulletDot: {
    width: 12,
    color: colors.outline,
  },
  becomingBulletText: {
    flex: 1,
  },

  emptyHit: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },

  // Detail-modal sections + nested subclass cards
  modalSection: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.outlineVariant + '55',
    gap: spacing.xs + 2,
  },
  /** Sub-section inside a modal section (e.g. Becoming → Level 1 / Multiclass). */
  subSection: {
    marginTop: spacing.sm + 2,
    gap: spacing.xs + 2,
  },
  subclassCard: {
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: radius.lg,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary + 'AA',
    padding: spacing.sm + 4,
    marginTop: spacing.sm,
  },
  subclassHeadRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  subclassSourceStack: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    justifyContent: 'flex-end',
    maxWidth: 180,
  },

  // Class progression table
  classTable: {
    borderWidth: 1,
    borderColor: colors.outlineVariant + '55',
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surfaceContainer,
  },
  classTableRow: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.outlineVariant + '55',
  },
  classTableRowLast: { borderBottomWidth: 0 },
  classTableHeadRow: { backgroundColor: colors.surfaceContainerHigh },
  classTableCell: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
  },
  classTableLevelCell:    { width: 56,  color: colors.outline, letterSpacing: 1 },
  classTableMetaCell:     { width: 100, color: colors.outline, letterSpacing: 1 },
  classTableFeaturesCell: { width: 280, color: colors.outline, letterSpacing: 1 },

  // Class features grouped by level
  featureLevelGroup: {
    marginTop: spacing.sm,
    paddingTop: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.outlineVariant + '44',
  },
  featureLevelLabel: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 4,
  },

  // Item stat tables — label / value rows for the expanded item card.
  itemStatTable: {
    marginTop: spacing.xs,
    paddingTop: spacing.xs + 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.outlineVariant + '88',
  },
  itemStatRow: {
    flexDirection: 'row',
    paddingVertical: 4,
    gap: spacing.md,
    alignItems: 'baseline',
  },
  itemStatLabel: {
    width: 84,
    color: colors.outline,
    letterSpacing: 1,
  },
  itemStatValue: {
    flex: 1,
    color: colors.onSurface,
  },
  itemSourceRow: {
    flexDirection: 'row',
    marginTop: spacing.sm + 4,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.outlineVariant + '55',
    gap: spacing.md,
    alignItems: 'baseline',
  },
  itemBadgeStack: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    maxWidth: 220,
  },

  // Creature stat block — six-cell ability grid.
  creatureAbilityGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
  },
  creatureAbilityCell: {
    flexBasis: '15.5%',
    flexGrow: 1,
    minWidth: 56,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 6,
    backgroundColor: colors.surfaceContainer,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.outlineVariant + '88',
    alignItems: 'center',
  },
  creatureAbilityLabel: {
    color: colors.outline,
    letterSpacing: 1,
    marginBottom: 2,
  },
  creatureAbilityScore: {
    color: colors.onSurface,
    fontSize: 18,
    lineHeight: 22,
  },
  creatureAbilityMod: {
    color: colors.onSurfaceVariant,
    marginTop: 1,
  },

  // Reference rows
  refRow: {
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.outlineVariant + '66',
    gap: 3,
  },
  refRowHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  refRowSub: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: colors.outline,
  },

  // Seed banner
  seedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.sm,
    backgroundColor: colors.primaryContainer + '22',
    borderWidth: 1,
    borderColor: colors.primary + '55',
    borderRadius: radius.lg,
    marginBottom: spacing.sm + 4,
  },
  seedBannerText: {
    flex: 1,
    color: colors.onSurfaceVariant,
    lineHeight: 18,
  },

  // Schema
  schemaGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  schemaFull: { flexBasis: '100%', flexGrow: 1 },
  schemaHalf: { flexBasis: '48%', flexGrow: 1, minWidth: 320 },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: spacing.sm,
  },
  kv: {
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.outlineVariant + '66',
    gap: 2,
  },
});
