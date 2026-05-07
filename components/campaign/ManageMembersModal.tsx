// DM-only members manager. Two surfaces in one modal:
//   • Join code — copyable, regeneratable invite token. The DM
//     shares this with players who join via /campaign/join.
//   • Member list — every member of the campaign, with a Remove
//     action for everyone except the DM. Removing a player drops
//     their character_id link too via the underlying RPC.
//
// Players see a much simpler view of the same data on the V2 page's
// Party panel; this modal is the editor surface.

import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Clipboard } from 'react-native';
import {
  regenerateJoinCode,
  removeCampaignMember,
} from '@vaultstone/api';
import {
  Card, GhostButton, Icon, MetaLabel, Text,
  colors, radius, spacing,
} from '@vaultstone/ui';

type Member = {
  user_id: string;
  role: 'gm' | 'player' | 'co_gm';
  character_id: string | null;
  joined_at: string;
  profiles: { id: string; display_name: string | null } | null;
  characters: { id: string; name: string; system: string; base_stats: unknown } | null;
};

type Props = {
  campaignId: string;
  joinCode: string;
  members: Member[];
  /** Auth'd user — used to hide the Remove button on the DM's own
   *  row (the DM can't remove themselves from this modal; campaign
   *  deletion is the path for that). */
  currentUserId: string | null;
  onClose: () => void;
  /** Fired after a write so the parent can refresh. The modal does
   *  optimistic local state for member removal (the parent's list
   *  is the source of truth on next open). */
  onChanged: () => void;
  /** Update the join code on the parent after regenerate. Passed in
   *  rather than re-fetched from a hook so the parent's campaign
   *  state stays the single source of truth. */
  onJoinCodeChanged: (newCode: string) => void;
};

const ROLE_LABEL: Record<string, string> = {
  gm: 'DM',
  co_gm: 'Co-DM',
  player: 'Player',
};

export function ManageMembersModal({
  campaignId, joinCode, members, currentUserId, onClose, onChanged, onJoinCodeChanged,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState('');

  function copy() {
    Clipboard.setString(joinCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function regenerate() {
    if (regenerating) return;
    setRegenerating(true);
    setError('');
    const { code, error: err } = await regenerateJoinCode(campaignId);
    setRegenerating(false);
    if (err || !code) {
      setError(err?.message ?? 'Failed to regenerate join code.');
      return;
    }
    onJoinCodeChanged(code);
  }

  async function remove(userId: string) {
    if (removing) return;
    setRemoving(userId);
    setError('');
    const { error: err } = await removeCampaignMember(campaignId, userId);
    setRemoving(null);
    if (err) {
      setError(err.message);
      return;
    }
    onChanged();
  }

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()} style={styles.panelWrapper}>
          <Card tier="container" padding="sm" style={styles.panel}>
            <ScrollView contentContainerStyle={styles.scrollBody}>
              <View style={styles.header}>
                <View style={{ flex: 1 }}>
                  <MetaLabel size="sm" tone="accent">Campaign</MetaLabel>
                  <Text variant="headline-sm" family="headline" weight="bold" style={{ marginTop: 4 }}>
                    Manage members
                  </Text>
                  <Text variant="body-sm" family="body" style={{ color: colors.onSurfaceVariant, marginTop: 6 }}>
                    Share the join code with players, or remove existing members.
                  </Text>
                </View>
                <Pressable onPress={onClose} style={styles.closeBtn}>
                  <Icon name="close" size={22} color={colors.onSurfaceVariant} />
                </Pressable>
              </View>

              <View style={styles.section}>
                <MetaLabel size="sm">Join code</MetaLabel>
                <View style={styles.codeRow}>
                  <Text variant="title-md" family="headline" weight="bold" style={styles.code} numberOfLines={1}>
                    {joinCode}
                  </Text>
                  <View style={styles.codeActions}>
                    <GhostButton
                      label={copied ? 'Copied' : 'Copy'}
                      icon={copied ? 'check' : 'content-copy'}
                      onPress={copy}
                    />
                    <GhostButton
                      label={regenerating ? '…' : 'Regenerate'}
                      icon="refresh"
                      onPress={regenerate}
                      disabled={regenerating}
                    />
                  </View>
                </View>
                <Text variant="label-sm" family="body" style={styles.codeHint}>
                  Players join at the campaign join page using this code.
                  Regenerate invalidates the old code.
                </Text>
              </View>

              <View style={styles.section}>
                <MetaLabel size="sm">{members.length} {members.length === 1 ? 'member' : 'members'}</MetaLabel>
                <View style={styles.list}>
                  {members.map((m) => {
                    const isSelf = m.user_id === currentUserId;
                    const isDM = m.role === 'gm';
                    return (
                      <View key={m.user_id} style={styles.memberRow}>
                        <View style={styles.avatar}>
                          <Text variant="label-md" family="body" weight="bold" style={{ color: colors.onPrimary }}>
                            {(m.profiles?.display_name ?? '?').slice(0, 1).toUpperCase()}
                          </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={styles.nameRow}>
                            <Text variant="body-sm" family="body" weight="semibold" style={{ color: colors.onSurface }}>
                              {m.profiles?.display_name ?? 'Anonymous'}
                            </Text>
                            <View style={styles.roleChip}>
                              <Text variant="label-sm" family="body" weight="bold" uppercase style={styles.roleChipText}>
                                {ROLE_LABEL[m.role] ?? m.role}
                              </Text>
                            </View>
                            {isSelf ? (
                              <Text variant="label-sm" style={{ color: colors.outline }}>
                                (you)
                              </Text>
                            ) : null}
                          </View>
                          {m.characters ? (
                            <Text variant="label-sm" family="body" style={{ color: colors.onSurfaceVariant, marginTop: 2 }} numberOfLines={1}>
                              Playing: {m.characters.name}
                            </Text>
                          ) : !isDM ? (
                            <Text variant="label-sm" family="body" style={{ color: colors.outline, marginTop: 2 }}>
                              No character assigned
                            </Text>
                          ) : null}
                        </View>
                        {/* Remove disabled for the DM and the auth'd
                            user (the DM removes themselves by deleting
                            the campaign; players leave via their own
                            "Leave campaign" path on V1). */}
                        {!isSelf && !isDM ? (
                          <GhostButton
                            label={removing === m.user_id ? '…' : 'Remove'}
                            onPress={() => remove(m.user_id)}
                            disabled={removing === m.user_id}
                          />
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              </View>

              {error ? (
                <Text variant="body-sm" style={{ color: colors.hpDanger, marginTop: spacing.md }}>
                  {error}
                </Text>
              ) : null}

              <View style={styles.footer}>
                <GhostButton label="Done" onPress={onClose} />
              </View>
            </ScrollView>
          </Card>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(12, 14, 16, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  panelWrapper: { width: '100%', maxWidth: 640, maxHeight: '90%' },
  panel: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '33',
  },
  scrollBody: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
    paddingLeft: spacing.lg,
    paddingRight: spacing.lg + 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  closeBtn: {
    padding: spacing.xs,
    borderRadius: radius.full,
  },
  section: {
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant + '55',
    gap: spacing.sm,
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '55',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  code: {
    flex: 1,
    color: colors.onSurface,
    letterSpacing: 4,
  },
  codeActions: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  codeHint: {
    color: colors.outline,
    marginTop: 2,
  },
  list: { gap: 6 },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '55',
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  roleChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '88',
  },
  roleChipText: {
    color: colors.onSurfaceVariant,
    letterSpacing: 1,
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'flex-end',
    marginTop: spacing.xl,
  },
});
