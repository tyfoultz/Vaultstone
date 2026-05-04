// Transform 5e.tools fluff payloads into description patches for
// already-imported content rows. Supports `fluff-class-*.json`,
// `fluff-backgrounds.json`, `fluff-feats.json`, `fluff-items.json`,
// `fluff-races.json`, plus monster fluff if it ever lands.
//
// Fluff files don't carry the structured definitions — only flavor
// prose (and image refs we don't yet surface). The user imports the
// structured `class-*.json` / `backgrounds.json` / etc. first, then
// the matching fluff file to fill in descriptions. We emit
// { entryKey, description, contentType } patches keyed to the same
// slug shape each per-kind transform produces, so a patch matches its
// row regardless of which source_label the user gave the structured
// import.
//
// `_copy` references resolve within the same file. 5e.tools commonly
// stores XPHB class fluff as a `_copy` of the PHB (5.1) entry — without
// resolution every 2024 class fluff would silently produce zero
// patches. v1 ignores `_mod`/`_trait` overrides; the inherited entries
// are used verbatim, which loses minor 2024-specific edits but recovers
// the bulk of the flavor prose. The patch is emitted under the
// *copying* entry's identity (XPHB Barbarian), so it lands on the row
// the user actually imported, not the source-of-truth row.

import { entriesToText, slugify, type RawEntry } from './entries';

// ── Source-side type sketches ─────────────────────────────────────────────

type FluffCopyRef = {
  name: string;
  source: string;
  /** Subclass fluff also disambiguates by className/classSource. */
  className?: string;
  classSource?: string;
  shortName?: string;
};

type RawFluffEntry = {
  name: string;
  source: string;
  entries?: RawEntry[];
  /** Inherits entries from the referenced fluff entry of the same
   *  kind. Resolved against the same file's array for that kind. */
  _copy?: FluffCopyRef;
};

type RawSubclassFluff = RawFluffEntry & {
  className: string;
  classSource?: string;
  /** 5e.tools subclass shortName — same field the structured subclass
   *  transform uses to build entry keys. */
  shortName?: string;
};

type RawSubraceFluff = RawFluffEntry & {
  raceName?: string;
  raceSource?: string;
};

export type RawFluffFile = {
  classFluff?: RawFluffEntry[];
  subclassFluff?: RawSubclassFluff[];
  backgroundFluff?: RawFluffEntry[];
  featFluff?: RawFluffEntry[];
  itemFluff?: RawFluffEntry[];
  raceFluff?: RawFluffEntry[];
  subraceFluff?: RawSubraceFluff[];
  monsterFluff?: RawFluffEntry[];
  [key: string]: unknown;
};

/** Content-type discriminator on a patch — matches the corresponding
 *  imported_content row's content_type. */
export type FluffContentType =
  | 'class' | 'subclass' | 'background' | 'feat' | 'item' | 'species' | 'creature';

export type FluffPatch = {
  /** Matches the entry_key of the structured row. */
  entryKey: string;
  /** Entry name, surfaced in import previews. */
  name: string;
  /** Source code (e.g. "XPHB"), surfaced in previews so the user can
   *  see which edition's fluff is being patched. */
  sourceCode: string;
  /** Content type of the row this patch targets. Used for grouping
   *  counts in the import modal. */
  contentType: FluffContentType;
  /** Flattened prose to write into the row's `data.description`. */
  description: string;
};

export type TransformOptions = {
  systemId: string;
  sourceLabel?: string;
};

/**
 * Multi-kind fluff transform. Reads every recognized fluff array on
 * the payload and emits patches for each. Used by the import modal to
 * fan out to all supported fluff types in one pass.
 */
