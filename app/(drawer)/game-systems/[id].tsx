import { useMemo, useState } from 'react';
import {
  View, ScrollView, Pressable, TextInput, StyleSheet, useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import {
  colors, spacing, radius,
  Card, Chip, MetaLabel, Text, ScreenHeader, Icon,
} from '@vaultstone/ui';
import { dnd5eSystem, customSystem } from '@vaultstone/systems';
import { getSrdContent } from '@vaultstone/content';
import type { GameSystemDefinition } from '@vaultstone/types';
import type {
  SpeciesResult, ClassResult, BackgroundResult,
} from '@vaultstone/types';

const BUNDLED: Record<string, GameSystemDefinition> = {
  dnd5e: dnd5eSystem,
  custom: customSystem,
};

type TabKey = 'species' | 'classes' | 'backgrounds' | 'schema';

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
  const isDnd = sys.id === 'dnd5e';
  const content = useMemo(() => (isDnd ? getSrdContent() : { species: [], classes: [], backgrounds: [] }), [isDnd]);

  // Default tab: Species for systems with bundled content, Schema for others (Custom).
  const initialTab: TabKey = isDnd ? 'species' : 'schema';
  const [tab, setTab] = useState<TabKey>(initialTab);

  const tabs: { key: TabKey; label: string; count?: number }[] = [];
  if (content.species.length > 0)     tabs.push({ key: 'species',     label: 'Species',     count: content.species.length });
  if (content.classes.length > 0)     tabs.push({ key: 'classes',     label: 'Classes',     count: content.classes.length });
  if (content.backgrounds.length > 0) tabs.push({ key: 'backgrounds', label: 'Backgrounds', count: content.backgrounds.length });
  tabs.push({ key: 'schema', label: 'Schema' });

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

      {/* Tabs */}
      <View style={styles.tabsBar}>
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
      </View>

      <View style={styles.body}>
        {tab === 'species'     ? <SpeciesList     items={content.species} /> : null}
        {tab === 'classes'     ? <ClassesList     items={content.classes} /> : null}
        {tab === 'backgrounds' ? <BackgroundsList items={content.backgrounds} /> : null}
        {tab === 'schema'      ? <SchemaPanel    sys={sys} /> : null}
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
  tabsBar: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    gap: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.outlineVariant + '88',
    marginBottom: spacing.md,
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
