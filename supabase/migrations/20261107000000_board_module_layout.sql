-- 公告板模块化：记录每个区块被拖到哪个位置。
-- module_layout = { "inventory": {"x": 42, "y": 48}, ... }
-- 只存位置；尺寸固定在前端定义里，用户改不了。
-- 没有记录的模块用前端内置的默认位置，所以老房间不需要回填数据。

alter table public.campaign_settings
  add column if not exists module_layout jsonb not null default '{}'::jsonb;

alter table public.campaign_settings
  drop constraint if exists campaign_settings_module_layout_check;

alter table public.campaign_settings
  add constraint campaign_settings_module_layout_check
    check (jsonb_typeof(module_layout) = 'object');

-- 参数顺序变化，必须重建函数
drop function if exists public.update_campaign_settings(uuid, jsonb, text[], text, text, jsonb, jsonb);

create function public.update_campaign_settings(
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
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  result public.campaign_settings;
  allowed text[] := array[
    'inventory', 'tasks', 'shifts', 'index', 'activity', 'safety', 'notes'
  ];
  module_keys text[] := array[
    'inventory', 'tasks', 'shifts', 'index', 'activity', 'safety'
  ];
  resource_groups text[] := array['0', '1', '2'];
  media_prefix text := p_campaign_id::text || '/';
begin
  perform private.lock_campaign(p_campaign_id, 'gm');

  if jsonb_typeof(coalesce(p_section_titles, '{}'::jsonb)) <> 'object'
    or exists (
      select 1 from jsonb_each_text(coalesce(p_section_titles, '{}'::jsonb)) item
      where not (item.key = any(allowed))
        or char_length(trim(item.value)) not between 1 and 32
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
      where not (item.key = any(allowed))
        or item.value !~ '^#[0-9a-fA-F]{6}$'
    )
    or jsonb_typeof(coalesce(p_resource_titles, '{}'::jsonb)) <> 'object'
    or exists (
      select 1 from jsonb_each_text(coalesce(p_resource_titles, '{}'::jsonb)) item
      where not (item.key = any(resource_groups))
        or char_length(trim(item.value)) not between 1 and 32
    ) then
    raise exception 'INVALID_CAMPAIGN_APPEARANCE';
  end if;

  -- 模块位置：只允许已知模块，坐标必须是数字，且落在画布范围内（1467x1203）。
  if jsonb_typeof(coalesce(p_module_layout, '{}'::jsonb)) <> 'object'
    or exists (
      select 1 from jsonb_each(coalesce(p_module_layout, '{}'::jsonb)) item
      where not (item.key = any(module_keys))
        or jsonb_typeof(item.value) <> 'object'
        or jsonb_typeof(item.value -> 'x') <> 'number'
        or jsonb_typeof(item.value -> 'y') <> 'number'
        or (item.value ->> 'x')::numeric < 0
        or (item.value ->> 'x')::numeric > 1467
        or (item.value ->> 'y')::numeric < 0
        or (item.value ->> 'y')::numeric > 1203
    ) then
    raise exception 'INVALID_MODULE_LAYOUT';
  end if;

  insert into public.campaign_settings(
    campaign_id, section_titles, section_colors, resource_titles,
    module_layout, hidden_sections, background_path, note_texture_path, updated_at
  ) values (
    p_campaign_id,
    coalesce(p_section_titles, '{}'::jsonb),
    coalesce(p_section_colors, '{}'::jsonb),
    coalesce(p_resource_titles, '{}'::jsonb),
    coalesce(p_module_layout, '{}'::jsonb),
    array(select distinct unnest(coalesce(p_hidden_sections, '{}'::text[]))),
    p_background_path,
    p_note_texture_path,
    now()
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

revoke all on function public.update_campaign_settings(uuid, jsonb, text[], text, text, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.update_campaign_settings(uuid, jsonb, text[], text, text, jsonb, jsonb, jsonb)
  to authenticated;

-- get_campaign_board / get_public_campaign_board 用 to_jsonb(s) 输出整个 settings，
-- 新列会自动带到前端，不需要改动。