export function transformFluff(
  raw: RawFluffFile,
  opts: TransformOptions,
): FluffPatch[] {
  const { systemId } = opts;
  const out: FluffPatch[] = [];

  // Class + subclass: same-name resolution by (name, source).
  out.push(...transformSimpleFluffArray({
    list: raw.classFluff ?? [],
    contentType: 'class',
    keyFor: (f) => `imported_${systemId}_class_${slugify(f.source)}_${slugify(f.name)}`,
  }));

  // Subclass: keyed by (source, className, shortName||name).
  out.push(...transformSimpleFluffArray<RawSubclassFluff>({
    list: raw.subclassFluff ?? [],
    contentType: 'subclass',
    keyFor: (f) => {
      const shortName = f.shortName ?? f.name;
      return `imported_${systemId}_subclass_${slugify(f.source)}_${slugify(f.className)}_${slugify(shortName)}`;
    },
    matchCopy: (cp, candidate) =>
      candidate.name === cp.name &&
      candidate.source === cp.source &&
      (cp.className ? candidate.className === cp.className : true) &&
      (cp.classSource ? candidate.classSource === cp.classSource : true),
  }));

  // Backgrounds, feats, items: same shape as classes.
  out.push(...transformSimpleFluffArray({
    list: raw.backgroundFluff ?? [],
    contentType: 'background',
    keyFor: (f) => `imported_${systemId}_background_${slugify(f.source)}_${slugify(f.name)}`,
  }));
  out.push(...transformSimpleFluffArray({
    list: raw.featFluff ?? [],
    contentType: 'feat',
    keyFor: (f) => `imported_${systemId}_feat_${slugify(f.source)}_${slugify(f.name)}`,
  }));
  out.push(...transformSimpleFluffArray({
    list: raw.itemFluff ?? [],
    contentType: 'item',
    keyFor: (f) => `imported_${systemId}_item_${slugify(f.source)}_${slugify(f.name)}`,
  }));

  // Race fluff: keyed identically to base races.
  out.push(...transformSimpleFluffArray({
    list: raw.raceFluff ?? [],
    contentType: 'species',
    keyFor: (f) => `imported_${systemId}_species_${slugify(f.source)}_${slugify(f.name)}`,
  }));

  // Subrace fluff: keyed against the structured species transform's
  // displayName, which is `<Race> (<Subrace>)` for subraces. Anonymous
  // subrace fluff entries (no name) are skipped.
  out.push(...transformSimpleFluffArray<RawSubraceFluff>({
    list: (raw.subraceFluff ?? []).filter((s) => !!s.name),
    contentType: 'species',
    keyFor: (f) => {
      const displayName = f.raceName ? `${f.raceName} (${f.name})` : f.name;
      return `imported_${systemId}_species_${slugify(f.source)}_${slugify(displayName)}`;
    },
  }));

  // Monsters / creatures: parallel pattern. The structured transform
  // emits content_type 'creature' (matches the homebrew authoring path),
  // so the patch row content_type is 'creature' too.
  out.push(...transformSimpleFluffArray({
    list: raw.monsterFluff ?? [],
    contentType: 'creature',
    keyFor: (f) => `imported_${systemId}_monster_${slugify(f.source)}_${slugify(f.name)}`,
  }));

  return out;
}

/**
 * Backward-compat shim: the import modal originally wired up only
 * class fluff. Keep the old export pointing at the new dispatcher so
 * nothing breaks; new callers should use transformFluff directly.
 */
export function transformClassFluff(
  raw: RawFluffFile,
  opts: TransformOptions,
): FluffPatch[] {
  return transformFluff(raw, opts);
}

// ── Internals ─────────────────────────────────────────────────────────────

type FluffArrayConfig<T extends RawFluffEntry> = {
  list: T[];
  contentType: FluffContentType;
  keyFor: (f: T) => string;
  /** How to match a `_copy` reference against another entry in the
   *  same array. Defaults to equality on (name, source). Subclass fluff
   *  overrides this to also key on className/classSource. */
  matchCopy?: (copy: FluffCopyRef, candidate: T) => boolean;
};

function transformSimpleFluffArray<T extends RawFluffEntry>(
  cfg: FluffArrayConfig<T>,
): FluffPatch[] {
  const { list, contentType, keyFor } = cfg;
  const matchCopy = cfg.matchCopy ?? defaultMatchCopy;
  const out: FluffPatch[] = [];

  // Resolve an entry's effective `entries` by walking `_copy` chains
  // within the same array. Returns [] if the chain dead-ends or loops.
  const resolveEntries = (f: T, seen = new Set<string>()): RawEntry[] => {
    if (f.entries && f.entries.length > 0) return f.entries;
    if (!f._copy) return [];
    const refKey = JSON.stringify([f._copy.name, f._copy.source, f._copy.className ?? '', f._copy.classSource ?? '']);
    if (seen.has(refKey)) return [];
    seen.add(refKey);
    const target = list.find((c) => matchCopy(f._copy!, c));
    if (!target) return [];
    return resolveEntries(target, seen);
  };

  for (const f of list) {
    const entries = resolveEntries(f);
    const description = stripBoldRuns(entriesToText(entries).trim(), f.name);
    if (!description) continue;
    out.push({
      entryKey: keyFor(f),
      name: f.name,
      sourceCode: f.source,
      contentType,
      description,
    });
  }

  return out;
}

function defaultMatchCopy(copy: FluffCopyRef, candidate: RawFluffEntry): boolean {
  return candidate.name === copy.name && candidate.source === copy.source;
}

/**
 * Strip `**bold**` markdown runs from fluff prose. The detail modal
 * renders descriptions as plain text (DetailModal's subtitle is a
 * `<Text>`, not a Markdown renderer), so leftover `**...**` from
 * `entriesToText`'s named-block formatter would surface as literal
 * asterisks. Inline emphasis inside paragraphs is also cleared so
 * prose reads naturally.
 *
 * Also drops a leading `<Name>.` repeated title — `entriesToText` emits
 * the outermost block's `name` as a bold-prefix label, but the modal
 * already shows the entry's name in the header, so the prefix is pure
 * duplication.
 */
function stripBoldRuns(text: string, leadingTitle?: string): string {
  let out = text.replace(/\*\*(.+?)\*\*/g, '$1').trim();
  if (leadingTitle) {
    const escaped = leadingTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`^${escaped}\\.\\s+`), '').trim();
  }
  return out;
}
