import { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Pressable,
} from 'react-native';
import { colors } from '@vaultstone/ui';
import type { Dnd5eResources } from '@vaultstone/types';

interface Props {
  visible: boolean;
  resources: Dnd5eResources;
  hpMax: number;
  onClose: () => void;
  onApply: (updated: Dnd5eResources) => void;
}

export function HpModal({ visible, resources, hpMax, onClose, onApply }: Props) {
  const [amount, setAmount] = useState('');

  useEffect(() => {
    if (visible) setAmount(String(resources.hpCurrent));
  }, [visible, resources.hpCurrent]);

  function handleApply() {
    const n = parseInt(amount, 10);
    if (isNaN(n) || n < 0) return;
    const newCurrent = Math.max(0, Math.min(hpMax, n));
    onApply({ ...resources, hpCurrent: newCurrent });
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet}>
          <Text style={styles.title}>Set Hit Points</Text>

          <View style={styles.hpDisplay}>
            <Text style={styles.hpCurrent}>{resources.hpCurrent}</Text>
            <Text style={styles.hpSep}>/</Text>
            <Text style={styles.hpMax}>{hpMax}</Text>
            {resources.hpTemp > 0 && (
              <Text style={styles.hpTemp}> +{resources.hpTemp} temp</Text>
            )}
          </View>

          <TextInput
            style={styles.amountInput}
            keyboardType="number-pad"
            placeholder="Set current HP to…"
            placeholderTextColor={colors.textSecondary}
            value={amount}
            onChangeText={setAmount}
            autoFocus
            selectTextOnFocus
          />

          <TouchableOpacity
            style={[styles.applyBtn, !amount && styles.applyBtnDisabled, { backgroundColor: colors.brand }]}
            onPress={handleApply}
            disabled={!amount}
          >
            <Text style={styles.applyBtnText}>Apply</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={onClose} style={styles.cancelBtn}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 24,
    width: 320,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 12,
  },
  hpDisplay: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    marginBottom: 20,
  },
  hpCurrent: { fontSize: 36, fontWeight: '700', color: colors.textPrimary },
  hpSep: { fontSize: 22, color: colors.textSecondary, marginHorizontal: 6 },
  hpMax: { fontSize: 22, color: colors.textSecondary },
  hpTemp: { fontSize: 14, color: colors.hpWarning, marginLeft: 6 },
  modeTabs: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  modeTab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  modeTabText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  healTargetRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
    backgroundColor: colors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 3,
  },
  healTargetBtn: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 6,
    alignItems: 'center',
  },
  healTargetBtnActive: {
    backgroundColor: colors.hpHealthy + '33',
  },
  healTargetText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  healTargetTextActive: {
    color: colors.hpHealthy,
  },
  amountInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
    backgroundColor: colors.background,
    textAlign: 'center',
    marginBottom: 16,
  },
  applyBtn: {
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 8,
  },
  applyBtnDisabled: { opacity: 0.4 },
  applyBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  cancelBtn: { alignItems: 'center', paddingVertical: 8 },
  cancelText: { fontSize: 14, color: colors.textSecondary },
});
