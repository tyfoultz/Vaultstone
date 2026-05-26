import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, Pressable, TextInput, StyleSheet,
  ActivityIndicator, FlatList, Modal, ScrollView, Alert, Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  supabase, getActiveSession,
  getInitiativeOrder, addCombatant, removeCombatant, clearAllCombatants,
  advanceTurn, updateCombatant, updateCharacterHp, updateCharacterConditions,
  rollCombatantInitiative, setCombatantInitOverride, startCombat,
  resetInitiative, endCombat, sortByInitiative,
} from '@vaultstone/api';
import { loadCreatureByKey } from '../../../components/creatures/creatureCache';
import { SRD_CONDITIONS } from '../../../components/character-sheet/ConditionsPanel';
import { SessionLogFeed } from '../../../components/session/SessionLogFeed';
import { CreaturePickerModal, type AddCreatureInput } from '../../../components/combat/CreaturePickerModal';
import { CreatureStatBlock } from '../../../components/creatures/CreatureStatBlock';
import { SpellPinProvider } from '../../../components/creatures/SpellTooltip';
import { PinnedSpellsOverlay, usePinnedSpells } from '../../../components/combat/PinnedSpellsOverlay';
import { CombatHpModal } from '../../../components/combat/CombatHpModal';
import { useAuthStore, useCampaignStore } from '@vaultstone/store';
import { colors, fonts, spacing, radius, HpBar, hpColor, useBreakpoint } from '@vaultstone/ui';
import type {
  Database, Dnd5eStats, Dnd5eResources, Dnd5eEquipmentItem,
  CreatureResult,
} from '@vaultstone/types';

type Session = Database['public']['Tables']['sessions']['Row'];
type Campaign = Database['public']['Tables']['campaigns']['Row'];
type Combatant = Database['public']['Tables']['initiative_order']['Row'];

type PartyPick = {
  userId: string;
  characterId: string;
  name: string;
  hpMax: number;
  hpCurrent: number;
  ac: number;
  initMod: number;
  selected: boolean;
};

function abilityMod(score: number) { return Math.floor((score - 10) / 2); }

function computeAc(stats: Dnd5eStats, resources: Dnd5eResources): number {
  const dexMod = abilityMod(stats.abilityScores.dexterity);
  const equipment: Dnd5eEquipmentItem[] = resources.equipment ?? [];
  const armor = equipment.find((e) => e.slot === 'armor' && e.equipped);
  const shield = equipment.find((e) => e.slot === 'shield' && e.equipped);
  let base = 10 + dexMod;
  if (armor) {
    const cap = armor.dexCap;
    const dexBonus = cap !== undefined && cap !== null ? Math.min(dexMod, cap) : dexMod;
    base = (armor.acBase ?? 10) + dexBonus;
  }
  if (shield) base += shield.acBonus ?? 2;
  return base;
}

function formatMod(n: number) { return n >= 0 ? `+${n}` : `${n}`; }

