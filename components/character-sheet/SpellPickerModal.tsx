// Catalog spell picker for the character sheet's Spells tab "MANAGE
// SPELLS" affordance. Mirrors FeatPickerModal's pattern: pulls from
// ContentResolver scoped to the character's campaign + pack opt-in,
// filters by class so a Wizard doesn't see Cleric-only spells, and
// commits to resources.preparedSpells[] via the parent. Casters who
// multiclass see the union of all class lists; cantrips and leveled
// spells share the same flow.

import { useEffect, useMemo, useState } from 'react';
import {
  View, Text, Modal, Pressable, ScrollView, TouchableOpacity,
  ActivityIndicator, TextInput, StyleSheet, Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ContentResolver } from '@vaultstone/content';
import { colors, fonts, radius, spacing } from '@vaultstone/ui';
import type { Dnd5ePreparedSpell, SpellResult } from '@vaultstone/types';

const LEVEL_LABELS = ['Cantrip', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];

let _spellCache: { key: string; spells: SpellResult[]; fetchedAt: number } | null = null;
const SPELL_CACHE_TTL = 5 * 60 * 1000;

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Character classes (display names) used to filter the catalog —
   *  e.g. ['Wizard']. Multiclass passes the full list and the picker
   *  surfaces any spell in the union. Empty array shows all spells in
   *  the catalog (homebrew packs may legitimately ship classless spells). */
  classNames: string[];
  /** Already-prepared spell ids (matches SpellResult.key) — disabled in the list. */
  existingKeys: Set<string>;
  /** Already-prepared spells, used for the summary counter under the
   *  filters ("3 cantrips · 4 1st · 2 2nd prepared"). When omitted the
   *  modal falls back to the existingKeys size with no per-level
   *  breakdown. */
  existingSpells?: Dnd5ePreparedSpell[];
  /** Spell-prep limits computed by the parent. `cantrips` = total
   *  cantrips known. `spellbook` = total leveled spells the character
   *  may know (5.1 known-list cap; undefined for prepare-list classes
   *  whose spellbook is effectively uncapped). `prepared` = total
   *  leveled spells preparable for casting today. The Manage Spells
   *  modal uses cantrip + spellbook; the Prepare Spells modal uses
   *  cantrip + prepared. Each may be undefined when the parent can't
   *  compute it (legacy character with no progression data). */
  spellLimits?: { cantrips?: number; spellbook?: number; prepared?: number };
  campaignId?: string | null;
  packIds?: string[];
  srdVersion?: 'SRD_5.1' | 'SRD_2.0';
  onPick: (spell: Dnd5ePreparedSpell) => void;
  /** Remove a prepared spell by id (matches SpellResult.key). The
   *  modal calls this when the player taps Remove inside an expansion
   *  that's already on the prepared list. */
  onRemove?: (spellId: string) => void;
};

