-- Security-definer RPC so DMs can mutate a party member's session state
-- (HP, conditions, slots, resources, inspiration, death saves, concentration)
-- without granting them row-level UPDATE on other players' characters.
--
-- Authorization: owner of the character, OR DM of a campaign the character
-- is linked to. Writes are whitelisted — the caller cannot touch name,
-- ability scores, inventory, or any other durable sheet field through here.

create or replace function public.update_character_state(
  character_id uuid,
  patch jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user       uuid := auth.uid();
  v_owner      uuid;
  v_resources  jsonb;
  v_key        text;
  v_value      jsonb;
  v_allowed    text[] := array[
    'hpCurrent',
    'hpTemp',
    'exhaustionLevel',
    'spellSlots',
    'classResources',
    'deathSaves',
    'inspiration',
    'concentrationSpell'
  ];
  v_new_conds  text[];
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  select user_id, resources
    into v_owner, v_resources
    from public.characters
   where id = character_id;
  if v_owner is null then raise exception 'character not found'; end if;

  if v_user <> v_owner then
    if not exists (
      select 1
        from public.campaign_members m
        join public.campaigns c on c.id = m.campaign_id
       where m.character_id = update_character_state.character_id
         and c.dm_user_id = v_user
    ) then
      raise exception 'forbidden';
    end if;
  end if;

  -- Merge whitelisted resource keys into the existing JSONB blob.
  for v_key, v_value in select * from jsonb_each(patch) loop
    if v_key = 'conditions' then
      -- Special-case: conditions is a text[] column, not inside resources.
      v_new_conds := array(
        select jsonb_array_elements_text(v_value)
      );
      update public.characters
         set conditions = v_new_conds,
             updated_at = now()
       where id = character_id;
    elsif v_key = any(v_allowed) then
      v_resources := coalesce(v_resources, '{}'::jsonb) || jsonb_build_object(v_key, v_value);
    else
      raise exception 'not allowed to update %', v_key;
    end if;
  end loop;

  update public.characters
     set resources = v_resources,
         updated_at = now()
   where id = character_id;
end;
$$;

grant execute on function public.update_character_state(uuid, jsonb) to authenticated;
