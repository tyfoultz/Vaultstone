// Game-Systems-side rulebooks surface — Phase A. See
// docs/features/08-pdf-rulebook.md (Phase A revision) and
// docs/overnight-2026-05-02-campaign-system-linking.md.
//
// Renders a per-system view of the user's PDF uploads, grouped by
// declared-source-key. Three row states:
//   1. declared + uploaded → file row with Read / Re-index / Remove
//   2. declared + NOT uploaded → empty-state row with Upload CTA
//   3. uploaded with no current declaration → "Unmatched" group, still
//      Read/Remove-able
//
// Storage is still campaign-keyed in Phase A. The upload flow needs to
// pick a campaign to attach to — for system-scoped uploads we attach to
// the user's first campaign on this system. If they have none, the
// upload entry is hidden (with a clarifying empty state).

import { useState } from 'react';
import { View, Pressable, Platform, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import * as FileSystem from 'expo-file-system';
import {
  reindexSource, deleteSourceById, removeSourceFromIndex,
  type LocalSource, type IndexMeta,
} from '@vaultstone/content';
import {
  colors, spacing, radius,
  Card, Text, MetaLabel, Icon, GhostButton, GradientButton,
} from '@vaultstone/ui';
import type { GameSystemDefinition } from '@vaultstone/types';
import { useSystemRulebooks, type RulebookGroup, type RulebookUpload } from './useSystemRulebooks';
import { IndexStatusLine } from '../rulebook/IndexStatusLine';
import { TosModal } from '../rulebook/TosModal';
import { pickPdf, saveUploadedPdf, alertUploadFailed, type PendingFile } from '../rulebook/uploadPdf';

type Props = {
  sys: GameSystemDefinition;
};

export function SystemRulebooksList({ sys }: Props) {
  const router = useRouter();
  const { loading, campaigns, groups, refresh } = useSystemRulebooks(sys.id);

  // Upload flow state. The pending upload remembers which preset key it's
  // being uploaded *for* (taken from the empty-state row that triggered it),
  // so the resulting LocalSource can be tagged with the right source_key.
  const [pending, setPending] = useState<PendingFile | null>(null);
  const [pendingForKey, setPendingForKey] = useState<string | null>(null);
  const [tosOpen, setTosOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Phase A: storage is campaign-keyed. We pick the user's first campaign
  // on this system as the attach target for system-scoped uploads. If
  // they have no campaigns on this system, we hide the upload affordance
  // entirely and show a clarifying empty state — there's nothing useful
  // to upload "against" until they're in a campaign that needs it.
  const attachCampaignId = campaigns[0]?.id ?? null;

  async function handleUploadFor(presetKey: string) {
    if (!attachCampaignId) return;
    const picked = await pickPdf();
    if (!picked) return;
    setPending(picked);
    setPendingForKey(presetKey);
    setTosOpen(true);
  }

  async function handleTosConfirm() {
    if (!pending || !pendingForKey || !attachCampaignId) return;
    setTosOpen(false);
    setUploading(true);
    try {
      const record = await saveUploadedPdf({
        pending,
        campaignId: attachCampaignId,
        sourceKey: pendingForKey,
      });
      // Fire-and-forget: parse + index.
      kickIndexing(record.id);
      refresh();
    } catch (err) {
      console.warn('System-side PDF upload failed', err);
      alertUploadFailed(err);
    } finally {
      setUploading(false);
      setPending(null);
      setPendingForKey(null);
    }
  }

  function handleTosCancel() {
    setTosOpen(false);
    setPending(null);
    setPendingForKey(null);
  }

  async function handleRemove(upload: RulebookUpload) {
    // Remove every campaign-scoped copy of this logical file. On native we
    // also delete the underlying file from documentDirectory.
    for (const copy of upload.copies) {
      if (Platform.OS !== 'web') {
        try {
          await FileSystem.deleteAsync(copy.file_path, { idempotent: true });
        } catch {
          // file may already be gone
        }
      }
      await deleteSourceById(copy.id).catch(() => {});
      await removeSourceFromIndex(copy.id).catch(() => {});
    }
    refresh();
  }

  function handleRead(upload: RulebookUpload) {
    // Phase A: viewer route is still campaign-scoped. Route through the
    // primary copy's owning campaign.
    router.push(
      `/campaign/${upload.primary.campaign_id}/pdf-viewer?sourceId=${upload.primary.id}` as never,
    );
  }

  function handleReindex(upload: RulebookUpload) {
    kickIndexing(upload.primary.id);
    refresh();
  }

  if (loading) {
    return (
      <View style={s.loadingWrap}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (campaigns.length === 0) {
    return (
      <Card>
        <View style={s.emptyWrap}>
          <Icon name="library-books" size={28} color={colors.outline} />
          <Text variant="title-sm" weight="semibold" style={s.emptyTitle}>
            No campaigns using this system yet
          </Text>
          <Text variant="body-sm" style={s.emptyBody}>
            Once you join or create a campaign that uses {sys.displayName},
            you'll be able to upload your own legally-obtained PDF rulebooks
            here. They stay on your device — never shared with anyone.
          </Text>
        </View>
      </Card>
    );
  }

  if (groups.length === 0) {
    return (
      <Card>
        <View style={s.emptyWrap}>
          <Icon name="check-circle" size={28} color={colors.outline} />
          <Text variant="title-sm" weight="semibold" style={s.emptyTitle}>
            No rulebooks needed
          </Text>
          <Text variant="body-sm" style={s.emptyBody}>
            Your campaigns on this system are using bundled SRD content,
            which doesn't require a separate upload. If a DM declares a
            rulebook (like the PHB), it'll appear here with an upload prompt.
          </Text>
        </View>
      </Card>
    );
  }

  return (
    <View style={s.list}>
      {groups.map((g) => (
        <RulebookGroupCard
          key={g.presetKey ?? 'unmatched'}
          group={g}
          uploadEnabled={!!attachCampaignId && !uploading}
          uploading={uploading && pendingForKey === g.presetKey}
          onUpload={() => g.presetKey && handleUploadFor(g.presetKey)}
          onRead={handleRead}
          onReindex={handleReindex}
          onRemove={handleRemove}
        />
      ))}

      <View style={s.legalNote}>
        <Icon name="shield" size={16} color={colors.outline} />
        <Text variant="body-sm" style={s.legalText}>
          Each player must upload their own legally-obtained copy. PDFs stay on your
          device only and are never transmitted to Vaultstone or shared with other
          party members.
        </Text>
      </View>

      <TosModal
        visible={tosOpen}
        pending={pending}
        onCancel={handleTosCancel}
        onConfirm={handleTosConfirm}
      />
    </View>
  );
}

// ── Group card ───────────────────────────────────────────────────────────────

function RulebookGroupCard({
  group, uploadEnabled, uploading,
  onUpload, onRead, onReindex, onRemove,
}: {
  group: RulebookGroup;
  uploadEnabled: boolean;
  uploading: boolean;
  onUpload: () => void;
  onRead: (upload: RulebookUpload) => void;
  onReindex: (upload: RulebookUpload) => void;
  onRemove: (upload: RulebookUpload) => void;
}) {
  const hasUploads = group.uploads.length > 0;
  const isUnmatched = group.declaredBy.length === 0 && hasUploads;

  return (
    <Card>
      {/* Header */}
      <View style={s.groupHeader}>
        <View style={{ flex: 1 }}>
          <Text variant="title-md" weight="bold" style={s.groupTitle}>
            {group.label}
          </Text>
          {group.declaredBy.length > 0 ? (
            <MetaLabel size="sm">
              Required by {formatCampaignList(group.declaredBy.map((d) => d.campaignName))}
            </MetaLabel>
          ) : (
            <MetaLabel size="sm">Not currently required by any campaign</MetaLabel>
          )}
        </View>
        {!hasUploads && !isUnmatched ? (
          <GradientButton
            label={uploading ? 'Uploading…' : 'Upload your copy'}
            onPress={onUpload}
            disabled={!uploadEnabled || uploading}
          />
        ) : null}
      </View>

      {/* Uploads */}
      {hasUploads ? (
        <View style={s.uploadList}>
          {group.uploads.map((u) => (
            <View key={u.primary.id} style={s.uploadRow}>
              <View style={s.uploadRowLeft}>
                <Icon name="picture-as-pdf" size={18} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text variant="body-md" weight="semibold" style={s.uploadName} numberOfLines={1}>
                    {u.primary.file_name}
                  </Text>
                  <IndexStatusLine status={u.status} onRetry={() => onReindex(u)} />
                  {u.attachedTo.length > 0 ? (
                    <MetaLabel size="sm">
                      Used by {formatCampaignList(u.attachedTo.map((c) => c.campaignName))}
                    </MetaLabel>
                  ) : null}
                </View>
              </View>
              <View style={s.uploadActions}>
                <GhostButton label="Read" onPress={() => onRead(u)} />
                <Pressable
                  onPress={() => onRemove(u)}
                  style={({ pressed }) => [s.removeBtn, pressed && { opacity: 0.7 }]}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${u.primary.file_name}`}
                >
                  <Icon name="delete-outline" size={18} color={colors.hpDanger} />
                </Pressable>
              </View>
            </View>
          ))}

          {/* Allow uploading another copy even when one already exists,
              but only for declared groups (unmatched groups can't easily
              be added to — there's no preset key to attach against). */}
          {!isUnmatched ? (
            <Pressable
              onPress={onUpload}
              disabled={!uploadEnabled || uploading}
              style={({ pressed }) => [
                s.addAnotherRow,
                (pressed || uploading) && { opacity: 0.6 },
              ]}
            >
              <Icon name="add" size={18} color={colors.primary} />
              <Text variant="body-sm" weight="semibold" style={{ color: colors.primary }}>
                {uploading ? 'Uploading…' : 'Upload another copy'}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatCampaignList(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

/**
 * Kick off PDF text extraction + FTS indexing for a source. Mirrors
 * `startIndexing` in app/campaign/[id]/rulebook.tsx — web hands a Blob,
 * native hands the URI string.
 */
function kickIndexing(sourceId: string) {
  const fetchBytes =
    Platform.OS === 'web'
      ? async (filePath: string) => {
          const res = await fetch(filePath);
          return res.blob();
        }
      : async (filePath: string) => filePath;
  reindexSource(sourceId, fetchBytes).catch((err) => {
    console.warn('Indexing failed', err);
  });
}

const s = StyleSheet.create({
  list: { gap: spacing.md, paddingHorizontal: spacing.lg },

  loadingWrap: { padding: spacing.xl, alignItems: 'center' },

  emptyWrap: { gap: spacing.sm, alignItems: 'flex-start', padding: spacing.sm },
  emptyTitle: { color: colors.onSurface, marginTop: spacing.xs },
  emptyBody: { color: colors.onSurfaceVariant, lineHeight: 18 },

  groupHeader: {
    flexDirection: 'row', alignItems: 'flex-start',
    gap: spacing.md, marginBottom: spacing.md,
  },
  groupTitle: { color: colors.onSurface, marginBottom: 2 },

  uploadList: { gap: spacing.sm },
  uploadRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: spacing.md, paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.outlineVariant + '55',
  },
  uploadRowLeft: { flex: 1, flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  uploadName: { color: colors.onSurface },
  uploadActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  removeBtn: {
    padding: spacing.xs,
    borderRadius: radius.full,
  },

  addAnotherRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.primary + '66',
    justifyContent: 'center',
    marginTop: spacing.xs,
  },

  legalNote: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '44',
  },
  legalText: { flex: 1, color: colors.onSurfaceVariant, lineHeight: 18 },
});
