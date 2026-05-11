// Transform a 5e.tools optional-features payload (top-level
// `optionalfeature` array) into our OptionalFeatureResult shape.
//
// Optional features are class-feature choices the player makes during
// levelling: Eldritch Invocations, Metamagic Options, Battle Master
// Maneuvers, Fighting Styles, Pact Boons, Artificer Infusions, Arcane
// Shots, etc. Distinct from FeatResult — these are gated by a class
// feature (not ASIs / backgrounds) and frequently consume a class
// resource. The character builder's per-class picker filters this
// catalog by `kinds[]`.
//
// 5e.tools quirks worth knowing:
// - `featureType[]` is an array of short codes — most entries carry
//   one, but Fighting Styles often list every class the style is
//   available to (e.g. ["FS:F","FS:P","FS:R"] for Defense). We map all
//   codes onto our `kinds[]` so per-class pickers don't double-walk.
// - 2024 collapsed Pact Boons into Eldritch Invocations — XPHB Pact
//   of the Blade has featureType ["EI"], not ["PB"]. Older entries
//   keep their PB code, so we still recognize it for 2014 imports.
// - `prerequisite[]` is structured: each group is satisfied if all
//   keys match (AND), and groups OR together. We flatten to a single
//   prose line for display, and stash the raw shape on
//   `data.prerequisitesRaw` so the picker can gate without re-parsing.
// - `consumes` is an object with a `name` field naming the resource
//   ("Sorcery Point", "Superiority Die"). At-will features omit it.

import type {
  OptionalFeatureResult, OptionalFeatureKind, ImportSource,
} from '@vaultstone/types';
import { entriesToText, slugify, sourceLongName, srdVersionsForSource, type RawEntry } from './entries';

// ── Source-side type sketches ─────────────────────────────────────────────

type RawOptionalFeature = {
  name: string;
  source: string;
  page?: number;
  /** One or more 5e.tools featureType codes — see KIND_MAP below. */
  featureType: string[];
  /** Structured prerequisite groups; flattened for display. */
  prerequisite?: RawPrerequisite[];
  /** Resource consumed per use, when applicable. */
  consumes?: { name?: string };
  /** Free-form prose. */
  entries?: RawEntry[];
  /** SRD 2024 marker; surfaced as info only — we don't gate on it. */
  srd52?: boolean;
  srd?: boolean;
  [key: string]: unknown;
};

/**
 * Each group is an AND clause; multiple groups in the array OR together.
 * Keys we surface: `level` (with optional class/subclass), `spell` (with
 * chooser entries pre-baked into prose), `optionalfeature` (other
 * optional features that must be taken first — e.g. Lifedrinker
 * requires Pact of the Blade), `pact` (legacy 2014 Warlock pact gating).
 */
type RawPrerequisite = {
  level?: number | { level?: number; class?: { name?: string }; subclass?: { name?: string } };
  spell?: Array<string | RawSpellPrereq>;
  optionalfeature?: string[];
  pact?: string;
  [key: string]: unknown;
};

type RawSpellPrereq = {
  /** Pre-baked display string ("a Warlock Cantrip That Deals Damage"). */
  entry?: string;
  /** Filter expression — we don't surface the raw filter, we prefer entry. */
  choose?: string;
};

export type RawOptionalFeaturesFile = {
  optionalfeature?: RawOptionalFeature[];
  [key: string]: unknown;
};

// ── Public transform ──────────────────────────────────────────────────────

export type TransformOptions = {
  systemId: string;
  sourceLabel?: string;
};

/**
 * Transform a parsed 5e.tools optional-features payload into
 * OptionalFeatureResult[]. One result per source entry. Returns []
 * when the payload has no `optionalfeature` array.
 */
export function transformOptionalFeatures(
  raw: RawOptionalFeaturesFile,
  opts: TransformOptions,
): OptionalFeatureResult[] {
  const { systemId } = opts;
  const features = raw.optionalfeature ?? [];

  return features.map((f) => {
    const importSource: ImportSource = {
      code: f.source,
      name: sourceLongName(f.source),
      page: f.page,
    };
    const kinds = mapKinds(f.featureType ?? []);
    const prerequisites = formatPrerequisites(f.prerequisite);

    const result: OptionalFeatureResult = {
      key: `imported_${systemId}_optional-feature_${slugify(f.source)}_${slugify(f.name)}`,
      name: f.name,
      type: 'optional-feature',
      tier: 'imported',
      system: systemId,
      description: entriesToText(f.entries ?? []).trim(),
      importSource,
      // Stash the raw prerequisite shape so the per-class picker can
      // gate without re-parsing prose. We don't surface this on the
      // detail page; `prerequisites` is the human-readable form.
      data: f.prerequisite ? { prerequisitesRaw: f.prerequisite } : {},
      kinds,
      srdVersions: srdVersionsForSource(f.source),
    };

    if (prerequisites) result.prerequisites = prerequisites;
    if (f.consumes?.name) result.consumes = f.consumes.name;

    return result;
  });
}

