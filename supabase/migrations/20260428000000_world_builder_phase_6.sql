-- Feature 9 — World Builder Phase 6 (Timelines + Feature 6 Integration)
-- Adds timeline_events table, sort_key trigger, extends create_world_with_owner
-- to seed a Timeline section + primary timeline page, backfills existing worlds.

-- ─────────────────────────────────────────────────────────────────────────
-- Extend world_sections.template_key to include 'timeline'
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE world_sections DROP CONSTRAINT IF EXISTS world_sections_template_key_check;
ALTER TABLE world_sections ADD CONSTRAINT world_sections_template_key_check
  CHECK (template_key IN ('locations','npcs','players','factions','lore','blank','timeline'));

-- ─────────────────────────────────────────────────────────────────────────
-- timeline_events table
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.timeline_events (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timeline_page_id    uuid NOT NULL REFERENCES public.world_pages(id) ON DELETE CASCADE,
  world_id            uuid NOT NULL REFERENCES public.worlds(id) ON DELETE CASCADE,
  title               text NOT NULL CHECK (length(trim(title)) > 0),
  date_values         jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_key            numeric NOT NULL DEFAULT 0,
  tie_breaker         numeric NOT NULL DEFAULT 0,
  source_session_id   uuid REFERENCES public.sessions(id) ON DELETE SET NULL,
  visible_to_players  boolean NOT NULL DEFAULT true,
  body                jsonb NOT NULL DEFAULT '{}'::jsonb,
  body_text           text,
  body_refs           uuid[] NOT NULL DEFAULT '{}',
  deleted_at          timestamptz,
  hard_delete_after   timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS timeline_events_page_sort_idx
  ON public.timeline_events (timeline_page_id, sort_key, tie_breaker)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS timeline_events_world_idx
  ON public.timeline_events (world_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS timeline_events_body_refs_gin
  ON public.timeline_events USING gin (body_refs);

CREATE INDEX IF NOT EXISTS timeline_events_source_session_idx
  ON public.timeline_events (source_session_id)
  WHERE source_session_id IS NOT NULL;

DROP TRIGGER IF EXISTS timeline_events_updated_at ON public.timeline_events;
CREATE TRIGGER timeline_events_updated_at
  BEFORE UPDATE ON public.timeline_events
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- sort_key computation trigger
-- Walks the parent timeline page's structured_fields->'__calendar_schema'
-- and produces a deterministic numeric sort_key from date_values.
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.compute_timeline_sort_key()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_schema jsonb;
  v_sort   numeric := 0;
  v_unit   jsonb;
  v_idx    int;
  v_count  int;
  v_val    text;
  v_opts   jsonb;
  v_opt_idx int;
BEGIN
  SELECT structured_fields->'__calendar_schema'
    INTO v_schema
    FROM world_pages
   WHERE id = NEW.timeline_page_id;

  IF v_schema IS NULL OR jsonb_typeof(v_schema) != 'array' THEN
    NEW.sort_key := 0;
    RETURN NEW;
  END IF;

  v_count := jsonb_array_length(v_schema);
  v_sort := 0;

  FOR v_idx IN 0..(v_count - 1) LOOP
    v_unit := v_schema->v_idx;
    v_val := NEW.date_values->>( v_unit->>'key' );

    IF v_val IS NULL THEN
      v_sort := v_sort * 10000;
    ELSIF (v_unit->>'type') = 'number' THEN
      v_sort := v_sort * 10000 + COALESCE(v_val::numeric, 0);
    ELSIF (v_unit->>'type') = 'ordered_list' THEN
      v_opts := v_unit->'options';
      v_opt_idx := 0;
      IF v_opts IS NOT NULL AND jsonb_typeof(v_opts) = 'array' THEN
        FOR i IN 0..(jsonb_array_length(v_opts) - 1) LOOP
          IF (v_opts->>i) = v_val THEN
            v_opt_idx := i + 1;
            EXIT;
          END IF;
        END LOOP;
      END IF;
      v_sort := v_sort * 10000 + v_opt_idx;
    ELSIF (v_unit->>'type') = 'text' THEN
      v_sort := v_sort * 10000 + abs(hashtext(v_val)) % 9999;
    END IF;
  END LOOP;

  NEW.sort_key := v_sort;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_timeline_events_sort_key ON public.timeline_events;
CREATE TRIGGER tr_timeline_events_sort_key
  BEFORE INSERT OR UPDATE OF date_values ON public.timeline_events
  FOR EACH ROW
  EXECUTE FUNCTION public.compute_timeline_sort_key();

-- ─────────────────────────────────────────────────────────────────────────
-- Bulk recomputation when parent page's calendar_schema changes
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.recompute_timeline_children_sort_keys()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (OLD.structured_fields->>'__calendar_schema') IS DISTINCT FROM
     (NEW.structured_fields->>'__calendar_schema') THEN
    UPDATE timeline_events
       SET date_values = date_values
     WHERE timeline_page_id = NEW.id
       AND deleted_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_world_pages_calendar_schema_change ON public.world_pages;
CREATE TRIGGER tr_world_pages_calendar_schema_change
  AFTER UPDATE OF structured_fields ON public.world_pages
  FOR EACH ROW
  WHEN (NEW.page_kind = 'timeline')
  EXECUTE FUNCTION public.recompute_timeline_children_sort_keys();

-- ─────────────────────────────────────────────────────────────────────────
-- RLS on timeline_events
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.timeline_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS timeline_events_owner_all ON public.timeline_events;
CREATE POLICY timeline_events_owner_all ON public.timeline_events
  FOR ALL
  USING (public.is_world_owner(world_id))
  WITH CHECK (public.is_world_owner(world_id));

DROP POLICY IF EXISTS timeline_events_member_select ON public.timeline_events;
CREATE POLICY timeline_events_member_select ON public.timeline_events
  FOR SELECT
  USING (
    deleted_at IS NULL
    AND visible_to_players = true
    AND public.user_can_view_page(auth.uid(), timeline_page_id)
  );

-- ─────────────────────────────────────────────────────────────────────────
-- trash_timeline_event RPC
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trash_timeline_event(p_event_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_world uuid;
  v_now   timestamptz := now();
BEGIN
  SELECT world_id INTO v_world FROM timeline_events WHERE id = p_event_id;
  IF v_world IS NULL THEN
    RAISE EXCEPTION 'event not found';
  END IF;
  IF NOT is_world_owner(v_world) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  UPDATE timeline_events
     SET deleted_at = v_now,
         hard_delete_after = v_now + interval '30 days'
   WHERE id = p_event_id
     AND deleted_at IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.trash_timeline_event(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- Extend create_world_with_owner to seed Timeline section + primary page
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_world_with_owner(
  p_name         text,
  p_description  text DEFAULT NULL,
  p_campaign_ids uuid[] DEFAULT NULL
) RETURNS worlds
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user       uuid := auth.uid();
  v_world      worlds;
  v_cid        uuid;
  v_tl_sec_id  uuid;
  v_tl_page_id uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'world name is required';
  END IF;

  INSERT INTO worlds (owner_user_id, name, description)
       VALUES (v_user, trim(p_name), nullif(trim(coalesce(p_description, '')), ''))
    RETURNING * INTO v_world;

  INSERT INTO world_sections (world_id, name, template_key, section_view, sort_order) VALUES
    (v_world.id, 'Locations', 'locations', 'grid', 0),
    (v_world.id, 'NPCs',      'npcs',      'list', 1),
    (v_world.id, 'Players',   'players',   'list', 2),
    (v_world.id, 'World Map', 'blank',     'list', 3),
    (v_world.id, 'Timeline',  'timeline',  'list', 4);

  SELECT id INTO v_tl_sec_id
    FROM world_sections
   WHERE world_id = v_world.id AND template_key = 'timeline'
   LIMIT 1;

  INSERT INTO world_pages (
    world_id, section_id, title, page_kind, template_key, template_version, sort_order
  ) VALUES (
    v_world.id, v_tl_sec_id, 'World Timeline', 'timeline', 'timeline', 1, 0
  ) RETURNING id INTO v_tl_page_id;

  UPDATE worlds
     SET primary_timeline_page_id = v_tl_page_id
   WHERE id = v_world.id;

  SELECT * INTO v_world FROM worlds WHERE id = v_world.id;

  IF p_campaign_ids IS NOT NULL THEN
    FOREACH v_cid IN ARRAY p_campaign_ids LOOP
      IF is_campaign_dm(v_cid) THEN
        INSERT INTO world_campaigns (world_id, campaign_id)
             VALUES (v_world.id, v_cid)
        ON CONFLICT DO NOTHING;
      END IF;
    END LOOP;
  END IF;

  RETURN v_world;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_world_with_owner(text, text, uuid[]) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- Backfill: add Timeline section + primary timeline page to existing worlds
-- ─────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  r RECORD;
  v_sec_id  uuid;
  v_page_id uuid;
  v_max_sort int;
BEGIN
  FOR r IN
    SELECT id FROM worlds
     WHERE primary_timeline_page_id IS NULL
       AND deleted_at IS NULL
  LOOP
    SELECT COALESCE(MAX(sort_order), -1) + 1 INTO v_max_sort
      FROM world_sections
     WHERE world_id = r.id AND deleted_at IS NULL;

    INSERT INTO world_sections (world_id, name, template_key, section_view, sort_order)
         VALUES (r.id, 'Timeline', 'timeline', 'list', v_max_sort)
      RETURNING id INTO v_sec_id;

    INSERT INTO world_pages (
      world_id, section_id, title, page_kind, template_key, template_version, sort_order
    ) VALUES (
      r.id, v_sec_id, 'World Timeline', 'timeline', 'timeline', 1, 0
    ) RETURNING id INTO v_page_id;

    UPDATE worlds SET primary_timeline_page_id = v_page_id WHERE id = r.id;
  END LOOP;
END;
$$;