export function SpellPickerModal({
  visible, onClose, classNames, existingKeys, existingSpells, spellLimits,
  campaignId, packIds, srdVersion, onPick, onRemove,
}: Props) {
  const [list, setList] = useState<SpellResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState<number | 'all'>('all');
  // Three-way: 'all' shows the whole catalog (default), 'added' narrows
  // to spells already on the character's preparedSpells, 'unadded' hides
  // those so the player can scan only candidates.
  const [statusFilter, setStatusFilter] = useState<'all' | 'added' | 'unadded'>('all');
  // Class scope is one dropdown with three flavors of value:
  //   'mine' (default when the character has class metadata) — narrows
  //     the catalog to spells whose class list overlaps with the
  //     player's. Replaces the old icon-only "show all classes" toggle.
  //   'all' — no class filter; useful for homebrew lineage spells or
  //     multiclass-prep browsing.
  //   <class name> — limit to a single specific class.
  const [classFilter, setClassFilter] = useState<string | 'mine' | 'all'>(
    classNames.length > 0 ? 'mine' : 'all',
  );
  const [schoolFilter, setSchoolFilter] = useState<string | 'all'>('all');
  // Single-open inline expansion. Tapping the same row again collapses;
  // tapping a different row swaps the expansion (only one open at a time
  // so the list doesn't grow unbounded as the player browses).
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  // One-off custom spell entry — for spells the catalog doesn't ship
  // (DM-granted, homebrew lineage spells, etc.). Same pattern as the
  // ItemPickerModal custom-item form.
  const [customOpen, setCustomOpen] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setSearch('');
    setLevelFilter('all');
    setStatusFilter('all');
    setClassFilter(classNames.length > 0 ? 'mine' : 'all');
    setSchoolFilter('all');
    setExpandedKey(null);
    setFilterMenuOpen(false);
    setCustomOpen(false);
    const cacheKey = `${srdVersion}|${campaignId ?? ''}|${(packIds ?? []).join(',')}`;
    if (_spellCache && _spellCache.key === cacheKey && Date.now() - _spellCache.fetchedAt < SPELL_CACHE_TTL) {
      setList(_spellCache.spells);
      setLoading(false);
      return;
    }
    setLoading(true);
    const includeHomebrew = !!campaignId || (packIds?.length ?? 0) > 0;
    const tiers: Array<'srd' | 'homebrew'> = includeHomebrew ? ['srd', 'homebrew'] : ['srd'];
    ContentResolver.search({
      type: 'spell',
      system: 'dnd5e',
      srdVersion,
      tiers,
      campaignId: campaignId ?? undefined,
      packIds: !campaignId && packIds && packIds.length > 0 ? packIds : undefined,
    })
      .then((r) => {
        const spells = r as SpellResult[];
        _spellCache = { key: cacheKey, spells, fetchedAt: Date.now() };
        setList(spells);
      })
      .finally(() => setLoading(false));
  }, [visible, srdVersion, campaignId, (packIds ?? []).join(',')]);

  const classNamesLc = useMemo(
    () => new Set(classNames.map((n) => n.toLowerCase())),
    [classNames],
  );

  // Single helper for the class-scope predicate, shared by the spell
  // list filter and the level / school option enumerators so they all
  // agree on which spells "count" given the current scope.
  const inScope = useMemo(() => {
    return (s: SpellResult): boolean => {
      if (classFilter === 'all') return true;
      if (classFilter === 'mine') {
        if (s.classes.length === 0) return true;
        if (classNamesLc.size === 0) return true;
        return s.classes.some((cn) => classNamesLc.has(cn.toLowerCase()));
      }
      return s.classes.some((cn) => cn.toLowerCase() === classFilter.toLowerCase());
    };
  }, [classFilter, classNamesLc]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return list
      .filter(inScope)
      .filter((s) => schoolFilter === 'all' || s.school.toLowerCase() === schoolFilter.toLowerCase())
      .filter((s) => levelFilter === 'all' || s.level === levelFilter)
      .filter((s) => {
        if (statusFilter === 'all') return true;
        const has = existingKeys.has(s.key);
        return statusFilter === 'added' ? has : !has;
      })
      .filter((s) => !q
        || s.name.toLowerCase().includes(q)
        || s.school.toLowerCase().includes(q)
        || (s.description ?? '').toLowerCase().includes(q),
      )
      .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  }, [list, search, levelFilter, statusFilter, inScope, schoolFilter, existingKeys]);

  // Dropdown options always come from the full catalog — the player
  // needs to see every class to be able to pick one, even when the
  // current scope is "My Classes".
  const availableClasses = useMemo(() => {
    const set = new Set<string>();
    for (const sp of list) {
      for (const cn of sp.classes) set.add(cn);
    }
    return [...set].sort();
  }, [list]);

  const availableSchools = useMemo(() => {
    const set = new Set<string>();
    for (const sp of list) {
      if (inScope(sp) && sp.school) set.add(sp.school);
    }
    return [...set].sort();
  }, [list, inScope]);

  // Levels actually present in the (scope-filtered) catalog drive the
  // dropdown options — no point listing 9th-level when the character has
  // no 9th-level spells available.
  const availableLevels = useMemo(() => {
    const set = new Set<number>();
    for (const s of list) {
      if (inScope(s)) set.add(s.level);
    }
    return [...set].sort((a, b) => a - b);
  }, [list, inScope]);

  function commit(spell: SpellResult) {
    const prepared: Dnd5ePreparedSpell = {
      id: spell.key,
      name: spell.name,
      level: spell.level,
      school: spell.school,
      ritual: spell.ritual,
      concentration: spell.concentration,
      castingTime: spell.castingTime,
      range: spell.range,
      components: spell.components,
      duration: spell.duration,
      description: spell.description,
      // Carry the source identifier (class list or "Homebrew") so the
      // sheet can group by source if it wants. Falls through cleanly
      // when the spell has no class list.
      source: spell.classes && spell.classes.length > 0 ? spell.classes[0] : undefined,
    };
    onPick(prepared);
    // Stay open so the player can keep adding — the row updates to
    // show the prepared check and the Add button swaps to Remove.
    setExpandedKey(null);
  }

  const filterLabel = levelFilter === 'all'
    ? 'All Levels'
    : levelFilter === 0
      ? 'Cantrips'
      : `${LEVEL_LABELS[levelFilter] ?? String(levelFilter)} level`;

  // Two-bucket summary for the spellbook view: cantrips known +
  // leveled spells in the spellbook. Each bucket renders as
  // `current/limit` when the parent supplied a limit via `spellLimits`,
  // or just `current` otherwise. The leveled denominator falls back
  // from spellbook → prepared so prepare-list classes (whose spellbook
  // is uncapped) still show *some* useful denominator — their
  // "spellbook" effectively maxes at the prepared limit anyway since
  // there's no use case for learning a spell you can't ever prepare.
  const preparedSummary = useMemo(() => {
    if (!existingSpells) return null;
    let cantripCount = 0;
    let leveledCount = 0;
    for (const sp of existingSpells) {
      if (sp.level === 0) cantripCount++;
      else leveledCount++;
    }
    const cantripLimit = spellLimits?.cantrips;
    // Manage Spells writes to the spellbook (the master learned pool),
    // NOT today's prepared subset. Prepare-list classes (Wizard,
    // Cleric, Druid, Paladin, Artificer) have an uncapped spellbook —
    // they routinely learn more spells than they can prepare today,
    // then swap during long rests. The old `?? prepared` fallback
    // turned the prepared cap into a hard ceiling on the spellbook,
    // so an Artificer who'd hit the prep limit with 4 L1 spells
    // couldn't add L2 spells at all. Only enforce `spellbook` here;
    // when it's undefined, no leveled cap applies in this modal.
    const leveledLimit = spellLimits?.spellbook;
    const cantripText = cantripLimit !== undefined
      ? `${cantripCount}/${cantripLimit} cantrips`
      : cantripCount === 1 ? '1 cantrip' : `${cantripCount} cantrips`;
    const leveledText = leveledLimit !== undefined
      ? `${leveledCount}/${leveledLimit} in spellbook`
      : `${leveledCount} in spellbook`;
    return { cantripText, leveledText, cantripCount, leveledCount, cantripLimit, leveledLimit };
  }, [existingSpells, spellLimits?.cantrips, spellLimits?.spellbook]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={s.card} onPress={() => {}}>
          <View style={s.header}>
            <Text style={s.title} numberOfLines={1}>
              {customOpen ? 'Custom spell' : 'Add a spell'}
            </Text>
            {/* Custom spell entry — moved up to the header so the filter
                row carries only filters, not actions. */}
            {!customOpen ? (
              <TouchableOpacity
                onPress={() => setCustomOpen(true)}
                activeOpacity={0.7}
                style={s.headerCustomBtn}
                accessibilityLabel="Add a custom spell"
              >
                <MaterialCommunityIcons name="plus-circle-outline" size={14} color={colors.primary} />
                <Text style={s.headerCustomText}>Custom</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <MaterialCommunityIcons name="close" size={22} color={colors.onSurfaceVariant} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={s.loadingWrap}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : customOpen ? (
            <CustomSpellForm
              onBack={() => setCustomOpen(false)}
              onCommit={(spell) => { onPick(spell); setCustomOpen(false); }}
            />
          ) : (
            <>
              <View style={s.searchRow}>
                <View style={s.searchBox}>
                  <MaterialCommunityIcons name="magnify" size={16} color={colors.outline} />
                  <TextInput
                    style={s.searchInput}
                    placeholder="Search spells…"
                    placeholderTextColor={colors.outline}
                    value={search}
                    onChangeText={setSearch}
                  />
                </View>
              </View>
              {/* Unified filter row — status chip + level / class /
                  school dropdowns sit on a single wrapped row. The
                  status chip cycles All → Unadded → Added on tap with
                  its label + color swapping to match state. */}
              <View style={s.controlsRow}>
                <TouchableOpacity
                  style={[
                    s.statusToggleChip,
                    statusFilter === 'unadded' && s.statusToggleChipUnadded,
                    statusFilter === 'added' && s.statusToggleChipAdded,
                  ]}
                  onPress={() => {
                    const nextStatus: typeof statusFilter = statusFilter === 'all'
                      ? 'unadded'
                      : statusFilter === 'unadded' ? 'added' : 'all';
                    setStatusFilter(nextStatus);
                  }}
                  activeOpacity={0.7}
                >
                  <MaterialCommunityIcons
                    name={statusFilter === 'added' ? 'check-circle' : statusFilter === 'unadded' ? 'circle-slice-3' : 'filter-variant'}
                    size={13}
                    color={statusFilter === 'all' ? colors.outline : colors.onPrimary}
                  />
                  <Text style={[
                    s.statusToggleText,
                    statusFilter !== 'all' && s.statusToggleTextActive,
                  ]}>
                    {statusFilter === 'all' ? 'ALL SPELLS' : statusFilter === 'unadded' ? 'UNADDED' : 'ADDED'}
                  </Text>
                </TouchableOpacity>
                <LevelFilterDropdown
                  value={levelFilter}
                  availableLevels={availableLevels}
                  onChange={setLevelFilter}
                  onOpenNativeMenu={() => setFilterMenuOpen(true)}
                  label={filterLabel}
                />
                {classNames.length > 0 ? (
                  <ClassScopeDropdown
                    value={classFilter}
                    options={availableClasses}
                    onChange={setClassFilter}
                  />
                ) : null}
                <StringFilterDropdown
                  value={schoolFilter}
                  options={availableSchools}
                  onChange={setSchoolFilter}
                  allLabel="All Schools"
                />
              </View>

              {preparedSummary ? (
                <View style={s.summaryRow}>
                  <Text style={[
                    s.summaryChunk,
                    preparedSummary.cantripLimit !== undefined
                    && preparedSummary.cantripCount >= preparedSummary.cantripLimit
                    && s.summaryChunkAtLimit,
                  ]}>
                    {preparedSummary.cantripText}
                  </Text>
                  <Text style={s.summaryDot}> · </Text>
                  <Text style={[
                    s.summaryChunk,
                    preparedSummary.leveledLimit !== undefined
                    && preparedSummary.leveledCount >= preparedSummary.leveledLimit
                    && s.summaryChunkAtLimit,
                  ]}>
                    {preparedSummary.leveledText}
                  </Text>
                </View>
              ) : null}

              <ScrollView style={s.list} contentContainerStyle={{ paddingBottom: spacing.md }}>
                {filtered.length === 0 ? (
                  <Text style={s.emptyText}>No matching spells.</Text>
                ) : null}
                {(() => {
                  // When the filter is set to a single level, headers
                  // would just repeat that label — only group when
                  // we're showing the merged "All" view.
                  const showHeaders = levelFilter === 'all';
                  const out: React.ReactNode[] = [];
                  let lastLevel: number | null = null;
                  for (const sp of filtered) {
                    if (showHeaders && sp.level !== lastLevel) {
                      out.push(
                        <View key={`header-${sp.level}`} style={s.groupHeader}>
                          <Text style={s.groupHeaderText}>
                            {sp.level === 0 ? 'CANTRIPS' : `${LEVEL_LABELS[sp.level]?.toUpperCase() ?? `LEVEL ${sp.level}`} LEVEL`}
                          </Text>
                          <View style={s.groupHeaderRule} />
                        </View>
                      );
                      lastLevel = sp.level;
                    }
                    const has = existingKeys.has(sp.key);
                    const expanded = expandedKey === sp.key;
                    out.push(
                      <View key={sp.key} style={[s.rowWrap, expanded && s.rowWrapExpanded]}>
                      <Pressable
                        style={s.row}
                        onPress={() => setExpandedKey(expanded ? null : sp.key)}
                      >
                        <View style={[s.statusCircle, has && s.statusCircleAdded]}>
                          {has ? (
                            <MaterialCommunityIcons name="check" size={12} color={colors.onPrimary} />
                          ) : null}
                        </View>
                        <View style={s.levelBadge}>
                          <Text style={s.levelBadgeText}>{sp.level === 0 ? 'C' : sp.level}</Text>
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={s.rowName}>{sp.name}</Text>
                        </View>
                        {(() => {
                          const code = sourceCodeFor(sp);
                          return code ? (
                            <Text style={s.rowSource} numberOfLines={1}>{code}</Text>
                          ) : null;
                        })()}
                        <MaterialCommunityIcons
                          name={expanded ? 'chevron-up' : 'chevron-down'}
                          size={18}
                          color={colors.outline}
                        />
                      </Pressable>
                      {expanded ? (
                        <View style={s.expansion}>
                          <View style={s.metaGrid}>
                            <DetailMeta label="Level" value={sp.level === 0 ? 'Cantrip' : LEVEL_LABELS[sp.level] ?? String(sp.level)} />
                            <DetailMeta label="School" value={sp.school} />
                            <DetailMeta label="Casting" value={sp.castingTime} />
                            <DetailMeta label="Range" value={sp.range} />
                            <DetailMeta label="Components" value={sp.components.join(', ')} />
                            <DetailMeta label="Duration" value={sp.duration} />
                          </View>

                          {(sp.concentration || sp.ritual) && (
                            <Text style={s.tagsLine}>
                              {sp.concentration ? 'Concentration' : ''}
                              {sp.concentration && sp.ritual ? ' · ' : ''}
                              {sp.ritual ? 'Ritual' : ''}
                            </Text>
                          )}

                          {sp.classes.length > 0 && (
                            <Text style={s.classesLine}>Available to: {sp.classes.join(', ')}</Text>
                          )}

                          {sp.description ? (
                            <Text style={s.detailDesc}>{sp.description}</Text>
                          ) : null}

                          {(() => {
                            if (has) {
                              return (
                                <TouchableOpacity
                                  style={[s.commitBtn, s.commitBtnRemove]}
                                  onPress={onRemove ? () => { onRemove(sp.key); setExpandedKey(null); } : undefined}
                                  activeOpacity={onRemove ? 0.85 : 1}
                                >
                                  <Text style={[s.commitText, s.commitTextRemove]}>
                                    {`Remove ${sp.name}`}
                                  </Text>
                                </TouchableOpacity>
                              );
                            }
                            // Gate on the relevant bucket's limit. Cantrips
                            // and leveled spells live in separate pools so
                            // hitting one doesn't lock the other out.
                            const summary = preparedSummary;
                            const overCap = summary
                              ? sp.level === 0
                                ? summary.cantripLimit !== undefined
                                  && summary.cantripCount >= summary.cantripLimit
                                : summary.leveledLimit !== undefined
                                  && summary.leveledCount >= summary.leveledLimit
                              : false;
                            return (
                              <TouchableOpacity
                                style={[s.commitBtn, overCap && s.commitBtnDisabled]}
                                onPress={overCap ? undefined : () => commit(sp)}
                                activeOpacity={overCap ? 1 : 0.85}
                              >
                                <Text style={[s.commitText, overCap && s.commitTextDisabled]}>
                                  {overCap
                                    ? `${sp.level === 0 ? 'Cantrip' : 'Spellbook'} limit reached`
                                    : `Add ${sp.name}`}
                                </Text>
                              </TouchableOpacity>
                            );
                          })()}
                        </View>
                      ) : null}
                    </View>
                    );
                  }
                  return out;
                })()}
              </ScrollView>
            </>
          )}
        </Pressable>
      </Pressable>

      {/* Level filter dropdown — popover-style modal anchored visually
          to the filter button. Single-select; "All Levels" resets. */}
      <Modal
        visible={filterMenuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setFilterMenuOpen(false)}
      >
        <Pressable style={s.menuBackdrop} onPress={() => setFilterMenuOpen(false)}>
          <Pressable style={s.menuCard} onPress={() => {}}>
            <FilterMenuItem
              label="All Levels"
              active={levelFilter === 'all'}
              onPress={() => { setLevelFilter('all'); setFilterMenuOpen(false); }}
            />
            {availableLevels.map((lvl) => (
              <FilterMenuItem
                key={lvl}
                label={lvl === 0 ? 'Cantrips' : `${LEVEL_LABELS[lvl] ?? String(lvl)} level`}
                active={levelFilter === lvl}
                onPress={() => { setLevelFilter(lvl); setFilterMenuOpen(false); }}
              />
            ))}
          </Pressable>
        </Pressable>
      </Modal>

    </Modal>
  );
}

