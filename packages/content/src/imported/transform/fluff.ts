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

/**
 * Detects "inline section opener" strings — paragraphs whose first
 * sentence is a short Title-Case label that names a named sub-section
 * 5e.tools collapsed into prose. Three accepted forms:
 *   1. `{@b Primal Instinct.} People of towns…`     (5e.tools raw bold)
 *   2. `**Primal Instinct.** People of towns…`      (post-strip bold)
 *   3. `Primal Instinct. People of towns…`          (no bold at all)
 *
 * The label must be 2–6 Title-Case words ending in a period, immediately
 * followed by a single space and a capitalized body sentence. Single-
 * word labels are rejected to avoid false positives on regular prose
 * that happens to start with a capitalized word (e.g. "Strong embrace…"
 * or "Magic infuses…"). Used by `splitBySectionSource` to recognize
 * named sub-sections that 5e.tools flattened into prose strings rather
 * than separate `{ name, entries }` objects.
 */
const INLINE_SECTION_OPENER =
  /^(?:\{@\w+\s+|\*\*)?\s*[A-Z][A-Za-z'-]*(?:\s+(?:[A-Z][A-Za-z'-]*|of|the|and|a|to|in))+(?:\}|\*\*)?\.\s*(?:\}|\*\*)?\s+[A-Z]/;

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
  /** Flattened prose to write into the row's `data.description`.
   *  Sourced strictly from sections matching the fluff entry's own
   *  source — supplemental sections from later books surface as
   *  `supplementalSections` instead. */
  description: string;
  /**
   * Top-level fluff sections from later supplements (5e.tools fluff
   * files often append XGE / TCE / SCAG additions to a PHB class's
   * fluff entry). The renderer surfaces these in a separate
   * "Supplemental Lore" section keyed on source so they don't bloat
   * the canonical class intro. Empty when the source ships only the
   * own-source content.
   */
  supplementalSections?: Array<{
    /** "XGE" / "TCE" / "SCAG" — the section's declared source. */
    sourceCode: string;
    /** Flattened prose for this section. Already markdown-cleaned via
     *  the same pipeline as `description`. */
    content: string;
  }>;
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
    const allEntries = resolveEntries(f);
    const split = splitBySectionSource(allEntries, f.source, f.name);
    let { own } = split;
    let supplementals = split.supplementals;
    let description = stripBoldRuns(entriesToText(own).trim(), f.name);

    // Fallback: 5e.tools fluff entries don't always lead with bare
    // intro paragraphs. Some classes (e.g. Barbarian) put every
    // top-level entry under a named section, so the strict split
    // produces zero own-source intro prose. We try two cheaper rescues
    // before giving up:
    //   (a) peel leading strings + unnamed entries from inside the
    //       first own-source supplemental block (handles classes whose
    //       fluff is wrapped in a single section with vignettes inside);
    //   (b) if even that produces nothing, promote the entire first
    //       own-source named section into the description so the modal
    //       isn't blank. The named section's contents ("**Music and
    //       Magic.** ...") are perfectly serviceable intro prose; we
    //       drop it from the Lore drawer to avoid duplication.
    if (!description && supplementals.length > 0) {
      const firstOwnIdx = supplementals.findIndex((s) => s.sourceCode === f.source);
      if (firstOwnIdx >= 0) {
        const promoted = peelLeadingProse(supplementals[firstOwnIdx]!.entry, f.source);
        if (promoted.intro.length > 0) {
          description = stripBoldRuns(entriesToText(promoted.intro).trim(), f.name);
          if (promoted.remainder.length === 0) {
            supplementals = supplementals.filter((_, i) => i !== firstOwnIdx);
          } else {
            supplementals = supplementals.map((s, i) =>
              i === firstOwnIdx
                ? { sourceCode: s.sourceCode, entry: { type: 'entries', entries: promoted.remainder } }
                : s,
            );
          }
        } else {
          // (b) Promote the first named child of the wrapper as the
          // intro, leaving the rest in Lore. Render the section's
          // inner entries directly (drop the section header) so the
          // visible description reads as flowing prose instead of
          // "**Primal Instinct.** Anyone might…".
          const firstChild = peelFirstNamedChild(supplementals[firstOwnIdx]!.entry);
          if (firstChild.first) {
            const introEntries = unwrapSectionEntries(firstChild.first);
            description = stripBoldRuns(entriesToText(introEntries).trim(), f.name);
            if (firstChild.rest.length === 0) {
              supplementals = supplementals.filter((_, i) => i !== firstOwnIdx);
            } else {
              supplementals = supplementals.map((s, i) =>
                i === firstOwnIdx
                  ? { sourceCode: s.sourceCode, entry: { type: 'entries', entries: firstChild.rest } }
                  : s,
              );
            }
          }
        }
      }
    }

    // Supplemental sections render through MarkdownText (rich
     // formatting), not the modal subtitle's plain Text — so we keep
     // the `**Sub-Label.**` bold prefixes that `entriesToText` emits
     // for nested 5e.tools blocks. The description below strips them
     // because the subtitle widget can't render bold runs inline.
    const supplementalSections = supplementals
      .map((sec) => ({
        sourceCode: sec.sourceCode,
        content: stripLeadingTitle(entriesToText([sec.entry]).trim(), f.name),
      }))
      .filter((sec) => sec.content.length > 0);
    if (!description && supplementalSections.length === 0) continue;
    out.push({
      entryKey: keyFor(f),
      name: f.name,
      sourceCode: f.source,
      contentType,
      description,
      ...(supplementalSections.length > 0 ? { supplementalSections } : {}),
    });
  }

  return out;
}

