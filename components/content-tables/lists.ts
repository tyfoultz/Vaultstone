// Thin re-export shim for the per-type list components defined inside
// app/(drawer)/game-systems/[id].tsx. Keeps the import path stable for
// callers (the homebrew pack detail page) and sidesteps the awkward
// bracketed-filename import. The list components themselves are
// declared next to the system page that originated them; a future
// extraction can move them here without changing call sites.
export {
  SpellsList,
  FeatsList,
  OptionalFeaturesList,
  DeitiesList,
  VariantRulesList,
  ItemsList,
  CreaturesList,
  ConditionsList,
  SpeciesList,
  BackgroundsList,
  SubclassesList,
} from '../../app/(drawer)/game-systems/[id]';
