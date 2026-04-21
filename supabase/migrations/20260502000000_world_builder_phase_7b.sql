-- Phase 7b: Inline images for world pages
-- Adds world_images table, world-images storage bucket, RLS, and
-- storage tally trigger mirroring the world-maps pattern from Phase 5.

-- ─────────────────────────────────────────────────────────────────────────
-- Table — world_images
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.world_images (
  id           uuid primary key default gen_random_uuid(),
  world_id     uuid not null references public.worlds(id) on delete cascade,
  page_id      uuid references public.world_pages(id) on delete set null,
  image_key    text not null,
  width        integer not null default 0,
  height       integer not null default 0,
  alt          text not null default '',
  byte_size    bigint not null default 0,
  content_type text not null default 'image/jpeg',
  deleted_at        timestamptz,
  hard_delete_after timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists world_images_world_id_idx
  on public.world_images (world_id) where deleted_at is null;
create index if not exists world_images_page_id_idx
  on public.world_images (page_id) where deleted_at is null;

alter table public.world_images enable row level security;

-- Owner can do everything on their world's images.
drop policy if exists world_images_owner_all on public.world_images;
create policy world_images_owner_all on public.world_images
  for all
  using (public.is_world_owner(world_id))
  with check (public.is_world_owner(world_id));

-- Members of linked campaigns can read images on pages visible to them.
drop policy if exists world_images_member_select on public.world_images;
create policy world_images_member_select on public.world_images
  for select
  using (
    page_id is not null
    and exists (
      select 1 from public.world_pages wp
       where wp.id = page_id
         and wp.deleted_at is null
         and public.user_can_view_page(wp.id)
    )
  );

-- ─────────────────────────────────────────────────────────────────────────
-- Storage bucket — world-images (private, 10MB per file)
-- ─────────────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'world-images',
  'world-images',
  false,
  10485760,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Storage RLS — path: {worldId}/{imageId}/{filename}
-- Writes: world owner only.
-- Reads: matching row exists in world_images table (table RLS gates further).

drop policy if exists world_images_storage_owner_write on storage.objects;
create policy world_images_storage_owner_write on storage.objects
  for all
  using (
    bucket_id = 'world-images'
    and public.is_world_owner( (split_part(name, '/', 1))::uuid )
  )
  with check (
    bucket_id = 'world-images'
    and public.is_world_owner( (split_part(name, '/', 1))::uuid )
  );

drop policy if exists world_images_storage_read on storage.objects;
create policy world_images_storage_read on storage.objects
  for select
  using (
    bucket_id = 'world-images'
    and exists (
      select 1 from public.world_images i
      where i.image_key = storage.objects.name
    )
  );

-- ─────────────────────────────────────────────────────────────────────────
-- Storage tally — mirror of tr_world_maps_storage_tally.
-- Fires on INSERT (upload) and DELETE (hard-delete reaper in Phase 8).
-- Soft-delete does NOT change the tally — the bytes are still on disk.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.tr_world_images_storage_tally()
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

drop trigger if exists tr_world_images_storage_tally on public.world_images;
create trigger tr_world_images_storage_tally
after insert or delete on public.world_images
for each row
execute function public.tr_world_images_storage_tally();
