-- Add creature_key to initiative_order so DM-added creatures can reference
-- the content catalog for stat block display during combat.
ALTER TABLE public.initiative_order
  ADD COLUMN IF NOT EXISTS creature_key text null;
