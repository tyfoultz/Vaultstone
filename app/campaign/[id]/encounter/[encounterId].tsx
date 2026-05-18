import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, Pressable, TextInput, StyleSheet,
  ActivityIndicator, FlatList, ScrollView, Modal, Alert, Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { supabase, getActiveSession, updateEncounter, addCombatant } from '@vaultstone/api';
import { useAuthStore, useCampaignStore } from '@vaultstone/store';
import { colors, spacing, useBreakpoint } from '@vaultstone/ui';
import { getCreatureCatalog, loadCreatureByKey } from '../../../../components/creatures/creatureCache';
import { BehaviorSection } from '../../../../components/creatures/CreatureStatBlock';
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
  if (partySize < 3) mult *= 1.5;
  else if (partySize >= 6) mult *= 0.5;
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
// Ability score helpers
// ---------------------------------------------------------------------------

type AbilityKey = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
const ABILITY_KEYS: AbilityKey[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
const ABILITY_LABELS: Record<AbilityKey, string> = {
  str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA',
};

function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

function fmtSigned(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

function skillLabel(key: string): string {
  return key
    .split('_')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');
}

// ---------------------------------------------------------------------------
// EditableStatBlock
// ---------------------------------------------------------------------------

function EditableStatBlock({
  creature,
  overrides,
  onOverrideChange,
}: {
  creature: CreatureResult;
  overrides: Record<string, number | string>;
  onOverrideChange: (key: string, value: number | string) => void;
}) {
  const c = creature;

  // Resolved values (override > base)
  const resolvedAc = typeof overrides.ac === 'number' ? overrides.ac : c.ac;
  const resolvedHp = typeof overrides.hp === 'number' ? overrides.hp : c.hp;
  const resolvedSpeed = typeof overrides.speed === 'string' ? overrides.speed : c.speed;

  // Type tags for header
  const typeTags: string[] = [];
  if (c.size) typeTags.push(c.size.toUpperCase());
  if (c.creatureType) typeTags.push(c.creatureType.toUpperCase());
  if (c.alignment) typeTags.push(c.alignment.toUpperCase());

  // Skills, senses, languages (read-only)
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

  // Damage / condition (read-only)
  const resistText = c.damageResistances?.length ? c.damageResistances.join(', ') : '';
  const immuneText = c.damageImmunities?.length ? c.damageImmunities.join(', ') : '';
  const vulnText = c.damageVulnerabilities?.length ? c.damageVulnerabilities.join(', ') : '';
  const condImmText = c.conditionImmunities?.length ? c.conditionImmunities.join(', ') : '';

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.sm, paddingBottom: spacing.xl }}>
      {/* Type tags + CR */}
      <View style={sb.tagRow}>
        {typeTags.map((tag, i) => (
          <View key={i} style={sb.typeTag}>
            <Text style={sb.typeTagText}>{tag}</Text>
          </View>
        ))}
        <View style={sb.crTag}>
          <Text style={sb.crTagText}>CR {crLabel(c.challengeRating)}</Text>
        </View>
      </View>

      {/* Editable top stats: ARMOR, HP, SPEED */}
      <View style={sb.topStatRow}>
        <EditableBox
          label="ARMOR"
          value={String(resolvedAc)}
          onChangeValue={(v) => {
            const n = parseInt(v, 10);
            if (!isNaN(n)) onOverrideChange('ac', n);
          }}
          numeric
        />
        <EditableBox
          label="HP"
          value={String(resolvedHp)}
          onChangeValue={(v) => {
            const n = parseInt(v, 10);
            if (!isNaN(n)) onOverrideChange('hp', n);
          }}
          numeric
        />
        <EditableBox
          label="SPEED"
          value={resolvedSpeed}
          onChangeValue={(v) => onOverrideChange('speed', v)}
        />
      </View>

      {/* Ability Scores Table */}
      {c.abilityScores && (
        <View style={sb.abilityTable}>
          <View style={[sb.abilityRow, sb.abilityHeadRow]}>
            <Text style={[sb.abilityCell, sb.abilityNameCol, sb.abilityHeadText]}> </Text>
            <Text style={[sb.abilityCell, sb.abilityNumCol, sb.abilityHeadText]}>Score</Text>
            <Text style={[sb.abilityCell, sb.abilityNumCol, sb.abilityHeadText]}>Mod</Text>
            <Text style={[sb.abilityCell, sb.abilityNumCol, sb.abilityHeadText]}>Save</Text>
          </View>
          {ABILITY_KEYS.map((key, i) => {
            const baseScore = c.abilityScores![key];
            const resolvedScore = typeof overrides[key] === 'number' ? overrides[key] as number : baseScore;
            const mod = abilityMod(resolvedScore);
            const saveBonus = c.savingThrows?.[key];
            return (
              <View key={key} style={[sb.abilityRow, i === ABILITY_KEYS.length - 1 && sb.abilityRowLast]}>
                <Text style={[sb.abilityCell, sb.abilityNameCol, sb.abilityNameText]}>{ABILITY_LABELS[key]}</Text>
                <View style={[sb.abilityCell, sb.abilityNumCol, { alignItems: 'center' }]}>
                  <TextInput
                    style={sb.abilityInput}
                    value={String(resolvedScore)}
                    onChangeText={(v) => {
                      const n = parseInt(v, 10);
                      if (!isNaN(n)) onOverrideChange(key, n);
                    }}
                    keyboardType="number-pad"
                    selectTextOnFocus
                    maxLength={2}
                  />
                </View>
                <Text style={[sb.abilityCell, sb.abilityNumCol, sb.abilityValueText]}>{fmtSigned(mod)}</Text>
                <Text style={[sb.abilityCell, sb.abilityNumCol,
                  typeof saveBonus === 'number' ? sb.abilitySaveText : sb.abilityDashText
                ]}>
                  {typeof saveBonus === 'number' ? fmtSigned(saveBonus) : '—'}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      {/* Read-only stat lines */}
      {skillsText ? <StatLine label="Skills" value={skillsText} /> : null}
      {sensesText ? <StatLine label="Senses" value={sensesText} /> : null}
      {c.languages ? <StatLine label="Languages" value={c.languages} /> : null}
      {resistText ? <StatLine label="Resist" value={resistText} /> : null}
      {immuneText ? <StatLine label="Immune" value={immuneText} /> : null}
      {vulnText ? <StatLine label="Vuln" value={vulnText} /> : null}
      {condImmText ? <StatLine label="Cond Imm" value={condImmText} /> : null}
      {typeof c.proficiencyBonus === 'number' ? <StatLine label="Prof" value={fmtSigned(c.proficiencyBonus)} /> : null}

      {/* Traits + Actions via BehaviorSection */}
      {c.traits?.length ? <BehaviorSection label="Traits" entries={c.traits} /> : null}
      {c.actions?.length ? <BehaviorSection label="Actions" entries={c.actions} /> : null}
    </ScrollView>
  );
}

function EditableBox({ label, value, onChangeValue, numeric }: {
  label: string;
  value: string;
  onChangeValue: (v: string) => void;
  numeric?: boolean;
}) {
  return (
    <View style={sb.editBox}>
      <Text style={sb.editBoxLabel}>{label}</Text>
      <TextInput
        style={sb.editBoxInput}
        value={value}
        onChangeText={onChangeValue}
        keyboardType={numeric ? 'number-pad' : 'default'}
        selectTextOnFocus
      />
    </View>
  );
}

function StatLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={sb.statLine}>
      <Text style={sb.statLineLabel}>{label}</Text>
      <Text style={sb.statLineValue}>{value}</Text>
    </View>
  );
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
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [crMinOpen, setCrMinOpen] = useState(false);
  const [crMaxOpen, setCrMaxOpen] = useState(false);

  // Stat block slots: each holds a creature_key (or null)
  const [statSlots, setStatSlots] = useState<[string | null, string | null]>([null, null]);
  const [slotCreatures, setSlotCreatures] = useState<[CreatureResult | null, CreatureResult | null]>([null, null]);
  const [showTwoSlots, setShowTwoSlots] = useState(true);

  // Party / difficulty state
  const [partyLevels, setPartyLevels] = useState<number[]>([]);
  const [partyLoaded, setPartyLoaded] = useState(false);
  const [partyOverride, setPartyOverride] = useState(false);
  const [overrideSize, setOverrideSize] = useState('');
  const [overrideLevel, setOverrideLevel] = useState('');

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
  // Filtered catalog (name + type + environment search)
  // ---------------------------------------------------------------------------

  const filteredCatalog = useMemo(() => {
    const needle = debouncedSearch.toLowerCase();
    const minCr = crMin != null ? crToNum(crMin) : null;
    const maxCr = crMax != null ? crToNum(crMax) : null;
    return catalog.filter((c) => {
      if (needle) {
        const nameMatch = c.name.toLowerCase().includes(needle);
        const typeMatch = c.creatureType.toLowerCase().includes(needle);
        const envMatch = c.environments?.some((e) => e.toLowerCase().includes(needle)) ?? false;
        if (!nameMatch && !typeMatch && !envMatch) return false;
      }
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

  const effectiveParty = useMemo(() => {
    if (partyOverride) {
      const size = parseInt(overrideSize, 10) || 0;
      const lvl = Math.max(1, Math.min(20, parseInt(overrideLevel, 10) || 1));
      if (size > 0) return { size, levels: Array(size).fill(lvl) as number[] };
    }
    return { size: partyLevels.length, levels: partyLevels };
  }, [partyOverride, overrideSize, overrideLevel, partyLevels]);

  const difficulty = useMemo(() => {
    const totalMonsters = combatants.reduce((sum, c) => sum + c.count, 0);
    if (totalMonsters === 0 || effectiveParty.size === 0) return null;

    return {
      ...computeDifficulty(combatants, catalog, effectiveParty.size, effectiveParty.levels),
      totalMonsters,
      partySize: effectiveParty.size,
    };
  }, [combatants, catalog, effectiveParty]);

  // ---------------------------------------------------------------------------
  // Stat block slot management
  // ---------------------------------------------------------------------------

  const previewInSlot = useCallback(async (creatureKey: string) => {
    let creature = catalog.find((c) => c.key === creatureKey) ?? null;
    if (!creature) {
      creature = await loadCreatureByKey(creatureKey);
    }
    if (!creature) return;

    setStatSlots((prev) => {
      if (prev[0] === null) return [creatureKey, prev[1]];
      if (prev[1] === null && showTwoSlots) return [prev[0], creatureKey];
      return [creatureKey, prev[1]];
    });
    setSlotCreatures((prev) => {
      if (prev[0] === null) return [creature, prev[1]];
      if (prev[1] === null && showTwoSlots) return [prev[0], creature];
      return [creature, prev[1]];
    });
  }, [catalog, showTwoSlots]);

  const clearSlot = useCallback((slotIdx: 0 | 1) => {
    setStatSlots((prev) => {
      const next: [string | null, string | null] = [...prev];
      next[slotIdx] = null;
      return next;
    });
    setSlotCreatures((prev) => {
      const next: [CreatureResult | null, CreatureResult | null] = [...prev];
      next[slotIdx] = null;
      return next;
    });
  }, []);

  // ---------------------------------------------------------------------------
  // Override handler (updates combatant overrides + syncs hp_max/ac)
  // ---------------------------------------------------------------------------

  const handleOverrideChange = useCallback((creatureKey: string, key: string, value: number | string) => {
    setCombatants((prev) => {
      const idx = prev.findIndex((m) => m.creature_key === creatureKey);
      if (idx < 0) return prev;
      const next = [...prev];
      const existing = next[idx].overrides ?? {};
      const newOverrides = { ...existing, [key]: value };
      const patch: Partial<EncounterCombatant> = { overrides: newOverrides };
      if (key === 'hp' && typeof value === 'number') patch.hp_max = value;
      if (key === 'ac' && typeof value === 'number') patch.ac = value;
      next[idx] = { ...next[idx], ...patch };
      scheduleSave(next);
      return next;
    });
  }, []);

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

  function clearRoster() {
    setCombatants([]);
    scheduleSave([]);
  }

  // ---------------------------------------------------------------------------
  // Encounter name save + force save
  // ---------------------------------------------------------------------------

  function handleNameBlur() {
    const name = encounterName.trim();
    if (name && encounterId) updateEncounter(encounterId, { name });
  }

  function handleForceSave() {
    if (!encounterId) return;
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const name = encounterName.trim();
    updateEncounter(encounterId, { name: name || undefined, combatants });
  }

  // ---------------------------------------------------------------------------
  // Load into Combat
  // ---------------------------------------------------------------------------

  async function handleLoadIntoCombat() {
    if (!id || combatants.length === 0) return;
    setLoadingCombat(true);

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
  // Totals
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
        onPress={() => previewInSlot(creature.key)}
      >
        <View style={{ flex: 1 }}>
          <View style={st.catalogNameRow}>
            <Text style={st.catalogName} numberOfLines={1}>{creature.name}</Text>
            <View style={st.typeBadge}>
              <Text style={st.typeBadgeText}>{creature.creatureType.toUpperCase()}</Text>
            </View>
          </View>
          <Text style={st.catalogMeta} numberOfLines={1}>
            HP {creature.hp} {'·'} AC {creature.ac} {'·'} {creature.size}
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

  function renderRosterItem(c: EncounterCombatant, idx: number) {
    const catalogEntry = c.creature_key ? catalog.find((cc) => cc.key === c.creature_key) : null;
    const crText = catalogEntry ? crLabel(catalogEntry.challengeRating) : '?';
    return (
      <View key={`${c.creature_key ?? c.name}-${idx}`} style={st.rosterCard}>
        <View style={st.rosterCardTop}>
          <Pressable style={{ flex: 1 }} onPress={() => { if (c.creature_key) previewInSlot(c.creature_key); }}>
            <Text style={st.rosterName} numberOfLines={1}>{c.name}</Text>
          </Pressable>
          <TouchableOpacity style={st.removeBtn} onPress={() => removeCombatant(idx)} hitSlop={6}>
            <MaterialCommunityIcons name="close" size={14} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
        <Text style={st.rosterMeta}>
          CR {crText} {'·'} HP {c.hp_max} {'·'} AC {c.ac}
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
  // Difficulty bar
  // ---------------------------------------------------------------------------

  function renderDifficultyBar() {
    const tiers: { key: DifficultyTier; label: string }[] = [
      { key: 'easy', label: 'EASY' },
      { key: 'medium', label: 'MEDIUM' },
      { key: 'hard', label: 'HARD' },
      { key: 'deadly', label: 'DEADLY' },
    ];

    return (
      <View style={st.difficultyContainer}>
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
                      {t.label}
                    </Text>
                  </View>
                );
              })}
            </View>
            <Text style={st.difficultyXpText}>
              XP {difficulty.rawXP.toLocaleString()} ({difficulty.adjustedXP.toLocaleString()} adj.) {'·'} {difficulty.totalMonsters} monster{difficulty.totalMonsters !== 1 ? 's' : ''} vs {difficulty.partySize} PC{difficulty.partySize !== 1 ? 's' : ''}
            </Text>
          </>
        ) : (
          <Text style={st.difficultyHint}>
            {combatants.length === 0
              ? 'Add creatures to see difficulty'
              : !partyLoaded
                ? 'Loading party data...'
                : effectiveParty.size === 0
                  ? 'Set party info below'
                  : ''}
          </Text>
        )}
        {/* Party override controls */}
        <View style={st.partyRow}>
          <Pressable
            style={st.partyToggle}
            onPress={() => {
              const next = !partyOverride;
              setPartyOverride(next);
              if (next && !overrideSize) {
                setOverrideSize(String(partyLevels.length || 4));
                setOverrideLevel(String(
                  partyLevels.length > 0
                    ? Math.round(partyLevels.reduce((a, b) => a + b, 0) / partyLevels.length)
                    : 3,
                ));
              }
            }}
          >
            <MaterialCommunityIcons
              name={partyOverride ? 'checkbox-marked' : 'checkbox-blank-outline'}
              size={14}
              color={partyOverride ? colors.brand : colors.textSecondary}
            />
            <Text style={st.partyToggleText}>Override party</Text>
          </Pressable>
          {partyOverride && (
            <View style={st.partyInputs}>
              <TextInput
                style={st.partyInput}
                value={overrideSize}
                onChangeText={setOverrideSize}
                keyboardType="number-pad"
                placeholder="#"
                placeholderTextColor={colors.textSecondary}
                maxLength={2}
              />
              <Text style={st.partyInputLabel}>PCs ×</Text>
              <TextInput
                style={st.partyInput}
                value={overrideLevel}
                onChangeText={setOverrideLevel}
                keyboardType="number-pad"
                placeholder="Lvl"
                placeholderTextColor={colors.textSecondary}
                maxLength={2}
              />
              <Text style={st.partyInputLabel}>Lvl</Text>
            </View>
          )}
          {!partyOverride && partyLevels.length > 0 && (
            <Text style={st.partyAutoText}>
              {partyLevels.length} PCs (avg lvl {Math.round(partyLevels.reduce((a, b) => a + b, 0) / partyLevels.length)})
            </Text>
          )}
        </View>
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
        <Pressable style={st.crPickerBtn} onPress={() => setOpen(!open)}>
          <Text style={st.crPickerLabel}>{label}</Text>
          <Text style={st.crPickerBtnText}>{value ?? 'Any'}</Text>
          <MaterialCommunityIcons name={open ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textSecondary} />
        </Pressable>
        {open && (
          <Pressable
            style={st.crBackdrop}
            onPress={() => setOpen(false)}
          />
        )}
        {open && (
          <View
            style={st.crDropdown}
            {...(Platform.OS === 'web' ? { onWheel: (e: any) => e.stopPropagation() } : {})}
          >
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
  // Chip row renderer
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
  // Stat block column renderer
  // ---------------------------------------------------------------------------

  function renderStatSlot(slotIdx: 0 | 1) {
    const creatureKey = statSlots[slotIdx];
    const creature = slotCreatures[slotIdx];
    const combatant = creatureKey
      ? combatants.find((c) => c.creature_key === creatureKey)
      : null;
    const overrides = combatant?.overrides ?? {};

    return (
      <View style={[st.statBlockCol, slotIdx === 0 && st.statBlockColBorder]}>
        <View style={st.statBlockHeader}>
          <View style={st.slotBadge}>
            <Text style={st.slotBadgeText}>{slotIdx + 1}</Text>
          </View>
          {creature ? (
            <>
              <Text style={st.statBlockTitle} numberOfLines={1}>{creature.name}</Text>
              <TouchableOpacity onPress={() => clearSlot(slotIdx)} hitSlop={8} style={{ marginLeft: 'auto' }}>
                <MaterialCommunityIcons name="close" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </>
          ) : (
            <Text style={st.statBlockEmptyLabel}>Empty slot</Text>
          )}
        </View>
        {creature ? (
          <EditableStatBlock
            creature={creature}
            overrides={overrides}
            onOverrideChange={(key, value) => {
              if (creatureKey) handleOverrideChange(creatureKey, key, value);
            }}
          />
        ) : (
          <View style={st.statBlockEmpty}>
            <MaterialCommunityIcons name="shield-sword-outline" size={36} color={colors.textSecondary} />
            <Text style={st.statBlockEmptyText}>Click a creature to view stat block</Text>
          </View>
        )}
      </View>
    );
  }

  // ---------------------------------------------------------------------------
  // Mobile stat block modal
  // ---------------------------------------------------------------------------

  const mobileSlotKey = statSlots[0];
  const mobileCreature = slotCreatures[0];
  const mobileCombatant = mobileSlotKey
    ? combatants.find((c) => c.creature_key === mobileSlotKey)
    : null;

  // ---------------------------------------------------------------------------
  // Main render
  // ---------------------------------------------------------------------------

  return (
    <SpellPinProvider onPin={pinSpell}>
      <View style={st.container}>
        {/* ---- HEADER ROW ---- */}
        <View style={st.header}>
          <TouchableOpacity
            onPress={() => router.replace(`/campaign/${id}/encounters` as never)}
            style={st.headerBack}
          >
            <MaterialCommunityIcons name="arrow-left" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <View style={{ flex: 1, marginRight: spacing.sm }}>
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
            style={st.saveBtn}
            onPress={handleForceSave}
            hitSlop={8}
          >
            <Text style={st.saveBtnText}>Save</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[st.loadCombatBtn, (combatants.length === 0 || loadingCombat) && { opacity: 0.5 }]}
            onPress={handleLoadIntoCombat}
            disabled={combatants.length === 0 || loadingCombat}
          >
            <MaterialCommunityIcons name="sword-cross" size={16} color="#fff" />
            <Text style={st.loadCombatBtnText}>{loadingCombat ? 'Loading...' : 'LOAD INTO COMBAT'}</Text>
          </TouchableOpacity>
        </View>

        {/* ---- SEARCH + FILTER BAR ---- */}
        <View style={st.filterBar}>
          {/* Search row */}
          <View style={st.searchFilterRow}>
            <View style={st.searchRow}>
              <MaterialCommunityIcons name="magnify" size={16} color={colors.textSecondary} />
              <TextInput
                style={st.searchInput}
                value={searchText}
                onChangeText={setSearchText}
                placeholder={`Search ${catalog.length} creatures by name, type, environment...`}
                placeholderTextColor={colors.textSecondary}
              />
              {searchText !== '' && (
                <TouchableOpacity onPress={() => setSearchText('')} hitSlop={8}>
                  <MaterialCommunityIcons name="close-circle" size={16} color={colors.textSecondary} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* CR range + Filters toggle + View toggle */}
          <View style={st.controlsRow}>
            <Text style={st.controlLabel}>CR</Text>
            <CrPicker
              label="Min"
              value={crMin}
              onSelect={setCrMin}
              open={crMinOpen}
              setOpen={(v) => { setCrMinOpen(v); if (v) setCrMaxOpen(false); }}
            />
            <Text style={st.crDash}>-</Text>
            <CrPicker
              label="Max"
              value={crMax}
              onSelect={setCrMax}
              open={crMaxOpen}
              setOpen={(v) => { setCrMaxOpen(v); if (v) setCrMinOpen(false); }}
            />

            <Pressable
              style={[st.filterToggle, filtersExpanded && st.filterToggleActive]}
              onPress={() => setFiltersExpanded((p) => !p)}
            >
              <MaterialCommunityIcons name="filter-variant" size={14} color={filtersExpanded ? colors.brand : colors.textSecondary} />
              <Text style={[st.filterToggleText, filtersExpanded && { color: colors.brand }]}>Filters</Text>
            </Pressable>

            {hasFilters && (
              <TouchableOpacity onPress={clearFilters} hitSlop={8} style={st.clearFiltersBtn}>
                <Text style={st.clearFiltersBtnText}>Clear</Text>
              </TouchableOpacity>
            )}

            <View style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 2 }}>
              <TouchableOpacity
                style={[st.viewToggleBtn, !showTwoSlots && st.viewToggleBtnActive]}
                onPress={() => setShowTwoSlots(false)}
                hitSlop={4}
              >
                <MaterialCommunityIcons name="view-agenda-outline" size={14} color={!showTwoSlots ? colors.brand : colors.textSecondary} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[st.viewToggleBtn, showTwoSlots && st.viewToggleBtnActive]}
                onPress={() => setShowTwoSlots(true)}
                hitSlop={4}
              >
                <MaterialCommunityIcons name="view-column-outline" size={14} color={showTwoSlots ? colors.brand : colors.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Expanded filter chips */}
          {filtersExpanded && (
            <View style={st.filterChipsContainer}>
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

        {/* ---- MAIN 4-COLUMN CONTENT ---- */}
        {isWideLayout ? (
          <View style={st.mainContentWide}>
            {/* Column 1: Creature Catalog */}
            <View style={st.catalogCol}>
              <View style={st.colHeader}>
                <Text style={st.panelTitle}>Creature Catalog</Text>
                <View style={st.countBadge}>
                  <Text style={st.countBadgeText}>{filteredCatalog.length} of {catalog.length}</Text>
                </View>
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

            {/* Column 2: Roster + Difficulty */}
            <View style={st.rosterCol}>
              <View style={st.colHeader}>
                <Text style={st.panelTitle}>Roster <Text style={st.rosterCountText}>{'·'} {totalCreatures}</Text></Text>
                {combatants.length > 0 && (
                  <TouchableOpacity onPress={clearRoster} hitSlop={8}>
                    <Text style={st.clearBtnText}>Clear</Text>
                  </TouchableOpacity>
                )}
              </View>
              {renderDifficultyBar()}
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.xs, gap: spacing.xs }}>
                {combatants.length === 0 ? (
                  <View style={st.rosterEmpty}>
                    <MaterialCommunityIcons name="shield-sword-outline" size={32} color={colors.textSecondary} />
                    <Text style={st.rosterEmptyText}>Add creatures from the catalog</Text>
                  </View>
                ) : (
                  combatants.map((c, idx) => renderRosterItem(c, idx))
                )}
              </ScrollView>
            </View>

            {/* Column 3: Stat Block 1 */}
            {renderStatSlot(0)}

            {/* Column 4: Stat Block 2 (only when showTwoSlots) */}
            {showTwoSlots && renderStatSlot(1)}
          </View>
        ) : (
          /* ---- MOBILE / NARROW LAYOUT ---- */
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: spacing.xl }}>
            {/* Catalog */}
            <View style={st.mobileCatalog}>
              <View style={st.colHeader}>
                <Text style={st.panelTitle}>Creature Catalog</Text>
                <View style={st.countBadge}>
                  <Text style={st.countBadgeText}>{filteredCatalog.length} of {catalog.length}</Text>
                </View>
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
                  contentContainerStyle={{ paddingBottom: spacing.sm }}
                  initialNumToRender={20}
                  maxToRenderPerBatch={20}
                  windowSize={11}
                  style={{ maxHeight: 400 }}
                  nestedScrollEnabled
                />
              )}
            </View>

            {/* Roster */}
            <View style={st.mobileRoster}>
              <View style={st.colHeader}>
                <Text style={st.panelTitle}>Roster <Text style={st.rosterCountText}>{'·'} {totalCreatures}</Text></Text>
                {combatants.length > 0 && (
                  <TouchableOpacity onPress={clearRoster} hitSlop={8}>
                    <Text style={st.clearBtnText}>Clear</Text>
                  </TouchableOpacity>
                )}
              </View>
              {renderDifficultyBar()}
              {combatants.length === 0 ? (
                <View style={st.rosterEmpty}>
                  <MaterialCommunityIcons name="shield-sword-outline" size={32} color={colors.textSecondary} />
                  <Text style={st.rosterEmptyText}>Add creatures from the catalog</Text>
                </View>
              ) : (
                combatants.map((c, idx) => renderRosterItem(c, idx))
              )}
            </View>
          </ScrollView>
        )}

        {/* Mobile stat block modal */}
        {!isWideLayout && (
          <Modal
            visible={!!mobileCreature}
            animationType="slide"
            transparent={false}
            onRequestClose={() => clearSlot(0)}
          >
            <View style={st.modalContainer}>
              <View style={st.modalHeader}>
                <Text style={st.statBlockTitle} numberOfLines={1}>{mobileCreature?.name ?? ''}</Text>
                <TouchableOpacity onPress={() => clearSlot(0)} hitSlop={8}>
                  <MaterialCommunityIcons name="close" size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
              {mobileCreature && (
                <EditableStatBlock
                  creature={mobileCreature}
                  overrides={mobileCombatant?.overrides ?? {}}
                  onOverrideChange={(key, value) => {
                    if (mobileSlotKey) handleOverrideChange(mobileSlotKey, key, value);
                  }}
                />
              )}
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
// Stat block styles
// ---------------------------------------------------------------------------

const sb = StyleSheet.create({
  tagRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: spacing.sm,
  },
  typeTag: {
    backgroundColor: colors.border + '44', borderRadius: 4,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  typeTagText: {
    fontSize: 9, fontWeight: '700', color: colors.textSecondary, letterSpacing: 0.5,
  },
  crTag: {
    backgroundColor: colors.brand + '22', borderRadius: 4,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  crTagText: {
    fontSize: 9, fontWeight: '700', color: colors.brand, letterSpacing: 0.5,
  },

  topStatRow: {
    flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm,
  },
  editBox: {
    flex: 1, alignItems: 'center',
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    borderRadius: 8, paddingVertical: 6, paddingHorizontal: 4,
  },
  editBoxLabel: {
    fontSize: 9, fontWeight: '700', color: colors.textSecondary,
    letterSpacing: 1, marginBottom: 2,
  },
  editBoxInput: {
    fontSize: 16, fontWeight: '700', color: colors.textPrimary,
    textAlign: 'center', padding: 0, minWidth: 40,
  },

  abilityTable: {
    borderWidth: 1, borderColor: colors.border + '88', borderRadius: 8,
    overflow: 'hidden', backgroundColor: colors.surface, marginBottom: spacing.sm,
  },
  abilityRow: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border + '66',
  },
  abilityRowLast: { borderBottomWidth: 0 },
  abilityHeadRow: { backgroundColor: colors.background },
  abilityCell: {
    paddingHorizontal: 6, paddingVertical: 5, textAlign: 'center',
    fontSize: 11,
  },
  abilityNameCol: { width: 48 },
  abilityNumCol: { flex: 1, textAlign: 'center', justifyContent: 'center' },
  abilityHeadText: {
    fontSize: 9, fontWeight: '700', color: colors.textSecondary,
    letterSpacing: 1, textAlign: 'center',
  },
  abilityNameText: {
    fontSize: 10, fontWeight: '700', color: colors.textSecondary,
    letterSpacing: 1,
  },
  abilityValueText: { fontSize: 12, color: colors.textPrimary, textAlign: 'center' },
  abilitySaveText: { fontSize: 12, color: colors.brand, textAlign: 'center' },
  abilityDashText: { fontSize: 12, color: colors.textSecondary, textAlign: 'center' },
  abilityInput: {
    fontSize: 12, fontWeight: '600', color: colors.textPrimary,
    textAlign: 'center', padding: 0, minWidth: 28,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },

  statLine: {
    flexDirection: 'row', paddingVertical: 3, gap: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border + '44',
  },
  statLineLabel: {
    fontSize: 10, fontWeight: '700', color: colors.textSecondary,
    letterSpacing: 1, width: 70, textTransform: 'uppercase',
  },
  statLineValue: { fontSize: 12, color: colors.textPrimary, flex: 1 },
});

// ---------------------------------------------------------------------------
// Main styles
// ---------------------------------------------------------------------------

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1, backgroundColor: colors.background,
    alignItems: 'center', justifyContent: 'center',
  },

  // ---- Header ----
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
  saveBtn: {
    borderColor: colors.border, borderWidth: 1, borderRadius: 6,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  saveBtnText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  loadCombatBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.brand, borderRadius: 8,
    paddingHorizontal: spacing.md, paddingVertical: 8,
  },
  loadCombatBtnText: { color: '#fff', fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },

  // ---- Filter bar ----
  filterBar: {
    borderBottomColor: colors.border, borderBottomWidth: 1,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs, gap: 6,
  },
  searchFilterRow: {
    flexDirection: 'row', gap: spacing.sm,
  },
  searchRow: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6,
    borderColor: colors.border, borderWidth: 1, borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: Platform.OS === 'web' ? 5 : 7,
    backgroundColor: colors.background,
  },
  searchInput: { flex: 1, fontSize: 13, color: colors.textPrimary, padding: 0 },

  controlsRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap',
    zIndex: 10,
  },
  controlLabel: {
    fontSize: 11, fontWeight: '700', color: colors.textSecondary, letterSpacing: 1,
  },
  crDash: { fontSize: 14, color: colors.textSecondary },
  crPickerWrap: { position: 'relative' as const, zIndex: 10 },
  crBackdrop: {
    position: 'absolute' as const, top: 0, left: -1000, right: -1000,
    bottom: -1000, zIndex: 99,
  },
  crPickerBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    borderColor: colors.border, borderWidth: 1, borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 5,
    backgroundColor: '#333537', minWidth: 70,
  },
  crPickerLabel: { fontSize: 10, fontWeight: '600', color: colors.textSecondary, marginRight: 2 },
  crPickerBtnText: { fontSize: 12, color: colors.textPrimary, flex: 1 },
  crDropdown: {
    position: 'absolute' as const, top: '100%', left: 0, right: 0,
    backgroundColor: '#333537', borderColor: colors.border, borderWidth: 1,
    borderRadius: 6, marginTop: 2,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 12,
    ...(Platform.OS === 'web' ? { zIndex: 100, boxShadow: '0 4px 16px rgba(0,0,0,0.6)' } as never : { elevation: 10 }),
  },
  crDropdownItem: { paddingHorizontal: 10, paddingVertical: 5 },
  crDropdownItemActive: { backgroundColor: colors.brand + '22' },
  crDropdownText: { fontSize: 12, color: colors.textPrimary },
  crDropdownTextActive: { color: colors.brand, fontWeight: '600' },

  filterToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderColor: colors.border, borderWidth: 1, borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 5,
  },
  filterToggleActive: { borderColor: colors.brand + '44' },
  filterToggleText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  clearFiltersBtn: {
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 4, backgroundColor: colors.border + '44',
  },
  clearFiltersBtnText: { fontSize: 11, fontWeight: '600', color: colors.textSecondary },

  viewToggleBtn: {
    padding: 5, borderRadius: 4,
  },
  viewToggleBtnActive: {
    backgroundColor: colors.brand + '22',
  },

  filterChipsContainer: {
    paddingTop: 4, gap: 4,
  },
  filterSectionLabel: {
    fontSize: 10, fontWeight: '700', color: colors.textSecondary,
    letterSpacing: 1,
  },
  chipWrap: {
    flexDirection: 'row', flexWrap: 'wrap', maxWidth: 600,
  },
  chip: {
    borderColor: colors.border, borderWidth: 1, borderRadius: 14,
    paddingHorizontal: 8, paddingVertical: 3, marginRight: 4, marginVertical: 2,
  },
  chipActive: { borderColor: colors.brand, backgroundColor: colors.brand + '22' },
  chipText: { fontSize: 11, color: colors.textSecondary },
  chipTextActive: { color: colors.brand, fontWeight: '600' },

  // ---- Main 4-column layout ----
  mainContentWide: {
    flex: 1, flexDirection: 'row',
  },

  // Column 1: Catalog
  catalogCol: {
    flex: 1, borderRightColor: colors.border, borderRightWidth: 1,
  },
  colHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.sm, paddingVertical: 4,
    borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  panelTitle: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
  countBadge: {
    backgroundColor: colors.border + '44', borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 1,
  },
  countBadgeText: { fontSize: 10, fontWeight: '600', color: colors.textSecondary },

  catalogRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.sm, paddingVertical: 3,
    borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  catalogNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  catalogName: { fontSize: 12, fontWeight: '600', color: colors.textPrimary },
  typeBadge: {
    backgroundColor: colors.border + '55', borderRadius: 3,
    paddingHorizontal: 4, paddingVertical: 1,
  },
  typeBadgeText: { fontSize: 8, fontWeight: '700', color: colors.textSecondary, letterSpacing: 0.5 },
  catalogMeta: { fontSize: 10, color: colors.textSecondary, marginTop: 1 },
  addBtn: {
    width: 26, height: 26, borderRadius: 13,
    borderColor: colors.brand, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },

  // Column 2: Roster
  rosterCol: {
    flex: 1, borderRightColor: colors.border, borderRightWidth: 1,
  },
  rosterCountText: { fontWeight: '400', color: colors.textSecondary },
  clearBtnText: { fontSize: 11, fontWeight: '600', color: colors.hpDanger },

  rosterCard: {
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    borderRadius: 6, padding: spacing.xs,
  },
  rosterCardTop: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 },
  rosterName: { fontSize: 12, fontWeight: '700', color: colors.textPrimary },
  removeBtn: { padding: 2, marginLeft: 'auto' },
  rosterMeta: { fontSize: 10, color: colors.textSecondary, marginBottom: 4 },
  rosterControls: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  countBtn: {
    width: 22, height: 22, borderRadius: 11,
    borderColor: colors.border, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.background,
  },
  countText: { fontSize: 13, fontWeight: '700', color: colors.textPrimary, minWidth: 18, textAlign: 'center' },
  rosterEmpty: {
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: spacing.xl,
  },
  rosterEmptyText: { fontSize: 12, color: colors.textSecondary, marginTop: spacing.sm, fontStyle: 'italic' },

  // Difficulty
  difficultyContainer: {
    paddingHorizontal: spacing.sm, paddingVertical: 4,
    borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth,
    backgroundColor: colors.background,
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
  partyRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 4, flexWrap: 'wrap',
  },
  partyToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
  },
  partyToggleText: { fontSize: 10, color: colors.textSecondary },
  partyInputs: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
  },
  partyInput: {
    width: 32, textAlign: 'center' as const,
    backgroundColor: colors.background, borderColor: colors.border,
    borderWidth: 1, borderRadius: 4,
    paddingVertical: 2, paddingHorizontal: 4,
    fontSize: 11, fontWeight: '700' as const, color: colors.textPrimary,
  },
  partyInputLabel: { fontSize: 10, color: colors.textSecondary },
  partyAutoText: { fontSize: 10, color: colors.textSecondary, fontStyle: 'italic' as const },

  // Stat block columns (3 & 4)
  statBlockCol: {
    flex: 1,
  },
  statBlockColBorder: {
    borderRightColor: colors.border, borderRightWidth: 1,
  },
  statBlockHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: spacing.sm, paddingVertical: 4,
    borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth,
    backgroundColor: colors.surface,
  },
  slotBadge: {
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: colors.brand + '33', alignItems: 'center', justifyContent: 'center',
  },
  slotBadgeText: { fontSize: 10, fontWeight: '700', color: colors.brand },
  statBlockTitle: { fontSize: 13, fontWeight: '700', color: colors.textPrimary, flex: 1 },
  statBlockEmptyLabel: { fontSize: 12, color: colors.textSecondary, fontStyle: 'italic' },
  statBlockEmpty: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  statBlockEmptyText: { fontSize: 12, color: colors.textSecondary, fontStyle: 'italic', textAlign: 'center' },

  // Mobile layout
  mobileCatalog: {
    borderBottomColor: colors.border, borderBottomWidth: 1,
  },
  mobileRoster: {
    paddingHorizontal: spacing.xs, gap: spacing.xs, paddingVertical: spacing.xs,
  },

  // Modal (mobile stat block)
  modalContainer: {
    flex: 1, backgroundColor: colors.background,
    paddingTop: Platform.OS === 'ios' ? 50 : spacing.md,
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderBottomColor: colors.border, borderBottomWidth: 1,
    backgroundColor: colors.surface,
  },
});
