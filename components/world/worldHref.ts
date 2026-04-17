import type { Href } from 'expo-router';

// `.expo/types/router.d.ts` is generated on `expo start` / `expo export` and
// does not enumerate dynamic Phase 1/2 routes like `/world/[worldId]/...`
// until a dev server has run. These helpers type-cast the canonical world
// paths as valid `Href` values so typecheck passes without depending on
// regenerated typed routes.

export const worldHref = (worldId: string): Href =>
  (`/world/${worldId}`) as unknown as Href;

export const worldSectionHref = (worldId: string, sectionId: string): Href =>
  (`/world/${worldId}/section/${sectionId}`) as unknown as Href;

export const worldPageHref = (worldId: string, pageId: string): Href =>
  (`/world/${worldId}/page/${pageId}`) as unknown as Href;
