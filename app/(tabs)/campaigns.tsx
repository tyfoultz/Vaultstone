import { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { getCampaigns } from '@vaultstone/api';
import { useAuthStore, useCampaignStore } from '@vaultstone/store';
import { colors } from '@vaultstone/ui';
import type { Database } from '@vaultstone/types';

type Campaign = Database['public']['Tables']['campaigns']['Row'];

export default function CampaignsScreen() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const { campaigns, setCampaigns } = useCampaignStore();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) return;
    getCampaigns(user.id).then(({ data, error: err }) => {
      if (err) {
        setError('Failed to load campaigns.');
      } else {
        setCampaigns(data ?? []);
      }
      setLoading(false);
    });
  }, [user]);

  function renderItem({ item }: { item: Campaign }) {
    return (
      <TouchableOpacity
        style={styles.item}
        onPress={() => router.push(`/campaign/${item.id}`)}
      >
        <Text style={styles.itemName}>{item.name}</Text>
        <Text style={styles.itemCode}>Join code: {item.join_code}</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Campaigns</Text>
        <TouchableOpacity onPress={() => router.push('/campaign/new')}>
          <Text style={styles.createButton}>+ New</Text>
        </TouchableOpacity>
      </View>

      {loading && <ActivityIndicator color={colors.brand} style={styles.loader} />}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {!loading && campaigns.length === 0 && !error && (
        <Text style={styles.empty}>No campaigns yet. Create one to get started.</Text>
      )}

      <FlatList
        data={campaigns}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: 60,
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  createButton: {
    fontSize: 16,
    color: colors.brand,
    fontWeight: '600',
  },
  loader: {
    marginTop: 40,
  },
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
  },
  list: {
    gap: 12,
  },
  item: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: 16,
  },
  itemName: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  itemCode: {
    fontSize: 13,
    color: colors.textSecondary,
  },
});
