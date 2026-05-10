// Resolve the active wizard step list for a candidate character. Applies
// the system's `creationSteps` schema with two filters:
//   1. Skip `inCampaign: false` steps when launched from a campaign.
//   2. Drop `gatedByRule` steps whose rule resolves falsy.
//
// Standalone wizards (no campaign) fall through to each rule's bundled
// system default (so a system whose `feats_at_level_1` defaults to
// `true` still gets the Feats step in standalone mode).

import type {
  CreationStep,
  GameSystemDefinition,
  OptionalRule,
} from '@vaultstone/types';

export type CreationStepContext = {
  /** True when launched with `?campaignId=` (wizard runs the
   *  campaign-locked flow). Drives the `inCampaign` filter. */
  isCampaign: boolean;
  /**
   * Resolved campaign rules bag. When undefined (standalone wizard),
   * each `gatedByRule` step falls through to its rule's default. When
   * defined but missing a key, same fallback applies — campaigns that
   * never saved any rules still get system defaults.
   */
  campaignRules?: Record<string, boolean | string | number>;
};

export function resolveCreationSteps(
  system: GameSystemDefinition,
  ctx: CreationStepContext,
): CreationStep[] {
  return system.creationSteps.filter((step) => {
    if (ctx.isCampaign && step.inCampaign === false) return false;
    if (step.gatedByRule) {
      const value = readRuleValue(system.optionalRules, ctx.campaignRules, step.gatedByRule);
      if (!value) return false;
    }
    return true;
  });
}

function readRuleValue(
  rules: OptionalRule[],
  bag: Record<string, boolean | string | number> | undefined,
  key: string,
): boolean | string | number | undefined {
  if (bag && Object.prototype.hasOwnProperty.call(bag, key)) {
    return bag[key];
  }
  // Fall back to the system's bundled default for this rule. Standalone
  // wizards land here for every gated step.
  const def = rules.find((r) => r.key === key);
  return def?.default;
}
