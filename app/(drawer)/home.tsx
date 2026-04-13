import { useEffect, useState } from 'react';
import {
  View, Text, Image, TouchableOpacity, ScrollView,
  ActivityIndicator, StyleSheet, useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getCampaigns, getCampaignMembers, getMyCharacters } from '@vaultstone/api';
import { useAuthStore, useCampaignStore, useCharacterStore } from '@vaultstone/store';
import { colors, spacing, fonts } from '@vaultstone/ui';
import type { Database } from '@vaultstone/types';

type Campaign = Database['public']['Tables']['campaigns']['Row'];
type Character = Database['public']['Tables']['characters']['Row'];

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function HomeScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const { campaigns, setCampaigns } = useCampaignStore();
  const { characters, setCharacters } = useCharacterStore();
  const [memberCounts, setMemberCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const { width } = useWindowDimensions();

  const cardWidth = Math.min(360, width * 0.8);
  const charCardWidth = Math.min(220, width * 0.55);

  useEffect(() => {
    if (!user) return;

    let done = 0;
    const check = () => { done++; if (done >= 2) setLoading(false); };

    // Campaigns
    getCampaigns().then(async ({ data }) => {
      const active = (data ?? []).filter((c) => !c.is_archived);
      setCampaigns(active);
      const counts: Record<string, number> = {};
      await Promise.all(
        active.map(async (c) => {
          const { data: members } = await getCampaignMembers(c.id);
          counts[c.id] = members?.length ?? 0;
        }),
      );
      setMemberCounts(counts);
      check();
    });

    // Characters
    getMyCharacters().then(({ data }) => {
      setCharacters(data ?? []);
      check();
    });
  }, [user]);

  function getCharStats(character: Character) {
    const stats = character.base_stats as Record<string, unknown> | null;
    if (!stats) return { subtitle: character.system, level: null };
    const parts: string[] = [];
    if (typeof stats.speciesKey === 'string') parts.push(capitalize(stats.speciesKey));
    if (typeof stats.classKey === 'string') parts.push(capitalize(stats.classKey));
    const level = typeof stats.level === 'number' ? stats.level : null;
    return { subtitle: parts.join(' ') || character.system, level };
  }

  function renderCampaignCard(campaign: Campaign) {
    const isDM = campaign.dm_user_id === user?.id;
    const memberCount = memberCounts[campaign.id];

    return (
      <TouchableOpacity
        key={campaign.id}
        style={[s.campaignCard, { width: cardWidth }]}
        onPress={() => router.push(`/campaign/${campaign.id}`)}
      >
        {campaign.cover_image_url ? (
          <Image source={{ uri: campaign.cover_image_url }} style={s.coverImage} />
        ) : (
          <View style={s.coverPlaceholder}>
            <MaterialCommunityIcons name="map-outline" size={40} color={colors.border} />
          </View>
        )}
        <View style={s.cardBody}>
          <View style={s.campaignCardHeader}>
            <Text style={s.campaignName} numberOfLines={1}>{campaign.name}</Text>
            <View style={[s.roleBadge, isDM && s.roleBadgeDM]}>
              <Text style={[s.roleText, isDM && s.roleTextDM]}>
                {isDM ? 'DM' : 'Player'}
              </Text>
            </View>
          </View>
          {campaign.system_label ? (
            <Text style={s.systemLabel}>{campaign.system_label}</Text>
          ) : null}
          <View style={s.campaignStats}>
            <View style={s.stat}>
              <MaterialCommunityIcons name="account-group-outline" size={16} color={colors.textSecondary} />
              <Text style={s.statText}>
                {memberCount !== undefined ? `${memberCount} members` : '...'}
              </Text>
            </View>
            {isDM && (
              <View style={s.stat}>
                <MaterialCommunityIcons name="key-outline" size={16} color={colors.textSecondary} />
                <Text style={s.statText}>{campaign.join_code}</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  function renderCharacterCard(character: Character) {
    const { subtitle, level } = getCharStats(character);
    return (
      <TouchableOpacity
        key={character.id}
        style={[s.charCard, { width: charCardWidth }]}
        onPress={() => router.push(`/character/${character.id}`)}
      >
        <View style={s.charAvatar}>
          <MaterialCommunityIcons name="account-outline" size={32} color={colors.brand} />
        </View>
        <Text style={s.charName} numberOfLines={1}>{character.name}</Text>
        <Text style={s.charSubtitle} numberOfLines={1}>{subtitle}</Text>
        {level !== null && (
          <View style={s.charLevel}>
            <Text style={s.charLevelText}>Lvl {level}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  }

  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.container}>
      <View style={s.titleCard}>
        <MaterialCommunityIcons name="shield-crown-outline" size={48} color={colors.brand} />
        <Text style={s.appName}>Vaultstone</Text>
        <Text style={s.tagline}>Your adventure awaits</Text>
      </View>

      {/* Campaigns section */}
      <View style={s.section}>
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>Active Campaigns</Text>
          <TouchableOpacity onPress={() => router.push('/(drawer)/campaigns')}>
            <Text style={s.seeAll}>See all</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.brand} style={{ marginTop: spacing.lg }} />
        ) : campaigns.length === 0 ? (
          <View style={s.emptyState}>
            <Text style={s.emptyText}>No active campaigns</Text>
            <TouchableOpacity style={s.emptyBtn} onPress={() => router.push('/campaign/new')}>
              <Text style={s.emptyBtnText}>Create one</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.carousel}
          >
            {campaigns.map(renderCampaignCard)}
          </ScrollView>
        )}
      </View>

      {/* Characters section */}
      <View style={s.section}>
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>Your Characters</Text>
          <TouchableOpacity onPress={() => router.push('/(drawer)/characters')}>
            <Text style={s.seeAll}>See all</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.brand} style={{ marginTop: spacing.lg }} />
        ) : characters.length === 0 ? (
          <View style={s.emptyState}>
            <Text style={s.emptyText}>No characters yet</Text>
            <TouchableOpacity style={s.emptyBtn} onPress={() => router.push('/character/new')}>
              <Text style={s.emptyBtnText}>Create one</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.carousel}
          >
            {characters.map(renderCharacterCard)}
          </ScrollView>
        )}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, paddingBottom: 48 },
  titleCard: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    marginBottom: spacing.lg,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
  },
  appName: {
    fontSize: 32, fontFamily: fonts.display, color: colors.textPrimary,
    marginTop: spacing.sm, letterSpacing: 2,
  },
  tagline: { fontSize: 14, fontFamily: fonts.body, color: colors.textSecondary, marginTop: spacing.xs },

  // Sections
  section: { marginTop: spacing.lg },
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: spacing.md,
  },
  sectionTitle: { fontSize: 18, fontFamily: fonts.bodySemiBold, color: colors.textPrimary },
  seeAll: { fontSize: 14, color: colors.brand, fontWeight: '600' },
  carousel: { gap: spacing.md, paddingRight: spacing.md },

  // Campaign cards
  campaignCard: {
    backgroundColor: colors.surface, borderColor: colors.border,
    borderWidth: 1, borderRadius: 14, overflow: 'hidden',
  },
  coverImage: { width: '100%', aspectRatio: 16 / 9 },
  coverPlaceholder: {
    width: '100%', aspectRatio: 16 / 9,
    backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center',
  },
  cardBody: { padding: spacing.md },
  campaignCardHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: spacing.xs,
  },
  campaignName: {
    fontSize: 18, fontWeight: '700', color: colors.textPrimary,
    flex: 1, marginRight: spacing.sm,
  },
  roleBadge: { backgroundColor: colors.background, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  roleBadgeDM: { backgroundColor: colors.brand + '22' },
  roleText: { fontSize: 11, fontWeight: '700', color: colors.textSecondary },
  roleTextDM: { color: colors.brand },
  systemLabel: { fontSize: 13, color: colors.textSecondary, marginBottom: spacing.xs },
  campaignStats: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statText: { fontSize: 13, color: colors.textSecondary },

  // Character cards
  charCard: {
    backgroundColor: colors.surface, borderColor: colors.border,
    borderWidth: 1, borderRadius: 14, padding: spacing.md,
    alignItems: 'center',
  },
  charAvatar: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: colors.background, alignItems: 'center',
    justifyContent: 'center', marginBottom: spacing.sm,
  },
  charName: {
    fontSize: 15, fontWeight: '700', color: colors.textPrimary,
    textAlign: 'center', marginBottom: 2,
  },
  charSubtitle: {
    fontSize: 12, color: colors.textSecondary, textAlign: 'center',
    marginBottom: spacing.sm,
  },
  charLevel: {
    backgroundColor: colors.brand + '22', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  charLevelText: { fontSize: 11, fontWeight: '700', color: colors.brand },

  // Empty states
  emptyState: { alignItems: 'center', paddingVertical: spacing.xl },
  emptyText: { color: colors.textSecondary, fontSize: 14, marginBottom: spacing.md },
  emptyBtn: { backgroundColor: colors.brand, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 20 },
  emptyBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
