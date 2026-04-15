import { useEffect, useState } from 'react';
import {
  View, Text, Modal, TouchableOpacity, TextInput, StyleSheet, Pressable,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, spacing } from '@vaultstone/ui';

interface Props {
  visible: boolean;
  ending: boolean;
  onClose: () => void;
  onConfirm: (summary: string) => void;
}

export function EndSessionModal({ visible, ending, onClose, onConfirm }: Props) {
  const [summary, setSummary] = useState('');

  useEffect(() => {
    if (visible) setSummary('');
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.header}>
            <Text style={styles.title}>End Session</Text>
            <TouchableOpacity onPress={onClose}>
              <MaterialCommunityIcons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <Text style={styles.subtitle}>
            Optional: write a short recap. Shown to everyone in Session History.
          </Text>

          <TextInput
            style={styles.input}
            value={summary}
            onChangeText={setSummary}
            placeholder="Tonight, the party…"
            placeholderTextColor={colors.textSecondary}
            multiline
            numberOfLines={5}
            textAlignVertical="top"
          />

          <TouchableOpacity
            style={[styles.endBtn, ending && styles.btnDisabled]}
            onPress={() => onConfirm(summary)}
            disabled={ending}
          >
            <MaterialCommunityIcons name="stop-circle-outline" size={16} color="#fff" />
            <Text style={styles.endBtnText}>
              {ending ? 'Ending…' : 'End Session'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
            <Text style={styles.cancelText}>Cancel</Text>
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
  input: {
    backgroundColor: colors.background, borderColor: colors.border,
    borderWidth: 1, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    color: colors.textPrimary, fontSize: 14,
    minHeight: 110, marginBottom: spacing.md,
  },
  endBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: colors.hpDanger, borderRadius: 10, paddingVertical: 12,
  },
  endBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  btnDisabled: { opacity: 0.5 },
  cancelBtn: { alignItems: 'center', paddingVertical: spacing.sm, marginTop: 4 },
  cancelText: { fontSize: 13, color: colors.textSecondary },
});
