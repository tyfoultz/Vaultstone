// Transform 5e.tools subclass + subclassFeature arrays into our SubclassResult
// shape. The two arrays live in the same source file (e.g. `class.json` from
// 5e.tools); subclasses reference their features by pipe-encoded keys, which
// we resolve here.
//
// Pipe-encoded subclassFeatures string format:
//   "name | className | classSource | subclassShortName | subclassSource | level | source"
// Trailing source is optional and defaults to subclassSource.

import type { SubclassResult, ImportSource } from '@vaultstone/types';
import { stripMarkup } from './markup';

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

type RawEntry = string | RawEntryObject;

type RawEntryObject = {
  type?: string;
  name?: string;
  entries?: RawEntry[];
  [key: string]: unknown;
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
  const subclasses = raw.subclass ?? [];
  const features = raw.subclassFeature ?? [];

  // Index features by composite key for O(1) lookup. Key matches the
  // pipe-encoded subclassFeatures string components.
  const featureIdx = new Map<string, RawSubclassFeature>();
  for (const f of features) {
    featureIdx.set(featureKey(f), f);
  }

  return subclasses.map((sc) => {
    const shortName = sc.shortName ?? sc.name;
    const classSource = sc.classSource ?? 'PHB';
    const myFeatures = (sc.subclassFeatures ?? [])
      .map((ref) => resolveFeatureRef(ref, featureIdx, sc, classSource))
      .filter((f): f is RawSubclassFeature => f !== null);

    const features: SubclassResult['features'] = myFeatures
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

    // 5e.tools PHB content is the 2014 edition. Map to the Vaultstone SRD
    // 5.1 class key so it threads under the right parent class. Future
    // 2024-source imports (PHB.5E.2024 / XPHB) would map to -srd-2-0.
    const parentClassKey = `${slugify(sc.className)}-srd-5-1`;

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
      // Imported entries don't claim an SRD edition — that's reserved for
      // bundled SRD content. The importSource carries provenance instead.
      srdVersions: [],
    };
  });
}

// ── Internals ─────────────────────────────────────────────────────────────

function resolveFeatureRef(
  ref: string | { subclassFeature?: string },
  idx: Map<string, RawSubclassFeature>,
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
  return idx.get(key) ?? null;
}

function featureKey(f: RawSubclassFeature): string {
  return featureKeyParts(
    f.name, f.className, f.classSource ?? 'PHB',
    f.subclassShortName, f.subclassSource, f.level, f.source,
  );
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

/**
 * Recursively flatten a 5e.tools entries array into plain text. Strings are
 * passed through stripMarkup; nested entries get joined with paragraph breaks.
 * Tables and other structured entry types stringify to a placeholder for now.
 */
function entriesToText(entries: RawEntry[]): string {
  const out: string[] = [];
  for (const e of entries) {
    if (typeof e === 'string') {
      out.push(stripMarkup(e));
      continue;
    }
    if (e.type === 'entries' || e.type === 'inset' || e.type === undefined) {
      const inner = entriesToText(e.entries ?? []);
      if (e.name) {
        out.push(`**${e.name}.** ${inner}`);
      } else if (inner) {
        out.push(inner);
      }
      continue;
    }
    if (e.type === 'list' && Array.isArray(e.items)) {
      const items = (e.items as RawEntry[])
        .map((item) => (typeof item === 'string' ? stripMarkup(item) : entriesToText([item])))
        .map((t) => `- ${t}`)
        .join('\n');
      out.push(items);
      continue;
    }
    // Tables, quotes, abilityDc, etc. — out of scope for plain-text Stage 3.
    // Leave a marker so we can spot them in the output and decide what to
    // handle next. Using a markdown blockquote keeps it readable in MarkdownText.
    out.push(`> [${e.type ?? 'block'} not yet supported]`);
  }
  return out.join('\n\n');
}

/** Map common 5e.tools source codes to display names. */
function sourceLongName(code: string): string {
  switch (code.toUpperCase()) {
    case 'PHB':  return "Player's Handbook (2014)";
    case 'DMG':  return "Dungeon Master's Guide (2014)";
    case 'MM':   return 'Monster Manual (2014)';
    case 'XPHB': return "Player's Handbook (2024)";
    case 'XDMG': return "Dungeon Master's Guide (2024)";
    case 'XMM':  return 'Monster Manual (2024)';
    case 'XGE':  return "Xanathar's Guide to Everything";
    case 'TCE':  return "Tasha's Cauldron of Everything";
    case 'MTF':  return "Mordenkainen's Tome of Foes";
    case 'VGM':  return "Volo's Guide to Monsters";
    case 'SCAG': return "Sword Coast Adventurer's Guide";
    case 'FTD':  return 'Fizban\'s Treasury of Dragons';
    case 'MPMM': return 'Mordenkainen Presents: Monsters of the Multiverse';
    case 'SRD':  return 'Systems Reference Document';
    default:     return code;
  }
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
