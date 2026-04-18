import { useCallback } from 'react';
import { updatePage } from '@vaultstone/api';
import { useAuthStore, useCurrentWorldStore, usePagesStore } from '@vaultstone/store';
import type { WorldPage } from '@vaultstone/types';

// Flips `visible_to_players` for the given page with an optimistic store
// write + rollback on RPC error. Returns `null` when the viewer isn't the
// world owner — callers use that to render the badge as non-interactive
// instead of guessing based on other signals. RLS is the authoritative
// gate; the owner check here is just UI-level so players don't see a
// click-to-toggle eye they can't actually use.
export function usePageVisibilityToggle(page: Pick<WorldPage, 'id' | 'visible_to_players'> | null) {
  const world = useCurrentWorldStore((s) => s.world);
  const myUserId = useAuthStore((s) => s.user?.id ?? null);
  const updatePageInStore = usePagesStore((s) => s.updatePage);

  const canEdit = !!world && !!myUserId && world.owner_user_id === myUserId;

  const toggle = useCallback(async () => {
    if (!page || !canEdit) return;
    const next = !page.visible_to_players;
    updatePageInStore(page.id, { visible_to_players: next });
    const { error } = await updatePage(page.id, { visible_to_players: next });
    if (error) {
      updatePageInStore(page.id, { visible_to_players: page.visible_to_players });
    }
  }, [page, canEdit, updatePageInStore]);

  return canEdit ? toggle : null;
}
