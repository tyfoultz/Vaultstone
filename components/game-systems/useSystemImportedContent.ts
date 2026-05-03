// Fetches the imported-tier content for one game system and fans the
// entries into the SrdContent bucket shape so the existing detail-page
// renderers (Class detail, Spells tab, etc.) can surface imported content
// alongside SRD without per-tab rework.
//
// Mirrors useSystemHomebrewContent. Reactive to a `refreshTick` value so
// the Imported Content tab can force a re-fetch after dev imports / removes
// land. Production callers (the wider Game Systems detail page) just observe
// the natural mount/unmount lifecycle.

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

export type SystemImportedState = {
  loading: boolean;
  buckets: Partial<SrdContent>;
};

export function useSystemImportedContent(
  systemId: string,
  refreshTick = 0,
): SystemImportedState {
  const [state, setState] = useState<SystemImportedState>({ loading: true, buckets: {} });

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, buckets: {} });

    ContentResolver.search({ system: systemId, tiers: ['imported'] }).then((results) => {
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
          // aren't currently produced by any transform — additional content
          // types will be added here as their transforms land.
        }
      }
      setState({ loading: false, buckets });
    });

    return () => { cancelled = true; };
  }, [systemId, refreshTick]);

  return state;
}
