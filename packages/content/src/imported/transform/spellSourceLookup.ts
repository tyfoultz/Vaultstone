// Transform a 5e.tools `gendata-spell-source-lookup.json` payload into
// per-spell class-list patches.
//
// Background: 5e.tools spell entries don't carry their own class lists —
// the class↔spell relation lives in a separate index file generated from
// the class definitions. So a vanilla spells-xphb.json import produces
// SpellResult rows with `classes: []`, and class-detail spell-list views
// don't surface them. Importing this lookup file fills in the gap by
// merging a `classes: string[]` patch into each existing imported spell
// row's `data` blob.
//
// File shape (top level is the spell's source code, lowercased):
//   {
//     "phb": {
//       "fireball": {
//         "class":        { "PHB":  { "Sorcerer": true, "Wizard": true }, ... },
//         "classVariant": { "TCE":  { "Artificer": { "definedInSources": [...] } } },
//         "subclass":     { ... }, "background": { ... }, ...
//       }, ...
//     }, ...
//   }
//
// We only consume `class` and `classVariant` (both nominate the spell for
// the named class). The class-source codes inside aren't surfaced — we
// just collect distinct class names. Subclass/background/feat/race entries
// are ignored; they nominate the spell for narrower features that don't
// flow into the class spell list.

import { slugify } from './entries';

export type RawSpellSourceLookupFile = {
  /** Top-level keys are spell sources (lowercased). Anything starting
   *  with `_` is metadata we ignore. */
  [spellSource: string]: unknown;
};

export type SpellClassesPatch = {
  /** Matches the entry_key the spell transform produced. */
  entryKey: string;
  /** Spell name, surfaced in the import preview. */
  name: string;
  /** Source code of the spell row this patch targets (uppercased back
   *  from the lookup's lowercased key). Surfaced in previews. */
  sourceCode: string;
  /** Distinct class names that can cast this spell, sorted ascending. */
  classes: string[];
};

export type TransformOptions = {
  systemId: string;
};

/**
 * Walk the lookup payload and produce one patch per spell that has at
 * least one class entry. Spells with empty `class` and `classVariant`
 * sections are skipped — there's nothing to patch.
 *
 * Patches are keyed identically to the spell transform's output:
 *   `imported_<systemId>_spell_<sourceSlug>_<nameSlug>`
 * so a patch lands on the row regardless of which `source_label` the
 * structured spells file was imported under.
 */
export function transformSpellSourceLookup(
  raw: RawSpellSourceLookupFile,
  opts: TransformOptions,
): SpellClassesPatch[] {
  const { systemId } = opts;
  const out: SpellClassesPatch[] = [];

  for (const [spellSource, spellsRaw] of Object.entries(raw)) {
    if (spellSource.startsWith('_')) continue; // metadata
    if (!spellsRaw || typeof spellsRaw !== 'object') continue;
    const spells = spellsRaw as Record<string, unknown>;

    for (const [spellName, body] of Object.entries(spells)) {
      if (!body || typeof body !== 'object') continue;
      const classes = collectClasses(body as Record<string, unknown>);
      if (classes.length === 0) continue;

      // Spell names in the lookup are lowercase ("acid splash"); we slugify
      // them, so casing doesn't matter for the key. The structured spells
      // transform also slugifies on its side, so the keys line up.
      const entryKey = `imported_${systemId}_spell_${slugify(spellSource)}_${slugify(spellName)}`;
      out.push({
        entryKey,
        name: spellName,
        sourceCode: spellSource.toUpperCase(),
        classes,
      });
    }
  }

  return out;
}

/**
 * Pull every class name out of a single spell's lookup body. The shape:
 *   class:        { [classSource]: { [ClassName]: true | { ... } } }
 *   classVariant: { [classSource]: { [ClassName]: { definedInSources: [...] } } }
 *
 * We accept both shapes — a class entry of either `true` or an object
 * means "this class can cast this spell". Class names are deduped across
 * sources (the same spell often appears under both PHB and XPHB) and
 * sorted alphabetically so the merged list is deterministic.
 */
function collectClasses(body: Record<string, unknown>): string[] {
  const set = new Set<string>();
  for (const key of ['class', 'classVariant']) {
    const bySource = body[key];
    if (!bySource || typeof bySource !== 'object') continue;
    for (const classes of Object.values(bySource as Record<string, unknown>)) {
      if (!classes || typeof classes !== 'object') continue;
      for (const className of Object.keys(classes as Record<string, unknown>)) {
        set.add(className);
      }
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}
