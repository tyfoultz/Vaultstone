import { useEffect, useState } from 'react';
import {
  View, Text, Image, TouchableOpacity, TextInput,
  ActivityIndicator, Modal, Pressable, Switch, StyleSheet, useWindowDimensions, Platform,
} from 'react-native';
import { ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getCharacterById, updateCharacter, updateCharacterState, uploadCharacterPortrait, supabase } from '@vaultstone/api';
import { useAuthStore, useCharacterStore } from '@vaultstone/store';
import { colors, spacing, fonts } from '@vaultstone/ui';
import type { Database, Dnd5eStats, Dnd5eResources, Dnd5eAbilityScores, CharacterSettings, Dnd5eEquipmentItem, EquipmentSlot, Dnd5eFeature } from '@vaultstone/types';
import { HpModal } from '../../components/character-sheet/HpModal';
import { ConditionsPanel } from '../../components/character-sheet/ConditionsPanel';

type Character = Database['public']['Tables']['characters']['Row'];

// ─── Helpers ────────────────────────────────────────────────────────────────

function abilityMod(score: number) { return Math.floor((score - 10) / 2); }
function profBonus(level: number) { return Math.floor((level - 1) / 4) + 2; }
function fmtMod(n: number) { return n >= 0 ? `+${n}` : `${n}`; }
function capitalize(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }
function titleCase(s: string) { return s.split(' ').map(capitalize).join(' '); }

const SKILL_ABILITY: Record<string, keyof Dnd5eAbilityScores> = {
  acrobatics: 'dexterity', 'animal handling': 'wisdom', arcana: 'intelligence',
  athletics: 'strength', deception: 'charisma', history: 'intelligence',
  insight: 'wisdom', intimidation: 'charisma', investigation: 'intelligence',
  medicine: 'wisdom', nature: 'intelligence', perception: 'wisdom',
  performance: 'charisma', persuasion: 'charisma', religion: 'intelligence',
  'sleight of hand': 'dexterity', stealth: 'dexterity', survival: 'wisdom',
};
const ALL_SKILLS = Object.keys(SKILL_ABILITY);

const ABILITY_KEYS: (keyof Dnd5eAbilityScores)[] = [
  'strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma',
];
const ABILITY_SHORT: Record<keyof Dnd5eAbilityScores, string> = {
  strength: 'STR', dexterity: 'DEX', constitution: 'CON',
  intelligence: 'INT', wisdom: 'WIS', charisma: 'CHA',
};

type CardId = 'combat' | 'weapons-equipment' | 'class-features' | 'species-traits' | 'feats' | 'proficiencies' | 'conditions' | 'coins' | 'scratchpad';
type CardItem = { id: CardId };

const DEFAULT_CARD_ORDER: CardId[] = [
  'combat', 'weapons-equipment', 'class-features', 'species-traits',
  'feats', 'proficiencies', 'conditions', 'coins', 'scratchpad',
];

const CARD_LABELS: Record<CardId, string> = {
  'combat': 'HP / Movement / Ability Scores / Skills',
  'weapons-equipment': 'Weapons & Equipment',
  'class-features': 'Class Features',
  'species-traits': 'Species Traits',
  'feats': 'Feats',
  'proficiencies': 'Proficiencies & Training',
  'conditions': 'Conditions',
  'coins': 'Coins',
  'scratchpad': 'Scratchpad',
};

// ─── Screen ─────────────────────────────────────────────────────────────────

