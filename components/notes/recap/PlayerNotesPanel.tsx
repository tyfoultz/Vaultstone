import { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { getSessionNotes } from '@vaultstone/api';
import { colors, spacing } from '@vaultstone/ui';
import { RichTextRenderer } from '../RichTextRenderer';

interface ParticipantNote {
  user_id: string;
  body: string;
  updated_at: string | null;
}

interface Props {
  sessionId: string;
  isLive: boolean;
  excludeUserId: string;
  displayNameByUserId: Record<string, string>;
}

export function PlayerNotesPanel({
  sessionId, isLive, excludeUserId, displayNameByUserId,
}: Props) {
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
      <View style={styles.body}>
        <Text style={styles.locked}>
          Other players&apos; notes become visible after the session ends.
        </Text>
      </View>
    );
  }

  if (notes === null) {
    return (
      <View style={[styles.body, styles.center]}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  const others = notes.filter((n) => n.user_id !== excludeUserId);

  if (others.length === 0) {
    return (
      <View style={styles.body}>
        <Text style={styles.empty}>No player notes from this session.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.body} contentContainerStyle={styles.list}>
      {others.map((n) => (
        <View key={n.user_id} style={styles.noteBlock}>
          <Text style={styles.author}>
            {displayNameByUserId[n.user_id] ?? 'Unknown'}
          </Text>
          <RichTextRenderer value={n.body} />
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, padding: spacing.md },
  list: { gap: spacing.sm, paddingBottom: spacing.md },
  center: { alignItems: 'center', justifyContent: 'center' },
  locked: { fontSize: 13, color: colors.textSecondary, fontStyle: 'italic' },
  empty: { fontSize: 13, color: colors.textSecondary, textAlign: 'center' },
  noteBlock: {
    backgroundColor: colors.background,
    borderRadius: 8, padding: spacing.sm, gap: 4,
  },
  author: {
    fontSize: 11, color: colors.brand, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
});
