// Helpers for picking and parsing a JSON content file (e.g. a 5e.tools
// per-content-type export). Mirrors the shape of components/rulebook/uploadPdf.ts
// but reads the file contents into memory rather than persisting the file
// itself — imported entries are extracted at parse time and stored in the
// imported tier; the source file is then discarded.

import { Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';

export type PickedJson = {
  fileName: string;
  /** Parsed JSON payload. Caller is responsible for shape validation. */
  payload: unknown;
  /** Approximate size in bytes — useful for the progress UI. */
  sizeBytes: number;
};

/**
 * Open the OS file picker for a JSON file, read it, and parse the contents.
 * Returns null if the user cancelled. Throws if the file isn't valid JSON
 * or the picker returns an asset we can't read.
 */
export async function pickContentJson(): Promise<PickedJson | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: 'application/json',
    copyToCacheDirectory: true,
  });

  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];

  let text: string;
  if (Platform.OS === 'web') {
    // On web, expo-document-picker returns a File object on the asset.
    const file = (asset as unknown as { file?: File }).file;
    if (!file) throw new Error('Picked file is not readable on this platform');
    text = await file.text();
  } else {
    text = await FileSystem.readAsStringAsync(asset.uri);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch (err) {
    throw new Error(
      `Selected file is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return {
    fileName: asset.name,
    payload,
    sizeBytes: text.length,
  };
}

/**
 * Probe a parsed JSON payload for known content shapes and report what we
 * found. Used by the import modal to show a "Found N subclasses, M feats…"
 * preview before the user commits.
 *
 * Also reports a `diagnostic` describing what the payload looked like at
 * the top level — surfaced in the modal when nothing importable was
 * recognized so the user can tell whether they picked the wrong file or
 * a file in an unsupported shape. New transforms add their per-key counts
 * here and append to SUPPORTED_TOP_LEVEL_KEYS so the diagnostic copy
 * stays accurate.
 */
export type ImportableContent = {
  subclasses: number;
  feats: number;
  spells: number;
  backgrounds: number;
  /** Sum of `baseitem` + `item` arrays — 5e.tools splits mundane and
   *  magic items across two top-level keys, both of which our items
   *  transform handles. */
  items: number;
  /** Sum of `race` + `subrace` arrays. Subraces are surfaced as
   *  standalone species (named "<Race> (<Subrace>)") to match how the
   *  SRD bundle ships High Elf / Hill Dwarf etc. */
  species: number;
  /** Length of the `monster` array (5e.tools bestiary files). */
  monsters: number;
  /** Length of the `class` array (5e.tools class files). The same file
   *  also carries `subclass`/`subclassFeature`/`classFeature` arrays —
   *  the subclass transform handles its share, the class transform
   *  handles this one. */
  classes: number;
  diagnostic: ImportDiagnostic;
};

/**
 * Per-shape outcome of looking at the payload's top level. Powers the
 * "Nothing to import — here's why" copy in the Confirm step.
 */
export type ImportDiagnostic =
  | { kind: 'ok' }
  | { kind: 'not-object'; actualType: string }
  | { kind: 'no-recognized-keys'; foundKeys: string[] };

/** Keys the importer currently recognizes. Update as transforms land. */
export const SUPPORTED_TOP_LEVEL_KEYS = [
  'subclass', 'feat', 'spell', 'background',
  'baseitem', 'item', 'race', 'subrace', 'monster', 'class',
] as const;

export function probeContent(payload: unknown): ImportableContent {
  // Non-object payloads (arrays, primitives, null) can't carry our
  // expected shape. Report what we did see so the user can correct.
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {
      subclasses: 0,
      feats: 0,
      spells: 0,
      backgrounds: 0,
      items: 0,
      species: 0,
      monsters: 0,
      classes: 0,
      diagnostic: {
        kind: 'not-object',
        actualType: Array.isArray(payload) ? 'array' : payload === null ? 'null' : typeof payload,
      },
    };
  }
  const obj = payload as Record<string, unknown>;
  const probe: ImportableContent = {
    subclasses: 0,
    feats: 0,
    spells: 0,
    backgrounds: 0,
    items: 0,
    species: 0,
    monsters: 0,
    classes: 0,
    diagnostic: { kind: 'ok' },
  };
  if (Array.isArray(obj.subclass)) {
    probe.subclasses = obj.subclass.length;
  }
  if (Array.isArray(obj.feat)) {
    probe.feats = obj.feat.length;
  }
  if (Array.isArray(obj.spell)) {
    probe.spells = obj.spell.length;
  }
  if (Array.isArray(obj.background)) {
    probe.backgrounds = obj.background.length;
  }
  // Items live in two parallel arrays — `baseitem` (mundane) and `item`
  // (magic + variants). Sum them so the probe count matches what the
  // transform will actually emit.
  if (Array.isArray(obj.baseitem)) {
    probe.items += obj.baseitem.length;
  }
  if (Array.isArray(obj.item)) {
    probe.items += obj.item.length;
  }
  // Species: same parallel-array story — `race` + `subrace` both feed
  // the species transform, with subraces surfaced as standalone entries.
  if (Array.isArray(obj.race)) {
    probe.species += obj.race.length;
  }
  if (Array.isArray(obj.subrace)) {
    probe.species += obj.subrace.length;
  }
  if (Array.isArray(obj.monster)) {
    probe.monsters = obj.monster.length;
  }
  if (Array.isArray(obj.class)) {
    probe.classes = obj.class.length;
  }

  // If we recognized nothing, surface the top-level keys so the user
  // can compare against what we expect. Cap the list so a wildly wrong
  // file doesn't dump 100 keys into the modal.
  if (!hasImportableContent(probe)) {
    const foundKeys = Object.keys(obj).slice(0, 10);
    probe.diagnostic = { kind: 'no-recognized-keys', foundKeys };
  }
  return probe;
}

export function hasImportableContent(probe: ImportableContent): boolean {
  return (
    probe.subclasses > 0 ||
    probe.feats > 0 ||
    probe.spells > 0 ||
    probe.backgrounds > 0 ||
    probe.items > 0 ||
    probe.species > 0 ||
    probe.monsters > 0 ||
    probe.classes > 0
  );
}
