import { Modal, Pressable, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, spacing } from '@vaultstone/ui';
import type { PendingFile } from './uploadPdf';

type Props = {
  visible: boolean;
  pending: PendingFile | null;
  onCancel: () => void;
  onConfirm: () => void;
};

// ToS acknowledgment shown before any PDF actually moves to disk. Lifted out
// of app/campaign/[id]/rulebook.tsx so the new system-side upload flow can
// gate its uploads through the exact same legal copy.
export function TosModal({ visible, pending, onCancel, onConfirm }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <Pressable style={s.modalBackdrop} onPress={onCancel}>
        <Pressable style={s.modalCard} onPress={() => {}}>
          <View style={s.modalHeader}>
            <MaterialCommunityIcons name="shield-account-outline" size={24} color={colors.brand} />
            <Text style={s.modalTitle}>Before You Upload</Text>
          </View>

          <Text style={s.modalBody}>
            By uploading this file, you confirm that you own or have a lawful license
            to this material. Vaultstone does not receive or store this file — it
            remains on your device only and is never shared with other users.
          </Text>

          {pending && (
            <View style={s.filePreview}>
              <MaterialCommunityIcons name="file-pdf-box" size={20} color={colors.brand} />
              <Text style={s.filePreviewName} numberOfLines={1}>{pending.name}</Text>
            </View>
          )}

          <View style={s.modalActions}>
            <TouchableOpacity style={s.cancelBtn} onPress={onCancel}>
              <Text style={s.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.confirmBtn} onPress={onConfirm}>
              <Text style={s.confirmBtnText}>I Confirm — Upload</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center', padding: spacing.lg,
  },
  modalCard: {
    backgroundColor: colors.surface, borderRadius: 16,
    padding: spacing.lg, gap: spacing.md,
    borderWidth: 1, borderColor: colors.border,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  modalTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  modalBody: { fontSize: 14, color: colors.textPrimary, lineHeight: 20 },
  filePreview: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.background, borderRadius: 8,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
    borderWidth: 1, borderColor: colors.border,
  },
  filePreviewName: { flex: 1, color: colors.textPrimary, fontSize: 13 },
  modalActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  cancelBtn: {
    flex: 1, paddingVertical: spacing.md, borderRadius: 10,
    borderWidth: 1, borderColor: colors.border, alignItems: 'center',
  },
  cancelBtnText: { color: colors.textPrimary, fontWeight: '600' },
  confirmBtn: {
    flex: 1, paddingVertical: spacing.md, borderRadius: 10,
    backgroundColor: colors.brand, alignItems: 'center',
  },
  confirmBtnText: { color: '#fff', fontWeight: '700' },
});
