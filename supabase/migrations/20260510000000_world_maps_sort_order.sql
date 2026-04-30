-- Add sort_order to world_maps so maps can be reordered in the sidebar
alter table public.world_maps
  add column if not exists sort_order int not null default 0;

-- Backfill existing maps: order by created_at within each world
with ranked as (
  select id, row_number() over (partition by world_id order by created_at) - 1 as rn
  from public.world_maps
  where deleted_at is null
)
update public.world_maps m
set sort_order = r.rn
from ranked r
where m.id = r.id;
