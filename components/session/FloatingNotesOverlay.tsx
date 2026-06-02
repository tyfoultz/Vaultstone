import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Pressable, StyleSheet, ActivityIndicator, Platform,
  Modal, ScrollView, useWindowDimensions,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  getMySessionNote, upsertSessionNote, getAllSessionNotes,
} from '@vaultstone/api';
import { colors, spacing, radius, Text, GhostButton } from '@vaultstone/ui';
import { RichTextEditor } from '../notes/RichTextEditor';

type NoteRow = {
  user_id: string;
  body: string;
  updated_at: string | null;
  display_name: string;
};

interface Props {
  sessionId: string;
  userId: string;
  campaignId: string;
  isDM: boolean;
  readOnly?: boolean;
  memberNames?: Map<string, string>;
  onClose: () => void;
}

function formatSavedAt(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

type Tab = 'mine' | 'all';

export function FloatingNotesOverlay({
  sessionId, userId, campaignId, isDM, readOnly = false, memberNames, onClose,
}: Props) {
  const { width: screenW, height: screenH } = useWindowDimensions();
  const isMobile = screenW < 768;

  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('mine');
  const [allNotes, setAllNotes] = useState<NoteRow[]>([]);
  const [allLoading, setAllLoading] = useState(false);

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

  const scheduleSave = useCallback((next: string) => {
    if (readOnly) return;
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
  }, [sessionId, userId, readOnly]);

  useEffect(() => {
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, []);

  function handleChange(text: string) {
    setBody(text);
    scheduleSave(text);
  }

  const loadAllNotes = useCallback(async () => {
    setAllLoading(true);
    const { data } = await getAllSessionNotes(sessionId);
    if (data) {
      setAllNotes(
        data.map((r) => ({
          user_id: r.user_id,
          body: r.body,
          updated_at: r.updated_at,
          display_name: memberNames?.get(r.user_id) ?? 'Unknown',
        })),
      );
    }
    setAllLoading(false);
  }, [sessionId, memberNames]);

  useEffect(() => {
    if (tab === 'all' && isDM) void loadAllNotes();
  }, [tab, isDM, loadAllNotes]);

  function handlePopOut() {
    if (Platform.OS === 'web') {
      const url = `/campaign/${campaignId}/notes`;
      window.open(url, 'vaultstone-notes', 'width=520,height=700');
    }
  }

  const savedLabel = saving
    ? 'Saving…'
    : savedAt
      ? `Saved ${formatSavedAt(savedAt)}`
      : '';

  const panelContent = (
    <View style={[
      styles.panel,
      isMobile ? styles.panelMobile : { width: 420, maxHeight: screenH * 0.7 },
    ]}>
      {/* Header */}
      <View style={styles.header}>
        <MaterialCommunityIcons name="notebook-outline" size={18} color={colors.primary} />
        <Text variant="label-md" weight="bold" style={{ color: colors.onSurface, flex: 1 }}>
          Session Notes
        </Text>
        {Platform.OS === 'web' ? (
          <Pressable onPress={handlePopOut} style={styles.iconBtn} hitSlop={8}>
            <MaterialCommunityIcons name="open-in-new" size={16} color={colors.onSurfaceVariant} />
          </Pressable>
        ) : null}
        <Pressable onPress={onClose} style={styles.iconBtn} hitSlop={8}>
          <MaterialCommunityIcons name="close" size={18} color={colors.onSurfaceVariant} />
        </Pressable>
      </View>

      {/* Tabs (DM only) */}
      {isDM ? (
        <View style={styles.tabRow}>
          <Pressable
            style={[styles.tab, tab === 'mine' && styles.tabActive]}
            onPress={() => setTab('mine')}
          >
            <Text variant="label-sm" weight={tab === 'mine' ? 'bold' : 'regular'}
              style={{ color: tab === 'mine' ? colors.primary : colors.onSurfaceVariant }}>
              My Notes
            </Text>
          </Pressable>
          <Pressable
            style={[styles.tab, tab === 'all' && styles.tabActive]}
            onPress={() => setTab('all')}
          >
            <Text variant="label-sm" weight={tab === 'all' ? 'bold' : 'regular'}
              style={{ color: tab === 'all' ? colors.primary : colors.onSurfaceVariant }}>
              All Notes
            </Text>
          </Pressable>
        </View>
      ) : null}

      {readOnly ? (
        <Text variant="label-sm" style={{ color: colors.hpWarning, fontStyle: 'italic', paddingHorizontal: spacing.md }}>
          Session ended — notes are read-only.
        </Text>
      ) : null}

      {/* Body */}
      <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: spacing.md }}>
        {tab === 'mine' ? (
          loading ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <RichTextEditor
              value={body}
              onChangeText={handleChange}
              readOnly={readOnly}
              placeholder="Jot down anything you want to remember…"
              minHeight={160}
            />
          )
        ) : (
          allLoading ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : allNotes.length === 0 ? (
            <Text variant="body-sm" style={{ color: colors.onSurfaceVariant, padding: spacing.md }}>
              No participant notes yet.
            </Text>
          ) : (
            allNotes.map((note) => (
              <View key={note.user_id} style={styles.noteCard}>
                <Text variant="label-sm" weight="bold" style={{ color: colors.primary, marginBottom: 4 }}>
                  {note.display_name}{note.user_id === userId ? ' (You)' : ''}
                </Text>
                {note.body ? (
                  <RichTextEditor
                    value={note.body}
                    onChangeText={() => {}}
                    readOnly
                    minHeight={60}
                  />
                ) : (
                  <Text variant="body-sm" style={{ color: colors.onSurfaceVariant, fontStyle: 'italic' }}>
                    No notes yet.
                  </Text>
                )}
                {note.updated_at ? (
                  <Text variant="label-sm" style={{ color: colors.onSurfaceVariant, marginTop: 4, textAlign: 'right' }}>
                    Last updated {formatSavedAt(note.updated_at)}
                  </Text>
                ) : null}
              </View>
            ))
          )
        )}
      </ScrollView>

      {/* Footer */}
      {tab === 'mine' ? (
        <View style={styles.footer}>
          <Text variant="label-sm" style={{ color: colors.onSurfaceVariant }}>{savedLabel}</Text>
        </View>
      ) : (
        <View style={styles.footer}>
          <GhostButton label="Refresh" icon="refresh" onPress={loadAllNotes} />
        </View>
      )}
    </View>
  );

  if (isMobile) {
    return (
      <Modal visible transparent animationType="slide" onRequestClose={onClose}>
        <Pressable style={styles.backdrop} onPress={onClose}>
          <Pressable onPress={(e) => e.stopPropagation()} style={styles.mobileSheet}>
            {panelContent}
          </Pressable>
        </Pressable>
      </Modal>
    );
  }

  return (
    <View style={styles.floatingWrap}>
      {panelContent}
    </View>
  );
}

const styles = StyleSheet.create({
  floatingWrap: {
    position: 'absolute',
    bottom: spacing.lg,
    right: spacing.lg,
    zIndex: 100,
    ...Platform.select({
      web: { boxShadow: '0 8px 32px rgba(0,0,0,0.5)' } as any,
    }),
  },
  panel: {
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '44',
    overflow: 'hidden',
  },
  panelMobile: {
    flex: 1,
    borderRadius: 0,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant + '33',
  },
  iconBtn: { padding: 4 },
  tabRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant + '33',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
  },
  body: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    maxHeight: 400,
  },
  center: {
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noteCard: {
    backgroundColor: colors.surfaceContainer,
    borderRadius: radius.lg,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant + '22',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  mobileSheet: {
    maxHeight: '85%',
  },
});
