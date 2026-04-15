import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  supabase,
  getCampaignMembers, getCampaignSessionHistory, getActiveSession,
  getSessionNotes, getMySessionNote, upsertSessionNote, updateSessionSummary,
} from '@vaultstone/api';
import { useAuthStore, useRecapDraftStore } from '@vaultstone/store';
import { colors, spacing } from '@vaultstone/ui';
import { RichTextEditor } from '../../../components/notes/RichTextEditor';
import { RichTextRenderer } from '../../../components/notes/RichTextRenderer';

interface SessionRow {
  id: string;
  started_at: string;
  ended_at: string | null;
  summary: string | null;
  round: number;
}

interface ParticipantNote {
  user_id: string;
  body: string;
  updated_at: string | null;
}

function fmtSessionLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtSavedAt(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  return `${hh}:${mm}`;
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

  // Initial load: verify DM, fetch sessions and members.
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
      for (const m of (membersRes.data ?? []) as unknown as Array<{ user_id: string; profiles: { display_name: string | null } | null }>) {
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

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Campaign Notes Hub</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={Platform.OS === 'web'}
      >
        {allSessions.length === 0 ? (
          <Text style={styles.empty}>No sessions yet. Start one from the campaign page.</Text>
        ) : (
          <>
            <SessionPicker
              sessions={allSessions}
              selectedId={selectedSessionId}
              onSelect={setSelectedSessionId}
            />

            {selected && user && (
              <SessionPanel
                session={selected}
                dmUserId={user.id}
                displayNameByUserId={displayNameByUserId}
              />
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

interface SessionPickerProps {
  sessions: Array<SessionRow & { isLive: boolean }>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function SessionPicker({ sessions, selectedId, onSelect }: SessionPickerProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.pickerRow}
    >
      {sessions.map((s) => {
        const isSelected = s.id === selectedId;
        return (
          <TouchableOpacity
            key={s.id}
            onPress={() => onSelect(s.id)}
            style={[styles.chip, isSelected && styles.chipSelected]}
          >
            {s.isLive && (
              <View style={styles.livePill}>
                <Text style={styles.livePillText}>LIVE</Text>
              </View>
            )}
            <Text style={[styles.chipLabel, isSelected && styles.chipLabelSelected]}>
              {fmtSessionLabel(s.started_at)}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

interface SessionPanelProps {
  session: SessionRow & { isLive: boolean };
  dmUserId: string;
  displayNameByUserId: Record<string, string>;
}

function SessionPanel({ session, dmUserId, displayNameByUserId }: SessionPanelProps) {
  const draft = useRecapDraftStore((s) => s.bySessionId[session.id] ?? null);
  const setDraft = useRecapDraftStore((s) => s.setDraft);
  const clearDraft = useRecapDraftStore((s) => s.clearDraft);

  // Recap starts from the draft if present, else the published summary, else blank.
  const [recapBody, setRecapBody] = useState<string>(draft ?? session.summary ?? '');
  const [publishing, setPublishing] = useState(false);
  const [publishedAt, setPublishedAt] = useState<string | null>(null);

  useEffect(() => {
    setRecapBody(draft ?? session.summary ?? '');
    setPublishedAt(null);
  }, [session.id, draft, session.summary]);

  function handleRecapChange(next: string) {
    setRecapBody(next);
    setDraft(session.id, next);
  }

  async function handlePublish() {
    setPublishing(true);
    const { error } = await updateSessionSummary(session.id, recapBody);
    setPublishing(false);
    if (!error) {
      clearDraft(session.id);
      setPublishedAt(new Date().toISOString());
    }
  }

  const isDirty = (draft ?? '') !== (session.summary ?? '');

  return (
    <View style={styles.panel}>
      <SectionHeader
        icon="text-box-outline"
        label="Recap"
        hint={session.isLive ? 'In progress — Publish after the session ends for the cleanest history entry.' : null}
      />
      <RichTextEditor
        value={recapBody}
        onChangeText={handleRecapChange}
        placeholder="Write the recap for this session…"
        minHeight={180}
      />
      <View style={styles.footerRow}>
        <Text style={styles.savedLabel}>
          {publishing
            ? 'Publishing…'
            : publishedAt
              ? `Published ${fmtSavedAt(publishedAt)}`
              : isDirty
                ? 'Draft · unpublished changes'
                : session.summary
                  ? 'Published'
                  : ''}
        </Text>
        <TouchableOpacity
          onPress={handlePublish}
          disabled={publishing || recapBody.trim().length === 0}
          style={[
            styles.publishBtn,
            (publishing || recapBody.trim().length === 0) && styles.publishBtnDisabled,
          ]}
        >
          <MaterialCommunityIcons name="send" size={14} color={colors.textPrimary} />
          <Text style={styles.publishBtnText}>Publish to History</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.hr} />

      <SectionHeader
        icon="notebook-outline"
        label="Your Session Notes"
        hint={session.isLive
          ? 'Edits here land on your session_notes row immediately.'
          : 'You can keep editing your own notes after the session ends.'}
      />
      <DmNotesEditor sessionId={session.id} userId={dmUserId} />

      <View style={styles.hr} />

      <SectionHeader
        icon="account-multiple-outline"
        label="Player Notes"
        hint={session.isLive
          ? 'Player notes are hidden until the session ends.'
          : null}
      />
      <ParticipantNotes
        sessionId={session.id}
        isLive={session.isLive}
        excludeUserId={dmUserId}
        displayNameByUserId={displayNameByUserId}
      />
    </View>
  );
}

interface DmNotesEditorProps {
  sessionId: string;
  userId: string;
}

function DmNotesEditor({ sessionId, userId }: DmNotesEditorProps) {
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getMySessionNote(sessionId, userId).then((row) => {
      if (cancelled) return;
      setBody(row.body ?? '');
      setSavedAt(row.updated_at ?? null);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [sessionId, userId]);

  useEffect(() => {
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, []);

  const scheduleSave = useCallback((next: string) => {
    pendingRef.current = next;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const toSave = pendingRef.current;
      if (toSave === null) return;
      pendingRef.current = null;
      setSaving(true);
      const { error } = await upsertSessionNote(sessionId, userId, toSave);
      setSaving(false);
      if (!error) setSavedAt(new Date().toISOString());
    }, 500);
  }, [sessionId, userId]);

  function handleChange(next: string) {
    setBody(next);
    scheduleSave(next);
  }

  if (loading) {
    return <View style={styles.loadingBox}><ActivityIndicator color={colors.brand} /></View>;
  }

  const savedLabel = saving ? 'Saving…' : savedAt ? `Saved ${fmtSavedAt(savedAt)}` : '';

  return (
    <>
      <RichTextEditor
        value={body}
        onChangeText={handleChange}
        placeholder="Your notes for this session…"
        minHeight={140}
      />
      <View style={styles.footerRow}>
        <Text style={styles.savedLabel}>{savedLabel}</Text>
      </View>
    </>
  );
}

interface ParticipantNotesProps {
  sessionId: string;
  isLive: boolean;
  excludeUserId: string;
  displayNameByUserId: Record<string, string>;
}

function ParticipantNotes({
  sessionId, isLive, excludeUserId, displayNameByUserId,
}: ParticipantNotesProps) {
  const [notes, setNotes] = useState<ParticipantNote[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setNotes(null);
    getSessionNotes(sessionId).then(({ data }) => {
      if (cancelled) return;
      setNotes((data ?? []) as ParticipantNote[]);
    });
    return () => { cancelled = true; };
  }, [sessionId]);

  if (isLive) {
    return (
      <Text style={styles.lockedNotice}>
        Other players&apos; notes become visible after the session ends.
      </Text>
    );
  }

  if (notes === null) {
    return <View style={styles.loadingBox}><ActivityIndicator color={colors.brand} /></View>;
  }

  const others = notes.filter((n) => n.user_id !== excludeUserId);

  if (others.length === 0) {
    return <Text style={styles.empty}>No player notes from this session.</Text>;
  }

  return (
    <View style={{ gap: spacing.sm }}>
      {others.map((n) => (
        <View key={n.user_id} style={styles.noteBlock}>
          <Text style={styles.blockLabel}>
            {displayNameByUserId[n.user_id] ?? 'Unknown'}
          </Text>
          <RichTextRenderer value={n.body} />
        </View>
      ))}
    </View>
  );
}

interface SectionHeaderProps {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
  hint?: string | null;
}

function SectionHeader({ icon, label, hint }: SectionHeaderProps) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionHeaderRow}>
        <MaterialCommunityIcons name={icon} size={18} color={colors.brand} />
        <Text style={styles.sectionLabel}>{label}</Text>
      </View>
      {hint && <Text style={styles.sectionHint}>{hint}</Text>}
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
  scroll: { flex: 1 },
  scrollContent: { padding: spacing.lg, gap: spacing.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  empty: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.md },

  pickerRow: { gap: spacing.sm, paddingVertical: 4 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: 20,
    borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipSelected: {
    borderColor: colors.brand,
    backgroundColor: colors.brand + '22',
  },
  chipLabel: { fontSize: 13, color: colors.textSecondary, fontWeight: '600' },
  chipLabelSelected: { color: colors.textPrimary },
  livePill: {
    backgroundColor: colors.brand,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
  },
  livePillText: {
    color: colors.textPrimary, fontSize: 9, fontWeight: '800',
    letterSpacing: 0.8,
  },

  panel: {
    backgroundColor: colors.surface,
    borderColor: colors.border, borderWidth: 1, borderRadius: 14,
    padding: spacing.md, gap: spacing.sm,
  },
  sectionHeader: { gap: 2 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sectionLabel: {
    fontSize: 12, color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 1, fontWeight: '700',
  },
  sectionHint: { fontSize: 12, color: colors.textSecondary, fontStyle: 'italic' },

  hr: { height: 1, backgroundColor: colors.border, marginVertical: spacing.xs },

  footerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: spacing.sm,
  },
  savedLabel: { fontSize: 12, color: colors.textSecondary, flex: 1 },
  publishBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.brand,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: 8,
  },
  publishBtnDisabled: { opacity: 0.5 },
  publishBtnText: {
    color: colors.textPrimary, fontSize: 13, fontWeight: '700',
  },

  loadingBox: { paddingVertical: spacing.md, alignItems: 'center' },
  lockedNotice: {
    fontSize: 13, color: colors.textSecondary, fontStyle: 'italic',
    padding: spacing.sm,
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
