import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Platform, ActivityIndicator, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, spacing } from '@vaultstone/ui';
import { getSourceByCampaign } from '@vaultstone/content';
import type { LocalSource } from '@vaultstone/content';

// react-native-pdf is native-only; conditionally import
let Pdf: React.ComponentType<{ source: { uri: string }; style: object; onError?: (err: unknown) => void }> | null = null;
if (Platform.OS !== 'web') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Pdf = require('react-native-pdf').default;
}

export default function PdfViewerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [source, setSource] = useState<LocalSource | null>(null);
  const [loading, setLoading] = useState(true);
  const [pdfError, setPdfError] = useState<string | null>(null);

  // Web-only: blob object URL
  const [webObjectUrl, setWebObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    getSourceByCampaign(id).then((s) => {
      setSource(s);
      setLoading(false);
    });
  }, [id]);

  // Web: load the file as a blob URL via fetch of the local file path
  useEffect(() => {
    if (Platform.OS !== 'web' || !source) return;
    fetch(source.file_path)
      .then((r) => r.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        setWebObjectUrl(url);
      })
      .catch(() => setPdfError('Failed to load PDF for viewing.'));
    return () => {
      if (webObjectUrl) URL.revokeObjectURL(webObjectUrl);
    };
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
        <Text style={s.errorText}>No PDF uploaded for this campaign.</Text>
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
      ) : Platform.OS === 'web' ? (
        webObjectUrl ? (
          <iframe
            src={webObjectUrl}
            style={{ flex: 1, border: 'none', width: '100%', height: '100%' }}
            title={source.file_name}
          />
        ) : (
          <View style={s.center}>
            <ActivityIndicator color={colors.brand} />
          </View>
        )
      ) : Pdf ? (
        <Pdf
          source={{ uri: source.file_path }}
          style={s.pdf}
          onError={(err) => {
            console.warn('PDF error', err);
            setPdfError('Failed to render PDF. Ensure the file is a valid PDF.');
          }}
        />
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1, backgroundColor: colors.background,
    justifyContent: 'center', alignItems: 'center',
    padding: spacing.lg,
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
  pdf: { flex: 1, width: '100%' },
  errorText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center' },
  backBtn: {
    marginTop: spacing.md,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  backBtnText: { color: colors.brand, fontSize: 14, fontWeight: '600' },
});
