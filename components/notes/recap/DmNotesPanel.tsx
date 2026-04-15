import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { getMySessionNote, upsertSessionNote } from '@vaultstone/api';
import { colors, spacing } from '@vaultstone/ui';
import { RichTextEditor } from '../RichTextEditor';
import { usePanelPresence } from './usePanelPresence';

interface Props {
  sessionId: string;
  userId: string;
  mode: 'dock' | 'popout';
}

function fmtSavedAt(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

export function DmNotesPanel({ sessionId, userId, mode }: Props) {
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const { popoutActive, onPopoutClosed } = usePanelPresence(mode, 'dmNotes', sessionId);
  const readOnly = mode === 'dock' && popoutActive;

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
  }, [sessionId, userId, reloadKey]);

  // When the pop-out closes, reload from DB so the dock picks up its writes.
  useEffect(() => {
    if (mode !== 'dock') return;
    return onPopoutClosed(() => setReloadKey((k) => k + 1));
  }, [mode, onPopoutClosed]);

  useEffect(() => {
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, []);

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

  function handleChange(next: string) {
    if (readOnly) return;
    setBody(next);
    scheduleSave(next);
  }

  if (loading) {
    return (
      <View style={[styles.body, styles.center]}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  const status = saving ? 'Saving…' : savedAt ? `Saved ${fmtSavedAt(savedAt)}` : '';

  return (
    <View style={styles.body}>
      {readOnly && (
        <Text style={styles.banner}>Editing in pop-out window — read-only here.</Text>
      )}
      <View style={styles.editorWrap}>
        <RichTextEditor
          value={body}
          onChangeText={handleChange}
          readOnly={readOnly}
          placeholder="Your notes for this session…"
          minHeight={mode === 'popout' ? 480 : 200}
        />
      </View>
      <Text style={styles.status}>{status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, gap: spacing.sm, padding: spacing.md },
  center: { alignItems: 'center', justifyContent: 'center' },
  banner: { fontSize: 12, color: colors.brand, fontStyle: 'italic' },
  editorWrap: { flex: 1 },
  status: { fontSize: 12, color: colors.textSecondary, alignSelf: 'flex-end' },
});