// ── Internals ─────────────────────────────────────────────────────────────

/**
 * 5e.tools featureType code → our OptionalFeatureKind discriminator.
 * Unknown codes fall through to 'other' so the catalog still surfaces
 * them; per-class pickers that filter to a specific kind will skip
 * them, which is the right default (better to omit than to miscategorize).
 *
 * Multi-kind entries map every code so a Fighting Style available to
 * fighters and paladins lands in both per-class lists.
 */
const KIND_MAP: Record<string, OptionalFeatureKind> = {
  EI: 'invocation',
  MM: 'metamagic',
  'MV:B': 'maneuver',
  'FS:F': 'fighting-style',
  'FS:P': 'fighting-style',
  'FS:R': 'fighting-style',
  'FS:B': 'fighting-style',
  PB: 'pact-boon',
  AI: 'artificer-infusion',
  AS: 'arcane-shot',
  ED: 'elemental-discipline',
  RN: 'rune',
};

function mapKinds(codes: string[]): OptionalFeatureKind[] {
  const out = new Set<OptionalFeatureKind>();
  for (const code of codes) {
    out.add(KIND_MAP[code] ?? 'other');
  }
  // Stable ordering so the kinds list reads consistently across rows.
  // We sort by the canonical kind order rather than alphabetically so
  // "invocation, metamagic" (when a hypothetical entry has both) reads
  // in the same priority the picker uses.
  const order: OptionalFeatureKind[] = [
    'invocation', 'metamagic', 'maneuver', 'fighting-style',
    'pact-boon', 'artificer-infusion', 'arcane-shot',
    'elemental-discipline', 'rune', 'other',
  ];
  return order.filter((k) => out.has(k));
}

/**
 * Render the prerequisite array as a single prose line. Empty array →
 * empty string (the result then omits the `prerequisites` field).
 */
function formatPrerequisites(prereqs: RawPrerequisite[] | undefined): string {
  if (!prereqs || prereqs.length === 0) return '';
  const groups = prereqs.map(formatPrerequisiteGroup).filter(Boolean);
  return groups.join(' or ');
}

function formatPrerequisiteGroup(group: RawPrerequisite): string {
  const parts: string[] = [];

  // Level + class gating: "Warlock 2", "Level 5".
  if (group.level !== undefined) {
    if (typeof group.level === 'number') {
      parts.push(`Level ${group.level}`);
    } else if (group.level.level !== undefined) {
      const cls = group.level.class?.name;
      const sub = group.level.subclass?.name;
      if (cls && sub) parts.push(`${cls} (${sub}) ${group.level.level}`);
      else if (cls) parts.push(`${cls} ${group.level.level}`);
      else parts.push(`Level ${group.level.level}`);
    }
  }

  // Spell prereqs: prefer the pre-baked `entry` prose ("a Warlock
  // Cantrip That Deals Damage") over the raw filter. Plain strings
  // are spell names with optional `#c` cantrip marker.
  if (Array.isArray(group.spell)) {
    for (const sp of group.spell) {
      if (typeof sp === 'string') {
        // "eldritch blast#c" → "Eldritch Blast cantrip"
        const [name, kind] = sp.split('#');
        const titled = titleCase(name);
        parts.push(kind === 'c' ? `${titled} cantrip` : titled);
      } else if (sp.entry) {
        parts.push(sp.entry);
      }
    }
  }

  // Other optional features the player must already have. Reference
  // strings are pipe-delimited "Name|SOURCE"; we surface just the name.
  if (Array.isArray(group.optionalfeature)) {
    for (const ref of group.optionalfeature) {
      const name = ref.split('|')[0]?.trim();
      if (name) parts.push(name);
    }
  }

  // Legacy 2014 Pact Boon gating ("Pact of the Tome").
  if (typeof group.pact === 'string') {
    parts.push(`Pact of the ${capitalize(group.pact)}`);
  }

  return parts.join(', ');
}

function capitalize(s: string): string {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function titleCase(s: string): string {
  return s.split(' ').map((w) => capitalize(w.toLowerCase())).join(' ');
}
