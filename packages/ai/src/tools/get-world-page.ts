import { getPage } from '@vaultstone/api';
import type { ToolDefinition } from './registry';
import { trimText } from './util';

const MAX_BODY = 6000;

/**
 * Read one world page's content (plaintext body + structured fields). RLS
 * blocks pages the caller can't see; for players that means DM-only/hidden
 * pages return an access error.
 */
export const getWorldPageTool: ToolDefinition = {
  roles: ['dm', 'player'],
  declaration: {
    name: 'get_world_page',
    description:
      'Read the content of a single world page (lore, location, NPC, faction, timeline, etc.) by its id. Call list_world_pages first to find the id.',
    parameters: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'The world page id to read.' },
      },
      required: ['pageId'],
    },
  },
  execute: async (args, ctx) => {
    const pageId = String(args.pageId ?? '').trim();
    if (!pageId) return { error: 'No pageId provided.' };

    const { data, error } = await getPage(pageId);
    if (error || !data) {
      return { error: 'Page not found or not accessible.' };
    }

    // Player double-check: never surface a page not flagged visible.
    if (ctx.role === 'player' && !data.visible_to_players) {
      return { error: 'That page is not visible to players.' };
    }

    return {
      page: {
        title: data.title,
        kind: data.page_kind,
        visibleToPlayers: data.visible_to_players,
        structuredFields: data.structured_fields ?? null,
        body: trimText(data.body_text, MAX_BODY),
      },
    };
  },
};
