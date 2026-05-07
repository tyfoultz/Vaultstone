-- Campaign character-creation rules.
--
-- Stores DM-chosen values for the system's character-scope and
-- campaign-scope optional rules (see GameSystemDefinition.optionalRules
-- and packages/systems/src/dnd5e/optional-rules.ts). Bag-of-key-values
-- because the schema varies per system: dnd5e ships ~10 keys today
-- with mixed boolean / choice / number types; Pathfinder, Custom, and
-- future systems will declare their own.
--
-- Lookup pattern at read time: take the system's optionalRules, walk
-- each rule, and read the value from this column at rule.key (falling
-- back to rule.default when the campaign hasn't set it). Writes from
-- the DM's editor commit the entire JSON object atomically.

alter table public.campaigns
  add column if not exists character_creation_rules jsonb not null default '{}'::jsonb;
