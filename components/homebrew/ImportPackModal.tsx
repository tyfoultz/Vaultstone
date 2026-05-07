// Import-a-pack modal. The user picks a vaultstone-pack/v1 JSON file
// produced by the Export action on a pack detail page; we validate the
// shape, show a summary (pack name + entry counts), require the
// per-import ToS callout, and create a fresh pack owned by the
// importer with all entries restored under it.
//
// Always creates a new pack — no merge / overwrite path. Renaming is
// optional but offered up front since the file can be from anyone.

import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import {
  importHomebrewPack,
  validatePackExportFile,
  type HomebrewPackRow,
  type PackExportFile,
} from '@vaultstone/api';
import { useAuthStore } from '@vaultstone/store';
import {
  Card,
  GhostButton,
  GradientButton,
  Icon,
  Input,
  MetaLabel,
  Text,
  colors,
  radius,
  spacing,
} from '@vaultstone/ui';
import { pickPackJson } from './packTransferIo';

type Props = {
  /** Game system the importer is on. Used to flag a system mismatch up
   *  front so the user doesn't try to load a 5e_2014 pack into a
   *  pf2e system. */
  expectedSystem: string;
  /** Optional system display name shown as context in the header. */
  systemDisplayName?: string;
  onClose: () => void;
  onImported: (pack: HomebrewPackRow) => void;
};