/**
 * Split top-level fluff entries into a short canonical intro and
 * collapsible supplemental sections.
 *
 * Two split signals, applied together:
 *  1. Cross-source sections (e.g. an XGE/TCE block embedded in a PHB
 *     class entry) always go to supplementals tagged with their own
 *     source code.
 *  2. Within the entry's own source, the first contiguous run of
 *     strings + unnamed sections is the canonical intro. As soon as a
 *     **named** sub-section appears (`{ name: "Music and Magic", ... }`),
 *     that section and every named sibling after it are pushed into
 *     supplementals under `ownSource`. This keeps the visible class
 *     description to the opening hook and tucks worldbuilding tables
 *     ("Creating a Bard", "Quick Build", "Music and Magic") into the
 *     Lore drawer.
 *
 * Same-source supplementals are emitted as a single grouped section
 * so the UI doesn't render five tiny blocks back-to-back; nested
 * sub-blocks inside a supplemental flow through `entriesToText` as
 * bold-prefixed paragraphs.
 */
function splitBySectionSource(
  entries: RawEntry[],
  ownSource: string,
  /** The fluff entry's own name (e.g. "Barbarian"). 5e.tools often
   *  wraps the canonical content in a `{ name: "Barbarian", type:
   *  "section" }` block whose `name` just restates the entry name —
   *  that's a wrapper to flatten, not a real sub-section. */
  ownName?: string,
): {
  own: RawEntry[];
  supplementals: Array<{ sourceCode: string; entry: RawEntry }>;
} {
  // 5e.tools wraps fluff entries inconsistently: sometimes the payload
  // is a flat array of strings + named sections, sometimes it's a
  // single `{ type: 'section', entries: [...] }` wrapper, and
  // sometimes it's a mix of own-source wrappers + cross-source
  // siblings. Flatten any own-source wrapper at the top level whose
  // own `name` is missing OR matches the fluff entry's name (i.e. a
  // class-title restate, not a real sub-section) so the split
  // heuristic sees the actual content list. Cross-source wrappers
  // stay intact so they get dropped wholesale by the cross-source
  // filter below.
  const ownNameLc = ownName?.trim().toLowerCase() ?? '';
  entries = entries.flatMap((e) => {
    if (typeof e === 'string') return [e];
    const src = (e as { source?: string }).source;
    if (typeof src === 'string' && src !== ownSource) return [e];
    const rawName = (e as { name?: unknown }).name;
    const name = typeof rawName === 'string' ? rawName.trim() : '';
    const isNamedRealSection =
      name.length > 0 && name.toLowerCase() !== ownNameLc;
    if (isNamedRealSection) return [e];
    const inner = e.entries ?? (e.entry !== undefined ? [e.entry] : null);
    return inner && inner.length > 0 ? inner : [e];
  });
  const own: RawEntry[] = [];
  const supplementals: Array<{ sourceCode: string; entry: RawEntry }> = [];
  // Collect own-source named sub-sections so we can group them under a
  // single synthetic supplemental block keyed on `ownSource`.
  const ownNamedSections: RawEntry[] = [];
  let sawOwnNamedSection = false;

  for (const e of entries) {
    if (typeof e === 'string') {
      // Inline section boundary: 5e.tools sometimes flattens what
      // would be a `{ name: '...', entries: [...] }` block into a
      // single string starting with `{@b Primal Instinct.} ...` (or
      // the already-stripped form `**Primal Instinct.** ...`). Treat
      // any string that opens with a bold-prefix label of 1–6 words
      // as the start of a named sub-section so PHB lore (Primal
      // Instinct, A Life of Danger, Creating a Barbarian, Quick
      // Build) collapses into Lore alongside `name`-shaped sections.
      const looksLikeInlineSection = INLINE_SECTION_OPENER.test(e);
      if (looksLikeInlineSection) sawOwnNamedSection = true;
      // Strings before the first named section count as intro prose.
      // Strings after it are paragraph glue between named sections —
      // fold them into the supplemental group so context isn't lost.
      if (sawOwnNamedSection) ownNamedSections.push(e);
      else own.push(e);
      continue;
    }
    const src = (e as { source?: string }).source;
    if (typeof src === 'string' && src !== ownSource) {
      // Cross-source nested section (e.g. an XGE Personal Totems
      // table embedded in a PHB Barbarian fluff entry). The user only
      // imported PHB, so we drop these silently rather than render
      // them as Lore — including them would smuggle in content from
      // a book the user didn't pick, which violates the per-import
      // ToS callout's premise (the user attests rights to *what they
      // imported*, not whatever 5e.tools layered on top).
      continue;
    }
    const isNamed = typeof (e as { name?: unknown }).name === 'string'
      && ((e as { name?: string }).name ?? '').trim().length > 0;
    if (isNamed) {
      sawOwnNamedSection = true;
      ownNamedSections.push(e);
    } else {
      // Unnamed top-level container — treat its contents as intro prose
      // before any named section appears, otherwise fold into the
      // supplemental group to preserve order.
      if (sawOwnNamedSection) ownNamedSections.push(e);
      else own.push(e);
    }
  }

  if (ownNamedSections.length > 0) {
    supplementals.unshift({
      sourceCode: ownSource,
      entry: { type: 'entries', entries: ownNamedSections },
    });
  }
  return { own, supplementals };
}

