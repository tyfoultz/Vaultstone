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

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

type Tab = 'mine' | 'all';

const PANEL_W = 420;

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

  // Drag state (web only) — position is (x, y) from top-left of the viewport.
  // Initialised to null so we can default to bottom-right on first render.
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragging = useRef(false);
  const dragOffset = useRef({ dx: 0, dy: 0 });

  useEffect(() => {
    if (!isMobile && pos === null) {
      setPos({ x: screenW - PANEL_W - 24, y: screenH - 520 });
    }
  }, [isMobile, pos, screenW, screenH]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (isMobile) return;
    dragging.current = true;
    const cur = pos ?? { x: screenW - PANEL_W - 24, y: screenH - 520 };
    dragOffset.current = { dx: e.clientX - cur.x, dy: e.clientY - cur.y };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }, [isMobile, pos, screenW, screenH]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    const nx = clamp(e.clientX - dragOffset.current.dx, 0, screenW - PANEL_W);
    const ny = clamp(e.clientY - dragOffset.current.dy, 0, screenH - 100);
    setPos({ x: nx, y: ny });
  }, [screenW, screenH]);

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

  const position = pos ?? { x: screenW - PANEL_W - 24, y: screenH - 520 };

  return (
    <View style={[styles.floatingWrap, { left: position.x, top: position.y }]}>
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
