import { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Platform, ActivityIndicator, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, spacing } from '@vaultstone/ui';
import { getSourceById } from '@vaultstone/content';
import type { LocalSource } from '@vaultstone/content';
import { PdfRenderer } from '../../../components/pdf-viewer-renderer';

export default function PdfViewerScreen() {
  const { id, sourceId, page } = useLocalSearchParams<{
    id: string; sourceId: string; page?: string;
  }>();
  const initialPage = page ? Math.max(1, parseInt(page, 10) || 1) : 1;
  const router = useRouter();
  const [source, setSource] = useState<LocalSource | null>(null);
  const [loading, setLoading] = useState(true);
  const [pdfError, setPdfError] = useState<string | null>(null);

  // Track the blob URL we created so we can revoke it on unmount (memory management)
  const blobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!sourceId) {
      setLoading(false);
      setPdfError('No PDF selected. Go back and tap Read on a specific PDF.');
      return;
    }
    getSourceById(sourceId)
      .then((s) => {
        setSource(s);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
        setPdfError('Could not load your PDF. Try re-uploading from the Rulebook screen.');
      });
  }, [sourceId]);

  // Revoke any blob URL we created when the component unmounts
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, []);

  // Track the blob URL from getSourceByCampaign so we clean it up correctly
  useEffect(() => {
    if (!source || Platform.OS !== 'web') return;
    // source.file_path is already a valid blob URL from getSourceByCampaign —
    // store the reference so we can revoke it on unmount
    blobUrlRef.current = source.file_path;
  }, [source]);

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  if (!source) {
    return (
      <View style={s.center}>
        <MaterialCommunityIcons name="tray-arrow-up" size={32} color={colors.textSecondary} />
        <Text style={[s.errorText, { marginTop: spacing.sm }]}>
          {pdfError ?? 'No PDF uploaded for this campaign.'}
        </Text>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Text style={s.backBtnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.headerBack}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.headerTitle} numberOfLines={1}>{source.file_name}</Text>
      </View>

      {/* Viewer */}
      {pdfError ? (
        <View style={s.center}>
          <MaterialCommunityIcons name="alert-circle-outline" size={32} color={colors.hpDanger} />
          <Text style={[s.errorText, { marginTop: spacing.sm }]}>{pdfError}</Text>
        </View>
      ) : (
        <PdfRenderer
          uri={source.file_path}
          fileName={source.file_name}
          page={initialPage}
          onError={(err) => {
            console.warn('PDF error', err);
            setPdfError('Failed to render PDF. Ensure the file is a valid PDF.');
          }}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1, backgroundColor: colors.background,
    justifyContent: 'center', alignItems: 'center',
    padding: spacing.lg,
    gap: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    backgroundColor: colors.surface,
  },
  headerBack: { padding: 4 },
  headerTitle: {
    flex: 1, fontSize: 16, fontWeight: '600', color: colors.textPrimary,
  },
  errorText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center' },
  backBtn: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  backBtnText: { color: colors.brand, fontSize: 14, fontWeight: '600' },
});
