// Transform 5e.tools subclass + subclassFeature arrays into our SubclassResult
// shape. The two arrays live in the same source file (e.g. `class.json` from
// 5e.tools); subclasses reference their features by pipe-encoded keys, which
// we resolve here.
//
// Pipe-encoded subclassFeatures string format:
//   "name | className | classSource | subclassShortName | subclassSource | level | source"
// Trailing source is optional and defaults to subclassSource.

import type { SubclassResult, ImportSource } from '@vaultstone/types';
import { entriesToText, slugify, sourceLongName, srdVersionsForSource, type RawEntry, type RawEntryObject } from './entries';

// ── Source-side type sketches ─────────────────────────────────────────────
// We don't import the full 5e.tools schema as a TypeScript type because the
// real schema is enormous. Instead, narrow type sketches that capture only
// the fields we actually read.

type RawSubclass = {
  name: string;
  shortName?: string;
  source: string;
  className: string;
  classSource?: string;
  page?: number;
  subclassFeatures?: Array<string | { subclassFeature?: string; gainSubclassFeature?: boolean }>;
};

type RawSubclassFeature = {
  name: string;
  source: string;
  className: string;
  classSource?: string;
  subclassShortName: string;
  subclassSource: string;
  level: number;
  page?: number;
  entries?: RawEntry[];
};

export type RawClassFile = {
  subclass?: RawSubclass[];
  subclassFeature?: RawSubclassFeature[];
  [key: string]: unknown;
};

// ── Public transform ──────────────────────────────────────────────────────

export type TransformOptions = {
  /** Vaultstone system id the imported entries should be tagged with. */
  systemId: string;
  /** Optional friendly source label captured at import time. */
  sourceLabel?: string;
};

/**
 * Transform a parsed 5e.tools class-file payload into our SubclassResult
 * shape. Returns one SubclassResult per `subclass` entry, with features
 * resolved from the sibling `subclassFeature` array.
 */
