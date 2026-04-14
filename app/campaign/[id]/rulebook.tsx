import { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, Modal, Pressable,
  ActivityIndicator, Platform, Alert, StyleSheet,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { supabase } from '@vaultstone/api';
import { useCampaignStore } from '@vaultstone/store';
import { colors, spacing } from '@vaultstone/ui';
import {
  getSourcesByCampaign, saveSource, deleteSourceById,
  removeSourceFromIndex, reindexSource, getCampaignIndexStatuses,
} from '@vaultstone/content';
import type { LocalSource, IndexMeta } from '@vaultstone/content';
import type { Database } from '@vaultstone/types';

type Campaign = Database['public']['Tables']['campaigns']['Row'];
type ContentSource = { key: string; label: string };

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function IndexStatusLine({
  status,
  onRetry,
  canIndex,
}: {
  status: IndexMeta | undefined;
  onRetry: () => void;
  canIndex: boolean;
}) {
  if (!status || status.status === 'not_indexed') {
    if (!canIndex) {
      return <Text style={s.indexMuted}>Indexing available on web (for now)</Text>;
    }
    return (
      <TouchableOpacity onPress={onRetry}>
        <Text style={s.indexAction}>Not indexed — Index now</Text>
      </TouchableOpacity>
    );
  }
  if (status.status === 'indexing') {
    const done = status.pages_indexed;
    const total = status.total_pages;
    return (
      <View style={s.indexRow}>
        <ActivityIndicator size="small" color={colors.brand} />
        <Text style={s.indexMuted}>
          Indexing… {total ? `${done}/${total}` : `${done}`}
        </Text>
      </View>
    );
  }
  if (status.status === 'failed') {
    return (
      <View>
        <TouchableOpacity onPress={onRetry}>
          <Text style={s.indexError}>Indexing failed — Retry</Text>
        </TouchableOpacity>
        {status.error ? (
          <Text style={s.indexMuted} numberOfLines={3}>
            {status.error}
          </Text>
        ) : null}
      </View>
    );
  }
  // indexed
  return (
    <Text style={s.indexMuted}>
      ✓ Indexed{status.total_pages ? ` · ${status.total_pages} pages` : ''}
    </Text>
  );
}

export default function RulebookScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { campaigns, setActiveCampaign, setCampaigns } = useCampaignStore();
  const [campaign, setCampaign] = useState<Campaign | null>(
    campaigns.find((c) => c.id === id) ?? null,
  );

  // If the store was wiped by a browser refresh, re-fetch from Supabase
  useEffect(() => {
    if (campaign) return;
    supabase
      .from('campaigns')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data }) => {
        if (data) {
          setCampaign(data);
          setActiveCampaign(data);
          setCampaigns([...campaigns.filter((c) => c.id !== data.id), data]);
        }
      });
  }, [id]);

  const source = campaign?.content_sources as ContentSource | null;
  const label = source?.label ?? campaign?.system_label ?? null;
  const isOpenLicense = source?.key === 'srd_5_1' || source?.key === 'srd_2_0';

  const [localSources, setLocalSources] = useState<LocalSource[]>([]);
  const [loadingLocal, setLoadingLocal] = useState(true);
  const [tosModal, setTosModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [indexStatuses, setIndexStatuses] = useState<Record<string, IndexMeta>>({});
  const [pendingFile, setPendingFile] = useState<{
    uri: string; name: string; mimeType?: string;
  } | null>(null);

  useEffect(() => {
    getSourcesByCampaign(id)
      .then((sources) => setLocalSources(sources))
      .catch(() => setLocalSources([]))
      .finally(() => setLoadingLocal(false));
  }, [id]);

  // Load initial index statuses whenever the source list changes.
  useEffect(() => {
    if (!id || localSources.length === 0) {
      setIndexStatuses({});
      return;
    }
    getCampaignIndexStatuses(id).then((metas) => {
      const map: Record<string, IndexMeta> = {};
      for (const m of metas) map[m.source_id] = m;
      setIndexStatuses(map);
    }).catch(() => {});
  }, [id, localSources.length]);

  // Poll while any source is actively indexing, so the UI reflects progress.
  useEffect(() => {
    const anyIndexing = Object.values(indexStatuses).some((s) => s.status === 'indexing');
    if (!id || !anyIndexing) return;
    const interval = setInterval(() => {
      getCampaignIndexStatuses(id).then((metas) => {
        const map: Record<string, IndexMeta> = {};
        for (const m of metas) map[m.source_id] = m;
        setIndexStatuses(map);
      }).catch(() => {});
    }, 500);
    return () => clearInterval(interval);
  }, [id, indexStatuses]);

  // Web-only: kick off extraction + indexing for a source. Native support
  // lands in Phase 5c; until then we skip silently rather than throw.
  function startIndexing(sourceId: string) {
    if (Platform.OS !== 'web') return;
    // Seed local state so the UI shows "indexing" immediately.
    setIndexStatuses((prev) => ({
      ...prev,
      [sourceId]: {
        source_id: sourceId,
        status: 'indexing',
        pages_indexed: 0,
        total_pages: null,
        indexed_at: null,
        error: null,
      },
    }));
    reindexSource(sourceId, async (filePath) => {
      const res = await fetch(filePath);
      return res.blob();
    }).catch((err) => {
      console.warn('Indexing failed', err);
    });
  }

  async function handlePickFile() {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/pdf',
      copyToCacheDirectory: false,
      ...(Platform.OS === 'web' ? { base64: false } : {}),
    } as Parameters<typeof DocumentPicker.getDocumentAsync>[0]);

    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];

    let uri = asset.uri;
    if (Platform.OS === 'web') {
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
      let record: LocalSource;

      if (Platform.OS === 'web') {
        record = {
          id: uuid(),
          campaign_id: id,
          source_key: source?.key ?? 'custom',
          file_name: pendingFile.name,
          file_path: pendingFile.uri,
          uploaded_at: new Date().toISOString(),
        };
      } else {
        const destDir = `${FileSystem.documentDirectory}vaultstone/sources/${id}/`;
        await FileSystem.makeDirectoryAsync(destDir, { intermediates: true });
        const safeName = pendingFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        // Avoid filename collisions with a short suffix
        const destPath = `${destDir}${Date.now()}_${safeName}`;
        await FileSystem.copyAsync({ from: pendingFile.uri, to: destPath });
        record = {
          id: uuid(),
          campaign_id: id,
          source_key: source?.key ?? 'custom',
          file_name: pendingFile.name,
          file_path: destPath,
          uploaded_at: new Date().toISOString(),
        };
      }

      await saveSource(record);
      setLocalSources((prev) => [...prev, record]);
      // Fire-and-forget: parse + index in the background.
      startIndexing(record.id);
    } catch (err) {
      console.warn('PDF upload failed', err);
      Alert.alert(
        'Upload failed',
        'Could not save your PDF. Please try again.\n\n' +
          (err instanceof Error ? err.message : String(err)),
      );
    } finally {
      setUploading(false);
      setPendingFile(null);
    }
  }

  function handleTosCancel() {
    setTosModal(false);
    setPendingFile(null);
  }

  async function handleRemove(sourceToRemove: LocalSource) {
    if (Platform.OS !== 'web') {
      try {
        await FileSystem.deleteAsync(sourceToRemove.file_path, { idempotent: true });
      } catch {
        // file may already be gone
      }
    }
    await deleteSourceById(sourceToRemove.id);
    // Also drop any indexed page text for this source.
    await removeSourceFromIndex(sourceToRemove.id).catch(() => {});
    setLocalSources((prev) => prev.filter((s) => s.id !== sourceToRemove.id));
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

      {/* Your copies section */}
      {label && (
        <View style={s.card}>
          <View style={s.cardRow}>
            <MaterialCommunityIcons name="file-pdf-box" size={28} color={colors.brand} />
            <Text style={s.cardTitle}>Your PDFs</Text>
            {localSources.length > 0 && (
              <View style={s.countBadge}>
                <Text style={s.countBadgeText}>{localSources.length}</Text>
              </View>
            )}
          </View>

          {loadingLocal ? (
            <ActivityIndicator color={colors.brand} style={{ paddingVertical: spacing.lg }} />
          ) : (
            <>
              {/* Empty state — only shown when no PDFs uploaded yet */}
              {localSources.length === 0 && (
                <View style={s.emptyState}>
                  <MaterialCommunityIcons name="tray-arrow-up" size={36} color={colors.border} />
                  <Text style={s.emptyTitle}>No PDFs uploaded yet</Text>
                  <Text style={s.emptyBody}>
                    Upload your own legally-obtained copy of{' '}
                    <Text style={s.emptyBold}>{label}</Text> to read it here.
                    Your files stay on your device and are never shared with anyone.
                  </Text>
                </View>
              )}

              {/* PDF list */}
              {localSources.map((src) => {
                const status = indexStatuses[src.id];
                return (
                  <View key={src.id} style={s.pdfRow}>
                    <View style={s.pdfRowLeft}>
                      <MaterialCommunityIcons name="check-circle-outline" size={18} color={colors.hpHealthy} />
                      <View style={{ flex: 1 }}>
                        <Text style={s.pdfName} numberOfLines={1}>{src.file_name}</Text>
                        <IndexStatusLine
                          status={status}
                          onRetry={() => startIndexing(src.id)}
                          canIndex={Platform.OS === 'web'}
                        />
                      </View>
                    </View>
                    <View style={s.pdfRowActions}>
                      <TouchableOpacity
                        style={s.readBtn}
                        onPress={() =>
                          router.push(
                            `/campaign/${id}/pdf-viewer?sourceId=${src.id}` as never,
                          )
                        }
                      >
                        <MaterialCommunityIcons name="book-open-variant" size={14} color="#fff" />
                        <Text style={s.readBtnText}>Read</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={s.removeBtn}
                        onPress={() => handleRemove(src)}
                      >
                        <MaterialCommunityIcons name="delete-outline" size={16} color={colors.hpDanger} />
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}

              {/* Upload button — always visible when a source is declared */}
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
                  {uploading
                    ? 'Uploading…'
                    : localSources.length === 0
                    ? 'Upload Your Copy'
                    : 'Upload Another PDF'}
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
    flexDirection: 'row', alignItems: 'center',
    gap: spacing.md, marginBottom: spacing.sm,
  },
  title: { fontSize: 22, fontWeight: '700', color: colors.textPrimary },
  openBadge: { fontSize: 12, color: colors.hpHealthy, fontWeight: '600', marginTop: 2 },

  card: {
    backgroundColor: colors.surface, borderColor: colors.border,
    borderWidth: 1, borderRadius: 14, padding: spacing.lg, gap: spacing.md,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  cardBody: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },

  countBadge: {
    backgroundColor: colors.brand, borderRadius: 10,
    paddingHorizontal: 7, paddingVertical: 2, marginLeft: 4,
  },
  countBadgeText: { fontSize: 11, color: '#fff', fontWeight: '700' },

  emptyState: { alignItems: 'center', paddingVertical: spacing.lg, gap: spacing.sm },
  emptyTitle: { fontSize: 15, fontWeight: '600', color: colors.textSecondary },
  emptyBody: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', lineHeight: 19 },
  emptyBold: { fontWeight: '700', color: colors.textPrimary },

  pdfRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.background, borderRadius: 8,
    paddingHorizontal: spacing.sm, paddingVertical: 8, gap: spacing.sm,
  },
  pdfRowLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  pdfName: { flex: 1, fontSize: 13, color: colors.textPrimary, fontWeight: '500' },
  pdfRowActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },

  indexRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  indexMuted: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  indexAction: { fontSize: 11, color: colors.brand, fontWeight: '600', marginTop: 2 },
  indexError: { fontSize: 11, color: colors.hpDanger, fontWeight: '600', marginTop: 2 },

  readBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.brand, borderRadius: 6,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  readBtnText: { fontSize: 12, color: '#fff', fontWeight: '700' },

  removeBtn: {
    borderColor: colors.hpDanger + '55', borderWidth: 1,
    borderRadius: 6, padding: 6,
  },

  uploadBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    borderColor: colors.brand, borderWidth: 1, borderRadius: 10, padding: spacing.md,
  },
  uploadBtnDisabled: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    borderColor: colors.border, borderWidth: 1, borderRadius: 10,
    padding: spacing.md, opacity: 0.6,
  },
  uploadBtnText: { fontSize: 14, color: colors.brand, fontWeight: '600' },

  legalCard: {
    flexDirection: 'row', gap: spacing.md, backgroundColor: colors.surface,
    borderColor: colors.border, borderWidth: 1, borderRadius: 14, padding: spacing.lg,
  },
  legalTitle: { fontSize: 13, fontWeight: '700', color: colors.textSecondary, marginBottom: 4 },
  legalBody: { fontSize: 13, color: colors.textSecondary, lineHeight: 19 },

  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center', alignItems: 'center',
  },
  modalCard: {
    backgroundColor: colors.surface, borderRadius: 14, borderColor: colors.border,
    borderWidth: 1, width: '90%', maxWidth: 460, padding: spacing.lg, gap: spacing.md,
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
