import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCampaignStore } from '@vaultstone/store';
import { colors, spacing } from '@vaultstone/ui';

type ContentSource = { key: string; label: string };

export default function RulebookScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const campaigns = useCampaignStore((s) => s.campaigns);
  const campaign = campaigns.find((c) => c.id === id);

  const source = campaign?.content_sources as ContentSource | null;
  const label = source?.label ?? campaign?.system_label ?? null;
  const isOpenLicense = source?.key === 'srd_5_1' || source?.key === 'srd_2_0';

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

          <View style={s.emptyState}>
            <MaterialCommunityIcons name="tray-arrow-up" size={36} color={colors.border} />
            <Text style={s.emptyTitle}>No PDF uploaded yet</Text>
            <Text style={s.emptyBody}>
              Upload your own legally-obtained copy of{' '}
              <Text style={s.emptyBold}>{label}</Text> to read it here.
              Your file stays on your device and is never shared with anyone.
            </Text>
          </View>

          <TouchableOpacity style={s.uploadBtnDisabled} disabled>
            <MaterialCommunityIcons name="tray-arrow-up" size={18} color={colors.textSecondary} />
            <Text style={s.uploadBtnText}>Upload Your Copy</Text>
            <View style={s.comingSoonBadge}>
              <Text style={s.comingSoonText}>Coming soon</Text>
            </View>
          </TouchableOpacity>
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

  uploadBtnDisabled: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: spacing.md,
    opacity: 0.5,
  },
  uploadBtnText: { fontSize: 14, color: colors.textSecondary, flex: 1 },
  comingSoonBadge: {
    backgroundColor: colors.background,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  comingSoonText: { fontSize: 11, color: colors.textSecondary, fontWeight: '600' },

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
});