export function transformSubclasses(
  raw: RawClassFile,
  opts: TransformOptions,
): SubclassResult[] {
  const { systemId } = opts;
  // 5e.tools' 2024 class files ship every legacy subclass twice — once
  // tagged `edition: 'classic'` (the bare 2014 entry) and once tagged
  // `edition: 'one'` (the 2024-renderer-aware reprint copy). They have
  // identical (name, source, className, shortName), which collapses to
  // the same entry_key and triggers a Postgres `ON CONFLICT DO UPDATE`
  // error mid-import. Dedupe by composite key here, preferring the
  // first occurrence (typically `edition: 'classic'`, which is what
  // 2014-system imports want anyway).
  const subclasses = dedupeSubclassesByKey(raw.subclass ?? []);
  const allFeatures = raw.subclassFeature ?? [];

  // Strict composite-key index for O(1) lookup. Key matches the
  // pipe-encoded subclassFeatures string components.
  const featureIdx = new Map<string, RawSubclassFeature>();
  // Looser fallback index keyed by `subclass + level + featureName` so
  // mismatched class-source casing or unusual ref shapes still resolve.
  // 5e.tools 2024 data occasionally drops or rewrites parts of the
  // composite key, leaving the strict lookup empty even though the
  // feature exists in the file's `subclassFeature[]` array.
  const fallbackIdx = new Map<string, RawSubclassFeature>();
  for (const f of allFeatures) {
    featureIdx.set(featureKey(f), f);
    fallbackIdx.set(fallbackFeatureKey(f), f);
  }

  return subclasses.map((sc) => {
    const shortName = sc.shortName ?? sc.name;
    const classSource = sc.classSource ?? sc.source;
    const myFeatures = (sc.subclassFeatures ?? [])
      .map((ref) => resolveFeatureRef(ref, featureIdx, fallbackIdx, allFeatures, sc, classSource))
      .filter((f): f is RawSubclassFeature => f !== null);

    // 5e.tools 2024 class files often nest sub-features inside a parent
    // feature's `entries` as { type: 'refSubclassFeature', subclassFeature }
    // blocks rather than listing them in the subclass's top-level
    // `subclassFeatures` array. Walk each resolved feature's entries
    // recursively, resolve the refs, and surface them as standalone
    // features so the rendered subclass card shows e.g. L3 "Tools of
    // the Trade" / "Alchemist Spells" / "Experimental Elixir" instead
    // of just the L3 title.
    const seenKeys = new Set(myFeatures.map((f) => featureKey(f)));
    const expandedFeatures: RawSubclassFeature[] = [];
    function collectRefs(entries: RawEntry[] | undefined): void {
      if (!entries) return;
      for (const e of entries) {
        if (typeof e === 'string') continue;
        if (
          (e.type === 'refSubclassFeature' || e.type === 'refClassFeature')
          && typeof (e as { subclassFeature?: unknown }).subclassFeature === 'string'
        ) {
          const refStr = (e as { subclassFeature?: string }).subclassFeature!;
          const resolved = resolveFeatureRef(refStr, featureIdx, fallbackIdx, allFeatures, sc, classSource);
          if (resolved && !seenKeys.has(featureKey(resolved))) {
            seenKeys.add(featureKey(resolved));
            expandedFeatures.push(resolved);
            // Recurse — a resolved ref may itself contain more refs.
            collectRefs(resolved.entries);
          }
          continue;
        }
        // Walk nested entries / items (entries[] for "entries" blocks,
        // items[] for "list" blocks). Other shapes don't carry refs.
        const obj = e as RawEntryObject;
        if (Array.isArray(obj.entries)) collectRefs(obj.entries);
        if (Array.isArray(obj.items)) collectRefs(obj.items as RawEntry[]);
      }
    }
    for (const f of myFeatures) collectRefs(f.entries);
    const allMyFeatures = [...myFeatures, ...expandedFeatures];

    // Sort by level so expanded refs interleave correctly with the
    // top-level features. Without this, refs nested inside the L3
    // title get appended after the L5/L9/L15 features and the rendered
    // card reads out of order. Stable within a level (preserves the
    // original 5e.tools authored order — title first, then sub-features
    // as encountered).
    const sortedFeatures = allMyFeatures
      .map((f, i) => ({ f, i }))
      .sort((a, b) => a.f.level - b.f.level || a.i - b.i)
      .map(({ f }) => f);

    const features: SubclassResult['features'] = sortedFeatures
      .map((f) => ({
        level: f.level,
        name: f.name,
        description: entriesToText(f.entries ?? []),
      }))
      // Drop the bare "subclass title" feature whose name matches the
      // subclass — it's redundant with the subclass description.
      .filter((f) => f.name.toLowerCase() !== sc.name.toLowerCase());

    // The opening description for the subclass is the first feature whose
    // name matches the subclass name (5e.tools convention). Fall back to
    // empty if not present.
    const opening = myFeatures.find((f) => f.name === sc.name);
    const description = opening
      ? entriesToText(opening.entries ?? [])
      : '';

    // Subclass unlocks at the lowest feature level. PHB convention is
    // typically 3 for most classes, but we derive it from data so brews
    // that unlock earlier (Cleric, Sorcerer, Warlock at 1) work.
    const unlockLevel = myFeatures.length > 0
      ? Math.min(...myFeatures.map((f) => f.level))
      : 3;

    const importSource: ImportSource = {
      code: sc.source,
      name: sourceLongName(sc.source),
      page: sc.page,
    };

    // Map the imported source code to the matching Vaultstone SRD edition
    // suffix so the subclass threads under the right parent class on the
    // system detail page. 5e.tools' "X" prefix marks 2024 sources (XPHB,
    // XDMG, XMM); everything else is treated as the 2014 edition. The
    // class detail modal also falls back to name-based matching, so an
    // unrecognized source still surfaces under the matching class on
    // either system page.
    const editionSuffix = is2024Source(sc.source) ? 'srd-2-0' : 'srd-5-1';
    const parentClassKey = `${slugify(sc.className)}-${editionSuffix}`;

    return {
      key: `imported_${systemId}_subclass_${slugify(sc.source)}_${slugify(sc.className)}_${slugify(shortName)}`,
      name: sc.name,
      type: 'subclass',
      tier: 'imported',
      system: systemId,
      description,
      importSource,
      data: {},
      parentClassKey,
      parentClassName: sc.className,
      unlockLevel,
      features,
      // Edition tag derived from the source code (X-prefix = 2024,
      // SRD = both, anything else = 5.1). importSource still carries
      // the full provenance.
      srdVersions: srdVersionsForSource(sc.source),
    };
  });
}

// ── Internals ─────────────────────────────────────────────────────────────

/**
 * Drop duplicate subclass entries that share (source, className,
 * shortName||name) — these arise in 5e.tools 2024 class files, which
 * ship each legacy subclass twice (`edition: 'classic'` vs
 * `edition: 'one'`). The pair has identical mechanical content; one
 * is a presentation tag for the 5e.tools renderer. Both would
 * collapse to the same entry_key on import, so we keep only the
 * first occurrence.
 */
