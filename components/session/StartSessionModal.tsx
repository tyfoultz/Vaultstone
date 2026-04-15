import { useEffect, useState } from 'react';
import {
  View, Text, Modal, TouchableOpacity, StyleSheet, Pressable, ScrollView,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, spacing } from '@vaultstone/ui';

export interface StartSessionPlayer {
  userId: string;
  displayName: string;
  characterName: string | null;
}

interface Props {
  visible: boolean;
  players: StartSessionPlayer[];
  starting: boolean;
  onClose: () => void;
  onConfirm: (userIds: string[]) => void;
}

export function StartSessionModal({ visible, players, starting, onClose, onConfirm }: Props) {
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (visible) {
      const initial: Record<string, boolean> = {};
      for (const p of players) initial[p.userId] = true;
      setSelected(initial);
    }
  }, [visible, players]);

  function toggle(userId: string) {
    setSelected((prev) => ({ ...prev, [userId]: !prev[userId] }));
  }

  function handleStart() {
    const picked = players.filter((p) => selected[p.userId]).map((p) => p.userId);
    onConfirm(picked);
  }

  const pickedCount = players.filter((p) => selected[p.userId]).length;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.header}>
            <Text style={styles.title}>Start Session</Text>
            <TouchableOpacity onPress={onClose}>
              <MaterialCommunityIcons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <Text style={styles.subtitle}>
            Pick who's playing tonight. Unselected players won't see the live
            session but can read the recap later.
          </Text>

          <ScrollView style={styles.list} contentContainerStyle={{ paddingVertical: 4 }}>
            {players.length === 0 ? (
              <Text style={styles.empty}>No players in this campaign yet.</Text>
            ) : (
              players.map((p) => {
                const on = !!selected[p.userId];
                return (
                  <TouchableOpacity
                    key={p.userId}
                    style={styles.row}
                    onPress={() => toggle(p.userId)}
                    activeOpacity={0.7}
                  >
                    <MaterialCommunityIcons
                      name={on ? 'checkbox-marked' : 'checkbox-blank-outline'}
                      size={22}
                      color={on ? colors.brand : colors.textSecondary}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowName}>{p.displayName}</Text>
                      {p.characterName && (
                        <Text style={styles.rowSub}>{p.characterName}</Text>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>

          <TouchableOpacity
            style={[styles.startBtn, starting && styles.btnDisabled]}
            onPress={handleStart}
            disabled={starting}
          >
            <MaterialCommunityIcons name="play" size={16} color="#fff" />
            <Text style={styles.startBtnText}>
              {starting ? 'Starting…' : `Start Session (${pickedCount})`}
            </Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center', alignItems: 'center', padding: spacing.lg,
  },
  sheet: {
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    borderRadius: 16, padding: spacing.lg, width: '100%', maxWidth: 460,
  },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: spacing.sm,
  },
  title: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  subtitle: {
    fontSize: 13, color: colors.textSecondary, lineHeight: 18,
    marginBottom: spacing.md,
  },
  list: { maxHeight: 320, marginBottom: spacing.md },
  empty: { fontSize: 13, color: colors.textSecondary, padding: spacing.md },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: 10, borderBottomColor: colors.border, borderBottomWidth: 1,
  },
  rowName: { fontSize: 14, color: colors.textPrimary, fontWeight: '600' },
  rowSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  startBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: colors.brand, borderRadius: 10, paddingVertical: 12,
  },
  startBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  btnDisabled: { opacity: 0.5 },
});
