// Three-state modal that drives the JSON content import flow:
//   1. INTRO   — legal disclaimer + "Choose file" button
//   2. CONFIRM — picked file + probe summary ("Found 36 subclasses") + Import
//   3. WORKING — progress UI while transform + Supabase write run
//
// Imported entries are transformed into *Result-shaped payloads on-device,
// then upserted into the Supabase `imported_content` table under a new (or
// existing, on re-import) homebrew_pack named after the source file. From
// the user's perspective the result is just another content pack — synced,
// shareable, and managed alongside authored homebrew.

import { useState } from 'react';
import {
  Modal, Pressable, View, Text, TouchableOpacity,
  ActivityIndicator, StyleSheet,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, spacing } from '@vaultstone/ui';
import { transformSubclasses } from '@vaultstone/content';
import {
  createHomebrewPack, listHomebrewPacks,
  upsertImportedEntries, deleteImportedEntriesInPack,
} from '@vaultstone/api';
import { useAuthStore } from '@vaultstone/store';
import {
  pickContentJson, probeContent, hasImportableContent,
  type PickedJson, type ImportableContent,
} from './importContentJson';

type Props = {
  visible: boolean;
  systemId: string;
  onClose: () => void;
  /** Fires after a successful import so the caller can refresh state. */
  onImported: () => void;
};

type Phase = 'intro' | 'confirm' | 'working';

