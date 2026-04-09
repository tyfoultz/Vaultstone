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

type Mode = 'damage' | 'heal' | 'set';

interface Props {
  visible: boolean;
  resources: Dnd5eResources;
  hpMax: number;
  onClose: () => void;
  onApply: (updated: Dnd5eResources) => void;
}

export function HpModal({ visible, resources, hpMax, onClose, onApply }: Props) {
  const [mode, setMode] = useState<Mode>('damage');
  const [amount, setAmount] = useState('');
  const [tempHpInput, setTempHpInput] = useState('');

  useEffect(() => {
    if (visible) {
      setAmount('');
      setTempHpInput(resources.hpTemp > 0 ? resources.hpTemp.toString() : '');
    }
  }, [visible]);

  function handleApply() {
    const n = parseInt(amount, 10);
    if (isNaN(n) || n < 0) return;

    const newTemp = parseInt(tempHpInput, 10) || 0;
    let newCurrent = resources.hpCurrent;

    if (mode === 'damage') {
      const tempAbsorb = Math.min(resources.hpTemp, n);
      const remaining = n - tempAbsorb;
      newCurrent = Math.max(0, resources.hpCurrent - remaining);
    } else if (mode === 'heal') {
      newCurrent = Math.min(hpMax, resources.hpCurrent + n);
    } else {
      newCurrent = Math.max(0, Math.min(hpMax, n));
    }

    onApply({ ...resources, hpCurrent: newCurrent, hpTemp: newTemp });
    onClose();
  }

  const modeColor: Record<Mode, string> = {
    damage: colors.hpDanger,
    heal: colors.hpHealthy,
    set: colors.brand,
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet}>
          <Text style={styles.title}>Hit Points</Text>

          <View style={styles.hpDisplay}>
            <Text style={styles.hpCurrent}>{resources.hpCurrent}</Text>
            <Text style={styles.hpSep}>/</Text>
            <Text style={styles.hpMax}>{hpMax}</Text>
            {resources.hpTemp > 0 && (
              <Text style={styles.hpTemp}> +{resources.hpTemp} temp</Text>
            )}
          </View>

          <View style={styles.modeTabs}>
            {(['damage', 'heal', 'set'] as Mode[]).map((m) => (
              <TouchableOpacity
                key={m}
                style={[
                  styles.modeTab,
                  mode === m && { borderColor: modeColor[m], backgroundColor: modeColor[m] + '22' },
                ]}
                onPress={() => setMode(m)}
              >
                <Text
                  style={[
                    styles.modeTabText,
                    mode === m && { color: modeColor[m] },
                  ]}
                >
                  {m.charAt(0).toUpperCase() + m.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TextInput
            style={styles.amountInput}
            keyboardType="number-pad"
            placeholder={mode === 'set' ? 'Set current HP to…' : 'Amount…'}
            placeholderTextColor={colors.textSecondary}
            value={amount}
            onChangeText={setAmount}
            autoFocus
          />

          <View style={styles.tempRow}>
            <Text style={styles.tempLabel}>Temp HP</Text>
            <TextInput
              style={styles.tempInput}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor={colors.textSecondary}
              value={tempHpInput}
              onChangeText={setTempHpInput}
            />
          </View>

          <TouchableOpacity
            style={[styles.applyBtn, !amount && styles.applyBtnDisabled, { backgroundColor: modeColor[mode] }]}
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
  modeTabs: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  modeTab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  modeTabText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
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
    marginBottom: 12,
  },
  tempRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  tempLabel: { fontSize: 14, color: colors.textSecondary },
  tempInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    backgroundColor: colors.background,
    width: 72,
    textAlign: 'center',
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
