import { useMemo, useState } from 'react';
import {
  View, ScrollView, Pressable, TextInput, StyleSheet, useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import {
  colors, spacing, radius,
  Card, Chip, MetaLabel, Text, ScreenHeader, Icon,
} from '@vaultstone/ui';
import { dnd5e2014System, dnd5e2024System, customSystem } from '@vaultstone/systems';
import { getSrdContent, SEED_ONLY_TYPES, type SrdContent } from '@vaultstone/content';
import { DetailModal, DetailSection, DetailSectionHeading } from '../../../components/DetailModal';
import type { GameSystemDefinition } from '@vaultstone/types';
import type {
  SpeciesResult, ClassResult, BackgroundResult,
  SubclassResult, ConditionResult, SpellResult,
  ItemResult, FeatResult, CreatureResult,
  SkillResult, DamageTypeResult, SchoolResult, SizeResult,
  LanguageResult, ActionTypeResult, WeaponPropertyResult, WeaponMasteryResult,
  StandardActionResult, SenseResult, SpeedResult, CreatureTypeResult,
  AlignmentResult, CurrencyResult, ToolResult, MagicItemCategoryResult, CoverResult,
} from '@vaultstone/types';

const EMPTY_CONTENT: SrdContent = {
  species: [], classes: [], subclasses: [], backgrounds: [],
  conditions: [], spells: [], items: [], feats: [], creatures: [],
  skills: [], damageTypes: [], schools: [], sizes: [], languages: [],
  actionTypes: [], weaponProperties: [], weaponMasteries: [],
  standardActions: [], senses: [], speeds: [], creatureTypes: [],
  alignments: [], currencies: [], tools: [], magicItemCategories: [], cover: [],
};

const BUNDLED: Record<string, GameSystemDefinition> = {
  dnd5e_2014: dnd5e2014System,
  dnd5e_2024: dnd5e2024System,
  // Legacy alias — pre-split characters / campaigns referencing `dnd5e`
  // resolve to the 2024 edition until they migrate.
  dnd5e: dnd5e2024System,
  custom: customSystem,
};

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
  | 'character' | 'spells' | 'combat' | 'equipment' | 'bestiary' | 'schema';

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
      { key: 'species',     label: 'Species',     contentKey: 'species' },
      { key: 'classes',     label: 'Classes',     contentKey: 'classes' },
      { key: 'backgrounds', label: 'Backgrounds', contentKey: 'backgrounds' },
      { key: 'feats',       label: 'Feats',       contentKey: 'feats' },
      { key: 'skills',      label: 'Skills',      contentKey: 'skills' },
      { key: 'languages',   label: 'Languages',   contentKey: 'languages' },
    ],
  },
  {
    key: 'spells',
    label: 'Spells & Magic',
    subTabs: [
      { key: 'spells',  label: 'Spells',  contentKey: 'spells' },
      { key: 'schools', label: 'Schools', contentKey: 'schools' },
    ],
  },
  {
    key: 'combat',
    label: 'Combat',
    subTabs: [
      { key: 'standard-actions', label: 'Standard Actions', contentKey: 'standardActions' },
      { key: 'action-types',     label: 'Action Types',     contentKey: 'actionTypes' },
      { key: 'conditions',       label: 'Conditions',       contentKey: 'conditions' },
      { key: 'damage-types',     label: 'Damage Types',     contentKey: 'damageTypes' },
      { key: 'cover',            label: 'Cover',            contentKey: 'cover' },
    ],
  },
  {
    key: 'equipment',
    label: 'Equipment',
    subTabs: [
      { key: 'weapons',               label: 'Weapons',               contentKey: 'items', itemCategories: ['weapon'] },
      { key: 'armor',                 label: 'Armor',                 contentKey: 'items', itemCategories: ['armor', 'shield'] },
      { key: 'adventuring-gear',      label: 'Adventuring Gear',      contentKey: 'items', itemCategories: ['adventuring-gear'] },
      { key: 'magic-items',           label: 'Magic Items',           contentKey: 'items', itemCategories: ['magic-item'] },
      { key: 'crafting-equipment',    label: 'Crafting Equipment',    contentKey: 'items', itemCategories: ['crafting-equipment'] },
      { key: 'tools',                 label: 'Tools',                 contentKey: 'tools' },
      { key: 'weapon-properties',     label: 'Weapon Properties',     contentKey: 'weaponProperties' },
      { key: 'weapon-masteries',      label: 'Weapon Masteries',      contentKey: 'weaponMasteries' },
      { key: 'magic-item-categories', label: 'Magic Item Categories', contentKey: 'magicItemCategories' },
      { key: 'currencies',            label: 'Currencies',            contentKey: 'currencies' },
    ],
  },
  {
    key: 'bestiary',
    label: 'Bestiary',
    subTabs: [
      { key: 'creatures',      label: 'Monsters',       contentKey: 'creatures' },
      { key: 'creature-types', label: 'Creature Types', contentKey: 'creatureTypes' },
      { key: 'sizes',          label: 'Sizes',          contentKey: 'sizes' },
      { key: 'senses',         label: 'Senses',         contentKey: 'senses' },
      { key: 'speeds',         label: 'Speeds',         contentKey: 'speeds' },
      { key: 'alignments',     label: 'Alignments',     contentKey: 'alignments' },
    ],
  },
  {
    key: 'schema',
    label: 'Schema',
    subTabs: [
      { key: 'schema', label: 'Schema', contentKey: '__schema__' },
    ],
  },
];

