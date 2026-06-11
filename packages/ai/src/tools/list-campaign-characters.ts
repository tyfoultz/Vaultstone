import { getCharactersForCampaign } from '@vaultstone/api';
import { getClassEntries } from '@vaultstone/types';
import type { Dnd5eStats, Dnd5eResources } from '@vaultstone/types';
import type { ToolDefinition } from './registry';
import { prettifyKey } from './util';

interface PartyRow {
  id: string;
  name: string;
  user_id?: string | null;
  base_stats?: unknown;
  resources?: unknown;
}

/**
 * Roster of the campaign's characters with light vitals. DM-only — players use
 * get_character for their own sheet.
 */
export const listCampaignCharactersTool: ToolDefinition = {
  roles: ['dm'],
  declaration: {
    name: 'list_campaign_characters',
    description:
      'List the characters in a campaign with their level, class, species, and current HP. Use to get the party roster or find a character id before calling get_character.',
    parameters: {
      type: 'object',
      properties: {
        campaignId: {
          type: 'string',
          description: 'The campaign id whose characters to list.',
        },
      },
      required: ['campaignId'],
    },
  },
  execute: async (args, ctx) => {
    const campaignId = String(args.campaignId ?? ctx.campaignId).trim();
    const { data, error } = await getCharactersForCampaign(campaignId);
    if (error) return { error: 'Could not load campaign characters.' };

    const rows = (data ?? []) as unknown as PartyRow[];
    return {
      characters: rows.map((row) => {
        const stats = (row.base_stats ?? null) as Dnd5eStats | null;
        const resources = (row.resources ?? null) as Dnd5eResources | null;
        const primary = stats ? getClassEntries(stats)[0] : null;
        return {
          id: row.id,
          name: row.name,
          level: stats?.level ?? null,
          class: primary ? prettifyKey(primary.classKey) : null,
          species: prettifyKey(stats?.speciesKey) || null,
          hp:
            resources && stats
              ? { current: resources.hpCurrent, max: stats.hpMax }
              : null,
        };
      }),
    };
  },
};
