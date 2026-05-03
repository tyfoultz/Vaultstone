// Fetches the authenticated user's homebrew entries scoped to one game
// system and fans them into the SrdContent bucket shape so the existing
// detail-page tabs (which read from a single typed content object) can
// surface homebrew alongside SRD without per-tab rework.
//
// Returns a Partial<SrdContent> — only buckets that actually have homebrew
// entries are present; the merge step in the caller spreads SRD first,
// concats homebrew on top.
//
// "Homebrew" here is the unified content-pack concept: both the user's
// authored homebrew_content rows AND their imported_content rows
// (entries derived from JSON imports like 5e.tools), since both share
// the same homebrew_packs parent. The resolver's homebrew tier reader
// merges them; this hook just consumes the merged stream.

import { useEffect, useState } from 'react';
import { ContentResolver, type SrdContent } from '@vaultstone/content';
import type {
  SpellResult,
  CreatureResult,
  ItemResult,
  FeatResult,
  ClassResult,
  SubclassResult,
  SpeciesResult,
  BackgroundResult,
} from '@vaultstone/types';

export type SystemHomebrewState = {
  loading: boolean;
  buckets: Partial<SrdContent>;
};

/**
 * `refreshTick` lets callers force a re-fetch by bumping a number — used
 * by the Game Systems page after the import modal lands new entries so
 * downstream surfaces (Class detail, Spells tab, etc.) see them without
 * needing a remount. Defaults to 0; same dependency-array pattern any
 * polling/refresh loop would use.
 */
export function useSystemHomebrewContent(
  systemId: string,
  refreshTick = 0,
): SystemHomebrewState {
  const [state, setState] = useState<SystemHomebrewState>({ loading: true, buckets: {} });

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, buckets: {} });

    ContentResolver.search({ system: systemId, tiers: ['homebrew'] }).then((results) => {
      if (cancelled) return;
      const buckets: Partial<SrdContent> = {};
      for (const r of results) {
        switch (r.type) {
          case 'spell':       (buckets.spells       ??= []).push(r as SpellResult); break;
          case 'monster':     (buckets.creatures    ??= []).push(r as CreatureResult); break;
          case 'item':        (buckets.items        ??= []).push(r as ItemResult); break;
          case 'feat':        (buckets.feats        ??= []).push(r as FeatResult); break;
          case 'class':       (buckets.classes      ??= []).push(r as ClassResult); break;
          case 'subclass':    (buckets.subclasses   ??= []).push(r as SubclassResult); break;
          case 'species':     (buckets.species      ??= []).push(r as SpeciesResult); break;
          case 'background':  (buckets.backgrounds  ??= []).push(r as BackgroundResult); break;
          // Other content types (conditions, rules, catalog vocab, etc.)
          // aren't currently produced by either authoring or imports —
          // additional types will slot in here as their producers land.
        }
      }
      setState({ loading: false, buckets });
    });

    return () => {
      cancelled = true;
    };
  }, [systemId, refreshTick]);

  return state;
}
