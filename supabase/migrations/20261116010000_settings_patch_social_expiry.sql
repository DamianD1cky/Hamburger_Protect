-- Update only edited keys, checking the values seen when the editor opened.
create function public.patch_campaign_settings(p_campaign_id uuid,p_patch jsonb,p_expected jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  current public.campaign_settings;
  current_name text;
  snapshot jsonb;
  field record;
  entry record;
  changes jsonb := '{}'::jsonb;
  normalized jsonb;
  wanted jsonb;
  before_value jsonb;
  keys text[] := array['inventory','tasks','shifts','index','activity','safety','notes'];
  hidden text[];
begin
  perform private.lock_campaign(p_campaign_id,'gm');
  select * into current from public.campaign_settings where campaign_id=p_campaign_id for update;
  if not found then raise exception 'CAMPAIGN_SETTINGS_NOT_FOUND'; end if;
  select name into current_name from public.campaigns where id=p_campaign_id;
  if jsonb_typeof(p_patch) is distinct from 'object' or jsonb_typeof(p_expected) is distinct from 'object'
    then raise exception 'INVALID_CAMPAIGN_SETTINGS'; end if;
  snapshot := jsonb_build_object(
    'name',current_name,'sectionTitles',current.section_titles,'sectionColors',current.section_colors,
    'resourceTitles',current.resource_titles,'noteTexturePath',current.note_texture_path,
    'hiddenSections',(select coalesce(jsonb_object_agg(k,k=any(current.hidden_sections)),'{}'::jsonb) from unnest(keys) k)
  );
  for field in select * from jsonb_each(p_patch) loop
    if field.key not in ('name','sectionTitles','sectionColors','resourceTitles','hiddenSections','noteTexturePath')
      or not (p_expected ? field.key) then raise exception 'INVALID_CAMPAIGN_SETTINGS'; end if;
    if field.key in ('sectionTitles','sectionColors','resourceTitles','hiddenSections') then
      if jsonb_typeof(field.value) is distinct from 'object'
        or jsonb_typeof(p_expected->field.key) is distinct from 'object'
        then raise exception 'INVALID_CAMPAIGN_SETTINGS'; end if;
      normalized := '{}'::jsonb;
      for entry in select * from jsonb_each(field.value) loop
        if not (p_expected->field.key ? entry.key)
          or (field.key='resourceTitles' and entry.key not in ('0','1','2'))
          or (field.key<>'resourceTitles' and not (entry.key=any(keys)))
          then raise exception 'INVALID_CAMPAIGN_SETTINGS'; end if;
        wanted := entry.value;
        if field.key='hiddenSections' then
          if jsonb_typeof(wanted) is distinct from 'boolean' then raise exception 'INVALID_CAMPAIGN_SETTINGS'; end if;
        elsif wanted<>'null'::jsonb then
          if jsonb_typeof(wanted) is distinct from 'string' then raise exception 'INVALID_CAMPAIGN_SETTINGS'; end if;
          if field.key='sectionColors' then
            if (wanted#>>'{}') !~ '^#[0-9a-fA-F]{6}$' then raise exception 'INVALID_CAMPAIGN_SETTINGS'; end if;
            wanted := to_jsonb(lower(wanted#>>'{}'));
          else
            if char_length(btrim(wanted#>>'{}')) not between 1 and 32 then raise exception 'INVALID_CAMPAIGN_SETTINGS'; end if;
            wanted := to_jsonb(btrim(wanted#>>'{}'));
          end if;
        end if;
        before_value := coalesce(snapshot#>array[field.key,entry.key],'null'::jsonb);
        if before_value is distinct from p_expected#>array[field.key,entry.key]
          and before_value is distinct from wanted then raise exception 'CAMPAIGN_SETTINGS_CONFLICT'; end if;
        normalized := normalized||jsonb_build_object(entry.key,wanted);
      end loop;
    else
      normalized := field.value;
      if field.key='name' then
        if jsonb_typeof(normalized) is distinct from 'string'
          or char_length(btrim(normalized#>>'{}')) not between 1 and 80
          then raise exception 'INVALID_CAMPAIGN_SETTINGS'; end if;
        normalized := to_jsonb(btrim(normalized#>>'{}'));
      elsif normalized<>'null'::jsonb then
        if jsonb_typeof(normalized) is distinct from 'string'
          or not starts_with(normalized#>>'{}',p_campaign_id::text||'/')
          or char_length(normalized#>>'{}')>300 or (normalized#>>'{}') like '%..%'
          then raise exception 'INVALID_CAMPAIGN_SETTINGS'; end if;
      end if;
      if snapshot->field.key is distinct from p_expected->field.key
        and snapshot->field.key is distinct from normalized then raise exception 'CAMPAIGN_SETTINGS_CONFLICT'; end if;
    end if;
    changes := changes||jsonb_build_object(field.key,normalized);
  end loop;
  hidden := current.hidden_sections;
  for entry in select * from jsonb_each(coalesce(changes->'hiddenSections','{}'::jsonb)) loop
    hidden := array_remove(hidden,entry.key);
    if entry.value='true'::jsonb then hidden := array_append(hidden,entry.key); end if;
  end loop;
  if changes ? 'name' and current_name is distinct from changes->>'name' then
    update public.campaigns set name=changes->>'name' where id=p_campaign_id;
  end if;
  if changes-'name'<>'{}'::jsonb then
    update public.campaign_settings set
      section_titles=jsonb_strip_nulls(coalesce(current.section_titles,'{}'::jsonb)||coalesce(changes->'sectionTitles','{}'::jsonb)),
      section_colors=jsonb_strip_nulls(coalesce(current.section_colors,'{}'::jsonb)||coalesce(changes->'sectionColors','{}'::jsonb)),
      resource_titles=jsonb_strip_nulls(coalesce(current.resource_titles,'{}'::jsonb)||coalesce(changes->'resourceTitles','{}'::jsonb)),
      hidden_sections=hidden,
      note_texture_path=case when changes ? 'noteTexturePath' then changes->>'noteTexturePath' else current.note_texture_path end,
      updated_at=clock_timestamp()
      where campaign_id=p_campaign_id;
  end if;
  return changes;
end;
$$;
revoke all on function public.patch_campaign_settings(uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.patch_campaign_settings(uuid,jsonb,jsonb) to authenticated;

-- The appearance is a single draft; a stale draft must not overwrite a newer one.
create function public.patch_board_appearance(p_campaign_id uuid,p_appearance jsonb,p_expected jsonb)
returns public.campaign_settings language plpgsql security definer set search_path='' as $$
declare current public.campaign_settings; existing jsonb; result public.campaign_settings;
begin
  perform private.lock_campaign(p_campaign_id,'gm');
  select * into current from public.campaign_settings where campaign_id=p_campaign_id for update;
  if not found then raise exception 'CAMPAIGN_SETTINGS_NOT_FOUND'; end if;
  existing := coalesce(current.appearance,jsonb_build_object(
    'room',jsonb_build_object('kind',case when current.background_path is null then 'default' else 'image' end,
      'color','#202523','imagePath',current.background_path,'fit','cover','positionX',50,'positionY',50,'dim',0.18),
    'surface',jsonb_build_object('kind','felt','imagePath',null),'frame','burger'
  ));
  if existing is distinct from p_expected and existing is distinct from p_appearance
    then raise exception 'CAMPAIGN_SETTINGS_CONFLICT'; end if;
  select * into result from public.update_board_appearance(p_campaign_id,p_appearance);
  return result;
end;
$$;
revoke all on function public.patch_board_appearance(uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.patch_board_appearance(uuid,jsonb,jsonb) to authenticated;

-- Send authoritative expiration times so the client can expire presence locally.
create or replace function public.get_dice_social(p_campaign_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; observed timestamptz:=clock_timestamp();
begin
  if not private.dice_member(p_campaign_id) then raise exception 'DICE_ACCESS_REQUIRED'; end if;
  with active as (
    select actor_id,max(case when status='pending' then created_at+interval '20 seconds'
      else created_at+interval '6 seconds' end) as expires_at
    from public.dice_rolls r where campaign_id=p_campaign_id
      and ((status='pending' and created_at>observed-interval '20 seconds')
        or (status='complete' and created_at>observed-interval '6 seconds'))
      and (actor_id=private.current_actor_id() or private.dice_visible(campaign_id,actor_id,visibility,revealed_at))
    group by actor_id
  )
  select jsonb_build_object(
    'server_time',observed,
    'rolling',coalesce((select jsonb_agg(actor_id) from active),'[]'::jsonb),
    'rolling_until',coalesce((select jsonb_agg(jsonb_build_object('actor_id',actor_id,'expires_at',expires_at)) from active),'[]'::jsonb),
    'reactions',coalesce((select jsonb_agg(jsonb_build_object('actor_id',actor_id,'emoji',emoji,'sent_at',sent_at))
      from public.dice_reactions where campaign_id=p_campaign_id and sent_at>observed-interval '4 seconds'),'[]'::jsonb)
  ) into result;
  return result;
end;
$$;
revoke all on function public.get_dice_social(uuid) from public,anon,authenticated;
grant execute on function public.get_dice_social(uuid) to authenticated;