// Level filter dropdown — uses a native HTML <select> on web for the
// real OS dropdown UI (proper keyboard navigation, no popover-clipping
// at modal edges, no extra Modal stacking). On native (iOS/Android)
// there's no equivalent primitive, so it falls through to opening the
// popover Modal the parent owns.
function LevelFilterDropdown({
  value, availableLevels, onChange, onOpenNativeMenu, label,
}: {
  value: number | 'all';
  availableLevels: number[];
  onChange: (next: number | 'all') => void;
  onOpenNativeMenu: () => void;
  label: string;
}) {
  if (Platform.OS === 'web') {
    return (
      <View style={s.filterBtn}>
        <Text style={s.filterBtnLabel} numberOfLines={1}>{label}</Text>
        <MaterialCommunityIcons name="chevron-down" size={16} color={colors.onSurfaceVariant} />
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        {(() => {
          const Select = 'select' as any;
          const Option = 'option' as any;
          return (
            <Select
              style={s.htmlSelect}
              value={value === 'all' ? 'all' : String(value)}
              onChange={(e: { target: { value: string } }) => {
                const v = e.target.value;
                onChange(v === 'all' ? 'all' : parseInt(v, 10));
              }}
            >
              <Option value="all">All Levels</Option>
              {availableLevels.map((lvl) => (
                <Option key={lvl} value={String(lvl)}>
                  {lvl === 0 ? 'Cantrips' : `${LEVEL_LABELS[lvl] ?? String(lvl)} level`}
                </Option>
              ))}
            </Select>
          );
        })()}
      </View>
    );
  }
  return (
    <TouchableOpacity style={s.filterBtn} onPress={onOpenNativeMenu} activeOpacity={0.75}>
      <Text style={s.filterBtnLabel} numberOfLines={1}>{label}</Text>
      <MaterialCommunityIcons name="chevron-down" size={16} color={colors.onSurfaceVariant} />
    </TouchableOpacity>
  );
}

