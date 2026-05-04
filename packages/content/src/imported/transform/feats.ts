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
  /** Ability score increase grants. Surfaced as a leading benefit so it's
   *  visible alongside the other named benefits the feat provides. */
  ability?: RawAbilityGrant[];
  /** Free-form entry list — strings + nested entry objects. */
  entries?: RawEntry[];
  [key: string]: unknown;
};

/**
 * Each entry is either a fixed bump (`{ cha: 1 }`), or a chooser
 * (`{ choose: { from: [...], amount?, count?, entry? }, max? }`). The
 * `entry` field, when present, is pre-baked prose we can use verbatim.
 */
type RawAbilityGrant = {
  choose?: {
    from?: string[];
    amount?: number;
    count?: number;
    entry?: string;
  };
  max?: number;
  hidden?: boolean;
  [abilityCode: string]: unknown;
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

    // Mirror the SRD shape: ability score increases ride at the top of the
    // benefits list as a labeled bullet, so the detail screen renders them
    // alongside named benefits without needing a separate field on
    // FeatResult.
    const asiBenefit = formatAbilityIncrease(f.ability);
    const allBenefits = asiBenefit ? [asiBenefit, ...benefits] : benefits;

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
      benefits: allBenefits,
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

function capitalize(s: unknown): string {
  if (typeof s !== 'string' || !s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const ABILITY_NAMES: Record<string, string> = {
  str: 'Strength',
  dex: 'Dexterity',
  con: 'Constitution',
  int: 'Intelligence',
  wis: 'Wisdom',
  cha: 'Charisma',
};

/**
 * Compose the "**Ability Score Increase.** Increase your X score by N…"
 * benefit bullet from the 2024 `ability` array. Returns null when the
 * field is absent or only contains hidden ASI grants (used internally by
 * 5e.tools for repeatable feats like Ability Score Improvement, where the
 * grant is implicit in the feat name).
 */
function formatAbilityIncrease(grants: RawAbilityGrant[] | undefined): string | null {
  if (!grants || grants.length === 0) return null;
  const visible = grants.filter((g) => g.hidden !== true);
  if (visible.length === 0) return null;

  for (const grant of visible) {
    // Pre-baked entry wins — 5e.tools authors override the formatted
    // text for unusual cases (e.g. Potent Dragonmark).
    if (grant.choose?.entry) {
      return `**Ability Score Increase.** ${grant.choose.entry}`;
    }
  }

  const max = visible.find((g) => typeof g.max === 'number')?.max ?? 20;
  const parts: string[] = [];

  for (const grant of visible) {
    if (grant.choose) {
      const from = (grant.choose.from ?? []).map((c) => ABILITY_NAMES[c] ?? capitalize(c));
      if (from.length === 0) continue;
      const amount = grant.choose.amount ?? 1;
      const count = grant.choose.count;
      if (from.length === 6) {
        // All six abilities — phrase as "one ability score of your choice".
        if (count && count > 1) {
          parts.push(`Increase ${count} ability scores of your choice by 1, to a maximum of ${max}`);
        } else {
          parts.push(`Increase one ability score of your choice by ${amount}, to a maximum of ${max}`);
        }
      } else {
        // Two abilities: "Strength or Dexterity"; three or more: "X, Y, or Z"
        // (Oxford-comma "or" list). Single-item lists fall through as-is.
        const list = from.length === 1
          ? from[0]
          : from.length === 2
            ? from.join(' or ')
            : `${from.slice(0, -1).join(', ')}, or ${from[from.length - 1]}`;
        if (count && count > 1) {
          parts.push(`Increase ${count} of the following scores by 1: ${list}, to a maximum of ${max}`);
        } else {
          parts.push(`Increase your ${list} score by ${amount}, to a maximum of ${max}`);
        }
      }
      continue;
    }
    // Fixed grant — first non-`max`, non-`hidden`, non-`choose` key.
    for (const [key, value] of Object.entries(grant)) {
      if (key === 'max' || key === 'hidden' || key === 'choose') continue;
      if (typeof value !== 'number') continue;
      const name = ABILITY_NAMES[key] ?? capitalize(key);
      parts.push(`Increase your ${name} score by ${value}, to a maximum of ${max}`);
      break;
    }
  }

  if (parts.length === 0) return null;
  return `**Ability Score Increase.** ${parts.join('. ')}.`;
}
