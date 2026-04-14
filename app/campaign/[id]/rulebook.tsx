import { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, Modal, Pressable,
  ActivityIndicator, Platform, StyleSheet,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCampaignStore } from '@vaultstone/store';
import { colors, spacing } from '@vaultstone/ui';
import {
  getSourceByCampaign, saveSource, deleteSource,
} from '@vaultstone/content';
import type { LocalSource } from '@vaultstone/content';

type ContentSource = { key: string; label: string };

function uuid(): string {
  // Simple UUID v4 without a library
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export default function RulebookScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const campaigns = useCampaignStore((s) => s.campaigns);
  const campaign = campaigns.find((c) => c.id === id);

  const source = campaign?.content_sources as ContentSource | null;
  const label = source?.label ?? campaign?.system_label ?? null;
  const isOpenLicense = source?.key === 'srd_5_1' || source?.key === 'srd_2_0';

  const [localSource, setLocalSource] = useState<LocalSource | null>(null);
  const [loadingLocal, setLoadingLocal] = useState(true);
  const [tosModal, setTosModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pendingFile, setPendingFile] = useState<{
    uri: string; name: string; mimeType?: string;
  } | null>(null);

  useEffect(() => {
    getSourceByCampaign(id).then((s) => {
      setLocalSource(s);
      setLoadingLocal(false);
    });
  }, [id]);

  async function handlePickFile() {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/pdf',
      copyToCacheDirectory: false,
      // On web, disable base64 encoding — we need the File object to create a proper blob URL.
      // The default (base64: true) returns a giant data URL that overflows localStorage.
      ...(Platform.OS === 'web' ? { base64: false } : {}),
    } as Parameters<typeof DocumentPicker.getDocumentAsync>[0]);

    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];

    let uri = asset.uri;
    if (Platform.OS === 'web') {
      // On web with base64:false, asset.uri is an unreliable relative path.
      // Use the File object directly to create a stable blob URL.
      const file = (asset as unknown as { file?: File }).file;
      if (!file) return;
      uri = URL.createObjectURL(file);
    }

    setPendingFile({ uri, name: asset.name, mimeType: asset.mimeType ?? 'application/pdf' });
    setTosModal(true);
  }

  async function handleTosConfirm() {
    if (!pendingFile || !id) return;
    setTosModal(false);
    setUploading(true);

    try {
      if (Platform.OS === 'web') {
        // Web: the URI from document picker is already an object URL we can use directly
        const record: LocalSource = {
          id: uuid(),
          campaign_id: id,
          source_key: source?.key ?? 'custom',
          file_name: pendingFile.name,
          file_path: pendingFile.uri,
          uploaded_at: new Date().toISOString(),
        };
        await saveSource(record);
        setLocalSource(record);
      } else {
        // Native: copy to document directory
        const destDir = `${FileSystem.documentDirectory}vaultstone/sources/${id}/`;
        await FileSystem.makeDirectoryAsync(destDir, { intermediates: true });
        // Sanitize filename to avoid path issues
        const safeName = pendingFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const destPath = `${destDir}${safeName}`;
        await FileSystem.copyAsync({ from: pendingFile.uri, to: destPath });

        const record: LocalSource = {
          id: uuid(),
          campaign_id: id,
          source_key: source?.key ?? 'custom',
          file_name: pendingFile.name,
          file_path: destPath,
          uploaded_at: new Date().toISOString(),
        };
        await saveSource(record);
        setLocalSource(record);
      }
    } catch (err) {
      console.warn('PDF upload failed', err);
    } finally {
      setUploading(false);
      setPendingFile(null);
    }
  }

  function handleTosCancel() {
    setTosModal(false);
    setPendingFile(null);
  }

  async function handleRemove() {
    if (!id) return;
    // Delete the local file on native
    if (localSource && Platform.OS !== 'web') {
      try {
        await FileSystem.deleteAsync(localSource.file_path, { idempotent: true });
      } catch {
        // file may already be gone
      }
    }
    await deleteSource(id);
    setLocalSource(null);
  }

  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.container}>
      {/* Header */}
      <TouchableOpacity onPress={() => router.back()} style={s.back}>
        <Text style={s.backText}>← Campaign</Text>
      </TouchableOpacity>

      <View style={s.header}>
        <MaterialCommunityIcons name="book-open-page-variant-outline" size={32} color={colors.brand} />
        <View style={{ flex: 1 }}>
          <Text style={s.title}>{label ?? 'Rulebook'}</Text>
          {isOpenLicense && (
            <Text style={s.openBadge}>Open License — CC-BY 4.0</Text>
          )}
        </View>
      </View>

      {/* No source declared */}
      {!label && (
        <View style={s.card}>
          <MaterialCommunityIcons name="alert-circle-outline" size={24} color={colors.textSecondary} />
          <Text style={s.cardTitle}>No rulebook declared</Text>
          <Text style={s.cardBody}>
            The DM hasn't selected a rulebook for this campaign yet. Once set, each
            player can upload their own copy to read it in-app.
          </Text>
        </View>
      )}

      {/* Your copy section */}
      {label && (
        <View style={s.card}>
          <View style={s.cardRow}>
            <MaterialCommunityIcons name="file-pdf-box" size={28} color={colors.brand} />
            <Text style={s.cardTitle}>Your Copy</Text>
          </View>

          {loadingLocal ? (
            <ActivityIndicator color={colors.brand} style={{ paddingVertical: spacing.lg }} />
          ) : localSource ? (
            // Uploaded state
            <View style={s.uploadedState}>
              <View style={s.uploadedRow}>
                <MaterialCommunityIcons name="check-circle-outline" size={20} color={colors.hpHealthy} />
                <Text style={s.uploadedName} numberOfLines={1}>{localSource.file_name}</Text>
              </View>
              <View style={s.uploadedActions}>
                <TouchableOpacity
                  style={s.readBtn}
                  onPress={() => router.push(`/campaign/${id}/pdf-viewer` as never)}
                >
                  <MaterialCommunityIcons name="book-open-variant" size={16} color="#fff" />
                  <Text style={s.readBtnText}>Read</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.removeBtn} onPress={handleRemove}>
                  <MaterialCommunityIcons name="delete-outline" size={16} color={colors.hpDanger} />
                  <Text style={s.removeBtnText}>Remove</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            // Not uploaded state
            <>
              <View style={s.emptyState}>
                <MaterialCommunityIcons name="tray-arrow-up" size={36} color={colors.border} />
                <Text style={s.emptyTitle}>No PDF uploaded yet</Text>
                <Text style={s.emptyBody}>
                  Upload your own legally-obtained copy of{' '}
                  <Text style={s.emptyBold}>{label}</Text> to read it here.
                  Your file stays on your device and is never shared with anyone.
                </Text>
              </View>

              <TouchableOpacity
                style={uploading ? s.uploadBtnDisabled : s.uploadBtn}
                onPress={handlePickFile}
                disabled={uploading}
              >
                {uploading ? (
                  <ActivityIndicator color={colors.brand} size="small" />
                ) : (
                  <MaterialCommunityIcons name="tray-arrow-up" size={18} color={colors.brand} />
                )}
                <Text style={s.uploadBtnText}>
                  {uploading ? 'Uploading…' : 'Upload Your Copy'}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}

      {/* Legal note */}
      <View style={s.legalCard}>
        <MaterialCommunityIcons name="shield-check-outline" size={20} color={colors.textSecondary} />
        <View style={{ flex: 1 }}>
          <Text style={s.legalTitle}>About rulebook access</Text>
          <Text style={s.legalBody}>
            Each player must upload their own legally-obtained copy. PDFs remain on your
            device only and are never transmitted to Vaultstone's servers or shared with
            other party members.{'\n\n'}
            SRD 5.1 and SRD 5.2 content is already bundled in the app under CC-BY 4.0
            and doesn't require a separate upload.
          </Text>
        </View>
      </View>

      {/* SRD note for open-license sources */}
      {isOpenLicense && (
        <View style={[s.legalCard, { borderColor: colors.hpHealthy + '44' }]}>
          <MaterialCommunityIcons name="check-circle-outline" size={20} color={colors.hpHealthy} />
          <View style={{ flex: 1 }}>
            <Text style={[s.legalTitle, { color: colors.hpHealthy }]}>
              This content is already available
            </Text>
            <Text style={s.legalBody}>
              {source?.key === 'srd_5_1'
                ? 'SRD 5.1 (D&D 5e 2014 rules) is bundled in Vaultstone under the Creative Commons Attribution 4.0 License. No upload required.'
                : 'SRD 2.0 (D&D 5e 2024 Revised rules) is bundled in Vaultstone under the Creative Commons Attribution 4.0 License. No upload required.'}
            </Text>
          </View>
        </View>
      )}

      {/* ToS Acknowledgment Modal */}
      <Modal visible={tosModal} transparent animationType="fade">
        <Pressable style={s.modalBackdrop} onPress={handleTosCancel}>
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

            {pendingFile && (
              <View style={s.filePreview}>
                <MaterialCommunityIcons name="file-pdf-box" size={20} color={colors.brand} />
                <Text style={s.filePreviewName} numberOfLines={1}>{pendingFile.name}</Text>
              </View>
            )}

            <View style={s.modalActions}>
              <TouchableOpacity style={s.cancelBtn} onPress={handleTosCancel}>
                <Text style={s.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.confirmBtn} onPress={handleTosConfirm}>
                <Text style={s.confirmBtnText}>I Confirm — Upload</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, paddingBottom: 48, gap: spacing.md },

  back: { marginBottom: spacing.sm },
  backText: { color: colors.brand, fontSize: 14 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  title: { fontSize: 22, fontWeight: '700', color: colors.textPrimary },
  openBadge: { fontSize: 12, color: colors.hpHealthy, fontWeight: '600', marginTop: 2 },

  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: spacing.lg,
    gap: spacing.md,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  cardBody: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },

  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    gap: spacing.sm,
  },
  emptyTitle: { fontSize: 15, fontWeight: '600', color: colors.textSecondary },
  emptyBody: {
    fontSize: 13, color: colors.textSecondary, textAlign: 'center', lineHeight: 19,
  },
  emptyBold: { fontWeight: '700', color: colors.textPrimary },

  uploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderColor: colors.brand,
    borderWidth: 1,
    borderRadius: 10,
    padding: spacing.md,
  },
  uploadBtnDisabled: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: spacing.md,
    opacity: 0.6,
  },
  uploadBtnText: { fontSize: 14, color: colors.brand, fontWeight: '600' },

  uploadedState: { gap: spacing.sm },
  uploadedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.background,
    borderRadius: 8,
    padding: spacing.sm,
  },
  uploadedName: { flex: 1, fontSize: 14, color: colors.textPrimary, fontWeight: '600' },
  uploadedActions: { flexDirection: 'row', gap: spacing.sm },

  readBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.brand,
    borderRadius: 8,
    paddingVertical: 10,
  },
  readBtnText: { fontSize: 14, color: '#fff', fontWeight: '700' },

  removeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderColor: colors.hpDanger + '66',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  removeBtnText: { fontSize: 13, color: colors.hpDanger },

  legalCard: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: spacing.lg,
  },
  legalTitle: { fontSize: 13, fontWeight: '700', color: colors.textSecondary, marginBottom: 4 },
  legalBody: { fontSize: 13, color: colors.textSecondary, lineHeight: 19 },

  // ToS Modal
  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center', alignItems: 'center',
  },
  modalCard: {
    backgroundColor: colors.surface, borderRadius: 14,
    borderColor: colors.border, borderWidth: 1,
    width: '90%', maxWidth: 460, padding: spacing.lg, gap: spacing.md,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  modalTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  modalBody: { fontSize: 14, color: colors.textSecondary, lineHeight: 21 },
  filePreview: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.background, borderRadius: 8, padding: spacing.sm,
  },
  filePreviewName: { flex: 1, fontSize: 13, color: colors.textPrimary },
  modalActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  cancelBtn: {
    flex: 1, borderColor: colors.border, borderWidth: 1,
    borderRadius: 8, paddingVertical: 11, alignItems: 'center',
  },
  cancelBtnText: { fontSize: 14, color: colors.textSecondary, fontWeight: '600' },
  confirmBtn: {
    flex: 2, backgroundColor: colors.brand,
    borderRadius: 8, paddingVertical: 11, alignItems: 'center',
  },
  confirmBtnText: { fontSize: 14, color: '#fff', fontWeight: '700' },
});
