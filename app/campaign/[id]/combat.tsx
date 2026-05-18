import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, Pressable, TextInput, StyleSheet,
  ActivityIndicator, FlatList, Modal, ScrollView, Alert, Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  supabase, getActiveSession,
  getInitiativeOrder, addCombatant, removeCombatant, advanceTurn,
  updateCombatant, updateCharacterHp, updateCharacterConditions,
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
import { colors, spacing, HpBar, hpColor, useBreakpoint } from '@vaultstone/ui';
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
  const { id } = useLocalSearchParams<{ id: string }>();
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
  const [editingConditionsFor, setEditingConditionsFor] = useState<Combatant | null>(null);
  const [myCharacterIds, setMyCharacterIds] = useState<Set<string>>(new Set());

  const [rollingAll, setRollingAll] = useState(false);
  const [startingCombat, setStartingCombat] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [endingCombat, setEndingCombat] = useState(false);

  // Multi-panel stat blocks: set of combatant IDs with open panels
  const [openStatBlocks, setOpenStatBlocks] = useState<string[]>([]);
  const [creatureCache, setCreatureCache] = useState<Record<string, CreatureResult>>({});

  // HP editing modal state
  const [hpEditTarget, setHpEditTarget] = useState<Combatant | null>(null);

  // Initiative click-to-edit state
  const [initEditFor, setInitEditFor] = useState<string | null>(null);
  const [initEditValue, setInitEditValue] = useState('');

  // Session log floating window
  const [logOpen, setLogOpen] = useState(false);
  const [logDragOffset, setLogDragOffset] = useState({ x: 0, y: 0 });
  const logDragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  // Pinned spells
  const { pinned, pinSpell, unpinSpell, toggleMinimize } = usePinnedSpells();

  const bp = useBreakpoint();
  const isWideLayout = bp.isDesktop || bp.isWide;

  const isDM = campaign?.dm_user_id === user?.id;
  const combatStarted = !!session?.combat_started_at;
  const sortedEntries = useMemo(() => sortByInitiative(entries), [entries]);
  const allRolled = entries.length > 0 &&
    entries.every((e) => e.init_roll !== null || e.init_override !== null);
  const anyRolled = entries.some((e) => e.init_roll !== null || e.init_override !== null);

  const activeCombatant = sortedEntries.find((e) => e.is_active_turn);

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
      await updateCombatant(sorted[0].id, { is_active_turn: true });
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

  async function handleNextTurn() {
    if (!session || advancing || entries.length === 0) return;
    setAdvancing(true);
    await advanceTurn(session.id);
    await refetchEntries(session.id);
    const { data: s } = await getActiveSession(id);
    if (s) setSession(s);
    setAdvancing(false);
  }

  // --- Render ---

  if (loading) {
    return (
      <View style={st.center}>
        <ActivityIndicator color={colors.brand} />
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
              <MaterialCommunityIcons name="arrow-left" size={22} color={colors.textPrimary} />
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
              <TouchableOpacity
                style={[st.nextTurnBtn, (advancing || entries.length === 0) && { opacity: 0.5 }]}
                onPress={handleNextTurn}
                disabled={advancing || entries.length === 0}
              >
                <MaterialCommunityIcons name="skip-next" size={16} color="#fff" />
                <Text style={st.nextTurnBtnText}>
                  {advancing ? 'Advancing...' : 'Next Turn'}
                </Text>
              </TouchableOpacity>
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
                <MaterialCommunityIcons name="timeline-text-outline" size={14} color={logOpen ? colors.brand : colors.textPrimary} />
                <Text style={[st.controlBtnText, logOpen && { color: colors.brand }]}>Log</Text>
              </TouchableOpacity>
              <TouchableOpacity style={st.controlBtn} onPress={() => setPickerVisible(true)}>
                <MaterialCommunityIcons name="plus" size={14} color={colors.textPrimary} />
                <Text style={st.controlBtnText}>Add Combatant</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={st.controlBtn}
                onPress={() => (addingParty ? closePartyPicker() : openPartyPicker())}
              >
                <MaterialCommunityIcons
                  name={addingParty ? 'close' : 'account-multiple-plus'}
                  size={14} color={colors.textPrimary}
                />
                <Text style={st.controlBtnText}>{addingParty ? 'Cancel' : 'Add Party'}</Text>
              </TouchableOpacity>
              {!combatStarted && !allRolled && entries.length > 0 && (
                <TouchableOpacity
                  style={[st.controlBtn, rollingAll && { opacity: 0.5 }]}
                  onPress={handleRollAll}
                  disabled={rollingAll}
                >
                  <MaterialCommunityIcons name="dice-d20" size={14} color={colors.brand} />
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
            </View>
          </View>
        )}

        {/* ===== PARTY PICKER ===== */}
        {isDM && addingParty && (
          <View style={st.pickerPanel}>
            {partyLoading ? (
              <ActivityIndicator color={colors.brand} />
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
                      size={18} color={colors.textPrimary}
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
                        size={20} color={p.selected ? colors.brand : colors.textSecondary}
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
              <MaterialCommunityIcons name="timeline-text-outline" size={16} color={colors.brand} />
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
                <MaterialCommunityIcons name="close" size={16} color={colors.textSecondary} />
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
          <View style={isWideLayout && statBlockPanels.length > 0 ? st.initListNarrow : st.initListFull}>
            <View style={st.initListHeader}>
              <Text style={st.initListTitle}>Initiative</Text>
              <Text style={st.initListCount}>
                {entries.length} · {combatStarted ? `Round ${session.round}` : anyRolled ? 'Rolling' : 'Setup'}
              </Text>
            </View>

            {entries.length === 0 ? (
              <View style={st.placeholder}>
                <MaterialCommunityIcons name="sword-cross" size={40} color={colors.textSecondary} />
                <Text style={st.placeholderTitle}>No combatants yet</Text>
                <Text style={st.placeholderBody}>
                  {isDM ? 'Add combatants to begin.' : 'Waiting for the DM.'}
                </Text>
              </View>
            ) : (
              <FlatList
                data={sortedEntries}
                keyExtractor={(e) => e.id}
                contentContainerStyle={{ paddingBottom: pinned.length > 0 ? 40 : 0 }}
                renderItem={({ item }) => {
                  const conds = item.character_id ? (pcConditions[item.character_id] ?? []) : [];
                  const isPc = !!item.character_id;
                  const overridden = item.init_override !== null;
                  const rolled = overridden || item.init_roll !== null;
                  const total = overridden
                    ? (item.init_override as number)
                    : item.init_value + (item.init_roll ?? 0);
                  const canRoll = isDM || (isPc && myCharacterIds.has(item.character_id!));
                  const hasStatBlock = !!item.creature_key;
                  const isEditing = initEditFor === item.id;

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
                            onBlur={() => setInitEditFor(null)}
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
                        onPress={hasStatBlock ? () => handleSelectCombatant(item) : undefined}
                      >
                        <View style={st.nameRow}>
                          <Text style={st.rowName} numberOfLines={1}>
                            {item.display_name}
                          </Text>
                          <View style={[st.typeBadge, isPc ? st.typeBadgePc : st.typeBadgeNpc]}>
                            <Text style={[st.typeBadgeText, isPc ? st.typeBadgeTextPc : st.typeBadgeTextNpc]}>
                              {isPc ? 'PC' : 'NPC'}
                            </Text>
                          </View>
                          {hasStatBlock && (
                            <MaterialCommunityIcons name="book-open-variant" size={14} color={colors.brand} style={{ marginLeft: 2 }} />
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
                            {conds.slice(0, 3).map((c) => (
                              <View key={c} style={st.condChip}>
                                <Text style={st.condChipText}>{c.toUpperCase()}</Text>
                              </View>
                            ))}
                            {conds.length > 3 && (
                              <Text style={st.condMore}>+{conds.length - 3}</Text>
                            )}
                          </View>
                        )}
                      </Pressable>

                      {/* Actions */}
                      <View style={st.rowActions}>
                        {!rolled && canRoll && (
                          <TouchableOpacity style={st.rollBtn} onPress={() => handleRollOne(item)}>
                            <MaterialCommunityIcons name="dice-d20" size={16} color={colors.brand} />
                          </TouchableOpacity>
                        )}
                        {isDM && isPc && (
                          <TouchableOpacity style={st.rowAction} onPress={() => setEditingConditionsFor(item)}>
                            <MaterialCommunityIcons name="heart-pulse" size={16} color={colors.textSecondary} />
                          </TouchableOpacity>
                        )}
                        {isDM && (
                          <TouchableOpacity style={st.rowAction} onPress={() => handleRemove(item.id)}>
                            <MaterialCommunityIcons name="close" size={16} color={colors.textSecondary} />
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  );
                }}
              />
            )}
          </View>

          {/* Stat Block Panels (desktop) */}
          {isWideLayout && statBlockPanels.length > 0 && (
            <ScrollView
              horizontal
              style={st.statPanelArea}
              contentContainerStyle={st.statPanelRow}
              showsHorizontalScrollIndicator={false}
            >
              {statBlockPanels.map(({ combatant, creature }) => (
                <View key={combatant.id} style={st.statPanel}>
                  <View style={st.statPanelHeader}>
                    <MaterialCommunityIcons name="book-open-variant" size={14} color={colors.textSecondary} />
                    <Text style={st.statPanelTitle} numberOfLines={1}>
                      {combatant.display_name}
                    </Text>
                    <TouchableOpacity
                      style={st.statPanelAction}
                      onPress={() => closeStatBlock(combatant.id)}
                    >
                      <MaterialCommunityIcons name="close" size={16} color={colors.textSecondary} />
                    </TouchableOpacity>
                  </View>
                  <ScrollView style={st.statPanelBody}>
                    {creature ? (
                      <CreatureStatBlock creature={creature} />
                    ) : (
                      <ActivityIndicator color={colors.brand} style={{ marginTop: spacing.lg }} />
                    )}
                  </ScrollView>
                </View>
              ))}
            </ScrollView>
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
                      <MaterialCommunityIcons name="close" size={22} color={colors.textSecondary} />
                    </TouchableOpacity>
                  </View>
                  <ScrollView contentContainerStyle={st.modalBody}>
                    {creature ? (
                      <CreatureStatBlock creature={creature} />
                    ) : (
                      <ActivityIndicator color={colors.brand} style={{ marginTop: spacing.lg }} />
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
                  <MaterialCommunityIcons name="close" size={22} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
              <ScrollView contentContainerStyle={st.modalBody}>
                <View style={st.condGrid}>
                  {SRD_CONDITIONS.map((cond) => {
                    const charId = editingConditionsFor?.character_id ?? '';
                    const active = (pcConditions[charId] ?? [])
                      .some((c) => c.toLowerCase() === cond.toLowerCase());
                    return (
                      <TouchableOpacity
                        key={cond}
                        style={[st.condChipBig, active && st.condChipBigActive]}
                        onPress={() => charId && toggleCondition(charId, cond)}
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
  container: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1, backgroundColor: colors.background,
    alignItems: 'center', justifyContent: 'center',
  },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderBottomColor: colors.border, borderBottomWidth: 1,
    backgroundColor: colors.surface,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headerBack: { padding: 4 },
  title: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  subtitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: 2 },
  subtitle: { fontSize: 12, color: colors.textSecondary },
  liveBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.hpDanger + '22', borderRadius: 4,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  liveDot: {
    width: 6, height: 6, borderRadius: 3, backgroundColor: colors.hpDanger,
  },
  liveText: { fontSize: 10, fontWeight: '700', color: colors.hpDanger },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  roundInfo: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  roundLabel: { fontSize: 10, fontWeight: '600', color: colors.textSecondary, letterSpacing: 1 },
  roundBadge: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center',
  },
  roundNumber: { fontSize: 14, fontWeight: '700', color: '#fff' },
  turnName: { fontSize: 12, color: colors.textSecondary, maxWidth: 120 },
  nextTurnBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.brand, borderRadius: 8,
    paddingHorizontal: spacing.md, paddingVertical: 8,
  },
  nextTurnBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  // Controls
  controls: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
    borderBottomColor: colors.border, borderBottomWidth: 1,
    flexWrap: 'wrap', gap: spacing.xs,
  },
  controlsLeft: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' },
  controlsRight: { flexDirection: 'row', gap: spacing.xs },
  controlBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderColor: colors.border, borderWidth: 1, borderRadius: 6,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  controlBtnText: { color: colors.textPrimary, fontSize: 12, fontWeight: '600' },
  controlBtnPrimary: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.brand, borderRadius: 6,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  controlBtnPrimaryText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  // Party picker
  pickerPanel: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderBottomColor: colors.border, borderBottomWidth: 1,
    backgroundColor: colors.surface, gap: 8,
  },
  pickerEmpty: { color: colors.textSecondary, fontSize: 13, textAlign: 'center', paddingVertical: spacing.sm },
  pickerHeaderRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 4,
  },
  pickerSelectAll: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pickerSelectAllText: { color: colors.textPrimary, fontSize: 13, fontWeight: '600' },
  pickerCount: { color: colors.textSecondary, fontSize: 12 },
  pickerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 6 },
  pickerCheckbox: { padding: 2 },
  pickerName: { color: colors.textPrimary, fontSize: 14, fontWeight: '600' },
  pickerMeta: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  pickerAddBtn: {
    backgroundColor: colors.brand, borderRadius: 8,
    paddingVertical: 10, alignItems: 'center', marginTop: 4,
  },
  pickerAddBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  // Session log floating window
  controlBtnActive: { borderColor: colors.brand, backgroundColor: colors.brand + '18' },
  logFloating: {
    position: 'absolute', top: 8, left: 8,
    width: 380, maxHeight: 340, zIndex: 150,
    backgroundColor: colors.surface,
    borderColor: colors.border, borderWidth: 1, borderRadius: 8,
    ...(Platform.OS === 'web' ? { boxShadow: '0 8px 32px rgba(0,0,0,0.5)' } as never : {}),
  },
  logTitleBar: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs + 2,
    borderBottomColor: colors.border, borderBottomWidth: 1,
    backgroundColor: colors.surface, borderTopLeftRadius: 8, borderTopRightRadius: 8,
  },
  logTitleText: { fontSize: 12, fontWeight: '700', color: colors.textPrimary },
  logTitleLive: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  logBody: { flex: 1, maxHeight: 300 },

  // Main content
  mainContent: { flex: 1, flexDirection: 'row', position: 'relative' },
  initListNarrow: { width: 280, borderRightColor: colors.border, borderRightWidth: 1 },
  initListFull: { flex: 1 },
  initListHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2,
    borderBottomColor: colors.border, borderBottomWidth: 1,
  },
  initListTitle: { fontSize: 12, fontWeight: '700', color: colors.textPrimary },
  initListCount: { fontSize: 11, color: colors.textSecondary },

  // Combatant row
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.sm,
    borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowActive: {
    backgroundColor: colors.brand + '11',
    borderLeftColor: colors.brand, borderLeftWidth: 3,
    paddingLeft: spacing.sm - 3,
  },
  initBadge: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.background,
    borderColor: colors.border, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  initBadgeRolled: {
    backgroundColor: colors.brand + '22', borderColor: colors.brand,
  },
  initBadgeText: { color: colors.textPrimary, fontSize: 13, fontWeight: '700' },
  initEditWrap: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.brand + '22', borderColor: colors.brand, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  initEditInput: {
    width: 32, height: 32, textAlign: 'center',
    color: colors.textPrimary, fontSize: 13, fontWeight: '700',
    padding: 0,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rowName: { color: colors.textPrimary, fontSize: 13, fontWeight: '600' },
  typeBadge: {
    paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3,
  },
  typeBadgePc: { backgroundColor: colors.hpHealthy + '33' },
  typeBadgeNpc: { backgroundColor: colors.hpDanger + '33' },
  typeBadgeText: { fontSize: 9, fontWeight: '700' },
  typeBadgeTextPc: { color: colors.hpHealthy },
  typeBadgeTextNpc: { color: colors.hpDanger },
  rowMetaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 1 },
  rowMeta: { color: colors.textSecondary, fontSize: 11 },
  rowTempHp: { fontSize: 11, color: colors.hpWarning },
  condChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 3, marginTop: 3 },
  condChip: {
    borderColor: colors.hpDanger, borderWidth: 1, borderRadius: 3,
    paddingHorizontal: 4, paddingVertical: 0,
    backgroundColor: colors.hpDanger + '22',
  },
  condChipText: { color: colors.hpDanger, fontSize: 9, fontWeight: '700' },
  condMore: { color: colors.textSecondary, fontSize: 9, fontWeight: '600' },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  rowAction: { padding: 4 },
  rollBtn: {
    width: 28, height: 28, borderRadius: 14,
    borderColor: colors.brand, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.background,
  },

  // Stat panels
  statPanelArea: { flex: 1 },
  statPanelRow: { flexDirection: 'row', gap: 0, paddingRight: 380 },
  statPanel: {
    width: 380, borderLeftColor: colors.border, borderLeftWidth: 1,
    backgroundColor: colors.surface,
  },
  statPanelHeader: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs + 2,
    borderBottomColor: colors.border, borderBottomWidth: 1,
    backgroundColor: colors.surface,
  },
  statPanelTitle: { color: colors.textPrimary, fontSize: 13, fontWeight: '700', flex: 1 },
  statPanelAction: { padding: 4 },
  statPanelBody: { padding: spacing.sm, flex: 1 },

  // Placeholder
  placeholder: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.xl,
  },
  placeholderTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  placeholderBody: { fontSize: 12, color: colors.textSecondary, textAlign: 'center' },

  // Modals
  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  modalCard: {
    width: '100%', maxWidth: 480, maxHeight: '80%',
    backgroundColor: colors.surface,
    borderColor: colors.border, borderWidth: 1, borderRadius: 12,
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderBottomColor: colors.border, borderBottomWidth: 1,
  },
  modalTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: '700', flex: 1 },
  modalBody: { padding: spacing.md },
  condGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  condChipBig: {
    borderColor: colors.border, borderWidth: 1, borderRadius: 6,
    paddingHorizontal: 10, paddingVertical: 6, backgroundColor: colors.background,
  },
  condChipBigActive: { borderColor: colors.hpDanger, backgroundColor: colors.hpDanger + '22' },
  condChipBigText: { color: colors.textSecondary, fontSize: 12, fontWeight: '500' },
  condChipBigTextActive: { color: colors.hpDanger, fontWeight: '700' },
});
