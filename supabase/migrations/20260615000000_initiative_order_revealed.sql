-- Track which combatants have been "revealed" to players.
-- NPCs start hidden; revealed is set to true when the combatant first
-- becomes the active turn. PCs are always visible regardless of this flag
-- (client filters on character_id IS NOT NULL || revealed).
ALTER TABLE public.initiative_order
  ADD COLUMN IF NOT EXISTS revealed boolean NOT NULL DEFAULT false;
