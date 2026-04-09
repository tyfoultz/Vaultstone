import { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { getMyCharacters } from '@vaultstone/api';
import { useAuthStore, useCharacterStore } from '@vaultstone/store';
import { colors } from '@vaultstone/ui';
import type { Database } from '@vaultstone/types';

type Character = Database['public']['Tables']['characters']['Row'];

export default function CharactersScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const { characters, setCharacters } = useCharacterStore();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) return;
    getMyCharacters().then(({ data, error: err }) => {
      if (err) {
        setError('Failed to load characters.');
      } else {
        setCharacters(data ?? []);
      }
      setLoading(false);
    });
  }, [user]);

  function getCharacterSubtitle(character: Character): string {
    const stats = character.base_stats as Record<string, unknown> | null;
    if (!stats) return character.system;
    const parts: string[] = [];
    if (typeof stats.classKey === 'string') parts.push(capitalize(stats.classKey));
    if (typeof stats.level === 'number') parts.push(`Level ${stats.level}`);
    if (typeof stats.speciesKey === 'string') parts.push(capitalize(stats.speciesKey));
    return parts.join(' · ') || character.system;
  }

  function renderItem({ item }: { item: Character }) {
    return (
      <TouchableOpacity
        style={styles.item}
        onPress={() => router.push(`/character/${item.id}`)}
      >
        <Text style={styles.itemName}>{item.name}</Text>
        <Text style={styles.itemMeta}>{getCharacterSubtitle(item)}</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Characters</Text>
        <TouchableOpacity onPress={() => router.push('/character/new')}>
          <Text style={styles.newButton}>+ New</Text>
        </TouchableOpacity>
      </View>

      {loading && <ActivityIndicator color={colors.brand} style={styles.loader} />}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {!loading && characters.length === 0 && !error && (
        <View style={styles.emptyState}>
          <Text style={styles.empty}>No characters yet.</Text>
          <TouchableOpacity style={styles.emptyBtn} onPress={() => router.push('/character/new')}>
            <Text style={styles.emptyBtnText}>Create your first character</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={characters}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
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
  newButton: {
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
  emptyState: { alignItems: 'center', marginTop: 60 },
  empty: {
    color: colors.textSecondary,
    fontSize: 15,
    marginBottom: 20,
  },
  emptyBtn: {
    backgroundColor: colors.brand,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  emptyBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  list: { gap: 12 },
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
  itemMeta: {
    fontSize: 13,
    color: colors.textSecondary,
  },
});
