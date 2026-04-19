-- Feature 9 — World Builder Phase 5 (Maps, Pins, Nesting)
--
-- Adds:
--   • world_maps           — uploaded map images, optionally owned by a Location page
--   • pin_types            — seeded reference table (7 kinds)
--   • map_pins             — placed pins with 0–1 normalized coordinates
--   • profiles.storage_used_bytes — running tally (world_images lands in Phase 7b)
--   • world-maps Storage bucket (private, 20MB cap)
--   • RLS mirroring world_pages readability via user_can_view_page / is_world_owner
--   • tr_world_maps_storage_tally — bump profile tally on INSERT/DELETE

-- ─────────────────────────────────────────────────────────────────────────
-- Profile storage tally (added in Phase 5; Phase 7b adds world_images branch)
-- ─────────────────────────────────────────────────────────────────────────

alter table public.profiles
  add column if not exists storage_used_bytes bigint not null default 0;

-- ─────────────────────────────────────────────────────────────────────────
-- Tables
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.world_maps (
  id                 uuid primary key default gen_random_uuid(),
  world_id           uuid not null references public.worlds(id)      on delete cascade,
  owner_page_id      uuid          references public.world_pages(id) on delete cascade,
  campaign_id        uuid          references public.campaigns(id)   on delete set null,
  label              text not null check (length(trim(label)) > 0),
  image_key          text not null unique,
  image_width        int  not null check (image_width  > 0),
  image_height       int  not null check (image_height > 0),
  aspect_ratio       numeric(10,6) not null check (aspect_ratio > 0),
  byte_size          bigint not null check (byte_size > 0),
  deleted_at         timestamptz,
  hard_delete_after  timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists world_maps_world_idx
  on public.world_maps (world_id)
  where deleted_at is null;

create index if not exists world_maps_owner_page_idx
  on public.world_maps (owner_page_id)
  where deleted_at is null and owner_page_id is not null;

create trigger world_maps_updated_at
  before update on public.world_maps
  for each row execute function public.handle_updated_at();

create table if not exists public.pin_types (
  key               text primary key,
  label             text not null,
  default_icon_key  text not null,
  default_color_hex text not null check (default_color_hex ~ '^#[0-9a-fA-F]{6}$'),
  sort_order        int  not null default 0
);

insert into public.pin_types (key, label, default_icon_key, default_color_hex, sort_order) values
  ('city',       'City',        'castle',       '#d3bbff', 10),
  ('landmark',   'Landmark',    'mountain',     '#adc6ff', 20),
  ('npc',        'NPC',         'user',         '#1D9E75', 30),
  ('faction_hq', 'Faction HQ',  'shield',       '#EF9F27', 40),
  ('event',      'Event',       'calendar-days','#E24B4A', 50),
  ('quest',      'Quest',       'scroll-text',  '#6d28d9', 60),
  ('generic',    'Generic',     'map-pin',      '#958da1', 70)
on conflict (key) do nothing;

create table if not exists public.map_pins (
  id                uuid primary key default gen_random_uuid(),
  map_id            uuid not null references public.world_maps(id) on delete cascade,
  world_id          uuid not null references public.worlds(id)     on delete cascade,
  pin_type          text not null references public.pin_types(key),
  x_pct             numeric(8,6) not null check (x_pct >= 0 and x_pct <= 1),
  y_pct             numeric(8,6) not null check (y_pct >= 0 and y_pct <= 1),
  label             text,
  icon_key_override text,
  color_override    text check (color_override is null or color_override ~ '^#[0-9a-fA-F]{6}$'),
  linked_page_id    uuid references public.world_pages(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists map_pins_map_idx     on public.map_pins (map_id);
create index if not exists map_pins_world_idx   on public.map_pins (world_id);
create index if not exists map_pins_linked_idx  on public.map_pins (linked_page_id)
  where linked_page_id is not null;

create trigger map_pins_updated_at
  before update on public.map_pins
  for each row execute function public.handle_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- RLS — world_maps
-- SELECT: owner, or (if attached to a page) any viewer of that page.
-- Write:  owner only.
-- ─────────────────────────────────────────────────────────────────────────

alter table public.world_maps enable row level security;

drop policy if exists world_maps_select on public.world_maps;
create policy world_maps_select on public.world_maps
  for select
  using (
    deleted_at is null
    and (
      public.is_world_owner(world_id)
      or (owner_page_id is not null and public.user_can_view_page(auth.uid(), owner_page_id))
    )
  );

drop policy if exists world_maps_owner_write on public.world_maps;
create policy world_maps_owner_write on public.world_maps
  for all
  using (public.is_world_owner(world_id))
  with check (public.is_world_owner(world_id));

-- ─────────────────────────────────────────────────────────────────────────
-- RLS — map_pins (mirror the owning map's readability)
-- ─────────────────────────────────────────────────────────────────────────

alter table public.map_pins enable row level security;

drop policy if exists map_pins_select on public.map_pins;
create policy map_pins_select on public.map_pins
  for select
  using (
    public.is_world_owner(world_id)
    or exists (
      select 1
      from public.world_maps m
      where m.id = map_pins.map_id
        and m.deleted_at is null
        and m.owner_page_id is not null
        and public.user_can_view_page(auth.uid(), m.owner_page_id)
    )
  );

drop policy if exists map_pins_owner_write on public.map_pins;
create policy map_pins_owner_write on public.map_pins
  for all
  using (public.is_world_owner(world_id))
  with check (public.is_world_owner(world_id));

-- ─────────────────────────────────────────────────────────────────────────
-- RLS — pin_types (seeded reference; read-only for everyone signed in)
-- ─────────────────────────────────────────────────────────────────────────

alter table public.pin_types enable row level security;

drop policy if exists pin_types_select on public.pin_types;
create policy pin_types_select on public.pin_types
  for select
  to authenticated
  using (true);

-- ─────────────────────────────────────────────────────────────────────────
-- Storage bucket — world-maps (private, 20MB cap)
-- ─────────────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'world-maps',
  'world-maps',
  false,
  20971520,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Storage RLS — first path segment is the worldId.
-- Writes require is_world_owner; reads require the matching world_maps row
-- to be visible under the table RLS above (so viewers on a shared page can
-- pull the signed URL for its map).

drop policy if exists world_maps_storage_owner_write on storage.objects;
create policy world_maps_storage_owner_write on storage.objects
  for all
  using (
    bucket_id = 'world-maps'
    and public.is_world_owner( (split_part(name, '/', 1))::uuid )
  )
  with check (
    bucket_id = 'world-maps'
    and public.is_world_owner( (split_part(name, '/', 1))::uuid )
  );

drop policy if exists world_maps_storage_read on storage.objects;
create policy world_maps_storage_read on storage.objects
  for select
  using (
    bucket_id = 'world-maps'
    and exists (
      select 1 from public.world_maps m
      where m.image_key = storage.objects.name
    )
  );

-- ─────────────────────────────────────────────────────────────────────────
-- Storage tally — bump profiles.storage_used_bytes on insert / hard delete.
-- Soft-delete (deleted_at <- now()) does NOT change the tally; the daily
-- hard-delete reaper (Phase 8) will trip this trigger when it removes rows.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.tr_world_maps_storage_tally()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  if TG_OP = 'INSERT' then
    select owner_user_id into v_owner from public.worlds where id = NEW.world_id;
    if v_owner is not null then
      update public.profiles
         set storage_used_bytes = storage_used_bytes + NEW.byte_size
       where id = v_owner;
    end if;
    return NEW;
  elsif TG_OP = 'DELETE' then
    select owner_user_id into v_owner from public.worlds where id = OLD.world_id;
    if v_owner is not null then
      update public.profiles
         set storage_used_bytes = greatest(0, storage_used_bytes - OLD.byte_size)
       where id = v_owner;
    end if;
    return OLD;
  end if;
  return null;
end;
$$;

drop trigger if exists tr_world_maps_storage_tally on public.world_maps;
create trigger tr_world_maps_storage_tally
after insert or delete on public.world_maps
for each row
execute function public.tr_world_maps_storage_tally();
