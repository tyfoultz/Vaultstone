import { getPagesForWorld } from '@vaultstone/api';
import type { ToolDefinition } from './registry';

interface PageListRow {
  id: string;
  title: string;
  page_kind?: string | null;
  visible_to_players?: boolean | null;
}

/**
 * Outline of a world's pages (titles + kinds + ids). The model uses this to
 * find a page id before calling get_world_page. RLS already hides DM-only
 * pages from players in shared worlds; we additionally drop non-visible pages
 * for the player role as belt-and-suspenders.
 */
export const listWorldPagesTool: ToolDefinition = {
  roles: ['dm', 'player'],
  declaration: {
    name: 'list_world_pages',
    description:
      'List the pages in a world (title, kind, and id). Use to discover what lore/locations/NPCs exist and to find a page id before reading it with get_world_page.',
    parameters: {
      type: 'object',
      properties: {
        worldId: {
          type: 'string',
          description: 'The world id whose pages to list.',
        },
      },
      required: ['worldId'],
    },
  },
  execute: async (args, ctx) => {
    const worldId = String(args.worldId ?? ctx.worldId ?? '').trim();
    if (!worldId) return { error: 'No worldId provided.' };

    const { data, error } = await getPagesForWorld(worldId);
    if (error) return { error: 'Could not load world pages.' };

    // RLS already scopes rows to what this user may see (visible_to_players
    // pages + any pages with an explicit world_page_permissions grant).
    // Don't re-filter here — doing so would hide pages the player has an
    // explicit grant to, even though RLS allowed them through.
    const rows = (data ?? []) as unknown as PageListRow[];

    return {
      pages: rows.map((p) => ({
        id: p.id,
        title: p.title,
        kind: p.page_kind ?? null,
        visibleToPlayers: p.visible_to_players ?? false,
      })),
    };
  },
};
