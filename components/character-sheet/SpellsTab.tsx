import { useState, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, TextInput, StyleSheet, useWindowDimensions, Pressable, Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fonts, radius, spacing, MarkdownText } from '@vaultstone/ui';
import type { Dnd5eStats, Dnd5eResources, Dnd5eAbilityScores, Dnd5ePreparedSpell } from '@vaultstone/types';
import { StatBreakdownModal, type StatBreakdownLine } from './StatBreakdownModal';

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

const LEVEL_LABELS = ['', '1ST LEVEL', '2ND LEVEL', '3RD LEVEL', '4TH LEVEL', '5TH LEVEL', '6TH LEVEL', '7TH LEVEL', '8TH LEVEL', '9TH LEVEL'];

/**
 * School palette — semi-saturated accent colors keyed to the eight 5e
 * schools of magic. Painted onto each spell card's left bar and used as
 * the icon tint + the school name color in the meta sub line. Picked to
 * stay readable on the Noir surface without going neon.
 */
const SCHOOL_COLORS: Record<string, string> = {
  abjuration: '#79b8ff',
  conjuration: '#f0b94c',
  divination: '#a8d4e6',
  enchantment: '#ec7dca',
  evocation: '#e95c4b',
  illusion: '#c084fc',
  necromancy: '#66c489',
  transmutation: '#d4824d',
};

/**
 * MaterialCommunityIcons glyph per school. Mirrors the accent color so
 * the card has a coherent left edge (bar color + icon hue match).
 */
const SCHOOL_ICONS: Record<string, React.ComponentProps<typeof MaterialCommunityIcons>['name']> = {
  abjuration: 'shield-half-full',
  conjuration: 'creation',
  divination: 'eye',
  enchantment: 'heart-flash',
  evocation: 'fire',
  illusion: 'drama-masks',
  necromancy: 'skull',
  transmutation: 'swap-vertical-circle',
};

function schoolColor(school?: string | null): string {
  if (!school) return '#9ca3af';
  return SCHOOL_COLORS[school.toLowerCase()] ?? '#9ca3af';
}

function schoolIcon(school?: string | null): React.ComponentProps<typeof MaterialCommunityIcons>['name'] {
  if (!school) return 'star-four-points';
  return SCHOOL_ICONS[school.toLowerCase()] ?? 'star-four-points';
}

