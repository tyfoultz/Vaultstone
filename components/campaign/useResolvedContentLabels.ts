import { useEffect, useState } from 'react';
import { ContentResolver } from '@vaultstone/content';
import type { Dnd5eStats } from '@vaultstone/types';

export type ResolvedContentLabels = {
  speciesLabel: string | null;
  classLabel: string | null;
  backgroundLabel: string | null;
};

/**
 * Friendly fallback for any content key. Strips imported-content prefixes
 * and SRD edition suffixes, then title-cases. Returns null when the key
 * looks like a `homebrew_<uuid>` row id — those carry no usable signal in
 * the slug, so the caller should wait for the resolver lookup or render
 * a placeholder rather than print the raw UUID.
 */
export function prettifyContentKey(key: string | null | undefined): string | null {
  if (!key) return null;
  // homebrew_<uuid> keys are content-addressable database ids. Title-casing
  // them yields "Homebrew F29da69d B7d2 47bc B172…" — strictly worse than
  // showing nothing. Return null so callers can pick a placeholder.
  if (/^homebrew_[0-9a-f-]+$/i.test(key)) return null;
  let s = key;
  const importedMatch = s.match(/^imported_[^_]+_[^_]+_[^_]+_[^_]+_(.+)$/);
  if (importedMatch) s = importedMatch[1];
  s = s.replace(/-srd-[\d-]+$/i, '');
  return s
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Resolve human names for a character's species / class / background.
 * Sync prettify covers SRD + imported keys; only `homebrew_*` keys trigger
 * a ContentResolver lookup so the homebrew tier's name field (the user's
 * actual species name) shows instead of the row UUID.
 *
 * Scoped by `campaignId` so only packs attached to this campaign are
 * searched — matches the wizard / character-sheet resolver scope.
 */
export function useResolvedContentLabels(
  stats: Dnd5eStats | null,
  opts: { campaignId?: string | null },
): ResolvedContentLabels {
  const speciesKey = stats?.speciesKey ?? null;
  const classKey = stats?.classKey ?? null;
  const backgroundKey = stats?.backgroundKey ?? null;
  const srdVersion = stats?.srdVersion;
  const campaignId = opts.campaignId ?? null;

  const [resolved, setResolved] = useState<ResolvedContentLabels>({
    speciesLabel: prettifyContentKey(speciesKey),
    classLabel: prettifyContentKey(classKey),
    backgroundLabel: prettifyContentKey(backgroundKey),
  });

  useEffect(() => {
    const sync: ResolvedContentLabels = {
      speciesLabel: prettifyContentKey(speciesKey),
      classLabel: prettifyContentKey(classKey),
      backgroundLabel: prettifyContentKey(backgroundKey),
    };

    const needsHomebrew =
      (speciesKey?.startsWith('homebrew_') && !sync.speciesLabel) ||
      (classKey?.startsWith('homebrew_') && !sync.classLabel) ||
      (backgroundKey?.startsWith('homebrew_') && !sync.backgroundLabel);

    if (!needsHomebrew || !campaignId) {
      setResolved(sync);
      return;
    }

    let cancelled = false;
    (async () => {
      const tierArgs = {
        system: 'dnd5e' as const,
        srdVersion,
        tiers: ['homebrew'] as Array<'srd' | 'homebrew'>,
        campaignId,
      };
      const [speciesResults, classResults, backgroundResults] = await Promise.all([
        speciesKey?.startsWith('homebrew_')
          ? ContentResolver.search({ ...tierArgs, type: 'species' })
          : Promise.resolve([]),
        classKey?.startsWith('homebrew_')
          ? ContentResolver.search({ ...tierArgs, type: 'class' })
          : Promise.resolve([]),
        backgroundKey?.startsWith('homebrew_')
          ? ContentResolver.search({ ...tierArgs, type: 'background' })
          : Promise.resolve([]),
      ]);
      if (cancelled) return;
      setResolved({
        speciesLabel:
          speciesKey?.startsWith('homebrew_')
            ? speciesResults.find((r) => r.key === speciesKey)?.name ?? null
            : sync.speciesLabel,
        classLabel:
          classKey?.startsWith('homebrew_')
            ? classResults.find((r) => r.key === classKey)?.name ?? null
            : sync.classLabel,
        backgroundLabel:
          backgroundKey?.startsWith('homebrew_')
            ? backgroundResults.find((r) => r.key === backgroundKey)?.name ?? null
            : sync.backgroundLabel,
      });
    })();
    return () => { cancelled = true; };
  }, [speciesKey, classKey, backgroundKey, srdVersion, campaignId]);

  return resolved;
}
