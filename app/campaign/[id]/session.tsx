import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, StyleSheet,
  ActivityIndicator, Alert, Platform, FlatList,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  supabase, getActiveSession, endSession, getCampaignPartyState,
  getInitiativeOrder, addCombatant, removeCombatant, advanceTurn,
} from '@vaultstone/api';
import { useAuthStore, useCampaignStore } from '@vaultstone/store';
import { colors, spacing } from '@vaultstone/ui';
import type {
  Database, Dnd5eStats, Dnd5eResources, Dnd5eEquipmentItem,
} from '@vaultstone/types';

type Session = Database['public']['Tables']['sessions']['Row'];
type Campaign = Database['public']['Tables']['campaigns']['Row'];
type Combatant = Database['public']['Tables']['initiative_order']['Row'];

type PartyMember = {
  user_id: string;
  role: 'gm' | 'player' | 'co_gm';
  character_id: string | null;
  profiles: { id: string; display_name: string | null } | null;
  characters: {
    id: string;
    name: string;
    base_stats: unknown;
    resources: unknown;
  } | null;
};

type PartyPick = {
  userId: string;
  characterId: string;
  name: string;
  hpMax: number;
  hpCurrent: number;
  ac: number;
  initRoll: number;
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

function rollD20() { return Math.floor(Math.random() * 20) + 1; }

export default function SessionScreen() {
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
  const [ending, setEnding] = useState(false);
  const [advancing, setAdvancing] = useState(false);

  const [adding, setAdding] = useState(false);
  const [formName, setFormName] = useState('');
  const [formInit, setFormInit] = useState('');
  const [formHp, setFormHp] = useState('');
  const [formAc, setFormAc] = useState('');
  const [saving, setSaving] = useState(false);

  const [addingParty, setAddingParty] = useState(false);
  const [partyLoading, setPartyLoading] = useState(false);
  const [partyPicks, setPartyPicks] = useState<PartyPick[]>([]);
  const [addingSelected, setAddingSelected] = useState(false);

  const isDM = campaign?.dm_user_id === user?.id;

  // Load the active session + campaign + initiative order on focus.
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
        setLoading(false);
      })();
      return () => { cancelled = true; };
    }, [id])
  );

  // Realtime: on the session channel, watch both the sessions row (end
  // signal / round bumps) and the initiative_order rows for this session.
  // We refetch the full list on any initiative change rather than applying
  // the payload piecemeal — DELETE events aren't filtered by session_id
  // under default REPLICA IDENTITY, so a refetch is the safe default.
  useEffect(() => {
    if (!session) return;
    const channel = supabase
      .channel(`session:${session.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'sessions',
          filter: `id=eq.${session.id}`,
        },
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
        {
          event: '*',
          schema: 'public',
          table: 'initiative_order',
          filter: `session_id=eq.${session.id}`,
        },
        async () => {
          const { data } = await getInitiativeOrder(session.id);
          setEntries((data ?? []) as Combatant[]);
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [session?.id]);

  async function handleEnd() {
    if (!session || ending) return;
    const confirmed = Platform.OS === 'web'
      // eslint-disable-next-line no-alert
      ? window.confirm('End this session? Combat state will be cleared.')
      : await new Promise<boolean>((resolve) => {
          Alert.alert(
            'End Session?',
            'Combat state will be cleared.',
            [
              { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
              { text: 'End Session', style: 'destructive', onPress: () => resolve(true) },
            ],
          );
        });
    if (!confirmed) return;
    setEnding(true);
    const { error } = await endSession(session.id);
    setEnding(false);
    if (!error) router.replace(`/campaign/${id}` as never);
  }

  function resetForm() {
    setFormName(''); setFormInit(''); setFormHp(''); setFormAc('');
    setAdding(false);
  }

  async function handleAdd() {
    if (!session || saving) return;
    const name = formName.trim();
    const init = parseInt(formInit, 10);
    const hp = parseInt(formHp, 10);
    const ac = parseInt(formAc, 10);
    if (!name || Number.isNaN(init) || Number.isNaN(hp) || Number.isNaN(ac)) return;
    setSaving(true);
    await addCombatant({ sessionId: session.id, name, init, hpMax: hp, ac });
    setSaving(false);
    resetForm();
  }

  async function handleRemove(combatantId: string) {
    await removeCombatant(combatantId);
  }

  // Open party picker — fetches party members with linked characters,
  // skipping anyone already in the encounter (dedupe by character_id),
  // and pre-rolls 1d20 + dex mod so the DM can just edit if needed.
  async function openPartyPicker() {
    if (!id) return;
    setAddingParty(true);
    setPartyLoading(true);
    const { data } = await getCampaignPartyState(id);
    const members = (data ?? []) as unknown as PartyMember[];
    const existingCharIds = new Set(
      entries.map((e) => e.character_id).filter((x): x is string => !!x),
    );
    const picks: PartyPick[] = members
      .filter((m) => m.characters && !existingCharIds.has(m.characters.id))
      .map((m) => {
        const stats = m.characters!.base_stats as Dnd5eStats;
        const resources = m.characters!.resources as Dnd5eResources;
        const dexMod = abilityMod(stats.abilityScores.dexterity);
        const hpMax = stats.hpMax ?? 0;
        const hpCurrent = resources.hpCurrent ?? hpMax;
        return {
          userId: m.user_id,
          characterId: m.characters!.id,
          name: m.characters!.name,
          hpMax,
          hpCurrent,
          ac: computeAc(stats, resources),
          initRoll: rollD20() + dexMod,
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

  function togglePick(characterId: string) {
    setPartyPicks((prev) =>
      prev.map((p) => (p.characterId === characterId ? { ...p, selected: !p.selected } : p)),
    );
  }

  function setPickInit(characterId: string, value: string) {
    const parsed = parseInt(value, 10);
    setPartyPicks((prev) =>
      prev.map((p) => (p.characterId === characterId
        ? { ...p, initRoll: Number.isNaN(parsed) ? 0 : parsed }
        : p)),
    );
  }

  function toggleSelectAll() {
    const allSelected = partyPicks.every((p) => p.selected);
    setPartyPicks((prev) => prev.map((p) => ({ ...p, selected: !allSelected })));
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
        init: p.initRoll,
        hpMax: p.hpMax,
        ac: p.ac,
        characterId: p.characterId,
      })),
    );
    setAddingSelected(false);
    closePartyPicker();
  }

  async function handleNextTurn() {
    if (!session || advancing || entries.length === 0) return;
    setAdvancing(true);
    await advanceTurn(session.id);
    setAdvancing(false);
  }

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }
  if (!session) return null;

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.headerBack}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.title} numberOfLines={1}>
            {campaign?.name ?? 'Session'}
          </Text>
          <Text style={s.subtitle}>Round {session.round}</Text>
        </View>
        {isDM && (
          <TouchableOpacity
            style={[s.endBtn, ending && { opacity: 0.5 }]}
            onPress={handleEnd}
            disabled={ending}
          >
            <Text style={s.endBtnText}>{ending ? 'Ending…' : 'End Session'}</Text>
          </TouchableOpacity>
        )}
      </View>

      {isDM && (
        <View style={s.controls}>
          <TouchableOpacity
            style={s.controlBtn}
            onPress={() => setAdding((v) => !v)}
          >
            <MaterialCommunityIcons
              name={adding ? 'close' : 'plus'}
              size={16}
              color={colors.textPrimary}
            />
            <Text style={s.controlBtnText}>{adding ? 'Cancel' : 'Add Combatant'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.controlBtn}
            onPress={() => (addingParty ? closePartyPicker() : openPartyPicker())}
          >
            <MaterialCommunityIcons
              name={addingParty ? 'close' : 'account-multiple-plus'}
              size={16}
              color={colors.textPrimary}
            />
            <Text style={s.controlBtnText}>
              {addingParty ? 'Cancel' : 'Add Party'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.controlBtnPrimary, (advancing || entries.length === 0) && { opacity: 0.5 }]}
            onPress={handleNextTurn}
            disabled={advancing || entries.length === 0}
          >
            <MaterialCommunityIcons name="skip-next" size={16} color="#fff" />
            <Text style={s.controlBtnPrimaryText}>
              {advancing ? 'Advancing…' : 'Next Turn'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {isDM && adding && (
        <View style={s.addForm}>
          <TextInput
            style={[s.input, { flex: 2 }]}
            placeholder="Name"
            placeholderTextColor={colors.textSecondary}
            value={formName}
            onChangeText={setFormName}
          />
          <TextInput
            style={[s.input, { flex: 1 }]}
            placeholder="Init"
            placeholderTextColor={colors.textSecondary}
            keyboardType="number-pad"
            value={formInit}
            onChangeText={setFormInit}
          />
          <TextInput
            style={[s.input, { flex: 1 }]}
            placeholder="HP"
            placeholderTextColor={colors.textSecondary}
            keyboardType="number-pad"
            value={formHp}
            onChangeText={setFormHp}
          />
          <TextInput
            style={[s.input, { flex: 1 }]}
            placeholder="AC"
            placeholderTextColor={colors.textSecondary}
            keyboardType="number-pad"
            value={formAc}
            onChangeText={setFormAc}
          />
          <TouchableOpacity
            style={[s.saveBtn, saving && { opacity: 0.5 }]}
            onPress={handleAdd}
            disabled={saving}
          >
            <Text style={s.saveBtnText}>{saving ? '…' : 'Save'}</Text>
          </TouchableOpacity>
        </View>
      )}

      {isDM && addingParty && (
        <View style={s.pickerPanel}>
          {partyLoading ? (
            <ActivityIndicator color={colors.brand} />
          ) : partyPicks.length === 0 ? (
            <Text style={s.pickerEmpty}>
              No party members with characters available to add.
            </Text>
          ) : (
            <>
              <View style={s.pickerHeaderRow}>
                <TouchableOpacity onPress={toggleSelectAll} style={s.pickerSelectAll}>
                  <MaterialCommunityIcons
                    name={partyPicks.every((p) => p.selected)
                      ? 'checkbox-marked' : 'checkbox-blank-outline'}
                    size={18}
                    color={colors.textPrimary}
                  />
                  <Text style={s.pickerSelectAllText}>Select all</Text>
                </TouchableOpacity>
                <Text style={s.pickerCount}>
                  {partyPicks.filter((p) => p.selected).length} / {partyPicks.length}
                </Text>
              </View>
              {partyPicks.map((p) => (
                <View key={p.characterId} style={s.pickerRow}>
                  <TouchableOpacity
                    onPress={() => togglePick(p.characterId)}
                    style={s.pickerCheckbox}
                  >
                    <MaterialCommunityIcons
                      name={p.selected ? 'checkbox-marked' : 'checkbox-blank-outline'}
                      size={20}
                      color={p.selected ? colors.brand : colors.textSecondary}
                    />
                  </TouchableOpacity>
                  <View style={{ flex: 1 }}>
                    <Text style={s.pickerName} numberOfLines={1}>{p.name}</Text>
                    <Text style={s.pickerMeta}>
                      HP {p.hpCurrent}/{p.hpMax} · AC {p.ac}
                    </Text>
                  </View>
                  <View style={s.pickerInitBlock}>
                    <Text style={s.pickerInitLabel}>Init</Text>
                    <TextInput
                      style={s.pickerInitInput}
                      keyboardType="number-pad"
                      value={String(p.initRoll)}
                      onChangeText={(v) => setPickInit(p.characterId, v)}
                    />
                  </View>
                </View>
              ))}
              <TouchableOpacity
                style={[
                  s.pickerAddBtn,
                  (addingSelected || partyPicks.filter((p) => p.selected).length === 0)
                    && { opacity: 0.5 },
                ]}
                onPress={handleAddParty}
                disabled={addingSelected || partyPicks.filter((p) => p.selected).length === 0}
              >
                <Text style={s.pickerAddBtnText}>
                  {addingSelected
                    ? 'Adding…'
                    : `Add ${partyPicks.filter((p) => p.selected).length} to encounter`}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}

      {entries.length === 0 ? (
        <View style={s.placeholder}>
          <MaterialCommunityIcons name="sword-cross" size={48} color={colors.textSecondary} />
          <Text style={s.placeholderTitle}>No combatants yet</Text>
          <Text style={s.placeholderBody}>
            {isDM
              ? 'Add combatants to begin tracking initiative.'
              : 'Waiting for the DM to set up initiative.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(e) => e.id}
          contentContainerStyle={{ paddingVertical: spacing.sm }}
          renderItem={({ item }) => (
            <View style={[s.row, item.is_active_turn && s.rowActive]}>
              {item.is_active_turn && (
                <MaterialCommunityIcons
                  name="arrow-right-bold"
                  size={18}
                  color={colors.brand}
                  style={{ marginRight: 4 }}
                />
              )}
              <View style={s.initBadge}>
                <Text style={s.initBadgeText}>{item.init_value}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.rowName} numberOfLines={1}>{item.display_name}</Text>
                <Text style={s.rowMeta}>
                  HP {item.hp_current}/{item.hp_max} · AC {item.ac}
                </Text>
              </View>
              {isDM && (
                <TouchableOpacity
                  style={s.rowAction}
                  onPress={() => handleRemove(item.id)}
                >
                  <MaterialCommunityIcons
                    name="trash-can-outline"
                    size={18}
                    color={colors.hpDanger}
                  />
                </TouchableOpacity>
              )}
            </View>
          )}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1, backgroundColor: colors.background,
    alignItems: 'center', justifyContent: 'center',
  },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    borderBottomColor: colors.border, borderBottomWidth: 1,
    backgroundColor: colors.surface,
  },
  headerBack: { padding: 4 },
  title: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  subtitle: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  endBtn: {
    borderColor: colors.hpDanger, borderWidth: 1, borderRadius: 8,
    paddingHorizontal: spacing.md, paddingVertical: 6,
  },
  endBtnText: { color: colors.hpDanger, fontSize: 13, fontWeight: '700' },

  controls: {
    flexDirection: 'row', gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderBottomColor: colors.border, borderBottomWidth: 1,
  },
  controlBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderColor: colors.border, borderWidth: 1, borderRadius: 8,
    paddingHorizontal: spacing.md, paddingVertical: 8,
  },
  controlBtnText: { color: colors.textPrimary, fontSize: 13, fontWeight: '600' },
  controlBtnPrimary: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.brand, borderRadius: 8,
    paddingHorizontal: spacing.md, paddingVertical: 8,
    marginLeft: 'auto',
  },
  controlBtnPrimaryText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  addForm: {
    flexDirection: 'row', gap: 6, alignItems: 'center',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderBottomColor: colors.border, borderBottomWidth: 1,
    backgroundColor: colors.surface,
  },
  input: {
    backgroundColor: colors.background,
    borderColor: colors.border, borderWidth: 1, borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 6,
    color: colors.textPrimary, fontSize: 13,
  },
  saveBtn: {
    backgroundColor: colors.brand, borderRadius: 6,
    paddingHorizontal: spacing.md, paddingVertical: 8,
  },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  pickerPanel: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderBottomColor: colors.border, borderBottomWidth: 1,
    backgroundColor: colors.surface,
    gap: 8,
  },
  pickerEmpty: {
    color: colors.textSecondary, fontSize: 13, textAlign: 'center',
    paddingVertical: spacing.sm,
  },
  pickerHeaderRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingBottom: 4,
  },
  pickerSelectAll: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pickerSelectAllText: { color: colors.textPrimary, fontSize: 13, fontWeight: '600' },
  pickerCount: { color: colors.textSecondary, fontSize: 12 },
  pickerRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: 6,
  },
  pickerCheckbox: { padding: 2 },
  pickerName: { color: colors.textPrimary, fontSize: 14, fontWeight: '600' },
  pickerMeta: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  pickerInitBlock: { alignItems: 'center', gap: 2 },
  pickerInitLabel: { color: colors.textSecondary, fontSize: 10 },
  pickerInitInput: {
    width: 52, textAlign: 'center',
    backgroundColor: colors.background,
    borderColor: colors.border, borderWidth: 1, borderRadius: 6,
    paddingVertical: 4, paddingHorizontal: 6,
    color: colors.textPrimary, fontSize: 13, fontWeight: '600',
  },
  pickerAddBtn: {
    backgroundColor: colors.brand, borderRadius: 8,
    paddingVertical: 10, alignItems: 'center', marginTop: 4,
  },
  pickerAddBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderBottomColor: colors.border, borderBottomWidth: 1,
  },
  rowActive: { backgroundColor: colors.surface },
  initBadge: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.background,
    borderColor: colors.border, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  initBadgeText: { color: colors.textPrimary, fontSize: 14, fontWeight: '700' },
  rowName: { color: colors.textPrimary, fontSize: 15, fontWeight: '600' },
  rowMeta: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  rowAction: { padding: 6 },

  placeholder: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm, paddingHorizontal: spacing.lg,
  },
  placeholderTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  placeholderBody: {
    fontSize: 13, color: colors.textSecondary, textAlign: 'center', lineHeight: 18,
  },
});
