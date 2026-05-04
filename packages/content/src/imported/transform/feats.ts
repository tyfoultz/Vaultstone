// Transform a 5e.tools feats payload (top-level `feat` array) into our
// FeatResult shape. Mirrors the subclass transform: produces one
// FeatResult per source `feat` entry, ready for upsert into
// imported_content under a homebrew pack.
//
// 5e.tools quirks worth knowing:
// - `category` is a single-letter code (`G` general, `FS` fighting style,
//   `EB` epic boon, `O` origin, plus rarer ones we fall back to general).
// - `prerequisite` is an array of structured objects, NOT prose. We
//   flatten it to a human-readable string for FeatResult.prerequisites.
// - `entries` open with a lead string ("You gain the following benefits.")
//   followed by named sub-entries — one per benefit. We map the lead to
//   description and the sub-entries to benefits[]. Feats without that
//   structure (mostly older 2014 prose feats) collapse to a single
//   benefits entry with the flattened prose.

import type { FeatResult, ImportSource } from '@vaultstone/types';
import { entriesToText, slugify, sourceLongName, type RawEntry, type RawEntryObject } from './entries';

// ── Source-side type sketches ─────────────────────────────────────────────

type RawFeat = {
  name: string;
  source: string;
  page?: number;
  /** 5e.tools single-letter category code. Optional — older entries may omit. */
  category?: string;
  /** Structured prerequisite objects. We flatten to text. */
  prerequisite?: RawPrerequisite[];
  /** Free-form entry list — strings + nested entry objects. */
  entries?: RawEntry[];
  [key: string]: unknown;
};

/**
 * Each prerequisite group is satisfied if all of its keys match (AND).
 * Multiple groups in the array are alternatives (OR). Common keys we
 * surface: level, ability (array of `{abil: score}` objects), race,
 * spellcasting, proficiency. Unknown keys pass through verbatim so we
 * don't silently drop info.
 */
type RawPrerequisite = {
  level?: number | { level?: number; class?: { name?: string } };
  ability?: Array<Record<string, number>>;
  race?: Array<{ name?: string; subrace?: string }>;
  spellcasting?: boolean;
  spellcasting2020?: boolean;
  spellcastingFeature?: boolean;
  proficiency?: Array<Record<string, string>>;
  [key: string]: unknown;
};

