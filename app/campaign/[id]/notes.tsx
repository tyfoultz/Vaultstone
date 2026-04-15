import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getActiveSession, getCampaignSessionHistory } from '@vaultstone/api';
import { useAuthStore } from '@vaultstone/store';
import { colors, spacing } from '@vaultstone/ui';
import { SessionNotesPanel } from '../../../components/session/SessionNotesPanel';

export default function SessionNotesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      const { data: active } = await getActiveSession(id);
      if (cancelled) return;
      if (active) {
        setSessionId(active.id);
        setReadOnly(false);
      } else {
        // No live session — fall back to the most recent ended session so
        // the pop-out window still renders something useful to read.
        const { data: past } = await getCampaignSessionHistory(id);
        if (!cancelled && past && past.length > 0) {
          setSessionId(past[0].id);
          setReadOnly(true);
        }
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [id]);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Session Notes</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : !sessionId || !user || !id ? (
        <View style={styles.center}>
          <Text style={styles.empty}>No session to show notes for.</Text>
        </View>
      ) : (
        <SessionNotesPanel
          sessionId={sessionId}
          userId={user.id}
          campaignId={id}
          readOnly={readOnly}
          layout="fullscreen"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    borderBottomColor: colors.border, borderBottomWidth: 1,
    backgroundColor: colors.surface,
  },
  backBtn: { padding: 4 },
  title: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  empty: { fontSize: 14, color: colors.textSecondary },
});
