import { ContentResolver } from '@vaultstone/content';
import type { ContentType } from '@vaultstone/types';
import type { ToolDefinition } from './registry';

// Types the model may filter on. Kept to the ones a rules/lore question would
// reasonably target (the full ContentType union includes many metadata-only
// kinds that aren't useful here).
const SEARCHABLE_TYPES: ContentType[] = [
  'spell',
  'monster',
  'item',
  'condition',
  'rule',
  'class',
  'subclass',
  'species',
  'feat',
  'background',
  'tool',
];

const MAX_RESULTS = 8;
const MAX_DESCRIPTION = 1500;

function trim(text: string | undefined): string {
  if (!text) return '';
  return text.length > MAX_DESCRIPTION
    ? `${text.slice(0, MAX_DESCRIPTION)}…`
    : text;
}

export const searchContentTool: ToolDefinition = {
  roles: ['dm', 'player'],
  declaration: {
    name: 'search_game_content',
    description:
      "Search game rules, spells, monsters, items, conditions, classes, subclasses, species, feats, backgrounds, and tools (official SRD content plus this campaign's homebrew). Use this for any rules lookup or content question before answering.",
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'What to look up, e.g. "fireball", "exhaustion", "grapple", "goblin".',
        },
        type: {
          type: 'string',
          enum: SEARCHABLE_TYPES,
          description: 'Optional content-type filter to narrow results.',
        },
      },
      required: ['query'],
    },
  },
  execute: async (args, ctx) => {
    const query = String(args.query ?? '').trim();
    if (!query) return { results: [] };

    const rawType = typeof args.type === 'string' ? args.type : undefined;
    const type =
      rawType && (SEARCHABLE_TYPES as string[]).includes(rawType)
        ? (rawType as ContentType)
        : undefined;

    // campaignId scopes the homebrew tier to this campaign's enabled packs;
    // SRD is always included. RLS scopes what homebrew the user can see.
    const results = await ContentResolver.search({
      search: query,
      type,
      campaignId: ctx.campaignId,
    });

    return {
      results: results.slice(0, MAX_RESULTS).map((r) => ({
        name: r.name,
        type: r.type,
        tier: r.tier,
        description: trim(r.description),
      })),
    };
  },
};
