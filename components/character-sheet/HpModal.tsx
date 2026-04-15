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
type HealTarget = 'hp' | 'temp';

interface Props {
  visible: boolean;
  resources: Dnd5eResources;
  hpMax: number;
  onClose: () => void;
  onApply: (updated: Dnd5eResources) => void;
}

export function HpModal({ visible, resources, hpMax, onClose, onApply }: Props) {
  const [mode, setMode] = useState<Mode>('damage');
  const [healTarget, setHealTarget] = useState<HealTarget>('hp');
  const [amount, setAmount] = useState('');

  useEffect(() => {
    if (visible) {
      setAmount('');
      setHealTarget('hp');
    }
  }, [visible]);

  function handleApply() {
    const n = parseInt(amount, 10);
    if (isNaN(n) || n < 0) return;

    let newCurrent = resources.hpCurrent;
    let newTemp = resources.hpTemp;

    if (mode === 'damage') {
      const tempAbsorb = Math.min(resources.hpTemp, n);
      const remaining = n - tempAbsorb;
      newTemp = resources.hpTemp - tempAbsorb;
      newCurrent = Math.max(0, resources.hpCurrent - remaining);
    } else if (mode === 'heal') {
      if (healTarget === 'temp') {
        newTemp = resources.hpTemp + n;
      } else {
        newCurrent = Math.min(hpMax, resources.hpCurrent + n);
      }
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

  const placeholder =
    mode === 'set'
      ? 'Set current HP to…'
      : mode === 'heal' && healTarget === 'temp'
        ? 'Temp HP amount…'
        : 'Amount…';

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

          {mode === 'heal' && (
            <View style={styles.healTargetRow}>
              {(['hp', 'temp'] as HealTarget[]).map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[
                    styles.healTargetBtn,
                    healTarget === t && styles.healTargetBtnActive,
                  ]}
                  onPress={() => setHealTarget(t)}
                >
                  <Text
                    style={[
                      styles.healTargetText,
                      healTarget === t && styles.healTargetTextActive,
                    ]}
                  >
                    {t === 'hp' ? 'Healing' : 'Temp HP'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <TextInput
            style={styles.amountInput}
            keyboardType="number-pad"
            placeholder={placeholder}
            placeholderTextColor={colors.textSecondary}
            value={amount}
            onChangeText={setAmount}
            autoFocus
          />

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
