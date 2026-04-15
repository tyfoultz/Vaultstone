import { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, FlatList,
  ActivityIndicator, StyleSheet,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getMyCharacters, assignCharacterToCampaign, supabase } from '@vaultstone/api';
import { useAuthStore } from '@vaultstone/store';
import { colors, spacing } from '@vaultstone/ui';
import type { Database } from '@vaultstone/types';

type Character = Database['public']['Tables']['characters']['Row'];

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function getSubtitle(character: Character): string {
  const stats = character.base_stats as Record<string, unknown> | null;
  if (!stats) return character.system;
  const parts: string[] = [];
  if (typeof stats.speciesKey === 'string') parts.push(capitalize(stats.speciesKey));
  if (typeof stats.classKey === 'string') parts.push(capitalize(stats.classKey));
  if (typeof stats.level === 'number') parts.push(`Lvl ${stats.level}`);
  return parts.join(' · ') || character.system;
}

export default function PickCharacterScreen() {
  const { id: campaignId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [assignedElsewhere, setAssignedElsewhere] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      getMyCharacters(),
      supabase
        .from('campaign_members')
        .select('campaign_id, character_id')
        .eq('user_id', user.id)
        .not('character_id', 'is', null),
    ]).then(([chars, memberships]) => {
      setCharacters(chars.data ?? []);
      const elsewhere = new Set<string>();
      for (const row of memberships.data ?? []) {
        if (row.character_id && row.campaign_id !== campaignId) {
          elsewhere.add(row.character_id);
        }
      }
      setAssignedElsewhere(elsewhere);
      setLoading(false);
    });
  }, [user, campaignId]);

  async function handlePick(characterId: string) {
    if (!user) return;
    setAssigning(true);
    await assignCharacterToCampaign(campaignId, user.id, characterId);
    setAssigning(false);
    router.replace(`/campaign/${campaignId}`);
  }

  function handleSkip() {
    router.replace(`/campaign/${campaignId}`);
  }

  function handleCreateNew() {
    router.push('/character/new');
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Choose Your Character</Text>
      <Text style={styles.subtitle}>
        Pick a character to play in this campaign, or create a new one.
      </Text>

      {loading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
      ) : (
        <>
          <FlatList
            data={characters}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => {
              const alreadyAssigned = assignedElsewhere.has(item.id);
              return (
                <TouchableOpacity
                  style={[styles.card, alreadyAssigned && styles.cardDim]}
                  onPress={() => handlePick(item.id)}
                  disabled={assigning || !!alreadyAssigned}
                >
                  <View style={styles.cardIcon}>
                    <MaterialCommunityIcons name="account-outline" size={28} color={colors.brand} />
                  </View>
                  <View style={styles.cardBody}>
                    <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.cardMeta}>{getSubtitle(item)}</Text>
                    {alreadyAssigned && (
                      <Text style={styles.cardAssigned}>Already in another campaign</Text>
                    )}
                  </View>
                  {!alreadyAssigned && (
                    <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textSecondary} />
                  )}
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <Text style={styles.emptyText}>
                You don't have any characters yet.
              </Text>
            }
          />

          <View style={styles.actions}>
            <TouchableOpacity style={styles.createBtn} onPress={handleCreateNew}>
              <MaterialCommunityIcons name="plus" size={18} color="#fff" />
              <Text style={styles.createBtnText}>Create New Character</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={handleSkip}>
              <Text style={styles.skipText}>Skip for now</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: 60,
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    lineHeight: 22,
    marginBottom: 24,
  },
  list: {
    gap: 10,
    paddingBottom: spacing.md,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: spacing.md,
    gap: spacing.md,
  },
  cardDim: {
    opacity: 0.4,
  },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: {
    flex: 1,
  },
  cardName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  cardMeta: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  cardAssigned: {
    fontSize: 11,
    color: colors.hpWarning,
    marginTop: 2,
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: 15,
    textAlign: 'center',
    marginTop: 40,
  },
  actions: {
    gap: spacing.md,
    paddingVertical: spacing.lg,
  },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.brand,
    borderRadius: 10,
    paddingVertical: 14,
  },
  createBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  skipText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