export default function CharacterSheetScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { updateCharacterLocally } = useCharacterStore();
  const authUser = useAuthStore((state) => state.user);

  const [character, setCharacter] = useState<Character | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hpModalVisible, setHpModalVisible] = useState(false);
  const [settingsModal, setSettingsModal] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [editingField, setEditingField] = useState<string | null>(null);
  const [fieldInput, setFieldInput] = useState('');
  const [hpQuickMode, setHpQuickMode] = useState<'damage' | 'heal' | null>(null);
  const [equipModal, setEquipModal] = useState(false);
  const [editEquip, setEditEquip] = useState<Dnd5eEquipmentItem | null>(null);
  const [xpAddMode, setXpAddMode] = useState(false);
  const [xpAddInput, setXpAddInput] = useState('');
  const [featureModal, setFeatureModal] = useState(false);
  const [editFeature, setEditFeature] = useState<Dnd5eFeature | null>(null);
  const [featureCategory, setFeatureCategory] = useState<'classFeatures' | 'speciesTraits' | 'feats'>('classFeatures');
  const [tempHpFieldInput, setTempHpFieldInput] = useState('');
  const [hpQuickInput, setHpQuickInput] = useState('');
  const [scratchpad, setScratchpad] = useState('');
  const [isDmOfLinkedCampaign, setIsDmOfLinkedCampaign] = useState(false);
  const [portraitUploading, setPortraitUploading] = useState(false);
  const [editLayout, setEditLayout] = useState(false);
  const [cardItems, setCardItems] = useState<CardItem[]>(DEFAULT_CARD_ORDER.map((id) => ({ id })));

  useEffect(() => {
    if (!id) return;
    getCharacterById(id).then(({ data, error: err }) => {
      if (err) setError('Failed to load character.');
      else {
        setCharacter(data);
        const res = data?.resources as Dnd5eResources | null;
        if (res?.notes) setScratchpad(res.notes);
        const st = data?.base_stats as Dnd5eStats | null;
        if (st?.settings?.cardOrder) {
          setCardItems(st.settings.cardOrder.map((id) => ({ id: id as CardId })));
        }
      }
      setLoading(false);
    });
  }, [id]);

  // Is the viewer the DM of any campaign this character is linked to?
  // Drives edit-permission on the sheet — the DM gets write access to the
  // RPC-whitelisted session-state fields (HP, conditions, slots, etc.)
  // while non-owner / non-DM viewers stay read-only.
  useEffect(() => {
    if (!id || !authUser?.id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('campaign_members')
        .select('campaigns!inner(dm_user_id)')
        .eq('character_id', id);
      if (cancelled) return;
      const isDm = (data ?? []).some(
        (row) => (row as { campaigns?: { dm_user_id?: string } }).campaigns?.dm_user_id === authUser.id,
      );
      setIsDmOfLinkedCampaign(isDm);
    })();
    return () => { cancelled = true; };
  }, [id, authUser?.id]);

  // Realtime: when another viewer (e.g. the DM via Party View) mutates this
  // character, merge the payload into local state so the sheet reflects the
  // change without a refresh. We intentionally don't sync the scratchpad
  // field — it has in-progress notes that would clobber local edits.
  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`character:${id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'characters',
          filter: `id=eq.${id}`,
        },
        (payload) => {
          const next = payload.new as Character;
          setCharacter(next);
          updateCharacterLocally(id, {
            base_stats: next.base_stats,
            resources: next.resources,
            conditions: next.conditions,
            name: next.name,
          });
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id]);

  const stats = character?.base_stats as Dnd5eStats | null;
  const resources = character?.resources as Dnd5eResources | null;
  const settings: CharacterSettings = stats?.settings ?? { manualMode: false };
  const manualMode = settings.manualMode;
  const prof = stats ? profBonus(stats.level) : 2;
  const scores = stats?.abilityScores;

  function skillMod(skillName: string): number {
    if (!scores || !stats) return 0;
    const base = abilityMod(scores[SKILL_ABILITY[skillName]]);
    return base + (stats.skillProficiencies.includes(skillName) ? prof : 0);
  }

  function saveMod(ability: keyof Dnd5eAbilityScores): number {
    if (!scores || !stats) return 0;
    const base = abilityMod(scores[ability]);
    return base + (stats.savingThrowProficiencies.includes(ability) ? prof : 0);
  }

  const equipment: Dnd5eEquipmentItem[] = resources?.equipment ?? [];
  const ac = scores ? getEquippedAC() : 10;
  const initiative = scores ? abilityMod(scores.dexterity) : 0;
  const passivePerception = 10 + skillMod('perception');

  function hpColor(): string {
    if (!resources || !stats) return colors.textPrimary;
    if (resources.hpCurrent === 0) return colors.hpDanger;
    const ratio = resources.hpCurrent / stats.hpMax;
    if (ratio >= 1) return colors.hpHealthy;       // 100% — green
    if (ratio > 0.75) return '#A3D977';             // 75-99% — yellow-green
    if (ratio > 0.5) return colors.hpWarning;       // 50-75% — yellow
    if (ratio > 0.25) return '#F97316';             // 25-50% — orange
    return colors.hpDanger;                          // <25% — red
  }

  // ── Persist ─────────────────────────────────────────────────────────────

  // Ownership + authorization for this sheet:
  // - Owner: full edit access (direct table update).
  // - DM of a linked campaign: may edit session-state fields (the RPC
  //   whitelist) but not durable sheet fields (name, stats, equipment).
  // - Anyone else (cross-view guest): read-only.
  const isOwner = !!character && !!authUser && character.user_id === authUser.id;
  const canEditAny = isOwner || isDmOfLinkedCampaign;
  const isReadOnly = !canEditAny;

  // Keys inside resources that the RPC's whitelist accepts. Anything not in
  // this set is owner-only — the DM sheet silently skips writes for them.
  const RPC_RESOURCE_KEYS: (keyof Dnd5eResources)[] = [
    'hpCurrent', 'hpTemp', 'exhaustionLevel', 'spellSlots',
    'classResources', 'deathSaves', 'inspiration', 'concentrationSpell',
  ];

  async function persistResources(updated: Dnd5eResources) {
    if (!character || !canEditAny) return;
    const res = updated as unknown as import('@vaultstone/types').Json;
    setCharacter({ ...character, resources: res });
    updateCharacterLocally(character.id, { resources: res });

    if (isOwner) {
      await updateCharacter(character.id, { resources: res });
      return;
    }

    // DM path: send only whitelisted resource-key diffs via the RPC. Any
    // non-whitelisted changes (equipment, coins, features, notes, …) are
    // silently dropped — the sheet controls for those are disabled anyway.
    const current = (character.resources ?? {}) as unknown as Dnd5eResources;
    const patch: Record<string, unknown> = {};
    for (const key of RPC_RESOURCE_KEYS) {
      if (JSON.stringify(updated[key]) !== JSON.stringify(current[key])) {
        patch[key] = updated[key];
      }
    }
    if (Object.keys(patch).length > 0) {
      await updateCharacterState(character.id, patch);
    }
  }

  async function handleDragEnd(newItems: CardItem[]) {
    setCardItems(newItems);
    const order = newItems.map((i) => i.id);
    const newSettings: CharacterSettings = { ...stats.settings, manualMode: stats.settings?.manualMode ?? false, cardOrder: order };
    persistStats({ ...stats, settings: newSettings });
  }

  async function handlePickPortrait() {
    if (!character) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setPortraitUploading(true);
    const { url } = await uploadCharacterPortrait(character.id, asset.uri, asset.mimeType ?? 'image/jpeg');
    setPortraitUploading(false);
    if (url) {
      const updated = { ...character, avatar_url: url };
      setCharacter(updated);
      updateCharacterLocally(character.id, { avatar_url: url });
    }
  }

  async function persistConditions(newConditions: string[]) {
    if (!character || !canEditAny) return;
    setCharacter({ ...character, conditions: newConditions });
    updateCharacterLocally(character.id, { conditions: newConditions });
    if (isOwner) {
      await updateCharacter(character.id, { conditions: newConditions });
    } else {
      await updateCharacterState(character.id, { conditions: newConditions });
    }
  }

  async function persistStats(updated: Dnd5eStats) {
    if (!character || !isOwner) return;
    const bs = updated as unknown as import('@vaultstone/types').Json;
    setCharacter({ ...character, base_stats: bs });
    updateCharacterLocally(character.id, { base_stats: bs });
    await updateCharacter(character.id, { base_stats: bs });
  }

  async function persistName(newName: string) {
    if (!character || !isOwner) return;
    setCharacter({ ...character, name: newName });
    updateCharacterLocally(character.id, { name: newName });
    await updateCharacter(character.id, { name: newName });
    if (stats) {
      persistStats({ ...stats, characterName: newName });
    }
  }

  function handleToggleManualMode() {
    if (!stats) return;
    persistStats({ ...stats, settings: { ...settings, manualMode: !manualMode } });
  }

  function startEditField(field: string, currentValue: string | number) {
    setEditingField(field);
    setFieldInput(String(currentValue));
  }

  function saveEditField() {
    if (!stats || !scores || !editingField) return;
    const val = fieldInput.trim();
    if (!val) { setEditingField(null); return; }

    const num = parseInt(val, 10);

    if (ABILITY_KEYS.includes(editingField as any)) {
      if (isNaN(num) || num < 1 || num > 30) { setEditingField(null); return; }
      persistStats({
        ...stats,
        abilityScores: { ...scores, [editingField]: num },
        // Recalc HP max if CON changed
        ...(editingField === 'constitution'
          ? { hpMax: stats.hitDie + abilityMod(num) + (stats.level - 1) * (Math.floor(stats.hitDie / 2) + 1 + abilityMod(num)) }
          : {}),
      });
    } else if (editingField === 'level') {
      if (isNaN(num) || num < 1 || num > 20) { setEditingField(null); return; }
      persistStats({ ...stats, level: num });
    } else if (editingField === 'speed') {
      if (isNaN(num) || num < 0) { setEditingField(null); return; }
      persistStats({ ...stats, speed: num });
    } else if (editingField === 'hpMax') {
      if (isNaN(num) || num < 1) { setEditingField(null); return; }
      persistStats({ ...stats, hpMax: num });
    } else if (editingField === 'hitDiceRemaining') {
      if (isNaN(num) || num < 0) { setEditingField(null); return; }
      persistResources({ ...resources!, hitDiceRemaining: Math.min(num, stats.level) });
    } else if (editingField === 'hpCurrent') {
      if (isNaN(num) || num < 0) { setEditingField(null); return; }
      const tempVal = parseInt(tempHpFieldInput, 10);
      persistResources({
        ...resources!,
        hpCurrent: Math.min(num, stats.hpMax),
        hpTemp: isNaN(tempVal) || tempVal < 0 ? resources!.hpTemp : tempVal,
      });
    } else if (editingField === 'tempHp') {
      if (isNaN(num) || num < 0) { setEditingField(null); return; }
      persistResources({ ...resources!, hpTemp: num });
    } else if (editingField === 'xp') {
      if (isNaN(num) || num < 0) { setEditingField(null); return; }
      persistResources({ ...resources!, xp: num });
    } else if (typeof editingField === 'string' && editingField.startsWith('coin_')) {
      if (isNaN(num) || num < 0) { setEditingField(null); return; }
      const denom = editingField.replace('coin_', '') as 'cp' | 'sp' | 'ep' | 'gp' | 'pp';
      const coins = resources!.coins ?? { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
      persistResources({ ...resources!, coins: { ...coins, [denom]: num } });
    } else if (editingField === 'concentrationSpell') {
      const trimmed = val.slice(0, 80);
      persistResources({ ...resources!, concentrationSpell: trimmed || null });
    }

    setEditingField(null);
  }

  function applyAddXp() {
    if (!resources) { setXpAddMode(false); return; }
    const n = parseInt(xpAddInput, 10);
    if (isNaN(n) || n <= 0) { setXpAddMode(false); return; }
    persistResources({ ...resources, xp: (resources.xp ?? 0) + n });
    setXpAddMode(false);
    setXpAddInput('');
  }

  function getAttackBonus(item: Dnd5eEquipmentItem): number {
    if (item.attackBonus !== undefined) return item.attackBonus;
    if (!scores) return 0;
    let ability: 'strength' | 'dexterity' = 'strength';
    if (item.attackAbility === 'dexterity') ability = 'dexterity';
    else if (item.attackAbility === 'finesse') {
      ability = abilityMod(scores.dexterity) > abilityMod(scores.strength) ? 'dexterity' : 'strength';
    }
    return abilityMod(scores[ability]) + prof;
  }

  function getEquippedAC(): number {
    if (!scores) return 10;
    const armor = equipment.find((e) => e.slot === 'armor' && e.equipped);
    const shield = equipment.find((e) => e.slot === 'shield' && e.equipped);
    let base = 10 + abilityMod(scores.dexterity);
    if (armor) {
      const dexMod = abilityMod(scores.dexterity);
      const dexBonus = armor.dexCap !== undefined && armor.dexCap !== null
        ? Math.min(dexMod, armor.dexCap)
        : dexMod;
      base = (armor.acBase ?? 10) + dexBonus;
    }
    if (shield) base += shield.acBonus ?? 2;
    return base;
  }

  function saveEquipment(items: Dnd5eEquipmentItem[]) {
    if (!resources) return;
    persistResources({ ...resources, equipment: items });
  }

  function handleSaveEquipItem(item: Dnd5eEquipmentItem) {
    const existing = equipment.findIndex((e) => e.id === item.id);
    if (existing >= 0) {
      const updated = [...equipment];
      updated[existing] = item;
      saveEquipment(updated);
    } else {
      saveEquipment([...equipment, item]);
    }
    setEditEquip(null);
    setEquipModal(false);
  }

  function handleRemoveEquipItem(id: string) {
    saveEquipment(equipment.filter((e) => e.id !== id));
    setEditEquip(null);
    setEquipModal(false);
  }

  function handleToggleEquipped(id: string) {
    saveEquipment(equipment.map((e) => e.id === id ? { ...e, equipped: !e.equipped } : e));
  }

  function getFeatureList(cat: 'classFeatures' | 'speciesTraits' | 'feats'): Dnd5eFeature[] {
    return resources?.[cat] ?? [];
  }

  function saveFeature(cat: 'classFeatures' | 'speciesTraits' | 'feats', feature: Dnd5eFeature) {
    if (!resources) return;
    const list = getFeatureList(cat);
    const idx = list.findIndex((f) => f.id === feature.id);
    const updated = idx >= 0 ? list.map((f, i) => i === idx ? feature : f) : [...list, feature];
    persistResources({ ...resources, [cat]: updated });
    setEditFeature(null);
    setFeatureModal(false);
  }

  function removeFeature(cat: 'classFeatures' | 'speciesTraits' | 'feats', id: string) {
    if (!resources) return;
    persistResources({ ...resources, [cat]: getFeatureList(cat).filter((f) => f.id !== id) });
    setEditFeature(null);
    setFeatureModal(false);
  }

  function toggleFeatureUse(cat: 'classFeatures' | 'speciesTraits' | 'feats', id: string, delta: number) {
    if (!resources) return;
    const list = getFeatureList(cat);
    persistResources({
      ...resources,
      [cat]: list.map((f) => {
        if (f.id !== id || !f.uses) return f;
        return { ...f, uses: { ...f.uses, current: Math.max(0, Math.min(f.uses.max, f.uses.current + delta)) } };
      }),
    });
  }

  function applyQuickHp() {
    if (!resources || !stats || !hpQuickMode) { setHpQuickMode(null); return; }
    const n = parseInt(hpQuickInput, 10);
    if (isNaN(n) || n <= 0) { setHpQuickMode(null); return; }
    if (hpQuickMode === 'damage') {
      const tempAbsorb = Math.min(resources.hpTemp, n);
      const remaining = n - tempAbsorb;
      persistResources({
        ...resources,
        hpCurrent: Math.max(0, resources.hpCurrent - remaining),
        hpTemp: resources.hpTemp - tempAbsorb,
      });
    } else {
      persistResources({
        ...resources,
        hpCurrent: Math.min(stats.hpMax, resources.hpCurrent + n),
      });
    }
    setHpQuickMode(null);
    setHpQuickInput('');
  }

  function applyTempHp() {
    if (!resources || !stats) { setHpQuickMode(null); return; }
    const n = parseInt(hpQuickInput, 10);
    if (isNaN(n) || n <= 0) { setHpQuickMode(null); return; }
    // Temp HP doesn't stack — take the higher value
    persistResources({ ...resources, hpTemp: Math.max(resources.hpTemp, n) });
    setHpQuickMode(null);
    setHpQuickInput('');
  }

  function handleToggleCondition(condition: string) {
    if (!character) return;
    const current = character.conditions ?? [];
    const lower = condition.toLowerCase();
    const exists = current.map((c) => c.toLowerCase()).includes(lower);
    persistConditions(exists ? current.filter((c) => c.toLowerCase() !== lower) : [...current, condition]);
  }

  function handleSetExhaustion(level: number) {
    if (!resources) return;
    persistResources({ ...resources, exhaustionLevel: Math.max(0, level) });
  }

  function handleDeathSave(type: 'success' | 'failure') {
    if (!resources) return;
    const ds = resources.deathSaves;
    if (type === 'success') {
      persistResources({ ...resources, deathSaves: { ...ds, successes: (ds.successes + 1) % 4 } });
    } else {
      persistResources({ ...resources, deathSaves: { ...ds, failures: (ds.failures + 1) % 4 } });
    }
  }

  // ── Loading / Error ─────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={s.loadingContainer}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  if (error || !character || !stats || !resources || !scores) {
    return (
      <View style={s.loadingContainer}>
        <TouchableOpacity onPress={() => router.back()} style={{ marginBottom: spacing.lg }}>
          <Text style={{ color: colors.brand, fontSize: 14 }}>← Back</Text>
        </TouchableOpacity>
        <Text style={{ color: colors.hpDanger }}>{error || 'Character not found.'}</Text>
      </View>
    );
  }

  const isDead = resources.deathSaves.failures >= 3;
  const isStabilized = resources.hpCurrent === 0 && resources.deathSaves.successes >= 3;
  const showDeathSaves = resources.hpCurrent === 0 && !isDead;
  const activeConditions = character.conditions ?? [];
  const exhaustionLevel = resources.exhaustionLevel ?? 0;
  const hpC = hpColor();

  // ── Render ──────────────────────────────────────────────────────────────

  function renderSection(id: CardId, moveUp: () => void, moveDown: () => void, index: number, total: number) {
    const isFirst = index === 0;
    const isLast = index === total - 1;
    switch (id) {
      case 'combat':
        return (
          <View>
            {editLayout && (
              <View style={s.dragHandle}>
                <Text style={s.dragHandleLabel}>{CARD_LABELS[id]}</Text>
                <View style={{ flexDirection: 'row', gap: 6, marginLeft: 'auto' }}>
                  <TouchableOpacity onPress={moveUp} disabled={isFirst} style={[s.dragArrow, isFirst && { opacity: 0.3 }]}>
                    <MaterialCommunityIcons name="chevron-up" size={20} color={colors.textSecondary} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={moveDown} disabled={isLast} style={[s.dragArrow, isLast && { opacity: 0.3 }]}>
                    <MaterialCommunityIcons name="chevron-down" size={20} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>
              </View>
            )}
            <View style={s.fourColRow}>
          {/* HP card */}
          <View style={[s.hpCard, { flex: 1 }]}>
            <Text style={s.cardLabel}>Hit Points</Text>
            {isDead ? (
              <Text style={[s.hpValue, { color: colors.hpDanger }]}>Dead</Text>
            ) : isStabilized ? (
              <Text style={[s.hpValue, { color: colors.hpWarning, fontSize: 20 }]}>Stabilized</Text>
            ) : (
              <View style={s.hpRow}>
                <TouchableOpacity
                  style={[s.hpQuickBtn, s.hpQuickBtnLeft]}
                  onPress={() => { setHpQuickInput(''); setHpQuickMode('damage'); }}
                >
                  <MaterialCommunityIcons name="sword" size={22} color={colors.hpDanger} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={[s.hpBox, { borderColor: resources.hpTemp > 0 ? '#3B82F6' : hpC }]}
                  onPress={() => { setEditingField('hpCurrent'); setFieldInput(String(resources.hpCurrent)); setTempHpFieldInput(String(resources.hpTemp)); }}
                >
                  <Text style={[s.hpValue, { color: hpC }]}>
                    {resources.hpCurrent}
                  </Text>
                  {resources.hpTemp > 0 && (
                    <Text style={s.hpTempInline}>+{resources.hpTemp}</Text>
                  )}
                </TouchableOpacity>
                <Text style={s.hpSep}>/</Text>
                {manualMode ? (
                  <TouchableOpacity onPress={() => startEditField('hpMax', stats.hpMax)}>
                    <Text style={[s.hpMax, { textDecorationLine: 'underline' }]}>{stats.hpMax}</Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={s.hpMax}>{stats.hpMax}</Text>
                )}

                <TouchableOpacity
                  style={[s.hpQuickBtn, { marginLeft: 'auto' }]}
                  onPress={() => { setHpQuickInput(''); setHpQuickMode('heal'); }}
                >
                  <MaterialCommunityIcons name="heart-plus" size={22} color={colors.hpHealthy} />
                </TouchableOpacity>
              </View>
            )}
            <View style={s.hpBarTrack}>
              <View style={[s.hpBarFill, {
                width: `${Math.max(0, Math.min(100, (resources.hpCurrent / stats.hpMax) * 100))}%` as any,
                backgroundColor: hpC,
              }]} />
              {resources.hpTemp > 0 && (
                <View style={[s.hpBarTemp, {
                  width: `${Math.min(100 - (resources.hpCurrent / stats.hpMax) * 100, (resources.hpTemp / stats.hpMax) * 100)}%` as any,
                }]} />
              )}
            </View>


            <View style={s.combatDivider} />
            <View style={s.combatGrid}>
              <View style={s.combatStat}>
                <Text style={[s.combatLabel, { textAlign: 'center' }]}>Armor Class</Text>
                <Text style={[s.combatValue, { color: colors.brand }]}>{ac}</Text>
                {(() => {
                  const hasShieldEquipped = equipment.some((e) => e.slot === 'shield' && e.equipped);
                  return (
                    <TouchableOpacity
                      style={[s.shieldToggle, hasShieldEquipped && s.shieldToggleActive]}
                      onPress={() => {
                        const shield = equipment.find((e) => e.slot === 'shield');
                        if (shield) handleToggleEquipped(shield.id);
                      }}
                      disabled={!equipment.some((e) => e.slot === 'shield')}
                    >
                      <MaterialCommunityIcons
                        name={hasShieldEquipped ? 'shield-check' : 'shield-off-outline'}
                        size={14}
                        color={hasShieldEquipped ? colors.brand : colors.textSecondary}
                      />
                      <Text style={[s.shieldToggleText, hasShieldEquipped && { color: colors.brand }]}>
                        Shield
                      </Text>
                    </TouchableOpacity>
                  );
                })()}
              </View>
              <TouchableOpacity
                style={s.combatStat}
                onPress={() => { setEditingField('hitDiceRemaining'); setFieldInput(String(resources.hitDiceRemaining)); }}
              >
                <Text style={s.combatLabel}>Hit Dice</Text>
                <Text style={s.combatValue}>{resources.hitDiceRemaining} / {stats.level}</Text>
                <Text style={s.combatLabel}>D{stats.hitDie}</Text>
              </TouchableOpacity>
            </View>

            {/* Death Saves — always visible */}
            <View style={s.combatDivider} />
            <Text style={s.cardLabel}>Death Saves</Text>
            <View style={s.deathSavesRow}>
              <View style={s.deathSaveSide}>
                <Text style={s.deathSaveLabel}>Successes</Text>
                <View style={s.savePips}>
                  {[0, 1, 2].map((i) => (
                    <TouchableOpacity
                      key={i}
                      onPress={() => handleDeathSave('success')}
                      style={[s.savePip, i < resources.deathSaves.successes && s.savePipSuccess]}
                    />
                  ))}
                </View>
              </View>
              <View style={s.deathSaveSide}>
                <Text style={s.deathSaveLabel}>Failures</Text>
                <View style={s.savePips}>
                  {[0, 1, 2].map((i) => (
                    <TouchableOpacity
                      key={i}
                      onPress={() => handleDeathSave('failure')}
                      style={[s.savePip, i < resources.deathSaves.failures && s.savePipFailure]}
                    />
                  ))}
                </View>
              </View>
            </View>
            {isStabilized && (
              <Text style={s.stabilizedHint}>Stabilized — HP stays at 0 until healed.</Text>
            )}

            {/* Concentration */}
            <View style={s.combatDivider} />
            <Text style={s.cardLabel}>Concentration</Text>
            {resources.concentrationSpell ? (
              <View style={s.concentrationRow}>
                <MaterialCommunityIcons name="meditation" size={16} color={colors.brand} />
                <Text style={s.concentrationSpell} numberOfLines={1}>
                  {resources.concentrationSpell}
                </Text>
                <TouchableOpacity
                  disabled={isReadOnly}
                  onPress={() => persistResources({ ...resources, concentrationSpell: null })}
                  style={s.concentrationClearBtn}
                >
                  <Text style={s.concentrationClearText}>Clear</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                disabled={isReadOnly}
                onPress={() => { setEditingField('concentrationSpell'); setFieldInput(''); }}
                style={s.concentrationSetBtn}
              >
                <MaterialCommunityIcons name="meditation" size={14} color={colors.textSecondary} />
                <Text style={s.concentrationSetText}>
                  {isReadOnly ? 'None' : 'Set concentration…'}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Movement & Senses card */}
          <View style={[s.card, { flex: 1 }]}>
            <Text style={s.cardLabel}>Movement & Senses</Text>
            <View style={s.movGrid}>
              <TouchableOpacity
                style={s.movStat}
                disabled={!manualMode}
                onPress={() => startEditField('speed', stats.speed)}
              >
                <Text style={s.abilityQuickValue}>{stats.speed}ft</Text>
                <Text style={s.abilityQuickLabel}>Speed{manualMode ? ' ✎' : ''}</Text>
              </TouchableOpacity>
              <View style={s.movStat}>
                <Text style={s.abilityQuickValue}>{fmtMod(initiative)}</Text>
                <Text style={s.abilityQuickLabel}>Initiative</Text>
              </View>
            </View>
            <View style={s.movGrid}>
              <View style={s.movStat}>
                <Text style={[s.abilityQuickValue, { color: colors.brand }]}>{passivePerception}</Text>
                <Text style={s.abilityQuickLabel}>Passive{'\n'}Perception</Text>
              </View>
              <View style={s.movStat}>
                <Text style={s.abilityQuickValue}>Med</Text>
                <Text style={s.abilityQuickLabel}>Size</Text>
              </View>
            </View>
          </View>

          {/* Ability Scores card */}
          <View style={[s.card, { flex: 1 }]}>
            <Text style={s.cardLabel}>Ability Scores</Text>
            <View style={s.abilityHeaderRow}>
              <Text style={[s.abilityHeaderText, { width: 36 }]} />
              <Text style={[s.abilityHeaderText, { width: 32, textAlign: 'center' }]}>Base</Text>
              <Text style={[s.abilityHeaderText, { width: 36, textAlign: 'center' }]}>Mod</Text>
              <View style={{ flex: 1 }} />
              <Text style={[s.abilityHeaderText, { width: 54, textAlign: 'center' }]}>Save</Text>
            </View>
            <View style={s.abilityBody}>
              {ABILITY_KEYS.map((ability) => {
                const proficient = stats.savingThrowProficiencies.includes(ability);
                return (
                  <TouchableOpacity
                    key={ability}
                    style={s.abilityRow}
                    disabled={!manualMode}
                    onPress={() => startEditField(ability, scores[ability])}
                  >
                    <Text style={s.abilityLabel}>{ABILITY_SHORT[ability]}</Text>
                    <Text style={s.abilityScore}>{scores[ability]}</Text>
                    <Text style={s.abilityModCol}>{fmtMod(abilityMod(scores[ability]))}</Text>
                    {manualMode && (
                      <MaterialCommunityIcons name="pencil-outline" size={12} color={colors.textSecondary} style={{ marginLeft: 2 }} />
                    )}
                    <View style={s.saveSpacer} />
                    <View style={s.saveCell}>
                      <Text style={s.saveModText}>{fmtMod(saveMod(ability))}</Text>
                      <View style={[s.profDotSmall, proficient && s.profDotFilled]} />
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Skills card */}
          <View style={[s.card, { flex: 1.5 }]}>
            <Text style={s.cardLabel}>Skills</Text>
            {ALL_SKILLS.map((skill) => {
              const proficient = stats.skillProficiencies.includes(skill);
              return (
                <View key={skill} style={s.skillRow}>
                  <View style={[s.profDot, proficient && s.profDotFilled]} />
                  <Text style={s.skillName}>{titleCase(skill)}</Text>
                  <Text style={s.skillAbility}>({ABILITY_SHORT[SKILL_ABILITY[skill]]})</Text>
                  <Text style={s.skillModText}>{fmtMod(skillMod(skill))}</Text>
                </View>
              );
            })}
          </View>
          </View>
          </View>
        );
      case 'weapons-equipment':
        return (
          <View>
            {editLayout && (
              <View style={s.dragHandle}>
                <Text style={s.dragHandleLabel}>{CARD_LABELS[id]}</Text>
                <View style={{ flexDirection: 'row', gap: 6, marginLeft: 'auto' }}>
                  <TouchableOpacity onPress={moveUp} disabled={isFirst} style={[s.dragArrow, isFirst && { opacity: 0.3 }]}>
                    <MaterialCommunityIcons name="chevron-up" size={20} color={colors.textSecondary} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={moveDown} disabled={isLast} style={[s.dragArrow, isLast && { opacity: 0.3 }]}>
                    <MaterialCommunityIcons name="chevron-down" size={20} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>
              </View>
            )}
            {/* Row 2: Weapons + Equipment */}
          <View style={s.fourColRow}>
          {/* Weapons & Damage Cantrips table */}
          <View style={[s.card, { flex: 1 }]}>
            <View style={s.equipHeader}>
              <Text style={s.cardLabel}>Weapons & Damage Cantrips</Text>
              <TouchableOpacity onPress={() => {
                setEditEquip({
                  id: Date.now().toString(),
                  name: '', slot: 'weapon', equipped: true,
                });
                setEquipModal(true);
              }}>
                <MaterialCommunityIcons name="plus-circle-outline" size={20} color={colors.brand} />
              </TouchableOpacity>
            </View>
            {/* Table header */}
            <View style={s.atkTableHeader}>
              <Text style={[s.atkHeaderText, { flex: 2 }]}>Name</Text>
              <Text style={[s.atkHeaderText, { flex: 1, textAlign: 'center' }]}>Atk / DC</Text>
              <Text style={[s.atkHeaderText, { flex: 1.5, textAlign: 'center' }]}>Damage & Type</Text>
              <Text style={[s.atkHeaderText, { flex: 1, textAlign: 'right' }]}>Notes</Text>
            </View>
            {/* Table rows */}
            {equipment.filter((e) => e.slot === 'weapon').length === 0 ? (
              <View style={s.atkTableRow}>
                <Text style={[s.atkCellText, { flex: 1, fontStyle: 'italic' }]}>No weapons added</Text>
              </View>
            ) : (
              equipment.filter((e) => e.slot === 'weapon').map((w) => (
                <TouchableOpacity
                  key={w.id}
                  style={[s.atkTableRow, !w.equipped && { opacity: 0.4 }]}
                  onPress={() => { setEditEquip(w); setEquipModal(true); }}
                >
                  <Text style={[s.atkCellName, { flex: 2 }]} numberOfLines={1}>{w.name || '—'}</Text>
                  <Text style={[s.atkCellText, { flex: 1, textAlign: 'center' }]}>{fmtMod(getAttackBonus(w))}</Text>
                  <Text style={[s.atkCellText, { flex: 1.5, textAlign: 'center' }]}>{w.damage || '—'}</Text>
                  <Text style={[s.atkCellNotes, { flex: 1, textAlign: 'right' }]} numberOfLines={1}>
                    {[w.range ? `${w.range}ft` : '', ...(w.properties ?? [])].filter(Boolean).join(', ') || '—'}
                  </Text>
                </TouchableOpacity>
              ))
            )}
          </View>

          {/* Equipment card */}
          <View style={[s.card, { flex: 1 }]}>
            <View style={s.equipHeader}>
              <Text style={s.cardLabel}>Equipment</Text>
              <TouchableOpacity onPress={() => {
                setEditEquip({
                  id: Date.now().toString(),
                  name: '', slot: 'weapon', equipped: true,
                });
                setEquipModal(true);
              }}>
                <MaterialCommunityIcons name="plus-circle-outline" size={20} color={colors.brand} />
              </TouchableOpacity>
            </View>

            {/* Attacks */}
            {(() => {
              const weapons = equipment.filter((e) => e.slot === 'weapon');
              if (weapons.length === 0 && equipment.filter((e) => e.slot === 'armor' || e.slot === 'shield').length === 0) {
                return <Text style={s.equipEmpty}>No equipment. Tap + to add weapons and armor.</Text>;
              }
              return (
                <>
                  {weapons.length > 0 && (
                    <>
                      <Text style={s.equipSubLabel}>Attacks</Text>
                      {weapons.map((w) => (
                        <TouchableOpacity
                          key={w.id}
                          style={[s.equipRow, !w.equipped && s.equipRowDim]}
                          onPress={() => { setEditEquip(w); setEquipModal(true); }}
                        >
                          <TouchableOpacity onPress={() => handleToggleEquipped(w.id)} style={s.equipToggle}>
                            <MaterialCommunityIcons
                              name={w.equipped ? 'sword' : 'sword-cross'}
                              size={18}
                              color={w.equipped ? colors.brand : colors.textSecondary}
                            />
                          </TouchableOpacity>
                          <View style={s.equipInfo}>
                            <Text style={s.equipName}>{w.name || 'Unnamed'}</Text>
                            <Text style={s.equipDetail}>
                              {fmtMod(getAttackBonus(w))} to hit · {w.damage || '—'}{w.range ? ` · ${w.range}ft` : ''}
                            </Text>
                          </View>
                          {w.properties && w.properties.length > 0 && (
                            <Text style={s.equipProps}>{w.properties.join(', ')}</Text>
                          )}
                        </TouchableOpacity>
                      ))}
                    </>
                  )}

                  {/* Defense */}
                  {equipment.filter((e) => (e.slot === 'armor' || e.slot === 'shield')).length > 0 && (
                    <>
                      <Text style={[s.equipSubLabel, { marginTop: spacing.sm }]}>Defense</Text>
                      {equipment.filter((e) => e.slot === 'armor' || e.slot === 'shield').map((a) => (
                        <TouchableOpacity
                          key={a.id}
                          style={[s.equipRow, !a.equipped && s.equipRowDim]}
                          onPress={() => { setEditEquip(a); setEquipModal(true); }}
                        >
                          <TouchableOpacity onPress={() => handleToggleEquipped(a.id)} style={s.equipToggle}>
                            <MaterialCommunityIcons
                              name={a.equipped ? 'shield-check' : 'shield-outline'}
                              size={18}
                              color={a.equipped ? colors.brand : colors.textSecondary}
                            />
                          </TouchableOpacity>
                          <View style={s.equipInfo}>
                            <Text style={s.equipName}>{a.name || 'Unnamed'}</Text>
                            <Text style={s.equipDetail}>
                              {a.slot === 'armor'
                                ? `AC ${a.acBase ?? '?'}${a.dexCap !== undefined && a.dexCap !== null ? ` (max DEX +${a.dexCap})` : ' + DEX'}`
                                : `+${a.acBonus ?? 2} AC`}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      ))}
                    </>
                  )}

                  {/* Other items */}
                  {equipment.filter((e) => e.slot === 'other').length > 0 && (
                    <>
                      <Text style={[s.equipSubLabel, { marginTop: spacing.sm }]}>Other</Text>
                      {equipment.filter((e) => e.slot === 'other').map((o) => (
                        <TouchableOpacity
                          key={o.id}
                          style={s.equipRow}
                          onPress={() => { setEditEquip(o); setEquipModal(true); }}
                        >
                          <MaterialCommunityIcons name="bag-personal-outline" size={18} color={colors.textSecondary} style={{ marginRight: spacing.sm }} />
                          <View style={s.equipInfo}>
                            <Text style={s.equipName}>{o.name || 'Unnamed'}</Text>
                            {o.notes && <Text style={s.equipDetail}>{o.notes}</Text>}
                          </View>
                        </TouchableOpacity>
                      ))}
                    </>
                  )}
                </>
              );
            })()}

            {/* Attunement section */}
            {(() => {
              const attuned = equipment.filter((e) => e.requiresAttunement);
              const attunedCount = attuned.filter((e) => e.attuned).length;
              return (
                <>
                  <Text style={[s.equipSubLabel, { marginTop: spacing.md }]}>
                    Attunement ({attunedCount}/3)
                  </Text>
                  {[0, 1, 2].map((slot) => {
                    const item = attuned.filter((e) => e.attuned)[slot];
                    return (
                      <View key={slot} style={s.attunementSlot}>
                        <MaterialCommunityIcons
                          name={item ? 'star-four-points' : 'star-four-points-outline'}
                          size={16}
                          color={item ? colors.brand : colors.border}
                        />
                        {item ? (
                          <TouchableOpacity
                            style={{ flex: 1 }}
                            onPress={() => { setEditEquip(item); setEquipModal(true); }}
                          >
                            <Text style={s.attunementItemName}>{item.name}</Text>
                          </TouchableOpacity>
                        ) : (
                          <Text style={s.attunementEmpty}>— empty slot —</Text>
                        )}
                      </View>
                    );
                  })}
                </>
              );
            })()}
          </View>
          </View>
          </View>
        );
      case 'class-features':
        return (
          <View>
            {editLayout && (
              <View style={s.dragHandle}>
                <Text style={s.dragHandleLabel}>{CARD_LABELS[id]}</Text>
                <View style={{ flexDirection: 'row', gap: 6, marginLeft: 'auto' }}>
                  <TouchableOpacity onPress={moveUp} disabled={isFirst} style={[s.dragArrow, isFirst && { opacity: 0.3 }]}>
                    <MaterialCommunityIcons name="chevron-up" size={20} color={colors.textSecondary} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={moveDown} disabled={isLast} style={[s.dragArrow, isLast && { opacity: 0.3 }]}>
                    <MaterialCommunityIcons name="chevron-down" size={20} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>
              </View>
            )}
            {/* Class Features card */}
          <View style={s.card}>
            <View style={s.equipHeader}>
              <Text style={s.cardLabel}>Class Features</Text>
              <TouchableOpacity onPress={() => {
                setFeatureCategory('classFeatures');
                setEditFeature({ id: Date.now().toString(), name: '', description: '' });
                setFeatureModal(true);
              }}>
                <MaterialCommunityIcons name="plus-circle-outline" size={20} color={colors.brand} />
              </TouchableOpacity>
            </View>
            {getFeatureList('classFeatures').length === 0 ? (
              <Text style={s.equipEmpty}>No class features added yet.</Text>
            ) : (
              getFeatureList('classFeatures').map((f) => (
                <TouchableOpacity key={f.id} style={s.featureRow} onPress={() => {
                  setFeatureCategory('classFeatures');
                  setEditFeature(f);
                  setFeatureModal(true);
                }}>
                  <View style={s.featureInfo}>
                    <Text style={s.featureName}>{f.name}</Text>
                    {f.description ? <Text style={s.featureDesc} numberOfLines={2}>{f.description}</Text> : null}
                  </View>
                  {f.uses && (
                    <View style={s.featureUses}>
                      <TouchableOpacity onPress={() => toggleFeatureUse('classFeatures', f.id, -1)}>
                        <MaterialCommunityIcons name="minus-circle-outline" size={18} color={colors.textSecondary} />
                      </TouchableOpacity>
                      <Text style={s.featureUsesText}>{f.uses.current}/{f.uses.max}</Text>
                      <TouchableOpacity onPress={() => toggleFeatureUse('classFeatures', f.id, 1)}>
                        <MaterialCommunityIcons name="plus-circle-outline" size={18} color={colors.brand} />
                      </TouchableOpacity>
                    </View>
                  )}
                </TouchableOpacity>
              ))
            )}
          </View>
          </View>
        );
      case 'species-traits':
        return (
          <View>
            {editLayout && (
              <View style={s.dragHandle}>
                <Text style={s.dragHandleLabel}>{CARD_LABELS[id]}</Text>
                <View style={{ flexDirection: 'row', gap: 6, marginLeft: 'auto' }}>
                  <TouchableOpacity onPress={moveUp} disabled={isFirst} style={[s.dragArrow, isFirst && { opacity: 0.3 }]}>
                    <MaterialCommunityIcons name="chevron-up" size={20} color={colors.textSecondary} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={moveDown} disabled={isLast} style={[s.dragArrow, isLast && { opacity: 0.3 }]}>
                    <MaterialCommunityIcons name="chevron-down" size={20} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>
              </View>
            )}
            {/* Species Traits card */}
          <View style={s.card}>
            <View style={s.equipHeader}>
              <Text style={s.cardLabel}>Species Traits</Text>
              <TouchableOpacity onPress={() => {
                setFeatureCategory('speciesTraits');
                setEditFeature({ id: Date.now().toString(), name: '', description: '' });
                setFeatureModal(true);
              }}>
                <MaterialCommunityIcons name="plus-circle-outline" size={20} color={colors.brand} />
              </TouchableOpacity>
            </View>
            {getFeatureList('speciesTraits').length === 0 ? (
              <Text style={s.equipEmpty}>No species traits added yet.</Text>
            ) : (
              getFeatureList('speciesTraits').map((f) => (
                <TouchableOpacity key={f.id} style={s.featureRow} onPress={() => {
                  setFeatureCategory('speciesTraits');
                  setEditFeature(f);
                  setFeatureModal(true);
                }}>
                  <View style={s.featureInfo}>
                    <Text style={s.featureName}>{f.name}</Text>
                    {f.description ? <Text style={s.featureDesc} numberOfLines={2}>{f.description}</Text> : null}
                  </View>
                  {f.uses && (
                    <View style={s.featureUses}>
                      <TouchableOpacity onPress={() => toggleFeatureUse('speciesTraits', f.id, -1)}>
                        <MaterialCommunityIcons name="minus-circle-outline" size={18} color={colors.textSecondary} />
                      </TouchableOpacity>
                      <Text style={s.featureUsesText}>{f.uses.current}/{f.uses.max}</Text>
                      <TouchableOpacity onPress={() => toggleFeatureUse('speciesTraits', f.id, 1)}>
                        <MaterialCommunityIcons name="plus-circle-outline" size={18} color={colors.brand} />
                      </TouchableOpacity>
                    </View>
                  )}
                </TouchableOpacity>
              ))
            )}
          </View>
          </View>
        );
      case 'feats':
        return (
          <View>
            {editLayout && (
              <View style={s.dragHandle}>
                <Text style={s.dragHandleLabel}>{CARD_LABELS[id]}</Text>
                <View style={{ flexDirection: 'row', gap: 6, marginLeft: 'auto' }}>
                  <TouchableOpacity onPress={moveUp} disabled={isFirst} style={[s.dragArrow, isFirst && { opacity: 0.3 }]}>
                    <MaterialCommunityIcons name="chevron-up" size={20} color={colors.textSecondary} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={moveDown} disabled={isLast} style={[s.dragArrow, isLast && { opacity: 0.3 }]}>
                    <MaterialCommunityIcons name="chevron-down" size={20} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>
              </View>
            )}
            {/* Feats card */}
          <View style={s.card}>
            <View style={s.equipHeader}>
              <Text style={s.cardLabel}>Feats</Text>
              <TouchableOpacity onPress={() => {
                setFeatureCategory('feats');
                setEditFeature({ id: Date.now().toString(), name: '', description: '' });
                setFeatureModal(true);
              }}>
                <MaterialCommunityIcons name="plus-circle-outline" size={20} color={colors.brand} />
              </TouchableOpacity>
            </View>
            {getFeatureList('feats').length === 0 ? (
              <Text style={s.equipEmpty}>No feats added yet.</Text>
            ) : (
              getFeatureList('feats').map((f) => (
                <TouchableOpacity key={f.id} style={s.featureRow} onPress={() => {
                  setFeatureCategory('feats');
                  setEditFeature(f);
                  setFeatureModal(true);
                }}>
                  <View style={s.featureInfo}>
                    <Text style={s.featureName}>{f.name}</Text>
                    {f.description ? <Text style={s.featureDesc} numberOfLines={2}>{f.description}</Text> : null}
                  </View>
                  {f.uses && (
                    <View style={s.featureUses}>
                      <TouchableOpacity onPress={() => toggleFeatureUse('feats', f.id, -1)}>
                        <MaterialCommunityIcons name="minus-circle-outline" size={18} color={colors.textSecondary} />
                      </TouchableOpacity>
                      <Text style={s.featureUsesText}>{f.uses.current}/{f.uses.max}</Text>
                      <TouchableOpacity onPress={() => toggleFeatureUse('feats', f.id, 1)}>
                        <MaterialCommunityIcons name="plus-circle-outline" size={18} color={colors.brand} />
                      </TouchableOpacity>
                    </View>
                  )}
                </TouchableOpacity>
              ))
            )}
          </View>
          </View>
        );
      case 'proficiencies':
        return (
          <View>
            {editLayout && (
              <View style={s.dragHandle}>
                <Text style={s.dragHandleLabel}>{CARD_LABELS[id]}</Text>
                <View style={{ flexDirection: 'row', gap: 6, marginLeft: 'auto' }}>
                  <TouchableOpacity onPress={moveUp} disabled={isFirst} style={[s.dragArrow, isFirst && { opacity: 0.3 }]}>
                    <MaterialCommunityIcons name="chevron-up" size={20} color={colors.textSecondary} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={moveDown} disabled={isLast} style={[s.dragArrow, isLast && { opacity: 0.3 }]}>
                    <MaterialCommunityIcons name="chevron-down" size={20} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>
              </View>
            )}
            {/* Proficiencies & Training card */}
          <View style={[s.card, s.cardWide]}>
            <Text style={s.cardLabel}>Proficiencies &amp; Training</Text>
            <View style={s.profTrainingGrid}>
              {[
                { label: 'Armor', icon: 'shield-half-full' as const, items: stats.armorProficiencies },
                { label: 'Weapons', icon: 'sword-cross' as const, items: stats.weaponProficiencies },
                { label: 'Tools', icon: 'toolbox-outline' as const, items: stats.toolProficiencies },
                { label: 'Languages', icon: 'translate' as const, items: stats.languages },
              ].map(({ label, icon, items }) => (
                <View key={label} style={s.profTrainingCol}>
                  <View style={s.profTrainingHeader}>
                    <MaterialCommunityIcons name={icon} size={14} color={colors.brand} />
                    <Text style={s.profTrainingLabel}>{label}</Text>
                  </View>
                  {items.length === 0 ? (
                    <Text style={s.profTrainingEmpty}>None</Text>
                  ) : (
                    items.map((item) => (
                      <Text key={item} style={s.profTrainingItem}>{titleCase(item)}</Text>
                    ))
                  )}
                </View>
              ))}
            </View>
          </View>
          </View>
        );
      case 'conditions':
        return (
          <View>
            {editLayout && (
              <View style={s.dragHandle}>
                <Text style={s.dragHandleLabel}>{CARD_LABELS[id]}</Text>
                <View style={{ flexDirection: 'row', gap: 6, marginLeft: 'auto' }}>
                  <TouchableOpacity onPress={moveUp} disabled={isFirst} style={[s.dragArrow, isFirst && { opacity: 0.3 }]}>
                    <MaterialCommunityIcons name="chevron-up" size={20} color={colors.textSecondary} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={moveDown} disabled={isLast} style={[s.dragArrow, isLast && { opacity: 0.3 }]}>
                    <MaterialCommunityIcons name="chevron-down" size={20} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>
              </View>
            )}
            {/* Conditions card */}
          <View style={s.card}>
            <Text style={s.cardLabel}>Conditions</Text>
            <ConditionsPanel
              conditions={activeConditions}
              exhaustionLevel={exhaustionLevel}
              onToggle={handleToggleCondition}
              onSetExhaustion={handleSetExhaustion}
            />
          </View>
          </View>
        );
      case 'coins':
        return (
          <View>
            {editLayout && (
              <View style={s.dragHandle}>
                <Text style={s.dragHandleLabel}>{CARD_LABELS[id]}</Text>
                <View style={{ flexDirection: 'row', gap: 6, marginLeft: 'auto' }}>
                  <TouchableOpacity onPress={moveUp} disabled={isFirst} style={[s.dragArrow, isFirst && { opacity: 0.3 }]}>
                    <MaterialCommunityIcons name="chevron-up" size={20} color={colors.textSecondary} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={moveDown} disabled={isLast} style={[s.dragArrow, isLast && { opacity: 0.3 }]}>
                    <MaterialCommunityIcons name="chevron-down" size={20} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>
              </View>
            )}
            {/* Coins card */}
          <View style={s.card}>
            <Text style={s.cardLabel}>Coins</Text>
            <View style={s.coinRow}>
              {(['cp', 'sp', 'ep', 'gp', 'pp'] as const).map((denom) => {
                const coins = resources.coins ?? { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
                const val = coins[denom];
                const update = (delta: number) => {
                  const updated = { ...coins, [denom]: Math.max(0, val + delta) };
                  persistResources({ ...resources, coins: updated });
                };
                return (
                  <View key={denom} style={s.coinCell}>
                    <TouchableOpacity onPress={() => update(1)} style={s.coinArrow}>
                      <MaterialCommunityIcons name="chevron-up" size={18} color={colors.textSecondary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={s.coinValueBox}
                      onPress={() => {
                        setEditingField(`coin_${denom}` as any);
                        setFieldInput(String(val));
                      }}
                    >
                      <Text style={s.coinValue}>{val}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => update(-1)} style={s.coinArrow}>
                      <MaterialCommunityIcons name="chevron-down" size={18} color={colors.textSecondary} />
                    </TouchableOpacity>
                    <Text style={s.coinLabel}>{denom.toUpperCase()}</Text>
                  </View>
                );
              })}
            </View>
          </View>
          </View>
        );
      case 'scratchpad':
        return (
          <View>
            {editLayout && (
              <View style={s.dragHandle}>
                <Text style={s.dragHandleLabel}>{CARD_LABELS[id]}</Text>
                <View style={{ flexDirection: 'row', gap: 6, marginLeft: 'auto' }}>
                  <TouchableOpacity onPress={moveUp} disabled={isFirst} style={[s.dragArrow, isFirst && { opacity: 0.3 }]}>
                    <MaterialCommunityIcons name="chevron-up" size={20} color={colors.textSecondary} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={moveDown} disabled={isLast} style={[s.dragArrow, isLast && { opacity: 0.3 }]}>
                    <MaterialCommunityIcons name="chevron-down" size={20} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>
              </View>
            )}
            {/* Scratchpad card */}
          <View style={[s.card, s.cardWide]}>
            <Text style={s.cardLabel}>Scratchpad</Text>
            <TextInput
              style={s.scratchpadInput}
              value={scratchpad}
              onChangeText={setScratchpad}
              onBlur={() => {
                if (!resources) return;
                persistResources({ ...resources, notes: scratchpad });
              }}
              placeholder="Freetext notes, reminders, loot tracking..."
              placeholderTextColor={colors.textSecondary}
              multiline
              textAlignVertical="top"
            />
          </View>
          </View>
        );
      default:
        return null;
    }
  }

  return (
    <View style={s.root}>
      <ScrollView style={s.scroll} contentContainerStyle={s.container}>
        {/* Back + Settings */}
        <View style={s.topBar}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={s.backText}>← Characters</Text>
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
            <TouchableOpacity
              onPress={() => setEditLayout((v) => !v)}
              style={[s.settingsBtn, editLayout && { borderColor: colors.brand, borderWidth: 1 }]}
            >
              <MaterialCommunityIcons name="view-grid-outline" size={18} color={editLayout ? colors.brand : colors.textSecondary} />
              <Text style={[s.settingsBtnText, editLayout && { color: colors.brand }]}>
                {editLayout ? 'Done' : 'Layout'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setSettingsModal(true)} style={s.settingsBtn}>
              <Text style={s.settingsBtnText}>Character Settings</Text>
              <MaterialCommunityIcons name="cog-outline" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Hero card */}
        <View style={s.heroCard}>
          <View style={s.heroTopRow}>
          <View style={s.heroLeft}>
            <TouchableOpacity style={s.heroAvatar} onPress={handlePickPortrait} disabled={portraitUploading}>
              {portraitUploading ? (
                <ActivityIndicator color={colors.brand} />
              ) : character.avatar_url ? (
                <Image source={{ uri: character.avatar_url }} style={s.heroAvatarImage} />
              ) : (
                <>
                  <MaterialCommunityIcons name="account-outline" size={36} color={colors.brand} />
                  <MaterialCommunityIcons name="camera-plus-outline" size={14} color={colors.textSecondary} style={s.heroAvatarEditIcon} />
                </>
              )}
            </TouchableOpacity>
          </View>
          <View style={s.heroBody}>
            {editingName ? (
              <TextInput
                style={s.heroNameInput}
                value={nameInput}
                onChangeText={setNameInput}
                onBlur={() => {
                  if (nameInput.trim()) persistName(nameInput.trim());
                  setEditingName(false);
                }}
                onSubmitEditing={() => {
                  if (nameInput.trim()) persistName(nameInput.trim());
                  setEditingName(false);
                }}
                autoFocus
                returnKeyType="done"
              />
            ) : (
              <TouchableOpacity onPress={() => { setNameInput(stats.characterName); setEditingName(true); }}>
                <View style={s.heroNameRow}>
                  <Text style={s.heroName}>{stats.characterName}</Text>
                  <MaterialCommunityIcons name="pencil-outline" size={16} color={colors.textSecondary} />
                </View>
              </TouchableOpacity>
            )}
            <Text style={s.heroSubtitle}>
              {capitalize(stats.speciesKey)} {capitalize(stats.classKey)}
            </Text>
            <View style={s.heroMeta}>
              <Text style={s.heroDetail}>{capitalize(stats.backgroundKey)}</Text>
              <Text style={s.heroDetail}>
                {stats.srdVersion === 'SRD_2.0' ? '2024 Rules' : '2014 Rules'}
              </Text>
              {manualMode && (
                <View style={s.manualBadge}>
                  <Text style={s.manualBadgeText}>Manual</Text>
                </View>
              )}
            </View>
          </View>
          {/* Right side: Level, XP, Prof, Inspiration */}
          <View style={s.heroRightGrid}>
            <TouchableOpacity
              style={s.heroRightBox}
              disabled={!manualMode}
              onPress={() => startEditField('level', stats.level)}
            >
              <Text style={[s.heroRightValue, { color: colors.brand }]}>{stats.level}</Text>
              <Text style={s.heroRightLabel}>Lvl{manualMode ? ' ✎' : ''}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.heroRightBox, { paddingHorizontal: 24 }]}
              onPress={() => { setEditingField('xp'); setFieldInput(String(resources.xp ?? 0)); }}
            >
              <View style={s.heroXpRow}>
                <Text style={s.heroRightValue}>{resources.xp ?? 0}</Text>
                <TouchableOpacity
                  style={s.heroXpAdd}
                  onPress={() => { setXpAddInput(''); setXpAddMode(true); }}
                >
                  <MaterialCommunityIcons name="plus" size={12} color={colors.brand} />
                </TouchableOpacity>
              </View>
              <Text style={s.heroRightLabel}>XP</Text>
            </TouchableOpacity>
            <View style={s.heroRightBox}>
              <Text style={s.heroRightValue}>{fmtMod(prof)}</Text>
              <Text style={s.heroRightLabel}>Prof</Text>
            </View>
            <TouchableOpacity
              style={s.heroRightBox}
              onPress={() => {
                if (!resources) return;
                persistResources({ ...resources, inspiration: !resources.inspiration });
              }}
            >
              <MaterialCommunityIcons
                name={resources.inspiration ? 'star' : 'star-outline'}
                size={22}
                color={resources.inspiration ? colors.hpWarning : colors.textSecondary}
              />
              <Text style={[s.heroRightLabel, resources.inspiration && { color: colors.hpWarning }]}>Insp</Text>
            </TouchableOpacity>
          </View>
          </View>
        </View>

        <View style={s.grid}>
          {cardItems.map((item, index) =>
            renderSection(
              item.id,
              () => {
                const next = [...cardItems];
                if (index === 0) return;
                [next[index - 1], next[index]] = [next[index], next[index - 1]];
                handleDragEnd(next);
              },
              () => {
                const next = [...cardItems];
                if (index === cardItems.length - 1) return;
                [next[index], next[index + 1]] = [next[index + 1], next[index]];
                handleDragEnd(next);
              },
              index,
              cardItems.length,
            )
          )}
        </View>

        <Text style={s.attribution}>
          Content from the Systems Reference Document 5.1 / 2.0 is available under the Creative Commons Attribution 4.0 International License.
        </Text>
      </ScrollView>

      <HpModal
        visible={hpModalVisible}
        resources={resources}
        hpMax={stats.hpMax}
        onClose={() => setHpModalVisible(false)}
        onApply={persistResources}
      />

      {/* Settings modal */}
      <Modal visible={settingsModal} transparent animationType="fade">
        <Pressable style={s.modalBackdrop} onPress={() => setSettingsModal(false)}>
          <Pressable style={s.modalCard} onPress={() => {}}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Character Settings</Text>
              <TouchableOpacity onPress={() => setSettingsModal(false)}>
                <MaterialCommunityIcons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={s.settingRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.settingLabel}>Manual Mode</Text>
                <Text style={s.settingDesc}>
                  Edit all stats freely — ability scores, level, speed, HP max, and more.
                </Text>
              </View>
              <Switch
                value={manualMode}
                onValueChange={handleToggleManualMode}
                trackColor={{ false: colors.border, true: colors.brand + '66' }}
                thumbColor={manualMode ? colors.brand : colors.textSecondary}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Field edit modal */}
      <Modal visible={!!editingField} transparent animationType="fade">
        <Pressable style={s.modalBackdrop} onPress={() => setEditingField(null)}>
          <Pressable style={s.modalCard} onPress={() => {}}>
            <Text style={s.modalTitle}>
              {editingField === 'hpCurrent' ? 'Edit Hit Points' : `Edit ${editingField ? (ABILITY_SHORT[editingField as keyof Dnd5eAbilityScores] || capitalize(editingField)) : ''}`}
            </Text>
            {editingField === 'hpCurrent' ? (
              <>
                <View style={s.hpEditRow}>
                  <View style={s.hpEditField}>
                    <Text style={s.hpEditLabel}>Current HP</Text>
                    <TextInput
                      style={s.fieldInput}
                      value={fieldInput}
                      onChangeText={setFieldInput}
                      keyboardType="number-pad"
                      autoFocus
                      returnKeyType="next"
                    />
                  </View>
                  <View style={s.hpEditField}>
                    <Text style={[s.hpEditLabel, { color: '#3B82F6' }]}>Temp HP</Text>
                    <TextInput
                      style={[s.fieldInput, { borderColor: '#3B82F6' }]}
                      value={tempHpFieldInput}
                      onChangeText={setTempHpFieldInput}
                      keyboardType="number-pad"
                      returnKeyType="done"
                      onSubmitEditing={saveEditField}
                    />
                  </View>
                </View>
              </>
            ) : editingField === 'concentrationSpell' ? (
              <TextInput
                style={s.fieldInput}
                value={fieldInput}
                onChangeText={setFieldInput}
                placeholder="Spell name"
                placeholderTextColor={colors.textSecondary}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={saveEditField}
              />
            ) : (
              <TextInput
                style={s.fieldInput}
                value={fieldInput}
                onChangeText={setFieldInput}
                keyboardType="number-pad"
                autoFocus
                returnKeyType="done"
                onSubmitEditing={saveEditField}
              />
            )}
            <TouchableOpacity style={s.fieldSaveBtn} onPress={saveEditField}>
              <Text style={s.fieldSaveBtnText}>Save</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Feature edit modal */}
      <Modal visible={featureModal && !!editFeature} transparent animationType="fade">
        <Pressable style={s.modalBackdrop} onPress={() => setFeatureModal(false)}>
          <Pressable style={[s.modalCard, { maxWidth: 440 }]} onPress={() => {}}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>
                {editFeature?.name ? 'Edit Feature' : 'Add Feature'}
              </Text>
              <TouchableOpacity onPress={() => setFeatureModal(false)}>
                <MaterialCommunityIcons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {editFeature && (
              <ScrollView style={{ maxHeight: 400 }}>
                <Text style={s.eqLabel}>Name</Text>
                <TextInput
                  style={s.eqInput}
                  value={editFeature.name}
                  onChangeText={(t) => setEditFeature({ ...editFeature, name: t })}
                  placeholder="e.g. Second Wind, Darkvision"
                  placeholderTextColor={colors.textSecondary}
                  autoFocus
                />

                <Text style={s.eqLabel}>Description</Text>
                <TextInput
                  style={[s.eqInput, { minHeight: 80, textAlignVertical: 'top' }]}
                  value={editFeature.description}
                  onChangeText={(t) => setEditFeature({ ...editFeature, description: t })}
                  placeholder="What does this feature do?"
                  placeholderTextColor={colors.textSecondary}
                  multiline
                />

                <Text style={s.eqLabel}>Has Limited Uses?</Text>
                <View style={s.eqSlotRow}>
                  <TouchableOpacity
                    style={[s.eqSlotBtn, !editFeature.uses && s.eqSlotBtnActive]}
                    onPress={() => setEditFeature({ ...editFeature, uses: undefined })}
                  >
                    <Text style={[s.eqSlotText, !editFeature.uses && s.eqSlotTextActive]}>Passive</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.eqSlotBtn, !!editFeature.uses && s.eqSlotBtnActive]}
                    onPress={() => setEditFeature({ ...editFeature, uses: editFeature.uses ?? { current: 1, max: 1, recharge: 'long' } })}
                  >
                    <Text style={[s.eqSlotText, !!editFeature.uses && s.eqSlotTextActive]}>Has Uses</Text>
                  </TouchableOpacity>
                </View>

                {editFeature.uses && (
                  <>
                    <Text style={s.eqLabel}>Max Uses</Text>
                    <TextInput
                      style={s.eqInput}
                      value={String(editFeature.uses.max)}
                      onChangeText={(t) => {
                        const n = parseInt(t, 10) || 1;
                        setEditFeature({ ...editFeature, uses: { ...editFeature.uses!, max: n, current: Math.min(editFeature.uses!.current, n) } });
                      }}
                      keyboardType="number-pad"
                    />
                    <Text style={s.eqLabel}>Recharge</Text>
                    <View style={s.eqSlotRow}>
                      <TouchableOpacity
                        style={[s.eqSlotBtn, editFeature.uses.recharge === 'short' && s.eqSlotBtnActive]}
                        onPress={() => setEditFeature({ ...editFeature, uses: { ...editFeature.uses!, recharge: 'short' } })}
                      >
                        <Text style={[s.eqSlotText, editFeature.uses.recharge === 'short' && s.eqSlotTextActive]}>Short Rest</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[s.eqSlotBtn, editFeature.uses.recharge === 'long' && s.eqSlotBtnActive]}
                        onPress={() => setEditFeature({ ...editFeature, uses: { ...editFeature.uses!, recharge: 'long' } })}
                      >
                        <Text style={[s.eqSlotText, editFeature.uses.recharge === 'long' && s.eqSlotTextActive]}>Long Rest</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}

                <TouchableOpacity
                  style={[s.fieldSaveBtn, { marginTop: spacing.md }]}
                  onPress={() => saveFeature(featureCategory, editFeature)}
                >
                  <Text style={s.fieldSaveBtnText}>Save</Text>
                </TouchableOpacity>

                {getFeatureList(featureCategory).some((f) => f.id === editFeature.id) && (
                  <TouchableOpacity
                    style={s.eqDeleteBtn}
                    onPress={() => removeFeature(featureCategory, editFeature.id)}
                  >
                    <Text style={s.eqDeleteText}>Remove</Text>
                  </TouchableOpacity>
                )}
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Add XP modal */}
      <Modal visible={xpAddMode} transparent animationType="fade">
        <Pressable style={s.modalBackdrop} onPress={() => setXpAddMode(false)}>
          <Pressable style={s.modalCard} onPress={() => {}}>
            <View style={s.quickHpHeader}>
              <MaterialCommunityIcons name="star-four-points-outline" size={24} color={colors.brand} />
              <Text style={s.modalTitle}>Add XP</Text>
            </View>
            <TextInput
              style={[s.quickHpInput, { borderColor: colors.brand }]}
              value={xpAddInput}
              onChangeText={setXpAddInput}
              keyboardType="number-pad"
              placeholder="Amount"
              placeholderTextColor={colors.textSecondary}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={applyAddXp}
            />
            <TouchableOpacity
              style={[s.fieldSaveBtn, { opacity: xpAddInput.trim() ? 1 : 0.4 }]}
              onPress={applyAddXp}
              disabled={!xpAddInput.trim()}
            >
              <Text style={s.fieldSaveBtnText}>Add XP</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Equipment edit modal */}
      <Modal visible={equipModal && !!editEquip} transparent animationType="fade">
        <Pressable style={s.modalBackdrop} onPress={() => setEquipModal(false)}>
          <Pressable style={[s.modalCard, { maxWidth: 440 }]} onPress={() => {}}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>
                {editEquip?.name ? 'Edit Item' : 'Add Item'}
              </Text>
              <TouchableOpacity onPress={() => setEquipModal(false)}>
                <MaterialCommunityIcons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {editEquip && (
              <ScrollView style={{ maxHeight: 400 }}>
                <Text style={s.eqLabel}>Name</Text>
                <TextInput
                  style={s.eqInput}
                  value={editEquip.name}
                  onChangeText={(t) => setEditEquip({ ...editEquip, name: t })}
                  placeholder="e.g. Longsword, Chain Mail"
                  placeholderTextColor={colors.textSecondary}
                  autoFocus
                />

                <Text style={s.eqLabel}>Type</Text>
                <View style={s.eqSlotRow}>
                  {(['weapon', 'armor', 'shield', 'other'] as EquipmentSlot[]).map((sl) => (
                    <TouchableOpacity
                      key={sl}
                      style={[s.eqSlotBtn, editEquip.slot === sl && s.eqSlotBtnActive]}
                      onPress={() => setEditEquip({ ...editEquip, slot: sl })}
                    >
                      <Text style={[s.eqSlotText, editEquip.slot === sl && s.eqSlotTextActive]}>
                        {capitalize(sl)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {editEquip.slot === 'weapon' && (
                  <>
                    <Text style={s.eqLabel}>Damage (e.g. 1d8+3 slashing)</Text>
                    <TextInput
                      style={s.eqInput}
                      value={editEquip.damage ?? ''}
                      onChangeText={(t) => setEditEquip({ ...editEquip, damage: t })}
                      placeholder="1d8+3 slashing"
                      placeholderTextColor={colors.textSecondary}
                    />
                    <Text style={s.eqLabel}>Attack Ability</Text>
                    <View style={s.eqSlotRow}>
                      {(['strength', 'dexterity', 'finesse'] as const).map((ab) => (
                        <TouchableOpacity
                          key={ab}
                          style={[s.eqSlotBtn, editEquip.attackAbility === ab && s.eqSlotBtnActive]}
                          onPress={() => setEditEquip({ ...editEquip, attackAbility: ab })}
                        >
                          <Text style={[s.eqSlotText, editEquip.attackAbility === ab && s.eqSlotTextActive]}>
                            {capitalize(ab)}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <Text style={s.eqLabel}>Range (ft)</Text>
                    <TextInput
                      style={s.eqInput}
                      value={editEquip.range ?? ''}
                      onChangeText={(t) => setEditEquip({ ...editEquip, range: t })}
                      placeholder="5 or 80/320"
                      placeholderTextColor={colors.textSecondary}
                    />
                    <Text style={s.eqLabel}>Properties (comma separated)</Text>
                    <TextInput
                      style={s.eqInput}
                      value={(editEquip.properties ?? []).join(', ')}
                      onChangeText={(t) => setEditEquip({ ...editEquip, properties: t.split(',').map((p) => p.trim()).filter(Boolean) })}
                      placeholder="finesse, light, versatile"
                      placeholderTextColor={colors.textSecondary}
                    />
                  </>
                )}

                {editEquip.slot === 'armor' && (
                  <>
                    <Text style={s.eqLabel}>Base AC</Text>
                    <TextInput
                      style={s.eqInput}
                      value={editEquip.acBase !== undefined ? String(editEquip.acBase) : ''}
                      onChangeText={(t) => setEditEquip({ ...editEquip, acBase: parseInt(t, 10) || undefined })}
                      keyboardType="number-pad"
                      placeholder="e.g. 14"
                      placeholderTextColor={colors.textSecondary}
                    />
                    <Text style={s.eqLabel}>Max DEX Bonus (blank = no cap)</Text>
                    <TextInput
                      style={s.eqInput}
                      value={editEquip.dexCap !== undefined && editEquip.dexCap !== null ? String(editEquip.dexCap) : ''}
                      onChangeText={(t) => {
                        const n = parseInt(t, 10);
                        setEditEquip({ ...editEquip, dexCap: isNaN(n) ? null : n });
                      }}
                      keyboardType="number-pad"
                      placeholder="e.g. 2 (or blank for full DEX)"
                      placeholderTextColor={colors.textSecondary}
                    />
                  </>
                )}

                {editEquip.slot === 'shield' && (
                  <>
                    <Text style={s.eqLabel}>AC Bonus</Text>
                    <TextInput
                      style={s.eqInput}
                      value={editEquip.acBonus !== undefined ? String(editEquip.acBonus) : '2'}
                      onChangeText={(t) => setEditEquip({ ...editEquip, acBonus: parseInt(t, 10) || 2 })}
                      keyboardType="number-pad"
                      placeholder="2"
                      placeholderTextColor={colors.textSecondary}
                    />
                  </>
                )}

                {/* Attunement toggles */}
                <TouchableOpacity
                  style={s.eqToggleRow}
                  onPress={() => setEditEquip({ ...editEquip, requiresAttunement: !editEquip.requiresAttunement, attuned: false })}
                >
                  <MaterialCommunityIcons
                    name={editEquip.requiresAttunement ? 'checkbox-marked-outline' : 'checkbox-blank-outline'}
                    size={20} color={colors.brand}
                  />
                  <Text style={s.eqToggleText}>Requires Attunement</Text>
                </TouchableOpacity>

                {editEquip.requiresAttunement && (() => {
                  const currentlyAttuned = equipment.filter((e) => e.attuned && e.id !== editEquip.id).length;
                  const canAttune = currentlyAttuned < 3 || editEquip.attuned;
                  return (
                    <TouchableOpacity
                      style={[s.eqToggleRow, !canAttune && { opacity: 0.4 }]}
                      onPress={() => {
                        if (!canAttune) return;
                        setEditEquip({ ...editEquip, attuned: !editEquip.attuned });
                      }}
                    >
                      <MaterialCommunityIcons
                        name={editEquip.attuned ? 'star-four-points' : 'star-four-points-outline'}
                        size={20} color={colors.brand}
                      />
                      <Text style={s.eqToggleText}>
                        {editEquip.attuned ? 'Attuned' : 'Attune'}{!canAttune ? ' (max 3)' : ''}
                      </Text>
                    </TouchableOpacity>
                  );
                })()}

                <Text style={s.eqLabel}>Notes</Text>
                <TextInput
                  style={s.eqInput}
                  value={editEquip.notes ?? ''}
                  onChangeText={(t) => setEditEquip({ ...editEquip, notes: t })}
                  placeholder="Optional notes"
                  placeholderTextColor={colors.textSecondary}
                />

                <TouchableOpacity
                  style={[s.fieldSaveBtn, { marginTop: spacing.md }]}
                  onPress={() => handleSaveEquipItem(editEquip)}
                >
                  <Text style={s.fieldSaveBtnText}>Save</Text>
                </TouchableOpacity>

                {equipment.some((e) => e.id === editEquip.id) && (
                  <TouchableOpacity
                    style={s.eqDeleteBtn}
                    onPress={() => handleRemoveEquipItem(editEquip.id)}
                  >
                    <Text style={s.eqDeleteText}>Remove Item</Text>
                  </TouchableOpacity>
                )}
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Quick damage/heal modal */}
      <Modal visible={!!hpQuickMode} transparent animationType="fade">
        <Pressable style={s.modalBackdrop} onPress={() => setHpQuickMode(null)}>
          <Pressable style={s.modalCard} onPress={() => {}}>
            <View style={s.quickHpHeader}>
              <MaterialCommunityIcons
                name={hpQuickMode === 'damage' ? 'sword' : 'heart-plus'}
                size={24}
                color={hpQuickMode === 'damage' ? colors.hpDanger : colors.hpHealthy}
              />
              <Text style={s.modalTitle}>
                {hpQuickMode === 'damage' ? 'Deal Damage' : 'Heal'}
              </Text>
            </View>
            <TextInput
              style={[s.quickHpInput, {
                borderColor: hpQuickMode === 'damage' ? colors.hpDanger : colors.hpHealthy,
              }]}
              value={hpQuickInput}
              onChangeText={setHpQuickInput}
              keyboardType="number-pad"
              placeholder="Amount"
              placeholderTextColor={colors.textSecondary}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={applyQuickHp}
            />
            {hpQuickMode === 'damage' ? (
              <TouchableOpacity
                style={[s.fieldSaveBtn, { backgroundColor: colors.hpDanger, opacity: hpQuickInput.trim() ? 1 : 0.4 }]}
                onPress={applyQuickHp}
                disabled={!hpQuickInput.trim()}
              >
                <Text style={s.fieldSaveBtnText}>Apply Damage</Text>
              </TouchableOpacity>
            ) : (
              <View style={s.healBtnRow}>
                <TouchableOpacity
                  style={[s.healBtn, { backgroundColor: colors.hpHealthy, opacity: hpQuickInput.trim() ? 1 : 0.4 }]}
                  onPress={applyQuickHp}
                  disabled={!hpQuickInput.trim()}
                >
                  <Text style={s.fieldSaveBtnText}>Apply Healing</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.healBtn, { backgroundColor: '#3B82F6', opacity: hpQuickInput.trim() ? 1 : 0.4 }]}
                  onPress={applyTempHp}
                  disabled={!hpQuickInput.trim()}
                >
                  <Text style={s.fieldSaveBtnText}>Apply Temp HP</Text>
                </TouchableOpacity>
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const CARD = {
  backgroundColor: colors.surface,
  borderColor: colors.border,
  borderWidth: 1,
  borderRadius: 14,
  padding: spacing.md,
  overflow: 'hidden' as const,
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  container: { padding: spacing.lg, paddingBottom: 48 },
  loadingContainer: {
    flex: 1, backgroundColor: colors.background,
    justifyContent: 'center', alignItems: 'center',
  },
  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: spacing.md,
  },
  backText: { color: colors.brand, fontSize: 14 },
  settingsBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  settingsBtnText: {
    fontSize: 13, color: colors.textSecondary,
  },

  // Hero
  heroCard: {
    ...CARD,
    marginBottom: spacing.md,
  },
  heroTopRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  heroLeft: { position: 'relative' },
  heroRightGrid: {
    marginLeft: 'auto',
    flexDirection: 'row', gap: 8,
  },
  heroRightBox: {
    backgroundColor: colors.background, borderRadius: 8,
    paddingVertical: 8, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center',
  },
  heroRightValue: {
    fontSize: 18, fontWeight: '700', color: colors.textPrimary,
  },
  heroRightLabel: {
    fontSize: 9, fontWeight: '600', color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 1,
  },
  heroXpRow: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
  },
  heroXpAdd: {
    width: 16, height: 16, borderRadius: 8,
    borderWidth: 1, borderColor: colors.brand,
    alignItems: 'center', justifyContent: 'center',
  },
  heroNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  heroNameInput: {
    fontSize: 22,
    fontFamily: fonts.display,
    color: colors.textPrimary,
    borderBottomColor: colors.brand,
    borderBottomWidth: 1,
    paddingVertical: 2,
    marginBottom: 2,
  },
  manualBadge: {
    backgroundColor: colors.hpWarning + '22',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  manualBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.hpWarning,
  },
  heroAvatar: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: colors.background,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  heroAvatarImage: {
    width: 64, height: 64, borderRadius: 32,
  },
  heroAvatarEditIcon: {
    position: 'absolute', bottom: 2, right: 2,
  },
  heroBody: { flex: 1 },
  heroName: {
    fontSize: 22, fontFamily: fonts.display, color: colors.textPrimary,
    marginBottom: 2,
  },
  heroSubtitle: {
    fontSize: 15, color: colors.textSecondary, marginBottom: spacing.sm,
  },
  heroMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  levelBadge: {
    backgroundColor: colors.brand + '22', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 2,
    flexDirection: 'row', alignItems: 'center', gap: 4,
  },
  levelText: { fontSize: 12, fontWeight: '700', color: colors.brand },
  heroDetail: { fontSize: 12, color: colors.textSecondary },

  // Grid
  grid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md,
  },
  dragHandle: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 6, paddingHorizontal: spacing.md,
    marginBottom: spacing.xs,
    backgroundColor: colors.background, borderRadius: 8,
    borderWidth: 1, borderColor: colors.border,
  },
  dragHandleLabel: {
    fontSize: 11, color: colors.textSecondary, fontStyle: 'italic',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  dragArrow: {
    padding: 2,
  },

  fourColRow: {
    flexDirection: 'row', gap: spacing.md, width: '100%',
  },
  // Generic card
  card: { ...CARD, minWidth: 200, flex: 1, flexBasis: 200 },
  cardWide: { flexBasis: '100%' },
  profTrainingGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg, marginTop: spacing.xs,
  },
  profTrainingCol: {
    flex: 1, minWidth: 140,
  },
  profTrainingHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    marginBottom: spacing.xs,
    paddingBottom: 4, borderBottomColor: colors.border, borderBottomWidth: 1,
  },
  profTrainingLabel: {
    fontSize: 11, fontWeight: '700', color: colors.brand,
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  profTrainingItem: {
    fontSize: 13, color: colors.textPrimary, paddingVertical: 2,
  },
  profTrainingEmpty: {
    fontSize: 12, color: colors.textSecondary, fontStyle: 'italic',
  },
  attunementSlot: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: 6, borderBottomColor: colors.border, borderBottomWidth: 1,
  },
  attunementItemName: { fontSize: 13, color: colors.textPrimary },
  attunementEmpty: { fontSize: 12, color: colors.border, fontStyle: 'italic' },
  eqToggleRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: 10, borderBottomColor: colors.border, borderBottomWidth: 1,
    marginBottom: spacing.sm,
  },
  eqToggleText: { fontSize: 14, color: colors.textPrimary },
  coinRow: {
    flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm,
  },
  coinCell: {
    flex: 1, alignItems: 'center',
  },
  coinArrow: {
    padding: 2,
  },
  coinValueBox: {
    backgroundColor: colors.background, borderColor: colors.border,
    borderWidth: 1, borderRadius: 8,
    width: '100%', paddingVertical: 8, alignItems: 'center',
  },
  coinValue: {
    fontSize: 18, fontWeight: '700', color: colors.textPrimary,
  },
  coinLabel: {
    fontSize: 10, fontWeight: '600', color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4,
  },
  scratchpadInput: {
    backgroundColor: colors.background, borderColor: colors.border,
    borderWidth: 1, borderRadius: 8, color: colors.textPrimary,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14,
    minHeight: 120, lineHeight: 20,
  },
  cardLabel: {
    fontSize: 11, fontWeight: '700', color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10,
  },

  // HP card
  hpCard: {
    ...CARD, minWidth: 200, flex: 1, flexBasis: 200, alignItems: 'center',
  },
  hpRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', width: '100%' },
  hpBox: {
    borderWidth: 2, borderRadius: 10,
    flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center',
    paddingHorizontal: 12, paddingVertical: 2,
  },
  hpTempInline: {
    fontSize: 20, fontWeight: '700', color: '#3B82F6', marginLeft: 2,
  },
  hpValue: { fontSize: 40, fontWeight: '700', lineHeight: 44 },
  hpSep: { fontSize: 20, color: colors.textSecondary, marginHorizontal: 6 },
  hpMax: { fontSize: 20, color: colors.textSecondary },
  hpBarTrack: {
    width: '100%', height: 10, backgroundColor: colors.border,
    borderRadius: 5, marginTop: spacing.sm, overflow: 'hidden',
    flexDirection: 'row',
  },
  hpBarFill: { height: 10, borderRadius: 5 },
  hpBarTemp: { height: 10, backgroundColor: '#3B82F6' },
  hpQuickBtn: {
    width: 44, height: 44,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 8,
    borderColor: colors.border,
  },
  hpQuickBtnLeft: { marginRight: 'auto' },
  tapHint: { fontSize: 12, color: colors.brand, marginTop: spacing.sm, fontWeight: '600' },

  // Quick HP modal
  quickHpHeader: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md,
  },
  healBtnRow: {
    flexDirection: 'row', gap: spacing.sm,
  },
  healBtn: {
    flex: 1, borderRadius: 8, paddingVertical: 12, alignItems: 'center',
  },
  quickHpInput: {
    backgroundColor: colors.background, borderWidth: 2,
    borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 28, fontWeight: '700', color: colors.textPrimary,
    textAlign: 'center', marginBottom: spacing.md,
  },


  // Combat stats (inside HP card)
  combatDivider: {
    height: 1, backgroundColor: colors.border,
    marginVertical: spacing.md, width: '100%',
  },
  combatGrid: {
    flexDirection: 'row', gap: spacing.sm, width: '100%',
    marginTop: spacing.sm,
  },
  combatStat: {
    alignItems: 'center', justifyContent: 'center', flex: 1,
    backgroundColor: colors.background, borderRadius: 10,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.sm,
    position: 'relative', overflow: 'hidden', gap: 4,
  },
  combatBgIcon: {
    position: 'absolute',
  },
  shieldToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    marginTop: spacing.sm, paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 6, borderWidth: 1, borderColor: colors.border,
  },
  shieldToggleActive: {
    borderColor: colors.brand, backgroundColor: colors.brand + '22',
  },
  shieldToggleText: {
    fontSize: 11, fontWeight: '600', color: colors.textSecondary,
  },
  combatValue: { fontSize: 28, fontWeight: '700', color: colors.textPrimary },
  combatLabel: {
    fontSize: 11, fontWeight: '600', color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4,
  },

  // Ability scores
  movGrid: {
    flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm,
  },
  movStat: {
    flex: 1, backgroundColor: colors.background, borderRadius: 10,
    paddingVertical: spacing.lg, alignItems: 'center',
  },
  abilityQuickStats: {
    flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg,
  },
  abilityQuickStat: {
    flex: 1, backgroundColor: colors.background, borderRadius: 10,
    paddingVertical: spacing.lg, alignItems: 'center',
  },
  abilityQuickValue: {
    fontSize: 28, fontWeight: '700', color: colors.textPrimary,
  },
  abilityQuickLabel: {
    fontSize: 11, fontWeight: '600', color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4,
    textAlign: 'center', lineHeight: 16,
  },
  abilityHeaderRow: {
    flexDirection: 'row', alignItems: 'center', paddingBottom: 6,
    borderBottomColor: colors.border, borderBottomWidth: 1, marginBottom: 0,
  },
  abilityHeaderText: {
    fontSize: 10, fontWeight: '600', color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  abilityRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 8,
    borderBottomColor: colors.border, borderBottomWidth: 1,
  },
  abilityLabel: {
    fontSize: 13, fontWeight: '700', color: colors.textSecondary, width: 36,
  },
  abilityScore: {
    fontSize: 17, fontWeight: '700', color: colors.brand, width: 32, textAlign: 'center',
  },
  abilityModCol: {
    fontSize: 14, fontWeight: '600', color: colors.textPrimary,
    width: 36, textAlign: 'center',
  },
  abilityBody: {
    position: 'relative',
  },
  saveSpacer: { flex: 1 },
  saveCell: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    width: 54, gap: 6,
  },
  saveModText: {
    fontSize: 14, fontWeight: '700', color: colors.textPrimary,
  },
  profDotSmall: {
    width: 7, height: 7, borderRadius: 4,
    borderWidth: 1, borderColor: colors.border,
  },

  // Skills / saves
  skillRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 3 },
  profDot: {
    width: 8, height: 8, borderRadius: 4,
    borderWidth: 1, borderColor: colors.border, marginRight: 8,
  },
  profDotFilled: { backgroundColor: colors.brand, borderColor: colors.brand },
  skillName: { fontSize: 13, color: colors.textSecondary, flex: 1 },
  skillAbility: { fontSize: 11, color: colors.textSecondary, marginRight: 8 },
  skillModText: {
    fontSize: 13, fontWeight: '700', color: colors.textPrimary,
    minWidth: 28, textAlign: 'right',
  },

  // Death saves
  deathSavesRow: { flexDirection: 'row', gap: 24, justifyContent: 'center' },
  deathSaveSide: { alignItems: 'center', gap: 8 },
  deathSaveLabel: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
  savePips: { flexDirection: 'row', gap: 8 },
  savePip: {
    width: 24, height: 24, borderRadius: 12,
    borderWidth: 2, borderColor: colors.border,
  },
  savePipSuccess: { backgroundColor: colors.hpHealthy, borderColor: colors.hpHealthy },
  savePipFailure: { backgroundColor: colors.hpDanger, borderColor: colors.hpDanger },
  stabilizedHint: { fontSize: 12, textAlign: 'center', marginTop: 10, color: colors.hpHealthy },

  concentrationRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6,
  },
  concentrationSpell: {
    flex: 1, fontSize: 14, fontWeight: '600', color: colors.textPrimary,
  },
  concentrationClearBtn: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 6,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  concentrationClearText: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
  concentrationSetBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6,
    alignSelf: 'flex-start',
  },
  concentrationSetText: { fontSize: 12, color: colors.textSecondary, fontStyle: 'italic' },


  // Level grid
  lvlGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm,
  },
  lvlXpBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.background, borderRadius: 10,
    paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  lvlSection: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    flexShrink: 0,
  },
  lvlLabel: {
    fontSize: 11, fontWeight: '600', color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  lvlValue: {
    fontSize: 20, fontWeight: '700', color: colors.textPrimary,
  },
  lvlDivider: {
    width: 1, height: 24, backgroundColor: colors.border,
    marginHorizontal: spacing.sm,
  },
  xpSection: {
    flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1,
  },
  xpValue: {
    fontSize: 20, fontWeight: '700', color: colors.textPrimary, flexShrink: 1,
  },
  xpAddBtn: {
    width: 26, height: 26, borderRadius: 13,
    borderWidth: 1, borderColor: colors.brand,
    alignItems: 'center', justifyContent: 'center',
  },
  lvlStat: {
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.background, borderRadius: 10,
    paddingVertical: spacing.lg, position: 'relative', overflow: 'hidden',
    flex: 1, minWidth: '45%',
  },

  // Attack table
  atkTableHeader: {
    flexDirection: 'row', borderBottomColor: colors.border, borderBottomWidth: 1,
    paddingBottom: 6, marginBottom: 2,
  },
  atkHeaderText: {
    fontSize: 10, fontWeight: '600', color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  atkTableRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 8, borderBottomColor: colors.border, borderBottomWidth: 1,
  },
  atkCellName: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  atkCellText: { fontSize: 13, color: colors.textPrimary },
  atkCellNotes: { fontSize: 11, color: colors.textSecondary },

  // Equipment
  equipHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  equipEmpty: { fontSize: 13, color: colors.textSecondary, marginTop: spacing.sm },
  equipSubLabel: {
    fontSize: 10, fontWeight: '700', color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.8, marginTop: spacing.xs, marginBottom: 4,
  },
  equipRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 8, borderBottomColor: colors.border, borderBottomWidth: 1,
  },
  equipRowDim: { opacity: 0.45 },
  equipToggle: { marginRight: spacing.sm },
  equipInfo: { flex: 1 },
  equipName: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  equipDetail: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  equipProps: { fontSize: 11, color: colors.textSecondary, fontStyle: 'italic' },

  // Equipment modal
  eqLabel: {
    fontSize: 11, fontWeight: '600', color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5, marginTop: spacing.md, marginBottom: spacing.xs,
  },
  eqInput: {
    backgroundColor: colors.background, borderColor: colors.border,
    borderWidth: 1, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    color: colors.textPrimary, fontSize: 15,
  },
  eqSlotRow: { flexDirection: 'row', gap: spacing.sm },
  eqSlotBtn: {
    flex: 1, paddingVertical: 8, borderRadius: 8,
    borderWidth: 1, borderColor: colors.border, alignItems: 'center',
  },
  eqSlotBtnActive: {
    borderColor: colors.brand, backgroundColor: colors.brand + '22',
  },
  eqSlotText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  eqSlotTextActive: { color: colors.brand },
  eqDeleteBtn: {
    alignItems: 'center', paddingVertical: spacing.md,
  },
  eqDeleteText: { fontSize: 14, color: colors.hpDanger, fontWeight: '600' },

  // Features
  featureRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 8, borderBottomColor: colors.border, borderBottomWidth: 1,
  },
  featureInfo: { flex: 1 },
  featureName: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  featureDesc: { fontSize: 12, color: colors.textSecondary, marginTop: 2, lineHeight: 17 },
  featureUses: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: spacing.sm,
  },
  featureUsesText: { fontSize: 14, fontWeight: '700', color: colors.textPrimary, minWidth: 28, textAlign: 'center' },

  // Attribution
  attribution: {
    fontSize: 11, color: colors.textSecondary,
    textAlign: 'center', lineHeight: 16, marginTop: spacing.md,
  },

  // Modals
  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center', alignItems: 'center',
  },
  modalCard: {
    backgroundColor: colors.surface, borderRadius: 14,
    borderColor: colors.border, borderWidth: 1,
    width: '90%', maxWidth: 400, padding: spacing.lg,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: spacing.lg,
  },
  modalTitle: {
    fontSize: 18, fontWeight: '700', color: colors.textPrimary,
    marginBottom: spacing.md,
  },

  // Settings
  settingRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
  },
  settingLabel: {
    fontSize: 15, fontWeight: '600', color: colors.textPrimary,
    marginBottom: 4,
  },
  settingDesc: {
    fontSize: 13, color: colors.textSecondary, lineHeight: 18,
  },

  // Field edit
  hpEditRow: {
    flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md,
  },
  hpEditField: { flex: 1 },
  hpEditLabel: {
    fontSize: 11, fontWeight: '600', color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.xs,
  },
  fieldInput: {
    backgroundColor: colors.background, borderColor: colors.border,
    borderWidth: 1, borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 24, fontWeight: '700', color: colors.textPrimary,
    textAlign: 'center', marginBottom: spacing.md,
  },
  fieldSaveBtn: {
    backgroundColor: colors.brand, borderRadius: 8,
    paddingVertical: 12, alignItems: 'center',
  },
  fieldSaveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
