import { useState, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, TextInput, StyleSheet, useWindowDimensions, Pressable,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fonts, radius, spacing, MarkdownText } from '@vaultstone/ui';
import type { Dnd5eStats, Dnd5eResources, Dnd5eAbilityScores, Dnd5ePreparedSpell } from '@vaultstone/types';

function abilityMod(score: number) { return Math.floor((score - 10) / 2); }

function shortAbility(name: string): string {
  const map: Record<string, string> = {
    strength: 'STR', dexterity: 'DEX', constitution: 'CON',
    intelligence: 'INT', wisdom: 'WIS', charisma: 'CHA',
  };
  return map[name.toLowerCase()] ?? name.slice(0, 3).toUpperCase();
}
function fmtMod(n: number) { return n >= 0 ? `+${n}` : `${n}`; }
function capitalize(str: string) { return str.charAt(0).toUpperCase() + str.slice(1); }

const DEFAULT_SLOTS: Dnd5eResources['spellSlots'] = {
  1: { max: 2, remaining: 2 }, 2: { max: 0, remaining: 0 }, 3: { max: 0, remaining: 0 },
  4: { max: 0, remaining: 0 }, 5: { max: 0, remaining: 0 }, 6: { max: 0, remaining: 0 },
  7: { max: 0, remaining: 0 }, 8: { max: 0, remaining: 0 }, 9: { max: 0, remaining: 0 },
};

const CHIP_LABELS = ['CANTRIP', '1ST', '2ND', '3RD', '4TH', '5TH', '6TH', '7TH', '8TH', '9TH'];
const LEVEL_LABELS = ['', '1ST LEVEL', '2ND LEVEL', '3RD LEVEL', '4TH LEVEL', '5TH LEVEL', '6TH LEVEL', '7TH LEVEL', '8TH LEVEL', '9TH LEVEL'];

type FilterKey = 'all' | 'conc' | number;

interface Props {
  stats: Dnd5eStats;
  resources: Dnd5eResources;
  scores: Dnd5eAbilityScores;
  prof: number;
  isOwner: boolean;
  onSpellSlotChange?: (level: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9, delta: -1 | 1) => void;
  onConcentrationClear?: () => void;
  /** Restore all expended spell slots — fired by the Long Rest button.
   *  Caller writes the next resources.spellSlots with each level's
   *  remaining bumped back to its max. */
  onLongRest?: () => void;
  /** Open the catalog spell picker (Manage Spells). Adds/removes
   *  spells from the character's spellbook. The parent owns the modal
   *  so it can pass the campaign + pack scope into ContentResolver. */
  onOpenManage?: () => void;
  /** Open the Prepare Spells modal — picks today's active subset from
   *  the spellbook. Hidden when the character has no leveled spells in
   *  their spellbook (e.g. cantrip-only or non-caster). */
  onOpenPrepare?: () => void;
  /** Whether the character has any leveled spells available to prepare —
   *  drives whether Prepare Spells button is shown at all. */
  canPrepare?: boolean;
  /** Per-class spellcasting explainer payload — drives the "How
   *  spellcasting works" panel. One entry per spellcasting class the
   *  character has a level in; empty for non-casters. The synthesized
   *  fields (ability, save DC, etc.) are derived from class data and
   *  always present; `description` is the class-shipped prose, which
   *  can be a thin pointer (5.1, imported homebrew) or a full ### body
   *  (SRD 5.2). */
  spellcastingExplainers?: Array<{
    className: string;
    /** Capitalized ability name (e.g. "Intelligence") or null when unknown. */
    spellcastingAbility: string | null;
    /** Cantrips known at this character's level for this class. */
    cantripsKnown?: number;
    /** Total leveled spells learnable / preparable at this level. */
    spellsKnownOrPrepared?: number;
    /** Short label for the cap above ("known" vs "prepared") + its formula
     *  ("Intelligence mod + Artificer level"). */
    preparedLabel?: string;
    preparedFormula?: string;
    /** Class-shipped prose. Optional — some entries (Artificer import)
     *  ship only a stub pointing at the PHB. */
    description?: string;
  }>;
}

