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
  ActivityIndicator, TextInput, StyleSheet, Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, spacing } from '@vaultstone/ui';
import {
  transformSubclasses, transformFeats, transformSpells, transformBackgrounds, transformItems,
  transformSpecies, transformMonsters, transformClasses, transformFluff,
  transformSpellSourceLookup,
} from '@vaultstone/content';
import type { ContentResult, ImportSource } from '@vaultstone/types';
import {
  createHomebrewPack, listHomebrewPacks,
  upsertImportedEntries, deleteImportedEntriesBySourceLabel,
  patchImportedDescriptions, patchImportedSpellClasses,
} from '@vaultstone/api';
import { useAuthStore } from '@vaultstone/store';
import {
  pickContentJson, probeContent, hasImportableContent, applySourceFilter, UNKNOWN_SOURCE,
  type PickedJson, type ImportableContent, type ImportDiagnostic,
} from './importContentJson';

// Single source of truth for every importable content type. Each kind
// pairs the probe's count field with its content_type code, the
// transform that produces *Result-shaped payloads, the JSON top-level
// key the probe reads, and human-readable labels for the UI. Adding a
// new content type is one entry here plus a probe-counter in
// importContentJson.ts.
type ImportableEntry = ContentResult & {
  importSource?: ImportSource;
  key: string;
  name: string;
};

/** Numeric per-kind count keys on ImportableContent. Excludes the
 *  picker-support fields (sourcesByKind, allSources, diagnostic) which
 *  IMPORT_KINDS never references. */
type ImportableCountKey =
  | 'subclasses' | 'feats' | 'spells' | 'backgrounds'
  | 'items' | 'species' | 'monsters' | 'classes'
  | 'classFluff' | 'backgroundFluff' | 'featFluff' | 'itemFluff'
  | 'speciesFluff' | 'creatureFluff'
  | 'spellClasses';

type ImportKind = {
  /** Field name in ImportableContent — count of items found in the file. */
  countKey: ImportableCountKey;
  /** Top-level JSON keys on the source payload that this kind reads.
   *  Most kinds have one (e.g. `subclass`); items have two
   *  (`baseitem` + `item`) since 5e.tools splits mundane and magic
   *  items across parallel arrays. */
  topLevelKeys: string[];
  /** Plural display label, used in the disclosure list and Confirm rows. */
  label: string;
  /** Lowercase singular content_type for imported_content rows. */
  contentType: string;
  /** Run the matching transform on the full picked payload. */
  transform: (
    payload: never,
    opts: { systemId: string; sourceLabel?: string },
  ) => ImportableEntry[];
};

const IMPORT_KINDS: ImportKind[] = [
  {
    countKey: 'subclasses',
    topLevelKeys: ['subclass'],
    label: 'Subclasses',
    contentType: 'subclass',
    transform: transformSubclasses,
  },
  {
    countKey: 'feats',
    topLevelKeys: ['feat'],
    label: 'Feats',
    contentType: 'feat',
    transform: transformFeats,
  },
  {
    countKey: 'spells',
    topLevelKeys: ['spell'],
    label: 'Spells',
    contentType: 'spell',
    transform: transformSpells,
  },
  {
    countKey: 'backgrounds',
    topLevelKeys: ['background'],
    label: 'Backgrounds',
    contentType: 'background',
    transform: transformBackgrounds,
  },
  {
    countKey: 'items',
    topLevelKeys: ['baseitem', 'item'],
    label: 'Items',
    contentType: 'item',
    transform: transformItems,
  },
  {
    countKey: 'species',
    topLevelKeys: ['race', 'subrace'],
    label: 'Species',
    contentType: 'species',
    transform: transformSpecies,
  },
  {
    countKey: 'monsters',
    topLevelKeys: ['monster'],
    label: 'Monsters',
    // The homebrew authoring side uses content_type: 'creature' (see
    // CreatureFormModal); imported monsters use the same word so a
    // future filter or counter that groups by content_type sees both
    // origins as the same kind.
    contentType: 'creature',
    transform: transformMonsters,
  },
  {
    countKey: 'classes',
    topLevelKeys: ['class'],
    label: 'Classes',
    contentType: 'class',
    transform: transformClasses,
  },
];

