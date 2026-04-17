import { useEffect, useState } from 'react';
import { View, Text, Image, FlatList, TouchableOpacity, ActivityIndicator, StyleSheet, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getCampaigns, getMemberCountsForCampaigns } from '@vaultstone/api';
import { useAuthStore, useCampaignStore } from '@vaultstone/store';
import { colors, spacing } from '@vaultstone/ui';
import type { Database } from '@vaultstone/types';

type Campaign = Database['public']['Tables']['campaigns']['Row'];

export default function CampaignsScreen() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const { campaigns, setCampaigns } = useCampaignStore();
  const [memberCounts, setMemberCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { width } = useWindowDimensions();

  const numColumns = width > 900 ? 3 : width > 560 ? 2 : 1;

  useEffect(() => {
    if (!user) return;
    getCampaigns().then(async ({ data, error: err }) => {
      if (err) {
        setError('Failed to load campaigns.');
        setLoading(false);
        return;
      }
      const list = data ?? [];
      setCampaigns(list);

      const { data: counts } = await getMemberCountsForCampaigns(list.map((c) => c.id));
      setMemberCounts(counts);
      setLoading(false);
    });
  }, [user]);

  function renderItem({ item }: { item: Campaign }) {
    const isDM = item.dm_user_id === user?.id;
    const memberCount = memberCounts[item.id];

    return (
      <TouchableOpacity
        style={[styles.card, { flex: 1 / numColumns }]}
        onPress={() => router.push(`/campaign/${item.id}`)}
      >
        {item.cover_image_url ? (
          <Image source={{ uri: item.cover_image_url }} style={styles.coverImage} />
        ) : (
          <View style={styles.coverPlaceholder}>
            <MaterialCommunityIcons name="map-outline" size={36} color={colors.border} />
          </View>
        )}
        <View style={styles.cardBody}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
            <View style={[styles.roleBadge, isDM && styles.roleBadgeDM]}>
              <Text style={[styles.roleText, isDM && styles.roleTextDM]}>
                {isDM ? 'DM' : 'Player'}
              </Text>
            </View>
          </View>
          {item.system_label ? (
            <Text style={styles.systemLabel}>{item.system_label}</Text>
          ) : null}
          <View style={styles.stats}>
            <View style={styles.stat}>
              <MaterialCommunityIcons name="account-group-outline" size={15} color={colors.textSecondary} />
              <Text style={styles.statText}>
                {memberCount !== undefined ? `${memberCount}` : '...'}
              </Text>
            </View>
            {isDM && (
              <View style={styles.stat}>
                <MaterialCommunityIcons name="key-outline" size={15} color={colors.textSecondary} />
                <Text style={styles.statText}>{item.join_code}</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Campaigns</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={() => router.push('/campaign/join')} style={styles.headerBtn}>
            <Text style={styles.joinButton}>Join</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/campaign/new')} style={styles.headerBtn}>
            <Text style={styles.createButton}>+ New</Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading && <ActivityIndicator color={colors.brand} style={styles.loader} />}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {!loading && campaigns.length === 0 && !error && (
        <Text style={styles.empty}>
          No campaigns yet.{'\n'}Create one as a DM, or join with a code.
        </Text>
      )}

      <FlatList
        key={numColumns}
        data={campaigns}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        numColumns={numColumns}
        columnWrapperStyle={numColumns > 1 ? styles.row : undefined}
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 16,
  },
  headerBtn: {},
  joinButton: {
    fontSize: 16,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  createButton: {
    fontSize: 16,
    color: colors.brand,
    fontWeight: '600',
  },
  loader: { marginTop: 40 },
  error: {
    color: colors.hpDanger,
    textAlign: 'center',
    marginTop: 16,
  },
  empty: {
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 40,
    fontSize: 15,
    lineHeight: 22,
  },
  list: {
    gap: spacing.md,
    paddingBottom: spacing.xl,
  },
  row: {
    gap: spacing.md,
  },
  // Card
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },
  coverImage: {
    width: '100%',
    aspectRatio: 16 / 9,
  },
  coverPlaceholder: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: {
    padding: spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  cardName: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.textPrimary,
    flex: 1,
    marginRight: spacing.sm,
  },
  roleBadge: {
    backgroundColor: colors.background,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  roleBadgeDM: {
    backgroundColor: colors.brand + '22',
  },
  roleText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  roleTextDM: {
    color: colors.brand,
  },
  systemLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  stats: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
});
