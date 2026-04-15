import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { getCampaignSessionHistory } from '@vaultstone/api';
import { colors, spacing } from '@vaultstone/ui';

interface Props {
  campaignId: string;
}

export function CampaignNotesCard({ campaignId }: Props) {
  const router = useRouter();
  const [pastCount, setPastCount] = useState<number | null>(null);
  const [awaitingRecap, setAwaitingRecap] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await getCampaignSessionHistory(campaignId);
      if (cancelled || error || !data) return;
      setPastCount(data.length);
      const awaiting = data.filter((r) => {
        const s = r.summary?.trim() ?? '';
        return s.length === 0;
      }).length;
      setAwaitingRecap(awaiting);
    })();
    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  const countLabel =
    pastCount === null
      ? 'Loading…'
      : `${pastCount} past session${pastCount === 1 ? '' : 's'}`;

  return (
    <Pressable
      onPress={() => router.push(`/campaign/${campaignId}/recap`)}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel="Open Campaign Notes Hub"
    >
      <View style={styles.headerRow}>
        <MaterialCommunityIcons name="notebook-edit-outline" size={24} color={colors.brand} />
        <Text style={styles.label}>Notes Hub</Text>
      </View>
      <Text style={styles.title}>Campaign Notes Hub</Text>
      <Text style={styles.body}>{countLabel}</Text>
      {awaitingRecap > 0 && (
        <View style={styles.pill}>
          <MaterialCommunityIcons name="pencil-outline" size={12} color={colors.hpWarning} />
          <Text style={styles.pillText}>{awaitingRecap} awaiting recap</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border, borderWidth: 1, borderRadius: 14,
    padding: spacing.md, gap: 6,
    flex: 1, flexBasis: 220, minWidth: 220,
  },
  pressed: { opacity: 0.85 },
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
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: colors.background,
    borderColor: colors.border, borderWidth: 1, borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3, marginTop: spacing.xs,
  },
  pillText: {
    fontSize: 11, color: colors.hpWarning, fontWeight: '600',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
});