// Filter state was an enum for level / conc / status; the chip strip
// that drove it is gone. A single `prepOnly` boolean — toggled from the
// PREPARED button next to the search box — covers the common case.

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
  /** Set a spell's prep status directly. The PREP-column chip cycles
   *  through Unprepared → Prepared → Always Prepared → Unprepared with
   *  a single tap per step; the parent persists the change in one
   *  resources.preparedSpells write so cycling from Always → Unprepared
   *  (which needs to clear both the prepared entry and the
   *  alwaysPrepared flag) doesn't race two separate writes against
   *  each other. Replaces the prior onTogglePrepared +
   *  onToggleAlwaysPrepared prop pair. Cantrips ignore this — they're
   *  always cast-ready by being in the spellbook. */
  onSetPrepStatus?: (spell: Dnd5ePreparedSpell, status: 'unprepared' | 'prepared' | 'always') => void;
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
  onOpenManage, spellbook, onSetPrepStatus, onSaveSpellNotes, spellcastingExplainers,
}: Props) {
  const [explainerOpen, setExplainerOpen] = useState(false);
  const { width } = useWindowDimensions();
  const isWide = width >= 560;
  const [search, setSearch] = useState('');
  const [prepOnly, setPrepOnly] = useState(false);

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
    if (prepOnly) spells = spells.filter(isPrepared);
    return spells;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceList, search, prepOnly, preparedKeys]);

  const byName = (a: Dnd5ePreparedSpell, b: Dnd5ePreparedSpell) => a.name.localeCompare(b.name);
  const cantrips = filteredSpells.filter((sp) => sp.level === 0).sort(byName);
  const leveledGroups = ([1, 2, 3, 4, 5, 6, 7, 8, 9] as const).map((lvl) => ({
    level: lvl,
    spells: filteredSpells.filter((sp) => sp.level === lvl).sort(byName),
    slot: spellSlots?.[lvl] ?? null,
  })).filter((g) => g.spells.length > 0 || (g.slot && g.slot.max > 0));

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
  // Breakdown modal state for spell attack + save DC. Both are
  // info-only (no Roll button) — spell rolls happen at the spell
  // level, not the header. Manual Mode still routes to the editor.
  const [spellBreakdown, setSpellBreakdown] = useState<'attack' | 'dc' | null>(null);

  return (
    <>
    <ScrollView contentContainerStyle={s.container} showsVerticalScrollIndicator={false}>

      {/* ── Spellcasting stats header ── */}
      {spellAbility && (
        <View style={s.statsRow}>
          <TouchableOpacity
            style={s.statBlock}
            onPress={manualMode && onEditField
              ? () => onEditField('spellAttack', spellAttack ?? 0)
              : () => setSpellBreakdown('attack')}
            activeOpacity={0.7}
          >
            <Text style={s.statValue}>{spellAttack !== null ? fmtMod(spellAttack) : '—'}</Text>
            <Text style={s.statLabel}>SPELL ATTACK</Text>
          </TouchableOpacity>
          <View style={s.statDivider} />
          <TouchableOpacity
            style={s.statBlock}
            onPress={manualMode && onEditField
              ? () => onEditField('spellSaveDc', spellDC ?? 0)
              : () => setSpellBreakdown('dc')}
            activeOpacity={0.7}
          >
            <Text style={s.statValue}>{spellDC !== null ? String(spellDC) : '—'}</Text>
            <Text style={s.statLabel}>SAVE DC</Text>
          </TouchableOpacity>
          {/* Action buttons take the slots where CANTRIPS + PREPARED
              count stats used to live. The cantrips header already
              shows "X of Y cantrips" and the per-level + buttons add
              spells, so the at-a-glance counts were redundant here. */}
          {isOwner && onOpenManage ? (
            <>
              <View style={s.statDivider} />
              <TouchableOpacity
                style={s.statActionBlock}
                onPress={onOpenManage}
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons name="bookshelf" size={22} color={colors.primary} />
                <Text style={s.statActionLabel}>MANAGE SPELLS</Text>
              </TouchableOpacity>
            </>
          ) : null}
          {spellcastingExplainers && spellcastingExplainers.length > 0 ? (
            <>
              <View style={s.statDivider} />
              <TouchableOpacity
                style={s.statActionBlock}
                onPress={() => setExplainerOpen(true)}
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons name="book-open-variant" size={22} color={colors.primary} />
                <Text style={s.statActionLabel}>SPELLCASTING</Text>
              </TouchableOpacity>
            </>
          ) : null}
        </View>
      )}

      {/* "How spellcasting works" lived here as a collapsible card; it
          now opens as a modal triggered from the HOW IT WORKS button
          in the stats strip above. Keeps the top of the tab leading
          with action surfaces (search + Manage + How it works) instead
          of pushing them below a tall explainer card. */}

      {/* ── Search + Prepared toggle ── */}
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
        {/* Prepared filter — only one toggle replaces the old level /
            conc / unprepared chip strip. Most players reach for "show
            only what I can actually cast right now" and either scroll
            or search for the rest. */}
        <TouchableOpacity
          style={[s.prepFilterBtn, prepOnly && s.prepFilterBtnActive]}
          onPress={() => setPrepOnly((v) => !v)}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons
            name={prepOnly ? 'check-circle' : 'circle-outline'}
            size={13}
            color={prepOnly ? colors.onPrimary : colors.outline}
          />
          <Text style={[s.prepFilterBtnText, prepOnly && s.prepFilterBtnTextActive]}>PREPARED</Text>
        </TouchableOpacity>
      </View>

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
          <LevelGradient />
          <SpellTableHeader />
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
          <LevelGradient />
          {spells.length > 0 ? <SpellTableHeader /> : null}
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
                canToggle={isOwner && !!onSetPrepStatus}
                onSetPrepStatus={onSetPrepStatus ? (status) => onSetPrepStatus(spell, status) : undefined}
                togglesBlocked={!prep && atLimit}
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

    {/* "How spellcasting works" modal — replaces the standalone
        collapsible card. Shows synthesized per-class stats + the
        class-shipped prose. Same modal shape as the AddSheetModal
        chassis on the Combat tab. */}
    {explainerOpen && spellcastingExplainers && spellcastingExplainers.length > 0 ? (
      <Modal visible transparent animationType="fade" onRequestClose={() => setExplainerOpen(false)}>
        <Pressable style={s.explainerModalBackdrop} onPress={() => setExplainerOpen(false)}>
          <Pressable style={s.explainerModalCard} onPress={() => {}}>
            <View style={s.explainerModalHeader}>
              <MaterialCommunityIcons name="book-open-variant" size={16} color={colors.primary} />
              <Text style={s.explainerModalTitle}>
                {spellcastingExplainers.length === 1
                  ? `How ${spellcastingExplainers[0].className} spellcasting works`
                  : 'How spellcasting works'}
              </Text>
              <TouchableOpacity onPress={() => setExplainerOpen(false)} hitSlop={10} activeOpacity={0.7}>
                <MaterialCommunityIcons name="close" size={18} color={colors.outline} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 480 }} contentContainerStyle={{ paddingBottom: 8 }}>
              {spellcastingExplainers.map((ex, i) => (
                <View key={ex.className} style={i > 0 ? s.explainerSection : null}>
                  {spellcastingExplainers.length > 1 && (
                    <Text style={s.explainerClassLabel}>{ex.className.toUpperCase()}</Text>
                  )}
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
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    ) : null}

    {(() => {
      // Spell attack / save DC breakdown — both reuse the same
      // ability mod + prof spine; DC adds the +8 passive base.
      if (!spellBreakdown || spellMod === null || !spellAbility) return null;
      const close = () => setSpellBreakdown(null);
      const abilityShort = spellAbility.slice(0, 3).toUpperCase();
      if (spellBreakdown === 'attack') {
        const override = manualMode && stats.spellAttackOverride != null;
        const total = override ? stats.spellAttackOverride! : prof + spellMod;
        const lines: StatBreakdownLine[] = override
          ? [{ label: 'Manual override', value: fmtMod(total) }]
          : [
              { label: `${abilityShort} mod`, value: fmtMod(spellMod) },
              { label: 'Proficiency', value: fmtMod(prof) },
            ];
        return (
          <StatBreakdownModal
            visible
            title="Spell Attack"
            subtitle={`${spellAbility} caster · d20 + total vs. AC`}
            total={fmtMod(total)}
            lines={lines}
            onClose={close}
          />
        );
      }
      const override = manualMode && stats.spellSaveDcOverride != null;
      const total = override ? stats.spellSaveDcOverride! : 8 + prof + spellMod;
      const lines: StatBreakdownLine[] = override
        ? [{ label: 'Manual override', value: String(total) }]
        : [
            { label: 'Save base', value: '8' },
            { label: `${abilityShort} mod`, value: fmtMod(spellMod) },
            { label: 'Proficiency', value: fmtMod(prof) },
          ];
      return (
        <StatBreakdownModal
          visible
          title="Spell Save DC"
          subtitle={`${spellAbility} caster · target rolls vs. this`}
          total={String(total)}
          lines={lines}
          onClose={close}
        />
      );
    })()}
    </>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

// 1 → "1st", 2 → "2nd", etc. — used in the level section header.
function ordinal(n: number): string {
  const suffixes = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (suffixes[(v - 20) % 10] ?? suffixes[v] ?? suffixes[0]);
}

/**
 * Header strip rendered above every spell list (cantrips + each leveled
 * group). Matches the Combat-tab table style: small uppercase labels
 * sitting in fixed-width columns that line up with the SpellRow cells
 * below. 10px left padding accounts for the 2px school accent bar plus
 * 8px body padding on each card.
 */
function SpellTableHeader() {
  return (
    <View style={s.spellHeaderRow}>
      {/* Empty cell that mirrors the row's icon slot so NAME header
       *  aligns with the spell-name text below regardless of how many
       *  leading glyphs the row has. */}
      <View style={s.spellIconCol} />
      <Text style={[s.spellHeaderCell, { flex: 1 }]}>NAME</Text>
      <View style={s.spellSchoolCol}><Text style={s.spellHeaderCell}>SCHOOL</Text></View>
      <View style={s.spellRangeCol}><Text style={s.spellHeaderCell}>RANGE</Text></View>
      <View style={s.spellTimeCol}><Text style={s.spellHeaderCell}>TIME</Text></View>
      <View style={s.spellPrepCol}><Text style={s.spellHeaderCell}>PREP</Text></View>
    </View>
  );
}

/**
 * Thin horizontal gradient strip rendered between each level header and
 * the spell list below it. Primary → rose-pink → transparent reads as a
 * "magical seam" — quiet decoration that hints at arcane content
 * without competing with the table rows for attention.
 */
function LevelGradient() {
  return (
    <LinearGradient
      colors={[colors.primary, '#ec7dca', 'transparent']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={s.levelGradient}
    />
  );
}

function SpellRow({
  spell, slot, prepared, alwaysPrepared, canToggle, onSetPrepStatus, togglesBlocked, onSaveNotes,
}: {
  spell: Dnd5ePreparedSpell;
  slot?: { max: number; remaining: number } | null;
  prepared: boolean;
  alwaysPrepared: boolean;
  canToggle: boolean;
  onSetPrepStatus?: (status: 'unprepared' | 'prepared' | 'always') => void;
  togglesBlocked?: boolean;
  onSaveNotes?: (notes: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  // Local draft so the user can edit notes without persisting every
  // keystroke — commits on blur or when the row collapses.
  const [notesDraft, setNotesDraft] = useState<string | null>(null);
  const notesActive = notesDraft !== null;
  const notesValue = notesActive ? notesDraft! : (spell.notes ?? '');
  const isCantrip = spell.level === 0;
  const accentColor = schoolColor(spell.school);
  const iconName = schoolIcon(spell.school);
  // Mute the bar on unprepared leveled spells so prepared ones pop
  // visually — the colored bars become a scan signal for "what's actually
  // castable today" rather than just decoration.
  const barColor = prepared ? accentColor : `${accentColor}55`;

  // PREP-column chip cycles Unprepared → Prepared → Always → Unprepared
  // on each tap (cantrips skip the cycle — they're always cast-ready).
  // The Always → Unprepared transition needs to clear both the prepared
  // entry and the alwaysPrepared flag in one persistResources call, which
  // is why this delegates to a single onSetPrepStatus rather than chained
  // toggle callbacks (race risk).
  function handlePrepColPress(e: any) {
    e?.stopPropagation?.();
    if (isCantrip || !canToggle || !onSetPrepStatus) return;
    // Block the Unprepared → Prepared step when the daily prep cap is full.
    if (!prepared && togglesBlocked) return;
    const next: 'unprepared' | 'prepared' | 'always' = alwaysPrepared
      ? 'unprepared'
      : prepared
        ? 'always'
        : 'prepared';
    onSetPrepStatus(next);
  }
  // PREP-column visual state. Each tap advances one step in the cycle.
  const prepLabel = isCantrip
    ? 'At Will'
    : alwaysPrepared
      ? 'Always'
      : prepared
        ? 'Prepared'
        : togglesBlocked
          ? 'Capped'
          : 'Prep';

  return (
    <View style={[s.spellCard, !prepared && s.spellCardDimmed]}>
      <TouchableOpacity
        style={s.spellCardHead}
        onPress={() => setExpanded((v) => !v)}
        activeOpacity={0.7}
      >
        <View style={[s.spellCardBar, { backgroundColor: barColor }]} />
        <View style={s.spellCardBody}>
          <View style={s.spellTitleRow}>
            {/* Fixed-width icon slot — guarantees the spell name starts
             *  at the same x across rows regardless of which leading
             *  glyphs apply. School icon is the always-present anchor;
             *  the cantrip ∞ from Phase 2 is gone (the PREP "At Will"
             *  chip carries that signal). Concentration moves into the
             *  SCHOOL column as an inline atom-variant badge. */}
            <View style={s.spellIconCol}>
              <MaterialCommunityIcons name={iconName} size={13} color={accentColor} />
            </View>
            <Text style={s.spellName} numberOfLines={1}>{spell.name}</Text>
            <View style={s.spellSchoolCol}>
              <Text
                style={[s.spellSchoolText, { color: prepared ? accentColor : `${accentColor}99` }]}
                numberOfLines={1}
              >
                {spell.school ? capitalize(spell.school.toLowerCase()) : '—'}
              </Text>
              {spell.concentration ? (
                <MaterialCommunityIcons
                  name="atom-variant"
                  size={11}
                  color={colors.primary}
                  style={{ marginLeft: 3 }}
                  accessibilityLabel="Requires concentration"
                />
              ) : null}
            </View>
            <View style={s.spellRangeCol}>
              <Text style={s.spellColText} numberOfLines={1}>{spell.range ?? '—'}</Text>
            </View>
            <View style={s.spellTimeCol}>
              <Text style={s.spellColText} numberOfLines={1}>{spell.castingTime ?? '—'}</Text>
            </View>
            <View style={s.spellPrepCol}>
              <TouchableOpacity
                onPress={handlePrepColPress}
                activeOpacity={isCantrip || !canToggle ? 1 : 0.7}
                disabled={isCantrip || !canToggle || (!prepared && togglesBlocked)}
                style={[
                  s.prepChip,
                  isCantrip && s.prepChipAtWill,
                  prepared && !isCantrip && !alwaysPrepared && s.prepChipCast,
                  !prepared && !isCantrip && s.prepChipUnprep,
                  alwaysPrepared && s.prepChipAlways,
                  !prepared && togglesBlocked && s.prepChipDisabled,
                ]}
              >
                <Text style={[
                  s.prepChipText,
                  isCantrip && s.prepChipTextAtWill,
                  prepared && !isCantrip && !alwaysPrepared && s.prepChipTextCast,
                  !prepared && !isCantrip && s.prepChipTextUnprep,
                  alwaysPrepared && s.prepChipTextAlways,
                ]}>
                  {prepLabel}
                </Text>
              </TouchableOpacity>
            </View>
            <MaterialCommunityIcons
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={12}
              color={colors.outline}
            />
          </View>
          {/* Meta sub line — ritual tag only. Always-prepared status is
              carried entirely by the PREP-column chip now; school +
              concentration sit in the SCHOOL column. */}
          {spell.ritual ? (
            <View style={s.spellMetaSub}>
              <Text style={s.spellMetaText}>ritual</Text>
            </View>
          ) : null}
        </View>
      </TouchableOpacity>

      {expanded ? (
        // Wrap the expanded body in a padded container so the meta
        // strip, description, and notes box are inset from the card's
        // outer border. The wrapper's left padding (10) matches the
        // header row's content origin (2px bar + 8px body padding) so
        // expanded content lines up with the spell name above.
        <View style={s.spellCardExpanded}>
          <View style={s.metaStrip}>
            {spell.castingTime ? <MetaItem label="Time" value={spell.castingTime} /> : null}
            {spell.range ? <MetaItem label="Range" value={spell.range} /> : null}
            {spell.components && spell.components.length > 0 ? (
              <MetaItem label="Comp" value={spell.components.join(', ')} />
            ) : null}
            {spell.duration ? <MetaItem label="Dur" value={spell.duration} /> : null}
          </View>

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
              <Text style={s.spellNotesLabel}>FLAVOR NOTES</Text>
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
              <Text style={s.spellNotesLabel}>FLAVOR NOTES</Text>
              <Text style={s.spellNotesText}>{spell.notes}</Text>
            </View>
          ) : null}
        </View>
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
  /** Action button that sits in the stats strip in place of a stat
   *  block. Same flex sizing so the row stays evenly distributed;
   *  icon + label replace the numeric value + label pairing. */
  statActionBlock: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 2 },
  statActionLabel: {
    fontSize: 9, fontFamily: fonts.label, fontWeight: '700',
    letterSpacing: 1.5, color: colors.primary, textAlign: 'center' as const,
  },

  // "How spellcasting works" modal — replaces the standalone explainer
  // card that used to sit between the stats strip and the search row.
  explainerModalBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  explainerModalCard: {
    width: '100%', maxWidth: 520,
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: 12, padding: 16, gap: 12,
  },
  explainerModalHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  explainerModalTitle: {
    flex: 1, fontSize: 14, fontFamily: fonts.headline, fontWeight: '700', color: colors.onSurface,
  },
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
  /** Prepared toggle that sits to the right of the search box —
   *  outline when off, primary fill when on. Single toggle replaces
   *  the entire FilterChip strip that used to live below the search
   *  (level chips, conc, prepared, unprepared). */
  prepFilterBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 7,
    borderWidth: 1, borderColor: colors.outlineVariant,
    borderRadius: radius.lg,
  },
  prepFilterBtnActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  prepFilterBtnText: {
    fontSize: 10, fontFamily: fonts.label, fontWeight: '700',
    letterSpacing: 1, color: colors.outline,
  },
  prepFilterBtnTextActive: { color: colors.onPrimary },

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

  // ── Spell card (table-style chassis matching CombatTab's equipCard) ─────
  // Outer card is flex column so the expanded body stacks BELOW the
  // header row. The header row (spellCardHead) is itself flex row to
  // place the accent bar next to the body content. Mixing those two
  // axes on a single element put expanded content next to the header
  // and broke the layout when a spell was prepared/expanded.
  spellCard: {
    borderWidth: 1, borderColor: colors.outlineVariant,
    borderRadius: 6, overflow: 'hidden',
    marginBottom: 4,
  },
  // Unprepared spells dim ~50% so the prepared list visually pops while
  // unprepared entries stay readable + scannable.
  spellCardDimmed: { opacity: 0.55 },
  /** Full-height left accent bar, painted with the school color. */
  spellCardBar: { width: 2, alignSelf: 'stretch' },
  /** Card body — wraps the title row + meta sub line. The whole card is
   *  tappable for expand; nested controls use stopPropagation. */
  spellCardHead: { flex: 1, flexDirection: 'row', alignItems: 'stretch' },
  spellCardBody: { flex: 1, paddingHorizontal: 8, paddingVertical: 5, gap: 1 },
  spellTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  spellMetaSub: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginLeft: 28 },
  spellMetaText: { fontSize: 10, fontFamily: fonts.label, color: colors.outline, textTransform: 'lowercase' as const },

  /** Table header strip rendered above each spell list. Padded 10px on
   *  the left so NAME starts past the card's bar + body padding. */
  spellHeaderRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.outlineVariant,
    marginBottom: 4,
  },
  spellHeaderCell: {
    fontSize: 8, fontFamily: fonts.label, fontWeight: '700',
    letterSpacing: 1.2, textTransform: 'uppercase', color: colors.outline,
  },
  spellColText: {
    fontSize: 10, fontFamily: fonts.label, fontWeight: '600',
    color: colors.onSurfaceVariant, textAlign: 'center' as const,
  },
  /** School-tinted text — same size/weight as spellColText but caller
   *  passes the school accent color (or dimmed variant when the spell
   *  is unprepared) so the column reinforces the bar/icon color. */
  spellSchoolText: {
    fontSize: 10, fontFamily: fonts.label, fontWeight: '600',
    textAlign: 'center' as const,
  },
  /** Fixed-width leading slot for the school glyph. Mirrored in the
   *  header (empty cell) so spell-name text aligns across all rows
   *  whether or not the row has badges. */
  spellIconCol: { width: 22, alignItems: 'center' },
  /** School column — fits "transmutation" (the longest school name) at
   *  fontSize 10 plus an optional inline concentration badge. */
  spellSchoolCol: { width: 92, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  spellRangeCol: { width: 64, alignItems: 'center' },
  spellTimeCol: { width: 64, alignItems: 'center' },
  spellPrepCol: { width: 60, alignItems: 'center' },

  /** Prep-column chip — visual state depends on cantrip / prepared /
   *  unprepared / always-prepared. Replaces the old standalone status
   *  circle + cast button affordances with one compact control. */
  prepChip: {
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1, borderColor: colors.outlineVariant,
    backgroundColor: 'transparent',
    minWidth: 56, alignItems: 'center',
  },
  prepChipAtWill: { borderColor: `${colors.primary}55` },
  prepChipCast: { backgroundColor: `${colors.primary}22`, borderColor: `${colors.primary}66` },
  prepChipDisabled: { opacity: 0.5 },
  prepChipUnprep: { borderColor: colors.outlineVariant },
  prepChipAlways: { borderColor: `${colors.gm}66`, backgroundColor: `${colors.gm}18` },
  prepChipText: { fontSize: 10, fontFamily: fonts.label, fontWeight: '700', color: colors.outline, letterSpacing: 0.4 },
  prepChipTextAtWill: { color: colors.primary },
  prepChipTextCast: { color: colors.primary },
  prepChipTextUnprep: { color: colors.outline },
  prepChipTextAlways: { color: colors.gm },

  /** Thin gradient strip between the level title and the table header.
   *  Quiet decoration — feels like a magical seam without competing
   *  with the spell rows for attention. */
  levelGradient: {
    height: 2, borderRadius: 1,
    marginHorizontal: 4, marginBottom: 6,
    opacity: 0.45,
  },
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
  /** Spell name — matches the Combat-tab equipCardName / cardName
   *  density (12 / headline / 600) so the two tabs feel like one
   *  family. The flex:1 sits inside the title row's gap-6 layout
   *  so columns slide past on the right without wrapping. */
  spellName: {
    flex: 1, fontSize: 12, fontFamily: fonts.headline, fontWeight: '600',
    color: colors.onSurface, letterSpacing: -0.1,
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

  /** Padded container for the expanded body (meta strip + description
   *  + notes). Indented 10px on the left so contents align with the
   *  spell name above (which sits past the 2px accent bar + 8px body
   *  padding); 10px on the right keeps the description and the notes
   *  box from kissing the card's right border. */
  spellCardExpanded: { paddingHorizontal: 10, paddingBottom: 10 },
  metaStrip: {
    flexDirection: 'row', flexWrap: 'wrap',
    gap: 18,
    marginTop: 8,
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
