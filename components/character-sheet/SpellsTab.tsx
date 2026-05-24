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
type StatusFilter = 'all' | 'prepared' | 'unprepared';

interface Props {
  stats: Dnd5eStats;
  resources: Dnd5eResources;
  scores: Dnd5eAbilityScores;
  prof: number;
  isOwner: boolean;
  /** Manual mode reveals limit-edit affordances + applies any
   *  cantripsKnown/preparedSpells overrides on the stats record. */
  manualMode?: boolean;
  onEditField?: (field: string, currentValue: string | number) => void;
  effectiveSpellcastingAbility?: string | null;
  onSpellSlotChange?: (level: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9, delta: -1 | 1) => void;
  onConcentrationClear?: () => void;
  /** Open the catalog spell picker (Manage Spells). Adds/removes
   *  spells from the character's spellbook. The parent owns the modal
   *  so it can pass the campaign + pack scope into ContentResolver. */
  onOpenManage?: () => void;
  /** The character's full spellbook (every spell they've learned —
   *  superset of preparedSpells). The Spells tab renders the whole
   *  list with prepared/unprepared visual states; toggling a card
   *  flips its status. Cantrips always render as prepared since 5e
   *  cantrips are always cast-ready. */
  spellbook?: Dnd5ePreparedSpell[];
  /** Toggle a spell's prepared state (leveled only — cantrips are
   *  auto-prepared by being in the spellbook). Caller writes
   *  resources.preparedSpells with the new entry added or removed. */
  onTogglePrepared?: (spell: Dnd5ePreparedSpell) => void;
  /** Toggle a spell's always-prepared flag. Always-prepared spells
   *  count as prepared regardless of the regular toggle and don't
   *  consume the daily prepare cap — used for domain/oath spells and
   *  any other source-granted "free" prep. Caller adds the spell to
   *  resources.preparedSpells with alwaysPrepared=true (or strips the
   *  flag when toggled off). */
  onToggleAlwaysPrepared?: (spell: Dnd5ePreparedSpell) => void;
  /** Update a spell's player notes (kept separate from the canonical
   *  description). Caller persists the merged spell into preparedSpells
   *  / spellbook. */
  onSaveSpellNotes?: (spell: Dnd5ePreparedSpell, notes: string) => void;
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
  stats, resources, scores, prof, isOwner, manualMode, onEditField,
  effectiveSpellcastingAbility, onSpellSlotChange, onConcentrationClear,
  onOpenManage, spellbook, onTogglePrepared, onToggleAlwaysPrepared, onSaveSpellNotes, spellcastingExplainers,
}: Props) {
  const [explainerOpen, setExplainerOpen] = useState(false);
  const { width } = useWindowDimensions();
  const isWide = width >= 560;
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const spellAbility = effectiveSpellcastingAbility ?? stats.spellcastingAbility;
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
  const computedSpellDC = spellMod !== null ? 8 + prof + spellMod : null;
  const computedSpellAttack = spellMod !== null ? prof + spellMod : null;
  // Manual-mode overrides — same pattern as AC / Initiative / spell
  // limits. Apply only while Manual Mode is on so flipping it off
  // reverts to the ability-mod calc cleanly.
  const spellDC = manualMode && stats.spellSaveDcOverride != null
    ? stats.spellSaveDcOverride
    : computedSpellDC;
  const spellAttack = manualMode && stats.spellAttackOverride != null
    ? stats.spellAttackOverride
    : computedSpellAttack;

  const availableLevels = useMemo(() => {
    const levels = new Set<number>();
    preparedSpells.forEach((sp) => levels.add(sp.level));
    (spellbook ?? []).forEach((sp) => levels.add(sp.level));
    if (spellSlots) {
      ([1, 2, 3, 4, 5, 6, 7, 8, 9] as const).forEach((l) => {
        if (spellSlots[l].max > 0) levels.add(l);
      });
    }
    return [...levels].sort((a, b) => a - b);
  }, [preparedSpells, spellbook, spellSlots]);

  // Source list: prefer the full spellbook so unprepared spells render
  // too. Falls back to preparedSpells when no spellbook was passed
  // (keeps the component working for legacy callers / tests).
  const sourceList = spellbook && spellbook.length > 0 ? spellbook : preparedSpells;

  // Set of currently prepared spell ids for the status check on each row.
  const preparedKeys = useMemo(
    () => new Set(preparedSpells.map((sp) => sp.id)),
    [preparedSpells],
  );
  // Index the prepared entries by id so the row can read per-spell
  // flags (alwaysPrepared) without re-finding through the array each
  // render.
  const preparedById = useMemo(
    () => new Map(preparedSpells.map((sp) => [sp.id, sp])),
    [preparedSpells],
  );

  // isPrepared — cantrips are always cast-ready, leveled spells need
  // an explicit entry in preparedSpells.
  const isPrepared = (sp: Dnd5ePreparedSpell) =>
    sp.level === 0 || preparedKeys.has(sp.id);
  const isAlwaysPrepared = (sp: Dnd5ePreparedSpell) =>
    preparedById.get(sp.id)?.alwaysPrepared === true;

  const filteredSpells = useMemo(() => {
    let spells = sourceList;
    if (search.trim()) {
      const q = search.toLowerCase();
      spells = spells.filter((sp) =>
        sp.name.toLowerCase().includes(q) ||
        sp.notes?.toLowerCase().includes(q) ||
        sp.school?.toLowerCase().includes(q) ||
        sp.source?.toLowerCase().includes(q)
      );
    }
    if (filter === 'conc') spells = spells.filter((sp) => sp.concentration);
    else if (filter !== 'all') spells = spells.filter((sp) => sp.level === filter);
    if (statusFilter === 'prepared') spells = spells.filter(isPrepared);
    else if (statusFilter === 'unprepared') spells = spells.filter((sp) => !isPrepared(sp));
    return spells;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceList, search, filter, statusFilter, preparedKeys]);

  const byName = (a: Dnd5ePreparedSpell, b: Dnd5ePreparedSpell) => a.name.localeCompare(b.name);
  const cantrips = filteredSpells.filter((sp) => sp.level === 0).sort(byName);
  const leveledGroups = ([1, 2, 3, 4, 5, 6, 7, 8, 9] as const).map((lvl) => ({
    level: lvl,
    spells: filteredSpells.filter((sp) => sp.level === lvl).sort(byName),
    slot: spellSlots?.[lvl] ?? null,
  })).filter((g) => {
    if (filter !== 'all' && filter !== 'conc' && filter !== g.level) return false;
    return g.spells.length > 0 || (g.slot && g.slot.max > 0);
  });

  // Counts for the stats-row cells (CANTRIPS + PREPARED). Sum the limits
  // across explainer entries so multiclass shows the total (e.g.
  // Wizard 3 / Cleric 2 cantrip caps add). undefined limit → no
  // denominator, just the count.
  const totalCantripsKnown = preparedSpells.filter((s) => s.level === 0).length;
  // Always-prepared spells (domain/oath/granted) don't count toward
  // the daily prepare cap — that's the whole reason 5e ships them as
  // a separate concept.
  const totalLeveledPrepared = preparedSpells.filter((s) => s.level > 0 && !s.alwaysPrepared).length;
  const computedCantripLimit = (spellcastingExplainers ?? []).reduce<number | undefined>(
    (acc, ex) => ex.cantripsKnown !== undefined ? (acc ?? 0) + ex.cantripsKnown : acc,
    undefined,
  );
  const computedPreparedLimit = (spellcastingExplainers ?? []).reduce<number | undefined>(
    (acc, ex) => ex.spellsKnownOrPrepared !== undefined ? (acc ?? 0) + ex.spellsKnownOrPrepared : acc,
    undefined,
  );
  // Manual-mode override pattern, same shape as the AC fix: stored
  // override applies only while Manual Mode is on. Off → fall back to
  // computed. Off-mode characters can't silently inherit a stale
  // override from an earlier Manual Mode session.
  const cantripLimit = manualMode && stats.cantripsKnownOverride != null
    ? stats.cantripsKnownOverride
    : computedCantripLimit;
  const preparedLimit = manualMode && stats.preparedSpellsOverride != null
    ? stats.preparedSpellsOverride
    : computedPreparedLimit;

  return (
    <ScrollView contentContainerStyle={s.container} showsVerticalScrollIndicator={false}>

      {/* ── Spellcasting stats header ── */}
      {spellAbility && (
        <View style={s.statsRow}>
          <TouchableOpacity
            style={s.statBlock}
            disabled={!manualMode || !onEditField}
            onPress={manualMode && onEditField
              ? () => onEditField('spellAttack', spellAttack ?? 0)
              : undefined}
            activeOpacity={manualMode && onEditField ? 0.7 : 1}
          >
            <Text style={s.statValue}>{spellAttack !== null ? fmtMod(spellAttack) : '—'}</Text>
            <Text style={s.statLabel}>SPELL ATTACK</Text>
          </TouchableOpacity>
          <View style={s.statDivider} />
          <TouchableOpacity
            style={s.statBlock}
            disabled={!manualMode || !onEditField}
            onPress={manualMode && onEditField
              ? () => onEditField('spellSaveDc', spellDC ?? 0)
              : undefined}
            activeOpacity={manualMode && onEditField ? 0.7 : 1}
          >
            <Text style={s.statValue}>{spellDC !== null ? String(spellDC) : '—'}</Text>
            <Text style={s.statLabel}>SAVE DC</Text>
          </TouchableOpacity>
          <View style={s.statDivider} />
          <TouchableOpacity
            style={s.statBlock}
            disabled={!manualMode || !onEditField}
            onPress={manualMode && onEditField
              ? () => onEditField('cantripsLimit', cantripLimit ?? totalCantripsKnown)
              : undefined}
            activeOpacity={manualMode && onEditField ? 0.7 : 1}
          >
            <Text style={[
              s.statValue,
              cantripLimit !== undefined && totalCantripsKnown >= cantripLimit && s.statValueAtLimit,
            ]}>
              {cantripLimit !== undefined
                ? `${totalCantripsKnown}/${cantripLimit}`
                : String(totalCantripsKnown)}
            </Text>
            <Text style={s.statLabel}>CANTRIPS</Text>
          </TouchableOpacity>
          <View style={s.statDivider} />
          <TouchableOpacity
            style={s.statBlock}
            disabled={!manualMode || !onEditField}
            onPress={manualMode && onEditField
              ? () => onEditField('preparedLimit', preparedLimit ?? totalLeveledPrepared)
              : undefined}
            activeOpacity={manualMode && onEditField ? 0.7 : 1}
          >
            <Text style={[
              s.statValue,
              preparedLimit !== undefined && totalLeveledPrepared >= preparedLimit && s.statValueAtLimit,
            ]}>
              {preparedLimit !== undefined
                ? `${totalLeveledPrepared}/${preparedLimit}`
                : String(totalLeveledPrepared)}
            </Text>
            <Text style={s.statLabel}>PREPARED</Text>
          </TouchableOpacity>
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

        {/* Vertical divider so the prep-status filters read as a
            distinct group from the level / conc filters. */}
        <View style={s.chipDivider} />
        <FilterChip
          label="PREPARED"
          active={statusFilter === 'prepared'}
          onPress={() => setStatusFilter(statusFilter === 'prepared' ? 'all' : 'prepared')}
        />
        <FilterChip
          label="UNPREPARED"
          active={statusFilter === 'unprepared'}
          onPress={() => setStatusFilter(statusFilter === 'unprepared' ? 'all' : 'unprepared')}
        />
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
        <View style={s.levelSection}>
          <View style={s.levelHead}>
            <Text style={s.levelTitle}>Cantrips</Text>
            {cantripLimit !== undefined ? (
              <View style={[s.slotSummary, manualMode && s.slotSummaryEditable]}>
                {manualMode && onEditField ? (
                  <TouchableOpacity
                    onPress={() => onEditField('cantripsLimit', cantripLimit)}
                    activeOpacity={0.7}
                  >
                    <Text style={s.levelSub}>{`${totalCantripsKnown} of ${cantripLimit} cantrips`}</Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={s.levelSub}>{`${totalCantripsKnown} of ${cantripLimit} cantrips`}</Text>
                )}
              </View>
            ) : (
              <Text style={s.levelSub}>At will</Text>
            )}
          </View>
          {cantrips.map((spell) => (
            <SpellRow
              key={spell.id}
              spell={spell}
              prepared={true}
              alwaysPrepared={false}
              canToggle={false}
              onSaveNotes={isOwner && onSaveSpellNotes ? (notes) => onSaveSpellNotes(spell, notes) : undefined}
            />
          ))}
        </View>
      )}

      {/* ── Leveled spell groups ── */}
      {leveledGroups.map(({ level, spells, slot }) => (
        <View key={level} style={s.levelSection}>
          <View style={s.levelHead}>
            <Text style={s.levelTitle}>{`${ordinal(level)} Level`}</Text>
            {slot && slot.max > 0 && (
              <View style={[s.slotSummary, manualMode && s.slotSummaryEditable]}>
                {manualMode && onEditField ? (
                  <TouchableOpacity
                    onPress={() => onEditField(`slotMax_${level}`, slot.max)}
                    activeOpacity={0.7}
                  >
                    <Text style={s.levelSub}>{`${slot.remaining} of ${slot.max} slots`}</Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={s.levelSub}>{`${slot.remaining} of ${slot.max} slots`}</Text>
                )}
                <View style={s.slotPipsRowInline}>
                  {Array.from({ length: slot.max }).map((_, i) => (
                    <TouchableOpacity
                      key={i}
                      onPress={() => {
                        if (!isOwner || !onSpellSlotChange) return;
                        onSpellSlotChange(level, i < slot.remaining ? -1 : 1);
                      }}
                      activeOpacity={isOwner ? 0.7 : 1}
                    >
                      <View style={[s.pip, i < slot.remaining && s.pipFilled]} />
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
          </View>
          {spells.map((spell) => {
            const prep = isPrepared(spell);
            const always = isAlwaysPrepared(spell);
            const atLimit = preparedLimit !== undefined && totalLeveledPrepared >= preparedLimit;
            return (
              <SpellRow
                key={spell.id}
                spell={spell}
                slot={slot}
                prepared={prep}
                alwaysPrepared={always}
                canToggle={isOwner && !!onTogglePrepared}
                onTogglePrepared={onTogglePrepared ? () => onTogglePrepared(spell) : undefined}
                onToggleAlwaysPrepared={isOwner && onToggleAlwaysPrepared ? () => onToggleAlwaysPrepared(spell) : undefined}
                togglesBlocked={!prep && atLimit}
                onCast={isOwner && onSpellSlotChange ? () => onSpellSlotChange(level, -1) : undefined}
                onSaveNotes={isOwner && onSaveSpellNotes ? (notes) => onSaveSpellNotes(spell, notes) : undefined}
              />
            );
          })}
          {spells.length === 0 && slot && slot.max > 0 && (
            <Text style={s.emptyLevel}>
              {sourceList.length === 0
                ? 'No spells of this level in your spellbook yet.'
                : 'No spells of this level match your filters.'}
            </Text>
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

// 1 → "1st", 2 → "2nd", etc. — used in the level section header.
function ordinal(n: number): string {
  const suffixes = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (suffixes[(v - 20) % 10] ?? suffixes[v] ?? suffixes[0]);
}

function SpellRow({
  spell, slot, prepared, alwaysPrepared, canToggle, onTogglePrepared, onToggleAlwaysPrepared, togglesBlocked, onCast, onSaveNotes,
}: {
  spell: Dnd5ePreparedSpell;
  slot?: { max: number; remaining: number } | null;
  prepared: boolean;
  alwaysPrepared: boolean;
  canToggle: boolean;
  onTogglePrepared?: () => void;
  onToggleAlwaysPrepared?: () => void;
  togglesBlocked?: boolean;
  onCast?: () => void;
  onSaveNotes?: (notes: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  // Local draft so the user can edit notes without persisting every
  // keystroke — commits on blur or when the row collapses.
  const [notesDraft, setNotesDraft] = useState<string | null>(null);
  const notesActive = notesDraft !== null;
  const notesValue = notesActive ? notesDraft! : (spell.notes ?? '');
  const isCantrip = spell.level === 0;
  const canCast = prepared && (isCantrip || (slot?.remaining ?? 0) > 0);
  // Cap-blocked applies only to the "newly prepare" direction. Once
  // prepared (or always-prepared), the player can always unprepare.
  // Always-prepared spells skip the regular toggle entirely; they
  // only flip via the "Always prepared" affordance in the expanded
  // view so a stray tap doesn't blow away a domain-spell setup.
  const toggleDisabled = !canToggle || alwaysPrepared || (togglesBlocked && !prepared);
  const circleIconName = alwaysPrepared ? 'pin'
    : isCantrip ? 'infinity'
    : 'check';

  return (
    <View style={[s.spellCard, !prepared && s.spellCardDimmed]}>
      <TouchableOpacity
        style={s.spellHead}
        onPress={() => setExpanded((v) => !v)}
        onLongPress={canToggle && !toggleDisabled ? onTogglePrepared : undefined}
        delayLongPress={300}
        activeOpacity={0.7}
      >
        <TouchableOpacity
          onPress={!toggleDisabled && onTogglePrepared
            ? (e) => { e.stopPropagation?.(); onTogglePrepared(); }
            : undefined}
          activeOpacity={!toggleDisabled ? 0.6 : 1}
          hitSlop={6}
          style={[
            s.statusCircle,
            prepared && s.statusCircleOn,
            isCantrip && s.statusCircleCantrip,
            alwaysPrepared && s.statusCircleAlways,
          ]}
        >
          {prepared ? (
            <MaterialCommunityIcons
              name={circleIconName}
              size={12}
              color={colors.onPrimary}
            />
          ) : null}
        </TouchableOpacity>
        <Text style={s.spellName} numberOfLines={1}>{spell.name}</Text>
        {spell.school ? (
          <View style={s.schoolChip}>
            <Text style={s.schoolChipText} numberOfLines={1}>{capitalize(spell.school)}</Text>
          </View>
        ) : null}
        {spell.ritual ? (
          <View style={s.badgeIcon}>
            <Text style={s.badgeIconText}>R</Text>
          </View>
        ) : null}
        {spell.concentration ? (
          <View style={[s.badgeIcon, s.badgeIconConc]}>
            <Text style={[s.badgeIconText, s.badgeIconTextConc]}>C</Text>
          </View>
        ) : null}
        <TouchableOpacity
          style={[s.castBtn, !canCast && s.castBtnDisabled, isCantrip && s.castBtnAtWill]}
          onPress={canCast && !isCantrip && onCast ? (e) => { e.stopPropagation(); onCast(); } : undefined}
          activeOpacity={canCast && !isCantrip ? 0.7 : 1}
        >
          <Text style={[s.castBtnText, !canCast && s.castBtnTextDisabled, isCantrip && s.castBtnTextAtWill]}>
            {isCantrip ? 'At Will' : prepared ? 'Cast' : 'Unprepared'}
          </Text>
        </TouchableOpacity>
        <MaterialCommunityIcons
          name={expanded ? 'chevron-down' : 'chevron-right'}
          size={16}
          color={colors.outline}
          style={{ marginLeft: 4 }}
        />
      </TouchableOpacity>

      {expanded ? (
        <>
          <View style={s.metaStrip}>
            {spell.castingTime ? <MetaItem label="Time" value={spell.castingTime} /> : null}
            {spell.range ? <MetaItem label="Range" value={spell.range} /> : null}
            {spell.components && spell.components.length > 0 ? (
              <MetaItem label="Comp" value={spell.components.join(', ')} />
            ) : null}
            {spell.duration ? <MetaItem label="Dur" value={spell.duration} /> : null}
          </View>

          {/* Prepare controls — leveled spells only; cantrips are
              always cast-ready. Two buttons so the player doesn't have
              to discover the long-press gesture: a primary
              Prepare/Unprepare and an "Always prepared" marker for
              source-granted spells (domain / oath / etc.) that should
              skip the daily cap. */}
          {!isCantrip && canToggle && (onTogglePrepared || onToggleAlwaysPrepared) && (
            <View style={s.prepBtnRow}>
              {onTogglePrepared && !alwaysPrepared && (
                <TouchableOpacity
                  style={[s.prepBtn, prepared ? s.prepBtnOn : s.prepBtnOff,
                    togglesBlocked && !prepared && s.prepBtnDisabled]}
                  onPress={togglesBlocked && !prepared ? undefined : onTogglePrepared}
                  activeOpacity={togglesBlocked && !prepared ? 1 : 0.7}
                >
                  <MaterialCommunityIcons
                    name={prepared ? 'check-circle' : 'circle-outline'}
                    size={13}
                    color={prepared ? colors.onPrimary : colors.outline}
                  />
                  <Text style={[s.prepBtnText, prepared && s.prepBtnTextOn]}>
                    {togglesBlocked && !prepared ? 'Prep cap reached'
                      : prepared ? 'Prepared' : 'Prepare'}
                  </Text>
                </TouchableOpacity>
              )}
              {onToggleAlwaysPrepared && (
                <TouchableOpacity
                  style={[s.prepBtn, alwaysPrepared ? s.prepBtnAlways : s.prepBtnOff]}
                  onPress={onToggleAlwaysPrepared}
                  activeOpacity={0.7}
                >
                  <MaterialCommunityIcons
                    name="pin"
                    size={13}
                    color={alwaysPrepared ? colors.onPrimary : colors.outline}
                  />
                  <Text style={[s.prepBtnText, alwaysPrepared && s.prepBtnTextOn]}>
                    {alwaysPrepared ? 'Always prepared' : 'Mark always prepared'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {spell.description ? (
            <Text style={s.descText}>{spell.description}</Text>
          ) : (
            <Text style={s.descMissing}>
              No description on file — re-add this spell through Manage Spells to fetch the latest text.
            </Text>
          )}

          {/* Player notes — RP flavor, table rulings, "use against
              undead" reminders. Lives separately from the catalog
              description so editing here never overwrites the
              upstream text. */}
          {onSaveNotes ? (
            <View style={s.spellNotesBox}>
              <Text style={s.spellNotesLabel}>NOTES</Text>
              <TextInput
                style={s.spellNotesInput}
                value={notesValue}
                onChangeText={(t) => setNotesDraft(t)}
                onBlur={() => {
                  if (notesDraft !== null) {
                    onSaveNotes(notesDraft);
                    setNotesDraft(null);
                  }
                }}
                placeholder="Add a personal note…"
                placeholderTextColor={colors.outline}
                multiline
              />
            </View>
          ) : spell.notes ? (
            <View style={s.spellNotesBox}>
              <Text style={s.spellNotesLabel}>NOTES</Text>
              <Text style={s.spellNotesText}>{spell.notes}</Text>
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.metaItem}>
      <Text style={s.metaItemLabel}>{label}</Text>
      <Text style={s.metaItemValue} numberOfLines={1}>{value}</Text>
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
  statValue: { fontSize: 22, fontFamily: fonts.headline, fontWeight: '800', color: colors.onSurface },
  statValueAtLimit: { color: colors.primary },
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
  filtersRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingBottom: 10 },
  chipDivider: {
    width: StyleSheet.hairlineWidth, height: 18,
    backgroundColor: colors.outlineVariant, marginHorizontal: 4,
  },
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

  // ── Level section + slot pips ───────────────────────────────────────────
  levelSection: { paddingHorizontal: 12, marginTop: 18 },
  levelHead: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    marginBottom: 10, paddingHorizontal: 4,
  },
  levelTitle: {
    fontFamily: fonts.headline, fontWeight: '600',
    fontSize: 14, color: colors.onSurface,
    textTransform: 'uppercase', letterSpacing: 1.4,
  },
  levelSub: { fontSize: 11, color: colors.onSurfaceVariant, letterSpacing: 0.4 },
  /** Right-aligned cluster of "X of Y slots" text + pips. Gets a dashed
   *  border in Manual Mode to signal that the count is the edit affordance
   *  for the slot maximum (or cantrip limit on the cantrips header). */
  slotSummary: {
    marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: radius.lg,
    borderWidth: 1, borderColor: 'transparent',
  },
  slotSummaryEditable: { borderColor: colors.primary, borderStyle: 'dashed' as const },
  /** Pips inside the slotSummary wrapper — follows the count text. */
  slotPipsRowInline: { flexDirection: 'row', gap: 6 },
  pip: {
    width: 14, height: 14, borderRadius: 4,
    backgroundColor: colors.surfaceContainerHigh,
    borderWidth: 1, borderColor: colors.outlineVariant,
  },
  pipFilled: { backgroundColor: colors.primary, borderColor: colors.primary },

  // ── Spell card ──────────────────────────────────────────────────────────
  spellCard: {
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1, borderColor: colors.outlineVariant,
    borderRadius: 12,
    paddingVertical: 14, paddingHorizontal: 16,
    marginBottom: 10,
  },
  // Unprepared spells dim ~50% so the prepared list visually pops while
  // unprepared entries stay readable + scannable. Combined with the
  // "Unprepared" cast button copy + hollow status circle, the row reads
  // as "in your book but not prepared today".
  spellCardDimmed: { opacity: 0.55 },
  // Status circle to the left of the spell name. Hollow when
  // unprepared, primary-filled when prepared. Cantrips render with an
  // infinity glyph to signal "always available" rather than a check.
  statusCircle: {
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: colors.outline,
  },
  statusCircleOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  statusCircleCantrip: { backgroundColor: colors.primary, borderColor: colors.primary, opacity: 0.85 },
  statusCircleAlways: { backgroundColor: colors.gm, borderColor: colors.gm },

  // Expanded-view prepare controls — explicit buttons so the player
  // doesn't have to discover the long-press / circle-tap. Inline row
  // sits above the description.
  prepBtnRow: {
    flexDirection: 'row', gap: 8, marginTop: 8, marginBottom: 8, flexWrap: 'wrap',
  },
  prepBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1, borderColor: colors.outlineVariant,
  },
  prepBtnOff: { backgroundColor: colors.surfaceContainer },
  prepBtnOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  prepBtnAlways: { backgroundColor: colors.gm, borderColor: colors.gm },
  prepBtnDisabled: { opacity: 0.5 },
  prepBtnText: {
    fontSize: 11, fontFamily: fonts.label, fontWeight: '700',
    color: colors.onSurfaceVariant, letterSpacing: 0.3,
  },
  prepBtnTextOn: { color: colors.onPrimary },
  spellHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  spellName: {
    fontFamily: fonts.headline, fontWeight: '600',
    fontSize: 16, color: colors.onSurface, letterSpacing: 0.1,
    flexShrink: 1,
  },
  schoolChip: {
    paddingHorizontal: 8, paddingVertical: 3,
    backgroundColor: colors.surfaceContainerHigh,
    borderWidth: 1, borderColor: colors.outlineVariant,
    borderRadius: 999,
  },
  schoolChipText: {
    fontFamily: fonts.label, fontWeight: '600',
    fontSize: 9, color: colors.onSurfaceVariant,
    textTransform: 'uppercase', letterSpacing: 0.7,
  },
  badgeIcon: {
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surfaceContainerHighest,
    borderWidth: 1, borderColor: colors.outlineVariant,
  },
  badgeIconText: {
    fontSize: 11, fontFamily: fonts.label, fontWeight: '700',
    color: colors.onSurfaceVariant,
  },
  badgeIconConc: { borderColor: `${colors.primary}66` },
  badgeIconTextConc: { color: colors.primary },
  castBtn: {
    marginLeft: 'auto',
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: colors.primaryContainer,
    borderWidth: 1, borderColor: `${colors.primary}40`,
  },
  castBtnAtWill: {
    backgroundColor: 'transparent',
    borderColor: colors.outlineVariant,
  },
  castBtnDisabled: {
    backgroundColor: colors.surfaceContainerHighest,
    borderColor: colors.outlineVariant,
    opacity: 0.6,
  },
  castBtnText: {
    fontFamily: fonts.label, fontWeight: '600',
    fontSize: 11, color: colors.primary,
    textTransform: 'uppercase', letterSpacing: 1.1,
  },
  castBtnTextAtWill: { color: colors.onSurfaceVariant },
  castBtnTextDisabled: { color: colors.outline },

  metaStrip: {
    flexDirection: 'row', flexWrap: 'wrap',
    gap: 18,
    marginTop: 12,
  },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaItemLabel: {
    fontFamily: fonts.label, fontWeight: '600',
    fontSize: 9, color: colors.outline,
    textTransform: 'uppercase', letterSpacing: 0.7,
  },
  metaItemValue: {
    fontSize: 13, color: colors.onSurfaceVariant, fontFamily: fonts.body,
  },

  descText: {
    marginTop: 12, paddingTop: 12,
    fontSize: 13, lineHeight: 20,
    color: colors.onSurfaceVariant, fontFamily: fonts.body,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.outlineVariant,
  },
  descMissing: {
    marginTop: 12, paddingTop: 12,
    fontSize: 12, lineHeight: 18,
    color: colors.outline, fontFamily: fonts.body, fontStyle: 'italic',
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.outlineVariant,
  },
  spellNotesBox: {
    marginTop: 10, paddingHorizontal: 10, paddingVertical: 8,
    borderRadius: 8,
    borderLeftWidth: 2, borderLeftColor: colors.primary,
    backgroundColor: `${colors.primary}10`,
  },
  spellNotesLabel: {
    fontSize: 8, fontFamily: fonts.label, fontWeight: '700',
    letterSpacing: 1.2, color: colors.primary, marginBottom: 4,
  },
  spellNotesText: {
    fontSize: 12, fontFamily: fonts.body, color: colors.onSurface,
    lineHeight: 18, fontStyle: 'italic',
  },
  spellNotesInput: {
    fontSize: 12, fontFamily: fonts.body, color: colors.onSurface,
    lineHeight: 18, fontStyle: 'italic',
    minHeight: 30, padding: 0,
  },

  // Empty
  emptyLevel: {
    fontSize: 11, fontFamily: fonts.label, fontStyle: 'italic',
    color: colors.outline, paddingHorizontal: 12, paddingVertical: 10,
  },
  emptyState: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 20, gap: 10 },
  emptyTitle: { fontSize: 15, fontFamily: fonts.headline, fontWeight: '700', color: colors.onSurfaceVariant },
  emptyBody: { fontSize: 13, fontFamily: fonts.body, color: colors.outline, textAlign: 'center', lineHeight: 19 },
});
