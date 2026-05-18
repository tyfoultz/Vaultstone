import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, Pressable, TextInput, StyleSheet,
  ActivityIndicator, FlatList, Alert, Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  supabase, getActiveSession, getEncounters, createEncounter,
  updateEncounter, deleteEncounter, addCombatant,
} from '@vaultstone/api';
import { useAuthStore, useCampaignStore } from '@vaultstone/store';
import { colors, spacing, HpBar } from '@vaultstone/ui';
import { CreaturePickerModal, type AddCreatureInput } from '../../../components/combat/CreaturePickerModal';
import type { Database, EncounterCombatant } from '@vaultstone/types';

type Campaign = Database['public']['Tables']['campaigns']['Row'];
type EncounterRow = Database['public']['Tables']['encounters']['Row'];

export default function EncountersScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const { campaigns } = useCampaignStore();
  const campaign = campaigns.find((c) => c.id === id) ?? null;

  const [encounters, setEncounters] = useState<EncounterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<Record<string, string>>({});
  const [pickerForEncounter, setPickerForEncounter] = useState<string | null>(null);
  const [loadingEncounter, setLoadingEncounter] = useState<string | null>(null);

  const saveTimer = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const isDM = campaign?.dm_user_id === user?.id;

  async function refresh() {
    if (!id) return;
    const { data } = await getEncounters(id);
    if (data) setEncounters(data as EncounterRow[]);
    setLoading(false);
  }

  useFocusEffect(useCallback(() => { refresh(); }, [id]));

  async function handleCreate() {
    if (!id) return;
    const { data } = await createEncounter(id);
    if (data) {
      setEncounters((prev) => [data as EncounterRow, ...prev]);
      setExpandedId(data.id);
      setEditingName((prev) => ({ ...prev, [data.id]: data.name }));
    }
  }

  function getCombatants(enc: EncounterRow): EncounterCombatant[] {
    try {
      return (enc.combatants as unknown as EncounterCombatant[]) ?? [];
    } catch {
      return [];
    }
  }

  function debouncedSave(encId: string, combatants: EncounterCombatant[]) {
    if (saveTimer.current[encId]) clearTimeout(saveTimer.current[encId]);
    saveTimer.current[encId] = setTimeout(() => {
      updateEncounter(encId, { combatants });
    }, 600);
  }

  function handleNameBlur(encId: string) {
    const name = editingName[encId]?.trim();
    if (name) updateEncounter(encId, { name });
  }

  function handleAddCreatures(encId: string, inputs: AddCreatureInput[]) {
    setEncounters((prev) =>
      prev.map((enc) => {
        if (enc.id !== encId) return enc;
        const existing = getCombatants(enc);
        const newEntries: EncounterCombatant[] = inputs.map((c) => ({
          name: c.name,
          creature_key: c.creatureKey || null,
          count: 1,
          init_mod: c.initMod,
          hp_max: c.hpMax,
          ac: c.ac,
        }));
        const merged = [...existing];
        for (const entry of newEntries) {
          const idx = merged.findIndex((m) =>
            m.creature_key && m.creature_key === entry.creature_key,
          );
          if (idx >= 0) {
            merged[idx] = { ...merged[idx], count: merged[idx].count + 1 };
          } else {
            merged.push(entry);
          }
        }
        debouncedSave(encId, merged);
        return { ...enc, combatants: merged as any };
      }),
    );
    setPickerForEncounter(null);
  }

  function adjustCount(encId: string, idx: number, delta: number) {
    setEncounters((prev) =>
      prev.map((enc) => {
        if (enc.id !== encId) return enc;
        const combatants = [...getCombatants(enc)];
        const newCount = Math.max(0, combatants[idx].count + delta);
        if (newCount === 0) {
          combatants.splice(idx, 1);
        } else {
          combatants[idx] = { ...combatants[idx], count: newCount };
        }
        debouncedSave(encId, combatants);
        return { ...enc, combatants: combatants as any };
      }),
    );
  }

  function removeCombatantLine(encId: string, idx: number) {
    setEncounters((prev) =>
      prev.map((enc) => {
        if (enc.id !== encId) return enc;
        const combatants = [...getCombatants(enc)];
        combatants.splice(idx, 1);
        debouncedSave(encId, combatants);
        return { ...enc, combatants: combatants as any };
      }),
    );
  }

  async function handleDelete(encId: string) {
    const confirmed = Platform.OS === 'web'
      ? window.confirm('Delete this encounter?')
      : await new Promise<boolean>((resolve) => {
          Alert.alert('Delete Encounter?', 'This cannot be undone.', [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Delete', style: 'destructive', onPress: () => resolve(true) },
          ]);
        });
    if (!confirmed) return;
    await deleteEncounter(encId);
    setEncounters((prev) => prev.filter((e) => e.id !== encId));
    if (expandedId === encId) setExpandedId(null);
  }

  async function handleLoadIntoCombat(enc: EncounterRow) {
    if (!id) return;
    setLoadingEncounter(enc.id);
    const { data: session } = await getActiveSession(id);
    if (!session) {
      if (Platform.OS === 'web') {
        window.alert('Start a session first to load an encounter into combat.');
      } else {
        Alert.alert('No Active Session', 'Start a session from the campaign page first.');
      }
      setLoadingEncounter(null);
      return;
    }
    const combatants = getCombatants(enc);
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
    setLoadingEncounter(null);
    router.push(`/campaign/${id}/combat` as never);
  }

  if (loading) {
    return (
      <View style={st.center}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  return (
    <View style={st.container}>
      <View style={st.header}>
        <TouchableOpacity
          onPress={() => router.replace(`/campaign/${id}` as never)}
          style={st.headerBack}
        >
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={st.title}>Encounters</Text>
          <Text style={st.subtitle} numberOfLines={1}>{campaign?.name ?? ''}</Text>
        </View>
        {isDM && (
          <TouchableOpacity style={st.createBtn} onPress={handleCreate}>
            <MaterialCommunityIcons name="plus" size={16} color="#fff" />
            <Text style={st.createBtnText}>New Encounter</Text>
          </TouchableOpacity>
        )}
      </View>

      {encounters.length === 0 ? (
        <View style={st.placeholder}>
          <MaterialCommunityIcons name="sword-cross" size={48} color={colors.textSecondary} />
          <Text style={st.placeholderTitle}>No encounters yet</Text>
          <Text style={st.placeholderBody}>
            Create encounters ahead of time so you can quickly load them into combat during a session.
          </Text>
          {isDM && (
            <TouchableOpacity style={st.createBtn} onPress={handleCreate}>
              <MaterialCommunityIcons name="plus" size={16} color="#fff" />
              <Text style={st.createBtnText}>Create First Encounter</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <FlatList
          data={encounters}
          keyExtractor={(e) => e.id}
          contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }}
          renderItem={({ item: enc }) => {
            const combatants = getCombatants(enc);
            const isExpanded = expandedId === enc.id;
            const totalCreatures = combatants.reduce((sum, c) => sum + c.count, 0);
            const isLoading = loadingEncounter === enc.id;

            return (
              <View style={[st.card, isExpanded && st.cardExpanded]}>
                <Pressable
                  style={st.cardHeader}
                  onPress={() => setExpandedId(isExpanded ? null : enc.id)}
                >
                  <MaterialCommunityIcons
                    name={isExpanded ? 'chevron-down' : 'chevron-right'}
                    size={18} color={colors.textSecondary}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={st.cardTitle} numberOfLines={1}>{enc.name}</Text>
                    <Text style={st.cardMeta}>
                      {totalCreatures} creature{totalCreatures !== 1 ? 's' : ''} · {combatants.length} type{combatants.length !== 1 ? 's' : ''}
                    </Text>
                  </View>
                  <View style={st.cardActions}>
                    <TouchableOpacity
                      style={[st.loadBtn, isLoading && { opacity: 0.5 }]}
                      onPress={() => handleLoadIntoCombat(enc)}
                      disabled={isLoading || combatants.length === 0}
                    >
                      <MaterialCommunityIcons name="sword-cross" size={14} color="#fff" />
                      <Text style={st.loadBtnText}>{isLoading ? 'Loading...' : 'Load'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={st.deleteBtn} onPress={() => handleDelete(enc.id)}>
                      <MaterialCommunityIcons name="trash-can-outline" size={16} color={colors.hpDanger} />
                    </TouchableOpacity>
                  </View>
                </Pressable>

                {isExpanded && (
                  <View style={st.cardBody}>
                    <View style={st.nameRow}>
                      <Text style={st.fieldLabel}>Name</Text>
                      <TextInput
                        style={st.nameInput}
                        value={editingName[enc.id] ?? enc.name}
                        onChangeText={(v) => setEditingName((prev) => ({ ...prev, [enc.id]: v }))}
                        onBlur={() => handleNameBlur(enc.id)}
                        selectTextOnFocus
                      />
                    </View>

                    <View style={st.combatantListHeader}>
                      <Text style={st.fieldLabel}>Combatants</Text>
                      <TouchableOpacity
                        style={st.addCreatureBtn}
                        onPress={() => setPickerForEncounter(enc.id)}
                      >
                        <MaterialCommunityIcons name="plus" size={14} color={colors.brand} />
                        <Text style={st.addCreatureBtnText}>Add Creatures</Text>
                      </TouchableOpacity>
                    </View>

                    {combatants.length === 0 ? (
                      <Text style={st.emptyText}>No creatures added yet.</Text>
                    ) : (
                      combatants.map((c, idx) => (
                        <View key={`${c.creature_key ?? c.name}-${idx}`} style={st.combatantRow}>
                          <View style={{ flex: 1 }}>
                            <View style={st.combatantNameRow}>
                              <Text style={st.combatantName} numberOfLines={1}>{c.name}</Text>
                              {c.creature_key && (
                                <MaterialCommunityIcons name="book-open-variant" size={12} color={colors.brand} />
                              )}
                            </View>
                            <Text style={st.combatantMeta}>
                              HP {c.hp_max} · AC {c.ac} · Init {c.init_mod >= 0 ? `+${c.init_mod}` : c.init_mod}
                            </Text>
                          </View>
                          <View style={st.countControls}>
                            <TouchableOpacity
                              style={st.countBtn}
                              onPress={() => adjustCount(enc.id, idx, -1)}
                            >
                              <MaterialCommunityIcons name="minus" size={14} color={colors.textPrimary} />
                            </TouchableOpacity>
                            <Text style={st.countText}>{c.count}</Text>
                            <TouchableOpacity
                              style={st.countBtn}
                              onPress={() => adjustCount(enc.id, idx, 1)}
                            >
                              <MaterialCommunityIcons name="plus" size={14} color={colors.textPrimary} />
                            </TouchableOpacity>
                          </View>
                          <TouchableOpacity
                            style={st.removeBtn}
                            onPress={() => removeCombatantLine(enc.id, idx)}
                          >
                            <MaterialCommunityIcons name="close" size={14} color={colors.textSecondary} />
                          </TouchableOpacity>
                        </View>
                      ))
                    )}
                  </View>
                )}
              </View>
            );
          }}
        />
      )}

      <CreaturePickerModal
        visible={!!pickerForEncounter}
        onClose={() => setPickerForEncounter(null)}
        onAddCreatures={(inputs) => {
          if (pickerForEncounter) handleAddCreatures(pickerForEncounter, inputs);
        }}
      />
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1, backgroundColor: colors.background,
    alignItems: 'center', justifyContent: 'center',
  },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderBottomColor: colors.border, borderBottomWidth: 1,
    backgroundColor: colors.surface,
  },
  headerBack: { padding: 4 },
  title: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  subtitle: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  createBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.brand, borderRadius: 8,
    paddingHorizontal: spacing.md, paddingVertical: 8,
  },
  createBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  placeholder: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    gap: spacing.md, paddingHorizontal: spacing.xl,
  },
  placeholderTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  placeholderBody: {
    fontSize: 13, color: colors.textSecondary, textAlign: 'center', lineHeight: 20,
  },
  card: {
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    borderRadius: 10, overflow: 'hidden',
  },
  cardExpanded: { borderColor: colors.brand + '44' },
  cardHeader: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  cardMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  loadBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.brand, borderRadius: 6,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  loadBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  deleteBtn: { padding: 6 },
  cardBody: {
    paddingHorizontal: spacing.md, paddingBottom: spacing.md,
    borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
    paddingTop: spacing.sm,
  },
  nameRow: { gap: 4 },
  fieldLabel: { fontSize: 10, fontWeight: '700', color: colors.textSecondary, letterSpacing: 1 },
  nameInput: {
    borderColor: colors.border, borderWidth: 1, borderRadius: 6,
    paddingHorizontal: 10, paddingVertical: 8,
    fontSize: 14, fontWeight: '600', color: colors.textPrimary,
    backgroundColor: colors.background,
  },
  combatantListHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  addCreatureBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderColor: colors.brand, borderWidth: 1, borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  addCreatureBtnText: { color: colors.brand, fontSize: 12, fontWeight: '600' },
  emptyText: { color: colors.textSecondary, fontSize: 12, fontStyle: 'italic', paddingVertical: 4 },
  combatantRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: 6, borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  combatantNameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  combatantName: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },
  combatantMeta: { fontSize: 11, color: colors.textSecondary, marginTop: 1 },
  countControls: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  countBtn: {
    width: 24, height: 24, borderRadius: 12,
    borderColor: colors.border, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.background,
  },
  countText: { fontSize: 14, fontWeight: '700', color: colors.textPrimary, minWidth: 20, textAlign: 'center' },
  removeBtn: { padding: 4 },
});
