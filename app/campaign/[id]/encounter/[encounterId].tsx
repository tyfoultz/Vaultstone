import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, Pressable, TextInput, StyleSheet,
  ActivityIndicator, FlatList, ScrollView, Modal, Alert, Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { supabase, getActiveSession, updateEncounter, addCombatant } from '@vaultstone/api';
import { useAuthStore, useCampaignStore } from '@vaultstone/store';
import { colors, spacing, useBreakpoint } from '@vaultstone/ui';
import { getCreatureCatalog, loadCreatureByKey } from '../../../../components/creatures/creatureCache';
import { CreatureStatBlock } from '../../../../components/creatures/CreatureStatBlock';
import { SpellPinProvider } from '../../../../components/creatures/SpellTooltip';
import { PinnedSpellsOverlay, usePinnedSpells } from '../../../../components/combat/PinnedSpellsOverlay';
import type { Database, EncounterCombatant, CreatureResult } from '@vaultstone/types';

type EncounterRow = Database['public']['Tables']['encounters']['Row'];

// ---------------------------------------------------------------------------
// CR helpers
// ---------------------------------------------------------------------------

const CR_OPTIONS = [
  '0','1/8','1/4','1/2','1','2','3','4','5','6','7','8','9','10',
  '11','12','13','14','15','16','17','18','19','20','21','22','23',
  '24','25','26','27','28','29','30',
];
const CR_VALUES: Record<string, number> = { '0': 0, '1/8': 0.125, '1/4': 0.25, '1/2': 0.5 };
for (let i = 1; i <= 30; i++) CR_VALUES[String(i)] = i;

function crToNum(cr: string | number): number {
  if (typeof cr === 'number') return cr;
  return CR_VALUES[cr] ?? (parseFloat(cr) || 0);
}

function crLabel(cr: string | number): string {
  if (typeof cr === 'number') {
    if (cr === 0.125) return '1/8';
    if (cr === 0.25) return '1/4';
    if (cr === 0.5) return '1/2';
    return String(cr);
  }
  return cr;
}

// ---------------------------------------------------------------------------
// Creature type list
// ---------------------------------------------------------------------------

const CREATURE_TYPES = [
  'Aberration','Beast','Celestial','Construct','Dragon','Elemental',
  'Fey','Fiend','Giant','Humanoid','Monstrosity','Ooze','Plant','Undead',
];

// ---------------------------------------------------------------------------
// Difficulty Calculator — 2014 DMG XP budget system
// ---------------------------------------------------------------------------

const XP_THRESHOLDS: Record<number, [number, number, number, number]> = {
  1: [25, 50, 75, 100],
  2: [50, 100, 150, 200],
  3: [75, 150, 225, 400],
  4: [125, 250, 375, 500],
  5: [250, 500, 750, 1100],
  6: [300, 600, 900, 1400],
  7: [350, 750, 1100, 1700],
  8: [450, 900, 1400, 2100],
  9: [550, 1100, 1600, 2400],
  10: [600, 1200, 1900, 2800],
  11: [800, 1600, 2400, 3600],
  12: [1000, 2000, 3000, 4500],
  13: [1100, 2200, 3400, 5100],
  14: [1250, 2500, 3800, 5700],
  15: [1400, 2800, 4300, 6400],
  16: [1600, 3200, 4800, 7200],
  17: [2000, 3900, 5900, 8800],
  18: [2100, 4200, 6300, 9500],
  19: [2400, 4900, 7300, 10900],
  20: [2800, 5700, 8500, 12700],
};

const CR_XP: Record<string, number> = {
  '0': 0, '1/8': 25, '1/4': 50, '1/2': 100,
  '1': 200, '2': 450, '3': 700, '4': 1100, '5': 1800,
  '6': 2300, '7': 2900, '8': 3900, '9': 5000, '10': 5900,
  '11': 7200, '12': 8400, '13': 10000, '14': 11500, '15': 13000,
  '16': 15000, '17': 18000, '18': 20000, '19': 22000, '20': 25000,
  '21': 33000, '22': 41000, '23': 50000, '24': 62000, '25': 75000,
  '26': 90000, '27': 105000, '28': 120000, '29': 135000, '30': 155000,
};

function encounterMultiplier(monsterCount: number, partySize: number): number {
  let mult: number;
  if (monsterCount <= 1) mult = 1;
  else if (monsterCount === 2) mult = 1.5;
  else if (monsterCount <= 6) mult = 2;
  else if (monsterCount <= 10) mult = 2.5;
  else if (monsterCount <= 14) mult = 3;
  else mult = 4;
  // Adjust for party size
  if (partySize < 3) mult *= 1.5; // small party is harder
  else if (partySize >= 6) mult *= 0.5; // large party is easier
  return mult;
}

type DifficultyTier = 'trivial' | 'easy' | 'medium' | 'hard' | 'deadly';
const DIFFICULTY_COLORS: Record<DifficultyTier, string> = {
  trivial: colors.textSecondary,
  easy: colors.hpHealthy,
  medium: colors.hpWarning,
  hard: '#F97316',
  deadly: colors.hpDanger,
};

