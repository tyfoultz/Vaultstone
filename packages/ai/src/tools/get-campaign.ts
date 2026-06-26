import { getCampaignById } from '@vaultstone/api';
import type { ToolDefinition } from './registry';
import { trimText } from './util';

/** Campaign metadata: name, system, description, and next session time. */
export const getCampaignTool: ToolDefinition = {
  roles: ['dm', 'player'],
  declaration: {
    name: 'get_campaign',
    description:
      'Get high-level campaign info: name, game system, description, and the next scheduled session time.',
    parameters: {
      type: 'object',
      properties: {
        campaignId: {
          type: 'string',
          description: 'The campaign id (defaults to the current campaign).',
        },
      },
      required: [],
    },
  },
  execute: async (args, ctx) => {
    const campaignId = String(args.campaignId ?? ctx.campaignId).trim();
    const { data, error } = await getCampaignById(campaignId);
    if (error || !data) return { error: 'Campaign not found or not accessible.' };

    return {
      campaign: {
        name: data.name,
        system: data.system_label ?? data.system,
        description: trimText(data.description, 4000),
        nextSessionAt: data.next_session_at ?? null,
      },
    };
  },
};
