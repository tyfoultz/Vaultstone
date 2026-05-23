import { useEffect, useState } from 'react';
import { ContentResolver } from '@vaultstone/content';
import type { Dnd5eStats } from '@vaultstone/types';

export type ResolvedContentLabels = {
  speciesLabel: string | null;
  classLabel: string | null;
  subclassLabel: string | null;
  backgroundLabel: string | null;
};

/**
 * Build the "Species Subclass Class" identity line for a party card
 * subtitle. Many homebrew packs name species and subclasses with the
 * class baked in ("Owlin Artificer", "Champion Fighter") — a holdover
 * from the pre-rework subtitle format. To avoid printing the class
 * twice, drop any word from species and subclass that matches the
 * class label (case-insensitive). Operates word-by-word so it handles
 * leading, middle, or trailing dupes without regex escaping.
 */
export function composeIdentity(
  speciesLabel: string | null,
  subclassLabel: string | null,
  classLabel: string | null,
): string {
  const classWords = (classLabel ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  const classWordSet = new Set(classWords);
  const stripClassWords = (label: string | null): string | null => {
    if (!label) return null;
    if (classWordSet.size === 0) return label;
    const kept = label.split(/\s+/).filter((w) => w && !classWordSet.has(w.toLowerCase()));
    return kept.length > 0 ? kept.join(' ') : null;
  };
  return [stripClassWords(speciesLabel), stripClassWords(subclassLabel), classLabel]
    .filter(Boolean)
    .join(' ');
}

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
 * Pick the primary class entry's subclass key. Multi-class characters
 * carry a `classes[]` list with one entry flagged `primary: true`;
 * single-class legacy characters have no `classes[]`, in which case
 * there's no subclass selection to surface here.
 */
function primarySubclassKey(stats: Dnd5eStats | null): string | null {
  const entries = stats?.classes;
  if (!entries || entries.length === 0) return null;
  return entries.find((e) => e.primary)?.subclassKey ?? entries[0].subclassKey ?? null;
}

/**
 * Resolve human names for a character's species / class / subclass /
 * background. Sync prettify covers SRD + imported keys; only `homebrew_*`
 * keys trigger a ContentResolver lookup so the homebrew tier's name
 * field (the user's actual species name) shows instead of the row UUID.
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
  const subclassKey = primarySubclassKey(stats);
  const backgroundKey = stats?.backgroundKey ?? null;
  const srdVersion = stats?.srdVersion;
  const campaignId = opts.campaignId ?? null;

  const [resolved, setResolved] = useState<ResolvedContentLabels>({
    speciesLabel: prettifyContentKey(speciesKey),
    classLabel: prettifyContentKey(classKey),
    subclassLabel: prettifyContentKey(subclassKey),
    backgroundLabel: prettifyContentKey(backgroundKey),
  });

  useEffect(() => {
    const sync: ResolvedContentLabels = {
      speciesLabel: prettifyContentKey(speciesKey),
      classLabel: prettifyContentKey(classKey),
      subclassLabel: prettifyContentKey(subclassKey),
      backgroundLabel: prettifyContentKey(backgroundKey),
    };

    const needsHomebrew =
      (speciesKey?.startsWith('homebrew_') && !sync.speciesLabel) ||
      (classKey?.startsWith('homebrew_') && !sync.classLabel) ||
      (subclassKey?.startsWith('homebrew_') && !sync.subclassLabel) ||
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
      const [speciesResults, classResults, subclassResults, backgroundResults] = await Promise.all([
        speciesKey?.startsWith('homebrew_')
          ? ContentResolver.search({ ...tierArgs, type: 'species' })
          : Promise.resolve([]),
        classKey?.startsWith('homebrew_')
          ? ContentResolver.search({ ...tierArgs, type: 'class' })
          : Promise.resolve([]),
        subclassKey?.startsWith('homebrew_')
          ? ContentResolver.search({ ...tierArgs, type: 'subclass' })
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
        subclassLabel:
          subclassKey?.startsWith('homebrew_')
            ? subclassResults.find((r) => r.key === subclassKey)?.name ?? null
            : sync.subclassLabel,
        backgroundLabel:
          backgroundKey?.startsWith('homebrew_')
            ? backgroundResults.find((r) => r.key === backgroundKey)?.name ?? null
            : sync.backgroundLabel,
      });
    })();
    return () => { cancelled = true; };
  }, [speciesKey, classKey, subclassKey, backgroundKey, srdVersion, campaignId]);

  return resolved;
}
