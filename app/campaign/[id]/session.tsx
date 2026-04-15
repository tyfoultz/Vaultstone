import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  supabase, getActiveSession, endSession,
} from '@vaultstone/api';
import { useAuthStore, useCampaignStore } from '@vaultstone/store';
import { colors, spacing } from '@vaultstone/ui';
import type { Database } from '@vaultstone/types';

type Session = Database['public']['Tables']['sessions']['Row'];
type Campaign = Database['public']['Tables']['campaigns']['Row'];

export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const { campaigns } = useCampaignStore();

  const [session, setSession] = useState<Session | null>(null);
  const [campaign, setCampaign] = useState<Campaign | null>(
    campaigns.find((c) => c.id === id) ?? null,
  );
  const [loading, setLoading] = useState(true);
  const [ending, setEnding] = useState(false);

  const isDM = campaign?.dm_user_id === user?.id;

  // Load the active session + campaign on focus.
  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      let cancelled = false;
      (async () => {
        const { data: s } = await getActiveSession(id);
        if (cancelled) return;
        if (!s) {
          // No active session — bounce back to campaign detail.
          router.replace(`/campaign/${id}` as never);
          return;
        }
        setSession(s);
        if (!campaign) {
          const { data: c } = await supabase
            .from('campaigns').select('*').eq('id', id).single();
          if (!cancelled && c) setCampaign(c);
        }
        setLoading(false);
      })();
      return () => { cancelled = true; };
    }, [id])
  );

  // Subscribe to the sessions row — when DM ends the session, everyone else
  // sees ended_at flip non-null and we send them back to the campaign.
  useEffect(() => {
    if (!session) return;
    const channel = supabase
      .channel(`session:${session.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'sessions',
          filter: `id=eq.${session.id}`,
        },
        (payload) => {
          const next = payload.new as Session;
          if (next.ended_at) {
            router.replace(`/campaign/${id}` as never);
          } else {
            setSession(next);
          }
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [session?.id]);

  async function handleEnd() {
    if (!session || ending) return;

    const confirmed = Platform.OS === 'web'
      // eslint-disable-next-line no-alert
      ? window.confirm('End this session? Combat state will be cleared.')
      : await new Promise<boolean>((resolve) => {
          Alert.alert(
            'End Session?',
            'Combat state will be cleared.',
            [
              { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
              { text: 'End Session', style: 'destructive', onPress: () => resolve(true) },
            ],
          );
        });
    if (!confirmed) return;

    setEnding(true);
    const { error } = await endSession(session.id);
    setEnding(false);
    if (!error) router.replace(`/campaign/${id}` as never);
  }

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  if (!session) return null;

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.headerBack}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.title} numberOfLines={1}>
            {campaign?.name ?? 'Session'}
          </Text>
          <Text style={s.subtitle}>Round {session.round}</Text>
        </View>
        {isDM && (
          <TouchableOpacity
            style={[s.endBtn, ending && { opacity: 0.5 }]}
            onPress={handleEnd}
            disabled={ending}
          >
            <Text style={s.endBtnText}>{ending ? 'Ending…' : 'End Session'}</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={s.placeholder}>
        <MaterialCommunityIcons name="sword-cross" size={48} color={colors.textSecondary} />
        <Text style={s.placeholderTitle}>Combat not started</Text>
        <Text style={s.placeholderBody}>
          Initiative tracker and live HP sync land in Phase 2.
        </Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1, backgroundColor: colors.background,
    alignItems: 'center', justifyContent: 'center',
  },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    borderBottomColor: colors.border, borderBottomWidth: 1,
    backgroundColor: colors.surface,
  },
  headerBack: { padding: 4 },
  title: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  subtitle: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  endBtn: {
    borderColor: colors.hpDanger, borderWidth: 1, borderRadius: 8,
    paddingHorizontal: spacing.md, paddingVertical: 6,
  },
  endBtnText: { color: colors.hpDanger, fontSize: 13, fontWeight: '700' },

  placeholder: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm, paddingHorizontal: spacing.lg,
  },
  placeholderTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  placeholderBody: {
    fontSize: 13, color: colors.textSecondary, textAlign: 'center', lineHeight: 18,
  },
});
