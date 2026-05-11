// Transform a 5e.tools deities payload (top-level `deity` array) into
// our DeityResult shape. Used by clerics and paladins choosing a patron
// during character creation.
//
// 2024 SRD note: XDMG ships 27 Greyhawk-pantheon deities (the 2024 SRD
// release replaced the Forgotten Realms default with Greyhawk). PHB-era
// entries still carry the legacy 2014 fields (`alignment`, `domains`)
// that the 2024 release dropped — so this transform tolerates both
// shapes and emits whichever fields the source provided.
//
// 5e.tools quirks worth knowing:
// - `alignment` is an array of single-letter codes ("LG", "N", "CE").
//   We pass them through verbatim; the consumer renders them via a
//   shared alignment-code → label table.
// - `entries` (free-form prose) appears on a small minority of entries
//   — most deities are pure metadata cards (name, pantheon, title,
//   symbol, etc.). We surface entries as the description when present.
// - `pantheon` is required on every entry; dedupe-by-name across
//   pantheons produces collisions (multiple "Bahamut" entries across
//   FR/Dragonlance/etc.), so the entry key includes pantheon.

import type { DeityResult, ImportSource } from '@vaultstone/types';
import { entriesToText, slugify, sourceLongName, srdVersionsForSource, type RawEntry } from './entries';

// ── Source-side type sketches ─────────────────────────────────────────────

type RawDeity = {
  name: string;
  source: string;
  page?: number;
  pantheon: string;
  title?: string;
  /** Single-letter codes — "L", "N", "C", "G", "E", or pairs ("LG",
   *  "NG", "CE", etc.). 2024 entries drop this. */
  alignment?: string[];
  /** 2014 cleric domains. 2024 entries drop this — the new rules
   *  loosened domain-locking. */
  domains?: string[];
  symbol?: string;
  plane?: string;
  worshipers?: string;
  /** Free-form prose. Most deity entries skip this. */
  entries?: RawEntry[];
  [key: string]: unknown;
};

export type RawDeitiesFile = {
  deity?: RawDeity[];
  [key: string]: unknown;
};

// ── Public transform ──────────────────────────────────────────────────────

export type TransformOptions = {
  systemId: string;
  sourceLabel?: string;
};

/**
 * Transform a parsed 5e.tools deities-file payload into DeityResult[].
 * One result per `deity` entry. Returns [] when the payload has no
 * `deity` array.
 */
export function transformDeities(
  raw: RawDeitiesFile,
  opts: TransformOptions,
): DeityResult[] {
  const { systemId } = opts;
  const deities = raw.deity ?? [];

  return deities.map((d) => {
    const importSource: ImportSource = {
      code: d.source,
      name: sourceLongName(d.source),
      page: d.page,
    };
    // Key includes pantheon to disambiguate same-named deities across
    // mythologies (Bahamut appears in both FR and Dragonlance with
    // diverged write-ups).
    const key = `imported_${systemId}_deity_${slugify(d.source)}_${slugify(d.pantheon)}_${slugify(d.name)}`;

    const description = entriesToText(d.entries ?? []).trim();

    const result: DeityResult = {
      key,
      name: d.name,
      type: 'deity',
      tier: 'imported',
      system: systemId,
      description,
      importSource,
      data: {},
      pantheon: d.pantheon,
      srdVersions: srdVersionsForSource(d.source),
    };

    if (d.title) result.title = d.title;
    if (Array.isArray(d.alignment) && d.alignment.length > 0) result.alignment = d.alignment;
    if (Array.isArray(d.domains) && d.domains.length > 0) result.domains = d.domains;
    if (d.symbol) result.symbol = d.symbol;
    if (d.plane) result.plane = d.plane;
    if (d.worshipers) result.worshipers = d.worshipers;

    return result;
  });
}
