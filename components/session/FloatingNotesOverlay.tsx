import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Pressable, StyleSheet, ActivityIndicator, Platform,
  Modal, ScrollView, useWindowDimensions,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  getMySessionNote, upsertSessionNote, getAllSessionNotes,
  setSessionNoteShared, getSharedSessionNote, supabase,
} from '@vaultstone/api';
import { colors, spacing, radius, Text, GhostButton } from '@vaultstone/ui';
import { RichTextEditor } from '../notes/RichTextEditor';

type NoteRow = {
  user_id: string;
  body: string;
  updated_at: string | null;
  display_name: string;
};

export type PanelPos = { x: number; y: number };

interface Props {
  sessionId: string;
  userId: string;
  campaignId: string;
  isDM: boolean;
  readOnly?: boolean;
  memberNames?: Map<string, string>;
  position?: PanelPos | null;
  onPositionChange?: (pos: PanelPos) => void;
  onClose: () => void;
}

function formatSavedAt(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  let hh = d.getHours();
  const ampm = hh >= 12 ? 'PM' : 'AM';
  hh = hh % 12 || 12;
  const mm = d.getMinutes().toString().padStart(2, '0');
  return `${hh}:${mm} ${ampm}`;
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

type Tab = 'mine' | 'all' | 'shared';

const PANEL_W = 420;

export function FloatingNotesOverlay({
  sessionId, userId, campaignId, isDM, readOnly = false, memberNames,
  position: externalPos, onPositionChange, onClose,
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
  // DM's own share flag (whether their note is shared with the table)
  // and the shared note as seen by players.
  const [shared, setShared] = useState(false);
  const [sharingBusy, setSharingBusy] = useState(false);
  const [sharedNote, setSharedNote] = useState<NoteRow | null>(null);
  const [sharedLoading, setSharedLoading] = useState(false);

  const defaultPos = { x: screenW - PANEL_W - 24, y: screenH - 520 };
  const pos = externalPos ?? defaultPos;
  const dragging = useRef(false);
  const dragOffset = useRef({ dx: 0, dy: 0 });

  const setPos = useCallback((next: PanelPos) => {
    onPositionChange?.(next);
  }, [onPositionChange]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (isMobile) return;
    dragging.current = true;
    dragOffset.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }, [isMobile, pos]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    const nx = clamp(e.clientX - dragOffset.current.dx, 0, screenW - PANEL_W);
    const ny = clamp(e.clientY - dragOffset.current.dy, 0, screenH - 100);
    setPos({ x: nx, y: ny });
  }, [screenW, screenH, setPos]);

  const onPointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getMySessionNote(sessionId, userId).then((row) => {
      if (cancelled) return;
      setBody(row.body ?? '');
      setSavedAt(row.updated_at ?? null);
      setShared(row.shared ?? false);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [sessionId, userId]);

  // The shared (DM) note players can read. Loaded on demand for the
  // "Shared" tab and refreshed live via the session_notes Realtime
  // subscription below.
  const loadSharedNote = useCallback(async () => {
    setSharedLoading(true);
    const row = await getSharedSessionNote(sessionId);
    setSharedNote(
      row
        ? {
            user_id: row.user_id,
            body: row.body,
            updated_at: row.updated_at,
            display_name: memberNames?.get(row.user_id) ?? 'Dungeon Master',
          }
        : null,
    );
    setSharedLoading(false);
  }, [sessionId, memberNames]);

  // Realtime: when any session_notes row for this session changes,
  // refresh whatever shared/all view is open so players see the DM's
  // shared note update live (and the DM's "All Notes" stays current).
  useEffect(() => {
    const suffix = Math.random().toString(36).slice(2, 10);
    const channel = supabase
      .channel(`session-notes-${sessionId}-${suffix}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'session_notes', filter: `session_id=eq.${sessionId}` },
        () => {
          if (!isDM) void loadSharedNote();
          else if (tab === 'all') void loadAllNotes();
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, isDM, tab]);

  async function toggleShared() {
    if (sharingBusy) return;
    const next = !shared;
    setSharingBusy(true);
    setShared(next); // optimistic
    const { error } = await setSessionNoteShared(sessionId, userId, next);
    setSharingBusy(false);
    if (error) setShared(!next); // revert on failure
  }

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
    if (tab === 'shared' && !isDM) void loadSharedNote();
  }, [tab, isDM, loadAllNotes, loadSharedNote]);

  const savedLabel = saving
    ? 'Saving…'
    : savedAt
      ? `Saved ${formatSavedAt(savedAt)}`
      : '';

  const panelContent = (
    <View style={[
      styles.panel,
      isMobile ? styles.panelMobile : { width: PANEL_W, maxHeight: screenH * 0.7 },
    ]}>
      {/* Header — drag handle on web */}
      <View
        style={[styles.header, !isMobile && styles.headerDraggable]}
        {...(Platform.OS === 'web' && !isMobile ? {
          onPointerDown: onPointerDown as any,
          onPointerMove: onPointerMove as any,
          onPointerUp: onPointerUp as any,
        } : {})}
      >
        <MaterialCommunityIcons name="notebook-outline" size={18} color={colors.primary} />
        <Text variant="label-md" weight="bold" style={{ color: colors.onSurface, flex: 1 }}>
          Session Notes
        </Text>
        <Pressable onPress={onClose} style={styles.iconBtn} hitSlop={8}>
          <MaterialCommunityIcons name="window-minimize" size={18} color={colors.onSurfaceVariant} />
        </Pressable>
      </View>

      {/* Tabs — DM: My Notes / All Notes. Player: My Notes / Shared
          (the note the DM has chosen to surface to the table). */}
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
        {isDM ? (
          <Pressable
            style={[styles.tab, tab === 'all' && styles.tabActive]}
            onPress={() => setTab('all')}
          >
            <Text variant="label-sm" weight={tab === 'all' ? 'bold' : 'regular'}
              style={{ color: tab === 'all' ? colors.primary : colors.onSurfaceVariant }}>
              All Notes
            </Text>
          </Pressable>
        ) : (
          <Pressable
            style={[styles.tab, tab === 'shared' && styles.tabActive]}
            onPress={() => setTab('shared')}
          >
            <Text variant="label-sm" weight={tab === 'shared' ? 'bold' : 'regular'}
              style={{ color: tab === 'shared' ? colors.primary : colors.onSurfaceVariant }}>
              Shared
            </Text>
          </Pressable>
        )}
      </View>

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
        ) : tab === 'shared' ? (
          sharedLoading ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : sharedNote && sharedNote.body ? (
            <View style={styles.noteCard}>
              <Text variant="label-sm" weight="bold" style={{ color: colors.primary, marginBottom: 4 }}>
                {sharedNote.display_name}
              </Text>
              <RichTextEditor value={sharedNote.body} onChangeText={() => {}} readOnly minHeight={60} />
              {sharedNote.updated_at ? (
                <Text variant="label-sm" style={{ color: colors.onSurfaceVariant, marginTop: 4, textAlign: 'right' }}>
                  Updated {formatSavedAt(sharedNote.updated_at)}
                </Text>
              ) : null}
            </View>
          ) : (
            <Text variant="body-sm" style={{ color: colors.onSurfaceVariant, padding: spacing.md, fontStyle: 'italic' }}>
              The DM hasn't shared any notes with the table yet.
            </Text>
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
          {/* DM-only: surface this note to the whole table, read-only.
              Players see it live under their "Shared" tab. */}
          {isDM && !readOnly ? (
            <Pressable
              onPress={toggleShared}
              disabled={sharingBusy}
              style={[styles.shareToggle, shared && styles.shareToggleOn]}
              hitSlop={6}
            >
              <MaterialCommunityIcons
                name={shared ? 'eye-check' : 'eye-off-outline'}
                size={14}
                color={shared ? colors.primary : colors.onSurfaceVariant}
              />
              <Text variant="label-sm" weight="bold"
                style={{ color: shared ? colors.primary : colors.onSurfaceVariant }}>
                {shared ? 'Shared with players' : 'Share with players'}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : tab === 'shared' ? (
        <View style={styles.footer}>
          <GhostButton label="Refresh" icon="refresh" onPress={loadSharedNote} />
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
    <View style={[styles.floatingWrap, { left: pos.x, top: pos.y }]}>
      {panelContent}
    </View>
  );
}

const styles = StyleSheet.create({
  floatingWrap: {
    position: 'absolute',
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
  headerDraggable: {
    ...Platform.select({
      web: { cursor: 'grab', userSelect: 'none' } as any,
    }),
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
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant + '22',
  },
  shareToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '55',
  },
  shareToggleOn: {
    borderColor: colors.primary + '88',
    backgroundColor: colors.primary + '14',
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
