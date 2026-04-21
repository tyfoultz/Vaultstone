-- Restructure calendar schema: each era owns its own date levels.
-- __calendar_schema changes from a flat CalendarUnit[] to:
--   { "eras": [{ "key": "...", "label": "...", "dateLevels": [...] }, ...] }
--
-- Event date_values stays the same shape: { "era": "<era_key>", "year": "42", ... }
-- The trigger now looks up the era's dateLevels to compute sort_key.

CREATE OR REPLACE FUNCTION public.compute_timeline_sort_key()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_raw     jsonb;
  v_eras    jsonb;
  v_era_key text;
  v_era     jsonb;
  v_levels  jsonb;
  v_sort    numeric := 0;
  v_era_idx int := 0;
  v_count   int;
  v_unit    jsonb;
  v_val     text;
  v_opts    jsonb;
  v_opt_idx int;
  v_i       int;
BEGIN
  SELECT structured_fields->'__calendar_schema'
    INTO v_raw
    FROM world_pages
   WHERE id = NEW.timeline_page_id;

  IF v_raw IS NULL THEN
    NEW.sort_key := 0;
    RETURN NEW;
  END IF;

  -- New schema shape: { "eras": [...] }
  v_eras := v_raw->'eras';
  IF v_eras IS NULL OR jsonb_typeof(v_eras) != 'array' THEN
    -- Fallback: try legacy flat-array format
    IF jsonb_typeof(v_raw) = 'array' THEN
      -- Legacy: flat CalendarUnit[]. Use old algorithm.
      NEW.sort_key := 0;
      RETURN NEW;
    END IF;
    NEW.sort_key := 0;
    RETURN NEW;
  END IF;

  -- Find which era this event belongs to
  v_era_key := NEW.date_values->>'era';
  IF v_era_key IS NULL THEN
    NEW.sort_key := 0;
    RETURN NEW;
  END IF;

  -- Find era index and its date levels
  v_levels := NULL;
  FOR v_i IN 0..(jsonb_array_length(v_eras) - 1) LOOP
    v_era := v_eras->v_i;
    IF (v_era->>'key') = v_era_key THEN
      v_era_idx := v_i;
      v_levels := v_era->'dateLevels';
      EXIT;
    END IF;
  END LOOP;

  -- Era position is the primary sort component (big multiplier)
  v_sort := (v_era_idx + 1)::numeric * 1000000000000;

  IF v_levels IS NOT NULL AND jsonb_typeof(v_levels) = 'array' THEN
    v_count := jsonb_array_length(v_levels);
    FOR v_i IN 0..(v_count - 1) LOOP
      v_unit := v_levels->v_i;
      v_val := NEW.date_values->>( v_unit->>'key' );

      IF v_val IS NULL THEN
        v_sort := v_sort * 10000;
      ELSIF (v_unit->>'type') = 'number' THEN
        v_sort := v_sort + COALESCE(v_val::numeric, 0) * power(10000, v_count - 1 - v_i);
      ELSIF (v_unit->>'type') = 'ordered_list' THEN
        v_opts := v_unit->'options';
        v_opt_idx := 0;
        IF v_opts IS NOT NULL AND jsonb_typeof(v_opts) = 'array' THEN
          FOR j IN 0..(jsonb_array_length(v_opts) - 1) LOOP
            IF (v_opts->>j) = v_val THEN
              v_opt_idx := j + 1;
              EXIT;
            END IF;
          END LOOP;
        END IF;
        v_sort := v_sort + v_opt_idx * power(10000, v_count - 1 - v_i);
      ELSIF (v_unit->>'type') = 'text' THEN
        v_sort := v_sort + (abs(hashtext(v_val)) % 9999) * power(10000, v_count - 1 - v_i);
      END IF;
    END LOOP;
  END IF;

  NEW.sort_key := v_sort;
  RETURN NEW;
END;
$$;
