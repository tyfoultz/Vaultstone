import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { updateSessionSummary } from '@vaultstone/api';
import { useRecapDraftStore } from '@vaultstone/store';
import { colors, spacing } from '@vaultstone/ui';
import { RichTextEditor } from '../RichTextEditor';
import { usePanelPresence } from './usePanelPresence';

interface Props {
  sessionId: string;
  publishedSummary: string | null;
  isLive: boolean;
  mode: 'dock' | 'popout';
}

function fmtSavedAt(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

export function RecapEditorPanel({ sessionId, publishedSummary, isLive, mode }: Props) {
  const draft = useRecapDraftStore((s) => s.bySessionId[sessionId] ?? null);
  const setDraft = useRecapDraftStore((s) => s.setDraft);
  const clearDraft = useRecapDraftStore((s) => s.clearDraft);
  const rehydrate = useRecapDraftStore.persist.rehydrate;

  const [body, setBody] = useState<string>(draft ?? publishedSummary ?? '');
  const [publishing, setPublishing] = useState(false);
  const [publishedAt, setPublishedAt] = useState<string | null>(null);

  const { popoutActive, onPopoutClosed } = usePanelPresence(mode, 'recap', sessionId);
  const readOnly = mode === 'dock' && popoutActive;

  useEffect(() => {
    setBody(draft ?? publishedSummary ?? '');
    setPublishedAt(null);
  }, [sessionId, draft, publishedSummary]);

  // When the pop-out closes, the dock instance needs to pick up edits the
  // pop-out window made to the persisted draft store (different JS context,
  // so the in-memory zustand state never saw them).
  useEffect(() => {
    if (mode !== 'dock') return;
    return onPopoutClosed(() => { void rehydrate?.(); });
  }, [mode, onPopoutClosed, rehydrate]);

  function handleChange(next: string) {
    if (readOnly) return;
    setBody(next);
    setDraft(sessionId, next);
  }

  async function handlePublish() {
    setPublishing(true);
    const { error } = await updateSessionSummary(sessionId, body);
    setPublishing(false);
    if (!error) {
      clearDraft(sessionId);
      setPublishedAt(new Date().toISOString());
    }
  }

  const isDirty = (draft ?? '') !== (publishedSummary ?? '');
  const status = publishing
    ? 'Publishing…'
    : publishedAt
      ? `Published ${fmtSavedAt(publishedAt)}`
      : isDirty
        ? 'Draft · unpublished changes'
        : publishedSummary ? 'Published' : '';

  return (
    <View style={styles.body}>
      {readOnly && (
        <Text style={styles.banner}>Editing in pop-out window — read-only here.</Text>
      )}
      {isLive && !readOnly && (
        <Text style={styles.hint}>
          In progress — Publish after the session ends for the cleanest history entry.
        </Text>
      )}
      <View style={styles.editorWrap}>
        <RichTextEditor
          value={body}
          onChangeText={handleChange}
          readOnly={readOnly}
          placeholder="Write the recap for this session…"
          minHeight={mode === 'popout' ? 480 : 240}
        />
      </View>
      <View style={styles.footer}>
        <Text style={styles.status}>{status}</Text>
        <TouchableOpacity
          onPress={handlePublish}
          disabled={publishing || body.trim().length === 0 || readOnly}
          style={[
            styles.publishBtn,
            (publishing || body.trim().length === 0 || readOnly) && styles.disabled,
          ]}
        >
          <MaterialCommunityIcons name="send" size={14} color={colors.textPrimary} />
          <Text style={styles.publishText}>Publish to History</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, gap: spacing.sm, padding: spacing.md },
  banner: { fontSize: 12, color: colors.brand, fontStyle: 'italic' },
  hint: { fontSize: 12, color: colors.textSecondary, fontStyle: 'italic' },
  editorWrap: { flex: 1 },
  footer: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: spacing.sm,
  },
  status: { fontSize: 12, color: colors.textSecondary, flex: 1 },
  publishBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.brand,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: 8,
  },
  disabled: { opacity: 0.5 },
  publishText: { color: colors.textPrimary, fontSize: 13, fontWeight: '700' },
});
