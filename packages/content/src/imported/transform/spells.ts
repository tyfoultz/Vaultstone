// Transform a 5e.tools spells payload (top-level `spell` array) into our
// SpellResult shape. Mirrors the subclass + feat transforms.
//
// 5e.tools spell quirks worth knowing:
// - `school` is a single-letter code; we expand to the full word so it
//   reads cleanly alongside SRD spells in the same UI.
// - `time`, `range`, `duration` are structured arrays/objects; we render
//   each to a single display string matching the SRD format ("Action",
//   "60 feet", "instantaneous").
// - `components` is an object with v/s/m keys, where m may carry the
//   material-component prose. We only surface V/S/M letters in the
//   components array (matching the SRD shape); the material prose is
//   dropped in v1 — the SRD bundle does the same. Adding richer
//   material-component rendering is a follow-up.
// - `meta.ritual` flips the ritual flag; concentration lives on the
//   duration object, not on the spell itself.
// - 5e.tools doesn't put class lists on individual spells (they live in a
//   separate index file). We emit an empty `classes` array — the
//   class-detail page won't surface imported spells in class spell lists
//   until that index is wired in. SRD class detail still works.

import type { SpellResult, ImportSource } from '@vaultstone/types';
import { entriesToText, slugify, sourceLongName, type RawEntry } from './entries';

// ── Source-side type sketches ─────────────────────────────────────────────

type RawSpell = {
  name: string;
  source: string;
  page?: number;
  level: number;
  /** Single-letter school code (A/C/D/E/V/I/N/T). */
  school: string;
  time?: RawTime[];
  range?: RawRange;
  components?: RawComponents;
  duration?: RawDuration[];
  meta?: { ritual?: boolean };
  entries?: RawEntry[];
  entriesHigherLevel?: RawEntry[];
  [key: string]: unknown;
};

type RawTime = {
  number: number;
  unit: string;
  /** Reaction trigger condition prose, when unit === 'reaction'. */
  condition?: string;
};

type RawRange = {
  type: string;
  distance?: { type: string; amount?: number };
};

type RawComponents = {
  v?: boolean;
  s?: boolean;
  /** True / material prose / { text, cost, consume } object. */
  m?: boolean | string | { text?: string };
};

type RawDuration = {
  type: string;
  duration?: { type: string; amount?: number };
  concentration?: boolean;
  ends?: string[];
};

