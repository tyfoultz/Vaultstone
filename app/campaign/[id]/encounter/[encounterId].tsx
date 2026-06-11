import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, Pressable, TextInput, StyleSheet,
  ActivityIndicator, FlatList, ScrollView, Modal, Alert, Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

let createPortal: typeof import('react-dom').createPortal | undefined;
if (Platform.OS === 'web') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  createPortal = require('react-dom').createPortal;
}
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { supabase, getActiveSession, getInitiativeOrder, updateEncounter, addCombatant, clearAllCombatants } from '@vaultstone/api';
import { useAuthStore, useCampaignStore } from '@vaultstone/store';
import { colors, fonts, spacing, radius, useBreakpoint } from '@vaultstone/ui';
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
  trivial: colors.onSurfaceVariant,
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

  // Roster rename — which roster index has its individual names expanded
  const [renameIdx, setRenameIdx] = useState<number | null>(null);

  // Pinned spells
  const { pinned, pinSpell, unpinSpell, toggleMinimize } = usePinnedSpells();

  // Debounced save
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const combatantsRef = useRef(combatants);
  const crDropPosRef = useRef({ top: 0, left: 0, width: 80 });
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
      // The campaign's system id decides which edition's packs + SRD
      // entries the catalog includes (a 2014 campaign must see
      // dnd5e_2014 imports). Fall back to fetching it directly when the
      // campaign store hasn't hydrated (e.g. deep link).
      let systemId = campaign?.system;
      if (!systemId && id) {
        const { data } = await supabase
          .from('campaigns')
          .select('system')
          .eq('id', id)
          .single();
        systemId = data?.system;
      }
      const results = await getCreatureCatalog(systemId ?? 'dnd5e');
      if (!cancelled) {
        setCatalog(results);
        setCatalogLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id, campaign?.system]);

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

    const { data: existing } = await getInitiativeOrder(session.id);
    if (existing && existing.length > 0) {
      const confirmed = Platform.OS === 'web'
        ? window.confirm(
            `There are ${existing.length} combatant(s) in the tracker. Replace them with this encounter?`,
          )
        : await new Promise<boolean>((resolve) => {
            Alert.alert(
              'Replace Combatants?',
              `There are ${existing.length} combatant(s) already in the tracker. Loading this encounter will replace them.`,
              [
                { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
                { text: 'Replace', style: 'destructive', onPress: () => resolve(true) },
              ],
            );
          });
      if (!confirmed) {
        setLoadingCombat(false);
        return;
      }
      await clearAllCombatants(session.id);
    }

    const inserts: Promise<any>[] = [];
    for (const c of combatants) {
      for (let i = 0; i < c.count; i++) {
        const name = c.individualNames?.[i]
          || (c.count > 1 ? `${c.name} ${i + 1}` : c.name);
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
        <ActivityIndicator color={colors.primary} />
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
            {creature.importSource?.code ? (
              <View style={st.srdBadge}>
                <Text style={st.srdBadgeText}>{creature.importSource.code}</Text>
              </View>
            ) : null}
            <View style={st.crTag}>
              <Text style={st.crTagText}>CR {crLabel(creature.challengeRating)}</Text>
            </View>
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
          <MaterialCommunityIcons name="plus" size={18} color={colors.primary} />
        </TouchableOpacity>
      </Pressable>
    );
  }

  function handleIndividualNameChange(rosterIdx: number, copyIdx: number, value: string) {
    setCombatants((prev) => {
      const next = [...prev];
      const entry = { ...next[rosterIdx] };
      const names = [...(entry.individualNames ?? [])];
      while (names.length < entry.count) names.push('');
      names[copyIdx] = value;
      entry.individualNames = names;
      next[rosterIdx] = entry;
      scheduleSave(next);
      return next;
    });
  }

  function renderRosterItem(c: EncounterCombatant, idx: number) {
    const catalogEntry = c.creature_key ? catalog.find((cc) => cc.key === c.creature_key) : null;
    const crText = catalogEntry ? crLabel(catalogEntry.challengeRating) : '?';
    const isRenaming = renameIdx === idx;
    return (
      <View key={`${c.creature_key ?? c.name}-${idx}`} style={st.rosterCard}>
        <View style={st.rosterCardTop}>
          <Pressable style={{ flex: 1 }} onPress={() => { if (c.creature_key) previewInSlot(c.creature_key); }}>
            <Text style={st.rosterName} numberOfLines={1}>{c.name}</Text>
          </Pressable>
          <TouchableOpacity
            style={st.renameBtn}
            onPress={() => setRenameIdx(isRenaming ? null : idx)}
            hitSlop={6}
          >
            <MaterialCommunityIcons
              name={isRenaming ? 'chevron-up' : 'pencil'}
              size={12}
              color={isRenaming ? colors.primary : colors.outline}
            />
          </TouchableOpacity>
          <TouchableOpacity style={st.removeBtn} onPress={() => removeCombatant(idx)} hitSlop={6}>
            <MaterialCommunityIcons name="close" size={14} color={colors.outline} />
          </TouchableOpacity>
        </View>
        <Text style={st.rosterMeta}>
          CR {crText} {'·'} HP {c.hp_max} {'·'} AC {c.ac}
        </Text>
        <View style={st.rosterControls}>
          <TouchableOpacity style={st.countBtn} onPress={() => adjustCount(idx, -1)}>
            <MaterialCommunityIcons name="minus" size={14} color={colors.onSurface} />
          </TouchableOpacity>
          <Text style={st.countText}>{c.count}</Text>
          <TouchableOpacity style={st.countBtn} onPress={() => adjustCount(idx, 1)}>
            <MaterialCommunityIcons name="plus" size={14} color={colors.onSurface} />
          </TouchableOpacity>
        </View>
        {isRenaming && c.count > 0 && (
          <View style={st.individualNamesWrap}>
            {Array.from({ length: c.count }, (_, i) => (
              <View key={i} style={st.individualNameRow}>
                <Text style={st.individualNameLabel}>{i + 1}</Text>
                <TextInput
                  style={st.individualNameInput}
                  value={c.individualNames?.[i] ?? ''}
                  onChangeText={(v) => handleIndividualNameChange(idx, i, v)}
                  placeholder={c.count > 1 ? `${c.name} ${i + 1}` : c.name}
                  placeholderTextColor={colors.onSurfaceVariant}
                />
              </View>
            ))}
          </View>
        )}
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
              color={partyOverride ? colors.primary : colors.outline}
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
                placeholderTextColor={colors.onSurfaceVariant}
                maxLength={2}
              />
              <Text style={st.partyInputLabel}>PCs ×</Text>
              <TextInput
                style={st.partyInput}
                value={overrideLevel}
                onChangeText={setOverrideLevel}
                keyboardType="number-pad"
                placeholder="Lvl"
                placeholderTextColor={colors.onSurfaceVariant}
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

  function CrPicker({ label, value, onSelect, open, setOpen, pickerId }: {
    label: string; value: string | null;
    onSelect: (v: string | null) => void;
    open: boolean; setOpen: (v: boolean) => void;
    pickerId: string;
  }) {
    function handleOpen() {
      if (open) { setOpen(false); return; }
      if (Platform.OS === 'web') {
        const el = document.getElementById(pickerId);
        if (el) {
          const rect = el.getBoundingClientRect();
          crDropPosRef.current = { top: rect.bottom + 2, left: rect.left, width: Math.max(rect.width, 80) };
        }
      }
      setOpen(true);
    }

    const dropdownContent = open ? (
      <>
        <div
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99999 }}
          onClick={() => setOpen(false)}
        />
        <div
          style={{
            position: 'fixed',
            top: crDropPosRef.current.top,
            left: crDropPosRef.current.left,
            width: crDropPosRef.current.width,
            maxHeight: 250,
            overflowY: 'auto',
            backgroundColor: colors.surfaceContainerHigh,
            border: `1px solid ${colors.outlineVariant}`,
            borderRadius: 6,
            zIndex: 100000,
            boxShadow: '0 4px 20px rgba(0,0,0,0.8)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            style={{
              padding: '6px 10px',
              cursor: 'pointer',
              backgroundColor: value === null ? (colors.primary + '22') : 'transparent',
            }}
            onClick={() => { onSelect(null); setOpen(false); }}
          >
            <Text style={[st.crDropdownText, value === null && st.crDropdownTextActive]}>Any</Text>
          </div>
          {CR_OPTIONS.map((opt) => (
            <div
              key={opt}
              style={{
                padding: '6px 10px',
                cursor: 'pointer',
                backgroundColor: value === opt ? (colors.primary + '22') : 'transparent',
              }}
              onClick={() => { onSelect(opt); setOpen(false); }}
            >
              <Text style={[st.crDropdownText, value === opt && st.crDropdownTextActive]}>{opt}</Text>
            </div>
          ))}
        </div>
      </>
    ) : null;

    const btn = (
      <Pressable
        style={st.crPickerBtn}
        onPress={handleOpen}
      >
          <Text style={st.crPickerLabel}>{label}</Text>
          <Text style={st.crPickerBtnText}>{value ?? 'Any'}</Text>
          <MaterialCommunityIcons name={open ? 'chevron-up' : 'chevron-down'} size={14} color={colors.outline} />
        </Pressable>
    );

    return (
      <View style={st.crPickerWrap}>
        {Platform.OS === 'web'
          ? <div id={pickerId}>{btn}</div>
          : btn}
        {Platform.OS === 'web' && createPortal && dropdownContent
          ? createPortal(dropdownContent, document.body)
          : null}
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
              <TouchableOpacity onPress={() => addCreatureToRoster(creature)} hitSlop={8} style={{ marginLeft: 'auto' }}>
                <MaterialCommunityIcons name="plus-circle-outline" size={18} color={colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => clearSlot(slotIdx)} hitSlop={8} style={{ marginLeft: 4 }}>
                <MaterialCommunityIcons name="close" size={18} color={colors.outline} />
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
            <MaterialCommunityIcons name="shield-sword-outline" size={36} color={colors.outline} />
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
            <MaterialCommunityIcons name="arrow-left" size={22} color={colors.onSurface} />
          </TouchableOpacity>
          <View style={{ flex: 1, marginRight: spacing.sm }}>
            <TextInput
              style={st.headerNameInput}
              value={encounterName}
              onChangeText={setEncounterName}
              onBlur={handleNameBlur}
              selectTextOnFocus
              placeholder="Encounter Name"
              placeholderTextColor={colors.onSurfaceVariant}
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
              <MaterialCommunityIcons name="magnify" size={16} color={colors.outline} />
              <TextInput
                style={st.searchInput}
                value={searchText}
                onChangeText={setSearchText}
                placeholder={`Search ${catalog.length} creatures by name...`}
                placeholderTextColor={colors.onSurfaceVariant}
              />
              {searchText !== '' && (
                <TouchableOpacity onPress={() => setSearchText('')} hitSlop={8}>
                  <MaterialCommunityIcons name="close-circle" size={16} color={colors.outline} />
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
              pickerId="cr-picker-min"
            />
            <Text style={st.crDash}>-</Text>
            <CrPicker
              label="Max"
              value={crMax}
              onSelect={setCrMax}
              open={crMaxOpen}
              setOpen={(v) => { setCrMaxOpen(v); if (v) setCrMinOpen(false); }}
              pickerId="cr-picker-max"
            />

            <Pressable
              style={[st.filterToggle, filtersExpanded && st.filterToggleActive]}
              onPress={() => setFiltersExpanded((p) => !p)}
            >
              <MaterialCommunityIcons name="filter-variant" size={14} color={filtersExpanded ? colors.primary : colors.outline} />
              <Text style={[st.filterToggleText, filtersExpanded && { color: colors.primary }]}>Filters</Text>
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
                <MaterialCommunityIcons name="view-agenda-outline" size={14} color={!showTwoSlots ? colors.primary : colors.outline} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[st.viewToggleBtn, showTwoSlots && st.viewToggleBtnActive]}
                onPress={() => setShowTwoSlots(true)}
                hitSlop={4}
              >
                <MaterialCommunityIcons name="view-column-outline" size={14} color={showTwoSlots ? colors.primary : colors.outline} />
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
                  <ActivityIndicator color={colors.primary} />
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
                    <MaterialCommunityIcons name="shield-sword-outline" size={32} color={colors.outline} />
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
                  <ActivityIndicator color={colors.primary} />
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
                  <MaterialCommunityIcons name="shield-sword-outline" size={32} color={colors.outline} />
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
                {mobileCreature && (
                  <TouchableOpacity onPress={() => addCreatureToRoster(mobileCreature)} hitSlop={8}>
                    <MaterialCommunityIcons name="plus-circle-outline" size={20} color={colors.primary} />
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => clearSlot(0)} hitSlop={8} style={{ marginLeft: 4 }}>
                  <MaterialCommunityIcons name="close" size={20} color={colors.outline} />
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
    backgroundColor: `${colors.outlineVariant}44`, borderRadius: radius.lg,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  typeTagText: {
    fontSize: 8, fontFamily: fonts.label, fontWeight: '700', color: colors.outline, letterSpacing: 1,
  },
  crTag: {
    backgroundColor: `${colors.primary}22`, borderRadius: radius.lg,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  crTagText: {
    fontSize: 8, fontFamily: fonts.label, fontWeight: '700', color: colors.primary, letterSpacing: 0.5,
  },

  topStatRow: {
    flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm,
  },
  editBox: {
    flex: 1, alignItems: 'center',
    borderColor: colors.outlineVariant, borderWidth: 1,
    borderRadius: 6, paddingVertical: 6, paddingHorizontal: 4,
  },
  editBoxLabel: {
    fontSize: 8, fontFamily: fonts.label, fontWeight: '700', color: colors.outline,
    letterSpacing: 1.2, marginBottom: 2,
  },
  editBoxInput: {
    fontSize: 16, fontFamily: fonts.headline, fontWeight: '700', color: colors.onSurface,
    textAlign: 'center', padding: 0, minWidth: 40,
  },

  abilityTable: {
    borderWidth: 1, borderColor: colors.outlineVariant, borderRadius: 6,
    overflow: 'hidden', marginBottom: spacing.sm,
  },
  abilityRow: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.outlineVariant,
  },
  abilityRowLast: { borderBottomWidth: 0 },
  abilityHeadRow: { backgroundColor: colors.surfaceContainerLow },
  abilityCell: {
    paddingHorizontal: 6, paddingVertical: 5, textAlign: 'center',
    fontSize: 11,
  },
  abilityNameCol: { width: 48 },
  abilityNumCol: { flex: 1, textAlign: 'center', justifyContent: 'center' },
  abilityHeadText: {
    fontSize: 8, fontFamily: fonts.label, fontWeight: '700', color: colors.outline,
    letterSpacing: 1.2, textAlign: 'center',
  },
  abilityNameText: {
    fontSize: 9, fontFamily: fonts.label, fontWeight: '700', color: colors.outline,
    letterSpacing: 1,
  },
  abilityValueText: { fontSize: 12, fontFamily: fonts.body, color: colors.onSurface, textAlign: 'center' },
  abilitySaveText: { fontSize: 12, fontFamily: fonts.body, color: colors.primary, textAlign: 'center' },
  abilityDashText: { fontSize: 12, fontFamily: fonts.body, color: colors.outline, textAlign: 'center' },
  abilityInput: {
    fontSize: 12, fontFamily: fonts.body, fontWeight: '600', color: colors.onSurface,
    textAlign: 'center', padding: 0, minWidth: 28,
    borderBottomWidth: 1, borderBottomColor: colors.outlineVariant,
  },

  statLine: {
    flexDirection: 'row', paddingVertical: 3, gap: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.outlineVariant,
  },
  statLineLabel: {
    fontSize: 9, fontFamily: fonts.label, fontWeight: '700', color: colors.outline,
    letterSpacing: 1.2, width: 70, textTransform: 'uppercase',
  },
  statLineValue: { fontSize: 11, fontFamily: fonts.body, color: colors.onSurface, flex: 1 },
});

// ---------------------------------------------------------------------------
// Main styles
// ---------------------------------------------------------------------------

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceCanvas },
  center: {
    flex: 1, backgroundColor: colors.surfaceCanvas,
    alignItems: 'center', justifyContent: 'center',
  },

  // ---- Header ----
  header: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderBottomColor: colors.outlineVariant, borderBottomWidth: 1,
    backgroundColor: colors.surfaceContainerHigh,
  },
  headerBack: { padding: 4 },
  headerNameInput: {
    fontSize: 16, fontFamily: fonts.headline, fontWeight: '700', color: colors.onSurface,
    paddingVertical: 2, paddingHorizontal: 0,
    borderBottomColor: 'transparent', borderBottomWidth: 1,
  },
  headerSubtitle: { fontSize: 11, fontFamily: fonts.label, color: colors.onSurfaceVariant, marginTop: 2 },
  saveBtn: {
    borderColor: colors.outlineVariant, borderWidth: 1, borderRadius: 6,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  saveBtnText: { fontSize: 11, fontFamily: fonts.label, fontWeight: '600', color: colors.outline },
  loadCombatBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.primary, borderRadius: 6,
    paddingHorizontal: spacing.md, paddingVertical: 8,
  },
  loadCombatBtnText: { color: '#fff', fontSize: 10, fontFamily: fonts.label, fontWeight: '700', letterSpacing: 1 },

  // ---- Filter bar ----
  filterBar: {
    borderBottomColor: colors.outlineVariant, borderBottomWidth: 1,
    backgroundColor: colors.surfaceContainerHigh,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs, gap: 6,
  },
  searchFilterRow: {
    flexDirection: 'row', gap: spacing.sm,
  },
  searchRow: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6,
    borderColor: colors.outlineVariant, borderWidth: 1, borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: Platform.OS === 'web' ? 5 : 7,
    backgroundColor: colors.surfaceContainer,
  },
  searchInput: { flex: 1, fontSize: 13, fontFamily: fonts.body, color: colors.onSurface, padding: 0 },

  controlsRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap',
    zIndex: 10,
  },
  controlLabel: {
    fontSize: 9, fontFamily: fonts.label, fontWeight: '700', color: colors.outline, letterSpacing: 1.2,
  },
  crDash: { fontSize: 14, color: colors.outline },
  crPickerWrap: {},
  crModalBackdrop: {
    position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0,
  },
  crPickerBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    borderColor: colors.outlineVariant, borderWidth: 1, borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 5,
    backgroundColor: colors.surfaceContainerHighest, minWidth: 70,
  },
  crPickerLabel: { fontSize: 9, fontFamily: fonts.label, fontWeight: '600', color: colors.outline, marginRight: 2 },
  crPickerBtnText: { fontSize: 12, fontFamily: fonts.body, color: colors.onSurface, flex: 1 },
  crDropdown: {
    backgroundColor: colors.surfaceContainerHigh, borderColor: colors.outlineVariant, borderWidth: 1,
    borderRadius: 6, overflow: 'hidden' as const,
    ...(Platform.OS === 'web' ? { boxShadow: '0 4px 20px rgba(0,0,0,0.8)' } as never : { elevation: 10 }),
  },
  crDropdownItem: { paddingHorizontal: 10, paddingVertical: 6, backgroundColor: colors.surfaceContainerHigh },
  crDropdownItemActive: { backgroundColor: `${colors.primary}22` },
  crDropdownText: { fontSize: 12, fontFamily: fonts.body, color: colors.onSurface },
  crDropdownTextActive: { color: colors.primary, fontWeight: '600' },

  filterToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderColor: colors.outlineVariant, borderWidth: 1, borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 5,
  },
  filterToggleActive: { borderColor: `${colors.primary}44` },
  filterToggleText: { fontSize: 11, fontFamily: fonts.label, fontWeight: '600', color: colors.outline },
  clearFiltersBtn: {
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: radius.lg, backgroundColor: `${colors.outlineVariant}44`,
  },
  clearFiltersBtnText: { fontSize: 10, fontFamily: fonts.label, fontWeight: '600', color: colors.outline },

  viewToggleBtn: {
    padding: 5, borderRadius: radius.lg,
  },
  viewToggleBtnActive: {
    backgroundColor: `${colors.primary}22`,
  },

  filterChipsContainer: {
    paddingTop: 4, gap: 4,
  },
  filterSectionLabel: {
    fontSize: 9, fontFamily: fonts.label, fontWeight: '700', color: colors.outline,
    letterSpacing: 1.2,
  },
  chipWrap: {
    flexDirection: 'row', flexWrap: 'wrap', maxWidth: 600,
  },
  chip: {
    borderColor: colors.outlineVariant, borderWidth: 1, borderRadius: radius.lg,
    paddingHorizontal: 8, paddingVertical: 3, marginRight: 4, marginVertical: 2,
  },
  chipActive: { borderColor: colors.primary, backgroundColor: `${colors.primary}22` },
  chipText: { fontSize: 10, fontFamily: fonts.label, color: colors.outline },
  chipTextActive: { color: colors.primary, fontWeight: '600' },

  // ---- Main 4-column layout ----
  mainContentWide: {
    flex: 1, flexDirection: 'row',
  },

  // Column 1: Catalog
  catalogCol: {
    flex: 1, borderRightColor: colors.outlineVariant, borderRightWidth: 1,
  },
  colHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.sm, paddingVertical: 4,
    borderBottomColor: colors.outlineVariant, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  panelTitle: { fontSize: 12, fontFamily: fonts.headline, fontWeight: '700', color: colors.onSurface },
  countBadge: {
    backgroundColor: `${colors.outlineVariant}44`, borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 1,
  },
  countBadgeText: { fontSize: 9, fontFamily: fonts.label, fontWeight: '600', color: colors.outline },

  catalogRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: spacing.sm, paddingVertical: 2,
    borderBottomColor: colors.outlineVariant, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  catalogNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  catalogName: { fontSize: 12, fontFamily: fonts.headline, fontWeight: '600', color: colors.onSurface },
  crTag: {
    backgroundColor: `${colors.primary}22`, borderRadius: 3,
    paddingHorizontal: 4, paddingVertical: 1,
  },
  crTagText: { fontSize: 8, fontFamily: fonts.label, fontWeight: '700', color: colors.primary },
  typeBadge: {
    backgroundColor: `${colors.outlineVariant}55`, borderRadius: 3,
    paddingHorizontal: 4, paddingVertical: 1,
  },
  typeBadgeText: { fontSize: 7, fontFamily: fonts.label, fontWeight: '700', color: colors.outline, letterSpacing: 0.5 },
  srdBadge: {
    backgroundColor: `${colors.secondary}22`, borderRadius: 3,
    paddingHorizontal: 4, paddingVertical: 1,
  },
  srdBadgeText: { fontSize: 7, fontFamily: fonts.label, fontWeight: '700', color: colors.secondary, letterSpacing: 0.3 },
  catalogMeta: { fontSize: 10, fontFamily: fonts.label, color: colors.outline, marginTop: 1 },
  addBtn: {
    width: 24, height: 24, borderRadius: 12,
    borderColor: `${colors.primary}66`, borderWidth: 1,
    backgroundColor: `${colors.primary}14`,
    alignItems: 'center', justifyContent: 'center',
  },

  // Column 2: Roster
  rosterCol: {
    flex: 1, borderRightColor: colors.outlineVariant, borderRightWidth: 1,
  },
  rosterCountText: { fontWeight: '400', color: colors.outline },
  clearBtnText: { fontSize: 10, fontFamily: fonts.label, fontWeight: '700', color: colors.hpDanger },

  rosterCard: {
    borderColor: colors.outlineVariant, borderWidth: 1,
    borderRadius: 6, padding: spacing.xs,
  },
  rosterCardTop: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 },
  rosterName: { fontSize: 12, fontFamily: fonts.headline, fontWeight: '600', color: colors.onSurface },
  renameBtn: { padding: 2 },
  removeBtn: { padding: 2, marginLeft: 'auto' },
  rosterMeta: { fontSize: 10, fontFamily: fonts.label, color: colors.outline, marginBottom: 4 },
  rosterControls: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  countBtn: {
    width: 22, height: 22, borderRadius: 11,
    borderColor: colors.outlineVariant, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surfaceCanvas,
  },
  countText: { fontSize: 13, fontFamily: fonts.headline, fontWeight: '700', color: colors.onSurface, minWidth: 18, textAlign: 'center' },
  rosterEmpty: {
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: spacing.xl,
  },
  rosterEmptyText: { fontSize: 11, fontFamily: fonts.body, color: colors.outline, marginTop: spacing.sm, fontStyle: 'italic' },

  // Individual name editing
  individualNamesWrap: {
    marginTop: spacing.xs, gap: 3,
    borderTopColor: colors.outlineVariant, borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.xs,
  },
  individualNameRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  individualNameLabel: {
    fontSize: 9, fontFamily: fonts.label, fontWeight: '700',
    color: colors.outline, width: 14, textAlign: 'center',
  },
  individualNameInput: {
    flex: 1, fontSize: 11, fontFamily: fonts.body, color: colors.onSurface,
    borderBottomWidth: 1, borderBottomColor: colors.outlineVariant,
    paddingVertical: 2, paddingHorizontal: 0,
  },

  // Difficulty
  difficultyContainer: {
    paddingHorizontal: spacing.sm, paddingVertical: 4,
    borderBottomColor: colors.outlineVariant, borderBottomWidth: StyleSheet.hairlineWidth,
    backgroundColor: colors.surfaceContainerLow,
  },
  difficultyTiers: {
    flexDirection: 'row', gap: 4, marginBottom: 2,
  },
  difficultyTierChip: {
    borderColor: colors.outlineVariant, borderWidth: 1, borderRadius: radius.lg,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  difficultyTierText: {
    fontSize: 9, fontFamily: fonts.label, fontWeight: '700', color: colors.outline,
  },
  difficultyXpText: {
    fontSize: 10, fontFamily: fonts.label, color: colors.outline, marginTop: 1,
  },
  difficultyHint: {
    fontSize: 10, fontFamily: fonts.body, color: colors.outline, fontStyle: 'italic',
  },
  partyRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 4, flexWrap: 'wrap',
  },
  partyToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
  },
  partyToggleText: { fontSize: 10, fontFamily: fonts.label, color: colors.outline },
  partyInputs: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
  },
  partyInput: {
    width: 32, textAlign: 'center' as const,
    backgroundColor: colors.surfaceCanvas, borderColor: colors.outlineVariant,
    borderWidth: 1, borderRadius: radius.lg,
    paddingVertical: 2, paddingHorizontal: 4,
    fontSize: 11, fontFamily: fonts.body, fontWeight: '700' as const, color: colors.onSurface,
  },
  partyInputLabel: { fontSize: 10, fontFamily: fonts.label, color: colors.outline },
  partyAutoText: { fontSize: 10, fontFamily: fonts.label, color: colors.outline, fontStyle: 'italic' as const },

  // Stat block columns (3 & 4)
  statBlockCol: {
    flex: 1,
  },
  statBlockColBorder: {
    borderRightColor: colors.outlineVariant, borderRightWidth: 1,
  },
  statBlockHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: spacing.sm, paddingVertical: 4,
    borderBottomColor: colors.outlineVariant, borderBottomWidth: StyleSheet.hairlineWidth,
    backgroundColor: colors.surfaceContainerHigh,
  },
  slotBadge: {
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: `${colors.primary}33`, alignItems: 'center', justifyContent: 'center',
  },
  slotBadgeText: { fontSize: 10, fontFamily: fonts.label, fontWeight: '700', color: colors.primary },
  statBlockTitle: { fontSize: 12, fontFamily: fonts.headline, fontWeight: '600', color: colors.onSurface, flex: 1 },
  statBlockEmptyLabel: { fontSize: 11, fontFamily: fonts.body, color: colors.outline, fontStyle: 'italic' },
  statBlockEmpty: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  statBlockEmptyText: { fontSize: 11, fontFamily: fonts.body, color: colors.outline, fontStyle: 'italic', textAlign: 'center' },

  // Mobile layout
  mobileCatalog: {
    borderBottomColor: colors.outlineVariant, borderBottomWidth: 1,
  },
  mobileRoster: {
    paddingHorizontal: spacing.xs, gap: spacing.xs, paddingVertical: spacing.xs,
  },

  // Modal (mobile stat block)
  modalContainer: {
    flex: 1, backgroundColor: colors.surfaceCanvas,
    paddingTop: Platform.OS === 'ios' ? 50 : spacing.md,
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderBottomColor: colors.outlineVariant, borderBottomWidth: 1,
    backgroundColor: colors.surfaceContainerHigh,
  },
});
