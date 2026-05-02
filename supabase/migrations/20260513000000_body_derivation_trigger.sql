-- Server-side derivation of body_text and body_refs from TipTap JSON.
-- Ensures data integrity regardless of client behavior.

-- ── Plain text extraction ──────────────────────────────────────────────
-- Walks the TipTap JSON content tree and collects text from text nodes,
-- joining with newlines between block-level nodes.
create or replace function public.extract_tiptap_text(doc jsonb)
returns text
language plpgsql
immutable
as $$
declare
  result text := '';
begin
  if doc is null or jsonb_typeof(doc) != 'object' then
    return '';
  end if;
  result := _walk_tiptap_text(doc);
  -- Collapse runs of 3+ newlines into 2
  result := regexp_replace(result, E'\n{3,}', E'\n\n', 'g');
  return trim(both E'\n ' from result);
end;
$$;

create or replace function public._walk_tiptap_text(node jsonb)
returns text
language plpgsql
immutable
as $$
declare
  result text := '';
  child jsonb;
  node_type text;
begin
  if node is null or jsonb_typeof(node) != 'object' then
    return '';
  end if;

  -- Text nodes carry the actual text content
  if node ? 'text' and jsonb_typeof(node -> 'text') = 'string' then
    return node ->> 'text';
  end if;

  -- Recurse into children
  if node ? 'content' and jsonb_typeof(node -> 'content') = 'array' then
    for child in select * from jsonb_array_elements(node -> 'content')
    loop
      result := result || _walk_tiptap_text(child);
    end loop;
  end if;

  -- Block-level nodes add a trailing newline
  node_type := node ->> 'type';
  if node_type in ('paragraph', 'heading', 'blockquote', 'codeBlock',
                    'listItem', 'bulletList', 'orderedList', 'horizontalRule') then
    result := result || E'\n';
  end if;

  return result;
end;
$$;

-- ── Mention ref extraction ─────────────────────────────────────────────
-- Collects page IDs from vaultstoneMention nodes (kind='page' or null).
create or replace function public.extract_tiptap_refs(doc jsonb)
returns uuid[]
language plpgsql
immutable
as $$
declare
  refs uuid[] := '{}';
begin
  if doc is null or jsonb_typeof(doc) != 'object' then
    return refs;
  end if;
  refs := _walk_tiptap_refs(doc);
  -- Deduplicate
  select array_agg(distinct u) into refs from unnest(refs) as u;
  return coalesce(refs, '{}');
end;
$$;

create or replace function public._walk_tiptap_refs(node jsonb)
returns uuid[]
language plpgsql
immutable
as $$
declare
  refs uuid[] := '{}';
  child jsonb;
  node_type text;
  node_attrs jsonb;
  ref_id text;
  ref_kind text;
begin
  if node is null or jsonb_typeof(node) != 'object' then
    return refs;
  end if;

  node_type := node ->> 'type';
  node_attrs := node -> 'attrs';

  -- vaultstoneMention nodes with kind='page' or null (legacy)
  if node_type = 'vaultstoneMention' and node_attrs is not null then
    ref_id := node_attrs ->> 'id';
    ref_kind := node_attrs ->> 'kind';
    if ref_id is not null and ref_id != '' and (ref_kind is null or ref_kind = 'page') then
      refs := refs || ref_id::uuid;
    end if;
  end if;

  -- Recurse into children
  if node ? 'content' and jsonb_typeof(node -> 'content') = 'array' then
    for child in select * from jsonb_array_elements(node -> 'content')
    loop
      refs := refs || _walk_tiptap_refs(child);
    end loop;
  end if;

  return refs;
end;
$$;

-- ── Lore canvas extraction helpers ─────────────────────────────────────
-- LoreCanvasEditor stores content as {__canvas_blocks: [{html: "..."}]}.
-- Extract text by stripping HTML tags; extract refs from data-id attrs.
create or replace function public._extract_canvas_text(doc jsonb)
returns text
language plpgsql
immutable
as $$
declare
  result text := '';
  block jsonb;
  html text;
begin
  if not doc ? '__canvas_blocks' then return ''; end if;
  for block in select * from jsonb_array_elements(doc -> '__canvas_blocks')
  loop
    html := block ->> 'html';
    if html is not null then
      -- Strip HTML tags for plain text
      result := result || regexp_replace(html, '<[^>]+>', ' ', 'g') || E'\n';
    end if;
  end loop;
  return trim(both E'\n ' from result);
end;
$$;

create or replace function public._extract_canvas_refs(doc jsonb)
returns uuid[]
language plpgsql
immutable
as $$
declare
  refs uuid[] := '{}';
  block jsonb;
  html text;
  match text[];
begin
  if not doc ? '__canvas_blocks' then return refs; end if;
  for block in select * from jsonb_array_elements(doc -> '__canvas_blocks')
  loop
    html := block ->> 'html';
    if html is not null then
      -- Extract data-id values from mention spans (kind=page or no kind)
      for match in select regexp_matches(html,
        'class="vaultstone-mention"[^>]*data-id="([0-9a-f-]{36})"', 'gi')
      loop
        refs := refs || match[1]::uuid;
      end loop;
      -- Also match reversed order: data-id before class
      for match in select regexp_matches(html,
        'data-id="([0-9a-f-]{36})"[^>]*class="vaultstone-mention"', 'gi')
      loop
        refs := refs || match[1]::uuid;
      end loop;
    end if;
  end loop;
  -- Deduplicate
  select array_agg(distinct u) into refs from unnest(refs) as u;
  return coalesce(refs, '{}');
end;
$$;

-- ── Trigger function ──────────────────────────────────────���────────────
create or replace function public.tr_derive_body_fields()
returns trigger
language plpgsql
as $$
begin
  if NEW.body is not null and jsonb_typeof(NEW.body) = 'object' then
    -- Detect lore canvas format vs standard TipTap
    if NEW.body ? '__canvas_blocks' then
      NEW.body_text := _extract_canvas_text(NEW.body);
      NEW.body_refs := _extract_canvas_refs(NEW.body);
    else
      NEW.body_text := extract_tiptap_text(NEW.body);
      NEW.body_refs := extract_tiptap_refs(NEW.body);
    end if;
  else
    NEW.body_text := '';
    NEW.body_refs := '{}';
  end if;
  return NEW;
end;
$$;

-- Apply to world_pages
drop trigger if exists tr_world_pages_derive_body on world_pages;
create trigger tr_world_pages_derive_body
  before insert or update of body on world_pages
  for each row execute function tr_derive_body_fields();

-- Apply to timeline_events
drop trigger if exists tr_timeline_events_derive_body on timeline_events;
create trigger tr_timeline_events_derive_body
  before insert or update of body on timeline_events
  for each row execute function tr_derive_body_fields();