export function ImportPackModal({ expectedSystem, systemDisplayName, onClose, onImported }: Props) {
  const user = useAuthStore((s) => s.user);
  const [file, setFile] = useState<PackExportFile | null>(null);
  const [pickedFileName, setPickedFileName] = useState<string | null>(null);
  const [renameOverride, setRenameOverride] = useState('');
  const [tosAccepted, setTosAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handlePick() {
    setError('');
    try {
      const picked = await pickPackJson();
      if (!picked) return; // user cancelled
      const result = validatePackExportFile(picked.payload);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setFile(result.file);
      setPickedFileName(picked.fileName);
      setRenameOverride(result.file.pack.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const systemMismatch = file && file.pack.system !== expectedSystem;
  const totalEntries = file
    ? file.importedEntries.length + file.homebrewEntries.length
    : 0;
  const canSubmit = !!user && !!file && tosAccepted && !systemMismatch && !submitting;

  async function handleSubmit() {
    if (!user || !file) return;
    setSubmitting(true);
    setError('');
    const { data, error: err } = await importHomebrewPack({
      userId: user.id,
      file,
      packNameOverride: renameOverride.trim() || undefined,
    });
    setSubmitting(false);
    if (err || !data) {
      setError(err?.message ?? 'Failed to import pack.');
      return;
    }
    onImported(data.pack);
  }

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()} style={styles.panelWrapper}>
          <Card tier="container" padding="lg" style={styles.panel}>
            <ScrollView>
              <View style={styles.header}>
                <View style={{ flex: 1 }}>
                  <MetaLabel size="sm" tone="accent">
                    {systemDisplayName ? `Import into ${systemDisplayName}` : 'Import a content pack'}
                  </MetaLabel>
                  <Text
                    variant="headline-sm"
                    family="headline"
                    weight="bold"
                    style={{ marginTop: 4 }}
                  >
                    Import a pack
                  </Text>
                </View>
                <Pressable onPress={onClose} style={styles.closeBtn}>
                  <Icon name="close" size={22} color={colors.onSurfaceVariant} />
                </Pressable>
              </View>

              <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
                {/* File picker — surfaces the selected filename + pack
                    summary once a valid file is picked. Re-picking
                    replaces the staged file. */}
                <View>
                  <MetaLabel size="sm">Pack file</MetaLabel>
                  <View style={styles.pickRow}>
                    <View style={{ flex: 1 }}>
                      {pickedFileName ? (
                        <Text variant="body-sm" family="body" style={{ color: colors.onSurface }} numberOfLines={1}>
                          {pickedFileName}
                        </Text>
                      ) : (
                        <Text variant="body-sm" family="body" style={{ color: colors.onSurfaceVariant }}>
                          Choose a vaultstone-pack/v1 JSON file
                        </Text>
                      )}
                    </View>
                    <GhostButton
                      label={file ? 'Replace…' : 'Choose file…'}
                      icon="folder-open"
                      onPress={handlePick}
                    />
                  </View>
                </View>

                {file ? (
                  <View style={styles.summary}>
                    <SummaryRow label="From" value={file.pack.name} />
                    <SummaryRow
                      label="System"
                      value={file.pack.system}
                      tone={systemMismatch ? 'danger' : undefined}
                    />
                    <SummaryRow
                      label="Entries"
                      value={`${totalEntries.toLocaleString()} (${file.importedEntries.length} imported · ${file.homebrewEntries.length} authored)`}
                    />
                    <SummaryRow
                      label="Exported"
                      value={file.pack.exportedAt}
                    />
                  </View>
                ) : null}

                {systemMismatch ? (
                  <Text
                    variant="body-sm"
                    style={{ color: colors.hpDanger }}
                  >
                    This pack was exported for system <Text weight="bold">{file?.pack.system}</Text>,
                    but this page is for <Text weight="bold">{expectedSystem}</Text>. Open the
                    correct system page to import.
                  </Text>
                ) : null}

                {file && !systemMismatch ? (
                  <Input
                    label="Pack name in your library"
                    placeholder="Pack name"
                    value={renameOverride}
                    onChangeText={setRenameOverride}
                  />
                ) : null}

                {/* ToS callout — required acceptance for any imported
                    content. Mirrors the per-import callout used by
                    the structured-content import path. The legal
                    posture is documented in docs/legal.md. */}
                {file && !systemMismatch ? (
                  <Pressable
                    onPress={() => setTosAccepted((v) => !v)}
                    style={({ pressed }) => [
                      styles.tosRow,
                      tosAccepted && styles.tosRowActive,
                      pressed && { opacity: 0.85 },
                    ]}
                  >
                    <Icon
                      name={tosAccepted ? 'check-box' : 'check-box-outline-blank'}
                      size={20}
                      color={tosAccepted ? colors.primary : colors.onSurfaceVariant}
                    />
                    <Text variant="body-sm" family="body" style={{ flex: 1, color: colors.onSurface }}>
                      I have the rights to use the content in this pack. I understand the pack is
                      stored in my Vaultstone account and may be shared with players in campaigns I
                      DM via attached content packs.
                    </Text>
                  </Pressable>
                ) : null}
              </View>

              {error ? (
                <Text
                  variant="body-sm"
                  style={{
                    color: colors.hpDanger,
                    marginTop: spacing.md,
                  }}
                >
                  {error}
                </Text>
              ) : null}

              <View style={styles.footer}>
                <GhostButton label="Cancel" onPress={onClose} />
                <GradientButton
                  label={submitting ? 'Importing…' : 'Import pack'}
                  onPress={handleSubmit}
                  loading={submitting}
                  disabled={!canSubmit}
                />
              </View>
            </ScrollView>
          </Card>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function SummaryRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'danger';
}) {
  return (
    <View style={styles.summaryRow}>
      <Text variant="label-sm" weight="bold" uppercase style={styles.summaryLabel}>{label}</Text>
      <Text
        variant="body-sm"
        family="body"
        style={[
          styles.summaryValue,
          tone === 'danger' ? { color: colors.hpDanger } : null,
        ]}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
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
  panelWrapper: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '90%',
  },
  panel: {
    // Inherit the wrapper's height bound so the inner ScrollView
    // can scroll when the import preview grows past the viewport.
    flex: 1,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '33',
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
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: 6,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm + 2,
    backgroundColor: colors.surfaceContainer,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '55',
  },
  summary: {
    backgroundColor: colors.surfaceContainer,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '55',
    padding: spacing.sm + 2,
    gap: 6,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  summaryLabel: { width: 80, color: colors.outline, letterSpacing: 1 },
  summaryValue: { flex: 1, color: colors.onSurface },
  tosRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm + 2,
    backgroundColor: colors.surfaceContainer,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '55',
  },
  tosRowActive: {
    borderColor: colors.primary + '88',
    backgroundColor: colors.primaryContainer + '22',
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'flex-end',
    marginTop: spacing.xl,
  },
});