export type RawSpellsFile = {
  spell?: RawSpell[];
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
 * Transform a parsed 5e.tools spells-file payload into a SpellResult[].
 * One result per `spell` entry. Returns [] if the payload has no `spell`
 * array.
 */
export function transformSpells(
  raw: RawSpellsFile,
  opts: TransformOptions,
): SpellResult[] {
  const { systemId } = opts;
  const spells = raw.spell ?? [];

  return spells.map((s) => {
    const importSource: ImportSource = {
      code: s.source,
      name: sourceLongName(s.source),
      page: s.page,
    };
    const concentration = (s.duration ?? []).some((d) => d.concentration === true);

    return {
      key: `imported_${systemId}_spell_${slugify(s.source)}_${slugify(s.name)}`,
      name: s.name,
      type: 'spell',
      tier: 'imported',
      system: systemId,
      description: buildDescription(s.entries ?? [], s.entriesHigherLevel),
      importSource,
      data: {},
      level: typeof s.level === 'number' ? s.level : 0,
      school: expandSchool(s.school),
      castingTime: formatCastingTime(s.time),
      range: formatRange(s.range),
      components: formatComponents(s.components),
      duration: formatDuration(s.duration),
      concentration,
      ritual: s.meta?.ritual === true,
      // 5e.tools spell entries don't carry class lists. Empty array
      // matches the SpellResult shape; class spell-list surfaces will
      // skip imported spells until a separate class-spell index lands.
      classes: [],
      // Imported entries don't claim an SRD edition.
      srdVersions: [],
    };
  });
}

// ── Internals ─────────────────────────────────────────────────────────────

const SCHOOL_BY_CODE: Record<string, string> = {
  A: 'Abjuration',
  C: 'Conjuration',
  D: 'Divination',
  E: 'Enchantment',
  V: 'Evocation',
  I: 'Illusion',
  N: 'Necromancy',
  T: 'Transmutation',
};

function expandSchool(code: string | undefined): string {
  if (!code) return '';
  return SCHOOL_BY_CODE[code.toUpperCase()] ?? code;
}

/**
 * Render a 5e.tools `time` array as a display string. Almost every spell
 * has a single entry, but a few have alternate forms (e.g. "1 action or
 * 1 minute"); we join with " or " in that case.
 */
function formatCastingTime(time: RawTime[] | undefined): string {
  if (!time || time.length === 0) return '';
  return time.map(formatOneTime).filter(Boolean).join(' or ');
}

function formatOneTime(t: RawTime): string {
  const unit = (t.unit ?? '').toLowerCase();
  if (unit === 'action') return 'Action';
  if (unit === 'bonus' || unit === 'bonus action') return 'Bonus Action';
  if (unit === 'reaction') return 'Reaction';
  // Numeric durations: "10 minutes", "1 hour", "8 hours". Pluralize when
  // number !== 1 unless the unit already ends in 's'.
  const n = t.number ?? 1;
  const u = unit.endsWith('s') || n === 1 ? unit : `${unit}s`;
  return `${n} ${u}`;
}

/**
 * Render a 5e.tools `range` object as a display string. Type 'point'
 * with a feet/miles distance is the common case; 'self', 'sight',
 * 'unlimited', and shape ranges (cone/radius/cube/etc.) need their own
 * forms.
 */
function formatRange(range: RawRange | undefined): string {
  if (!range) return '';
  const type = (range.type ?? '').toLowerCase();
  const dist = range.distance;
  const distType = (dist?.type ?? '').toLowerCase();

  if (type === 'point') {
    if (distType === 'self') return 'Self';
    if (distType === 'touch') return 'Touch';
    if (distType === 'sight') return 'Sight';
    if (distType === 'unlimited') return 'Unlimited';
    if (distType === 'feet' && dist?.amount != null) return `${dist.amount} feet`;
    if (distType === 'miles' && dist?.amount != null) {
      return `${dist.amount} ${dist.amount === 1 ? 'mile' : 'miles'}`;
    }
    return distType ? capitalize(distType) : '';
  }

  // Shape ranges: cone / cube / radius / sphere / line / hemisphere.
  // Render as "Self (20-foot cone)" when point + shape, or "20-foot
  // radius" when shape is the top-level type.
  if (dist?.type === 'feet' && dist.amount != null) {
    return `Self (${dist.amount}-foot ${type})`;
  }
  return type ? capitalize(type) : '';
}

/**
 * 5e.tools components object → ['V','S','M'] letter array. Material
 * prose is intentionally dropped to match the SRD spells.json shape;
 * surfacing it in the UI is a follow-up.
 */
function formatComponents(components: RawComponents | undefined): string[] {
  if (!components) return [];
  const out: string[] = [];
  if (components.v) out.push('V');
  if (components.s) out.push('S');
  if (components.m) out.push('M');
  return out;
}

/**
 * Render a 5e.tools `duration` array as a display string. Most spells
 * have one entry; a few have alternates ("Concentration, up to 1 minute,
 * or until dispelled"). 'instant' / 'permanent' / 'special' have known
 * display forms; 'timed' renders the inner duration.
 */
function formatDuration(duration: RawDuration[] | undefined): string {
  if (!duration || duration.length === 0) return '';
  return duration.map(formatOneDuration).filter(Boolean).join(' or ');
}

function formatOneDuration(d: RawDuration): string {
  const t = (d.type ?? '').toLowerCase();
  if (t === 'instant') return 'instantaneous';
  if (t === 'permanent') return 'until dispelled';
  if (t === 'special') return 'special';
  if (t === 'timed' && d.duration) {
    const n = d.duration.amount ?? 1;
    const unit = (d.duration.type ?? '').toLowerCase();
    const u = unit.endsWith('s') || n === 1 ? unit : `${unit}s`;
    const base = `${n} ${u}`;
    return d.concentration ? `Concentration, up to ${base}` : base;
  }
  return t;
}

/**
 * Build the prose description from `entries` (main body) and
 * `entriesHigherLevel` (the "At Higher Levels" block, when present).
 * Joined with a paragraph break and a bold header so it matches the
 * SRD spells.json shape.
 */
function buildDescription(entries: RawEntry[], higherLevel: RawEntry[] | undefined): string {
  const parts: string[] = [];
  const main = entriesToText(entries).trim();
  if (main) parts.push(main);
  if (higherLevel && higherLevel.length > 0) {
    const hl = entriesToText(higherLevel).trim();
    // 5e.tools wraps the higher-level block in its own named entries
    // object whose name is "At Higher Levels", so entriesToText already
    // emits "**At Higher Levels.** ...". If the source happened to use
    // bare strings, prepend the header ourselves so the section is
    // always labeled.
    if (hl) {
      parts.push(/^\*\*At Higher Levels/i.test(hl) ? hl : `**At Higher Levels.** ${hl}`);
    }
  }
  return parts.join('\n\n');
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