function dedupeSubclassesByKey(subclasses: RawSubclass[]): RawSubclass[] {
  const seen = new Set<string>();
  const out: RawSubclass[] = [];
  for (const sc of subclasses) {
    const shortName = sc.shortName ?? sc.name;
    const key = `${sc.source}|${sc.className}|${shortName}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(sc);
  }
  return out;
}

/**
 * Whether a 5e.tools source code refers to the 2024 edition. 5e.tools
 * conventionally prefixes 2024 sources with "X" (XPHB, XDMG, XMM) while
 * older sources (PHB, DMG, MM, XGE, TCE, etc.) are 2014-era. Anything
 * that doesn't match the known 2024 prefixes falls back to 2014.
 */
function is2024Source(source: string | undefined): boolean {
  if (!source) return false;
  const code = source.toUpperCase();
  return code === 'XPHB' || code === 'XDMG' || code === 'XMM';
}

function resolveFeatureRef(
  ref: string | { subclassFeature?: string },
  idx: Map<string, RawSubclassFeature>,
  fallback: Map<string, RawSubclassFeature>,
  allFeatures: RawSubclassFeature[],
  parent: RawSubclass,
  classSource: string,
): RawSubclassFeature | null {
  const raw = typeof ref === 'string' ? ref : ref.subclassFeature;
  if (!raw) return null;
  const parts = raw.split('|').map((p) => p.trim());
  // Pipe format: "name | className | classSource | subclassShortName | subclassSource | level | source"
  // Empty fields inherit from parent subclass.
  const featureName     = parts[0];
  const featureClass    = parts[1] || parent.className;
  const featureClassSrc = parts[2] || classSource;
  const featureShortNm  = parts[3] || parent.shortName || parent.name;
  const featureSubSrc   = parts[4] || parent.source;
  const featureLevel    = parts[5] ? parseInt(parts[5], 10) : 0;
  const featureSrc      = parts[6] || featureSubSrc;
  const key = featureKeyParts(
    featureName, featureClass, featureClassSrc,
    featureShortNm, featureSubSrc, featureLevel, featureSrc,
  );
  const strict = idx.get(key);
  if (strict) return strict;
  // First fallback — index keyed by the most stable triple
  // (subclassShortName + level + featureName). Catches cases where
  // class-source or feature-source drift between the ref and the
  // index entry.
  const looseHit = fallback.get(fallbackFeatureKeyParts(featureShortNm, featureLevel, featureName));
  if (looseHit) return looseHit;
  // Final fallback — scan the full subclassFeature[] array for any
  // entry whose (name, level) matches and whose subclass identity
  // overlaps with the ref's parent. 5e.tools occasionally encodes the
  // subclass's `subclassShortName` differently in the ref vs. the
  // index entry (capitalization, "the " prefix, etc.); scanning by
  // identity-overlap covers those cases without baking each shape into
  // the index. n is small (~30 features per file) so the linear scan
  // is fine for a one-shot import.
  const refName = featureName.toLowerCase();
  const parentShort = (parent.shortName ?? parent.name).toLowerCase();
  const parentName = parent.name.toLowerCase();
  const refClass = featureClass.toLowerCase();
  for (const f of allFeatures) {
    if (f.level !== featureLevel) continue;
    if (f.name.toLowerCase() !== refName) continue;
    const fShort = (f.subclassShortName ?? '').toLowerCase();
    const fClass = (f.className ?? '').toLowerCase();
    // Identity overlap: at least one of the subclass-side fields agrees
    // with the parent. Prevents matching an unrelated subclass that
    // happens to have a same-named feature at the same level.
    if (
      fShort === parentShort
      || fShort === parentName
      || fClass === refClass
    ) {
      return f;
    }
  }
  return null;
}

function featureKey(f: RawSubclassFeature): string {
  return featureKeyParts(
    f.name, f.className, f.classSource ?? f.source,
    f.subclassShortName, f.subclassSource, f.level, f.source,
  );
}

function fallbackFeatureKey(f: RawSubclassFeature): string {
  return fallbackFeatureKeyParts(f.subclassShortName, f.level, f.name);
}

function fallbackFeatureKeyParts(
  subclassShortName: string, level: number, name: string,
): string {
  return [subclassShortName, level, name].map((s) => String(s).toLowerCase()).join('|');
}

function featureKeyParts(
  name: string, className: string, classSource: string,
  subclassShortName: string, subclassSource: string,
  level: number, source: string,
): string {
  return [name, className, classSource, subclassShortName, subclassSource, level, source]
    .map((s) => String(s).toLowerCase())
    .join('|');
}

