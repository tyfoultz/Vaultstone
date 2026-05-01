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
import type { GameSystemDefinition } from '@vaultstone/types';
import type {
  SpeciesResult, ClassResult, BackgroundResult,
  SubclassResult, ConditionResult, SpellResult,
  ItemResult, FeatResult, CreatureResult,
} from '@vaultstone/types';

const EMPTY_CONTENT: SrdContent = {
  species: [], classes: [], subclasses: [], backgrounds: [],
  conditions: [], spells: [], items: [], feats: [], creatures: [],
};

const BUNDLED: Record<string, GameSystemDefinition> = {
  dnd5e_2014: dnd5e2014System,
  dnd5e_2024: dnd5e2024System,
  // Legacy alias — pre-split characters / campaigns referencing `dnd5e`
  // resolve to the 2024 edition until they migrate.
  dnd5e: dnd5e2024System,
  custom: customSystem,
};

type TabKey =
  | 'species' | 'classes' | 'subclasses' | 'backgrounds'
  | 'spells' | 'feats' | 'items' | 'creatures' | 'conditions'
  | 'schema';

// Keys in the order they appear in the tab strip.
const TAB_DEFS: { key: TabKey; label: string; contentKey: keyof SrdContent | null }[] = [
  { key: 'species',     label: 'Species',     contentKey: 'species' },
  { key: 'classes',     label: 'Classes',     contentKey: 'classes' },
  { key: 'subclasses',  label: 'Subclasses',  contentKey: 'subclasses' },
  { key: 'backgrounds', label: 'Backgrounds', contentKey: 'backgrounds' },
  { key: 'spells',      label: 'Spells',      contentKey: 'spells' },
  { key: 'feats',       label: 'Feats',       contentKey: 'feats' },
  { key: 'items',       label: 'Items',       contentKey: 'items' },
  { key: 'creatures',   label: 'Monsters',    contentKey: 'creatures' },
  { key: 'conditions',  label: 'Conditions',  contentKey: 'conditions' },
  { key: 'schema',      label: 'Schema',      contentKey: null },
];

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

  // Build tab list by walking TAB_DEFS in order; only include content tabs
  // that have at least one item, then always end with Schema.
  const tabs = useMemo(() => {
    return TAB_DEFS
      .filter((t) => t.contentKey === null || content[t.contentKey].length > 0)
      .map((t) => ({
        key: t.key,
        label: t.label,
        count: t.contentKey ? content[t.contentKey].length : undefined,
      }));
  }, [content]);

  // Default tab: first content tab if any, else Schema.
  const initialTab: TabKey = tabs[0]?.key ?? 'schema';
  const [tab, setTab] = useState<TabKey>(initialTab);

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

      {/* Tabs — horizontally scrollable so 10 tabs fit on narrow screens. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabsBar}
        style={styles.tabsScroll}
      >
        {tabs.map((t) => {
          const active = tab === t.key;
          return (
            <Pressable
              key={t.key}
              onPress={() => setTab(t.key)}
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
                {t.label}
              </Text>
              {typeof t.count === 'number' ? (
                <Text variant="body-sm" family="body" style={styles.tabCount}>{t.count}</Text>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.body}>
        {tab === 'species'     ? <SpeciesList     items={content.species} /> : null}
        {tab === 'classes'     ? <ClassesList     items={content.classes} /> : null}
        {tab === 'subclasses'  ? <SubclassesList  items={content.subclasses} /> : null}
        {tab === 'backgrounds' ? <BackgroundsList items={content.backgrounds} /> : null}
        {tab === 'spells'      ? <SpellsList      items={content.spells} /> : null}
        {tab === 'feats'       ? <FeatsList       items={content.feats} /> : null}
        {tab === 'items'       ? <ItemsList       items={content.items} /> : null}
        {tab === 'creatures'   ? <CreaturesList   items={content.creatures} /> : null}
        {tab === 'conditions'  ? <ConditionsList  items={content.conditions} /> : null}
        {tab === 'schema'      ? <SchemaPanel     sys={sys} /> : null}
      </View>

      <View style={{ height: spacing.xl }} />
    </ScrollView>
  );
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
    <View style={styles.row}>
      <Pressable
        onPress={onToggle}
        style={({ pressed }) => [styles.rowHead, pressed && { opacity: 0.85 }]}
        accessibilityRole="button"
      >
        <View style={{ flex: 1 }}>
          <Text variant="title-sm" family="headline" weight="bold" style={{ color: colors.onSurface }}>
            {title}
          </Text>
          {summary ? (
            <Text variant="body-sm" family="body" style={styles.rowMeta} numberOfLines={1}>
              {summary}
            </Text>
          ) : null}
        </View>
        <Icon
          name={expanded ? 'expand-less' : 'expand-more'}
          size={20}
          color={colors.outline}
        />
      </Pressable>
      {expanded ? <View style={styles.rowBody}>{children}</View> : null}
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

function ClassesList({ items }: { items: ClassResult[] }) {
  const [q, setQ] = useState('');
  const exp = useExpanded();
  const filtered = useMemo(() => filterByName(items, q).slice().sort((a, b) => a.name.localeCompare(b.name)), [items, q]);

  return (
    <View style={styles.list}>
      <SearchBar value={q} onChange={setQ} placeholder="Search classes…" />
      {filtered.map((c) => {
        const cAny = c as any;
        const summary = [
          cAny.hitDie ? `d${cAny.hitDie} hit die` : null,
          cAny.spellcasting ? `spellcaster (${cAny.spellcastingAbility ?? '—'})` : 'martial',
          Array.isArray(cAny.primaryAbility) && cAny.primaryAbility.length > 0
            ? `primary ${cAny.primaryAbility.join(', ')}`
            : null,
        ].filter(Boolean).join(' · ');
        return (
          <ExpandRow
            key={c.key}
            title={c.name}
            summary={summary}
            expanded={exp.isOpen(c.key)}
            onToggle={() => exp.toggle(c.key)}
          >
            {c.description ? <Text variant="body-sm" family="body" style={styles.bodyText}>{c.description}</Text> : null}
            <ProfBlock label="Saving throws" items={cAny.savingThrows} />
            <ProfBlock label="Armor"          items={cAny.armorProficiencies} />
            <ProfBlock label="Weapons"        items={cAny.weaponProficiencies} />
            {cAny.skillChoices?.from ? (
              <View style={styles.subBlock}>
                <MetaLabel size="sm">
                  {`Skills (choose ${cAny.skillChoices.count ?? 1})`}
                </MetaLabel>
                <View style={styles.chipRow}>
                  {(cAny.skillChoices.from as string[]).map((it) => (
                    <Chip key={it} label={it} variant="meta" />
                  ))}
                </View>
              </View>
            ) : null}
            {Array.isArray(cAny.level1Features) && cAny.level1Features.length > 0 ? (
              <View style={styles.subBlock}>
                <MetaLabel size="sm">Level 1 features</MetaLabel>
                {cAny.level1Features.map((f: any, i: number) => (
                  <View key={i} style={styles.bullet}>
                    <Text variant="body-sm" family="body" weight="bold" style={{ color: colors.onSurface }}>{f.name}</Text>
                    <Text variant="body-sm" family="body" style={styles.bodyText}>{f.description}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            {Array.isArray(cAny.srdVersions) && cAny.srdVersions.length > 0 ? (
              <SrdVersionsRow versions={cAny.srdVersions} />
            ) : null}
          </ExpandRow>
        );
      })}
      {filtered.length === 0 ? <EmptyHit q={q} /> : null}
    </View>
  );
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

  // Tabs
  tabsScroll: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.outlineVariant + '88',
    marginBottom: spacing.md,
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
  rowHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm + 2,
  },
  rowMeta: { color: colors.onSurfaceVariant, marginTop: 2 },
  rowBody: {
    paddingTop: spacing.xs,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  bodyText: { color: colors.onSurfaceVariant, lineHeight: 20 },
  subBlock: { gap: 6, marginTop: spacing.xs + 2 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  bullet: { gap: 2, marginTop: 4 },

  emptyHit: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
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
