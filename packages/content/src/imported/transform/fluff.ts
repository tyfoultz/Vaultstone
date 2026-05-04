// Transform a 5e.tools `fluff-class-*.json` payload into description
// patches for already-imported class and subclass rows.
//
// Fluff files don't carry the structured class/subclass definitions —
// only flavor prose (and image refs we don't yet surface). The user
// imports the structured `class-*.json` first, then the matching
// `fluff-class-*.json` to fill in descriptions. We emit { entryKey,
// description } patches keyed to the same slug shape the class /
// subclass transforms use, so the API layer can read-modify-write the
// matching rows.
//
// Fluff files key on (name + source) for classes and
// (name + source + className + classSource) for subclasses. We
// regenerate the same `imported_${systemId}_class_${slug(source)}_
// ${slug(name)}` keys here so a patch matches its row regardless of
// which source_label the user gave the class file.
//
// `_copy` references are resolved by looking up the referenced fluff
// entry inside the same payload. 5e.tools commonly stores XPHB class
// fluff as a `_copy` of the PHB (5.1) entry — without resolution every
// 2024 class fluff would silently produce zero patches. v1 ignores
// `_mod`/`_trait` overrides; the inherited entries are used verbatim,
// which loses minor 2024-specific edits but recovers the bulk of the
// flavor prose. The patch is emitted under the *copying* entry's
// identity (XPHB Barbarian), so it lands on the row the user actually
// imported, not the source-of-truth row.

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

type RawClassFluff = {
  name: string;
  source: string;
  entries?: RawEntry[];
  /** Inherits entries from the referenced fluff entry. Resolved against
   *  the same file's classFluff array. */
  _copy?: FluffCopyRef;
};

type RawSubclassFluff = {
  name: string;
  source: string;
  className: string;
  classSource?: string;
  /** 5e.tools subclass shortName — same field the structured subclass
   *  transform uses to build entry keys. */
  shortName?: string;
  entries?: RawEntry[];
  _copy?: FluffCopyRef;
};

export type RawFluffFile = {
  classFluff?: RawClassFluff[];
  subclassFluff?: RawSubclassFluff[];
  [key: string]: unknown;
};

export type FluffPatch = {
  /** Matches the entry_key of the structured class / subclass row. */
  entryKey: string;
  /** Class or subclass name, surfaced in import previews. */
  name: string;
  /** Source code (e.g. "XPHB"), surfaced in import previews so the user
   *  can see which edition's fluff is being patched. */
  sourceCode: string;
  /** 'class' or 'subclass' so the import modal can group counts. */
  contentType: 'class' | 'subclass';
  /** Flattened prose to write into the row's `data.description`. */
  description: string;
};

export type TransformOptions = {
  systemId: string;
  sourceLabel?: string;
};

export function transformClassFluff(
  raw: RawFluffFile,
  opts: TransformOptions,
): FluffPatch[] {
  const { systemId } = opts;
  const out: FluffPatch[] = [];

  const classFluff = raw.classFluff ?? [];
  const subclassFluff = raw.subclassFluff ?? [];

  // Resolve a fluff entry's effective `entries` array, walking `_copy`
  // chains within the same file. Returns [] if the chain dead-ends or
  // loops. v1 ignores `_mod`/`_trait` overrides on the copy ref.
  const resolveClassEntries = (f: RawClassFluff, seen = new Set<string>()): RawEntry[] => {
    if (f.entries && f.entries.length > 0) return f.entries;
    if (!f._copy) return [];
    const refKey = `${f._copy.name}|${f._copy.source}`;
    if (seen.has(refKey)) return [];
    seen.add(refKey);
    const target = classFluff.find((c) => c.name === f._copy!.name && c.source === f._copy!.source);
    if (!target) return [];
    return resolveClassEntries(target, seen);
  };

  const resolveSubclassEntries = (f: RawSubclassFluff, seen = new Set<string>()): RawEntry[] => {
    if (f.entries && f.entries.length > 0) return f.entries;
    if (!f._copy) return [];
    const cp = f._copy;
    const refKey = `${cp.name}|${cp.source}|${cp.className ?? ''}|${cp.classSource ?? ''}`;
    if (seen.has(refKey)) return [];
    seen.add(refKey);
    const target = subclassFluff.find(
      (s) =>
        s.name === cp.name &&
        s.source === cp.source &&
        (cp.className ? s.className === cp.className : true) &&
        (cp.classSource ? s.classSource === cp.classSource : true),
    );
    if (!target) return [];
    return resolveSubclassEntries(target, seen);
  };

  for (const f of classFluff) {
    const entries = resolveClassEntries(f);
    const description = stripBoldRuns(entriesToText(entries).trim(), f.name);
    if (!description) continue;
    out.push({
      entryKey: `imported_${systemId}_class_${slugify(f.source)}_${slugify(f.name)}`,
      name: f.name,
      sourceCode: f.source,
      contentType: 'class',
      description,
    });
  }

  for (const f of subclassFluff) {
    const entries = resolveSubclassEntries(f);
    const description = stripBoldRuns(entriesToText(entries).trim(), f.name);
    if (!description) continue;
    const shortName = f.shortName ?? f.name;
    out.push({
      entryKey: `imported_${systemId}_subclass_${slugify(f.source)}_${slugify(f.className)}_${slugify(shortName)}`,
      name: f.name,
      sourceCode: f.source,
      contentType: 'subclass',
      description,
    });
  }

  return out;
}

/**
 * Strip `**bold**` markdown runs from fluff prose. The class detail
 * modal renders descriptions as plain text (DetailModal's subtitle is
 * a `<Text>`, not a Markdown renderer), so leftover `**...**` from
 * `entriesToText`'s named-block formatter would surface as literal
 * asterisks. Inline emphasis inside paragraphs is also cleared so
 * prose reads naturally.
 *
 * Also drops a leading `<Name>.` repeated title — `entriesToText` emits
 * the outermost block's `name` as a bold-prefix label, but the modal
 * already shows the class/subclass name in the header, so the prefix is
 * pure duplication.
 */
function stripBoldRuns(text: string, leadingTitle?: string): string {
  let out = text.replace(/\*\*(.+?)\*\*/g, '$1').trim();
  if (leadingTitle) {
    const escaped = leadingTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`^${escaped}\\.\\s+`), '').trim();
  }
  return out;
}
