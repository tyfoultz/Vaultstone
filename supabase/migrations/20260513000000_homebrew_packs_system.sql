-- Tag homebrew packs to a game system. A pack of "5e spells" can't be
-- used in a Pathfinder campaign — system compatibility is a property of
-- the pack itself, not just its entries.
--
-- Default to 'dnd5e_2024' as a one-shot for any pre-existing rows. The
-- table is currently empty, so no rows actually inherit the default —
-- but the default lets us add a NOT NULL column without a separate
-- two-phase migration.

alter table homebrew_packs
  add column system text not null default 'dnd5e_2024';

create index homebrew_packs_system_idx on homebrew_packs(system);
