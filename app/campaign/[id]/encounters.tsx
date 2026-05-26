import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, Pressable, StyleSheet,
  ActivityIndicator, FlatList, Alert, Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  supabase, getActiveSession, getInitiativeOrder, getEncounters,
  createEncounter, deleteEncounter, addCombatant, clearAllCombatants,
} from '@vaultstone/api';
import { useAuthStore, useCampaignStore } from '@vaultstone/store';
import { colors, fonts, spacing, radius, useBreakpoint } from '@vaultstone/ui';
import type { Database, EncounterCombatant } from '@vaultstone/types';

type Campaign = Database['public']['Tables']['campaigns']['Row'];
type EncounterRow = Database['public']['Tables']['encounters']['Row'];

/* ── helpers ─────────────────────────────────────────── */

function getCombatants(enc: EncounterRow): EncounterCombatant[] {
  try {
    return (enc.combatants as unknown as EncounterCombatant[]) ?? [];
  } catch {
    return [];
  }
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

const MAX_PREVIEW = 4;

/* ── component ───────────────────────────────────────── */

export default function EncountersScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const { campaigns } = useCampaignStore();
  const storeCampaign = campaigns.find((c) => c.id === id) ?? null;
  const [fetchedCampaign, setFetchedCampaign] = useState<{ dm_user_id: string; name: string } | null>(null);
  const campaign = storeCampaign ?? fetchedCampaign;
  const { isDesktop, isWide } = useBreakpoint();

  const [encounters, setEncounters] = useState<EncounterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const lastFetchedRef = useRef(0);
  const [loadingEncounter, setLoadingEncounter] = useState<string | null>(null);
  const [hasActiveSession, setHasActiveSession] = useState(false);

  useEffect(() => {
    if (storeCampaign || !id) return;
    supabase.from('campaigns').select('dm_user_id, name').eq('id', id).single()
      .then(({ data }) => { if (data) setFetchedCampaign(data); });
  }, [id, storeCampaign]);

  const isDM = campaign?.dm_user_id === user?.id;
  const numCols = isDesktop || isWide ? 2 : 1;

  /* ── data ───────────────────────────────────────────── */

  async function refresh() {
    if (!id) return;
    const [encRes, sessRes] = await Promise.all([
      getEncounters(id),
      getActiveSession(id),
    ]);
    if (encRes.data) setEncounters(encRes.data as EncounterRow[]);
    setHasActiveSession(!!sessRes.data);
    lastFetchedRef.current = Date.now();
    setLoading(false);
  }

  useFocusEffect(useCallback(() => {
    const STALE_MS = 30_000;
    if (encounters.length > 0 && Date.now() - lastFetchedRef.current < STALE_MS) return;
    refresh();
  }, [id, encounters.length]));

  /* ── actions ────────────────────────────────────────── */

  async function handleCreate() {
    if (!id) return;
    const { data } = await createEncounter(id);
    if (data) {
      router.push(`/campaign/${id}/encounter/${data.id}` as never);
    }
  }

  async function handleDelete(encId: string) {
    const confirmed =
      Platform.OS === 'web'
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
        setLoadingEncounter(null);
        return;
      }
      await clearAllCombatants(session.id);
    }

    const combatants = getCombatants(enc);
    const inserts: Promise<any>[] = [];
    for (const c of combatants) {
      for (let i = 0; i < c.count; i++) {
        const name = c.individualNames?.[i]
          || (c.count > 1 ? `${c.name} ${i + 1}` : c.name);
        inserts.push(
          addCombatant({
            sessionId: session.id,
            name,
            initMod: c.init_mod,
            hpMax: c.hp_max,
            ac: c.ac,
            creatureKey: c.creature_key ?? undefined,
          }),
        );
      }
    }
    await Promise.all(inserts);
    setLoadingEncounter(null);
    router.push(`/campaign/${id}/combat` as never);
  }

  /* ── render helpers ─────────────────────────────────── */

  function renderCreaturePreview(combatants: EncounterCombatant[]): string {
    if (combatants.length === 0) return '';
    const previewed = combatants.slice(0, MAX_PREVIEW);
    const lines = previewed.map((c) => (c.count > 1 ? `${c.count}x ${c.name}` : c.name));
    const rest = combatants.length - MAX_PREVIEW;
    if (rest > 0) lines.push(`+${rest} more`);
    return lines.join(', ');
  }

  function renderCard({ item: enc }: { item: EncounterRow }) {
    const combatants = getCombatants(enc);
    const totalCreatures = combatants.reduce((sum, c) => sum + c.count, 0);
    const isLoading = loadingEncounter === enc.id;

    const summary =
      combatants.length === 0
        ? 'Empty encounter'
        : `${totalCreatures} creature${totalCreatures !== 1 ? 's' : ''} · ${combatants.length} type${combatants.length !== 1 ? 's' : ''}`;

    return (
      <Pressable
        style={(state: any) => [
          st.card,
          (state.hovered || state.pressed) && st.cardHover,
        ]}
        onPress={() => router.push(`/campaign/${id}/encounter/${enc.id}` as never)}
      >
        {/* Top row: name + timestamp */}
        <View style={st.cardTopRow}>
          <Text style={st.cardTitle} numberOfLines={1}>
            {enc.name}
          </Text>
          <Text style={st.cardTimestamp}>{timeAgo(enc.updated_at)}</Text>
        </View>

        {/* Summary line */}
        <Text style={st.cardSummary}>{summary}</Text>

        {/* Creature preview */}
        {combatants.length > 0 && (
          <Text style={st.cardPreview} numberOfLines={2}>
            {renderCreaturePreview(combatants)}
          </Text>
        )}

        {/* Action buttons */}
        <View style={st.cardActions}>
          <TouchableOpacity
            style={st.editBtn}
            onPress={(e) => {
              e.stopPropagation?.();
              router.push(`/campaign/${id}/encounter/${enc.id}` as never);
            }}
          >
            <MaterialCommunityIcons name="pencil-outline" size={14} color={colors.primary} />
            <Text style={st.editBtnText}>Edit</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[st.loadBtn, (isLoading || combatants.length === 0) && st.btnDisabled]}
            disabled={isLoading || combatants.length === 0}
            onPress={(e) => {
              e.stopPropagation?.();
              handleLoadIntoCombat(enc);
            }}
          >
            <MaterialCommunityIcons name="sword-cross" size={14} color="#fff" />
            <Text style={st.loadBtnText}>
              {isLoading ? 'Loading…' : 'Load'}
            </Text>
          </TouchableOpacity>

          {isDM && (
            <TouchableOpacity
              style={st.deleteBtn}
              onPress={(e) => {
                e.stopPropagation?.();
                handleDelete(enc.id);
              }}
            >
              <MaterialCommunityIcons name="trash-can-outline" size={16} color={colors.hpDanger} />
            </TouchableOpacity>
          )}
        </View>
      </Pressable>
    );
  }

  /* ── loading state ──────────────────────────────────── */

  if (loading) {
    return (
      <View style={st.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  /* ── empty state ────────────────────────────────────── */

  if (encounters.length === 0) {
    return (
      <View style={st.container}>
        <View style={st.header}>
          <TouchableOpacity
            onPress={() => router.replace(`/campaign/${id}` as never)}
            style={st.headerBack}
          >
            <MaterialCommunityIcons name="arrow-left" size={22} color={colors.onSurface} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={st.title}>Encounters</Text>
            <Text style={st.subtitle} numberOfLines={1}>
              {campaign?.name ?? ''}
            </Text>
          </View>
        </View>

        <View style={st.placeholder}>
          <MaterialCommunityIcons name="sword-cross" size={48} color={colors.outline} />
          <Text style={st.placeholderTitle}>No encounters yet</Text>
          <Text style={st.placeholderBody}>
            Create encounters to plan combat ahead of time.
          </Text>
          {isDM && (
            <TouchableOpacity style={st.createBtn} onPress={handleCreate}>
              <MaterialCommunityIcons name="plus" size={16} color="#fff" />
              <Text style={st.createBtnText}>Create First Encounter</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  /* ── list state ─────────────────────────────────────── */

  return (
    <View style={st.container}>
      <View style={st.header}>
        <TouchableOpacity
          onPress={() => router.replace(`/campaign/${id}` as never)}
          style={st.headerBack}
        >
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.onSurface} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={st.title}>Encounters</Text>
          <Text style={st.subtitle} numberOfLines={1}>
            {campaign?.name ?? ''}
          </Text>
        </View>
        {hasActiveSession && (
          <TouchableOpacity
            style={st.combatTrackerBtn}
            onPress={() => router.push(`/campaign/${id}/combat` as never)}
          >
            <MaterialCommunityIcons name="sword-cross" size={14} color={colors.primary} />
            <Text style={st.combatTrackerBtnText}>Combat Tracker</Text>
          </TouchableOpacity>
        )}
        {isDM && (
          <TouchableOpacity style={st.createBtn} onPress={handleCreate}>
            <MaterialCommunityIcons name="plus" size={16} color="#fff" />
            <Text style={st.createBtnText}>New Encounter</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        key={numCols}
        data={encounters}
        keyExtractor={(e) => e.id}
        numColumns={numCols}
        columnWrapperStyle={numCols > 1 ? { gap: spacing.sm } : undefined}
        contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }}
        renderItem={renderCard}
      />
    </View>
  );
}

/* ── styles ───────────────────────────────────────────── */

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceCanvas },
  center: {
    flex: 1,
    backgroundColor: colors.surfaceCanvas,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* header */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomColor: colors.outlineVariant,
    borderBottomWidth: 1,
    backgroundColor: colors.surfaceContainerHigh,
  },
  headerBack: { padding: 4 },
  title: { fontSize: 18, fontFamily: fonts.headline, fontWeight: '700', color: colors.onSurface },
  subtitle: { fontSize: 12, fontFamily: fonts.label, color: colors.onSurfaceVariant, marginTop: 2 },

  /* create button */
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    borderRadius: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  createBtnText: { color: '#fff', fontSize: 12, fontFamily: fonts.label, fontWeight: '700' },
  combatTrackerBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderColor: `${colors.primary}66`, borderWidth: 1, borderRadius: 6,
    backgroundColor: `${colors.primary}14`,
    paddingHorizontal: spacing.md, paddingVertical: 8,
  },
  combatTrackerBtnText: { color: colors.primary, fontSize: 12, fontFamily: fonts.label, fontWeight: '700' },

  /* empty state */
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  placeholderTitle: { fontSize: 16, fontFamily: fonts.headline, fontWeight: '700', color: colors.onSurface },
  placeholderBody: {
    fontSize: 12,
    fontFamily: fonts.body,
    color: colors.outline,
    textAlign: 'center',
    lineHeight: 18,
  },

  /* encounter card */
  card: {
    flex: 1,
    borderColor: colors.outlineVariant,
    borderWidth: 1,
    borderRadius: 6,
    padding: spacing.md,
    gap: 6,
  },
  cardHover: {
    borderColor: `${colors.primary}66`,
    backgroundColor: `${colors.primary}08`,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  cardTitle: {
    flex: 1,
    fontSize: 13,
    fontFamily: fonts.headline,
    fontWeight: '600',
    color: colors.onSurface,
  },
  cardTimestamp: {
    fontSize: 10,
    fontFamily: fonts.label,
    color: colors.outline,
  },
  cardSummary: {
    fontSize: 11,
    fontFamily: fonts.body,
    color: colors.onSurfaceVariant,
  },
  cardPreview: {
    fontSize: 11,
    fontFamily: fonts.body,
    color: colors.outline,
    fontStyle: 'italic',
    lineHeight: 16,
  },

  /* action buttons */
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: 4,
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderColor: `${colors.primary}66`,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: `${colors.primary}14`,
  },
  editBtnText: {
    color: colors.primary,
    fontSize: 10,
    fontFamily: fonts.label,
    fontWeight: '700',
  },
  loadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  loadBtnText: { color: '#fff', fontSize: 10, fontFamily: fonts.label, fontWeight: '700' },
  btnDisabled: { opacity: 0.4 },
  deleteBtn: { padding: 6, marginLeft: 'auto' },
});
