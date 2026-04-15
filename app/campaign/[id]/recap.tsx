import { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  supabase, getCampaignMembers, getCampaignSessionHistory, getActiveSession,
} from '@vaultstone/api';
import { useAuthStore } from '@vaultstone/store';
import { colors, spacing } from '@vaultstone/ui';
import { SessionSidebar, type SessionSidebarItem } from '../../../components/notes/recap/SessionSidebar';
import { RecapDock } from '../../../components/notes/recap/RecapDock';

interface SessionRow {
  id: string;
  started_at: string;
  ended_at: string | null;
  summary: string | null;
  round: number;
}

export default function CampaignNotesHubScreen() {
  const { id: campaignId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);

  const [isDM, setIsDM] = useState<boolean | null>(null);
  const [history, setHistory] = useState<SessionRow[]>([]);
  const [liveSession, setLiveSession] = useState<SessionRow | null>(null);
  const [displayNameByUserId, setDisplayNameByUserId] = useState<Record<string, string>>({});
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!campaignId || !user) return;
    let cancelled = false;
    (async () => {
      const { data: campaign } = await supabase
        .from('campaigns').select('dm_user_id').eq('id', campaignId).maybeSingle();
      if (cancelled) return;
      if (!campaign || campaign.dm_user_id !== user.id) {
        router.replace(`/campaign/${campaignId}`);
        return;
      }
      setIsDM(true);

      const [historyRes, activeRes, membersRes] = await Promise.all([
        getCampaignSessionHistory(campaignId),
        getActiveSession(campaignId),
        getCampaignMembers(campaignId),
      ]);
      if (cancelled) return;

      const ended = (historyRes.data ?? []) as SessionRow[];
      const live = (activeRes.data ?? null) as SessionRow | null;
      setHistory(ended);
      setLiveSession(live);

      const nameMap: Record<string, string> = {};
      for (const m of (membersRes.data ?? []) as unknown as Array<{
        user_id: string; profiles: { display_name: string | null } | null;
      }>) {
        nameMap[m.user_id] = m.profiles?.display_name ?? 'Anonymous';
      }
      setDisplayNameByUserId(nameMap);

      setSelectedSessionId(ended[0]?.id ?? live?.id ?? null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [campaignId, user, router]);

  if (!user || !campaignId) return null;
  if (isDM === null || loading) {
    return (
      <View style={styles.screen}>
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      </View>
    );
  }

  const allSessions: Array<SessionRow & { isLive: boolean }> = [
    ...(liveSession ? [{ ...liveSession, isLive: true }] : []),
    ...history.map((s) => ({ ...s, isLive: false })),
  ];
  const selected = allSessions.find((s) => s.id === selectedSessionId) ?? null;

  // Number ended sessions oldest-first (Session 1, 2, 3…). Live session is
  // shown as "Live Session" and doesn't claim a number until it ends.
  const numberById: Record<string, number> = {};
  [...history].reverse().forEach((s, i) => { numberById[s.id] = i + 1; });

  const sidebarItems: SessionSidebarItem[] = allSessions.map((s) => ({
    id: s.id,
    startedAt: s.started_at,
    isLive: s.isLive,
    number: s.isLive ? null : (numberById[s.id] ?? null),
  }));

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Campaign Notes Hub</Text>
      </View>

      {allSessions.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.empty}>No sessions yet. Start one from the campaign page.</Text>
        </View>
      ) : (
        <View style={Platform.OS === 'web' ? styles.webBody : styles.nativeBody}>
          <SessionSidebar
            sessions={sidebarItems}
            selectedId={selectedSessionId}
            onSelect={setSelectedSessionId}
          />
          <View style={styles.dockHost}>
            {selected && (
              <RecapDock
                campaignId={campaignId}
                session={{ id: selected.id, summary: selected.summary, isLive: selected.isLive }}
                dmUserId={user.id}
                displayNameByUserId={displayNameByUserId}
              />
            )}
          </View>
        </View>
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
  empty: { fontSize: 14, color: colors.textSecondary, textAlign: 'center' },

  webBody: { flex: 1, flexDirection: 'row' },
  nativeBody: { flex: 1, flexDirection: 'column' },
  dockHost: { flex: 1 },
});
