import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, ScrollView,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { supabase, getSessionEvents } from '@vaultstone/api';
import { colors, spacing } from '@vaultstone/ui';
import { SessionLogRow, type LogRowData } from './SessionLogRow';

type Variant = 'full' | 'compact';

interface Props {
  sessionId: string;
  isLive: boolean;
  variant?: Variant;
  maxRows?: number;
  title?: string;
}

export function SessionLogFeed({
  sessionId, isLive, variant = 'full', maxRows, title,
}: Props) {
  const [rows, setRows] = useState<LogRowData[] | null>(null);
  const [collapsed, setCollapsed] = useState(variant === 'compact');
  const seenIds = useRef<Set<string>>(new Set());
  const bottomRef = useRef<ScrollView | null>(null);

  const resetFromDb = useCallback(async () => {
    const events = await getSessionEvents(sessionId);
    seenIds.current = new Set(events.map((e) => e.id));
    setRows(events.map((e) => ({
      id: e.id,
      eventType: e.event_type,
      createdAt: e.created_at,
      payload: e.payload,
    })));
  }, [sessionId]);

  // Refetch on focus — covers edit/publish flows on the campaign page
  // and catches up anything missed while the screen was backgrounded.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        if (cancelled) return;
        await resetFromDb();
      })();
      return () => { cancelled = true; };
    }, [resetFromDb]),
  );

  // Live append via Realtime. Only subscribe when the session is live —
  // ended sessions don't get new events, so we save a channel.
  useEffect(() => {
    if (!isLive) return;
    const channel = supabase
      .channel(`session-log:${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'session_events',
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          const next = payload.new as {
            id: string; event_type: string; created_at: string; payload: unknown;
          };
          if (seenIds.current.has(next.id)) return;
          seenIds.current.add(next.id);
          setRows((prev) => [
            ...(prev ?? []),
            {
              id: next.id,
              eventType: next.event_type,
              createdAt: next.created_at,
              payload: next.payload,
            },
          ]);
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [sessionId, isLive]);

  // Auto-scroll to the newest row on change when the full feed is open.
  useEffect(() => {
    if (variant !== 'full' || collapsed || !rows) return;
    bottomRef.current?.scrollToEnd({ animated: true });
  }, [rows, variant, collapsed]);

  if (rows === null) {
    return (
      <View style={[s.card, variant === 'compact' && s.cardCompact]}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  const visible = maxRows ? rows.slice(-maxRows) : rows;
  const effectiveTitle = title ?? (isLive ? 'Session Log' : 'Session Log · ended');

  return (
    <View style={[s.card, variant === 'compact' && s.cardCompact]}>
      <TouchableOpacity
        style={s.header}
        onPress={() => setCollapsed((c) => !c)}
        activeOpacity={0.7}
      >
        <MaterialCommunityIcons name="timeline-text-outline" size={20} color={colors.brand} />
        <Text style={s.label}>{effectiveTitle}</Text>
        <View style={s.badge}>
          <Text style={s.badgeText}>{rows.length}</Text>
        </View>
        {isLive && <View style={s.livePill}><Text style={s.livePillText}>LIVE</Text></View>}
        <View style={{ flex: 1 }} />
        <MaterialCommunityIcons
          name={collapsed ? 'chevron-down' : 'chevron-up'}
          size={20}
          color={colors.textSecondary}
        />
      </TouchableOpacity>

      {!collapsed && (
        rows.length === 0 ? (
          <Text style={s.empty}>
            {isLive ? 'No events yet. Actions in Combat will land here.' : 'No events were logged.'}
          </Text>
        ) : (
          <ScrollView
            ref={bottomRef}
            style={variant === 'full' ? s.listFull : s.listCompact}
            nestedScrollEnabled
            showsVerticalScrollIndicator
          >
            {visible.map((row) => (
              <SessionLogRow key={row.id} row={row} compact={variant === 'compact'} />
            ))}
          </ScrollView>
        )
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border, borderWidth: 1, borderRadius: 14,
    padding: spacing.md, gap: spacing.sm,
  },
  cardCompact: { padding: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  label: {
    fontSize: 12, color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 1, fontWeight: '700',
  },
  badge: {
    backgroundColor: colors.background,
    borderColor: colors.border, borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 6, paddingVertical: 1,
  },
  badgeText: { fontSize: 11, color: colors.textSecondary, fontWeight: '700' },
  livePill: {
    backgroundColor: colors.hpDanger, borderRadius: 10,
    paddingHorizontal: 6, paddingVertical: 1,
  },
  livePillText: { fontSize: 10, color: '#fff', fontWeight: '800', letterSpacing: 0.5 },
  empty: { color: colors.textSecondary, fontSize: 12, paddingVertical: spacing.sm },
  listFull: { maxHeight: 320 },
  listCompact: { maxHeight: 160 },
});