/**
 * Class-scope dropdown — three flavors of value: 'mine' (default,
 * limits to the player's classes), <class name> (single class), and
 * 'all' (no class filter). Replaces the old icon-only scope toggle +
 * conditional class filter pair so the row no longer wraps when the
 * scope changes.
 */
function ClassScopeDropdown({
  value, options, onChange,
}: {
  value: string | 'mine' | 'all';
  options: string[];
  onChange: (next: string | 'mine' | 'all') => void;
}) {
  const label = value === 'mine' ? 'My Classes' : value === 'all' ? 'All Classes' : value;
  if (Platform.OS === 'web') {
    return (
      <View style={s.filterBtn}>
        <Text style={s.filterBtnLabel} numberOfLines={1}>{label}</Text>
        <MaterialCommunityIcons name="chevron-down" size={16} color={colors.onSurfaceVariant} />
        {(() => {
          const Select = 'select' as any;
          const Option = 'option' as any;
          return (
            <Select
              style={s.htmlSelect}
              value={value}
              onChange={(e: { target: { value: string } }) => onChange(e.target.value as string | 'mine' | 'all')}
            >
              <Option value="mine">My Classes</Option>
              {options.map((opt) => (
                <Option key={opt} value={opt}>{opt}</Option>
              ))}
              <Option value="all">All Classes</Option>
            </Select>
          );
        })()}
      </View>
    );
  }
  return (
    <View style={s.filterBtn}>
      <Text style={s.filterBtnLabel} numberOfLines={1}>{label}</Text>
      <MaterialCommunityIcons name="chevron-down" size={16} color={colors.onSurfaceVariant} />
    </View>
  );
}

