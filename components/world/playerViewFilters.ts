import type { WorldPage, WorldSection } from '@vaultstone/types';

// Client-side mirror of the `user_can_view_page` Postgres helper for a
// generic "player" (not world owner, not on a campaign). The server-side
// helper is the source of truth for auth; this helper exists only to drive
// the Player View preview filter and the sidebar/orphan banner presentation.
//
// A page is visible under preview iff:
//   - The page is not trashed
//   - The page is `visible_to_players = true`
//   - Its section is not `force_hidden_from_players` and not trashed
//   - (Phase 4 player-path) The effective ancestor chain doesn't hide it
//     via a parent that is itself GM-only and blocks children. Today we
//     treat each page's visibility independently — that matches the server.
export function isPageVisibleToPlayersPreview(
  page: WorldPage,
  section: WorldSection | undefined,
): boolean {
  if (page.deleted_at) return false;
  if (!page.visible_to_players) return false;
  if (!section) return false;
  if (section.deleted_at) return false;
  if (section.force_hidden_from_players) return false;
  return true;
}

export function isSectionVisibleToPlayersPreview(section: WorldSection): boolean {
  if (section.deleted_at) return false;
  if (section.force_hidden_from_players) return false;
  return true;
}
