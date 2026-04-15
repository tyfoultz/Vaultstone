import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getMySessionNote, upsertSessionNote } from '@vaultstone/api';
import { colors, spacing } from '@vaultstone/ui';

interface Props {
  sessionId: string;
  userId: string;
  campaignId: string;
  readOnly?: boolean;
  layout?: 'rail' | 'fullscreen';
}

function formatSavedAt(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  return `${hh}:${mm}`;
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

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : (
        <TextInput
          style={[styles.input, layout === 'fullscreen' && styles.inputFull]}
          value={body}
          onChangeText={handleChange}
          editable={!readOnly}
          multiline
          placeholder="Jot down anything you want to remember from tonight…"
          placeholderTextColor={colors.textSecondary}
          textAlignVertical="top"
        />
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
  loadingBox: {
    minHeight: 120, alignItems: 'center', justifyContent: 'center',
  },
  input: {
    backgroundColor: colors.background, borderColor: colors.border,
    borderWidth: 1, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    color: colors.textPrimary, fontSize: 14, lineHeight: 20,
    minHeight: 180,
  },
  inputFull: { flex: 1, minHeight: 0 },
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