function StringFilterDropdown({
  value, options, onChange, allLabel,
}: {
  value: string | 'all';
  options: string[];
  onChange: (next: string | 'all') => void;
  allLabel: string;
}) {
  if (Platform.OS === 'web') {
    return (
      <View style={s.filterBtn}>
        <Text style={s.filterBtnLabel} numberOfLines={1}>{value === 'all' ? allLabel : value}</Text>
        <MaterialCommunityIcons name="chevron-down" size={16} color={colors.onSurfaceVariant} />
        {(() => {
          const Select = 'select' as any;
          const Option = 'option' as any;
          return (
            <Select
              style={s.htmlSelect}
              value={value}
              onChange={(e: { target: { value: string } }) => onChange(e.target.value === 'all' ? 'all' : e.target.value)}
            >
              <Option value="all">{allLabel}</Option>
              {options.map((opt) => (
                <Option key={opt} value={opt}>{opt}</Option>
              ))}
            </Select>
          );
        })()}
      </View>
    );
  }
  return (
    <View style={s.filterBtn}>
      <Text style={s.filterBtnLabel} numberOfLines={1}>{value === 'all' ? allLabel : value}</Text>
      <MaterialCommunityIcons name="chevron-down" size={16} color={colors.onSurfaceVariant} />
    </View>
  );
}