export type RawFeatsFile = {
  feat?: RawFeat[];
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
 * Transform a parsed 5e.tools feats-file payload into a FeatResult[]. One
 * result per `feat` entry. Returns [] if the payload has no `feat` array.
 */
export function transformFeats(
  raw: RawFeatsFile,
  opts: TransformOptions,
): FeatResult[] {
  const { systemId } = opts;
  const feats = raw.feat ?? [];

  return feats.map((f) => {
    const { description, benefits } = splitEntries(f.entries ?? []);
    const importSource: ImportSource = {
      code: f.source,
      name: sourceLongName(f.source),
      page: f.page,
    };

    return {
      key: `imported_${systemId}_feat_${slugify(f.source)}_${slugify(f.name)}`,
      name: f.name,
      type: 'feat',
      tier: 'imported',
      system: systemId,
      description,
      importSource,
      data: {},
      category: mapCategory(f.category),
      prerequisites: formatPrerequisites(f.prerequisite),
      benefits,
      // Imported entries don't claim an SRD edition — provenance lives
      // on importSource.
      srdVersions: [],
    };
  });
}

// ── Internals ─────────────────────────────────────────────────────────────

/**
 * Split a feat's entries into (lead description, benefit bullets).
 *
 * 2024 feat structure: opening string ("You gain the following benefits.")
 * followed by one or more `{type: 'entries', name: '...', entries: [...]}`
 * blocks — one per benefit. We pull the lead out as description and map
 * each named block to one benefits entry.
 *
 * 2014 prose-style feats: no named sub-entries, just flat strings. The
 * whole thing collapses to a single benefits entry and description stays
 * empty (consistent with how the SRD feat transform treats prose feats).
 */
function splitEntries(entries: RawEntry[]): { description: string; benefits: string[] } {
  if (entries.length === 0) {
    return { description: '', benefits: [] };
  }

  const benefits: string[] = [];
  const leadParts: string[] = [];
  let seenNamedBlock = false;

  for (const e of entries) {
    if (typeof e === 'string') {
      // Strings before the first named block are the lead description.
      // Strings after a named block are anomalies; fold them into the
      // last benefit so we don't lose the prose.
      if (!seenNamedBlock) {
        leadParts.push(e);
      } else if (benefits.length > 0) {
        benefits[benefits.length - 1] += `\n\n${entriesToText([e])}`;
      } else {
        leadParts.push(e);
      }
      continue;
    }
    const obj = e as RawEntryObject;
    if (obj.name && (obj.type === 'entries' || obj.type === undefined)) {
      seenNamedBlock = true;
      const inner = entriesToText(obj.entries ?? []);
      benefits.push(`**${obj.name}.** ${inner}`);
      continue;
    }
    // Unnamed entries / lists / tables: render with entriesToText. If
    // we've already started collecting benefits, append to the last one;
    // otherwise it's part of the lead.
    const rendered = entriesToText([e]);
    if (seenNamedBlock && benefits.length > 0) {
      benefits[benefits.length - 1] += `\n\n${rendered}`;
    } else {
      leadParts.push(rendered);
    }
  }

  // No named sub-entries → treat the whole thing as one benefit. Matches
  // how 2014 prose feats render in the SRD bundle.
  if (benefits.length === 0) {
    return { description: '', benefits: [entriesToText(entries)] };
  }

  return { description: leadParts.join('\n\n').trim(), benefits };
}

/**
 * Map 5e.tools category codes to our FeatResult.category union. Codes
 * not in the table fall back to 'general' — better than crashing the
 * import on an unknown category from a future 5e.tools update.
 */
function mapCategory(code: string | undefined): FeatResult['category'] {
  switch ((code ?? '').toUpperCase()) {
    case 'O':  return 'origin';
    case 'G':  return 'general';
    case 'FS': return 'fighting-style';
    case 'EB': return 'epic-boon';
    default:   return 'general';
  }
}

/**
 * Flatten 5e.tools structured prerequisites into a human-readable string.
 * Multiple groups OR together; keys within a group AND together. Returns
 * empty string for no prerequisites.
 */
function formatPrerequisites(prereqs: RawPrerequisite[] | undefined): string {
  if (!prereqs || prereqs.length === 0) return '';
  const groups = prereqs.map(formatPrerequisiteGroup).filter(Boolean);
  return groups.join(' or ');
}

function formatPrerequisiteGroup(group: RawPrerequisite): string {
  const parts: string[] = [];

  if (group.level !== undefined) {
    if (typeof group.level === 'number') {
      parts.push(`Level ${group.level}+`);
    } else if (group.level.level !== undefined) {
      const cls = group.level.class?.name;
      parts.push(cls ? `${cls} level ${group.level.level}+` : `Level ${group.level.level}+`);
    }
  }

  if (Array.isArray(group.ability)) {
    for (const ab of group.ability) {
      for (const [key, value] of Object.entries(ab)) {
        parts.push(`${capitalize(key)} ${value}+`);
      }
    }
  }

  if (Array.isArray(group.race)) {
    const races = group.race
      .map((r) => (r.subrace ? `${r.name} (${r.subrace})` : r.name))
      .filter(Boolean);
    if (races.length > 0) parts.push(races.join(' or '));
  }

  if (group.spellcasting || group.spellcasting2020 || group.spellcastingFeature) {
    parts.push('the ability to cast at least one spell');
  }

  if (Array.isArray(group.proficiency)) {
    for (const prof of group.proficiency) {
      for (const [key, value] of Object.entries(prof)) {
        parts.push(`proficiency with ${value} ${key}`);
      }
    }
  }

  return parts.join(', ');
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