export function SpellsTab({
  stats, resources, scores, prof, isOwner, onSpellSlotChange, onConcentrationClear,
  onLongRest, onOpenManage, onOpenPrepare, canPrepare, spellcastingExplainers,
}: Props) {
  const [explainerOpen, setExplainerOpen] = useState(false);
  const { width } = useWindowDimensions();
  const isWide = width >= 560;
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  // Single-open inline expansion on prepared spell rows. Tapping the
  // same row collapses; tapping a different row swaps the expansion.
  const [expandedSpellId, setExpandedSpellId] = useState<string | null>(null);

  const spellAbility = stats.spellcastingAbility;
  const isSpellcaster = !!spellAbility;
  const spellSlots = resources.spellSlots ?? (isSpellcaster ? DEFAULT_SLOTS : null);
  const preparedSpells = resources.preparedSpells ?? [];
  const concentration = resources.concentrationSpell ?? null;

  // `stats.spellcastingAbility` is stored capitalized ("Intelligence")
  // because that's how cls.spellcastingAbility ships from the SRD; the
  // scores object's keys are lowercased. Normalize before lookup, else
  // every caster reads as INT/WIS/CHA = 10 → mod +0.
  const spellMod = spellAbility
    ? abilityMod(scores[spellAbility.toLowerCase() as keyof Dnd5eAbilityScores] ?? 10)
    : null;
  const spellDC = spellMod !== null ? 8 + prof + spellMod : null;
  const spellAttack = spellMod !== null ? prof + spellMod : null;

  const availableLevels = useMemo(() => {
    const levels = new Set<number>();
    preparedSpells.forEach((s) => levels.add(s.level));
    if (spellSlots) {
      ([1, 2, 3, 4, 5, 6, 7, 8, 9] as const).forEach((l) => {
        if (spellSlots[l].max > 0) levels.add(l);
      });
    }
    return [...levels].sort((a, b) => a - b);
  }, [preparedSpells, spellSlots]);

  const filteredSpells = useMemo(() => {
    let spells = preparedSpells;
    if (search.trim()) {
      const q = search.toLowerCase();
      spells = spells.filter((s) =>
        s.name.toLowerCase().includes(q) ||
        s.notes?.toLowerCase().includes(q) ||
        s.school?.toLowerCase().includes(q) ||
        s.source?.toLowerCase().includes(q)
      );
    }
    if (filter === 'conc') return spells.filter((s) => s.concentration);
    if (filter !== 'all') return spells.filter((s) => s.level === filter);
    return spells;
  }, [preparedSpells, search, filter]);

  const cantrips = filteredSpells.filter((s) => s.level === 0);
  const leveledGroups = ([1, 2, 3, 4, 5, 6, 7, 8, 9] as const).map((lvl) => ({
    level: lvl,
    spells: filteredSpells.filter((s) => s.level === lvl),
    slot: spellSlots?.[lvl] ?? null,
  })).filter((g) => {
    if (filter !== 'all' && filter !== 'conc' && filter !== g.level) return false;
    return g.spells.length > 0 || (g.slot && g.slot.max > 0);
  });

  return (
    <ScrollView contentContainerStyle={s.container} showsVerticalScrollIndicator={false}>

      {/* ── Spellcasting stats header ── */}
      {spellAbility && (
        <View style={s.statsRow}>
          <View style={s.statBlock}>
            <Text style={s.statValue}>{spellMod !== null ? fmtMod(spellMod) : '—'}</Text>
            <Text style={s.statLabel}>
              {spellAbility ? `${shortAbility(spellAbility)} MODIFIER` : 'MODIFIER'}
            </Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.statBlock}>
            <Text style={s.statValue}>{spellAttack !== null ? fmtMod(spellAttack) : '—'}</Text>
            <Text style={s.statLabel}>SPELL ATTACK</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.statBlock}>
            <Text style={s.statValue}>{spellDC !== null ? String(spellDC) : '—'}</Text>
            <Text style={s.statLabel}>SAVE DC</Text>
          </View>
        </View>
      )}

      {/* ── How spellcasting works (collapsible per-class explainer) ── */}
      {spellcastingExplainers && spellcastingExplainers.length > 0 && (
        <View style={s.explainerCard}>
          <TouchableOpacity
            style={s.explainerHeader}
            onPress={() => setExplainerOpen((v) => !v)}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons name="book-open-variant" size={14} color={colors.primary} />
            <Text style={s.explainerTitle}>
              {spellcastingExplainers.length === 1
                ? `How ${spellcastingExplainers[0].className} spellcasting works`
                : 'How spellcasting works'}
            </Text>
            <MaterialCommunityIcons
              name={explainerOpen ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={colors.outline}
            />
          </TouchableOpacity>
          {explainerOpen && (
            <View style={s.explainerBody}>
              {spellcastingExplainers.map((ex, i) => (
                <View key={ex.className} style={i > 0 ? s.explainerSection : null}>
                  {spellcastingExplainers.length > 1 && (
                    <Text style={s.explainerClassLabel}>{ex.className.toUpperCase()}</Text>
                  )}
                  {/* Synthesized core stats — always shown so even classes
                      with thin/missing prose (5.1 SRD, imported homebrew
                      Artificer) surface the actual numbers a player needs
                      at the table. */}
                  <View style={s.synthGrid}>
                    {ex.spellcastingAbility && (
                      <SynthCell label="Ability" value={ex.spellcastingAbility} />
                    )}
                    {ex.spellcastingAbility && (
                      <SynthCell label="Save DC" value={`8 + prof + ${shortAbility(ex.spellcastingAbility)} mod`} />
                    )}
                    {ex.spellcastingAbility && (
                      <SynthCell label="Spell Attack" value={`prof + ${shortAbility(ex.spellcastingAbility)} mod`} />
                    )}
                    {ex.cantripsKnown !== undefined && (
                      <SynthCell label="Cantrips Known" value={String(ex.cantripsKnown)} />
                    )}
                    {ex.spellsKnownOrPrepared !== undefined && ex.preparedLabel && (
                      <SynthCell
                        label={ex.preparedLabel}
                        value={ex.preparedFormula
                          ? `${ex.spellsKnownOrPrepared} (${ex.preparedFormula})`
                          : String(ex.spellsKnownOrPrepared)}
                      />
                    )}
                  </View>
                  {ex.description ? (
                    <MarkdownText style={s.explainerText}>{ex.description}</MarkdownText>
                  ) : null}
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {/* ── Search + Manage ── */}
      <View style={s.searchRow}>
        <View style={s.searchBox}>
          <MaterialCommunityIcons name="magnify" size={15} color={colors.outline} />
          <TextInput
            style={s.searchInput}
            placeholder="Search Spell Names, Schools or Notes"
            placeholderTextColor={colors.outline}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')} activeOpacity={0.7}>
              <MaterialCommunityIcons name="close-circle" size={14} color={colors.outline} />
            </TouchableOpacity>
          )}
        </View>
        {isOwner && onLongRest && spellSlots
          && ([1, 2, 3, 4, 5, 6, 7, 8, 9] as const).some((l) => spellSlots[l].max > 0) && (
          <TouchableOpacity style={s.manageBtn} activeOpacity={0.7} onPress={onLongRest}>
            <MaterialCommunityIcons name="bed" size={12} color={colors.primary} style={{ marginRight: 4 }} />
            <Text style={s.manageBtnText}>LONG REST</Text>
          </TouchableOpacity>
        )}
        {isOwner && onOpenPrepare && canPrepare && (
          <TouchableOpacity style={s.manageBtn} activeOpacity={0.7} onPress={onOpenPrepare}>
            <Text style={s.manageBtnText}>PREPARE</Text>
          </TouchableOpacity>
        )}
        {isOwner && onOpenManage && (
          <TouchableOpacity style={s.manageBtn} activeOpacity={0.7} onPress={onOpenManage}>
            <Text style={s.manageBtnText}>MANAGE SPELLS</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Level filter chips ── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filtersRow}>
        <FilterChip label="ALL" active={filter === 'all'} onPress={() => setFilter('all')} />
        {availableLevels.map((lvl) => (
          <FilterChip
            key={lvl}
            label={CHIP_LABELS[lvl]}
            active={filter === lvl}
            onPress={() => setFilter(filter === lvl ? 'all' : lvl)}
          />
        ))}
        <TouchableOpacity
          style={[s.chip, filter === 'conc' && s.chipActive]}
          onPress={() => setFilter(filter === 'conc' ? 'all' : 'conc')}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons
            name="diamond-stone"
            size={11}
            color={filter === 'conc' ? colors.onPrimary : colors.outline}
            style={{ marginRight: 4 }}
          />
          <Text style={[s.chipText, filter === 'conc' && s.chipTextActive]}>CONC</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* ── Concentration banner ── */}
      {concentration && (
        <View style={s.concBanner}>
          <MaterialCommunityIcons name="focus-field" size={14} color={colors.primary} />
          <Text style={s.concName} numberOfLines={1}>{concentration}</Text>
          {isOwner && (
            <TouchableOpacity onPress={onConcentrationClear} style={s.concEnd} activeOpacity={0.7}>
              <Text style={s.concEndText}>End</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* ── Cantrips ── */}
      {cantrips.length > 0 && (
        <View style={s.section}>
          <View style={s.sectionHead}>
            <Text style={s.sectionHeadLabel}>CANTRIP</Text>
          </View>
          <ColHeaders isWide={isWide} />
          {cantrips.map((spell, i) => (
            <SpellRow
              key={spell.id}
              spell={spell}
              isLast={i === cantrips.length - 1}
              isWide={isWide}
              isOwner={isOwner}
              expanded={expandedSpellId === spell.id}
              onToggleExpanded={() => setExpandedSpellId(
                expandedSpellId === spell.id ? null : spell.id,
              )}
            />
          ))}
        </View>
      )}

      {/* ── Leveled spell groups ── */}
      {leveledGroups.map(({ level, spells, slot }) => (
        <View key={level} style={s.section}>
          <View style={s.sectionHead}>
            <Text style={s.sectionHeadLabel}>{LEVEL_LABELS[level]}</Text>
            {slot && slot.max > 0 && (
              <View style={s.slotRow}>
                {Array.from({ length: slot.max }).map((_, i) => (
                  <TouchableOpacity
                    key={i}
                    onPress={() => {
                      if (!isOwner || !onSpellSlotChange) return;
                      onSpellSlotChange(level, i < slot.remaining ? -1 : 1);
                    }}
                    activeOpacity={isOwner ? 0.7 : 1}
                  >
                    <View style={[s.slotBox, i < slot.remaining && s.slotBoxFull]} />
                  </TouchableOpacity>
                ))}
                <Text style={s.slotsLabel}>SLOTS</Text>
              </View>
            )}
          </View>
          {spells.length > 0 && <ColHeaders isWide={isWide} />}
          {spells.map((spell, i) => (
            <SpellRow
              key={spell.id}
              spell={spell}
              isLast={i === spells.length - 1}
              slot={slot}
              isOwner={isOwner}
              isWide={isWide}
              expanded={expandedSpellId === spell.id}
              onToggleExpanded={() => setExpandedSpellId(
                expandedSpellId === spell.id ? null : spell.id,
              )}
            />
          ))}
          {spells.length === 0 && slot && slot.max > 0 && (
            <Text style={s.emptyLevel}>No spells prepared at this level</Text>
          )}
        </View>
      ))}

      {/* ── Empty states ── */}
      {preparedSpells.length === 0 && !spellAbility && (
        <View style={s.emptyState}>
          <MaterialCommunityIcons name="auto-fix" size={32} color={colors.outlineVariant} />
          <Text style={s.emptyTitle}>No Spells</Text>
          <Text style={s.emptyBody}>
            This character has no spellcasting ability. Spells can be added once a spellcasting class is selected.
          </Text>
        </View>
      )}
      {preparedSpells.length === 0 && spellAbility && (
        <View style={s.emptyState}>
          <MaterialCommunityIcons name="book-open-outline" size={32} color={colors.outlineVariant} />
          <Text style={s.emptyTitle}>No Spells Prepared</Text>
          <Text style={s.emptyBody}>
            {isOwner && onOpenManage
              ? 'Tap “Manage Spells” above to add spells from the catalog.'
              : 'Slots and concentration are tracked above.'}
          </Text>
        </View>
      )}

      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[s.chip, active && s.chipActive]} onPress={onPress} activeOpacity={0.7}>
      <Text style={[s.chipText, active && s.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function ColHeaders({ isWide }: { isWide: boolean }) {
  return (
    <View style={s.colHead}>
      <View style={s.colBadge} />
      <Text style={[s.colLabel, s.colName]}>NAME</Text>
      <Text style={[s.colLabel, s.colTime]}>TIME</Text>
      <Text style={[s.colLabel, s.colRange]}>RANGE</Text>
      {isWide && <Text style={[s.colLabel, s.colHit]}>HIT / DC</Text>}
      {isWide && <Text style={[s.colLabel, s.colEffect]}>EFFECT</Text>}
      <Text style={[s.colLabel, s.colNotes]}>NOTES</Text>
    </View>
  );
}

function SpellRow({
  spell, isLast, slot, isWide, expanded, onToggleExpanded,
}: {
  spell: Dnd5ePreparedSpell;
  isLast: boolean;
  slot?: { max: number; remaining: number } | null;
  /** Reserved for future per-row actions; currently unused since removal
   *  lives in the Manage Spells modal instead of inline. */
  isOwner?: boolean;
  isWide?: boolean;
  expanded?: boolean;
  onToggleExpanded?: () => void;
}) {
  const isCantrip = spell.level === 0;
  const hasSlots = slot ? slot.remaining > 0 : false;

  return (
    <View style={[!isLast && s.spellRowBorder, expanded && s.spellRowExpandedWrap]}>
      <Pressable
        style={s.spellRow}
        onPress={onToggleExpanded}
      >

        {/* Badge: AT WILL or USE */}
        <View style={s.colBadge}>
          {isCantrip ? (
            <View style={s.badgeAtWill}>
              <Text style={s.badgeAtWillText}>AT{'\n'}WILL</Text>
            </View>
          ) : (
            <View style={[s.badgeUse, !hasSlots && s.badgeUsed]}>
              <Text style={[s.badgeUseText, !hasSlots && s.badgeUsedText]}>USE</Text>
            </View>
          )}
        </View>

        {/* Spell name + optional school chip */}
        <View style={s.colName}>
          <View style={s.nameInner}>
            <Text style={s.spellName} numberOfLines={1}>{spell.name}</Text>
            {spell.ritual && (
              <MaterialCommunityIcons name="rotate-right" size={10} color={colors.outline} />
            )}
            {spell.concentration && (
              <MaterialCommunityIcons name="diamond-stone" size={10} color={colors.outline} />
            )}
          </View>
        </View>

        {/* Stat columns */}
        <Text style={[s.cellText, s.colTime]} numberOfLines={1}>{spell.castingTime ?? '1A'}</Text>
        <Text style={[s.cellText, s.colRange]} numberOfLines={1}>{spell.range ?? '—'}</Text>
        {isWide && <Text style={[s.cellText, s.colHit]} numberOfLines={1}>{spell.hitDc ?? '—'}</Text>}
        {isWide && spell.school ? (
          <View style={s.colEffect}>
            <View style={s.schoolChip}>
              <Text style={s.schoolChipText} numberOfLines={1}>{capitalize(spell.school)}</Text>
            </View>
          </View>
        ) : isWide ? (
          <Text style={[s.cellText, s.colEffect]} numberOfLines={1}>—</Text>
        ) : null}
        <Text style={[s.cellText, s.colNotes]} numberOfLines={2}>{spell.notes ?? '—'}</Text>

        <MaterialCommunityIcons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={colors.outline}
          style={{ marginLeft: 6 }}
        />
      </Pressable>

      {expanded ? (
        <View style={s.spellRowExpansion}>
          <View style={s.spellMetaGrid}>
            {spell.castingTime ? <SpellMeta label="Casting Time" value={spell.castingTime} /> : null}
            {spell.range ? <SpellMeta label="Range" value={spell.range} /> : null}
            {spell.components && spell.components.length > 0 ? (
              <SpellMeta label="Components" value={spell.components.join(', ')} />
            ) : null}
            {spell.duration ? <SpellMeta label="Duration" value={spell.duration} /> : null}
            {spell.school ? <SpellMeta label="School" value={capitalize(spell.school)} /> : null}
            {spell.source ? <SpellMeta label="Source" value={spell.source} /> : null}
          </View>
          {spell.description ? (
            <Text style={s.spellDescription}>{spell.description}</Text>
          ) : (
            <Text style={s.spellDescriptionMissing}>
              No description on file — re-add this spell through Manage Spells to fetch the latest text.
            </Text>
          )}
        </View>
      ) : null}
    </View>
  );
}

function SpellMeta({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.spellMetaCell}>
      <Text style={s.spellMetaLabel}>{label}</Text>
      <Text style={s.spellMetaValue}>{value}</Text>
    </View>
  );
}

function SynthCell({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.synthCell}>
      <Text style={s.synthLabel}>{label}</Text>
      <Text style={s.synthValue}>{value}</Text>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { paddingBottom: 16 },

  // Spellcasting stats header
  statsRow: {
    flexDirection: 'row',
    paddingVertical: 18, paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.outlineVariant,
  },
  statBlock: { flex: 1, alignItems: 'center', gap: 4 },
  statValue: { fontSize: 26, fontFamily: fonts.headline, fontWeight: '800', color: colors.onSurface },
  statLabel: { fontSize: 9, fontFamily: fonts.label, fontWeight: '700', letterSpacing: 1.5, color: colors.outline },
  statDivider: { width: StyleSheet.hairlineWidth, height: 30, backgroundColor: colors.outlineVariant, alignSelf: 'center' },

  // How-spellcasting-works collapsible card. The default is collapsed
  // because the prose is long; players who want the rules tap to open
  // and the panel surfaces the canonical class-feature description with
  // its ### subsections rendered through MarkdownText.
  explainerCard: {
    marginHorizontal: 12, marginTop: 10,
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1, borderColor: colors.outlineVariant,
    borderRadius: radius.lg, overflow: 'hidden',
  },
  explainerHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 9,
  },
  explainerTitle: {
    flex: 1, fontSize: 12, fontFamily: fonts.label, fontWeight: '700',
    letterSpacing: 0.6, color: colors.onSurface,
  },
  explainerBody: {
    paddingHorizontal: 14, paddingTop: 4, paddingBottom: 14,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.outlineVariant,
  },
  explainerSection: { marginTop: 14, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.outlineVariant },
  explainerClassLabel: {
    fontSize: 10, fontFamily: fonts.label, fontWeight: '700',
    letterSpacing: 1.5, color: colors.primary, marginBottom: 6,
  },
  explainerText: {
    fontSize: 12, fontFamily: fonts.body, color: colors.onSurfaceVariant, lineHeight: 19,
  },

  // Synthesized core-stats grid above the prose. Two-column wrapping
  // chips so the per-class essentials (ability, save DC, attack mod,
  // cantrips known, prepared count) surface even when the source class
  // ships only a thin "see the PHB" stub.
  synthGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
    marginBottom: 12,
  },
  synthCell: {
    minWidth: 140,
    paddingVertical: 6, paddingHorizontal: 10,
    backgroundColor: colors.surfaceContainerHigh,
    borderWidth: 1, borderColor: colors.outlineVariant,
    borderRadius: radius.lg,
  },
  synthLabel: {
    fontSize: 8, fontFamily: fonts.label, fontWeight: '700',
    letterSpacing: 1.2, color: colors.outline, textTransform: 'uppercase',
    marginBottom: 2,
  },
  synthValue: {
    fontSize: 12, fontFamily: fonts.body, color: colors.onSurface, fontWeight: '600',
  },

  // Search row
  searchRow: { flexDirection: 'row', gap: 8, padding: 12 },
  searchBox: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1, borderColor: colors.outlineVariant,
    borderRadius: radius.lg, paddingHorizontal: 10, paddingVertical: 7,
  },
  searchInput: { flex: 1, fontSize: 12, fontFamily: fonts.body, color: colors.onSurface },
  manageBtn: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 7,
    borderWidth: 1.5, borderColor: colors.primary,
    borderRadius: radius.lg, justifyContent: 'center',
  },
  manageBtnText: { fontSize: 10, fontFamily: fonts.label, fontWeight: '700', letterSpacing: 1, color: colors.primary },

  // Filter chips
  filtersRow: { flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingBottom: 10 },
  chip: {
    flexDirection: 'row',
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: colors.outlineVariant,
    borderRadius: 100, alignItems: 'center', justifyContent: 'center', minWidth: 36,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 11, fontFamily: fonts.label, fontWeight: '700', color: colors.outline },
  chipTextActive: { color: colors.onPrimary },

  // Concentration banner
  concBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 12, marginBottom: 8,
    paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: `${colors.primary}14`,
    borderWidth: 1, borderColor: `${colors.primary}44`,
    borderRadius: radius.lg,
  },
  concName: { flex: 1, fontSize: 13, fontFamily: fonts.headline, fontWeight: '600', color: colors.onSurface },
  concEnd: {
    paddingHorizontal: 8, paddingVertical: 3,
    backgroundColor: colors.surfaceContainerHighest,
    borderWidth: 1, borderColor: colors.outlineVariant,
    borderRadius: radius.lg,
  },
  concEndText: { fontSize: 10, fontFamily: fonts.label, fontWeight: '700', color: colors.outline },

  // Spell sections
  section: { marginTop: 6 },
  sectionHead: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.outlineVariant,
  },
  sectionHeadLabel: {
    fontSize: 12, fontFamily: fonts.label, fontWeight: '800', letterSpacing: 1.5, color: colors.primary,
  },
  slotRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  slotBox: {
    width: 16, height: 16, borderRadius: 2,
    borderWidth: 1.5, borderColor: colors.outlineVariant,
  },
  slotBoxFull: { backgroundColor: colors.primary, borderColor: colors.primary },
  slotsLabel: {
    fontSize: 9, fontFamily: fonts.label, fontWeight: '700',
    letterSpacing: 1.5, color: colors.outline, marginLeft: 2,
  },

  // Column headers
  colHead: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 5,
    backgroundColor: colors.surfaceContainerLowest,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.outlineVariant,
  },
  colLabel: {
    fontSize: 8, fontFamily: fonts.label, fontWeight: '700',
    letterSpacing: 1.2, color: colors.outline,
  },

  // Column layout (shared between header + spell rows)
  colBadge: { width: 50 },
  colName: { flex: 1.5, minWidth: 80 },
  colTime: { width: 38 },
  colRange: { width: 68, paddingLeft: 4 },
  colHit: { width: 56, paddingLeft: 4 },
  colEffect: { width: 76, paddingLeft: 4 },
  colNotes: { flex: 1, minWidth: 60, paddingLeft: 4 },

  // Spell rows
  spellRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 9,
  },
  spellRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.outlineVariant },
  // When a row is expanded, the wrapper carries a darker canvas so the
  // expansion + row read as one card (matches the Manage Spells modal).
  spellRowExpandedWrap: {
    backgroundColor: colors.surfaceContainerLowest,
    borderBottomColor: 'transparent',
  },
  spellRowExpansion: {
    paddingHorizontal: 18, paddingTop: 4, paddingBottom: 14,
  },
  spellMetaGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10,
  },
  spellMetaCell: {
    minWidth: 120, paddingVertical: 4, paddingRight: 6,
  },
  spellMetaLabel: {
    fontSize: 8, fontFamily: fonts.label, fontWeight: '700',
    letterSpacing: 1.2, color: colors.outline, textTransform: 'uppercase',
    marginBottom: 2,
  },
  spellMetaValue: {
    fontSize: 12, fontFamily: fonts.body, color: colors.onSurface, fontWeight: '500',
  },
  spellDescription: {
    fontSize: 12, fontFamily: fonts.body, color: colors.onSurfaceVariant,
    lineHeight: 18,
  },
  spellDescriptionMissing: {
    fontSize: 11, fontFamily: fonts.body, color: colors.outline,
    fontStyle: 'italic', lineHeight: 16,
  },
  // School chip — replaces the plain "Conjuration" text in the EFFECT
  // column. Visual hierarchy lift only; the data is unchanged.
  schoolChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8, paddingVertical: 2,
    backgroundColor: colors.surfaceContainerHigh,
    borderWidth: 1, borderColor: colors.outlineVariant,
    borderRadius: 4,
  },
  schoolChipText: {
    fontSize: 9, fontFamily: fonts.label, fontWeight: '700',
    letterSpacing: 0.6, color: colors.onSurfaceVariant, textTransform: 'uppercase',
  },
  removeBtn: { paddingHorizontal: 4, paddingVertical: 4, marginLeft: 4 },

  // AT WILL badge (cantrips)
  badgeAtWill: {
    width: 36, alignItems: 'center',
    paddingVertical: 3,
    borderWidth: 1, borderColor: colors.outlineVariant, borderRadius: 3,
  },
  badgeAtWillText: {
    fontSize: 7, fontFamily: fonts.label, fontWeight: '800',
    letterSpacing: 0.3, textAlign: 'center', lineHeight: 9, color: colors.outline,
  },

  // USE badge (leveled spells)
  badgeUse: {
    width: 36, alignItems: 'center',
    paddingVertical: 5,
    backgroundColor: colors.primary, borderRadius: 3,
  },
  badgeUsed: { backgroundColor: colors.surfaceContainerHighest, opacity: 0.55 },
  badgeUseText: {
    fontSize: 9, fontFamily: fonts.label, fontWeight: '800',
    letterSpacing: 0.5, color: colors.onPrimary,
  },
  badgeUsedText: { color: colors.outline },

  // Spell name cell
  nameInner: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  spellName: {
    fontSize: 13, fontFamily: fonts.headline, fontWeight: '600',
    color: colors.onSurface, fontStyle: 'italic', flexShrink: 1,
  },
  spellSource: {
    fontSize: 9, fontFamily: fonts.label, fontWeight: '500',
    color: colors.outline, marginTop: 1,
  },
  cellText: { fontSize: 12, fontFamily: fonts.body, color: colors.onSurfaceVariant },

  // Empty
  emptyLevel: {
    fontSize: 11, fontFamily: fonts.label, fontStyle: 'italic',
    color: colors.outline, paddingHorizontal: 12, paddingVertical: 10,
  },
  emptyState: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 20, gap: 10 },
  emptyTitle: { fontSize: 15, fontFamily: fonts.headline, fontWeight: '700', color: colors.onSurfaceVariant },
  emptyBody: { fontSize: 13, fontFamily: fonts.body, color: colors.outline, textAlign: 'center', lineHeight: 19 },
});