export default function CombatScreen() {
  const { id, playerView } = useLocalSearchParams<{ id: string; playerView?: string }>();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const { campaigns } = useCampaignStore();

  const [session, setSession] = useState<Session | null>(null);
  const [campaign, setCampaign] = useState<Campaign | null>(
    campaigns.find((c) => c.id === id) ?? null,
  );
  const [entries, setEntries] = useState<Combatant[]>([]);
  const [loading, setLoading] = useState(true);
  const [advancing, setAdvancing] = useState(false);

  const [pickerVisible, setPickerVisible] = useState(false);

  const [addingParty, setAddingParty] = useState(false);
  const [partyLoading, setPartyLoading] = useState(false);
  const [partyPicks, setPartyPicks] = useState<PartyPick[]>([]);
  const [addingSelected, setAddingSelected] = useState(false);

  const [pcConditions, setPcConditions] = useState<Record<string, string[]>>({});
  const [npcConditions, setNpcConditions] = useState<Record<string, string[]>>({});
  const [editingConditionsFor, setEditingConditionsFor] = useState<Combatant | null>(null);
  const [myCharacterIds, setMyCharacterIds] = useState<Set<string>>(new Set());

  const [rollingAll, setRollingAll] = useState(false);
  const [startingCombat, setStartingCombat] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [endingCombat, setEndingCombat] = useState(false);
  const [clearingAll, setClearingAll] = useState(false);

  // Multi-panel stat blocks: set of combatant IDs with open panels
  const [openStatBlocks, setOpenStatBlocks] = useState<string[]>([]);
  const [creatureCache, setCreatureCache] = useState<Record<string, CreatureResult>>({});

  // HP editing modal state
  const [hpEditTarget, setHpEditTarget] = useState<Combatant | null>(null);

  // PC stat preview
  const [pcPreview, setPcPreview] = useState<{ name: string; stats: Dnd5eStats; resources: Dnd5eResources } | null>(null);

  // Initiative click-to-edit state
  const [initEditFor, setInitEditFor] = useState<string | null>(null);
  const [initEditValue, setInitEditValue] = useState('');

  // Name click-to-edit state (DM rename)
  const [nameEditFor, setNameEditFor] = useState<string | null>(null);
  const [nameEditValue, setNameEditValue] = useState('');

  // Session log floating window
  const [logOpen, setLogOpen] = useState(false);
  const [logDragOffset, setLogDragOffset] = useState({ x: 0, y: 0 });
  const logDragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  // Pinned spells
  const { pinned, pinSpell, unpinSpell, toggleMinimize } = usePinnedSpells();

  const bp = useBreakpoint();
  const isWideLayout = bp.isDesktop || bp.isWide;

  const isDM = campaign?.dm_user_id === user?.id;
  const showPlayerView = !isDM || playerView === 'true';
  const combatStarted = !!session?.combat_started_at;
  const displayEntries = useMemo(
    () => combatStarted ? sortByInitiative(entries) : entries,
    [entries, combatStarted],
  );
  const visibleEntries = useMemo(() => {
    if (!showPlayerView) return displayEntries;
    return displayEntries.filter((e) => e.character_id !== null || e.revealed);
  }, [displayEntries, showPlayerView]);
  const allRolled = entries.length > 0 &&
    entries.every((e) => e.init_roll !== null || e.init_override !== null);
  const anyRolled = entries.some((e) => e.init_roll !== null || e.init_override !== null);

  const activeCombatant = displayEntries.find((e) => e.is_active_turn);

  async function refetchEntries(sessionId: string) {
    const { data } = await getInitiativeOrder(sessionId);
    setEntries((data ?? []) as Combatant[]);
  }

  async function refreshPcConditions(campaignId: string) {
    const { data } = await supabase
      .from('characters')
      .select('id, conditions, user_id')
      .eq('campaign_id', campaignId);
    if (!data) return;
    const map: Record<string, string[]> = {};
    const mine = new Set<string>();
    for (const row of data) {
      map[row.id] = row.conditions ?? [];
      if (user && row.user_id === user.id) mine.add(row.id);
    }
    setPcConditions(map);
    setMyCharacterIds(mine);
  }

  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      let cancelled = false;
      (async () => {
        const { data: s } = await getActiveSession(id);
        if (cancelled) return;
        if (!s) {
          router.replace(`/campaign/${id}` as never);
          return;
        }
        setSession(s);
        if (!campaign) {
          const { data: c } = await supabase
            .from('campaigns').select('*').eq('id', id).single();
          if (!cancelled && c) setCampaign(c);
        }
        const { data: init } = await getInitiativeOrder(s.id);
        if (!cancelled) setEntries((init ?? []) as Combatant[]);
        await refreshPcConditions(id);
        setLoading(false);
      })();
      return () => { cancelled = true; };
    }, [id])
  );

  useEffect(() => {
    if (!session) return;
    const channel = supabase
      .channel(`session:${session.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'sessions', filter: `id=eq.${session.id}` },
        (payload) => {
          const next = payload.new as Session;
          if (next.ended_at) {
            router.replace(`/campaign/${id}` as never);
          } else {
            setSession(next);
          }
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'initiative_order', filter: `session_id=eq.${session.id}` },
        async () => {
          const { data } = await getInitiativeOrder(session.id);
          setEntries((data ?? []) as Combatant[]);
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'characters', filter: `campaign_id=eq.${id}` },
        (payload) => {
          const next = payload.new as { id: string; conditions: string[] | null };
          setPcConditions((prev) => ({ ...prev, [next.id]: next.conditions ?? [] }));
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session?.id]);

  // --- Creature loading ---

  async function loadCreature(key: string): Promise<CreatureResult | null> {
    if (creatureCache[key]) return creatureCache[key];
    const creature = await loadCreatureByKey(key);
    if (creature) {
      setCreatureCache((prev) => ({ ...prev, [key]: creature }));
    }
    return creature;
  }

  async function handleSelectCombatant(combatant: Combatant) {
    if (!combatant.creature_key) return;
    setOpenStatBlocks((prev) => {
      if (prev.includes(combatant.id)) return prev;
      return [...prev, combatant.id];
    });
    await loadCreature(combatant.creature_key);
  }

  function closeStatBlock(combatantId: string) {
    setOpenStatBlocks((prev) => prev.filter((id) => id !== combatantId));
  }

  // --- HP management ---

  async function handleHpApply(combatant: Combatant, patch: { hp_current?: number; hp_max?: number; hp_temp?: number }) {
    setEntries((prev) => prev.map((e) =>
      e.id === combatant.id ? { ...e, ...patch } : e,
    ));
    if (!session) return;

    if (combatant.character_id) {
      const combatantPatch: Record<string, number> = {};
      if (patch.hp_current !== undefined) combatantPatch.hp_current = patch.hp_current;
      if (patch.hp_temp !== undefined) combatantPatch.hp_temp = patch.hp_temp;
      await updateCombatant(combatant.id, combatantPatch);
      if (patch.hp_current !== undefined) {
        await updateCharacterHp(combatant.character_id, patch.hp_current, {
          sessionId: session.id,
          targetName: combatant.display_name,
          actorId: user?.id ?? null,
        });
      }
    } else {
      const oldHp = combatant.hp_current;
      await updateCombatant(
        combatant.id,
        patch,
        patch.hp_current !== undefined && patch.hp_current !== oldHp
          ? {
              sessionId: session.id,
              actorId: user?.id ?? null,
              hpContext: { oldHp, name: combatant.display_name },
            }
          : undefined,
      );
    }
  }

  async function handleRemove(combatantId: string) {
    if (!session) return;
    setEntries((prev) => prev.filter((e) => e.id !== combatantId));
    closeStatBlock(combatantId);
    await removeCombatant(combatantId);
    await refetchEntries(session.id);
  }

  // --- Conditions ---

  async function toggleCondition(characterId: string, condition: string) {
    const current = pcConditions[characterId] ?? [];
    const has = current.some((c) => c.toLowerCase() === condition.toLowerCase());
    const next = has
      ? current.filter((c) => c.toLowerCase() !== condition.toLowerCase())
      : [...current, condition];
    setPcConditions((prev) => ({ ...prev, [characterId]: next }));
    if (!session) return;
    const combatant = entries.find((e) => e.character_id === characterId);
    await updateCharacterConditions(characterId, next, {
      sessionId: session.id,
      targetName: combatant?.display_name ?? 'Character',
      actorId: user?.id ?? null,
    });
  }

  async function handlePcPreview(combatant: Combatant) {
    if (!combatant.character_id) return;
    const { data } = await supabase
      .from('characters')
      .select('name, base_stats, resources')
      .eq('id', combatant.character_id)
      .single();
    if (data) {
      setPcPreview({
        name: data.name,
        stats: data.base_stats as unknown as Dnd5eStats,
        resources: data.resources as unknown as Dnd5eResources,
      });
    }
  }

  function toggleNpcCondition(combatantId: string, condition: string) {
    setNpcConditions((prev) => {
      const current = prev[combatantId] ?? [];
      const has = current.some((c) => c.toLowerCase() === condition.toLowerCase());
      const next = has
        ? current.filter((c) => c.toLowerCase() !== condition.toLowerCase())
        : [...current, condition];
      return { ...prev, [combatantId]: next };
    });
  }

  // --- Initiative editing ---

  async function handleInitSubmit(combatantId: string) {
    if (!session) return;
    const total = parseInt(initEditValue, 10);
    if (Number.isNaN(total)) { setInitEditFor(null); return; }
    await setCombatantInitOverride(combatantId, total, {
      sessionId: session.id,
      actorId: user?.id ?? null,
    });
    setInitEditFor(null);
    setInitEditValue('');
    await refetchEntries(session.id);
  }

  // --- Name editing (DM rename) ---

  async function handleNameSubmit(combatantId: string, originalName: string) {
    const trimmed = nameEditValue.trim();
    setNameEditFor(null);
    setNameEditValue('');
    if (!trimmed || trimmed === originalName) return;
    await updateCombatant(combatantId, { display_name: trimmed });
    if (session) await refetchEntries(session.id);
  }

  // --- Party picker ---

  async function openPartyPicker() {
    if (!id) return;
    setAddingParty(true);
    setPartyLoading(true);
    const { data } = await supabase
      .from('characters')
      .select('id, name, user_id, base_stats, resources')
      .eq('campaign_id', id);
    const characters = data ?? [];
    const existingCharIds = new Set(
      entries.map((e) => e.character_id).filter((x): x is string => !!x),
    );
    const picks: PartyPick[] = characters
      .filter((c) => !existingCharIds.has(c.id))
      .map((c) => {
        const stats = c.base_stats as unknown as Dnd5eStats;
        const resources = c.resources as unknown as Dnd5eResources;
        const dexMod = abilityMod(stats.abilityScores.dexterity);
        const hpMax = stats.hpMax ?? 0;
        const hpCurrent = resources.hpCurrent ?? hpMax;
        return {
          userId: c.user_id,
          characterId: c.id,
          name: c.name,
          hpMax,
          hpCurrent,
          ac: computeAc(stats, resources),
          initMod: dexMod,
          selected: true,
        };
      });
    setPartyPicks(picks);
    setPartyLoading(false);
  }

  function closePartyPicker() {
    setAddingParty(false);
    setPartyPicks([]);
  }

  async function handleAddParty() {
    if (!session || addingSelected) return;
    const chosen = partyPicks.filter((p) => p.selected);
    if (chosen.length === 0) return;
    setAddingSelected(true);
    await Promise.all(
      chosen.map((p) => addCombatant({
        sessionId: session.id,
        name: p.name,
        initMod: p.initMod,
        hpMax: p.hpMax,
        ac: p.ac,
        characterId: p.characterId,
      })),
    );
    await refetchEntries(session.id);
    setAddingSelected(false);
    closePartyPicker();
  }

  async function handleAddCreatures(inputs: AddCreatureInput[]) {
    if (!session) return;
    await Promise.all(
      inputs.map((c) => addCombatant({
        sessionId: session.id,
        name: c.name,
        initMod: c.initMod,
        hpMax: c.hpMax,
        ac: c.ac,
        creatureKey: c.creatureKey || null,
      })),
    );
    await refetchEntries(session.id);
    setPickerVisible(false);
  }

  // --- Rolling ---

  async function handleRollOne(combatant: Combatant) {
    const canRoll = isDM || (!!combatant.character_id && myCharacterIds.has(combatant.character_id));
    if (!canRoll || !session) return;
    await rollCombatantInitiative(combatant.id, undefined, {
      sessionId: session.id,
      actorId: user?.id ?? null,
    });
    await refetchEntries(session.id);
  }

  async function handleRollAll() {
    if (!session || rollingAll) return;
    const unrolled = entries.filter((e) => e.init_roll === null && e.init_override === null);
    if (unrolled.length === 0) return;
    setRollingAll(true);
    await Promise.all(unrolled.map((e) => rollCombatantInitiative(e.id, undefined, {
      sessionId: session.id,
      actorId: user?.id ?? null,
    })));
    await refetchEntries(session.id);
    setRollingAll(false);
  }

  // --- Combat lifecycle ---

  async function handleStartCombat() {
    if (!session || startingCombat) return;
    setStartingCombat(true);
    await startCombat(session.id, { sessionId: session.id, actorId: user?.id ?? null });
    const { data: freshSession } = await getActiveSession(id!);
    if (freshSession) setSession(freshSession);
    const { data: raw } = await getInitiativeOrder(session.id);
    const sorted = sortByInitiative((raw ?? []) as Combatant[]);
    if (sorted.length > 0) {
      await updateCombatant(sorted[0].id, { is_active_turn: true, revealed: true });
    }
    await refetchEntries(session.id);
    setStartingCombat(false);
  }

  async function handleResetInitiative() {
    if (!session || resetting) return;
    const confirmed = Platform.OS === 'web'
      ? window.confirm('Reset all initiative rolls and end combat?')
      : await new Promise<boolean>((resolve) => {
          Alert.alert(
            'Reset Initiative?',
            'All rolls will be cleared and combat ended. Combatants stay.',
            [
              { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Reset', style: 'destructive', onPress: () => resolve(true) },
            ],
          );
        });
    if (!confirmed) return;
    setResetting(true);
    await resetInitiative(session.id);
    const { data: freshSession } = await getActiveSession(id!);
    if (freshSession) setSession(freshSession);
    await refetchEntries(session.id);
    setResetting(false);
  }

  async function handleEndCombat() {
    if (!session || endingCombat) return;
    const confirmed = Platform.OS === 'web'
      ? window.confirm('End combat? Initiative rolls will be kept.')
      : await new Promise<boolean>((resolve) => {
          Alert.alert(
            'End Combat?',
            'Combat will stop but rolls and combatants are kept.',
            [
              { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
              { text: 'End', style: 'destructive', onPress: () => resolve(true) },
            ],
          );
        });
    if (!confirmed) return;
    setEndingCombat(true);
    await endCombat(session.id, { sessionId: session.id, actorId: user?.id ?? null });
    const { data: freshSession } = await getActiveSession(id!);
    if (freshSession) setSession(freshSession);
    await refetchEntries(session.id);
    setEndingCombat(false);
  }

  async function handleClearAll() {
    if (!session || clearingAll || entries.length === 0) return;
    const confirmed = Platform.OS === 'web'
      ? window.confirm('Remove all combatants? This cannot be undone.')
      : await new Promise<boolean>((resolve) => {
          Alert.alert(
            'Clear All Combatants?',
            'This will remove every combatant from the tracker. This cannot be undone.',
            [
              { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Clear All', style: 'destructive', onPress: () => resolve(true) },
            ],
          );
        });
    if (!confirmed) return;
    setClearingAll(true);
    await clearAllCombatants(session.id);
    await refetchEntries(session.id);
    setClearingAll(false);
  }

  async function handleNextTurn() {
    if (!session || advancing || entries.length === 0) return;
    setAdvancing(true);
    await advanceTurn(session.id);
    await refetchEntries(session.id);
    const { data: s } = await getActiveSession(id);
    if (s) setSession(s);
    setAdvancing(false);
  }

  async function handlePrevTurn() {
    if (!session || advancing || entries.length === 0) return;
    setAdvancing(true);
    const sorted = sortByInitiative(entries);
    const currentIdx = sorted.findIndex((e) => e.is_active_turn);
    const prevIdx = currentIdx <= 0 ? sorted.length - 1 : currentIdx - 1;
    const wrapped = currentIdx !== -1 && prevIdx === sorted.length - 1;

    if (currentIdx !== -1) {
      await updateCombatant(sorted[currentIdx].id, { is_active_turn: false });
    }
    await updateCombatant(sorted[prevIdx].id, { is_active_turn: true, revealed: true });

    if (wrapped && session.round > 1) {
      await supabase
        .from('sessions')
        .update({ round: session.round - 1 })
        .eq('id', session.id);
    }

    await refetchEntries(session.id);
    const { data: s } = await getActiveSession(id);
    if (s) setSession(s);
    setAdvancing(false);
  }

  // --- Render ---

  if (loading) {
    return (
      <View style={st.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (!session) return null;

  const statBlockPanels = openStatBlocks
    .map((cId) => {
      const combatant = entries.find((e) => e.id === cId);
      if (!combatant?.creature_key) return null;
      const creature = creatureCache[combatant.creature_key] ?? null;
      return { combatant, creature };
    })
    .filter(Boolean) as Array<{ combatant: Combatant; creature: CreatureResult | null }>;

  return (
    <SpellPinProvider onPin={pinSpell}>
      <View style={st.container}>
        {/* ===== HEADER ===== */}
        <View style={st.header}>
          <View style={st.headerLeft}>
            <TouchableOpacity
              onPress={() => router.replace(`/campaign/${id}` as never)}
              style={st.headerBack}
            >
              <MaterialCommunityIcons name="arrow-left" size={22} color={colors.onSurface} />
            </TouchableOpacity>
            <View>
              <Text style={st.title} numberOfLines={1}>Combat Encounter</Text>
              <View style={st.subtitleRow}>
                <Text style={st.subtitle} numberOfLines={1}>
                  {campaign?.name ?? ''}
                </Text>
                {combatStarted && (
                  <View style={st.liveBadge}>
                    <View style={st.liveDot} />
                    <Text style={st.liveText}>Live</Text>
                  </View>
                )}
              </View>
            </View>
          </View>
          <View style={st.headerRight}>
            {combatStarted && (
              <View style={st.roundInfo}>
                <Text style={st.roundLabel}>ROUND</Text>
                <View style={st.roundBadge}>
                  <Text style={st.roundNumber}>{session.round}</Text>
                </View>
                {activeCombatant && (
                  <Text style={st.turnName} numberOfLines={1}>
                    {activeCombatant.display_name}'s turn
                  </Text>
                )}
              </View>
            )}
            {combatStarted && isDM && (
              <>
                <TouchableOpacity
                  style={[st.prevTurnBtn, (advancing || entries.length === 0) && { opacity: 0.5 }]}
                  onPress={handlePrevTurn}
                  disabled={advancing || entries.length === 0}
                >
                  <MaterialCommunityIcons name="skip-previous" size={16} color={colors.onSurface} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[st.nextTurnBtn, (advancing || entries.length === 0) && { opacity: 0.5 }]}
                  onPress={handleNextTurn}
                  disabled={advancing || entries.length === 0}
                >
                  <MaterialCommunityIcons name="skip-next" size={16} color="#fff" />
                  <Text style={st.nextTurnBtnText}>
                    {advancing ? '...' : 'Next Turn'}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>

        {/* ===== CONTROLS BAR ===== */}
        {isDM && (
          <View style={st.controls}>
            <View style={st.controlsLeft}>
              <TouchableOpacity
                style={[st.controlBtn, logOpen && st.controlBtnActive]}
                onPress={() => { setLogOpen((v) => !v); setLogDragOffset({ x: 0, y: 0 }); }}
              >
                <MaterialCommunityIcons name="timeline-text-outline" size={14} color={logOpen ? colors.primary : colors.textPrimary} />
                <Text style={[st.controlBtnText, logOpen && { color: colors.primary }]}>Log</Text>
              </TouchableOpacity>
              <TouchableOpacity style={st.controlBtn} onPress={() => setPickerVisible(true)}>
                <MaterialCommunityIcons name="plus" size={14} color={colors.onSurface} />
                <Text style={st.controlBtnText}>Add Combatant</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={st.controlBtn}
                onPress={() => (addingParty ? closePartyPicker() : openPartyPicker())}
              >
                <MaterialCommunityIcons
                  name={addingParty ? 'close' : 'account-multiple-plus'}
                  size={14} color={colors.onSurface}
                />
                <Text style={st.controlBtnText}>{addingParty ? 'Cancel' : 'Add Party'}</Text>
              </TouchableOpacity>
              {entries.length > 0 && (
                <TouchableOpacity
                  style={[st.controlBtn, clearingAll && { opacity: 0.5 }]}
                  onPress={handleClearAll}
                  disabled={clearingAll}
                >
                  <MaterialCommunityIcons name="delete-sweep-outline" size={14} color={colors.hpDanger} />
                  <Text style={[st.controlBtnText, { color: colors.hpDanger }]}>
                    {clearingAll ? 'Clearing...' : 'Clear All'}
                  </Text>
                </TouchableOpacity>
              )}
              {!combatStarted && !allRolled && entries.length > 0 && (
                <TouchableOpacity
                  style={[st.controlBtn, rollingAll && { opacity: 0.5 }]}
                  onPress={handleRollAll}
                  disabled={rollingAll}
                >
                  <MaterialCommunityIcons name="dice-d20" size={14} color={colors.primary} />
                  <Text style={st.controlBtnText}>{rollingAll ? 'Rolling...' : 'Roll All'}</Text>
                </TouchableOpacity>
              )}
              {(combatStarted || anyRolled) && (
                <TouchableOpacity
                  style={[st.controlBtn, resetting && { opacity: 0.5 }]}
                  onPress={handleResetInitiative}
                  disabled={resetting}
                >
                  <MaterialCommunityIcons name="restart" size={14} color={colors.hpDanger} />
                  <Text style={[st.controlBtnText, { color: colors.hpDanger }]}>
                    {resetting ? 'Resetting...' : 'Reset'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
            <View style={st.controlsRight}>
              {!combatStarted && allRolled && (
                <TouchableOpacity
                  style={[st.controlBtnPrimary, startingCombat && { opacity: 0.5 }]}
                  onPress={handleStartCombat}
                  disabled={startingCombat}
                >
                  <MaterialCommunityIcons name="sword-cross" size={14} color="#fff" />
                  <Text style={st.controlBtnPrimaryText}>
                    {startingCombat ? 'Starting...' : 'Start Combat'}
                  </Text>
                </TouchableOpacity>
              )}
              {combatStarted && (
                <TouchableOpacity
                  style={[st.controlBtn, endingCombat && { opacity: 0.5 }]}
                  onPress={handleEndCombat}
                  disabled={endingCombat}
                >
                  <MaterialCommunityIcons name="stop-circle-outline" size={14} color={colors.hpDanger} />
                  <Text style={[st.controlBtnText, { color: colors.hpDanger }]}>
                    {endingCombat ? 'Ending...' : 'End Combat'}
                  </Text>
                </TouchableOpacity>
              )}
              {Platform.OS === 'web' && (
                <TouchableOpacity
                  style={st.controlBtn}
                  onPress={() => {
                    const url = `/campaign/${id}/combat?playerView=true`;
                    window.open(url, 'vaultstone-player-view', 'width=600,height=800');
                  }}
                >
                  <MaterialCommunityIcons name="monitor" size={14} color={colors.onSurface} />
                  <Text style={st.controlBtnText}>Player View</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* ===== PARTY PICKER ===== */}
        {isDM && addingParty && (
          <View style={st.pickerPanel}>
            {partyLoading ? (
              <ActivityIndicator color={colors.primary} />
            ) : partyPicks.length === 0 ? (
              <Text style={st.pickerEmpty}>No party members available to add.</Text>
            ) : (
              <>
                <View style={st.pickerHeaderRow}>
                  <TouchableOpacity
                    onPress={() => {
                      const allSelected = partyPicks.every((p) => p.selected);
                      setPartyPicks((prev) => prev.map((p) => ({ ...p, selected: !allSelected })));
                    }}
                    style={st.pickerSelectAll}
                  >
                    <MaterialCommunityIcons
                      name={partyPicks.every((p) => p.selected) ? 'checkbox-marked' : 'checkbox-blank-outline'}
                      size={18} color={colors.onSurface}
                    />
                    <Text style={st.pickerSelectAllText}>Select all</Text>
                  </TouchableOpacity>
                  <Text style={st.pickerCount}>
                    {partyPicks.filter((p) => p.selected).length} / {partyPicks.length}
                  </Text>
                </View>
                {partyPicks.map((p) => (
                  <View key={p.characterId} style={st.pickerRow}>
                    <TouchableOpacity
                      onPress={() => setPartyPicks((prev) =>
                        prev.map((x) => x.characterId === p.characterId ? { ...x, selected: !x.selected } : x),
                      )}
                      style={st.pickerCheckbox}
                    >
                      <MaterialCommunityIcons
                        name={p.selected ? 'checkbox-marked' : 'checkbox-blank-outline'}
                        size={20} color={p.selected ? colors.primary : colors.textSecondary}
                      />
                    </TouchableOpacity>
                    <View style={{ flex: 1 }}>
                      <Text style={st.pickerName} numberOfLines={1}>{p.name}</Text>
                      <Text style={st.pickerMeta}>
                        HP {p.hpCurrent}/{p.hpMax} · AC {p.ac} · Init {formatMod(p.initMod)}
                      </Text>
                    </View>
                  </View>
                ))}
                <TouchableOpacity
                  style={[st.pickerAddBtn, (addingSelected || partyPicks.filter((p) => p.selected).length === 0) && { opacity: 0.5 }]}
                  onPress={handleAddParty}
                  disabled={addingSelected || partyPicks.filter((p) => p.selected).length === 0}
                >
                  <Text style={st.pickerAddBtnText}>
                    {addingSelected ? 'Adding...' : `Add ${partyPicks.filter((p) => p.selected).length} to encounter`}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {/* ===== FLOATING SESSION LOG ===== */}
        {logOpen && (
          <View
            style={[
              st.logFloating,
              Platform.OS === 'web' && {
                transform: [{ translateX: logDragOffset.x }, { translateY: logDragOffset.y }],
              },
            ]}
          >
            <View
              style={[st.logTitleBar, Platform.OS === 'web' && { cursor: 'grab' } as never]}
              {...(Platform.OS === 'web' ? {
                onMouseDown: (e: any) => {
                  e.preventDefault();
                  logDragRef.current = {
                    startX: e.clientX, startY: e.clientY,
                    origX: logDragOffset.x, origY: logDragOffset.y,
                  };
                  const onMove = (ev: MouseEvent) => {
                    if (!logDragRef.current) return;
                    setLogDragOffset({
                      x: logDragRef.current.origX + ev.clientX - logDragRef.current.startX,
                      y: logDragRef.current.origY + ev.clientY - logDragRef.current.startY,
                    });
                  };
                  const onUp = () => {
                    logDragRef.current = null;
                    document.removeEventListener('mousemove', onMove);
                    document.removeEventListener('mouseup', onUp);
                    document.body.style.cursor = '';
                    document.body.style.userSelect = '';
                  };
                  document.addEventListener('mousemove', onMove);
                  document.addEventListener('mouseup', onUp);
                  document.body.style.cursor = 'grabbing';
                  document.body.style.userSelect = 'none';
                },
              } : {})}
            >
              <MaterialCommunityIcons name="timeline-text-outline" size={16} color={colors.primary} />
              <Text style={st.logTitleText}>Session Log</Text>
              {combatStarted && (
                <View style={st.logTitleLive}>
                  <View style={st.liveDot} />
                  <Text style={st.liveText}>LIVE</Text>
                </View>
              )}
              <View style={{ flex: 1 }} />
              <Pressable
                onPress={() => setLogOpen(false)}
                {...(Platform.OS === 'web' ? { onMouseDown: (e: any) => e.stopPropagation() } : {})}
              >
                <MaterialCommunityIcons name="close" size={16} color={colors.outline} />
              </Pressable>
            </View>
            <View style={st.logBody}>
              <SessionLogFeed sessionId={session.id} isLive variant="compact" />
            </View>
          </View>
        )}

        {/* ===== MAIN CONTENT ===== */}
        <View style={st.mainContent}>
          {/* Initiative List */}
          <View style={isWideLayout && !showPlayerView ? st.initListNarrow : st.initListFull}>
            <View style={st.initListHeader}>
              <Text style={st.initListTitle}>{showPlayerView ? 'Combat Order' : 'Initiative'}</Text>
              <Text style={st.initListCount}>
                {showPlayerView
                  ? (combatStarted ? `Round ${session.round}` : 'Waiting...')
                  : `${entries.length} · ${combatStarted ? `Round ${session.round}` : anyRolled ? 'Rolling' : 'Setup'}`}
              </Text>
            </View>

            {(showPlayerView ? visibleEntries : entries).length === 0 ? (
              <View style={st.placeholder}>
                <MaterialCommunityIcons name="sword-cross" size={40} color={colors.outline} />
                <Text style={st.placeholderTitle}>
                  {showPlayerView ? 'Combat hasn’t started yet' : 'No combatants yet'}
                </Text>
                <Text style={st.placeholderBody}>
                  {showPlayerView
                    ? 'The initiative order will appear here once the DM begins.'
                    : isDM ? 'Add combatants to begin.' : 'Waiting for the DM.'}
                </Text>
              </View>
            ) : showPlayerView ? (
              /* ---- PLAYER VIEW ---- */
              <FlatList
                data={visibleEntries}
                keyExtractor={(e) => e.id}
                renderItem={({ item }) => (
                  <View style={[st.rowPlayer, item.is_active_turn && st.rowPlayerActive]}>
                    <Text style={st.rowPlayerName} numberOfLines={1}>
                      {item.display_name}
                    </Text>
                    {item.is_active_turn && (
                      <MaterialCommunityIcons name="chevron-right" size={16} color={colors.primary} style={{ marginLeft: 'auto' }} />
                    )}
                  </View>
                )}
              />
            ) : (
              /* ---- DM VIEW ---- */
              <FlatList
                data={displayEntries}
                keyExtractor={(e) => e.id}
                contentContainerStyle={{ paddingBottom: pinned.length > 0 ? 40 : 0 }}
                renderItem={({ item }) => {
                  const conds = item.character_id
                    ? (pcConditions[item.character_id] ?? [])
                    : (npcConditions[item.id] ?? []);
                  const isPc = !!item.character_id;
                  const overridden = item.init_override !== null;
                  const rolled = overridden || item.init_roll !== null;
                  const total = overridden
                    ? (item.init_override as number)
                    : item.init_value + (item.init_roll ?? 0);
                  const canRoll = isDM || (isPc && myCharacterIds.has(item.character_id!));
                  const hasStatBlock = !!item.creature_key;
                  const isEditing = initEditFor === item.id;
                  const isEditingName = nameEditFor === item.id;

                  return (
                    <View style={[st.row, item.is_active_turn && st.rowActive]}>
                      {/* Init badge — click to edit */}
                      {isEditing ? (
                        <View style={st.initEditWrap}>
                          <TextInput
                            style={st.initEditInput}
                            keyboardType="number-pad"
                            value={initEditValue}
                            onChangeText={setInitEditValue}
                            autoFocus
                            selectTextOnFocus
                            onSubmitEditing={() => handleInitSubmit(item.id)}
                            onBlur={() => handleInitSubmit(item.id)}
                            maxLength={3}
                          />
                        </View>
                      ) : (
                        <Pressable
                          onPress={isDM ? () => {
                            setInitEditFor(item.id);
                            setInitEditValue(rolled ? String(total) : '');
                          } : undefined}
                        >
                          <View style={[st.initBadge, rolled && st.initBadgeRolled]}>
                            <Text style={st.initBadgeText}>
                              {rolled ? total : formatMod(item.init_value)}
                            </Text>
                          </View>
                        </Pressable>
                      )}

                      {/* Name + meta */}
                      <Pressable
                        style={{ flex: 1 }}
                        onPress={() => {
                          if (hasStatBlock) handleSelectCombatant(item);
                          else if (isPc) handlePcPreview(item);
                        }}
                      >
                        <View style={st.nameRow}>
                          {isEditingName ? (
                            <TextInput
                              style={st.nameEditInput}
                              value={nameEditValue}
                              onChangeText={setNameEditValue}
                              autoFocus
                              selectTextOnFocus
                              onSubmitEditing={() => handleNameSubmit(item.id, item.display_name)}
                              onBlur={() => handleNameSubmit(item.id, item.display_name)}
                            />
                          ) : (
                            <Pressable
                              onPress={isDM ? (e) => {
                                e.stopPropagation?.();
                                setNameEditFor(item.id);
                                setNameEditValue(item.display_name);
                              } : undefined}
                              style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 4 }}
                            >
                              <Text style={st.rowName} numberOfLines={1}>
                                {item.display_name}
                              </Text>
                              {isDM && (
                                <MaterialCommunityIcons name="pencil" size={10} color={colors.outline} />
                              )}
                            </Pressable>
                          )}
                          <View style={[st.typeBadge, isPc ? st.typeBadgePc : st.typeBadgeNpc]}>
                            <Text style={[st.typeBadgeText, isPc ? st.typeBadgeTextPc : st.typeBadgeTextNpc]}>
                              {isPc ? 'PC' : 'NPC'}
                            </Text>
                          </View>
                          {hasStatBlock && (
                            <MaterialCommunityIcons name="book-open-variant" size={14} color={colors.primary} style={{ marginLeft: 2 }} />
                          )}
                        </View>
                        <View style={st.rowMetaRow}>
                          <Pressable onPress={isDM ? () => setHpEditTarget(item) : undefined}>
                            <Text style={[st.rowMeta, { color: hpColor(item.hp_current, item.hp_max) }]}>
                              HP {item.hp_current}/{item.hp_max}
                            </Text>
                          </Pressable>
                          {item.hp_temp > 0 && (
                            <Text style={st.rowTempHp}> +{item.hp_temp}tmp</Text>
                          )}
                          <Text style={st.rowMeta}> · AC {item.ac}</Text>
                        </View>
                        <HpBar current={item.hp_current} max={item.hp_max} />
                        {conds.length > 0 && (
                          <View style={st.condChipRow}>
                            {conds.map((c) => (
                              <View key={c} style={st.condChip}>
                                <Text style={st.condChipText}>{c.toUpperCase()}</Text>
                              </View>
                            ))}
                          </View>
                        )}
                      </Pressable>

                      {/* Actions */}
                      <View style={st.rowActions}>
                        {!rolled && canRoll && (
                          <TouchableOpacity style={st.rollBtn} onPress={() => handleRollOne(item)}>
                            <MaterialCommunityIcons name="dice-d20" size={16} color={colors.primary} />
                          </TouchableOpacity>
                        )}
                        {isDM && (
                          <TouchableOpacity style={st.rowAction} onPress={() => setEditingConditionsFor(item)}>
                            <MaterialCommunityIcons name="heart-pulse" size={16} color={colors.outline} />
                          </TouchableOpacity>
                        )}
                        {isDM && (
                          <TouchableOpacity style={st.rowAction} onPress={() => handleRemove(item.id)}>
                            <MaterialCommunityIcons name="close" size={16} color={colors.outline} />
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  );
                }}
              />
            )}
          </View>

          {/* Stat Block / Spell area (desktop, DM only) */}
          {isWideLayout && !showPlayerView && (
            statBlockPanels.length > 0 ? (
              <ScrollView
                horizontal
                style={st.statPanelArea}
                contentContainerStyle={st.statPanelRow}
                showsHorizontalScrollIndicator={false}
              >
                {statBlockPanels.map(({ combatant, creature }) => (
                  <View key={combatant.id} style={st.statPanel}>
                    <View style={st.statPanelHeader}>
                      <MaterialCommunityIcons name="book-open-variant" size={14} color={colors.outline} />
                      <Text style={st.statPanelTitle} numberOfLines={1}>
                        {combatant.display_name}
                      </Text>
                      <TouchableOpacity
                        style={st.statPanelAction}
                        onPress={() => closeStatBlock(combatant.id)}
                      >
                        <MaterialCommunityIcons name="close" size={16} color={colors.outline} />
                      </TouchableOpacity>
                    </View>
                    <ScrollView style={st.statPanelBody}>
                      {creature ? (
                        <CreatureStatBlock creature={creature} />
                      ) : (
                        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.lg }} />
                      )}
                    </ScrollView>
                  </View>
                ))}
              </ScrollView>
            ) : (
              <View style={st.statPanelArea}>
                <View style={st.statPanelEmpty}>
                  <MaterialCommunityIcons name="book-open-variant" size={36} color={colors.outline} />
                  <Text style={st.statPanelEmptyText}>
                    Click a creature's stat block icon to view it here
                  </Text>
                </View>
              </View>
            )
          )}

          {/* Pinned spells overlay */}
          <PinnedSpellsOverlay
            pinned={pinned}
            onUnpin={unpinSpell}
            onToggleMinimize={toggleMinimize}
          />
        </View>

        {/* ===== Stat block modal for mobile ===== */}
        {!isWideLayout && openStatBlocks.length > 0 && (() => {
          const cId = openStatBlocks[openStatBlocks.length - 1];
          const combatant = entries.find((e) => e.id === cId);
          const creature = combatant?.creature_key ? creatureCache[combatant.creature_key] : null;
          return (
            <Modal
              visible
              transparent
              animationType="fade"
              onRequestClose={() => closeStatBlock(cId)}
            >
              <View style={st.modalBackdrop}>
                <View style={st.modalCard}>
                  <View style={st.modalHeader}>
                    <Text style={st.modalTitle} numberOfLines={1}>
                      {combatant?.display_name ?? 'Stat Block'}
                    </Text>
                    <TouchableOpacity onPress={() => closeStatBlock(cId)}>
                      <MaterialCommunityIcons name="close" size={22} color={colors.outline} />
                    </TouchableOpacity>
                  </View>
                  <ScrollView contentContainerStyle={st.modalBody}>
                    {creature ? (
                      <CreatureStatBlock creature={creature} />
                    ) : (
                      <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.lg }} />
                    )}
                  </ScrollView>
                </View>
              </View>
            </Modal>
          );
        })()}

        {/* ===== Conditions modal ===== */}
        <Modal
          visible={!!editingConditionsFor}
          transparent
          animationType="fade"
          onRequestClose={() => setEditingConditionsFor(null)}
        >
          <View style={st.modalBackdrop}>
            <View style={st.modalCard}>
              <View style={st.modalHeader}>
                <Text style={st.modalTitle} numberOfLines={1}>
                  {editingConditionsFor?.display_name}
                </Text>
                <TouchableOpacity onPress={() => setEditingConditionsFor(null)}>
                  <MaterialCommunityIcons name="close" size={22} color={colors.outline} />
                </TouchableOpacity>
              </View>
              <ScrollView contentContainerStyle={st.modalBody}>
                <View style={st.condGrid}>
                  {SRD_CONDITIONS.map((cond) => {
                    const isPcCombatant = !!editingConditionsFor?.character_id;
                    const condKey = isPcCombatant
                      ? editingConditionsFor?.character_id ?? ''
                      : editingConditionsFor?.id ?? '';
                    const condList = isPcCombatant
                      ? (pcConditions[condKey] ?? [])
                      : (npcConditions[condKey] ?? []);
                    const active = condList.some((c) => c.toLowerCase() === cond.toLowerCase());
                    return (
                      <TouchableOpacity
                        key={cond}
                        style={[st.condChipBig, active && st.condChipBigActive]}
                        onPress={() => {
                          if (isPcCombatant && condKey) {
                            toggleCondition(condKey, cond);
                          } else if (condKey) {
                            toggleNpcCondition(condKey, cond);
                          }
                        }}
                      >
                        <Text style={[st.condChipBigText, active && st.condChipBigTextActive]}>
                          {cond}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* ===== PC Preview modal ===== */}
        {pcPreview && (
          <Modal
            visible
            transparent
            animationType="fade"
            onRequestClose={() => setPcPreview(null)}
          >
            <Pressable style={st.modalBackdrop} onPress={() => setPcPreview(null)}>
              <Pressable style={st.modalCard} onPress={(e) => e.stopPropagation()}>
                <View style={st.modalHeader}>
                  <Text style={st.modalTitle}>{pcPreview.name}</Text>
                  <TouchableOpacity onPress={() => setPcPreview(null)}>
                    <MaterialCommunityIcons name="close" size={22} color={colors.outline} />
                  </TouchableOpacity>
                </View>
                <ScrollView contentContainerStyle={st.modalBody}>
                  <View style={st.pcPreviewRow}>
                    <View style={st.pcPreviewStat}>
                      <Text style={st.pcPreviewLabel}>Level</Text>
                      <Text style={st.pcPreviewValue}>{pcPreview.stats.level}</Text>
                    </View>
                    <View style={st.pcPreviewStat}>
                      <Text style={st.pcPreviewLabel}>HP</Text>
                      <Text style={st.pcPreviewValue}>{pcPreview.resources.hpCurrent}/{pcPreview.stats.hpMax}</Text>
                    </View>
                    <View style={st.pcPreviewStat}>
                      <Text style={st.pcPreviewLabel}>AC</Text>
                      <Text style={st.pcPreviewValue}>{computeAc(pcPreview.stats, pcPreview.resources)}</Text>
                    </View>
                  </View>
                  <Text style={st.pcPreviewSectionTitle}>Ability Scores</Text>
                  <View style={st.pcPreviewRow}>
                    {(['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'] as const).map((ab) => (
                      <View key={ab} style={st.pcPreviewStat}>
                        <Text style={st.pcPreviewLabel}>{ab.slice(0, 3).toUpperCase()}</Text>
                        <Text style={st.pcPreviewValue}>{pcPreview.stats.abilityScores[ab]}</Text>
                        <Text style={st.pcPreviewMod}>{formatMod(abilityMod(pcPreview.stats.abilityScores[ab]))}</Text>
                      </View>
                    ))}
                  </View>
                  <View style={st.pcPreviewRow}>
                    <View style={st.pcPreviewStat}>
                      <Text style={st.pcPreviewLabel}>Temp HP</Text>
                      <Text style={st.pcPreviewValue}>{pcPreview.resources.hpTemp}</Text>
                    </View>
                    <View style={st.pcPreviewStat}>
                      <Text style={st.pcPreviewLabel}>Inspiration</Text>
                      <Text style={st.pcPreviewValue}>{pcPreview.resources.inspiration ? 'Yes' : 'No'}</Text>
                    </View>
                  </View>
                </ScrollView>
              </Pressable>
            </Pressable>
          </Modal>
        )}

        {/* ===== HP Edit modal ===== */}
        {hpEditTarget && (
          <CombatHpModal
            visible
            name={hpEditTarget.display_name}
            hpCurrent={hpEditTarget.hp_current}
            hpMax={hpEditTarget.hp_max}
            hpTemp={hpEditTarget.hp_temp}
            isNpc={!hpEditTarget.character_id}
            onClose={() => setHpEditTarget(null)}
            onApply={(patch) => handleHpApply(hpEditTarget, patch)}
          />
        )}

        <CreaturePickerModal
          visible={pickerVisible}
          onClose={() => setPickerVisible(false)}
          onAddCreatures={handleAddCreatures}
        />
      </View>
    </SpellPinProvider>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceCanvas },
  center: {
    flex: 1, backgroundColor: colors.surfaceCanvas,
    alignItems: 'center', justifyContent: 'center',
  },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderBottomColor: colors.outlineVariant, borderBottomWidth: 1,
    backgroundColor: colors.surfaceContainerHigh,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headerBack: { padding: 4 },
  title: { fontSize: 16, fontFamily: fonts.headline, fontWeight: '700', color: colors.onSurface },
  subtitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: 2 },
  subtitle: { fontSize: 11, fontFamily: fonts.label, color: colors.onSurfaceVariant },
  liveBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: `${colors.hpDanger}22`, borderRadius: radius.lg,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  liveDot: {
    width: 6, height: 6, borderRadius: 3, backgroundColor: colors.hpDanger,
  },
  liveText: { fontSize: 9, fontFamily: fonts.label, fontWeight: '700', color: colors.hpDanger },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  roundInfo: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  roundLabel: { fontSize: 9, fontFamily: fonts.label, fontWeight: '700', color: colors.outline, letterSpacing: 1.2 },
  roundBadge: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  roundNumber: { fontSize: 14, fontFamily: fonts.headline, fontWeight: '700', color: '#fff' },
  turnName: { fontSize: 11, fontFamily: fonts.body, color: colors.onSurfaceVariant, maxWidth: 120 },
  prevTurnBtn: {
    alignItems: 'center', justifyContent: 'center',
    borderColor: colors.outlineVariant, borderWidth: 1, borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 8,
  },
  nextTurnBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.primary, borderRadius: 6,
    paddingHorizontal: spacing.md, paddingVertical: 8,
  },
  nextTurnBtnText: { color: '#fff', fontSize: 12, fontFamily: fonts.label, fontWeight: '700' },

  // Controls
  controls: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
    borderBottomColor: colors.outlineVariant, borderBottomWidth: 1,
    flexWrap: 'wrap', gap: spacing.xs,
  },
  controlsLeft: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' },
  controlsRight: { flexDirection: 'row', gap: spacing.xs },
  controlBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderColor: colors.outlineVariant, borderWidth: 1, borderRadius: 6,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  controlBtnText: { color: colors.onSurface, fontSize: 11, fontFamily: fonts.label, fontWeight: '600' },
  controlBtnPrimary: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.primary, borderRadius: 6,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  controlBtnPrimaryText: { color: '#fff', fontSize: 11, fontFamily: fonts.label, fontWeight: '700' },

  // Party picker
  pickerPanel: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderBottomColor: colors.outlineVariant, borderBottomWidth: 1,
    backgroundColor: colors.surfaceContainerHigh, gap: 8,
  },
  pickerEmpty: { color: colors.outline, fontSize: 12, fontFamily: fonts.body, textAlign: 'center', paddingVertical: spacing.sm },
  pickerHeaderRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 4,
  },
  pickerSelectAll: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pickerSelectAllText: { color: colors.onSurface, fontSize: 12, fontFamily: fonts.headline, fontWeight: '600' },
  pickerCount: { color: colors.outline, fontSize: 11, fontFamily: fonts.label },
  pickerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 6 },
  pickerCheckbox: { padding: 2 },
  pickerName: { color: colors.onSurface, fontSize: 13, fontFamily: fonts.headline, fontWeight: '600' },
  pickerMeta: { color: colors.outline, fontSize: 11, fontFamily: fonts.label, marginTop: 2 },
  pickerAddBtn: {
    backgroundColor: colors.primary, borderRadius: 6,
    paddingVertical: 10, alignItems: 'center', marginTop: 4,
  },
  pickerAddBtnText: { color: '#fff', fontFamily: fonts.label, fontWeight: '700', fontSize: 12 },

  // Session log floating window
  controlBtnActive: { borderColor: colors.primary, backgroundColor: `${colors.primary}18` },
  logFloating: {
    position: 'absolute', top: 8, left: 8,
    width: 380, maxHeight: 340, zIndex: 150,
    backgroundColor: colors.surfaceContainerHigh,
    borderColor: colors.outlineVariant, borderWidth: 1, borderRadius: radius.xl,
    ...(Platform.OS === 'web' ? { boxShadow: '0 8px 32px rgba(0,0,0,0.5)' } as never : {}),
  },
  logTitleBar: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs + 2,
    borderBottomColor: colors.outlineVariant, borderBottomWidth: 1,
    backgroundColor: colors.surfaceContainerHigh, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
  },
  logTitleText: { fontSize: 12, fontFamily: fonts.headline, fontWeight: '700', color: colors.onSurface },
  logTitleLive: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  logBody: { flex: 1, maxHeight: 300 },

  // Main content
  mainContent: { flex: 1, flexDirection: 'row', position: 'relative' },
  initListNarrow: { width: 280, borderRightColor: colors.outlineVariant, borderRightWidth: 1 },
  initListFull: { flex: 1 },
  initListHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2,
    borderBottomColor: colors.outlineVariant, borderBottomWidth: 1,
  },
  initListTitle: { fontSize: 11, fontFamily: fonts.headline, fontWeight: '700', color: colors.onSurface },
  initListCount: { fontSize: 10, fontFamily: fonts.label, color: colors.outline },

  // Combatant row
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.sm,
    borderBottomColor: colors.outlineVariant, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowActive: {
    backgroundColor: `${colors.primary}11`,
    borderLeftColor: colors.primary, borderLeftWidth: 3,
    paddingLeft: spacing.sm - 3,
  },
  initBadge: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.surfaceCanvas,
    borderColor: colors.outlineVariant, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  initBadgeRolled: {
    backgroundColor: `${colors.primary}22`, borderColor: colors.primary,
  },
  initBadgeText: { color: colors.onSurface, fontSize: 13, fontFamily: fonts.headline, fontWeight: '700' },
  initEditWrap: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: `${colors.primary}22`, borderColor: colors.primary, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  initEditInput: {
    width: 32, height: 32, textAlign: 'center',
    color: colors.onSurface, fontSize: 13, fontFamily: fonts.headline, fontWeight: '700',
    padding: 0,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rowName: { color: colors.onSurface, fontSize: 12, fontFamily: fonts.headline, fontWeight: '600' },
  typeBadge: {
    paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3,
  },
  typeBadgePc: { backgroundColor: `${colors.hpHealthy}33` },
  typeBadgeNpc: { backgroundColor: `${colors.hpDanger}33` },
  typeBadgeText: { fontSize: 8, fontFamily: fonts.label, fontWeight: '700' },
  typeBadgeTextPc: { color: colors.hpHealthy },
  typeBadgeTextNpc: { color: colors.hpDanger },
  rowMetaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 1 },
  rowMeta: { color: colors.onSurfaceVariant, fontSize: 10, fontFamily: fonts.label },
  rowTempHp: { fontSize: 10, fontFamily: fonts.label, color: colors.hpWarning },
  condChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 3, marginTop: 3 },
  condChip: {
    borderColor: colors.hpDanger, borderWidth: 1, borderRadius: 3,
    paddingHorizontal: 4, paddingVertical: 0,
    backgroundColor: `${colors.hpDanger}18`,
  },
  condChipText: { color: colors.hpDanger, fontSize: 8, fontFamily: fonts.label, fontWeight: '700' },
  condMore: { color: colors.outline, fontSize: 9, fontFamily: fonts.label, fontWeight: '600' },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  rowAction: { padding: 4 },
  rollBtn: {
    width: 26, height: 26, borderRadius: 13,
    borderColor: `${colors.primary}66`, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: `${colors.primary}14`,
  },

  // Stat panels
  statPanelArea: { flex: 1, position: 'relative' as const },
  statPanelEmpty: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    opacity: 0.5,
  },
  statPanelEmptyText: { fontSize: 12, fontFamily: fonts.body, color: colors.outline, textAlign: 'center', maxWidth: 200 },
  statPanelRow: { flexDirection: 'row', gap: 0, paddingRight: 380 },
  statPanel: {
    width: 380, borderLeftColor: colors.outlineVariant, borderLeftWidth: 1,
    backgroundColor: colors.surfaceContainerHigh,
  },
  statPanelHeader: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs + 2,
    borderBottomColor: colors.outlineVariant, borderBottomWidth: 1,
    backgroundColor: colors.surfaceContainerHigh,
  },
  statPanelTitle: { color: colors.onSurface, fontSize: 12, fontFamily: fonts.headline, fontWeight: '600', flex: 1 },
  statPanelAction: { padding: 4 },
  statPanelBody: { padding: spacing.sm, flex: 1 },

  // Placeholder
  placeholder: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.xl,
  },
  placeholderTitle: { fontSize: 14, fontFamily: fonts.headline, fontWeight: '700', color: colors.onSurface },
  placeholderBody: { fontSize: 11, fontFamily: fonts.body, color: colors.outline, textAlign: 'center' },

  // Modals
  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  modalCard: {
    width: '100%', maxWidth: 480, maxHeight: '80%',
    backgroundColor: colors.surfaceContainerHigh,
    borderColor: colors.outlineVariant, borderWidth: 1, borderRadius: 12,
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderBottomColor: colors.outlineVariant, borderBottomWidth: 1,
  },
  modalTitle: { color: colors.onSurface, fontSize: 14, fontFamily: fonts.headline, fontWeight: '700', flex: 1 },
  modalBody: { padding: spacing.md },
  condGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  condChipBig: {
    borderColor: colors.outlineVariant, borderWidth: 1, borderRadius: radius.lg,
    paddingHorizontal: 10, paddingVertical: 5, backgroundColor: colors.surfaceCanvas,
  },
  condChipBigActive: { borderColor: colors.hpDanger, backgroundColor: `${colors.hpDanger}18` },
  condChipBigText: { color: colors.onSurfaceVariant, fontSize: 11, fontFamily: fonts.body, fontWeight: '500' },
  condChipBigTextActive: { color: colors.hpDanger, fontWeight: '700' },

  // PC preview
  pcPreviewRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm,
  },
  pcPreviewStat: {
    alignItems: 'center', minWidth: 50, gap: 2,
    borderRadius: 6,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
    borderColor: colors.outlineVariant, borderWidth: 1,
  },
  pcPreviewLabel: { fontSize: 8, fontFamily: fonts.label, fontWeight: '700', color: colors.outline, letterSpacing: 1.2 },
  pcPreviewValue: { fontSize: 16, fontFamily: fonts.headline, fontWeight: '700', color: colors.onSurface },
  pcPreviewMod: { fontSize: 11, fontFamily: fonts.body, color: colors.primary },
  pcPreviewSectionTitle: {
    fontSize: 9, fontFamily: fonts.label, fontWeight: '700', color: colors.outline,
    letterSpacing: 1.2, marginBottom: 4, marginTop: spacing.xs,
  },

  // Player view
  rowPlayer: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2,
    borderBottomColor: colors.outlineVariant,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowPlayerActive: {
    backgroundColor: `${colors.primary}11`,
    borderLeftColor: colors.primary, borderLeftWidth: 3,
    paddingLeft: spacing.md - 3,
  },
  rowPlayerName: {
    color: colors.onSurface, fontSize: 14,
    fontFamily: fonts.headline, fontWeight: '600',
  },

  // Name inline edit (DM rename)
  nameEditInput: {
    flex: 1, fontSize: 12, fontFamily: fonts.headline, fontWeight: '600',
    color: colors.onSurface, padding: 0,
    borderBottomWidth: 1, borderBottomColor: colors.primary,
  },
});