/**
 * When the top-level split produces no canonical intro (because the
 * fluff entry is already wrapped in a single section with everything
 * inside it), reach one level deeper into the wrapper to peel off
 * leading strings + unnamed entries before the first named sub-block.
 * Mirrors the same own-source heuristic as `splitBySectionSource` but
 * applied to a synthetic wrapper supplemental.
 */
function peelLeadingProse(
  entry: RawEntry,
  ownSource: string,
): { intro: RawEntry[]; remainder: RawEntry[] } {
  if (typeof entry === 'string') return { intro: [entry], remainder: [] };
  const inner = entry.entries ?? (entry.entry !== undefined ? [entry.entry] : []);
  const intro: RawEntry[] = [];
  const remainder: RawEntry[] = [];
  let sawNamed = false;
  for (const e of inner) {
    if (sawNamed) { remainder.push(e); continue; }
    if (typeof e === 'string') { intro.push(e); continue; }
    const src = (e as { source?: string }).source;
    if (typeof src === 'string' && src !== ownSource) { sawNamed = true; remainder.push(e); continue; }
    const isNamed = typeof (e as { name?: unknown }).name === 'string'
      && ((e as { name?: string }).name ?? '').trim().length > 0;
    if (isNamed) { sawNamed = true; remainder.push(e); }
    else intro.push(e);
  }
  return { intro, remainder };
}

/**
 * Last-ditch description fallback: when an entry has no leading prose
 * even one level into the wrapper, return the first child entry as the
 * intro and the rest as the remainder. Used by the patch builder when
 * the structural split would otherwise produce a blank class blurb.
 */
function peelFirstNamedChild(entry: RawEntry): { first: RawEntry | null; rest: RawEntry[] } {
  if (typeof entry === 'string') return { first: entry, rest: [] };
  const inner = entry.entries ?? (entry.entry !== undefined ? [entry.entry] : []);
  if (inner.length === 0) return { first: null, rest: [] };
  return { first: inner[0]!, rest: inner.slice(1) };
}

/**
 * Strip the outer named-section wrapper off a fluff entry so its prose
 * renders without an inline section header. Used when promoting a
 * named section into the canonical class description — the modal
 * already shows the class name as the title, so "**Primal Instinct.**"
 * as a leading bold prefix would feel like a stray heading.
 */
function unwrapSectionEntries(entry: RawEntry): RawEntry[] {
  if (typeof entry === 'string') return [entry];
  return entry.entries ?? (entry.entry !== undefined ? [entry.entry] : []);
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

/**
 * Drop a duplicated `<Name>.` prefix from rich-text content while
 * leaving inline `**bold**` runs intact. Used for supplemental Lore
 * sections, which render through MarkdownText and benefit from the
 * preserved bold prefixes that mark sub-headings.
 */
function stripLeadingTitle(text: string, leadingTitle?: string): string {
  let out = text;
  if (leadingTitle) {
    const escaped = leadingTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`^\\*\\*${escaped}\\.\\*\\*\\s+`), '').trim();
    out = out.replace(new RegExp(`^${escaped}\\.\\s+`), '').trim();
  }
  return out;
}
