-- 16:9 板面扩展到 2144x1206；旧物件坐标原样保留。
alter table public.board_stickers drop constraint board_stickers_position_check;
alter table public.board_stickers add constraint board_stickers_position_check
  check (x between 0 and 2144 and y between 0 and 1206);

create or replace function public.update_campaign_settings(
  p_campaign_id uuid,
  p_section_titles jsonb,
  p_hidden_sections text[],
  p_background_path text default null,
  p_note_texture_path text default null,
  p_section_colors jsonb default null,
  p_resource_titles jsonb default null,
  p_module_layout jsonb default null
)
returns public.campaign_settings
language plpgsql volatile security definer set search_path = ''
as $$
declare
  result public.campaign_settings;
  allowed text[] := array['inventory', 'tasks', 'shifts', 'index', 'activity', 'safety', 'notes'];
  module_keys text[] := array['inventory', 'tasks', 'shifts', 'index', 'activity', 'safety'];
  resource_groups text[] := array['0', '1', '2'];
  media_prefix text := p_campaign_id::text || '/';
begin
  perform private.lock_campaign(p_campaign_id, 'gm');
  if jsonb_typeof(coalesce(p_section_titles, '{}'::jsonb)) <> 'object'
    or exists (
      select 1 from jsonb_each_text(coalesce(p_section_titles, '{}'::jsonb)) item
      where not (item.key = any(allowed)) or char_length(trim(item.value)) not between 1 and 32
    )
    or exists (
      select 1 from unnest(coalesce(p_hidden_sections, '{}'::text[])) item
      where not (item = any(allowed))
    )
    or cardinality(coalesce(p_hidden_sections, '{}'::text[])) > 7
    or (p_background_path is not null and not starts_with(p_background_path, media_prefix))
    or (p_note_texture_path is not null and not starts_with(p_note_texture_path, media_prefix)) then
    raise exception 'INVALID_CAMPAIGN_SETTINGS';
  end if;
  if jsonb_typeof(coalesce(p_section_colors, '{}'::jsonb)) <> 'object'
    or exists (
      select 1 from jsonb_each_text(coalesce(p_section_colors, '{}'::jsonb)) item
      where not (item.key = any(allowed)) or item.value !~ '^#[0-9a-fA-F]{6}$'
    )
    or jsonb_typeof(coalesce(p_resource_titles, '{}'::jsonb)) <> 'object'
    or exists (
      select 1 from jsonb_each_text(coalesce(p_resource_titles, '{}'::jsonb)) item
      where not (item.key = any(resource_groups)) or char_length(trim(item.value)) not between 1 and 32
    ) then
    raise exception 'INVALID_CAMPAIGN_APPEARANCE';
  end if;
  if jsonb_typeof(coalesce(p_module_layout, '{}'::jsonb)) <> 'object'
    or exists (
      select 1 from jsonb_each(coalesce(p_module_layout, '{}'::jsonb)) item
      where not (item.key = any(module_keys))
        or jsonb_typeof(item.value) <> 'object'
        or jsonb_typeof(item.value -> 'x') <> 'number'
        or jsonb_typeof(item.value -> 'y') <> 'number'
        or (item.value ->> 'x')::numeric < 0
        or (item.value ->> 'x')::numeric > 2144
        or (item.value ->> 'y')::numeric < 0
        or (item.value ->> 'y')::numeric > 1206
    ) then
    raise exception 'INVALID_MODULE_LAYOUT';
  end if;
  insert into public.campaign_settings(
    campaign_id, section_titles, section_colors, resource_titles, module_layout,
    hidden_sections, background_path, note_texture_path, updated_at
  ) values (
    p_campaign_id, coalesce(p_section_titles, '{}'::jsonb),
    coalesce(p_section_colors, '{}'::jsonb), coalesce(p_resource_titles, '{}'::jsonb),
    coalesce(p_module_layout, '{}'::jsonb),
    array(select distinct unnest(coalesce(p_hidden_sections, '{}'::text[]))),
    p_background_path, p_note_texture_path, now()
  )
  on conflict (campaign_id) do update set
    section_titles = excluded.section_titles,
    section_colors = excluded.section_colors,
    resource_titles = excluded.resource_titles,
    module_layout = excluded.module_layout,
    hidden_sections = excluded.hidden_sections,
    background_path = excluded.background_path,
    note_texture_path = excluded.note_texture_path,
    updated_at = now()
  returning * into result;
  return result;
end;
$$;

create or replace function public.create_board_sticker(
  p_campaign_id uuid, p_emoji text, p_x integer, p_y integer, p_rotation numeric default 0
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  result public.board_stickers;
begin
  perform private.lock_campaign(p_campaign_id);
  if private.current_actor_id() is null or not private.is_member(p_campaign_id) then
    raise exception 'NOT_A_MEMBER';
  end if;
  insert into public.board_stickers(campaign_id, emoji, x, y, rotation, created_by)
  values (
    p_campaign_id, p_emoji,
    greatest(0, least(2072, p_x)), greatest(0, least(1134, p_y)),
    greatest(-20, least(20, p_rotation)), private.current_actor_id()
  ) returning * into result;
  return to_jsonb(result);
end;
$$;

create or replace function public.move_board_sticker(
  p_campaign_id uuid, p_id uuid, p_x integer, p_y integer
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  result public.board_stickers;
begin
  perform private.lock_campaign(p_campaign_id);
  update public.board_stickers
  set x = greatest(0, least(2072, p_x)), y = greatest(0, least(1134, p_y)), updated_at = now()
  where id = p_id and campaign_id = p_campaign_id and private.is_member(p_campaign_id)
  returning * into result;
  if result.id is null then raise exception 'BOARD_STICKER_NOT_FOUND'; end if;
  return to_jsonb(result);
end;
$$;

-- create or replace 保持既有授权；显式声明以方便审计。
revoke all on function public.update_campaign_settings(uuid,jsonb,text[],text,text,jsonb,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.update_campaign_settings(uuid,jsonb,text[],text,text,jsonb,jsonb,jsonb) to authenticated;
revoke all on function public.create_board_sticker(uuid,text,integer,integer,numeric) from public, anon, authenticated;
grant execute on function public.create_board_sticker(uuid,text,integer,integer,numeric) to authenticated;
revoke all on function public.move_board_sticker(uuid,uuid,integer,integer) from public, anon, authenticated;
grant execute on function public.move_board_sticker(uuid,uuid,integer,integer) to authenticated;
