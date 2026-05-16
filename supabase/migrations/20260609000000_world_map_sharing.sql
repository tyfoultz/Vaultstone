-- World map sharing — visible_to_players toggle + per-user permission grants.
--
-- Maps gain the same sharing model as pages: a global `visible_to_players`
-- toggle for world members / campaign players, plus per-user grants via
-- `world_map_permissions`. No cascade (maps are flat, unlike the page tree).

-- Add visible_to_players to world_maps
ALTER TABLE public.world_maps
  ADD COLUMN IF NOT EXISTS visible_to_players boolean NOT NULL DEFAULT false;

-- Per-map permission grants
CREATE TABLE IF NOT EXISTS public.world_map_permissions (
  map_id      uuid NOT NULL REFERENCES world_maps(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission  world_page_permission_level NOT NULL DEFAULT 'view',
  granted_by  uuid NOT NULL REFERENCES auth.users(id),
  granted_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (map_id, user_id)
);

CREATE INDEX IF NOT EXISTS world_map_permissions_user_idx
  ON world_map_permissions (user_id);

ALTER TABLE world_map_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS world_map_permissions_owner_all ON world_map_permissions;
CREATE POLICY world_map_permissions_owner_all ON world_map_permissions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM world_maps m
      JOIN worlds w ON w.id = m.world_id
      WHERE m.id = world_map_permissions.map_id
        AND w.owner_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM world_maps m
      JOIN worlds w ON w.id = m.world_id
      WHERE m.id = world_map_permissions.map_id
        AND w.owner_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS world_map_permissions_grantee_select ON world_map_permissions;
CREATE POLICY world_map_permissions_grantee_select ON world_map_permissions
  FOR SELECT
  USING (user_id = auth.uid());

-- Effective permission for a user on a map (no ancestor walk — maps are flat)
CREATE OR REPLACE FUNCTION public.effective_map_permission(
  p_user_id uuid,
  p_map_id uuid
)
RETURNS world_page_permission_level
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT permission
  FROM world_map_permissions
  WHERE map_id = p_map_id
    AND user_id = p_user_id;
$$;

GRANT EXECUTE ON FUNCTION public.effective_map_permission(uuid, uuid) TO authenticated;

-- Mirror of user_can_view_page for maps. Visibility paths:
--   1. World owner
--   2. Explicit map permission grant
--   3. Page-attached: inherit from the owner page's visibility
--   4. visible_to_players + (world member OR campaign member)
CREATE OR REPLACE FUNCTION public.user_can_view_map(p_user_id uuid, p_map_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM world_maps m
    JOIN worlds w ON w.id = m.world_id
    WHERE m.id = p_map_id
      AND m.deleted_at IS NULL
      AND w.deleted_at IS NULL
      AND (
        w.owner_user_id = p_user_id
        OR effective_map_permission(p_user_id, p_map_id) IS NOT NULL
        OR (m.owner_page_id IS NOT NULL AND user_can_view_page(p_user_id, m.owner_page_id))
        OR (
          m.visible_to_players = true
          AND (
            EXISTS (
              SELECT 1 FROM world_members wm
              WHERE wm.world_id = m.world_id
                AND wm.user_id = p_user_id
            )
            OR EXISTS (
              SELECT 1
              FROM world_campaigns wc
              JOIN campaigns c ON c.id = wc.campaign_id
              WHERE wc.world_id = m.world_id
                AND (
                  c.dm_user_id = p_user_id
                  OR EXISTS (
                    SELECT 1 FROM campaign_members cm
                    WHERE cm.campaign_id = wc.campaign_id
                      AND cm.user_id = p_user_id
                  )
                  OR EXISTS (
                    SELECT 1 FROM characters ch
                    WHERE ch.campaign_id = wc.campaign_id
                      AND ch.user_id = p_user_id
                  )
                )
            )
          )
        )
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.user_can_view_map(uuid, uuid) TO authenticated;

-- Replace world_maps SELECT policy with the new helper
DROP POLICY IF EXISTS world_maps_select ON public.world_maps;
CREATE POLICY world_maps_select ON public.world_maps
  FOR SELECT
  USING (
    deleted_at IS NULL
    AND public.user_can_view_map(auth.uid(), id)
  );

-- Replace map_pins SELECT policy to use new map visibility
DROP POLICY IF EXISTS map_pins_select ON public.map_pins;
CREATE POLICY map_pins_select ON public.map_pins
  FOR SELECT
  USING (
    public.is_world_owner(world_id)
    OR EXISTS (
      SELECT 1
      FROM public.world_maps m
      WHERE m.id = map_pins.map_id
        AND m.deleted_at IS NULL
        AND public.user_can_view_map(auth.uid(), m.id)
    )
  );
