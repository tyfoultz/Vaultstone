import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { supabase } from '@vaultstone/api';
import { useAuthStore, type RecapPanelKind } from '@vaultstone/store';
import { colors, spacing } from '@vaultstone/ui';

import { RecapEditorPanel } from '../../../components/notes/recap/RecapEditorPanel';
import { DmNotesPanel } from '../../../components/notes/recap/DmNotesPanel';
import { PlayerNotesPanel } from '../../../components/notes/recap/PlayerNotesPanel';

interface SessionRow {
  id: string;
  summary: string | null;
  ended_at: string | null;
  campaign_id: string;
}

const TITLES: Record<RecapPanelKind, string> = {
  recap: 'Recap',
  dmNotes: 'Your Session Notes',
  playerNotes: 'Player Notes',
};

// Single-panel route opened by RecapDock's pop-out button. Renders one panel
// in `mode="popout"`, which announces presence to the dock instance via
// BroadcastChannel so the dock-side panel goes read-only while this window
// is alive.
export default function RecapPanelPopoutScreen() {
  const { id: campaignId, session: sessionParam, panel: panelParam } =
    useLocalSearchParams<{ id: string; session?: string; panel?: string }>();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const panel = (panelParam ?? 'recap') as RecapPanelKind;
  const sessionId = sessionParam ?? null;

  const [session, setSession] = useState<SessionRow | null>(null);
  const [displayNameByUserId, setDisplayNameByUserId] = useState<Record<string, string>>({});
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    if (!campaignId || !sessionId || !user) return;
    let cancelled = false;
    (async () => {
      const { data: campaign } = await supabase
        .from('campaigns').select('dm_user_id').eq('id', campaignId).maybeSingle();
      if (cancelled) return;
      if (!campaign || campaign.dm_user_id !== user.id) {
        setAllowed(false);
        return;
      }
      setAllowed(true);

      const { data: s } = await supabase
        .from('sessions')
        .select('id, summary, ended_at, campaign_id')
        .eq('id', sessionId).maybeSingle();
      if (cancelled) return;
      setSession((s ?? null) as SessionRow | null);

      if (panel === 'playerNotes') {
        const { data: members } = await supabase
          .from('campaign_members')
          .select('user_id, profiles(display_name)')
          .eq('campaign_id', campaignId);
        if (cancelled) return;
        const map: Record<string, string> = {};
        for (const m of (members ?? []) as unknown as Array<{
          user_id: string; profiles: { display_name: string | null } | null;
        }>) {
          map[m.user_id] = m.profiles?.display_name ?? 'Anonymous';
        }
        setDisplayNameByUserId(map);
      }
    })();
    return () => { cancelled = true; };
  }, [campaignId, sessionId, user, panel]);

  if (!campaignId || !sessionId) {
    return (
      <View style={styles.screen}>
        <View style={styles.center}>
          <Text style={styles.error}>Missing session or panel.</Text>
        </View>
      </View>
    );
  }
  if (!user || allowed === null) {
    return (
      <View style={styles.screen}>
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      </View>
    );
  }
  if (allowed === false) {
    return (
      <View style={styles.screen}>
        <View style={styles.center}>
          <Text style={styles.error}>Only the campaign DM can open this panel.</Text>
        </View>
      </View>
    );
  }
  if (!session) {
    return (
      <View style={styles.screen}>
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      </View>
    );
  }

  const isLive = session.ended_at === null;

  function handleClose() {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.opener) {
      window.close();
      return;
    }
    router.back();
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>{TITLES[panel]}</Text>
        <View style={{ flex: 1 }} />
        <TouchableOpacity onPress={handleClose} style={styles.closeBtn} accessibilityLabel="Close">
          <MaterialCommunityIcons name="close" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>
      <View style={styles.body}>
        {panel === 'recap' && (
          <RecapEditorPanel
            sessionId={session.id}
            campaignId={campaignId}
            publishedSummary={session.summary}
            isLive={isLive}
            mode="popout"
          />
        )}
        {panel === 'dmNotes' && (
          <DmNotesPanel sessionId={session.id} userId={user.id} mode="popout" />
        )}
        {panel === 'playerNotes' && (
          <PlayerNotesPanel
            sessionId={session.id}
            isLive={isLive}
            excludeUserId={user.id}
            displayNameByUserId={displayNameByUserId}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderBottomColor: colors.border, borderBottomWidth: 1,
    backgroundColor: colors.surface,
  },
  title: {
    fontSize: 13, fontWeight: '700', color: colors.textPrimary,
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  closeBtn: { padding: 4 },
  body: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  error: { fontSize: 14, color: colors.textSecondary, textAlign: 'center' },
});
