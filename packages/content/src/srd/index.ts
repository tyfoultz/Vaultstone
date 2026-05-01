import type {
  ContentResult,
  ContentQuery,
  SpeciesResult,
  ClassResult,
  BackgroundResult,
} from '@vaultstone/types';

import speciesData from './data/species.json';
import classesData from './data/classes.json';
import backgroundsData from './data/backgrounds.json';

// SRD content is CC-BY 4.0 — attribution must be displayed in the UI wherever this content is shown.
// Attribution text: "Content from the Systems Reference Document 5.1 / 2.0 is available under
// the Creative Commons Attribution 4.0 International License."

const ALL_SRD: ContentResult[] = [
  ...(speciesData as unknown as SpeciesResult[]),
  ...(classesData as unknown as ClassResult[]),
  ...(backgroundsData as unknown as BackgroundResult[]),
];

export function search(query: ContentQuery): ContentResult[] {
  let results = ALL_SRD;

  if (query.type) {
    results = results.filter((r) => r.type === query.type);
  }

  if (query.system) {
    results = results.filter((r) => r.system === query.system);
  }

  if (query.srdVersion) {
    const version = query.srdVersion;
    results = results.filter((r) => {
      const item = r as ContentResult & { srdVersions?: string[] };
      return item.srdVersions?.includes(version) ?? true;
    });
  }

  if (query.search) {
    const term = query.search.toLowerCase();
    results = results.filter(
      (r) => r.name.toLowerCase().includes(term) || r.key.includes(term)
    );
  }

  return results;
}

export interface SrdCounts {
  species: number;
  classes: number;
  backgrounds: number;
  total: number;
}

/** Synchronous count of bundled SRD records, by type. */
export function getSrdCounts(): SrdCounts {
  const species = (speciesData as unknown as SpeciesResult[]).length;
  const classes = (classesData as unknown as ClassResult[]).length;
  const backgrounds = (backgroundsData as unknown as BackgroundResult[]).length;
  return { species, classes, backgrounds, total: species + classes + backgrounds };
}

export interface SrdContent {
  species: SpeciesResult[];
  classes: ClassResult[];
  backgrounds: BackgroundResult[];
}

/** Synchronous accessor for the bundled SRD records grouped by type. */
export function getSrdContent(): SrdContent {
  return {
    species: speciesData as unknown as SpeciesResult[],
    classes: classesData as unknown as ClassResult[],
    backgrounds: backgroundsData as unknown as BackgroundResult[],
  };
}
