import { useCallback, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { getMostRecentSessionForCampaign } from '@vaultstone/api';
import { colors, spacing } from '@vaultstone/ui';
import { SessionLogFeed } from './SessionLogFeed';

interface Props {
  campaignId: string;
  maxRows?: number;
}

// Resolves which session the current campaign page should surface in its
// log card: active session if one exists, else most recent ended session,
// else an empty-state placeholder.
export function SessionLogCard({ campaignId, maxRows = 8 }: Props) {
  const [resolved, setResolved] = useState<
    { sessionId: string; isLive: boolean } | null | 'empty'
  >(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const result = await getMostRecentSessionForCampaign(campaignId);
        if (cancelled) return;
        if (!result) setResolved('empty');
        else setResolved({ sessionId: result.session.id, isLive: result.isLive });
      })();
      return () => { cancelled = true; };
    }, [campaignId]),
  );

  if (resolved === null) return null;

  if (resolved === 'empty') {
    return (
      <View style={s.card}>
        <View style={s.headerRow}>
          <MaterialCommunityIcons name="timeline-text-outline" size={20} color={colors.brand} />
          <Text style={s.label}>Session Log</Text>
        </View>
        <Text style={s.empty}>Runs a live feed of combat events once a session starts.</Text>
      </View>
    );
  }

  return (
    <SessionLogFeed
      sessionId={resolved.sessionId}
      isLive={resolved.isLive}
      variant="compact"
      maxRows={maxRows}
      title={resolved.isLive ? 'Session Log' : 'Last session log'}
    />
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border, borderWidth: 1, borderRadius: 14,
    padding: spacing.md, gap: spacing.sm,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  label: {
    fontSize: 12, color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 1, fontWeight: '700',
  },
  empty: { color: colors.textSecondary, fontSize: 12 },
});
