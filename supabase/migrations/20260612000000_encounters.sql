CREATE TABLE public.encounters (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'New Encounter',
  description text,
  combatants jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.encounters ENABLE ROW LEVEL SECURITY;

CREATE POLICY encounters_dm_all ON public.encounters
  FOR ALL
  USING (is_campaign_dm(campaign_id))
  WITH CHECK (is_campaign_dm(campaign_id));