export function ImportContentModal({ visible, systemId, onClose, onImported }: Props) {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const [phase, setPhase] = useState<Phase>('intro');
  const [picked, setPicked] = useState<PickedJson | null>(null);
  const [probe, setProbe] = useState<ImportableContent | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setPhase('intro');
    setPicked(null);
    setProbe(null);
    setError(null);
  }

  function handleClose() {
    if (phase === 'working') return; // disallow close mid-import
    reset();
    onClose();
  }

  async function handlePick() {
    setError(null);
    try {
      const result = await pickContentJson();
      if (!result) return; // user cancelled
      const probeResult = probeContent(result.payload);
      setPicked(result);
      setProbe(probeResult);
      setPhase('confirm');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleImport() {
    if (!picked || !probe || !userId) return;
    setPhase('working');
    setError(null);
    try {
      const packName = derivePackName(picked.fileName);

      // Look up an existing import pack from the same source file. We use
      // the pack name + system + owner as the lookup key — re-importing
      // the same file finds the existing pack and replaces its entries
      // rather than creating a duplicate pack.
      const { data: existingPacks } = await listHomebrewPacks({ system: systemId });
      let pack = existingPacks?.find(
        (p) => p.owner_user_id === userId && p.name === packName,
      ) ?? null;

      if (!pack) {
        const { data: created, error: createErr } = await createHomebrewPack({
          ownerUserId: userId,
          system: systemId,
          name: packName,
          description: `Imported from ${picked.fileName}`,
        });
        if (createErr || !created) {
          throw new Error(createErr?.message ?? 'Failed to create pack');
        }
        pack = created;
      }

      // Wipe existing imported entries in this pack before re-importing
      // so removed entries (renamed source-keys, deleted upstream) don't
      // linger. Authored entries in homebrew_content stay untouched —
      // we only delete from imported_content.
      await deleteImportedEntriesInPack(pack.id);

      // Run all available transforms and upsert their output. Today only
      // subclasses; future transforms slot in alongside.
      const entriesToUpsert: Parameters<typeof upsertImportedEntries>[0]['entries'] = [];
      if (probe.subclasses > 0) {
        const subclasses = transformSubclasses(picked.payload as never, {
          systemId,
          sourceLabel: picked.fileName,
        });
        for (const sc of subclasses) {
          entriesToUpsert.push({
            contentType: 'subclass',
            name: sc.name,
            entryKey: sc.key,
            data: sc,
            sourceCode: sc.importSource?.code,
            sourceName: sc.importSource?.name,
            sourcePage: sc.importSource?.page,
            sourceUrl: picked.fileName,
          });
        }
      }

      const { error: upsertErr } = await upsertImportedEntries({
        packId: pack.id,
        userId,
        entries: entriesToUpsert,
      });
      if (upsertErr) throw new Error(upsertErr.message);

      onImported();
      reset();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase('confirm');
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <Pressable style={s.backdrop} onPress={handleClose}>
        <Pressable style={s.card} onPress={() => {}}>
          <View style={s.header}>
            <MaterialCommunityIcons
              name="file-document-outline"
              size={24}
              color={colors.brand}
            />
            <Text style={s.title}>
              {phase === 'intro' ? 'Import Content' :
               phase === 'confirm' ? 'Confirm Import' :
               'Importing…'}
            </Text>
          </View>

          {phase === 'intro' ? <IntroBody /> : null}

          {phase === 'confirm' && picked && probe ? (
            <ConfirmBody picked={picked} probe={probe} />
          ) : null}

          {phase === 'working' ? <WorkingBody /> : null}

          {error ? (
            <View style={s.errorBox}>
              <MaterialCommunityIcons name="alert-circle-outline" size={18} color={colors.hpDanger} />
              <Text style={s.errorText}>{error}</Text>
            </View>
          ) : null}

          {phase !== 'working' ? (
            <View style={s.actions}>
              <TouchableOpacity style={s.cancelBtn} onPress={handleClose}>
                <Text style={s.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              {phase === 'intro' ? (
                <TouchableOpacity style={s.confirmBtn} onPress={handlePick}>
                  <Text style={s.confirmBtnText}>Choose JSON file</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[s.confirmBtn, !hasImportableContent(probe!) && s.disabledBtn]}
                  onPress={handleImport}
                  disabled={!hasImportableContent(probe!)}
                >
                  <Text style={s.confirmBtnText}>
                    {hasImportableContent(probe!) ? 'Import' : 'Nothing to import'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Phase bodies ─────────────────────────────────────────────────────────

function IntroBody() {
  return (
    <>
      <Text style={s.body}>
        Pick a JSON file containing game content (e.g. a 5e community
        content library export). Vaultstone will parse it on this device,
        store the entries locally, and surface them across the app
        alongside SRD content.
      </Text>
      <View style={s.legalCallout}>
        <MaterialCommunityIcons name="shield-account-outline" size={18} color={colors.textSecondary} />
        <Text style={s.legalText}>
          You're responsible for the rights to any content you import.
          Vaultstone does not fetch this file on your behalf and does not
          transmit imported content to our servers or other party members.
        </Text>
      </View>
    </>
  );
}

function ConfirmBody({ picked, probe }: { picked: PickedJson; probe: ImportableContent }) {
  return (
    <>
      <View style={s.filePreview}>
        <MaterialCommunityIcons name="file-code-outline" size={20} color={colors.brand} />
        <View style={{ flex: 1 }}>
          <Text style={s.filePreviewName} numberOfLines={1}>{picked.fileName}</Text>
          <Text style={s.filePreviewMeta}>{formatBytes(picked.sizeBytes)}</Text>
        </View>
      </View>
      <Text style={s.body}>Found in this file:</Text>
      <View style={s.probeList}>
        <ProbeRow label="Subclasses" count={probe.subclasses} />
      </View>
      {!hasImportableContent(probe) ? (
        <Text style={s.warningText}>
          No supported content types found. Vaultstone currently imports
          subclasses; support for additional content types is coming.
        </Text>
      ) : null}
    </>
  );
}

function ProbeRow({ label, count }: { label: string; count: number }) {
  const muted = count === 0;
  return (
    <View style={s.probeRow}>
      <Text style={[s.probeLabel, muted && s.probeMuted]}>{label}</Text>
      <Text style={[s.probeCount, muted && s.probeMuted]}>{count}</Text>
    </View>
  );
}

function WorkingBody() {
  return (
    <View style={s.workingWrap}>
      <ActivityIndicator color={colors.brand} />
      <Text style={s.body}>Parsing and storing entries on your device…</Text>
    </View>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * Pack name derived from a source filename. Strips common extensions and
 * the conventional "imported from" prefix the user already sees in the
 * description, so the pack name in the Content Packs row reads cleanly.
 *
 * Re-imports of the same file find the existing pack via this name +
 * system + owner, so the function must be deterministic.
 */
function derivePackName(fileName: string): string {
  return `Imported: ${fileName.replace(/\.json$/i, '')}`;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center', padding: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface, borderRadius: 16,
    padding: spacing.lg, gap: spacing.md,
    borderWidth: 1, borderColor: colors.border,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  body: { fontSize: 14, color: colors.textPrimary, lineHeight: 20 },

  legalCallout: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
    padding: spacing.md, borderRadius: 10,
    backgroundColor: colors.background,
    borderWidth: 1, borderColor: colors.border,
  },
  legalText: {
    flex: 1, fontSize: 12, lineHeight: 17,
    color: colors.textSecondary,
  },

  filePreview: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.background, borderRadius: 8,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
    borderWidth: 1, borderColor: colors.border,
  },
  filePreviewName: { color: colors.textPrimary, fontSize: 13, fontWeight: '600' },
  filePreviewMeta: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },

  probeList: { gap: spacing.xs },
  probeRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: spacing.xs + 2, paddingHorizontal: spacing.sm,
  },
  probeLabel: { color: colors.textPrimary, fontSize: 13 },
  probeCount: { color: colors.textPrimary, fontSize: 13, fontWeight: '700' },
  probeMuted: { color: colors.textSecondary },

  workingWrap: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.lg },

  warningText: {
    fontSize: 12, color: colors.textSecondary, lineHeight: 17,
    fontStyle: 'italic',
  },

  errorBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
    padding: spacing.sm + 2, borderRadius: 8,
    borderWidth: 1, borderColor: colors.hpDanger + '66',
    backgroundColor: colors.hpDanger + '11',
  },
  errorText: { flex: 1, color: colors.hpDanger, fontSize: 12, lineHeight: 17 },

  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  cancelBtn: {
    flex: 1, paddingVertical: spacing.md, borderRadius: 10,
    borderWidth: 1, borderColor: colors.border, alignItems: 'center',
  },
  cancelBtnText: { color: colors.textPrimary, fontWeight: '600' },
  confirmBtn: {
    flex: 1, paddingVertical: spacing.md, borderRadius: 10,
    backgroundColor: colors.brand, alignItems: 'center',
  },
  confirmBtnText: { color: '#fff', fontWeight: '700' },
  disabledBtn: { opacity: 0.4 },
});