// Fluff kinds are intentionally NOT in IMPORT_KINDS — they don't
// produce *Result entries, they produce description patches that merge
// into existing rows. The Confirm rows, source filter, and patch path
// each special-case them. Listed here so the disclosure list and
// label list still mention every supported flavor kind.
type FluffKind = {
  countKey: ImportableCountKey;
  topLevelKeys: string[];
  label: string;
};
const FLUFF_KINDS: FluffKind[] = [
  { countKey: 'classFluff',      topLevelKeys: ['classFluff', 'subclassFluff'], label: 'Class flavor' },
  { countKey: 'backgroundFluff', topLevelKeys: ['backgroundFluff'],             label: 'Background flavor' },
  { countKey: 'featFluff',       topLevelKeys: ['featFluff'],                   label: 'Feat flavor' },
  { countKey: 'itemFluff',       topLevelKeys: ['itemFluff'],                   label: 'Item flavor' },
  { countKey: 'speciesFluff',    topLevelKeys: ['raceFluff', 'subraceFluff'],   label: 'Species flavor' },
  { countKey: 'creatureFluff',   topLevelKeys: ['monsterFluff'],                label: 'Creature flavor' },
];

// Spell-source-lookup is its own kind — neither an entry producer nor a
// fluff-style description patch. It merges class lists onto existing
// imported spell rows so class-detail spell tables surface them. Kept
// in its own constant (singular) since the file shape is one-of and
// the disclosure / probe rows render it once.
const SPELL_CLASSES_KIND = {
  countKey: 'spellClasses' as const,
  label: 'Spell class lists',
};

type Props = {
  visible: boolean;
  systemId: string;
  onClose: () => void;
  /** Fires after a successful import so the caller can refresh state. */
  onImported: () => void;
  /** When set, the import targets this existing pack instead of creating
   *  a new one. The pack-name field is hidden; only "Source label" shows. */
  packId?: string;
  /** When set, pre-fills the source label and (in re-import mode) targets
   *  that exact card to refresh. Combined with `packId`, this is the
   *  "Re-import this card" flow from the pack detail page. */
  initialSourceLabel?: string;
};

type Phase = 'intro' | 'confirm' | 'working';

