// Transform a 5e.tools variant-rules payload (top-level `variantrule`
// array) into our VariantRuleResult shape.
//
// 5e.tools' `variantrule` array conflates two distinct concepts that
// happen to share a file shape:
//
//   1. **Compendium glossary** entries — `ruleType: 'C'`. The 2024 XPHB
//      moved its glossary chapter into this file (114 XPHB entries:
//      Ability Check, Cover, Damage Roll, etc.). These are canonical
//      rule terms, not DM-side toggles.
//
//   2. **Variant / Optional rules** — `ruleType: 'V' | 'O' | 'VO'`. The
//      2014 DMG concept of opt-in alternatives (Flanking, Hero Points,
//      Cleaving, Firearms) and additions (Hitting Cover). Kept alive
//      by the DMG / XGE / TCE / AAG datasets.
//
// We map both onto a single VariantRuleResult, distinguished by `kind`,
// so they can share search/resolver plumbing. The system page splits
// the presentation: glossary entries surface under the Glossary group,
// variants/optionals under their own sub-tab.

import type { VariantRuleResult, ImportSource } from '@vaultstone/types';
import { entriesToText, slugify, sourceLongName, srdVersionsForSource, type RawEntry } from './entries';

// ── Source-side type sketches ─────────────────────────────────────────────

type RawVariantRule = {
  name: string;
  source: string;
  page?: number;
  /** 'C' = Compendium (glossary), 'V' = Variant, 'O' = Optional,
   *  'VO' = both Variant + Optional, undefined for older entries. */
  ruleType?: string;
  /** Free-form prose. Most entries are at least a paragraph. */
  entries?: RawEntry[];
  [key: string]: unknown;
};

export type RawVariantRulesFile = {
  variantrule?: RawVariantRule[];
  [key: string]: unknown;
};

// ── Public transform ──────────────────────────────────────────────────────

export type TransformOptions = {
  systemId: string;
  sourceLabel?: string;
};

/**
 * Transform a parsed 5e.tools variant-rules payload into
 * VariantRuleResult[]. One result per `variantrule` entry. Returns
 * [] when the payload has no `variantrule` array.
 */
export function transformVariantRules(
  raw: RawVariantRulesFile,
  opts: TransformOptions,
): VariantRuleResult[] {
  const { systemId } = opts;
  const rules = raw.variantrule ?? [];

  return rules.map((r) => {
    const importSource: ImportSource = {
      code: r.source,
      name: sourceLongName(r.source),
      page: r.page,
    };
    const description = entriesToText(r.entries ?? []).trim();
    return {
      key: `imported_${systemId}_variant-rule_${slugify(r.source)}_${slugify(r.name)}`,
      name: r.name,
      type: 'variant-rule',
      tier: 'imported',
      system: systemId,
      description,
      importSource,
      data: {},
      kind: mapKind(r.ruleType),
      srdVersions: srdVersionsForSource(r.source),
    } satisfies VariantRuleResult;
  });
}

/**
 * 5e.tools `ruleType` code → our kind discriminator. The 'VO' code
 * lands as 'variant' since these are typically presented under the
 * Variant Rules sub-tab — the 'optional' overlay is informational.
 */
function mapKind(ruleType: string | undefined): VariantRuleResult['kind'] {
  switch (ruleType) {
    case 'C':  return 'glossary';
    case 'V':
    case 'VO': return 'variant';
    case 'O':  return 'optional';
    default:   return 'other';
  }
}
