ALTER TABLE public.initiative_order
  ADD COLUMN IF NOT EXISTS hp_temp integer NOT NULL DEFAULT 0;
