import { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, StyleSheet, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getMyCharacters, supabase } from '@vaultstone/api';
import { useAuthStore, useCharacterStore } from '@vaultstone/store';
import { colors, spacing } from '@vaultstone/ui';
import type { Database } from '@vaultstone/types';

type Character = Database['public']['Tables']['characters']['Row'];
type ListItem = Character | { id: '__new__' };

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function getStats(character: Character) {
  const stats = character.base_stats as Record<string, unknown> | null;
  if (!stats) return { classKey: null, level: null, speciesKey: null };
  return {
    classKey: typeof stats.classKey === 'string' ? capitalize(stats.classKey) : null,
    level: typeof stats.level === 'number' ? stats.level : null,
    speciesKey: typeof stats.speciesKey === 'string' ? capitalize(stats.speciesKey) : null,
  };
}

export default function CharactersScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const { characters, setCharacters } = useCharacterStore();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [campaignMap, setCampaignMap] = useState<Record<string, string>>({});
  const { width } = useWindowDimensions();

  const numColumns = width > 900 ? 3 : width > 560 ? 2 : 1;

  useEffect(() => {
    if (!user) return;
    Promise.all([
      getMyCharacters(),
      supabase
        .from('campaign_members')
        .select('character_id, campaigns(name)')
        .eq('user_id', user.id)
        .not('character_id', 'is', null),
    ]).then(([chars, memberships]) => {
      if (chars.error) {
        setError('Failed to load characters.');
      } else {
        setCharacters(chars.data ?? []);
      }
      const map: Record<string, string> = {};
      type MembershipRow = { character_id: string | null; campaigns: { name: string } | null };
      for (const row of (memberships.data ?? []) as unknown as MembershipRow[]) {
        if (row.character_id && row.campaigns?.name) {
          map[row.character_id] = row.campaigns.name;
        }
      }
      setCampaignMap(map);
      setLoading(false);
    });
  }, [user]);

  function renderItem({ item }: { item: ListItem }) {
    if (item.id === '__new__') {
      return (
        <TouchableOpacity
          style={[styles.card, styles.newCard, { flex: 1 / numColumns }]}
          onPress={() => router.push('/character/new')}
          activeOpacity={0.75}
        >
          <View style={styles.avatarArea}>
            <MaterialCommunityIcons name="plus-circle-outline" size={36} color={colors.brand} />
          </View>
          <View style={styles.cardBody}>
            <Text style={styles.newCardText}>New Character</Text>
            <Text style={styles.subtitle}>Start building</Text>
          </View>
        </TouchableOpacity>
      );
    }

    const char = item as Character;
    const { classKey, level, speciesKey } = getStats(char);
    const campaignName = campaignMap[char.id];

    return (
      <TouchableOpacity
        style={[styles.card, { flex: 1 / numColumns }]}
        onPress={() => router.push(`/character/${char.id}`)}
      >
        {/* Avatar placeholder */}
        <View style={styles.avatarArea}>
          <MaterialCommunityIcons name="account-outline" size={48} color={colors.border} />
        </View>

        <View style={styles.cardBody}>
          <Text style={styles.cardName} numberOfLines={1}>{char.name}</Text>

          {(classKey || speciesKey) && (
            <Text style={styles.subtitle} numberOfLines={1}>
              {[speciesKey, classKey].filter(Boolean).join(' ')}
            </Text>
          )}

          <View style={styles.detailRow}>
            {level !== null && (
              <View style={styles.levelBadge}>
                <Text style={styles.levelText}>Lvl {level}</Text>
              </View>
            )}
            <Text style={styles.systemText}>{char.system}</Text>
          </View>

          <View style={styles.campaignRow}>
            <MaterialCommunityIcons
              name={campaignName ? 'map-marker-outline' : 'map-marker-off-outline'}
              size={13}
              color={campaignName ? colors.brand : colors.textSecondary}
            />
            <Text
              style={[styles.campaignText, !campaignName && styles.campaignTextMuted]}
              numberOfLines={1}
            >
              {campaignName ? `In: ${campaignName}` : 'Unassigned'}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Characters</Text>
      </View>

      {loading && <ActivityIndicator color={colors.brand} style={styles.loader} />}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <FlatList
        key={numColumns}
        data={[{ id: '__new__' } as ListItem, ...characters]}
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
  loader: { marginTop: 40 },
  error: {
    color: colors.hpDanger,
    textAlign: 'center',
    marginTop: 16,
  },
  list: {
    gap: spacing.md,
    paddingBottom: spacing.xl,
  },
  row: {
    gap: spacing.md,
  },
  newCard: {
    borderStyle: 'dashed' as any,
    borderColor: colors.brand + '66',
    backgroundColor: colors.brand + '0d',
  },
  newCardText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.brand,
  },
  // Card
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },
  avatarArea: {
    width: '100%',
    aspectRatio: 2 / 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: {
    padding: spacing.md,
  },
  cardName: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  levelBadge: {
    backgroundColor: colors.brand + '22',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  levelText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.brand,
  },
  systemText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  campaignRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopColor: colors.border,
    borderTopWidth: 1,
  },
  campaignText: {
    fontSize: 12,
    color: colors.textPrimary,
    flex: 1,
  },
  campaignTextMuted: {
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
});
