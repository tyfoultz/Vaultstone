// Fetches the authenticated user's homebrew entries scoped to one game
// system and fans them into the SrdContent bucket shape so the existing
// detail-page tabs (which read from a single typed content object) can
// surface homebrew alongside SRD without per-tab rework.
//
// Returns a Partial<SrdContent> — only buckets that actually have homebrew
// entries are present; the merge step in the caller spreads SRD first,
// concats homebrew on top.

import { useEffect, useState } from 'react';
import { ContentResolver, type SrdContent } from '@vaultstone/content';
import type {
  SpellResult,
  CreatureResult,
  ItemResult,
  FeatResult,
  ClassResult,
  SpeciesResult,
} from '@vaultstone/types';

/**
 * `loading` is exposed so callers can decide whether to show a skeleton or
 * just lazily merge homebrew when it arrives. We choose the latter on the
 * detail page — SRD content renders immediately, homebrew slides in.
 */
export type SystemHomebrewState = {
  loading: boolean;
  buckets: Partial<SrdContent>;
};

export function useSystemHomebrewContent(systemId: string): SystemHomebrewState {
  const [state, setState] = useState<SystemHomebrewState>({ loading: true, buckets: {} });

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, buckets: {} });

    ContentResolver.search({ system: systemId, tiers: ['homebrew'] }).then((results) => {
      if (cancelled) return;
      const buckets: Partial<SrdContent> = {};
      for (const r of results) {
        switch (r.type) {
          case 'spell':
            (buckets.spells ??= []).push(r as SpellResult);
            break;
          case 'monster':
            (buckets.creatures ??= []).push(r as CreatureResult);
            break;
          case 'item':
            (buckets.items ??= []).push(r as ItemResult);
            break;
          case 'feat':
            (buckets.feats ??= []).push(r as FeatResult);
            break;
          case 'class':
            (buckets.classes ??= []).push(r as ClassResult);
            break;
          case 'species':
            (buckets.species ??= []).push(r as SpeciesResult);
            break;
          // Other content types (subclasses, conditions, backgrounds, etc.)
          // aren't authorable as homebrew yet, so they're not bucketed here.
        }
      }
      setState({ loading: false, buckets });
    });

    return () => {
      cancelled = true;
    };
  }, [systemId]);

  return state;
}
