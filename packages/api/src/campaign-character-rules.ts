// Read + write the DM-configured character-creation rule values for a
// campaign. Resolves against the system's `optionalRules` definition
// so a missing key falls back to the rule's declared default.
//
// Storage shape: `campaigns.character_creation_rules` is a JSONB bag
// keyed by rule.key. We don't constrain the value type at the DB
// layer — the system definition is the source of truth for which
// keys exist and how to interpret each value.

import { supabase } from './client';
import type { OptionalRule } from '@vaultstone/types';

export type CharacterCreationRuleValues = Record<string, boolean | string | number>;

/**
 * Read the raw rule-values bag for a campaign. Returns an empty
 * object when the campaign hasn't set anything yet (the column
 * defaults to `'{}'::jsonb` at the DB layer, so the row always has
 * a value — but defensive empty-object fallback covers older rows
 * if any predate the migration).
 */
export async function getCampaignCharacterRules(campaignId: string): Promise<{
  data: CharacterCreationRuleValues | null;
  error: { message: string } | null;
}> {
  const { data, error } = await supabase
    .from('campaigns')
    .select('character_creation_rules')
    .eq('id', campaignId)
    .single();
  if (error || !data) return { data: null, error };
  const raw = data.character_creation_rules;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { data: {}, error: null };
  }
  return { data: raw as CharacterCreationRuleValues, error: null };
}

/**
 * Replace the campaign's rule-values bag wholesale. The DM editor
 * computes the new full set client-side (including defaults for
 * unset keys), and writes it as a single update so partial-write
 * states are impossible. Older keys not in the new payload are
 * dropped — that's intentional, the editor always sends the full
 * resolved set.
 */
export async function setCampaignCharacterRules(
  campaignId: string,
  values: CharacterCreationRuleValues,
) {
  return supabase
    .from('campaigns')
    .update({ character_creation_rules: values })
    .eq('id', campaignId)
    .select('character_creation_rules')
    .single();
}

/**
 * Resolve a system's optional rules + a campaign's stored values
 * into a flat `{ ruleKey: value }` map where every key has either
 * the campaign's chosen value or the system default. Used by the
 * character wizard and the sheet to read effective values without
 * each call site needing to do its own fallback dance.
 *
 * `scope` filters to the relevant subset:
 *   • 'campaign' — DM-set rules (used by the DM editor)
 *   • 'character' — player-set rules (used by the wizard's
 *     character-scope step; players see these as questions)
 *   • undefined — returns all rules
 */
export function resolveRuleValues(
  rules: OptionalRule[],
  stored: CharacterCreationRuleValues,
  scope?: 'campaign' | 'character',
): CharacterCreationRuleValues {
  const out: CharacterCreationRuleValues = {};
  for (const rule of rules) {
    if (scope && rule.scope !== scope) continue;
    const stored_value = stored[rule.key];
    if (stored_value !== undefined) {
      out[rule.key] = stored_value;
    } else {
      out[rule.key] = rule.default;
    }
  }
  return out;
}
