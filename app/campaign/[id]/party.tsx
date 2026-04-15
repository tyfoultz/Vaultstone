import { useCallback, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, RefreshControl, StyleSheet,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getCampaignPartyState } from '@vaultstone/api';
import { useAuthStore } from '@vaultstone/store';
import { colors, spacing } from '@vaultstone/ui';
import type {
  Dnd5eAbilityScores, Dnd5eEquipmentItem, Dnd5eResources, Dnd5eStats,
} from '@vaultstone/types';

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
    conditions: string[] | null;
  } | null;
};

const ROLE_LABEL: Record<string, string> = { gm: 'DM', co_gm: 'Co-DM', player: 'Player' };

function abilityMod(score: number) { return Math.floor((score - 10) / 2); }
function capitalize(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }

function computeAc(stats: Dnd5eStats, resources: Dnd5eResources): number {
  const scores = stats.abilityScores;
  const dexMod = abilityMod(scores.dexterity);
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

function hpColor(current: number, max: number): string {
  if (max <= 0) return colors.textSecondary;
  if (current === 0) return colors.hpDanger;
  const ratio = current / max;
  if (ratio >= 1) return colors.hpHealthy;
  if (ratio > 0.75) return '#A3D977';
  if (ratio > 0.5) return colors.hpWarning;
  if (ratio > 0.25) return '#F97316';
  return colors.hpDanger;
}

export default function PartyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const [members, setMembers] = useState<PartyMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const { data } = await getCampaignPartyState(id);
    // Supabase join typings mistakenly flag profiles/characters embeds as SelectQueryError — cast through unknown.
    if (data) setMembers(data as unknown as PartyMember[]);
    setLoading(false);
    setRefreshing(false);
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(() => { setRefreshing(true); load(); }, [load]);

  const dm = members.find((m) => m.role === 'gm');
  const players = members.filter((m) => m.role !== 'gm');
  const linked = players.filter((m) => m.characters);

  return (
    <ScrollView
      style={s.scroll}
      contentContainerStyle={s.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
    >
      <TouchableOpacity onPress={() => router.back()} style={s.back}>
        <MaterialCommunityIcons name="arrow-left" size={18} color={colors.brand} />
        <Text style={s.backText}>Campaign</Text>
      </TouchableOpacity>

      <View style={s.header}>
        <Text style={s.title}>Party</Text>
        {dm?.profiles?.display_name && (
          <Text style={s.subtitle}>DM · {dm.profiles.display_name}</Text>
        )}
      </View>

      {loading && members.length === 0 ? (
        <Text style={s.helperText}>Loading…</Text>
      ) : linked.length === 0 ? (
        <View style={s.emptyCard}>
          <MaterialCommunityIcons
            name="account-alert-outline"
            size={32}
            color={colors.textSecondary}
          />
          <Text style={s.emptyTitle}>No characters linked yet</Text>
          <Text style={s.emptyBody}>
            Players need to link a character to appear here. Open Manage Members
            to see who's joined.
          </Text>
          <TouchableOpacity
            style={s.emptyAction}
            onPress={() => router.replace(`/campaign/${id}` as never)}
          >
            <Text style={s.emptyActionText}>Go to Campaign</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={s.list}>
          {players.map((m) => (
            <PartyCard key={m.user_id} member={m} isMe={m.user_id === user?.id} />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function PartyCard({ member, isMe }: { member: PartyMember; isMe: boolean }) {
  const char = member.characters;
  const ownerName = member.profiles?.display_name ?? 'Anonymous';
  const role = ROLE_LABEL[member.role] ?? member.role;

  if (!char) {
    return (
      <View style={s.card}>
        <View style={s.cardHeader}>
          <MaterialCommunityIcons
            name="account-alert-outline"
            size={22}
            color={colors.textSecondary}
          />
          <View style={{ flex: 1 }}>
            <Text style={s.charName}>No character linked</Text>
            <Text style={s.ownerLine}>
              {ownerName} · {role}{isMe ? ' (you)' : ''}
            </Text>
          </View>
        </View>
      </View>
    );
  }

  const stats = char.base_stats as Dnd5eStats | null;
  const resources = char.resources as Dnd5eResources | null;
  const conditions = char.conditions ?? [];

  const level = stats?.level ?? 1;
  const classLabel = stats?.classKey ? capitalize(stats.classKey) : null;
  const speciesLabel = stats?.speciesKey
    ? stats.speciesKey.split('-').map(capitalize).join(' ')
    : null;
  const hpMax = stats?.hpMax ?? 0;
  const hpCurrent = resources?.hpCurrent ?? hpMax;
  const hpTemp = resources?.hpTemp ?? 0;
  const ac = stats && resources ? computeAc(stats, resources) : null;
  const speed = stats?.speed ?? null;
  const exhaustionLevel = resources?.exhaustionLevel ?? 0;

  const pct = hpMax > 0 ? Math.max(0, Math.min(100, (hpCurrent / hpMax) * 100)) : 0;
  const barColor = hpColor(hpCurrent, hpMax);

  return (
    <View style={s.card}>
      <View style={s.cardHeader}>
        <MaterialCommunityIcons name="account-circle-outline" size={22} color={colors.brand} />
        <View style={{ flex: 1 }}>
          <Text style={s.charName} numberOfLines={1}>{char.name}</Text>
          <Text style={s.subLine} numberOfLines={1}>
            {[speciesLabel, classLabel && `${classLabel} ${level}`].filter(Boolean).join(' · ') || `Level ${level}`}
          </Text>
        </View>
      </View>

      <View style={s.hpRow}>
        <Text style={s.hpNumbers}>
          <Text style={[s.hpCurrent, { color: barColor }]}>{hpCurrent}</Text>
          <Text style={s.hpMax}> / {hpMax}</Text>
          {hpTemp > 0 ? <Text style={s.hpTemp}>  (+{hpTemp} temp)</Text> : null}
        </Text>
        <Text style={s.hpLabel}>HP</Text>
      </View>
      <View style={s.hpBarTrack}>
        <View style={[s.hpBarFill, { width: `${pct}%`, backgroundColor: barColor }]} />
      </View>

      <View style={s.statsRow}>
        {ac !== null && <StatPill label="AC" value={ac} />}
        {speed !== null && <StatPill label="Speed" value={`${speed}`} />}
        {stats?.hitDie ? <StatPill label="Hit Die" value={`d${stats.hitDie}`} /> : null}
      </View>

      {(conditions.length > 0 || exhaustionLevel > 0) && (
        <View style={s.conditionsRow}>
          {conditions.map((c) => (
            <View key={c} style={s.conditionChip}>
              <Text style={s.conditionChipText}>{c}</Text>
            </View>
          ))}
          {exhaustionLevel > 0 && (
            <View style={[s.conditionChip, s.exhaustionChip]}>
              <Text style={[s.conditionChipText, s.exhaustionChipText]}>
                Exhaustion {exhaustionLevel}
              </Text>
            </View>
          )}
        </View>
      )}

      <Text style={s.ownerLine}>
        {ownerName} · {role}{isMe ? ' (you)' : ''}
      </Text>
    </View>
  );
}

function StatPill({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={s.statPill}>
      <Text style={s.statPillLabel}>{label}</Text>
      <Text style={s.statPillValue}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.background },
  container: { paddingBottom: 48 },
  back: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.sm,
  },
  backText: { color: colors.brand, fontSize: 14 },
  header: {
    paddingHorizontal: spacing.lg, paddingBottom: spacing.md,
  },
  title: { fontSize: 28, fontWeight: '700', color: colors.textPrimary },
  subtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 4 },
  helperText: {
    fontSize: 13, color: colors.textSecondary, paddingHorizontal: spacing.lg,
  },
  list: { paddingHorizontal: spacing.lg, gap: spacing.md },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border, borderWidth: 1, borderRadius: 14,
    padding: spacing.md, gap: 10,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  charName: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  subLine: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },

  hpRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 2 },
  hpNumbers: { fontSize: 16 },
  hpCurrent: { fontSize: 20, fontWeight: '700' },
  hpMax: { fontSize: 14, color: colors.textSecondary },
  hpTemp: { fontSize: 12, color: colors.hpHealthy, fontWeight: '600' },
  hpLabel: {
    fontSize: 10, color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 1,
  },
  hpBarTrack: {
    height: 6, borderRadius: 3, backgroundColor: colors.background, overflow: 'hidden',
  },
  hpBarFill: { height: '100%', borderRadius: 3 },

  statsRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  statPill: {
    flexDirection: 'row', alignItems: 'baseline', gap: 6,
    backgroundColor: colors.background,
    borderColor: colors.border, borderWidth: 1, borderRadius: 6,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  statPillLabel: {
    fontSize: 10, color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  statPillValue: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },

  conditionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  conditionChip: {
    backgroundColor: colors.hpDanger + '22',
    borderColor: colors.hpDanger, borderWidth: 1, borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  conditionChipText: { fontSize: 11, color: colors.hpDanger, fontWeight: '700' },
  exhaustionChip: {
    backgroundColor: colors.hpWarning + '22', borderColor: colors.hpWarning,
  },
  exhaustionChipText: { color: colors.hpWarning },

  ownerLine: { fontSize: 12, color: colors.textSecondary, marginTop: 4 },

  emptyCard: {
    marginHorizontal: spacing.lg, padding: spacing.lg,
    backgroundColor: colors.surface,
    borderColor: colors.border, borderWidth: 1, borderRadius: 14,
    alignItems: 'center', gap: spacing.sm,
  },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  emptyBody: {
    fontSize: 13, color: colors.textSecondary, textAlign: 'center', lineHeight: 18,
  },
  emptyAction: {
    marginTop: spacing.sm,
    borderColor: colors.border, borderWidth: 1, borderRadius: 8,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
  },
  emptyActionText: { color: colors.brand, fontSize: 13, fontWeight: '600' },
});
