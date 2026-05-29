-- Enable Realtime on the campaigns table so scene/subject pin changes
-- propagate to all connected campaign participants immediately.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'campaigns'
  ) then
    alter publication supabase_realtime add table campaigns;
  end if;
end $$;