function computeDifficulty(
  combatants: EncounterCombatant[],
  catalog: CreatureResult[],
  partySize: number,
  partyLevels: number[],
): { tier: DifficultyTier; rawXP: number; adjustedXP: number; thresholds: [number, number, number, number] } {
  // Sum raw XP
  let rawXP = 0;
  let totalMonsters = 0;
  for (const c of combatants) {
    totalMonsters += c.count;
    const catalogEntry = c.creature_key ? catalog.find((cc) => cc.key === c.creature_key) : null;
    const xp = catalogEntry?.xp ?? CR_XP[crLabel(catalogEntry?.challengeRating ?? '0')] ?? 0;
    rawXP += xp * c.count;
  }

  const mult = encounterMultiplier(totalMonsters, partySize);
  const adjustedXP = Math.round(rawXP * mult);

  // Sum party thresholds
  const thresholds: [number, number, number, number] = [0, 0, 0, 0];
  for (const lvl of partyLevels) {
    const clamped = Math.max(1, Math.min(20, lvl));
    const t = XP_THRESHOLDS[clamped] ?? XP_THRESHOLDS[1];
    thresholds[0] += t[0];
    thresholds[1] += t[1];
    thresholds[2] += t[2];
    thresholds[3] += t[3];
  }

  let tier: DifficultyTier = 'trivial';
  if (adjustedXP >= thresholds[3]) tier = 'deadly';
  else if (adjustedXP >= thresholds[2]) tier = 'hard';
  else if (adjustedXP >= thresholds[1]) tier = 'medium';
  else if (adjustedXP >= thresholds[0]) tier = 'easy';

  return { tier, rawXP, adjustedXP, thresholds };
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function EncounterBuilderScreen() {
  const { id, encounterId } = useLocalSearchParams<{ id: string; encounterId: string }>();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const { campaigns } = useCampaignStore();
  const campaign = campaigns.find((c) => c.id === id) ?? null;

  const bp = useBreakpoint();
  const isWideLayout = bp.isDesktop || bp.isWide;

  // Encounter state
  const [encounter, setEncounter] = useState<EncounterRow | null>(null);
  const [encounterName, setEncounterName] = useState('');
  const [combatants, setCombatants] = useState<EncounterCombatant[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingCombat, setLoadingCombat] = useState(false);

  // Catalog state
  const [catalog, setCatalog] = useState<CreatureResult[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);

  // Filter state
  const [searchText, setSearchText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [crMin, setCrMin] = useState<string | null>(null);
  const [crMax, setCrMax] = useState<string | null>(null);
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const [selectedEnvs, setSelectedEnvs] = useState<Set<string>>(new Set());
  const [filtersExpanded, setFiltersExpanded] = useState(true);
  const [crMinOpen, setCrMinOpen] = useState(false);
  const [crMaxOpen, setCrMaxOpen] = useState(false);

  // Stat block preview
  const [previewCreature, setPreviewCreature] = useState<CreatureResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Party / difficulty state
  const [partyLevels, setPartyLevels] = useState<number[]>([]);
  const [partyLoaded, setPartyLoaded] = useState(false);
  const [manualPartySize, setManualPartySize] = useState('');
  const [manualAvgLevel, setManualAvgLevel] = useState('');
  const [useManualParty, setUseManualParty] = useState(false);

  // Pinned spells
  const { pinned, pinSpell, unpinSpell, toggleMinimize } = usePinnedSpells();

  // Debounced save
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const combatantsRef = useRef(combatants);
  combatantsRef.current = combatants;

  // Search debounce
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchText), 200);
    return () => clearTimeout(t);
  }, [searchText]);

  // ---------------------------------------------------------------------------
  // Load encounter data
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!encounterId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('encounters')
        .select('*')
        .eq('id', encounterId)
        .single();
      if (cancelled) return;
      if (data) {
        setEncounter(data as EncounterRow);
        setEncounterName(data.name);
        try {
          const c = (data.combatants as unknown as EncounterCombatant[]) ?? [];
          setCombatants(c);
          // Pre-cache creature data for combatants
          for (const cb of c) {
            if (cb.creature_key) loadCreatureByKey(cb.creature_key);
          }
        } catch {
          setCombatants([]);
        }
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [encounterId]);

  // ---------------------------------------------------------------------------
  // Load creature catalog
  // ---------------------------------------------------------------------------

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const results = await getCreatureCatalog('dnd5e');
      if (!cancelled) {
        setCatalog(results);
        setCatalogLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ---------------------------------------------------------------------------
  // Load party data for difficulty calculator
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('characters')
        .select('id, name, base_stats')
        .eq('campaign_id', id);
      if (cancelled) return;
      if (data && data.length > 0) {
        const levels = data.map((ch) => {
          const lvl = (ch.base_stats as any)?.level;
          return typeof lvl === 'number' ? Math.max(1, Math.min(20, lvl)) : 1;
        });
        setPartyLevels(levels);
      }
      setPartyLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [id]);

  // ---------------------------------------------------------------------------
  // Debounced combatant save (800ms) + flush on unmount
  // ---------------------------------------------------------------------------

  function scheduleSave(newCombatants: EncounterCombatant[]) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (encounterId) updateEncounter(encounterId, { combatants: newCombatants });
      saveTimer.current = null;
    }, 800);
  }

  useEffect(() => {
    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        if (encounterId) updateEncounter(encounterId, { combatants: combatantsRef.current });
      }
    };
  }, [encounterId]);

  // ---------------------------------------------------------------------------
  // Environment options (derived from loaded catalog)
  // ---------------------------------------------------------------------------

  const environmentOptions = useMemo(() => {
    const envSet = new Set<string>();
    for (const c of catalog) {
      if (c.environments) {
        for (const e of c.environments) envSet.add(e);
      }
    }
    return Array.from(envSet).sort();
  }, [catalog]);

  // ---------------------------------------------------------------------------
  // Filtered catalog
  // ---------------------------------------------------------------------------

  const filteredCatalog = useMemo(() => {
    const needle = debouncedSearch.toLowerCase();
    const minCr = crMin != null ? crToNum(crMin) : null;
    const maxCr = crMax != null ? crToNum(crMax) : null;
    return catalog.filter((c) => {
      if (needle && !c.name.toLowerCase().includes(needle)) return false;
      const cr = crToNum(c.challengeRating);
      if (minCr != null && cr < minCr) return false;
      if (maxCr != null && cr > maxCr) return false;
      if (selectedTypes.size > 0 && !selectedTypes.has(c.creatureType)) return false;
      if (selectedEnvs.size > 0) {
        if (!c.environments || !c.environments.some((e) => selectedEnvs.has(e))) return false;
      }
      return true;
    });
  }, [catalog, debouncedSearch, crMin, crMax, selectedTypes, selectedEnvs]);

  // ---------------------------------------------------------------------------
  // Difficulty computation
  // ---------------------------------------------------------------------------

  const difficulty = useMemo(() => {
    const totalMonsters = combatants.reduce((sum, c) => sum + c.count, 0);
    if (totalMonsters === 0) return null;

    // Determine effective party
    const manualSz = parseInt(manualPartySize, 10);
    const manualLvl = parseInt(manualAvgLevel, 10);
    const hasManual = useManualParty && manualSz > 0 && manualLvl > 0;
    const hasPartyData = partyLevels.length > 0;

    if (!hasManual && !hasPartyData) return null;

    let effectiveLevels: number[];
    let effectiveSize: number;
    if (hasManual) {
      effectiveSize = manualSz;
      const clamped = Math.max(1, Math.min(20, manualLvl));
      effectiveLevels = Array(effectiveSize).fill(clamped);
    } else {
      effectiveSize = partyLevels.length;
      effectiveLevels = partyLevels;
    }

    return {
      ...computeDifficulty(combatants, catalog, effectiveSize, effectiveLevels),
      totalMonsters,
      partySize: effectiveSize,
    };
  }, [combatants, catalog, partyLevels, useManualParty, manualPartySize, manualAvgLevel]);

  // ---------------------------------------------------------------------------
  // Roster actions
  // ---------------------------------------------------------------------------

  function addCreatureToRoster(creature: CreatureResult) {
    setCombatants((prev) => {
      const idx = prev.findIndex((m) => m.creature_key && m.creature_key === creature.key);
      let next: EncounterCombatant[];
      if (idx >= 0) {
        next = [...prev];
        next[idx] = { ...next[idx], count: next[idx].count + 1 };
      } else {
        const initMod = creature.abilityModifiers?.dex ?? 0;
        next = [...prev, {
          name: creature.name,
          creature_key: creature.key,
          count: 1,
          init_mod: initMod,
          hp_max: creature.hp,
          ac: creature.ac,
        }];
      }
      scheduleSave(next);
      return next;
    });
  }

  function adjustCount(idx: number, delta: number) {
    setCombatants((prev) => {
      const next = [...prev];
      const newCount = Math.max(0, next[idx].count + delta);
      if (newCount === 0) {
        next.splice(idx, 1);
      } else {
        next[idx] = { ...next[idx], count: newCount };
      }
      scheduleSave(next);
      return next;
    });
  }

  function removeCombatant(idx: number) {
    setCombatants((prev) => {
      const next = [...prev];
      next.splice(idx, 1);
      scheduleSave(next);
      return next;
    });
  }

  // ---------------------------------------------------------------------------
  // Encounter name save
  // ---------------------------------------------------------------------------

  function handleNameBlur() {
    const name = encounterName.trim();
    if (name && encounterId) updateEncounter(encounterId, { name });
  }

  // ---------------------------------------------------------------------------
  // Open stat block preview
  // ---------------------------------------------------------------------------

  async function openStatBlock(creature: CreatureResult | null, creatureKey?: string | null) {
    if (creature) {
      setPreviewCreature(creature);
      return;
    }
    if (!creatureKey) return;
    setPreviewLoading(true);
    const loaded = await loadCreatureByKey(creatureKey);
    setPreviewLoading(false);
    if (loaded) setPreviewCreature(loaded);
  }

  // ---------------------------------------------------------------------------
  // Load into Combat
  // ---------------------------------------------------------------------------

  async function handleLoadIntoCombat() {
    if (!id || combatants.length === 0) return;
    setLoadingCombat(true);

    // Flush any pending save first
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
      await updateEncounter(encounterId!, { combatants });
    }

    const { data: session } = await getActiveSession(id);
    if (!session) {
      if (Platform.OS === 'web') {
        window.alert('Start a session first to load an encounter into combat.');
      } else {
        Alert.alert('No Active Session', 'Start a session from the campaign page first.');
      }
      setLoadingCombat(false);
      return;
    }

    const inserts: Promise<any>[] = [];
    for (const c of combatants) {
      for (let i = 0; i < c.count; i++) {
        const name = c.count > 1 ? `${c.name} ${i + 1}` : c.name;
        inserts.push(addCombatant({
          sessionId: session.id,
          name,
          initMod: c.init_mod,
          hpMax: c.hp_max,
          ac: c.ac,
          creatureKey: c.creature_key ?? undefined,
        }));
      }
    }
    await Promise.all(inserts);
    setLoadingCombat(false);
    router.push(`/campaign/${id}/combat` as never);
  }

  // ---------------------------------------------------------------------------
  // Clear filters
  // ---------------------------------------------------------------------------

  function clearFilters() {
    setSearchText('');
    setDebouncedSearch('');
    setCrMin(null);
    setCrMax(null);
    setSelectedTypes(new Set());
    setSelectedEnvs(new Set());
  }

  const hasFilters = searchText !== '' || crMin != null || crMax != null ||
    selectedTypes.size > 0 || selectedEnvs.size > 0;

  // ---------------------------------------------------------------------------
  // Roster totals
  // ---------------------------------------------------------------------------

  const totalCreatures = combatants.reduce((sum, c) => sum + c.count, 0);

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <View style={st.center}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  function renderCatalogItem({ item: creature }: { item: CreatureResult }) {
    return (
      <Pressable
        style={st.catalogRow}
        onPress={() => openStatBlock(creature)}
      >
        <View style={{ flex: 1 }}>
          <View style={st.catalogNameRow}>
            <Text style={st.catalogName} numberOfLines={1}>{creature.name}</Text>
            <View style={st.crBadge}>
              <Text style={st.crBadgeText}>CR {crLabel(creature.challengeRating)}</Text>
            </View>
          </View>
          <Text style={st.catalogMeta} numberOfLines={1}>
            {creature.size} {creature.creatureType} · HP {creature.hp} · AC {creature.ac}
          </Text>
        </View>
        <TouchableOpacity
          style={st.addBtn}
          onPress={() => addCreatureToRoster(creature)}
          hitSlop={8}
        >
          <MaterialCommunityIcons name="plus" size={18} color={colors.brand} />
        </TouchableOpacity>
      </Pressable>
    );
  }

  function renderRosterCard(c: EncounterCombatant, idx: number) {
    const initLabel = c.init_mod >= 0 ? `+${c.init_mod}` : `${c.init_mod}`;
    return (
      <View key={`${c.creature_key ?? c.name}-${idx}`} style={[st.rosterCard, isWideLayout && st.rosterCardWide]}>
        <View style={st.rosterCardTop}>
          <Pressable style={{ flex: 1 }} onPress={() => openStatBlock(null, c.creature_key)}>
            <Text style={st.rosterName} numberOfLines={1}>{c.name}</Text>
          </Pressable>
          {c.count > 1 && (
            <View style={st.countBadge}>
              <Text style={st.countBadgeText}>x{c.count}</Text>
            </View>
          )}
          <TouchableOpacity style={st.removeBtn} onPress={() => removeCombatant(idx)} hitSlop={6}>
            <MaterialCommunityIcons name="close" size={14} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
        <Text style={st.rosterMeta}>
          CR {crLabel(combatants[idx]?.creature_key ? (catalog.find((cc) => cc.key === c.creature_key)?.challengeRating ?? '?') : '?')} · HP {c.hp_max} · AC {c.ac} · Init {initLabel}
        </Text>
        <View style={st.rosterControls}>
          <TouchableOpacity style={st.countBtn} onPress={() => adjustCount(idx, -1)}>
            <MaterialCommunityIcons name="minus" size={14} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={st.countText}>{c.count}</Text>
          <TouchableOpacity style={st.countBtn} onPress={() => adjustCount(idx, 1)}>
            <MaterialCommunityIcons name="plus" size={14} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ---------------------------------------------------------------------------
  // Difficulty Bar
  // ---------------------------------------------------------------------------

  function renderDifficultyBar() {
    const hasPartyData = partyLevels.length > 0;
    const tiers: { key: DifficultyTier; label: string }[] = [
      { key: 'easy', label: 'Easy' },
      { key: 'medium', label: 'Medium' },
      { key: 'hard', label: 'Hard' },
      { key: 'deadly', label: 'Deadly' },
    ];

    return (
      <View style={st.difficultyContainer}>
        {/* Manual override inputs */}
        <View style={st.difficultyInputRow}>
          <TouchableOpacity
            style={st.difficultyToggle}
            onPress={() => setUseManualParty((p) => !p)}
            hitSlop={4}
          >
            <MaterialCommunityIcons
              name={useManualParty ? 'checkbox-marked' : 'checkbox-blank-outline'}
              size={14}
              color={useManualParty ? colors.brand : colors.textSecondary}
            />
            <Text style={st.difficultyToggleText}>Manual</Text>
          </TouchableOpacity>
          {useManualParty && (
            <>
              <View style={st.difficultyInputWrap}>
                <Text style={st.difficultyInputLabel}>PCs</Text>
                <TextInput
                  style={st.difficultyInput}
                  value={manualPartySize}
                  onChangeText={setManualPartySize}
                  keyboardType="number-pad"
                  placeholder={hasPartyData ? String(partyLevels.length) : '4'}
                  placeholderTextColor={colors.textSecondary}
                  maxLength={2}
                />
              </View>
              <View style={st.difficultyInputWrap}>
                <Text style={st.difficultyInputLabel}>Avg Lvl</Text>
                <TextInput
                  style={st.difficultyInput}
                  value={manualAvgLevel}
                  onChangeText={setManualAvgLevel}
                  keyboardType="number-pad"
                  placeholder={hasPartyData ? String(Math.round(partyLevels.reduce((a, b) => a + b, 0) / partyLevels.length)) : '5'}
                  placeholderTextColor={colors.textSecondary}
                  maxLength={2}
                />
              </View>
            </>
          )}
        </View>

        {/* Difficulty tier chips */}
        {difficulty ? (
          <>
            <View style={st.difficultyTiers}>
              {tiers.map((t) => {
                const active = difficulty.tier === t.key;
                const tierColor = DIFFICULTY_COLORS[t.key];
                return (
                  <View
                    key={t.key}
                    style={[
                      st.difficultyTierChip,
                      active && { backgroundColor: tierColor + '33', borderColor: tierColor },
                    ]}
                  >
                    <Text
                      style={[
                        st.difficultyTierText,
                        active && { color: tierColor, fontWeight: '700' },
                      ]}
                    >
                      {active ? t.label.toUpperCase() : t.label}
                    </Text>
                  </View>
                );
              })}
            </View>
            <Text style={st.difficultyXpText}>
              XP: {difficulty.rawXP.toLocaleString()} ({difficulty.adjustedXP.toLocaleString()} adj) · {difficulty.totalMonsters} monster{difficulty.totalMonsters !== 1 ? 's' : ''} vs {difficulty.partySize} PC{difficulty.partySize !== 1 ? 's' : ''}
            </Text>
          </>
        ) : (
          <Text style={st.difficultyHint}>
            {combatants.length === 0
              ? 'Add creatures to see difficulty'
              : !partyLoaded
                ? 'Loading party data...'
                : partyLevels.length === 0 && !useManualParty
                  ? 'Enable manual mode to set party size & level'
                  : useManualParty
                    ? 'Enter party size and level above'
                    : ''}
          </Text>
        )}
      </View>
    );
  }

  // ---------------------------------------------------------------------------
  // CR Dropdown Picker
  // ---------------------------------------------------------------------------

  function CrPicker({ label, value, onSelect, open, setOpen }: {
    label: string; value: string | null;
    onSelect: (v: string | null) => void;
    open: boolean; setOpen: (v: boolean) => void;
  }) {
    return (
      <View style={st.crPickerWrap}>
        <Text style={st.filterLabel}>{label}</Text>
        <Pressable style={st.crPickerBtn} onPress={() => setOpen(!open)}>
          <Text style={st.crPickerBtnText}>{value ?? 'Any'}</Text>
          <MaterialCommunityIcons name={open ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textSecondary} />
        </Pressable>
        {open && (
          <View style={st.crDropdown}>
            <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled>
              <Pressable
                style={[st.crDropdownItem, value === null && st.crDropdownItemActive]}
                onPress={() => { onSelect(null); setOpen(false); }}
              >
                <Text style={[st.crDropdownText, value === null && st.crDropdownTextActive]}>Any</Text>
              </Pressable>
              {CR_OPTIONS.map((opt) => (
                <Pressable
                  key={opt}
                  style={[st.crDropdownItem, value === opt && st.crDropdownItemActive]}
                  onPress={() => { onSelect(opt); setOpen(false); }}
                >
                  <Text style={[st.crDropdownText, value === opt && st.crDropdownTextActive]}>{opt}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}
      </View>
    );
  }

  // ---------------------------------------------------------------------------
  // Chip row renderer (flexWrap instead of horizontal ScrollView)
  // ---------------------------------------------------------------------------

  function ChipRow({ items, selected, onToggle }: {
    items: string[]; selected: Set<string>; onToggle: (v: string) => void;
  }) {
    return (
      <View style={st.chipWrap}>
        {items.map((item) => {
          const active = selected.has(item);
          return (
            <Pressable
              key={item}
              style={[st.chip, active && st.chipActive]}
              onPress={() => onToggle(item)}
            >
              <Text style={[st.chipText, active && st.chipTextActive]}>{item}</Text>
            </Pressable>
          );
        })}
      </View>
    );
  }

  // ---------------------------------------------------------------------------
  // Stat block modal/panel
  // ---------------------------------------------------------------------------

  function renderStatBlockContent() {
    if (previewLoading) {
      return (
        <View style={st.center}>
          <ActivityIndicator color={colors.brand} />
        </View>
      );
    }
    if (!previewCreature) {
      return null;
    }
    return (
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.md }}>
        <View style={st.statBlockHeader}>
          <Text style={st.statBlockTitle}>{previewCreature.name}</Text>
          <TouchableOpacity onPress={() => setPreviewCreature(null)} hitSlop={8}>
            <MaterialCommunityIcons name="close" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
        <CreatureStatBlock creature={previewCreature} />
      </ScrollView>
    );
  }

  // ---------------------------------------------------------------------------
  // Main render
  // ---------------------------------------------------------------------------

  const showStatBlockPanel = isWideLayout && previewCreature;

  return (
    <SpellPinProvider onPin={pinSpell}>
      <View style={st.container}>
        {/* ---- HEADER ---- */}
        <View style={st.header}>
          <TouchableOpacity
            onPress={() => router.replace(`/campaign/${id}/encounters` as never)}
            style={st.headerBack}
          >
            <MaterialCommunityIcons name="arrow-left" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <TextInput
              style={st.headerNameInput}
              value={encounterName}
              onChangeText={setEncounterName}
              onBlur={handleNameBlur}
              selectTextOnFocus
              placeholder="Encounter Name"
              placeholderTextColor={colors.textSecondary}
            />
            <Text style={st.headerSubtitle} numberOfLines={1}>{campaign?.name ?? ''}</Text>
          </View>
          <TouchableOpacity
            style={[st.loadCombatBtn, (combatants.length === 0 || loadingCombat) && { opacity: 0.5 }]}
            onPress={handleLoadIntoCombat}
            disabled={combatants.length === 0 || loadingCombat}
          >
            <MaterialCommunityIcons name="sword-cross" size={16} color="#fff" />
            <Text style={st.loadCombatBtnText}>{loadingCombat ? 'Loading...' : 'Load into Combat'}</Text>
          </TouchableOpacity>
        </View>

        {/* ---- FILTER BAR ---- */}
        <View style={st.filterBar}>
          <Pressable
            style={st.filterToggle}
            onPress={() => setFiltersExpanded((p) => !p)}
          >
            <MaterialCommunityIcons name="filter-variant" size={16} color={colors.textSecondary} />
            <Text style={st.filterToggleText}>Filters</Text>
            <MaterialCommunityIcons
              name={filtersExpanded ? 'chevron-up' : 'chevron-down'}
              size={16} color={colors.textSecondary}
            />
            {hasFilters && (
              <TouchableOpacity onPress={clearFilters} hitSlop={8} style={st.clearFiltersBtn}>
                <Text style={st.clearFiltersBtnText}>Clear</Text>
              </TouchableOpacity>
            )}
          </Pressable>

          {filtersExpanded && (
            <View style={st.filterBody}>
              {/* Search */}
              <View style={st.searchRow}>
                <MaterialCommunityIcons name="magnify" size={16} color={colors.textSecondary} />
                <TextInput
                  style={st.searchInput}
                  value={searchText}
                  onChangeText={setSearchText}
                  placeholder="Search creatures..."
                  placeholderTextColor={colors.textSecondary}
                />
                {searchText !== '' && (
                  <TouchableOpacity onPress={() => setSearchText('')} hitSlop={8}>
                    <MaterialCommunityIcons name="close-circle" size={16} color={colors.textSecondary} />
                  </TouchableOpacity>
                )}
              </View>

              {/* CR Range */}
              <View style={st.crRow}>
                <CrPicker
                  label="Min CR"
                  value={crMin}
                  onSelect={setCrMin}
                  open={crMinOpen}
                  setOpen={(v) => { setCrMinOpen(v); if (v) setCrMaxOpen(false); }}
                />
                <Text style={st.crDash}>-</Text>
                <CrPicker
                  label="Max CR"
                  value={crMax}
                  onSelect={setCrMax}
                  open={crMaxOpen}
                  setOpen={(v) => { setCrMaxOpen(v); if (v) setCrMinOpen(false); }}
                />
              </View>

              {/* Creature Type chips */}
              <Text style={st.filterSectionLabel}>Creature Type</Text>
              <ChipRow
                items={CREATURE_TYPES}
                selected={selectedTypes}
                onToggle={(v) => setSelectedTypes((prev) => {
                  const next = new Set(prev);
                  if (next.has(v)) next.delete(v); else next.add(v);
                  return next;
                })}
              />

              {/* Environment chips */}
              {environmentOptions.length > 0 && (
                <>
                  <Text style={st.filterSectionLabel}>Environment</Text>
                  <ChipRow
                    items={environmentOptions}
                    selected={selectedEnvs}
                    onToggle={(v) => setSelectedEnvs((prev) => {
                      const next = new Set(prev);
                      if (next.has(v)) next.delete(v); else next.add(v);
                      return next;
                    })}
                  />
                </>
              )}
            </View>
          )}
        </View>

        {/* ---- MAIN CONTENT ---- */}
        <View style={[st.mainContent, isWideLayout && st.mainContentWide]}>
          {/* LEFT: Creature Catalog */}
          <View style={[st.catalogPanel, isWideLayout && st.catalogPanelWide]}>
            <View style={st.catalogHeader}>
              <Text style={st.panelTitle}>Creature Catalog</Text>
              <Text style={st.resultCount}>{filteredCatalog.length} creature{filteredCatalog.length !== 1 ? 's' : ''}</Text>
            </View>
            {catalogLoading ? (
              <View style={st.center}>
                <ActivityIndicator color={colors.brand} />
              </View>
            ) : (
              <FlatList
                data={filteredCatalog}
                keyExtractor={(c) => c.key}
                renderItem={renderCatalogItem}
                contentContainerStyle={{ paddingBottom: spacing.lg }}
                initialNumToRender={20}
                maxToRenderPerBatch={20}
                windowSize={11}
              />
            )}
          </View>

          {/* RIGHT: Encounter Roster */}
          <View style={[
            st.rosterPanel,
            isWideLayout && st.rosterPanelWide,
            isWideLayout && !showStatBlockPanel && { flex: 4 },
          ]}>
            <View style={st.rosterHeader}>
              <Text style={st.panelTitle}>Roster <Text style={st.rosterCount}>· {totalCreatures}</Text></Text>
              <TouchableOpacity
                style={[st.loadCombatBtnSmall, (combatants.length === 0 || loadingCombat) && { opacity: 0.5 }]}
                onPress={handleLoadIntoCombat}
                disabled={combatants.length === 0 || loadingCombat}
              >
                <MaterialCommunityIcons name="sword-cross" size={14} color="#fff" />
                <Text style={st.loadCombatBtnSmallText}>{loadingCombat ? '...' : 'Load'}</Text>
              </TouchableOpacity>
            </View>

            {/* Difficulty calculator */}
            {renderDifficultyBar()}

            <ScrollView style={{ flex: 1 }} contentContainerStyle={st.rosterGrid}>
              {combatants.length === 0 ? (
                <View style={st.rosterEmpty}>
                  <MaterialCommunityIcons name="shield-sword-outline" size={32} color={colors.textSecondary} />
                  <Text style={st.rosterEmptyText}>Add creatures from the catalog</Text>
                </View>
              ) : (
                combatants.map((c, idx) => renderRosterCard(c, idx))
              )}
            </ScrollView>
          </View>

          {/* STAT BLOCK PREVIEW - desktop: third column (only when creature selected) */}
          {showStatBlockPanel && (
            <View style={st.statBlockPanel}>
              {renderStatBlockContent()}
            </View>
          )}
        </View>

        {/* STAT BLOCK PREVIEW - mobile: Modal */}
        {!isWideLayout && (
          <Modal
            visible={!!previewCreature}
            animationType="slide"
            transparent={false}
            onRequestClose={() => setPreviewCreature(null)}
          >
            <View style={st.modalContainer}>
              {renderStatBlockContent()}
            </View>
          </Modal>
        )}

        {/* Pinned spells overlay */}
        <PinnedSpellsOverlay
          pinned={pinned}
          onUnpin={unpinSpell}
          onToggleMinimize={toggleMinimize}
        />
      </View>
    </SpellPinProvider>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1, backgroundColor: colors.background,
    alignItems: 'center', justifyContent: 'center',
  },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderBottomColor: colors.border, borderBottomWidth: 1,
    backgroundColor: colors.surface,
  },
  headerBack: { padding: 4 },
  headerNameInput: {
    fontSize: 18, fontWeight: '700', color: colors.textPrimary,
    paddingVertical: 2, paddingHorizontal: 0,
    borderBottomColor: 'transparent', borderBottomWidth: 1,
  },
  headerSubtitle: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  loadCombatBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.brand, borderRadius: 8,
    paddingHorizontal: spacing.md, paddingVertical: 8,
  },
  loadCombatBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  // Filter bar
  filterBar: {
    borderBottomColor: colors.border, borderBottomWidth: 1,
    backgroundColor: colors.surface,
  },
  filterToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: spacing.md, paddingVertical: 4,
  },
  filterToggleText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  clearFiltersBtn: {
    marginLeft: 'auto',
    paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: 4, backgroundColor: colors.border + '44',
  },
  clearFiltersBtnText: { fontSize: 11, fontWeight: '600', color: colors.textSecondary },
  filterBody: {
    paddingHorizontal: spacing.md, paddingBottom: spacing.xs, gap: 4,
  },
  filterLabel: { fontSize: 10, fontWeight: '700', color: colors.textSecondary, letterSpacing: 1, marginBottom: 2 },
  filterSectionLabel: {
    fontSize: 10, fontWeight: '700', color: colors.textSecondary,
    letterSpacing: 1, marginTop: 2,
  },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderColor: colors.border, borderWidth: 1, borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: Platform.OS === 'web' ? 5 : 7,
    backgroundColor: colors.background,
  },
  searchInput: { flex: 1, fontSize: 13, color: colors.textPrimary, padding: 0 },
  crRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  crDash: { fontSize: 14, color: colors.textSecondary, paddingBottom: 8 },
  crPickerWrap: { position: 'relative' as const, zIndex: 10 },
  crPickerBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderColor: colors.border, borderWidth: 1, borderRadius: 6,
    paddingHorizontal: 10, paddingVertical: 6,
    backgroundColor: colors.surface, minWidth: 70,
  },
  crPickerBtnText: { fontSize: 13, color: colors.textPrimary, flex: 1 },
  crDropdown: {
    position: 'absolute' as const, top: '100%', left: 0, right: 0,
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    borderRadius: 6, marginTop: 2,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 12,
    ...(Platform.OS === 'web' ? { zIndex: 100 } : { elevation: 10 }),
  },
  crDropdownItem: { paddingHorizontal: 10, paddingVertical: 6 },
  crDropdownItemActive: { backgroundColor: colors.brand + '22' },
  crDropdownText: { fontSize: 13, color: colors.textPrimary },
  crDropdownTextActive: { color: colors.brand, fontWeight: '600' },

  // Chip row — flexWrap instead of horizontal ScrollView
  chipWrap: {
    flexDirection: 'row', flexWrap: 'wrap', maxWidth: 500,
  },
  chip: {
    borderColor: colors.border, borderWidth: 1, borderRadius: 14,
    paddingHorizontal: 8, paddingVertical: 3, marginRight: 4, marginVertical: 2,
  },
  chipActive: { borderColor: colors.brand, backgroundColor: colors.brand + '22' },
  chipText: { fontSize: 11, color: colors.textSecondary },
  chipTextActive: { color: colors.brand, fontWeight: '600' },

  // Main content
  mainContent: { flex: 1 },
  mainContentWide: { flexDirection: 'row' },

  // Catalog
  catalogPanel: { flex: 1, borderBottomColor: colors.border, borderBottomWidth: 1 },
  catalogPanelWide: { flex: 2, borderBottomWidth: 0, borderRightColor: colors.border, borderRightWidth: 1 },
  catalogHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: 4,
    borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  panelTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  resultCount: { fontSize: 12, color: colors.textSecondary },
  catalogRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: 4,
    borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  catalogNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  catalogName: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },
  crBadge: {
    backgroundColor: colors.brand + '22', borderRadius: 4,
    paddingHorizontal: 5, paddingVertical: 1,
  },
  crBadgeText: { fontSize: 10, fontWeight: '700', color: colors.brand },
  catalogMeta: { fontSize: 11, color: colors.textSecondary, marginTop: 1 },
  addBtn: {
    width: 28, height: 28, borderRadius: 14,
    borderColor: colors.brand, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },

  // Roster
  rosterPanel: { flex: 1, minHeight: 200 },
  rosterPanelWide: { flex: 2, borderRightColor: colors.border, borderRightWidth: 1 },
  rosterHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: 4,
    borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rosterCount: { fontWeight: '400', color: colors.textSecondary },
  loadCombatBtnSmall: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.brand, borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  loadCombatBtnSmallText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  rosterGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    padding: spacing.xs, gap: spacing.xs,
  },
  rosterCard: {
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    borderRadius: 8, padding: spacing.xs, width: '100%' as any,
  },
  rosterCardWide: { width: 180, flexGrow: 0, flexShrink: 0 },
  rosterCardTop: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 },
  rosterName: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
  countBadge: {
    backgroundColor: colors.brand + '22', borderRadius: 4,
    paddingHorizontal: 4, paddingVertical: 1,
  },
  countBadgeText: { fontSize: 10, fontWeight: '700', color: colors.brand },
  removeBtn: { padding: 2, marginLeft: 'auto' },
  rosterMeta: { fontSize: 11, color: colors.textSecondary, marginBottom: 4 },
  rosterControls: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  countBtn: {
    width: 24, height: 24, borderRadius: 12,
    borderColor: colors.border, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.background,
  },
  countText: { fontSize: 14, fontWeight: '700', color: colors.textPrimary, minWidth: 20, textAlign: 'center' },
  rosterEmpty: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: spacing.xl, width: '100%' as any,
  },
  rosterEmptyText: { fontSize: 13, color: colors.textSecondary, marginTop: spacing.sm, fontStyle: 'italic' },

  // Difficulty calculator
  difficultyContainer: {
    paddingHorizontal: spacing.sm, paddingVertical: 4,
    borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth,
    backgroundColor: colors.background,
  },
  difficultyInputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4,
  },
  difficultyToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
  },
  difficultyToggleText: { fontSize: 10, fontWeight: '600', color: colors.textSecondary },
  difficultyInputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
  },
  difficultyInputLabel: { fontSize: 10, fontWeight: '600', color: colors.textSecondary },
  difficultyInput: {
    fontSize: 12, color: colors.textPrimary,
    borderColor: colors.border, borderWidth: 1, borderRadius: 4,
    paddingHorizontal: 4, paddingVertical: 2,
    width: 32, textAlign: 'center',
    backgroundColor: colors.surface,
  },
  difficultyTiers: {
    flexDirection: 'row', gap: 4, marginBottom: 2,
  },
  difficultyTierChip: {
    borderColor: colors.border, borderWidth: 1, borderRadius: 4,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  difficultyTierText: {
    fontSize: 10, fontWeight: '600', color: colors.textSecondary,
  },
  difficultyXpText: {
    fontSize: 10, color: colors.textSecondary, marginTop: 1,
  },
  difficultyHint: {
    fontSize: 10, color: colors.textSecondary, fontStyle: 'italic',
  },

  // Stat block panel (desktop)
  statBlockPanel: {
    flex: 2, backgroundColor: colors.background,
    borderLeftColor: colors.border, borderLeftWidth: 0,
  },
  statBlockHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  statBlockTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },

  // Modal (mobile stat block)
  modalContainer: {
    flex: 1, backgroundColor: colors.background,
    paddingTop: Platform.OS === 'ios' ? 50 : spacing.md,
  },
});
