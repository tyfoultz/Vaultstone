import { useState, useEffect } from 'react';
import {
  View, Modal, TouchableOpacity, TextInput, StyleSheet, Pressable,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, spacing, Text, HpBar } from '@vaultstone/ui';

type HpMode = 'damage' | 'heal' | 'temp' | 'set-max';

interface Props {
  visible: boolean;
  name: string;
  hpCurrent: number;
  hpMax: number;
  hpTemp: number;
  isNpc: boolean;
  onClose: () => void;
  onApply: (patch: { hp_current?: number; hp_max?: number; hp_temp?: number }) => void;
}

export function CombatHpModal({
  visible, name, hpCurrent, hpMax, hpTemp, isNpc, onClose, onApply,
}: Props) {
  const [mode, setMode] = useState<HpMode>('damage');
  const [amount, setAmount] = useState('');

  useEffect(() => {
    if (visible) {
      setMode('damage');
      setAmount('');
    }
  }, [visible]);

  function apply() {
    const n = parseInt(amount, 10);
    if (isNaN(n) || n < 0) return;
    switch (mode) {
      case 'damage': {
        let remaining = n;
        let newTemp = hpTemp;
        let newCurrent = hpCurrent;
        if (newTemp > 0) {
          const absorbed = Math.min(newTemp, remaining);
          newTemp -= absorbed;
          remaining -= absorbed;
        }
        newCurrent = Math.max(0, newCurrent - remaining);
        onApply({ hp_current: newCurrent, hp_temp: newTemp });
        break;
      }
      case 'heal': {
        const newCurrent = Math.min(hpMax, hpCurrent + n);
        onApply({ hp_current: newCurrent });
        break;
      }
      case 'temp': {
        onApply({ hp_temp: Math.max(hpTemp, n) });
        break;
      }
      case 'set-max': {
        const newMax = Math.max(1, n);
        const newCurrent = Math.min(hpCurrent, newMax);
        onApply({ hp_max: newMax, hp_current: newCurrent });
        break;
      }
    }
    onClose();
  }

  const modes: Array<{ key: HpMode; label: string; icon: string; color: string }> = [
    { key: 'damage', label: 'Damage', icon: 'sword', color: colors.hpDanger },
    { key: 'heal', label: 'Heal', icon: 'heart-plus', color: colors.hpHealthy },
    { key: 'temp', label: 'Temp HP', icon: 'shield-half-full', color: colors.hpWarning },
    ...(isNpc ? [{ key: 'set-max' as HpMode, label: 'Set Max', icon: 'heart-cog', color: colors.primary }] : []),
  ];

  const activeMode = modes.find((m) => m.key === mode)!;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={st.backdrop} onPress={onClose}>
        <Pressable style={st.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={st.header}>
            <Text variant="label-lg" weight="bold" style={st.title}>{name}</Text>
            <TouchableOpacity onPress={onClose}>
              <MaterialCommunityIcons name="close" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={st.hpDisplay}>
            <Text style={st.hpCurrent}>{hpCurrent}</Text>
            <Text style={st.hpSep}>/</Text>
            <Text style={st.hpMax}>{hpMax}</Text>
            {hpTemp > 0 && (
              <Text style={st.hpTempText}> +{hpTemp} temp</Text>
            )}
          </View>
          <HpBar current={hpCurrent} max={hpMax} />

          <View style={st.modeTabs}>
            {modes.map((m) => (
              <TouchableOpacity
                key={m.key}
                style={[st.modeTab, mode === m.key && { borderColor: m.color, backgroundColor: m.color + '18' }]}
                onPress={() => { setMode(m.key); setAmount(''); }}
              >
                <MaterialCommunityIcons
                  name={m.icon as any}
                  size={16}
                  color={mode === m.key ? m.color : colors.textSecondary}
                />
                <Text style={[st.modeTabText, mode === m.key && { color: m.color }]}>
                  {m.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TextInput
            style={[st.amountInput, { borderColor: activeMode.color }]}
            keyboardType="number-pad"
            placeholder={mode === 'set-max' ? 'New max HP' : mode === 'temp' ? 'Temp HP amount' : 'Amount'}
            placeholderTextColor={colors.textSecondary}
            value={amount}
            onChangeText={setAmount}
            autoFocus
            selectTextOnFocus
            onSubmitEditing={apply}
          />

          <TouchableOpacity
            style={[st.applyBtn, { backgroundColor: activeMode.color }, !amount && st.applyBtnDisabled]}
            onPress={apply}
            disabled={!amount}
          >
            <Text style={st.applyBtnText}>
              {mode === 'damage' ? 'Apply Damage' : mode === 'heal' ? 'Apply Healing' : mode === 'temp' ? 'Set Temp HP' : 'Set Max HP'}
            </Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const st = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center', alignItems: 'center',
  },
  sheet: {
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    borderRadius: 16, padding: 20, width: 340, gap: 12,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  title: { color: colors.textPrimary, fontSize: 16 },
  hpDisplay: {
    flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center',
  },
  hpCurrent: { fontSize: 32, fontWeight: '700', color: colors.textPrimary },
  hpSep: { fontSize: 20, color: colors.textSecondary, marginHorizontal: 4 },
  hpMax: { fontSize: 20, color: colors.textSecondary },
  hpTempText: { fontSize: 14, color: colors.hpWarning, marginLeft: 6 },
  modeTabs: {
    flexDirection: 'row', gap: 6, marginTop: 4,
  },
  modeTab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingVertical: 8, borderRadius: 8,
    borderWidth: 1, borderColor: colors.border,
  },
  modeTabText: { fontSize: 11, fontWeight: '600', color: colors.textSecondary },
  amountInput: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 22, fontWeight: '700', color: colors.textPrimary,
    backgroundColor: colors.background, textAlign: 'center',
  },
  applyBtn: {
    borderRadius: 10, paddingVertical: 12, alignItems: 'center',
  },
  applyBtnDisabled: { opacity: 0.4 },
  applyBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});
