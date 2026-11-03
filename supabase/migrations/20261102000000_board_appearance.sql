-- 公告板外观设置：区块标题底色 + 物资便签自定义标题
-- 1) section_colors:   { "shifts": "#0860b2", ... }
-- 2) resource_titles:  { "0": "食材与补给", ... }
-- 写入权限仍然只给 GM（沿用 private.lock_campaign 的 'gm' 校验）。

alter table public.campaign_settings
  add column if not exists section_colors jsonb not null default '{}'::jsonb,
  add column if not exists resource_titles jsonb not null default '{}'::jsonb;

alter table public.campaign_settings
  drop constraint if exists campaign_settings_section_colors_check,
  drop constraint if exists campaign_settings_resource_titles_check;

alter table public.campaign_settings
  add constraint campaign_settings_section_colors_check
    check (jsonb_typeof(section_colors) = 'object'),
  add constraint campaign_settings_resource_titles_check
    check (jsonb_typeof(resource_titles) = 'object');

-- 参数列表变了（新增两个），必须先删掉旧签名再重建。
drop function if exists public.update_campaign_settings(uuid, jsonb, text[], text, text);

create function public.update_campaign_settings(
  p_campaign_id uuid,
  p_section_titles jsonb,
  p_hidden_sections text[],
  p_background_path text default null,
  p_note_texture_path text default null,
  p_section_colors jsonb default null,
  p_resource_titles jsonb default null
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

  insert into public.campaign_settings(
    campaign_id, section_titles, section_colors, resource_titles,
    hidden_sections, background_path, note_texture_path, updated_at
  ) values (
    p_campaign_id,
    coalesce(p_section_titles, '{}'::jsonb),
    coalesce(p_section_colors, '{}'::jsonb),
    coalesce(p_resource_titles, '{}'::jsonb),
    array(select distinct unnest(coalesce(p_hidden_sections, '{}'::text[]))),
    p_background_path,
    p_note_texture_path,
    now()
  )
  on conflict (campaign_id) do update set
    section_titles = excluded.section_titles,
    section_colors = excluded.section_colors,
    resource_titles = excluded.resource_titles,
    hidden_sections = excluded.hidden_sections,
    background_path = excluded.background_path,
    note_texture_path = excluded.note_texture_path,
    updated_at = now()
  returning * into result;
  return result;
end;
$$;

revoke all on function public.update_campaign_settings(uuid, jsonb, text[], text, text, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.update_campaign_settings(uuid, jsonb, text[], text, text, jsonb, jsonb)
  to authenticated;

-- 读路径无需改动：get_campaign_board / get_public_campaign_board 都用
-- to_jsonb(s) 输出整行，新列会自动带到前端。
