import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getMySessionNote, upsertSessionNote } from '@vaultstone/api';
import { colors, spacing } from '@vaultstone/ui';
import { RichTextEditor } from '../notes/RichTextEditor';

interface Props {
  sessionId: string;
  userId: string;
  campaignId: string;
  readOnly?: boolean;
  layout?: 'rail' | 'fullscreen';
}

// Cross-window coordination: the pop-out (fullscreen) window owns the
// editor while open; the inline rail panel mirrors its content live and
// goes read-only. We use BroadcastChannel (web only) because Supabase
// Realtime didn't reliably deliver same-user session_notes updates to the
// other tab, and the single-editor model avoids split-brain conflicts.
type BCMessage =
  | { kind: 'hello'; from: 'fullscreen' }
  | { kind: 'body'; from: 'fullscreen'; value: string }
  | { kind: 'bye'; from: 'fullscreen' };

const PRESENCE_STALE_MS = 5_000;
const HEARTBEAT_MS = 2_000;

function formatSavedAt(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

function hasBroadcastChannel(): boolean {
  return Platform.OS === 'web'
    && typeof globalThis !== 'undefined'
    && typeof (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel === 'function';
}

export function SessionNotesPanel({
  sessionId, userId, campaignId,
  readOnly = false, layout = 'rail',
}: Props) {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [popoutActive, setPopoutActive] = useState(false);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<string | null>(null);
  const bodyRef = useRef<string>('');
  bodyRef.current = body;
  const bcRef = useRef<BroadcastChannel | null>(null);
  const lastPresenceAt = useRef<number>(0);

  const effectiveReadOnly = readOnly || (layout === 'rail' && popoutActive);

  // Initial load from DB.
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

  // Flush any pending debounced save to the DB immediately. The rail
  // panel calls this before handing control to the pop-out so the pop-out
  // loads the latest text, and the pop-out calls it on unmount so the
  // rail re-fetches the final state.
  const flushPending = useCallback(async () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const toSave = pendingRef.current;
    if (toSave === null) return;
    pendingRef.current = null;
    setSaving(true);
    const { error } = await upsertSessionNote(sessionId, userId, toSave);
    setSaving(false);
    if (!error) setSavedAt(new Date().toISOString());
  }, [sessionId, userId]);

  // BroadcastChannel: pop-out owns editing while open; rail mirrors.
  useEffect(() => {
    if (!hasBroadcastChannel()) return;
    const bc = new BroadcastChannel(`vaultstone-notes-${sessionId}-${userId}`);
    bcRef.current = bc;

    bc.onmessage = (ev) => {
      const msg = ev.data as BCMessage;
      if (!msg || msg.from !== 'fullscreen') return;
      if (layout === 'rail') {
        if (msg.kind === 'hello') {
          lastPresenceAt.current = Date.now();
          setPopoutActive((prev) => {
            if (!prev) { void flushPending(); }
            return true;
          });
        } else if (msg.kind === 'body') {
          lastPresenceAt.current = Date.now();
          setPopoutActive(true);
          if (msg.value !== bodyRef.current) setBody(msg.value);
        } else if (msg.kind === 'bye') {
          setPopoutActive(false);
          getMySessionNote(sessionId, userId).then((row) => {
            setBody(row.body ?? '');
            setSavedAt(row.updated_at ?? null);
          });
        }
      }
    };

    return () => {
      bc.close();
      bcRef.current = null;
    };
  }, [sessionId, userId, layout, flushPending]);

  // Pop-out: announce presence on mount, heartbeat, and say bye on unmount.
  useEffect(() => {
    if (layout !== 'fullscreen' || !hasBroadcastChannel()) return;
    const bc = bcRef.current;
    if (!bc) return;
    const hello = () => bc.postMessage({ kind: 'hello', from: 'fullscreen' } satisfies BCMessage);
    hello();
    const heartbeat = setInterval(hello, HEARTBEAT_MS);
    return () => {
      clearInterval(heartbeat);
      bc.postMessage({ kind: 'bye', from: 'fullscreen' } satisfies BCMessage);
      void flushPending();
    };
  }, [layout, flushPending]);

  // Rail: detect stale pop-out (tab closed without firing cleanup).
  useEffect(() => {
    if (layout !== 'rail' || !popoutActive) return;
    const t = setInterval(() => {
      if (Date.now() - lastPresenceAt.current > PRESENCE_STALE_MS) {
        setPopoutActive(false);
        getMySessionNote(sessionId, userId).then((row) => {
          setBody(row.body ?? '');
          setSavedAt(row.updated_at ?? null);
        });
      }
    }, 1_000);
    return () => clearInterval(t);
  }, [layout, popoutActive, sessionId, userId]);

  const scheduleSave = useCallback((next: string) => {
    if (effectiveReadOnly) return;
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
  }, [sessionId, userId, effectiveReadOnly]);

  useEffect(() => {
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, []);

  function handleChange(text: string) {
    setBody(text);
    scheduleSave(text);
    if (layout === 'fullscreen' && bcRef.current) {
      bcRef.current.postMessage({ kind: 'body', from: 'fullscreen', value: text } satisfies BCMessage);
    }
  }

  function handlePopOut() {
    if (Platform.OS === 'web') {
      const url = `/campaign/${campaignId}/notes`;
      window.open(url, 'vaultstone-notes', 'width=520,height=700');
    } else {
      router.push(`/campaign/${campaignId}/notes` as never);
    }
  }

  if (layout === 'rail' && collapsed) {
    return (
      <TouchableOpacity style={styles.collapsedTab} onPress={() => setCollapsed(false)}>
        <MaterialCommunityIcons name="notebook-outline" size={18} color={colors.brand} />
        <Text style={styles.collapsedLabel}>Notes</Text>
      </TouchableOpacity>
    );
  }

  const savedLabel = saving
    ? 'Saving…'
    : savedAt
      ? `Saved ${formatSavedAt(savedAt)}`
      : '';

  return (
    <View style={[
      styles.panel,
      layout === 'fullscreen' && styles.panelFull,
    ]}>
      <View style={styles.header}>
        <MaterialCommunityIcons name="notebook-outline" size={18} color={colors.brand} />
        <Text style={styles.title}>My Session Notes</Text>
        <View style={{ flex: 1 }} />
        {layout === 'rail' && (
          <>
            <TouchableOpacity onPress={handlePopOut} style={styles.iconBtn}>
              <MaterialCommunityIcons name="open-in-new" size={16} color={colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setCollapsed(true)} style={styles.iconBtn}>
              <MaterialCommunityIcons name="chevron-right" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </>
        )}
      </View>

      {readOnly && (
        <Text style={styles.readOnlyBanner}>
          Session ended — notes are now read-only.
        </Text>
      )}
      {!readOnly && layout === 'rail' && popoutActive && (
        <Text style={styles.mirrorBanner}>
          Editing in pop-out window. This view is read-only while it&apos;s open.
        </Text>
      )}

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : (
        <View style={layout === 'fullscreen' ? styles.editorFull : undefined}>
          <RichTextEditor
            value={body}
            onChangeText={handleChange}
            readOnly={effectiveReadOnly}
            placeholder="Jot down anything you want to remember from tonight…"
            minHeight={layout === 'fullscreen' ? 400 : 180}
          />
        </View>
      )}

      <View style={styles.footer}>
        <Text style={styles.savedLabel}>{savedLabel}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.surface,
    borderColor: colors.border, borderWidth: 1, borderRadius: 14,
    padding: spacing.md, gap: spacing.sm,
  },
  panelFull: {
    flex: 1, borderRadius: 0, borderWidth: 0, padding: spacing.lg,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  title: {
    fontSize: 13, fontWeight: '700', color: colors.textPrimary,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  iconBtn: { padding: 4 },
  readOnlyBanner: {
    fontSize: 12, color: colors.hpWarning, fontStyle: 'italic',
  },
  mirrorBanner: {
    fontSize: 12, color: colors.brand, fontStyle: 'italic',
  },
  loadingBox: {
    minHeight: 120, alignItems: 'center', justifyContent: 'center',
  },
  editorFull: { flex: 1 },
  footer: { flexDirection: 'row', justifyContent: 'flex-end' },
  savedLabel: { fontSize: 11, color: colors.textSecondary },
  collapsedTab: {
    backgroundColor: colors.surface, borderColor: colors.border,
    borderWidth: 1, borderRightWidth: 0,
    borderTopLeftRadius: 10, borderBottomLeftRadius: 10,
    paddingVertical: spacing.md, paddingHorizontal: 6,
    alignItems: 'center', gap: 6,
  },
  collapsedLabel: {
    fontSize: 10, color: colors.brand, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 0.5,
    writingDirection: 'ltr',
  },
});
