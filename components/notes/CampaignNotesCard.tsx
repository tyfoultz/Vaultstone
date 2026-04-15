import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, spacing } from '@vaultstone/ui';

interface Props {
  campaignId: string;
}

// Placeholder for the Campaign Notes Hub (see docs/features/06-notes.md,
// Epic 8). Intent: DM-facing surface that aggregates every player's session
// notes, lets the DM draft a recap, and pushes that recap onto the
// session-history row. Built out post-MVP — this card just reserves the
// slot in the campaign layout so the structure is visible.
export function CampaignNotesCard(_props: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <MaterialCommunityIcons name="notebook-edit-outline" size={24} color={colors.brand} />
        <Text style={styles.label}>Campaign Notes</Text>
      </View>
      <Text style={styles.title}>DM Notes Hub</Text>
      <Text style={styles.body}>
        Review every player&apos;s session notes alongside your own, draft a
        recap, and push it to the session history.
      </Text>
      <View style={styles.soonPill}>
        <MaterialCommunityIcons name="hammer-wrench" size={12} color={colors.textSecondary} />
        <Text style={styles.soonText}>Coming soon</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border, borderWidth: 1, borderRadius: 14,
    padding: spacing.md, gap: 6,
    flex: 1, flexBasis: 220, minWidth: 220,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  label: {
    fontSize: 12, color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 1,
  },
  title: {
    fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginTop: 4,
  },
  body: {
    fontSize: 13, color: colors.textSecondary, lineHeight: 19,
  },
  soonPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: colors.background,
    borderColor: colors.border, borderWidth: 1, borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3, marginTop: spacing.xs,
  },
  soonText: {
    fontSize: 11, color: colors.textSecondary, fontWeight: '600',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
});