export function ImportContentModal({
  visible, systemId, onClose, onImported, packId, initialSourceLabel,
}: Props) {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const targetPackId = packId ?? null;
  const [phase, setPhase] = useState<Phase>('intro');
  const [picked, setPicked] = useState<PickedJson | null>(null);
  const [probe, setProbe] = useState<ImportableContent | null>(null);
  // Pack name draft — only used in "create new pack" mode (no packId).
  // When importing into an existing pack, the user names the *card*
  // (source label) instead.
  const [packNameDraft, setPackNameDraft] = useState('');
  // Source label draft — the per-card name. Defaults to filename-derived.
  // Used as the dedupe key alongside packId; same label re-imported with
  // a fresh file refreshes the card, different label creates a new card.
  const [sourceLabelDraft, setSourceLabelDraft] = useState(initialSourceLabel ?? '');
  // Source filter state — the set of `source` codes the user has chosen
  // to keep. `null` means "import everything" (single-source files
  // skip the picker entirely; multi-source files default to all-on
  // until the user narrows). Switches back to `null` on every reset
  // so it never leaks across imports.
  const [selectedSources, setSelectedSources] = useState<Set<string> | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setPhase('intro');
    setPicked(null);
    setProbe(null);
    setPackNameDraft('');
    setSourceLabelDraft(initialSourceLabel ?? '');
    setSelectedSources(null);
    setError(null);
  }

  // Filtered counts after the source picker is applied. When no probe
  // exists yet (intro phase) we render zeros — the Import button only
  // appears in confirm phase, so this is safe.
  const filteredCounts = probe
    ? applySourceFilter(probe, selectedSources)
    : {
        subclasses: 0, feats: 0, spells: 0, backgrounds: 0, items: 0,
        species: 0, monsters: 0, classes: 0,
        classFluff: 0, backgroundFluff: 0, featFluff: 0, itemFluff: 0,
        speciesFluff: 0, creatureFluff: 0, spellClasses: 0,
      };
  const hasFilteredContent = Object.values(filteredCounts).some((n) => n > 0);

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
      // Multi-source files start with every source selected (so the
      // user sees full counts and can opt-in to narrowing). Single-
      // source files leave the picker null — no UI rendered.
      setSelectedSources(
        probeResult.allSources.length > 1
          ? new Set(probeResult.allSources)
          : null,
      );
      // In create-pack mode, default both fields from the filename. In
      // existing-pack mode, only the source label is editable; default
      // to filename if the caller didn't pre-fill (re-import would have).
      if (!targetPackId) {
        setPackNameDraft(deriveDefaultName(result.fileName));
      }
      if (!sourceLabelDraft) {
        setSourceLabelDraft(deriveDefaultName(result.fileName));
      }
      setPhase('confirm');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleImport() {
    if (!picked || !probe || !userId) return;
    const sourceLabel = sourceLabelDraft.trim() || deriveDefaultName(picked.fileName);
    setPhase('working');
    setError(null);
    try {
      let packIdResolved = targetPackId;

      // Top-level entry point: create a new pack named by the user.
      // In-pack entry point: targetPackId is set, skip creation.
      if (!packIdResolved) {
        const packName = packNameDraft.trim() || deriveDefaultName(picked.fileName);
        // Look up an existing pack by exact name + system + owner so a
        // user re-running the top-level "Import" with the same pack
        // name lands in the existing pack instead of duplicating it.
        // Renaming creates a new pack.
        const { data: existingPacks } = await listHomebrewPacks({ system: systemId });
        let pack = existingPacks?.find(
          (p) => p.owner_user_id === userId && p.name === packName,
        ) ?? null;

        if (!pack) {
          const { data: created, error: createErr } = await createHomebrewPack({
            ownerUserId: userId,
            system: systemId,
            name: packName,
            description: null,
          });
          if (createErr || !created) {
            throw new Error(createErr?.message ?? 'Failed to create pack');
          }
          pack = created;
        }
        packIdResolved = pack.id;
      }

      // Wipe entries under this (pack, source_label) before re-importing
      // so removed entries (renamed source-keys, deleted upstream) don't
      // linger. Authored entries and other cards in the same pack are
      // untouched — the wipe is scoped to this card only. Only run the
      // wipe when this import will actually write entries — patch-only
      // imports (fluff, spell-source-lookup) produce row updates, not
      // new rows, and would otherwise wipe a same-named card the user
      // actually wants to keep.
      const hasEntryProducingKind = IMPORT_KINDS.some(
        (k) => probe[k.countKey] > 0,
      );
      if (hasEntryProducingKind) {
        await deleteImportedEntriesBySourceLabel(packIdResolved, sourceLabel);
      }

      // Apply the source filter (when set). Build a shallow clone of
      // the payload with each top-level array narrowed to entries whose
      // `source` is in `selectedSources`. Transforms read these arrays
      // directly, so the filter is invisible to them — they just see a
      // smaller input. `selectedSources === null` means no filter; the
      // payload passes through unchanged.
      const transformPayload = selectedSources
        ? filterPayloadBySource(picked.payload, selectedSources)
        : picked.payload;

      // Run every transform whose top-level key the probe found. A
      // single file can carry multiple content types (e.g. an XPHB.json
      // with both `subclass` and `feat` arrays); the IMPORT_KINDS table
      // is the registry, this loop just concats their outputs.
      const entriesToUpsert: Parameters<typeof upsertImportedEntries>[0]['entries'] = [];
      for (const kind of IMPORT_KINDS) {
        const count = probe[kind.countKey];
        if (typeof count !== 'number' || count === 0) continue;
        const produced = kind.transform(transformPayload as never, {
          systemId,
          sourceLabel: picked.fileName,
        });
        for (const entry of produced) {
          entriesToUpsert.push({
            contentType: kind.contentType,
            name: entry.name,
            entryKey: entry.key,
            data: entry,
            sourceCode: entry.importSource?.code,
            sourceName: entry.importSource?.name,
            sourcePage: entry.importSource?.page,
            sourceUrl: picked.fileName,
          });
        }
      }

      const { error: upsertErr } = await upsertImportedEntries({
        packId: packIdResolved,
        userId,
        sourceLabel,
        entries: entriesToUpsert,
      });
      if (upsertErr) throw new Error(upsertErr.message);

      // Flavor / fluff — separate path. Fluff files carry description
      // prose for already-imported rows (class, subclass, background,
      // feat, item, species, creature); they get merged into the
      // existing row's `data.description` rather than creating new
      // entries. Pack-scoped, so the user can import fluff under any
      // source_label (typically a different filename than the
      // structured file) — patch matching ignores source_label and
      // keys only on entry_key.
      const totalFluffProbe = FLUFF_KINDS.reduce(
        (n, k) => n + (probe[k.countKey] ?? 0),
        0,
      );
      if (totalFluffProbe > 0) {
        const patches = transformFluff(transformPayload as never, {
          systemId,
          sourceLabel: picked.fileName,
        });
        if (patches.length > 0) {
          const { patched, error: patchErr } = await patchImportedDescriptions({
            packId: packIdResolved,
            patches: patches.map((p) => ({
              entryKey: p.entryKey,
              description: p.description,
              // Forward name + contentType so the API can fall back to
              // a (name, content_type) lookup when the source-coded
              // entry_key doesn't match. This bridges fluff entries
              // sourced under the 2014 code (e.g. DMG) onto rows the
              // user imported under the 2024 code (e.g. XDMG).
              name: p.name,
              contentType: p.contentType,
            })),
            fluffSource: { fileName: picked.fileName, sourceLabel },
          });
          if (patchErr) throw new Error(patchErr.message);
          // No matching rows in the pack — the user imported the
          // fluff before the structured file. Surface it instead of
          // silently no-opping so they can correct the ordering.
          if (patched === 0) {
            throw new Error(
              `Fluff produced ${patches.length} patches but matched 0 rows. Import the matching structured file first, then re-import the fluff.`,
            );
          }
        }
      }

      // Spell-source-lookup — third path. Same model as fluff: the
      // file doesn't carry structured spell entries, it carries class-
      // assignment metadata that gets merged onto existing imported
      // spell rows. Source filter is irrelevant for this file (it's
      // single-purpose), so we transform the original payload.
      if (probe.spellClasses > 0) {
        const classPatches = transformSpellSourceLookup(
          picked.payload as Parameters<typeof transformSpellSourceLookup>[0],
          { systemId },
        );
        if (classPatches.length > 0) {
          const { patched, error: patchErr } = await patchImportedSpellClasses({
            packId: packIdResolved,
            patches: classPatches.map((p) => ({
              entryKey: p.entryKey,
              classes: p.classes,
              // Name fallback bridges the 2014/2024 source-code split
              // when the lookup file groups spells under their original
              // source but the user imported the 2024 sibling.
              name: p.name,
            })),
            classesSource: { fileName: picked.fileName, sourceLabel },
          });
          if (patchErr) throw new Error(patchErr.message);
          if (patched === 0) {
            throw new Error(
              `Spell class lookup produced ${classPatches.length} patches but matched 0 rows. Import the matching spells file first, then re-import the lookup.`,
            );
          }
        }
      }

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
            <ConfirmBody
              picked={picked}
              probe={probe}
              packName={packNameDraft}
              onPackNameChange={setPackNameDraft}
              sourceLabel={sourceLabelDraft}
              onSourceLabelChange={setSourceLabelDraft}
              showPackNameField={!targetPackId}
              // Re-import mode locks the source label field. The caller
              // pre-fills `initialSourceLabel` with the existing card's
              // label; letting the user edit it silently forks into a
              // new card and drops the original entries (the wipe step
              // is keyed by the in-flight label, not the original).
              lockSourceLabel={!!initialSourceLabel}
              selectedSources={selectedSources}
              onToggleSource={(src) => {
                setSelectedSources((prev) => {
                  const next = new Set(prev ?? probe.allSources);
                  if (next.has(src)) next.delete(src);
                  else next.add(src);
                  return next;
                });
              }}
            />
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
                  style={[s.confirmBtn, !hasFilteredContent && s.disabledBtn]}
                  onPress={handleImport}
                  disabled={!hasFilteredContent}
                >
                  <Text style={s.confirmBtnText}>
                    {hasFilteredContent ? 'Import' : 'Nothing to import'}
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
  const [formatsOpen, setFormatsOpen] = useState(false);
  return (
    <>
      <Text style={s.body}>
        Pick a JSON file containing game content. Vaultstone will parse
        it on this device, save the entries to your account as a content
        pack, and surface them across the app alongside SRD content.
      </Text>

      <Pressable
        onPress={() => setFormatsOpen((v) => !v)}
        style={s.formatsHeader}
        accessibilityRole="button"
      >
        <MaterialCommunityIcons
          name={formatsOpen ? 'chevron-down' : 'chevron-right'}
          size={18}
          color={colors.textSecondary}
        />
        <Text style={s.formatsHeaderText}>Supported content types</Text>
      </Pressable>
      {formatsOpen ? (
        <View style={s.formatsBody}>
          {IMPORT_KINDS.map((k) => (
            <Text key={k.contentType} style={s.formatsLine}>• {k.label}</Text>
          ))}
          {FLUFF_KINDS.map((k) => (
            <Text key={k.countKey} style={s.formatsLine}>• {k.label}</Text>
          ))}
          <Text style={s.formatsLine}>• {SPELL_CLASSES_KIND.label}</Text>
        </View>
      ) : null}

      <View style={s.legalCallout}>
        <MaterialCommunityIcons name="shield-account-outline" size={18} color={colors.textSecondary} />
        <Text style={s.legalText}>
          You're responsible for the rights to any content you import.
          Imported content is saved to your Vaultstone account so it syncs
          across your devices and can be enabled on campaigns you DM.
        </Text>
      </View>
    </>
  );
}

function ConfirmBody({
  picked, probe, packName, onPackNameChange, sourceLabel, onSourceLabelChange, showPackNameField,
  lockSourceLabel, selectedSources, onToggleSource,
}: {
  picked: PickedJson;
  probe: ImportableContent;
  packName: string;
  onPackNameChange: (s: string) => void;
  sourceLabel: string;
  onSourceLabelChange: (s: string) => void;
  showPackNameField: boolean;
  /** Re-import mode — the source label is fixed and shown read-only.
   *  Editing the label would silently fork into a new card. */
  lockSourceLabel: boolean;
  /** null = no picker; otherwise the set of source codes the user has on. */
  selectedSources: Set<string> | null;
  onToggleSource: (src: string) => void;
}) {
  const filteredCounts = applySourceFilter(probe, selectedSources);
  return (
    <>
      <View style={s.filePreview}>
        <MaterialCommunityIcons name="file-code-outline" size={20} color={colors.brand} />
        <View style={{ flex: 1 }}>
          <Text style={s.filePreviewName} numberOfLines={1}>{picked.fileName}</Text>
          <Text style={s.filePreviewMeta}>{formatBytes(picked.sizeBytes)}</Text>
        </View>
      </View>
      {showPackNameField ? (
        <View style={s.nameField}>
          <Text style={s.nameFieldLabel}>Pack name</Text>
          <TextInput
            value={packName}
            onChangeText={onPackNameChange}
            style={s.nameFieldInput}
            placeholder="My PHB pack"
            placeholderTextColor={colors.textSecondary}
          />
          <Text style={s.nameFieldHint}>
            A new pack with this name will be created (or reused if you
            already own one).
          </Text>
        </View>
      ) : null}
      <View style={s.nameField}>
        <Text style={s.nameFieldLabel}>Source label</Text>
        {lockSourceLabel ? (
          <View style={s.lockedField}>
            <MaterialCommunityIcons name="lock-outline" size={14} color={colors.textSecondary} />
            <Text style={s.lockedFieldText} numberOfLines={1}>{sourceLabel}</Text>
          </View>
        ) : (
          <TextInput
            value={sourceLabel}
            onChangeText={onSourceLabelChange}
            style={s.nameFieldInput}
            placeholder="PHB"
            placeholderTextColor={colors.textSecondary}
          />
        )}
        <Text style={s.nameFieldHint}>
          {lockSourceLabel
            ? 'Re-importing this card refreshes its entries in place. To create a separate card, cancel and use "Add imported content" instead.'
            : 'Each import inside a pack is a separate "card". Re-importing with the same label refreshes that card; a new label adds another card.'}
        </Text>
      </View>
      {selectedSources && probe.allSources.length > 1 ? (
        <SourcePicker
          probe={probe}
          selectedSources={selectedSources}
          onToggle={onToggleSource}
        />
      ) : null}
      <Text style={s.body}>Will be imported:</Text>
      <View style={s.probeList}>
        {IMPORT_KINDS.map((k) => (
          <ProbeRow
            key={k.contentType}
            label={k.label}
            count={filteredCounts[k.countKey] ?? 0}
          />
        ))}
        {FLUFF_KINDS.map((k) => (
          <ProbeRow
            key={k.countKey}
            label={k.label}
            count={filteredCounts[k.countKey] ?? 0}
          />
        ))}
        <ProbeRow
          key={SPELL_CLASSES_KIND.countKey}
          label={SPELL_CLASSES_KIND.label}
          count={filteredCounts[SPELL_CLASSES_KIND.countKey] ?? 0}
        />
      </View>
      {!hasImportableContent(probe) ? (
        <DiagnosticHint diagnostic={probe.diagnostic} />
      ) : null}
    </>
  );
}

/**
 * Multi-source picker — renders a chip per distinct `source` code across
 * the file with the per-source total in parentheses. Selected chips
 * include their entries in the import; unselected chips skip them. Only
 * rendered when the file has 2+ distinct sources (single-source files
 * pass `selectedSources = null` from above and skip the picker).
 */
function SourcePicker({
  probe, selectedSources, onToggle,
}: {
  probe: ImportableContent;
  selectedSources: Set<string>;
  onToggle: (src: string) => void;
}) {
  // Sum entries per source across every kind so the chip can show the
  // total contribution at a glance ("XPHB · 17", "PHB · 42").
  const totalsBySource: Record<string, number> = {};
  for (const counts of Object.values(probe.sourcesByKind)) {
    for (const [src, n] of Object.entries(counts)) {
      totalsBySource[src] = (totalsBySource[src] ?? 0) + n;
    }
  }
  return (
    <View style={s.nameField}>
      <Text style={s.nameFieldLabel}>Sources to include</Text>
      <View style={s.sourcePickerRow}>
        {probe.allSources.map((src) => {
          const selected = selectedSources.has(src);
          const label = src === UNKNOWN_SOURCE ? 'No source' : src;
          return (
            <TouchableOpacity
              key={src}
              onPress={() => onToggle(src)}
              style={[s.sourceChip, selected && s.sourceChipActive]}
              accessibilityRole="button"
              accessibilityState={{ selected }}
            >
              <Text style={[s.sourceChipText, selected && s.sourceChipTextActive]}>
                {label} · {totalsBySource[src] ?? 0}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={s.nameFieldHint}>
        This file contains entries from multiple sources. Tap to include
        or exclude each one.
      </Text>
    </View>
  );
}

/**
 * "Nothing to import" hint with shape-specific diagnostics so the user can
 * tell whether they picked the wrong file or a file in an unsupported
 * shape. Only renders when the probe found zero importable content.
 */
function DiagnosticHint({ diagnostic }: { diagnostic: ImportDiagnostic }) {
  if (diagnostic.kind === 'not-object') {
    return (
      <View style={s.diagnosticBox}>
        <Text style={s.diagnosticTitle}>Nothing to import</Text>
        <Text style={s.diagnosticBody}>
          The file's top level is {indefiniteArticle(diagnostic.actualType)}{' '}
          <Text style={s.diagnosticCode}>{diagnostic.actualType}</Text>; we
          expect a JSON object with a {renderKeyList()} array (5e.tools format).
        </Text>
      </View>
    );
  }
  if (diagnostic.kind === 'no-recognized-keys') {
    return (
      <View style={s.diagnosticBox}>
        <Text style={s.diagnosticTitle}>Nothing to import</Text>
        <Text style={s.diagnosticBody}>
          We looked for a {renderKeyList()} array but didn't find any. The
          file's top-level keys are:{' '}
          <Text style={s.diagnosticCode}>
            {diagnostic.foundKeys.length === 0 ? '(empty object)' : diagnostic.foundKeys.join(', ')}
          </Text>
          .
        </Text>
        <Text style={s.diagnosticBody}>
          Vaultstone currently imports {renderLabelList()}; support for
          additional content types is coming.
        </Text>
      </View>
    );
  }
  return null;
}

/**
 * Inline-render the flat list of every supported top-level key (across
 * all import kinds) as code spans joined with commas + an "or" before
 * the last entry. Single source of truth for the diagnostic copy —
 * adding to IMPORT_KINDS updates here automatically.
 */
function renderKeyList() {
  const keys = [
    ...IMPORT_KINDS.flatMap((k) => k.topLevelKeys),
    ...FLUFF_KINDS.flatMap((k) => k.topLevelKeys),
  ];
  return keys.map((key, i) => (
    <Text key={key}>
      {i > 0 ? (i === keys.length - 1 ? ', or ' : ', ') : ''}
      <Text style={s.diagnosticCode}>{key}</Text>
    </Text>
  ));
}

/** Plural label list ("subclasses, feats, spells, and backgrounds"). */
function renderLabelList(): string {
  const labels = [
    ...IMPORT_KINDS.map((k) => k.label.toLowerCase()),
    ...FLUFF_KINDS.map((k) => k.label.toLowerCase()),
    SPELL_CLASSES_KIND.label.toLowerCase(),
  ];
  if (labels.length <= 1) return labels.join('');
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`;
}

function indefiniteArticle(word: string): string {
  return /^[aeiou]/i.test(word) ? 'an' : 'a';
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
 * Default name (pack name + source label) derived from a source filename.
 * Strips the .json extension. Used for both first-time pack creation and
 * card-label defaults so the user has a sensible starting point. They're
 * free to edit either.
 */
function deriveDefaultName(fileName: string): string {
  return fileName.replace(/\.json$/i, '');
}

/**
 * Shallow-clone a 5e.tools payload with the recognized top-level arrays
 * narrowed to entries whose `source` is in `selectedSources`. Entries
 * with no `source` field bucket under UNKNOWN_SOURCE — same key the
 * picker presents as "No source". Other top-level keys are copied
 * unchanged so cross-references the transforms might consult (e.g.
 * `subclassFeature[]`, `classFeature[]`) still resolve.
 */
function filterPayloadBySource(payload: unknown, selectedSources: Set<string>): unknown {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload;
  const obj = payload as Record<string, unknown>;
  // NOTE: every fluff array (`classFluff`, `subclassFluff`,
  // `backgroundFluff`, `featFluff`, `itemFluff`, `raceFluff`,
  // `subraceFluff`, `monsterFluff`) is intentionally NOT filtered.
  // Fluff entries commonly use `_copy` to inherit prose from another
  // fluff entry inside the same file (e.g. XPHB Barbarian fluff
  // `_copy`s the PHB Barbarian fluff). If we filter the array before
  // the transform runs, the `_copy` target gets stripped and resolution
  // silently dead-ends. The transform itself only emits patches keyed
  // to entry_keys that exist in the pack, so unselected-source fluff
  // has no effect downstream.
  const KEYS = ['subclass', 'feat', 'spell', 'background', 'baseitem', 'item', 'race', 'subrace', 'monster', 'class'];
  const out: Record<string, unknown> = { ...obj };
  for (const key of KEYS) {
    const arr = obj[key];
    if (!Array.isArray(arr)) continue;
    out[key] = arr.filter((entry) => {
      const src = (entry && typeof entry === 'object' && 'source' in entry
        ? String((entry as { source?: unknown }).source ?? '')
        : '') || UNKNOWN_SOURCE;
      return selectedSources.has(src);
    });
  }
  return out;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center', alignItems: 'center', padding: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface, borderRadius: 16,
    padding: spacing.lg, gap: spacing.md,
    borderWidth: 1, borderColor: colors.border,
    width: '100%', maxWidth: 560,
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

  formatsHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingVertical: spacing.xs,
  },
  formatsHeaderText: {
    fontSize: 13, fontWeight: '600', color: colors.textPrimary,
  },
  formatsBody: {
    gap: spacing.xs + 2,
    paddingHorizontal: spacing.sm + 2,
    paddingBottom: spacing.xs,
  },
  formatsLine: {
    fontSize: 12, color: colors.textSecondary, lineHeight: 17,
  },

  filePreview: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.background, borderRadius: 8,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
    borderWidth: 1, borderColor: colors.border,
  },
  filePreviewName: { color: colors.textPrimary, fontSize: 13, fontWeight: '600' },
  filePreviewMeta: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },

  nameField: { gap: spacing.xs },
  nameFieldLabel: {
    fontSize: 11, color: colors.textSecondary, fontWeight: '700',
    letterSpacing: 1, textTransform: 'uppercase',
  },
  nameFieldInput: {
    backgroundColor: colors.background,
    borderColor: colors.border, borderWidth: 1, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    color: colors.textPrimary, fontSize: 14,
  },
  nameFieldHint: {
    fontSize: 11, color: colors.textSecondary, lineHeight: 15,
  },
  lockedField: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1, borderColor: colors.border,
  },
  lockedFieldText: {
    flex: 1, color: colors.textPrimary, fontSize: 14, fontWeight: '600',
  },

  sourcePickerRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 6,
  },
  sourceChip: {
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: colors.background,
    borderWidth: 1, borderColor: colors.border,
  },
  sourceChipActive: {
    backgroundColor: colors.brand + '22',
    borderColor: colors.brand,
  },
  sourceChipText: {
    fontSize: 12, color: colors.textSecondary, fontWeight: '600',
  },
  sourceChipTextActive: {
    color: colors.textPrimary,
  },

  probeList: { gap: spacing.xs },
  probeRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: spacing.xs + 2, paddingHorizontal: spacing.sm,
  },
  probeLabel: { color: colors.textPrimary, fontSize: 13 },
  probeCount: { color: colors.textPrimary, fontSize: 13, fontWeight: '700' },
  probeMuted: { color: colors.textSecondary },

  workingWrap: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.lg },

  diagnosticBox: {
    gap: spacing.xs,
    padding: spacing.sm + 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  diagnosticTitle: {
    fontSize: 13, fontWeight: '700', color: colors.textPrimary,
  },
  diagnosticBody: {
    fontSize: 12, color: colors.textSecondary, lineHeight: 17,
  },
  diagnosticCode: {
    fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
    color: colors.textPrimary,
    fontWeight: '600',
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