function FilterMenuItem({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[s.menuItem, active && s.menuItemActive]} onPress={onPress} activeOpacity={0.7}>
      <Text style={[s.menuItemText, active && s.menuItemTextActive]}>{label}</Text>
      {active ? (
        <MaterialCommunityIcons name="check" size={16} color={colors.primary} />
      ) : null}
    </TouchableOpacity>
  );
}

// Short publication-source label for the right side of each row —
// "PHB", "TCE", "Aurora's Whole Realms" pack, etc. Imported entries
// carry their book code on `importSource.code`; SRD entries don't have
// a discrete book (the SRD itself is the source) so we derive a label
// from `srdVersions`. Returns null when there's nothing useful to show.
function sourceCodeFor(sp: SpellResult): string | null {
  if (sp.importSource?.code) return sp.importSource.code;
  if (sp.tier === 'homebrew' && sp.importSource?.name) return sp.importSource.name;
  if (sp.tier === 'srd') {
    const versions = sp.srdVersions ?? [];
    if (versions.length === 0) return 'SRD';
    if (versions.length === 1) {
      return versions[0] === 'SRD_2.0' ? 'SRD 5.2' : 'SRD 5.1';
    }
    return 'SRD';
  }
  return null;
}

// Inline form for one-off spell entries the catalog doesn't ship —
// DM-granted spells, homebrew lineage spells, or anything the player
// wants to track outside the standard catalog flow.
function CustomSpellForm({
  onBack,
  onCommit,
}: {
  onBack: () => void;
  onCommit: (spell: Dnd5ePreparedSpell) => void;
}) {
  const [name, setName] = useState('');
  const [level, setLevel] = useState(0);
  const [school, setSchool] = useState('');
  const [castingTime, setCastingTime] = useState('');
  const [range, setRange] = useState('');
  const [duration, setDuration] = useState('');
  const [description, setDescription] = useState('');

  const canCommit = name.trim().length > 0;

  function build(): Dnd5ePreparedSpell {
    return {
      id: `custom-spell-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: name.trim(),
      level,
      school: school.trim() || undefined,
      castingTime: castingTime.trim() || undefined,
      range: range.trim() || undefined,
      duration: duration.trim() || undefined,
      description: description.trim() || undefined,
      source: 'Custom',
    };
  }

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: spacing.lg }} keyboardShouldPersistTaps="handled">
      <Pressable onPress={onBack} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: spacing.sm }}>
        <MaterialCommunityIcons name="chevron-left" size={16} color={colors.onSurfaceVariant} />
        <Text style={{ fontSize: 13, color: colors.onSurfaceVariant, fontFamily: fonts.label, fontWeight: '600' }}>
          Back to catalog
        </Text>
      </Pressable>

      <Text style={s.customFieldLabel}>Name</Text>
      <TextInput
        style={s.customFieldInput}
        value={name}
        onChangeText={setName}
        placeholder="Spell name"
        placeholderTextColor={colors.outline}
      />

      <Text style={s.customFieldLabel}>Level</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((lv) => (
          <TouchableOpacity
            key={lv}
            onPress={() => setLevel(lv)}
            activeOpacity={0.7}
            style={[s.customLevelChip, level === lv && s.customLevelChipActive]}
          >
            <Text style={[s.customLevelChipText, level === lv && s.customLevelChipTextActive]}>
              {lv === 0 ? 'Cantrip' : String(lv)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={s.customFieldLabel}>School</Text>
      <TextInput
        style={s.customFieldInput}
        value={school}
        onChangeText={setSchool}
        placeholder="Evocation, Abjuration, …"
        placeholderTextColor={colors.outline}
      />

      <Text style={s.customFieldLabel}>Casting Time</Text>
      <TextInput
        style={s.customFieldInput}
        value={castingTime}
        onChangeText={setCastingTime}
        placeholder="1 action, 1 bonus, …"
        placeholderTextColor={colors.outline}
      />

      <Text style={s.customFieldLabel}>Range</Text>
      <TextInput
        style={s.customFieldInput}
        value={range}
        onChangeText={setRange}
        placeholder="Self, 60 ft, Touch, …"
        placeholderTextColor={colors.outline}
      />

      <Text style={s.customFieldLabel}>Duration</Text>
      <TextInput
        style={s.customFieldInput}
        value={duration}
        onChangeText={setDuration}
        placeholder="Instantaneous, 1 minute, …"
        placeholderTextColor={colors.outline}
      />

      <Text style={s.customFieldLabel}>Description</Text>
      <TextInput
        style={[s.customFieldInput, { minHeight: 80, textAlignVertical: 'top' }]}
        value={description}
        onChangeText={setDescription}
        placeholder="Effect, on-hit, save, etc."
        placeholderTextColor={colors.outline}
        multiline
      />

      <TouchableOpacity
        onPress={canCommit ? () => onCommit(build()) : undefined}
        activeOpacity={canCommit ? 0.85 : 1}
        style={[s.customCommitBtn, !canCommit && s.customCommitBtnDisabled]}
      >
        <Text style={s.customCommitText}>Add spell</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function DetailMeta({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.metaCell}>
      <Text style={s.metaLabel}>{label}</Text>
      <Text style={s.metaValue}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  card: {
    width: '100%', maxWidth: 640, maxHeight: '70%',
    backgroundColor: colors.surfaceContainer,
    borderRadius: radius.xl,
    borderWidth: 1, borderColor: colors.outlineVariant,
    padding: spacing.md,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: spacing.md, gap: spacing.sm,
  },
  title: {
    fontSize: 18, fontFamily: fonts.headline, fontWeight: '700',
    color: colors.onSurface, flex: 1, minWidth: 0,
  },
  loadingWrap: { paddingVertical: 40, alignItems: 'center' },

  searchRow: {
    marginBottom: spacing.sm,
  },
  /** Status filter chip — cycles All → Unadded → Added → All on each
   *  tap. Sits inline in the main controlsRow next to the level /
   *  class / school dropdowns. */
  statusToggleChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 7,
    borderWidth: 1, borderColor: colors.outlineVariant,
    borderRadius: radius.lg,
    alignSelf: 'flex-start',
  },
  statusToggleChipUnadded: { borderColor: colors.primary, backgroundColor: colors.primary },
  statusToggleChipAdded: { borderColor: colors.gm, backgroundColor: colors.gm },
  statusToggleText: {
    fontSize: 10, fontFamily: fonts.label, fontWeight: '700',
    letterSpacing: 1, color: colors.outline,
  },
  statusToggleTextActive: { color: colors.onPrimary },
  controlsRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    marginBottom: spacing.sm, flexWrap: 'wrap',
  },
  /** Custom-spell entry in the modal header — small primary-tinted
   *  chip next to the close button. Moved up from the filter row so
   *  the filter row carries filters only. */
  headerCustomBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 5,
    borderRadius: radius.lg,
    borderWidth: 1, borderColor: `${colors.primary}66`,
    backgroundColor: `${colors.primary}14`,
    marginRight: spacing.sm,
  },
  headerCustomText: {
    fontSize: 11, fontFamily: fonts.label, fontWeight: '700',
    color: colors.primary, letterSpacing: 0.3,
  },
  customFieldLabel: {
    fontSize: 9, fontFamily: fonts.label, fontWeight: '700',
    letterSpacing: 1.2, textTransform: 'uppercase', color: colors.outline,
    marginTop: spacing.sm, marginBottom: 4,
  },
  customFieldInput: {
    fontSize: 13, fontFamily: fonts.body, color: colors.onSurface,
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: radius.lg,
    paddingHorizontal: 12, paddingVertical: 9,
    borderWidth: 1, borderColor: colors.outlineVariant,
  },
  customLevelChip: {
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1, borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainer,
  },
  customLevelChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  customLevelChipText: { fontSize: 11, fontFamily: fonts.label, fontWeight: '700', color: colors.outline },
  customLevelChipTextActive: { color: colors.onPrimary },
  customCommitBtn: {
    marginTop: spacing.lg,
    backgroundColor: colors.primary,
    paddingVertical: 12, borderRadius: radius.lg,
    alignItems: 'center',
  },
  customCommitBtnDisabled: { backgroundColor: colors.surfaceContainerHigh },
  customCommitText: {
    fontSize: 14, fontFamily: fonts.label, fontWeight: '700',
    color: colors.onPrimary, letterSpacing: 0.5,
  },
  searchBox: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: radius.lg,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  searchInput: {
    flex: 1, fontSize: 13, fontFamily: fonts.body, color: colors.onSurface,
  },
  filterBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: radius.lg,
    paddingHorizontal: 12, paddingVertical: 9,
    borderWidth: 1, borderColor: colors.outlineVariant,
    minWidth: 140,
    // Anchor the absolutely-positioned <select> overlay (web only).
    position: 'relative',
  },
  filterBtnNarrow: { minWidth: 110 },
  summaryRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingBottom: spacing.sm, paddingHorizontal: 2,
  },
  summaryChunk: {
    fontSize: 11, fontFamily: fonts.label, fontWeight: '600',
    color: colors.outline, letterSpacing: 0.4,
  },
  // Highlight when the player is at-or-over the prep limit. Uses
  // primary instead of hpDanger because being at-limit isn't a
  // problem — it just means they can't prepare more without removing
  // one first.
  summaryChunkAtLimit: { color: colors.primary, fontWeight: '700' },
  summaryDot: {
    fontSize: 11, fontFamily: fonts.label, color: colors.outlineVariant, letterSpacing: 0.4,
  },
  // Web-only: a real <select> is layered over the styled button so the
  // browser opens its native dropdown on click while the visual chrome
  // (chevron, label, surface) stays on-brand.
  htmlSelect: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    opacity: 0, cursor: 'pointer', appearance: 'none',
    border: 0, background: 'transparent', width: '100%', height: '100%',
    color: colors.onSurface, fontSize: 12,
  } as any,
  filterBtnLabel: {
    flex: 1, fontSize: 12, fontFamily: fonts.label, fontWeight: '600',
    color: colors.onSurface, letterSpacing: 0.3,
  },

  // No maxHeight — let the ScrollView take only the space it needs.
  // The outer card's maxHeight (88%) caps the whole modal when the
  // catalog is large; on short lists the modal shrinks to fit so we
  // don't get a swathe of empty space below the last row.
  list: { flexShrink: 1 },
  rowWrap: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.outlineVariant,
  },
  // When a row is expanded the dark canvas extends up behind the row
  // header so the selected spell visually reads as one card (header +
  // detail) instead of a row sitting on top of a separate dark block.
  rowWrapExpanded: {
    backgroundColor: colors.surfaceContainerLowest,
    borderBottomColor: 'transparent',
  },
  groupHeader: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingTop: spacing.md, paddingBottom: 6, paddingHorizontal: 6,
  },
  groupHeaderText: {
    fontSize: 10, fontFamily: fonts.label, fontWeight: '700',
    letterSpacing: 1.5, color: colors.primary,
  },
  groupHeaderRule: {
    flex: 1, height: StyleSheet.hairlineWidth,
    backgroundColor: colors.outlineVariant,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: 10, paddingHorizontal: 6,
  },
  rowDisabled: { opacity: 0.5 },
  // Status circle to the left of the level badge — hollow when the
  // spell isn't prepared yet, filled with a check when it is. Provides
  // a stable left-rail glance so the player can see at-a-glance which
  // rows in the catalog are already on their sheet.
  statusCircle: {
    width: 20, height: 20, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: colors.outline,
  },
  statusCircleAdded: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  levelBadge: {
    width: 24, height: 24, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surfaceContainerHighest,
    borderWidth: 1, borderColor: colors.outlineVariant,
  },
  levelBadgeText: { fontSize: 10, fontFamily: fonts.label, fontWeight: '700', color: colors.onSurfaceVariant },
  rowName: { fontSize: 14, fontFamily: fonts.headline, fontWeight: '600', color: colors.onSurface },
  rowMeta: { fontSize: 11, fontFamily: fonts.body, color: colors.outline, marginTop: 2 },
  rowHasText: { fontSize: 11, fontFamily: fonts.label, fontWeight: '700', color: colors.outline },
  rowSource: {
    fontSize: 11, fontFamily: fonts.label, fontWeight: '600',
    color: colors.outline, letterSpacing: 0.3,
    marginRight: 4, maxWidth: 200,
  },

  // Background sits on the wrapper (`rowWrapExpanded`) so the row
  // header inherits it; the expansion just owns padding.
  expansion: {
    paddingHorizontal: 12, paddingTop: 4, paddingBottom: spacing.md,
  },

  emptyText: { paddingVertical: 24, textAlign: 'center', color: colors.outline, fontFamily: fonts.body },

  metaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  metaCell: { minWidth: 120, paddingVertical: 4 },
  metaLabel: {
    fontSize: 9, fontFamily: fonts.label, fontWeight: '700',
    letterSpacing: 1.2, textTransform: 'uppercase', color: colors.outline,
  },
  metaValue: { fontSize: 13, fontFamily: fonts.body, color: colors.onSurface, marginTop: 2 },

  tagsLine: { fontSize: 12, color: colors.primary, fontFamily: fonts.label, fontWeight: '600', marginTop: 4 },
  classesLine: { fontSize: 12, color: colors.outline, fontFamily: fonts.body, marginTop: 4, marginBottom: 8 },
  detailDesc: { fontSize: 13, color: colors.onSurfaceVariant, lineHeight: 19, marginTop: 8 },

  commitBtn: {
    marginTop: spacing.md,
    backgroundColor: colors.primary,
    paddingVertical: 11, borderRadius: radius.lg,
    alignItems: 'center',
  },
  commitBtnDisabled: { backgroundColor: colors.surfaceContainerHighest },
  commitBtnRemove: {
    backgroundColor: 'transparent',
    borderWidth: 1, borderColor: colors.hpDanger,
  },
  commitTextRemove: { color: colors.hpDanger },
  commitText: { fontSize: 13, fontFamily: fonts.label, fontWeight: '700', color: colors.onPrimary, letterSpacing: 0.5 },
  commitTextDisabled: { color: colors.outline },

  // Filter dropdown menu
  menuBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  menuCard: {
    width: '100%', maxWidth: 280,
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.outlineVariant,
    padding: 6,
  },
  menuItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 10, paddingHorizontal: 12,
    borderRadius: radius.lg,
  },
  menuItemActive: { backgroundColor: colors.surfaceContainerHighest },
  menuItemText: { fontSize: 13, fontFamily: fonts.body, color: colors.onSurfaceVariant },
  menuItemTextActive: { color: colors.onSurface, fontWeight: '600' },
});
