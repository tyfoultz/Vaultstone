-- Add tags column to timeline_events for event categorization chips
ALTER TABLE public.timeline_events ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';
