import { useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, FlatList, ActivityIndicator, StyleSheet } from 'react-native';
import { getMyCharacters, updateCampaignMember } from '@vaultstone/api';
import { colors } from '@vaultstone/ui';
import type { Database } from '@vaultstone/types';
import type { Dnd5eStats } from '@vaultstone/types';

type Character = Database['public']['Tables']['characters']['Row'];

interface Props {
  visible: boolean;
  campaignId: string;
  userId: string;
  currentCharacterId: string | null;
  onClose: () => void;
  onLinked: (characterId: string | null, character: Character | null) => void;
}

export default function CharacterPickerModal({
  visible,
  campaignId,
  userId,
  currentCharacterId,
  onClose,
  onLinked,
}: Props) {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    getMyCharacters().then(({ data }) => {
      setCharacters(data ?? []);
      setLoading(false);
    });
  }, [visible]);

  async function handleSelect(character: Character | null) {
    setSaving(true);
    const { error } = await updateCampaignMember(campaignId, userId, {
      character_id: character?.id ?? null,
    });
    setSaving(false);
    if (!error) {
      onLinked(character?.id ?? null, character);
      onClose();
    }
  }

  function characterSummary(character: Character): string {
    const stats = character.base_stats as Dnd5eStats | null;
    if (!stats?.classKey) return 'Level 1';
    const cls = stats.classKey.charAt(0).toUpperCase() + stats.classKey.slice(1);
    return `${cls} · Level ${stats.level ?? 1}`;
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Link a Character</Text>
            <TouchableOpacity onPress={onClose} disabled={saving}>
              <Text style={styles.cancel}>Cancel</Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <ActivityIndicator color={colors.brand} style={styles.loader} />
          ) : (
            <FlatList
              data={characters}
              keyExtractor={(c) => c.id}
              ListHeaderComponent={
                <TouchableOpacity
                  style={[styles.row, currentCharacterId === null && styles.rowSelected]}
                  onPress={() => handleSelect(null)}
                  disabled={saving}
                >
                  <View style={styles.rowInner}>
                    <Text style={styles.characterName}>None</Text>
                    <Text style={styles.characterSub}>Remove character link</Text>
                  </View>
                  {currentCharacterId === null && <Text style={styles.check}>✓</Text>}
                </TouchableOpacity>
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.row, currentCharacterId === item.id && styles.rowSelected]}
                  onPress={() => handleSelect(item)}
                  disabled={saving}
                >
                  <View style={styles.rowInner}>
                    <Text style={styles.characterName}>{item.name}</Text>
                    <Text style={styles.characterSub}>{characterSummary(item)}</Text>
                  </View>
                  {currentCharacterId === item.id && <Text style={styles.check}>✓</Text>}
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={styles.empty}>
                  No characters yet. Create one from the Characters tab.
                </Text>
              }
              contentContainerStyle={styles.list}
            />
          )}

          {saving && (
            <View style={styles.savingRow}>
              <ActivityIndicator color={colors.brand} size="small" />
              <Text style={styles.savingText}>Saving…</Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 40,
    maxHeight: '70%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 20,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  cancel: {
    fontSize: 15,
    color: colors.brand,
  },
  loader: {
    marginTop: 32,
  },
  list: {
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
  },
  rowSelected: {
    opacity: 1,
  },
  rowInner: {
    flex: 1,
  },
  characterName: {
    fontSize: 16,
    color: colors.textPrimary,
    marginBottom: 2,
  },
  characterSub: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  check: {
    fontSize: 16,
    color: colors.brand,
    marginLeft: 12,
  },
  empty: {
    fontSize: 14,
    color: colors.textSecondary,
    paddingVertical: 24,
    textAlign: 'center',
  },
  savingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  savingText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
});
