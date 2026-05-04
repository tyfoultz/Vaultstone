-- Remove the "World Map" blank section from the default world creation.
-- Maps are accessible via the sidebar Maps section; a dedicated blank section is redundant.

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
    (v_world.id, 'Timeline',  'timeline',  'list', 3);

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
