import { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getCampaignSessionHistory, getSessionNotes } from '@vaultstone/api';
import { colors, spacing } from '@vaultstone/ui';
import { RichTextRenderer } from '../notes/RichTextRenderer';

interface Props {
  campaignId: string;
  displayNameByUserId: Record<string, string>;
}

interface HistoryRow {
  id: string;
  started_at: string;
  ended_at: string | null;
  summary: string | null;
  round: number;
}

interface NoteRow {
  user_id: string;
  body: string;
  updated_at: string;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtDuration(startIso: string, endIso: string | null): string {
  if (!endIso) return '';
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  const mins = Math.max(0, Math.round(ms / 60000));
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem === 0 ? `${hrs}h` : `${hrs}h ${rem}m`;
}

export function SessionHistoryCard({ campaignId, displayNameByUserId }: Props) {
  const [rows, setRows] = useState<HistoryRow[] | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, NoteRow[] | 'loading'>>({});

  useEffect(() => {
    let cancelled = false;
    getCampaignSessionHistory(campaignId).then(({ data }) => {
      if (cancelled) return;
      setRows((data ?? []) as HistoryRow[]);
    });
    return () => { cancelled = true; };
  }, [campaignId]);

  async function toggle(sessionId: string) {
    if (expanded === sessionId) {
      setExpanded(null);
      return;
    }
    setExpanded(sessionId);
    if (!notes[sessionId]) {
      setNotes((prev) => ({ ...prev, [sessionId]: 'loading' }));
      const { data } = await getSessionNotes(sessionId);
      setNotes((prev) => ({ ...prev, [sessionId]: (data ?? []) as NoteRow[] }));
    }
  }

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <MaterialCommunityIcons name="history" size={24} color={colors.brand} />
        <Text style={styles.label}>Session History</Text>
      </View>

      {rows === null ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : rows.length === 0 ? (
        <Text style={styles.empty}>No past sessions yet.</Text>
      ) : (
        <ScrollView
          style={styles.list}
          contentContainerStyle={{ paddingBottom: 4 }}
          nestedScrollEnabled
          showsVerticalScrollIndicator
        >
          {rows.map((r) => {
            const isOpen = expanded === r.id;
            const sessionNotes = notes[r.id];
            return (
              <View key={r.id} style={styles.row}>
                <TouchableOpacity onPress={() => toggle(r.id)} style={styles.rowHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowDate}>{fmtDate(r.started_at)}</Text>
                    <Text style={styles.rowMeta} numberOfLines={1}>
                      {fmtDuration(r.started_at, r.ended_at)}
                      {r.summary ? ` · ${r.summary}` : ' · No recap'}
                    </Text>
                  </View>
                  <MaterialCommunityIcons
                    name={isOpen ? 'chevron-up' : 'chevron-down'}
                    size={20}
                    color={colors.textSecondary}
                  />
                </TouchableOpacity>

                {isOpen && (
                  <View style={styles.expanded}>
                    {r.summary && (
                      <View style={styles.summaryBlock}>
                        <Text style={styles.blockLabel}>Recap</Text>
                        <RichTextRenderer value={r.summary} />
                      </View>
                    )}

                    {sessionNotes === 'loading' || sessionNotes === undefined ? (
                      <ActivityIndicator color={colors.brand} style={{ marginVertical: 8 }} />
                    ) : sessionNotes.length === 0 ? (
                      <Text style={styles.empty}>No notes from this session.</Text>
                    ) : (
                      sessionNotes.map((n) => (
                        <View key={n.user_id} style={styles.noteBlock}>
                          <Text style={styles.blockLabel}>
                            {displayNameByUserId[n.user_id] ?? 'Unknown'}
                          </Text>
                          <RichTextRenderer value={n.body} />
                        </View>
                      ))
                    )}
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border, borderWidth: 1, borderRadius: 14,
    padding: spacing.md, flex: 1, flexBasis: 160, minWidth: 160,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  label: {
    fontSize: 12, color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 1,
  },
  loadingBox: { paddingVertical: spacing.md, alignItems: 'center' },
  empty: { fontSize: 13, color: colors.textSecondary, marginTop: 4 },
  list: { maxHeight: 440, marginTop: spacing.sm },
  row: { borderBottomColor: colors.border, borderBottomWidth: 1 },
  rowHeader: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: 10,
  },
  rowDate: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  rowMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  expanded: { paddingBottom: spacing.md, gap: spacing.sm },
  summaryBlock: {
    backgroundColor: colors.background,
    borderRadius: 8, padding: spacing.sm, gap: 4,
  },
  noteBlock: {
    backgroundColor: colors.background,
    borderRadius: 8, padding: spacing.sm, gap: 4,
  },
  blockLabel: {
    fontSize: 11, color: colors.brand, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
});
