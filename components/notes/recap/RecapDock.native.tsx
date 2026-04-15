import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, spacing } from '@vaultstone/ui';

import { RecapEditorPanel } from './RecapEditorPanel';
import { DmNotesPanel } from './DmNotesPanel';
import { PlayerNotesPanel } from './PlayerNotesPanel';

interface SessionMeta {
  id: string;
  summary: string | null;
  isLive: boolean;
}

interface Props {
  campaignId: string;
  session: SessionMeta;
  dmUserId: string;
  displayNameByUserId: Record<string, string>;
}

// Native devices (phones / tablets) get a stacked single-column layout — the
// drag-to-rearrange dock is web-only because the libraries powering it are
// React DOM. Pop-out is also a no-op here (no concept of separate windows).
export function RecapDock({ session, dmUserId, displayNameByUserId }: Props) {
  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <Section icon="text-box-outline" title="Recap">
        <RecapEditorPanel
          sessionId={session.id}
          publishedSummary={session.summary}
          isLive={session.isLive}
          mode="dock"
        />
      </Section>

      <Section icon="notebook-outline" title="Your Session Notes">
        <DmNotesPanel
          sessionId={session.id}
          userId={dmUserId}
          mode="dock"
        />
      </Section>

      <Section icon="account-multiple-outline" title="Player Notes">
        <PlayerNotesPanel
          sessionId={session.id}
          isLive={session.isLive}
          excludeUserId={dmUserId}
          displayNameByUserId={displayNameByUserId}
        />
      </Section>
    </ScrollView>
  );
}

interface SectionProps {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  title: string;
  children: React.ReactNode;
}

function Section({ icon, title, children }: SectionProps) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <MaterialCommunityIcons name={icon} size={16} color={colors.brand} />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrollContent: { padding: spacing.md, gap: spacing.md },
  section: {
    backgroundColor: colors.surface,
    borderColor: colors.border, borderWidth: 1, borderRadius: 12,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderBottomColor: colors.border, borderBottomWidth: 1,
    backgroundColor: colors.background,
  },
  sectionTitle: {
    fontSize: 12, color: colors.textPrimary, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  sectionBody: { minHeight: 220 },
});