function subTabItemCount(t: SubTab, content: SrdContent): number {
  if (t.contentKey === '__schema__') return 0;
  if (t.itemCategories && t.contentKey === 'items') {
    const set = new Set<ItemCategory>(t.itemCategories);
    return content.items.filter((i) => set.has(i.category)).length;
  }
  return content[t.contentKey].length;
}

function isSubTabAvailable(t: SubTab, content: SrdContent): boolean {
  if (t.contentKey === '__schema__') return true;
  return subTabItemCount(t, content) > 0;
}

function visibleSubTabs(group: Group, content: SrdContent): SubTab[] {
  return group.subTabs.filter((t) => isSubTabAvailable(t, content));
}

export default function GameSystemDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const sys = BUNDLED[id ?? ''];

  if (!sys) {
    return <NotFound onBack={() => router.push('/game-systems' as Href)} />;
  }

  return <GameSystemDetail sys={sys} onBack={() => router.push('/game-systems' as Href)} />;
}

function GameSystemDetail({ sys, onBack }: { sys: GameSystemDefinition; onBack: () => void }) {
  // Filter bundled SRD content to records tagged with this system's edition.
  // Systems without an SRD version (Custom, future homebrew systems) get nothing.
  const content = useMemo(
    () => (sys.srdVersion ? getSrdContent(sys.srdVersion) : EMPTY_CONTENT),
    [sys.srdVersion],
  );

  // Build the visible group + sub-tab tree once per content change. A group
  // disappears entirely when none of its sub-tabs have content — except
  // Schema, which is always present.
  const groups = useMemo(() => {
    return GROUPS
      .map((g) => ({ ...g, subTabs: visibleSubTabs(g, content) }))
      .filter((g) => g.subTabs.length > 0);
  }, [content]);

  // Default selection: first non-Schema group with content if any, else Schema.
  const initialGroup: GroupKey = groups[0]?.key ?? 'schema';
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

      {/* Sub-tab strip — only when the active group has more than one sub-tab. */}
      {currentGroup && currentGroup.subTabs.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.subTabsBar}
          style={styles.subTabsScroll}
        >
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
        </ScrollView>
      ) : null}

      <View style={styles.body}>
        {renderSubBody(activeSub, content, sys)}
      </View>

      <View style={{ height: spacing.xl }} />
    </ScrollView>
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
    return <ItemsList items={content.items.filter((i) => set.has(i.category))} />;
  }
  switch (active.contentKey) {
    case 'species':          return <SpeciesList     items={content.species} />;
    case 'classes':          return <ClassesList     items={content.classes} allSubclasses={content.subclasses} />;
    case 'backgrounds':      return <BackgroundsList items={content.backgrounds} />;
    case 'spells':           return <SpellsList      items={content.spells} />;
    case 'feats':            return <FeatsList       items={content.feats} />;
    case 'items':            return <ItemsList       items={content.items} />;
    case 'creatures':        return <CreaturesList   items={content.creatures} />;
    case 'conditions':       return <ConditionsList  items={content.conditions} />;
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
  title, summary, expanded, onToggle, children,
}: {
  title: string;
  summary: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <View style={[styles.row, expanded && styles.rowExpanded]}>
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
        <Icon
          name={expanded ? 'expand-less' : 'expand-more'}
          size={20}
          color={expanded ? colors.primary : colors.outline}
        />
      </Pressable>
      {expanded ? <View style={[styles.rowBody, styles.rowBodyExpanded]}>{children}</View> : null}
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

function SpeciesList({ items }: { items: SpeciesResult[] }) {
  const [q, setQ] = useState('');
  const exp = useExpanded();
  const filtered = useMemo(() => filterByName(items, q).slice().sort((a, b) => a.name.localeCompare(b.name)), [items, q]);

  return (
    <View style={styles.list}>
      <SearchBar value={q} onChange={setQ} placeholder="Search species…" />
      {filtered.map((s) => (
        <ExpandRow
          key={s.key}
          title={s.name}
          summary={`${s.size ?? '—'} · ${s.speed ?? '—'} ft`}
          expanded={exp.isOpen(s.key)}
          onToggle={() => exp.toggle(s.key)}
        >
          {s.description ? <Text variant="body-sm" family="body" style={styles.bodyText}>{s.description}</Text> : null}
          {Array.isArray(s.traits) && s.traits.length > 0 ? (
            <View style={styles.subBlock}>
              <MetaLabel size="sm">Traits</MetaLabel>
              {s.traits.map((t: any, i: number) => (
                <View key={i} style={styles.bullet}>
                  <Text variant="body-sm" family="body" weight="bold" style={{ color: colors.onSurface }}>{t.name}</Text>
                  <Text variant="body-sm" family="body" style={styles.bodyText}>{t.description}</Text>
                </View>
              ))}
            </View>
          ) : null}
          {Array.isArray(s.srdVersions) && s.srdVersions.length > 0 ? (
            <SrdVersionsRow versions={s.srdVersions} />
          ) : null}
        </ExpandRow>
      ))}
      {filtered.length === 0 ? <EmptyHit q={q} /> : null}
    </View>
  );
}

function ClassesList({ items, allSubclasses }: { items: ClassResult[]; allSubclasses: SubclassResult[] }) {
  const [q, setQ] = useState('');
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const filtered = useMemo(
    () => filterByName(items, q).slice().sort((a, b) => a.name.localeCompare(b.name)),
    [items, q],
  );
  const active = activeKey ? items.find((c) => c.key === activeKey) ?? null : null;

  return (
    <View style={styles.list}>
      <SearchBar value={q} onChange={setQ} placeholder="Search classes…" />
      {filtered.map((c) => (
        <Pressable
          key={c.key}
          onPress={() => setActiveKey(c.key)}
          style={({ pressed }) => [styles.row, styles.rowHead, pressed && { opacity: 0.85 }]}
          accessibilityRole="button"
          accessibilityLabel={`Open ${c.name}`}
        >
          <View style={{ flex: 1 }}>
            <Text variant="title-sm" family="headline" weight="bold" style={{ color: colors.onSurface }}>
              {c.name}
            </Text>
            {c.description ? (
              <Text variant="body-sm" family="body" style={styles.rowMeta} numberOfLines={2}>
                {c.description}
              </Text>
            ) : null}
          </View>
          <Icon name="chevron-right" size={20} color={colors.outline} />
        </Pressable>
      ))}
      {filtered.length === 0 ? <EmptyHit q={q} /> : null}
      {active ? (
        <ClassDetailModal klass={active} allSubclasses={allSubclasses} onClose={() => setActiveKey(null)} />
      ) : null}
    </View>
  );
}

function ClassDetailModal({
  klass: c, allSubclasses, onClose,
}: {
  klass: ClassResult;
  allSubclasses: SubclassResult[];
  onClose: () => void;
}) {
  const subclasses = allSubclasses.filter((s) => s.parentClassKey === c.key);
  const featureGroups = groupFeaturesByLevel(c.features ?? []);

  const heroStats = useMemo(() => {
    const stats: { label: string; value: string }[] = [];
    if (c.primaryAbility?.length) {
      stats.push({ label: 'PRIMARY ABILITY', value: c.primaryAbility.join(', ') });
    }
    if (c.hitDie) stats.push({ label: 'HIT DIE', value: `d${c.hitDie}` });
    if (c.savingThrows?.length) {
      stats.push({ label: 'SAVING THROWS', value: c.savingThrows.join(', ') });
    }
    return stats;
  }, [c]);

  const level1Features = (c.features ?? []).filter((f) => f.level === 1);
  const hasBecoming =
    (c.startingEquipment ?? []).length > 0 ||
    level1Features.length > 0 ||
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
      heroStats={heroStats}
      anchors={anchors}
    >
      {/* ── Core Traits ──────────────────────────────────────────────── */}
      <DetailSection id="core" style={styles.modalSection}>
        <DetailSectionHeading>{`Core ${c.name} Traits`}</DetailSectionHeading>
        <ProfBlock
          label="Spellcasting"
          items={[c.spellcasting ? (c.spellcastingAbility ?? 'Yes') : 'Martial (none)']}
        />
        <ProfBlock label="Armor"   items={c.armorProficiencies} />
        <ProfBlock label="Weapons" items={c.weaponProficiencies} />
        {Array.isArray(c.toolProficiencies) && c.toolProficiencies.length > 0 ? (
          <ProfBlock label="Tools" items={c.toolProficiencies} />
        ) : null}
        {c.skillChoices?.from ? (
          <View style={styles.subBlock}>
            <MetaLabel size="sm">{`Skills (choose ${c.skillChoices.count ?? 1})`}</MetaLabel>
            <View style={styles.chipRow}>
              {c.skillChoices.from.map((it) => <Chip key={it} label={it} variant="meta" />)}
            </View>
          </View>
        ) : null}
      </DetailSection>

      {/* ── Becoming a [Class] ──────────────────────────────────────── */}
      {hasBecoming ? (
        <DetailSection id="becoming" style={styles.modalSection}>
          <DetailSectionHeading>{`Becoming a ${c.name}`}</DetailSectionHeading>

          {/* Level 1 — starting equipment + level 1 features */}
          {((c.startingEquipment ?? []).length > 0 || level1Features.length > 0) ? (
            <View style={styles.subSection}>
              <Text variant="body-sm" family="body" weight="bold" style={styles.featureLevelLabel}>
                Level 1
              </Text>
              {Array.isArray(c.startingEquipment) && c.startingEquipment.length > 0 ? (
                <View style={styles.subBlock}>
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
              {level1Features.length > 0 ? (
                <View style={styles.subBlock}>
                  <MetaLabel size="sm">Level 1 features</MetaLabel>
                  {level1Features.map((f, i) => (
                    <View key={i} style={styles.bullet}>
                      <Text variant="body-sm" family="body" weight="bold" style={{ color: colors.onSurface }}>{f.name}</Text>
                      {f.description ? (
                        <Text variant="body-sm" family="body" style={styles.bodyText}>{f.description}</Text>
                      ) : null}
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}

          {/* Multiclass */}
          {(c.multiclassPrerequisite || c.multiclassProficiencies) ? (
            <View style={styles.subSection}>
              <Text variant="body-sm" family="body" weight="bold" style={styles.featureLevelLabel}>
                Multiclass
              </Text>
              {c.multiclassPrerequisite ? (
                <Text variant="body-sm" family="body" style={styles.bodyText}>
                  Prerequisite: <Text weight="bold" style={{ color: colors.onSurface }}>{c.multiclassPrerequisite}</Text>
                </Text>
              ) : null}
              {c.multiclassProficiencies?.armor && c.multiclassProficiencies.armor.length > 0 ? (
                <ProfBlock label="Gain armor" items={c.multiclassProficiencies.armor} />
              ) : null}
              {c.multiclassProficiencies?.weapons && c.multiclassProficiencies.weapons.length > 0 ? (
                <ProfBlock label="Gain weapons" items={c.multiclassProficiencies.weapons} />
              ) : null}
              {c.multiclassProficiencies?.tools && c.multiclassProficiencies.tools.length > 0 ? (
                <ProfBlock label="Gain tools" items={c.multiclassProficiencies.tools} />
              ) : null}
              {c.multiclassProficiencies?.skills?.from ? (
                <View style={styles.subBlock}>
                  <MetaLabel size="sm">{`Gain skills (choose ${c.multiclassProficiencies.skills.count ?? 1})`}</MetaLabel>
                  <View style={styles.chipRow}>
                    {c.multiclassProficiencies.skills.from.map((it) => <Chip key={it} label={it} variant="meta" />)}
                  </View>
                </View>
              ) : null}
            </View>
          ) : null}
        </DetailSection>
      ) : null}

      {/* ── Class Features (table + detailed list) ──────────────────── */}
      {featureGroups.length > 0 ? (
        <DetailSection id="features" style={styles.modalSection}>
          <DetailSectionHeading>{`${c.name} Class Features`}</DetailSectionHeading>

          {/* Class table — Level → feature names per level */}
          <View style={styles.subSection}>
            <MetaLabel size="sm">Class table</MetaLabel>
            <ClassFeatureTable groups={featureGroups} />
          </View>

          {/* Detailed list — full descriptions grouped by level */}
          <View style={styles.subSection}>
            <MetaLabel size="sm">Detailed list</MetaLabel>
            {featureGroups.map(([level, feats]) => (
              <View key={level} style={styles.featureLevelGroup}>
                <Text variant="body-sm" family="body" weight="bold" style={styles.featureLevelLabel}>
                  Level {level}
                </Text>
                {feats.map((f, i) => (
                  <View key={i} style={styles.bullet}>
                    <Text variant="body-sm" family="body" weight="bold" style={{ color: colors.onSurface }}>{f.name}</Text>
                    {f.description ? (
                      <Text variant="body-sm" family="body" style={styles.bodyText}>{f.description}</Text>
                    ) : null}
                  </View>
                ))}
              </View>
            ))}
          </View>
        </DetailSection>
      ) : null}

      {/* ── Subclasses (nested cards) ───────────────────────────────── */}
      {subclasses.length > 0 ? (
        <DetailSection id="subclasses" style={styles.modalSection}>
          <DetailSectionHeading>{`Subclasses · unlock at L${c.subclassUnlockLevel}`}</DetailSectionHeading>
          {subclasses.map((sc) => (
            <View key={sc.key} style={styles.subclassCard}>
              <Text variant="title-sm" family="headline" weight="bold" style={{ color: colors.primary }}>
                {sc.name}
              </Text>
              {sc.description ? (
                <Text variant="body-sm" family="body" style={[styles.bodyText, { marginTop: 4 }]}>
                  {sc.description}
                </Text>
              ) : null}
              {Array.isArray(sc.features) && sc.features.length > 0 ? (
                <View style={[styles.subBlock, { marginTop: spacing.xs + 2 }]}>
                  {sc.features.map((f, i) => (
                    <View key={i} style={styles.bullet}>
                      <Text variant="body-sm" family="body" weight="bold" style={{ color: colors.onSurface }}>
                        L{f.level} · {f.name}
                      </Text>
                      <Text variant="body-sm" family="body" style={styles.bodyText}>{f.description}</Text>
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
 * Compact class progression table — Level | Feature names. Mirrors the
 * "class table" header section on D&D Beyond's class pages without the
 * per-class custom columns (proficiency bonus, rage damage, etc.) which
 * we'd need additional schema to express.
 */
function ClassFeatureTable({
  groups,
}: { groups: Array<[number, Array<{ name: string }>]> }) {
  return (
    <View style={styles.classTable}>
      <View style={[styles.classTableRow, styles.classTableHeadRow]}>
        <Text variant="label-sm" weight="bold" uppercase style={[styles.classTableCell, styles.classTableLevelCell]}>
          Level
        </Text>
        <Text variant="label-sm" weight="bold" uppercase style={[styles.classTableCell, styles.classTableFeaturesCell]}>
          Features
        </Text>
      </View>
      {groups.map(([lvl, feats], i) => (
        <View
          key={lvl}
          style={[styles.classTableRow, i === groups.length - 1 && styles.classTableRowLast]}
        >
          <Text variant="body-sm" family="body" weight="bold" style={[styles.classTableCell, styles.classTableLevelCell, { color: colors.primary }]}>
            {lvl}
          </Text>
          <Text variant="body-sm" family="body" style={[styles.classTableCell, styles.classTableFeaturesCell, { color: colors.onSurface }]}>
            {feats.map((f) => f.name).join(', ')}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** Group features by level, preserving insertion order within each level. */
function groupFeaturesByLevel(
  features: Array<{ level: number; name: string; description?: string }>,
): Array<[number, Array<{ name: string; description?: string }>]> {
  const buckets = new Map<number, Array<{ name: string; description?: string }>>();
  for (const f of features) {
    const list = buckets.get(f.level) ?? [];
    list.push({ name: f.name, description: f.description });
    buckets.set(f.level, list);
  }
  return [...buckets.entries()].sort((a, b) => a[0] - b[0]);
}

function BackgroundsList({ items }: { items: BackgroundResult[] }) {
  const [q, setQ] = useState('');
  const exp = useExpanded();
  const filtered = useMemo(() => filterByName(items, q).slice().sort((a, b) => a.name.localeCompare(b.name)), [items, q]);

  return (
    <View style={styles.list}>
      <SearchBar value={q} onChange={setQ} placeholder="Search backgrounds…" />
      {filtered.map((b) => {
        const bAny = b as any;
        const skills: string[] = bAny.skillProficiencies ?? [];
        return (
          <ExpandRow
            key={b.key}
            title={b.name}
            summary={[
              skills.length > 0 ? skills.join(', ') : null,
              bAny.originFeat ? `feat: ${bAny.originFeat}` : null,
            ].filter(Boolean).join(' · ')}
            expanded={exp.isOpen(b.key)}
            onToggle={() => exp.toggle(b.key)}
          >
            {b.description ? <Text variant="body-sm" family="body" style={styles.bodyText}>{b.description}</Text> : null}
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
            {Array.isArray(bAny.srdVersions) && bAny.srdVersions.length > 0 ? (
              <SrdVersionsRow versions={bAny.srdVersions} />
            ) : null}
          </ExpandRow>
        );
      })}
      {filtered.length === 0 ? <EmptyHit q={q} /> : null}
    </View>
  );
}

function SubclassesList({ items }: { items: SubclassResult[] }) {
  const [q, setQ] = useState('');
  const exp = useExpanded();
  const filtered = useMemo(
    () => filterByName(items, q).slice().sort((a, b) =>
      (a.parentClassKey ?? '').localeCompare(b.parentClassKey ?? '') ||
      a.name.localeCompare(b.name)
    ),
    [items, q],
  );

  return (
    <View style={styles.list}>
      <SearchBar value={q} onChange={setQ} placeholder="Search subclasses…" />
      {filtered.map((s) => (
        <ExpandRow
          key={s.key}
          title={s.name}
          summary={[
            s.parentClassKey ? capitalize(s.parentClassKey) : null,
            typeof s.unlockLevel === 'number' ? `unlocks at L${s.unlockLevel}` : null,
          ].filter(Boolean).join(' · ')}
          expanded={exp.isOpen(s.key)}
          onToggle={() => exp.toggle(s.key)}
        >
          {s.description ? <Text variant="body-sm" family="body" style={styles.bodyText}>{s.description}</Text> : null}
          {Array.isArray(s.features) && s.features.length > 0 ? (
            <View style={styles.subBlock}>
              <MetaLabel size="sm">Features</MetaLabel>
              {s.features.map((f, i) => (
                <View key={i} style={styles.bullet}>
                  <Text variant="body-sm" family="body" weight="bold" style={{ color: colors.onSurface }}>
                    L{f.level} · {f.name}
                  </Text>
                  <Text variant="body-sm" family="body" style={styles.bodyText}>{f.description}</Text>
                </View>
              ))}
            </View>
          ) : null}
          {Array.isArray(s.srdVersions) && s.srdVersions.length > 0 ? <SrdVersionsRow versions={s.srdVersions} /> : null}
        </ExpandRow>
      ))}
      {filtered.length === 0 ? <EmptyHit q={q} /> : null}
    </View>
  );
}

function SpellsList({ items }: { items: SpellResult[] }) {
  const [q, setQ] = useState('');
  const exp = useExpanded();
  const filtered = useMemo(
    () => filterByName(items, q).slice().sort((a, b) => (a.level - b.level) || a.name.localeCompare(b.name)),
    [items, q],
  );

  return (
    <View style={styles.list}>
      <SeedBanner type="spells" />
      <SearchBar value={q} onChange={setQ} placeholder="Search spells…" />
      {filtered.map((s) => {
        const lvl = s.level === 0 ? 'Cantrip' : `Level ${s.level}`;
        return (
          <ExpandRow
            key={s.key}
            title={s.name}
            summary={[lvl, s.school, s.castingTime].filter(Boolean).join(' · ')}
            expanded={exp.isOpen(s.key)}
            onToggle={() => exp.toggle(s.key)}
          >
            {s.description ? <Text variant="body-sm" family="body" style={styles.bodyText}>{s.description}</Text> : null}
            <View style={styles.subBlock}>
              <View style={styles.chipRow}>
                {s.range ? <Chip label={`Range: ${s.range}`} variant="meta" /> : null}
                {s.duration ? <Chip label={`Duration: ${s.duration}`} variant="meta" /> : null}
                {s.concentration ? <Chip label="Concentration" variant="accent" /> : null}
              </View>
            </View>
            {Array.isArray(s.components) && s.components.length > 0 ? <ProfBlock label="Components" items={s.components} /> : null}
            {Array.isArray(s.classes) && s.classes.length > 0 ? <ProfBlock label="Classes" items={s.classes} /> : null}
            {Array.isArray(s.srdVersions) && s.srdVersions.length > 0 ? <SrdVersionsRow versions={s.srdVersions} /> : null}
          </ExpandRow>
        );
      })}
      {filtered.length === 0 ? <EmptyHit q={q} /> : null}
    </View>
  );
}

function FeatsList({ items }: { items: FeatResult[] }) {
  const [q, setQ] = useState('');
  const exp = useExpanded();
  const filtered = useMemo(
    () => filterByName(items, q).slice().sort((a, b) =>
      (a.category ?? '').localeCompare(b.category ?? '') || a.name.localeCompare(b.name)
    ),
    [items, q],
  );

  return (
    <View style={styles.list}>
      <SearchBar value={q} onChange={setQ} placeholder="Search feats…" />
      {filtered.map((f) => (
        <ExpandRow
          key={f.key}
          title={f.name}
          summary={[
            f.category ? capitalize(f.category.replace('-', ' ')) : null,
            f.prerequisites ? `req: ${f.prerequisites}` : null,
          ].filter(Boolean).join(' · ')}
          expanded={exp.isOpen(f.key)}
          onToggle={() => exp.toggle(f.key)}
        >
          {f.description ? <Text variant="body-sm" family="body" style={styles.bodyText}>{f.description}</Text> : null}
          {Array.isArray(f.benefits) && f.benefits.length > 0 ? (
            <View style={styles.subBlock}>
              <MetaLabel size="sm">Benefits</MetaLabel>
              {f.benefits.map((b, i) => (
                <View key={i} style={styles.bullet}>
                  <Text variant="body-sm" family="body" style={styles.bodyText}>• {b}</Text>
                </View>
              ))}
            </View>
          ) : null}
          {Array.isArray(f.srdVersions) && f.srdVersions.length > 0 ? <SrdVersionsRow versions={f.srdVersions} /> : null}
        </ExpandRow>
      ))}
      {filtered.length === 0 ? <EmptyHit q={q} /> : null}
    </View>
  );
}

function ItemsList({ items }: { items: ItemResult[] }) {
  const [q, setQ] = useState('');
  const exp = useExpanded();
  const filtered = useMemo(
    () => filterByName(items, q).slice().sort((a, b) =>
      (a.category ?? '').localeCompare(b.category ?? '') || a.name.localeCompare(b.name)
    ),
    [items, q],
  );

  return (
    <View style={styles.list}>
      <SeedBanner type="items" />
      <SearchBar value={q} onChange={setQ} placeholder="Search items…" />
      {filtered.map((it) => {
        const cost = it.cost ? `${it.cost.amount} ${it.cost.currency}` : null;
        return (
          <ExpandRow
            key={it.key}
            title={it.name}
            summary={[
              capitalize((it.category ?? '').replace('-', ' ')),
              cost,
              typeof it.weight === 'number' ? `${it.weight} lb` : null,
              it.rarity ? capitalize(it.rarity.replace('-', ' ')) : null,
            ].filter(Boolean).join(' · ')}
            expanded={exp.isOpen(it.key)}
            onToggle={() => exp.toggle(it.key)}
          >
            {it.description ? <Text variant="body-sm" family="body" style={styles.bodyText}>{it.description}</Text> : null}
            {Array.isArray(it.properties) && it.properties.length > 0 ? (
              <View style={styles.subBlock}>
                <MetaLabel size="sm">Properties</MetaLabel>
                {it.properties.map((p, i) => (
                  <View key={i} style={styles.bullet}>
                    <Text variant="body-sm" family="body" style={styles.bodyText}>• {p}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            {it.requiresAttunement ? (
              <View style={styles.subBlock}>
                <Chip label="Requires attunement" variant="accent" />
              </View>
            ) : null}
            {Array.isArray(it.srdVersions) && it.srdVersions.length > 0 ? <SrdVersionsRow versions={it.srdVersions} /> : null}
          </ExpandRow>
        );
      })}
      {filtered.length === 0 ? <EmptyHit q={q} /> : null}
    </View>
  );
}

function CreaturesList({ items }: { items: CreatureResult[] }) {
  const [q, setQ] = useState('');
  const exp = useExpanded();
  const filtered = useMemo(
    () => filterByName(items, q).slice().sort((a, b) => {
      const acr = typeof a.challengeRating === 'number' ? a.challengeRating : parseFloat(String(a.challengeRating)) || 0;
      const bcr = typeof b.challengeRating === 'number' ? b.challengeRating : parseFloat(String(b.challengeRating)) || 0;
      return acr - bcr || a.name.localeCompare(b.name);
    }),
    [items, q],
  );

  return (
    <View style={styles.list}>
      <SeedBanner type="creatures" />
      <SearchBar value={q} onChange={setQ} placeholder="Search monsters…" />
      {filtered.map((c) => (
        <ExpandRow
          key={c.key}
          title={c.name}
          summary={[
            `CR ${c.challengeRating}`,
            c.size,
            c.creatureType,
            `AC ${c.ac}`,
            `${c.hp} HP`,
          ].filter(Boolean).join(' · ')}
          expanded={exp.isOpen(c.key)}
          onToggle={() => exp.toggle(c.key)}
        >
          {c.description ? <Text variant="body-sm" family="body" style={styles.bodyText}>{c.description}</Text> : null}
          <View style={styles.subBlock}>
            <View style={styles.chipRow}>
              {c.alignment ? <Chip label={c.alignment} variant="meta" /> : null}
              {c.speed ? <Chip label={`Speed ${c.speed}`} variant="meta" /> : null}
            </View>
          </View>
          {Array.isArray(c.srdVersions) && c.srdVersions.length > 0 ? <SrdVersionsRow versions={c.srdVersions} /> : null}
        </ExpandRow>
      ))}
      {filtered.length === 0 ? <EmptyHit q={q} /> : null}
    </View>
  );
}

function ConditionsList({ items }: { items: ConditionResult[] }) {
  const [q, setQ] = useState('');
  const exp = useExpanded();
  const filtered = useMemo(() => filterByName(items, q).slice().sort((a, b) => a.name.localeCompare(b.name)), [items, q]);

  return (
    <View style={styles.list}>
      <SearchBar value={q} onChange={setQ} placeholder="Search conditions…" />
      {filtered.map((c) => (
        <ExpandRow
          key={c.key}
          title={c.name}
          summary={c.description ?? ''}
          expanded={exp.isOpen(c.key)}
          onToggle={() => exp.toggle(c.key)}
        >
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
          {Array.isArray(c.srdVersions) && c.srdVersions.length > 0 ? <SrdVersionsRow versions={c.srdVersions} /> : null}
        </ExpandRow>
      ))}
      {filtered.length === 0 ? <EmptyHit q={q} /> : null}
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
            <Text variant="body-sm" family="body" style={styles.bodyText}>{it.description}</Text>
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

function ToolsList({ items }: { items: ToolResult[] }) {
  return (
    <CatalogList
      items={items}
      placeholder="Search tools…"
      sub={(t) => {
        const cat = t.category.replace('-', ' ');
        const cost = t.cost ? `${t.cost.amount} ${t.cost.currency}` : null;
        return [capitalize(cat), cost].filter(Boolean).join(' · ');
      }}
      sort={(a, b) =>
        a.category.localeCompare(b.category) || a.name.localeCompare(b.name)
      }
    />
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

function ProfBlock({ label, items }: { label: string; items?: string[] | null }) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return (
    <View style={styles.subBlock}>
      <MetaLabel size="sm">{label}</MetaLabel>
      <View style={styles.chipRow}>
        {items.map((it) => <Chip key={it} label={it} variant="meta" />)}
      </View>
    </View>
  );
}

function SrdVersionsRow({ versions }: { versions: string[] }) {
  return (
    <View style={[styles.subBlock, { marginTop: spacing.sm }]}>
      <MetaLabel size="sm">SRD versions</MetaLabel>
      <View style={styles.chipRow}>
        {versions.map((v) => <Chip key={v} label={v.replace('_', ' ')} variant="category" />)}
      </View>
    </View>
  );
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
  // active group has more than one sub-tab).
  subTabsScroll: {
    flexGrow: 0,
    marginBottom: spacing.md,
    paddingTop: spacing.sm,
  },
  subTabsBar: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
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
  rowBody: {
    paddingTop: spacing.xs,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  rowBodyExpanded: {
    paddingHorizontal: spacing.sm + 4,
    paddingBottom: spacing.md,
  },
  bodyText: { color: colors.onSurfaceVariant, lineHeight: 20 },
  subBlock: { gap: 6, marginTop: spacing.xs + 2 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  bullet: { gap: 2, marginTop: 4 },

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
  classTableLevelCell: { width: 56, color: colors.outline, letterSpacing: 1 },
  classTableFeaturesCell: { flex: 1, color: colors.outline, letterSpacing: 1 },

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
