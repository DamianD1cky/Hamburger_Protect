-- VeilBoard AI Harness foundation:
-- 1. Structured style_tokens and custom_panels on campaign_settings
-- 2. Resizable module layout ({ x, y, w, h }) preserving dimensions on move
-- 3. Atomic apply_board_blueprint and rollback_board_blueprint RPCs for GM Harness

alter table public.campaign_settings
  add column if not exists style_tokens jsonb not null default '{}'::jsonb,
  add column if not exists custom_panels jsonb not null default '[]'::jsonb;

alter table public.campaign_settings
  drop constraint if exists campaign_settings_style_tokens_check,
  drop constraint if exists campaign_settings_custom_panels_check;

alter table public.campaign_settings
  add constraint campaign_settings_style_tokens_check
    check (jsonb_typeof(style_tokens) = 'object'),
  add constraint campaign_settings_custom_panels_check
    check (jsonb_typeof(custom_panels) = 'array');

create or replace function private.validate_style_tokens(p_tokens jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  font_preset text;
  card_style text;
  radius_preset text;
  link_style text;
  card_bg jsonb;
  normalized_bg text := null;
begin
  if p_tokens is null or jsonb_typeof(p_tokens) is distinct from 'object' then
    raise exception 'INVALID_STYLE_TOKENS';
  end if;
  font_preset := coalesce(p_tokens->>'fontPreset', 'handwritten');
  card_style := coalesce(p_tokens->>'cardStyle', 'paper');
  radius_preset := coalesce(p_tokens->>'radiusPreset', 'soft');
  link_style := coalesce(p_tokens->>'linkStyle', 'red_cord');

  if font_preset not in ('handwritten', 'serif', 'typewriter', 'mono')
    or card_style not in ('paper', 'parchment', 'slate', 'terminal')
    or radius_preset not in ('soft', 'sharp', 'torn')
    or link_style not in ('red_cord', 'gold_thread', 'chalk', 'neon_cyan') then
    raise exception 'INVALID_STYLE_TOKENS';
  end if;

  card_bg := p_tokens->'cardBackground';
  if card_bg is not null and card_bg <> 'null'::jsonb then
    if jsonb_typeof(card_bg) is distinct from 'string'
      or (card_bg#>>'{}') !~ '^#[0-9a-fA-F]{6}$' then
      raise exception 'INVALID_STYLE_TOKENS';
    end if;
    normalized_bg := lower(card_bg#>>'{}');
  end if;

  return jsonb_build_object(
    'fontPreset', font_preset,
    'cardStyle', card_style,
    'cardBackground', to_jsonb(normalized_bg),
    'radiusPreset', radius_preset,
    'linkStyle', link_style
  );
end;
$$;

revoke all on function private.validate_style_tokens(jsonb) from public, anon, authenticated;

create or replace function private.validate_custom_panels(p_panels jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  item jsonb;
  row_item jsonb;
  normalized_rows jsonb;
  result jsonb := '[]'::jsonb;
  seen_ids text[] := '{}'::text[];
  panel_id text;
  panel_kind text;
  panel_title text;
  panel_color text;
  panel_body text;
  px integer;
  py integer;
  pw integer;
  ph integer;
begin
  if p_panels is null or jsonb_typeof(p_panels) is distinct from 'array'
    or jsonb_array_length(p_panels) > 12 then
    raise exception 'INVALID_CUSTOM_PANELS';
  end if;

  for item in select * from jsonb_array_elements(p_panels) loop
    if jsonb_typeof(item) is distinct from 'object' then
      raise exception 'INVALID_CUSTOM_PANELS';
    end if;
    panel_id := btrim(coalesce(item->>'id', ''));
    panel_kind := coalesce(item->>'kind', 'markdown');
    panel_title := btrim(coalesce(item->>'title', ''));
    panel_color := lower(btrim(coalesce(item->>'color', '')));
    panel_body := btrim(coalesce(item->>'body', ''));

    if char_length(panel_id) not between 1 and 64
      or panel_id = any(seen_ids)
      or panel_kind not in ('markdown', 'kv_stats', 'callout')
      or char_length(panel_title) not between 1 and 40
      or panel_color !~ '^#[0-9a-f]{6}$'
      or char_length(panel_body) > 2000
      or jsonb_typeof(item->'x') is distinct from 'number'
      or jsonb_typeof(item->'y') is distinct from 'number'
      or jsonb_typeof(item->'w') is distinct from 'number'
      or jsonb_typeof(item->'h') is distinct from 'number' then
      raise exception 'INVALID_CUSTOM_PANELS';
    end if;

    px := round((item->>'x')::numeric)::integer;
    py := round((item->>'y')::numeric)::integer;
    pw := round((item->>'w')::numeric)::integer;
    ph := round((item->>'h')::numeric)::integer;

    if pw not between 240 and 1400
      or ph not between 150 and 1140
      or px < 0 or py < 0
      or px + pw > 2144
      or py + ph > 1206 then
      raise exception 'INVALID_CUSTOM_PANELS';
    end if;

    normalized_rows := '[]'::jsonb;
    if item ? 'rows' and item->'rows' <> 'null'::jsonb then
      if jsonb_typeof(item->'rows') is distinct from 'array'
        or jsonb_array_length(item->'rows') > 16 then
        raise exception 'INVALID_CUSTOM_PANELS';
      end if;
      for row_item in select * from jsonb_array_elements(item->'rows') loop
        if jsonb_typeof(row_item) is distinct from 'object'
          or char_length(btrim(coalesce(row_item->>'label', ''))) not between 1 and 32
          or char_length(btrim(coalesce(row_item->>'value', ''))) > 80
          or (row_item ? 'tone' and row_item->'tone' <> 'null'::jsonb
              and coalesce(row_item->>'tone', '') not in ('neutral', 'good', 'warn', 'danger')) then
          raise exception 'INVALID_CUSTOM_PANELS';
        end if;
        normalized_rows := normalized_rows || jsonb_build_array(
          jsonb_strip_nulls(jsonb_build_object(
            'label', btrim(row_item->>'label'),
            'value', btrim(coalesce(row_item->>'value', '')),
            'tone', case when row_item ? 'tone' and row_item->'tone' <> 'null'::jsonb then row_item->'tone' else null end
          ))
        );
      end loop;
    end if;

    seen_ids := array_append(seen_ids, panel_id);
    result := result || jsonb_build_array(jsonb_build_object(
      'id', panel_id,
      'kind', panel_kind,
      'title', panel_title,
      'color', panel_color,
      'body', panel_body,
      'rows', normalized_rows,
      'x', px,
      'y', py,
      'w', pw,
      'h', ph
    ));
  end loop;

  return result;
end;
$$;

revoke all on function private.validate_custom_panels(jsonb) from public, anon, authenticated;

create or replace function private.validate_module_layout_json(p_layout jsonb)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  module_keys text[] := array['inventory', 'tasks', 'shifts', 'index', 'activity', 'safety'];
  item record;
begin
  if jsonb_typeof(coalesce(p_layout, '{}'::jsonb)) <> 'object' then
    raise exception 'INVALID_MODULE_LAYOUT';
  end if;
  for item in select * from jsonb_each(coalesce(p_layout, '{}'::jsonb)) loop
    if not (item.key = any(module_keys))
      or jsonb_typeof(item.value) <> 'object'
      or jsonb_typeof(item.value->'x') <> 'number'
      or jsonb_typeof(item.value->'y') <> 'number'
      or (item.value->>'x')::numeric not between 0 and 2144
      or (item.value->>'y')::numeric not between 0 and 1206
      or (item.value ? 'w' and (
        jsonb_typeof(item.value->'w') <> 'number'
        or (item.value->>'w')::numeric not between 260 and 1400
      ))
      or (item.value ? 'h' and (
        jsonb_typeof(item.value->'h') <> 'number'
        or (item.value->>'h')::numeric not between 180 and 1140
      )) then
      raise exception 'INVALID_MODULE_LAYOUT';
    end if;
  end loop;
end;
$$;

revoke all on function private.validate_module_layout_json(jsonb) from public, anon, authenticated;

-- Preserve custom w/h when moving a module.
create or replace function public.move_board_module(
  p_campaign_id uuid,
  p_key text,
  p_x integer,
  p_y integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  result jsonb;
  allowed text[] := array[
    'inventory', 'tasks', 'shifts', 'index', 'activity', 'safety'
  ];
begin
  perform private.lock_campaign(p_campaign_id, 'gm');

  if not (p_key = any(allowed))
    or p_x not between 0 and 2144
    or p_y not between 0 and 1206 then
    raise exception 'INVALID_MODULE_POSITION';
  end if;

  update public.campaign_settings
  set module_layout = jsonb_set(
        coalesce(module_layout, '{}'::jsonb),
        array[p_key],
        coalesce(module_layout->p_key, '{}'::jsonb) || jsonb_build_object('x', p_x, 'y', p_y),
        true
      ),
      updated_at = now()
  where campaign_id = p_campaign_id
  returning module_layout into result;

  if result is null then
    raise exception 'CAMPAIGN_SETTINGS_NOT_FOUND';
  end if;
  return result;
end;
$$;

create or replace function public.resize_board_module(
  p_campaign_id uuid,
  p_key text,
  p_x integer,
  p_y integer,
  p_w integer,
  p_h integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  result jsonb;
  allowed text[] := array[
    'inventory', 'tasks', 'shifts', 'index', 'activity', 'safety'
  ];
begin
  perform private.lock_campaign(p_campaign_id, 'gm');

  if not (p_key = any(allowed))
    or p_x is null or p_y is null or p_w is null or p_h is null
    or p_w not between 260 and 1400
    or p_h not between 180 and 1140
    or p_x < 0 or p_y < 0
    or p_x + p_w > 2144
    or p_y + p_h > 1206 then
    raise exception 'INVALID_MODULE_POSITION';
  end if;

  update public.campaign_settings
  set module_layout = jsonb_set(
        coalesce(module_layout, '{}'::jsonb),
        array[p_key],
        jsonb_build_object('x', p_x, 'y', p_y, 'w', p_w, 'h', p_h),
        true
      ),
      updated_at = now()
  where campaign_id = p_campaign_id
  returning module_layout into result;

  if result is null then
    raise exception 'CAMPAIGN_SETTINGS_NOT_FOUND';
  end if;
  return result;
end;
$$;

revoke all on function public.resize_board_module(uuid, text, integer, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.resize_board_module(uuid, text, integer, integer, integer, integer)
  to authenticated;

create or replace function public.update_board_style_tokens(
  p_campaign_id uuid,
  p_tokens jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  validated jsonb;
begin
  perform private.lock_campaign(p_campaign_id, 'gm');
  validated := private.validate_style_tokens(p_tokens);
  update public.campaign_settings
  set style_tokens = validated,
      updated_at = now()
  where campaign_id = p_campaign_id;
  if not found then raise exception 'CAMPAIGN_SETTINGS_NOT_FOUND'; end if;
  return validated;
end;
$$;

revoke all on function public.update_board_style_tokens(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.update_board_style_tokens(uuid, jsonb)
  to authenticated;

create or replace function public.update_custom_panels(
  p_campaign_id uuid,
  p_panels jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  validated jsonb;
begin
  perform private.lock_campaign(p_campaign_id, 'gm');
  validated := private.validate_custom_panels(p_panels);
  update public.campaign_settings
  set custom_panels = validated,
      updated_at = now()
  where campaign_id = p_campaign_id;
  if not found then raise exception 'CAMPAIGN_SETTINGS_NOT_FOUND'; end if;
  return validated;
end;
$$;

revoke all on function public.update_custom_panels(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.update_custom_panels(uuid, jsonb)
  to authenticated;

-- Atomic blueprint apply for the VeilBoard AI Harness.
create or replace function public.apply_board_blueprint(
  p_campaign_id uuid,
  p_blueprint jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor uuid := private.require_actor();
  allowed_sections text[] := array['inventory', 'tasks', 'shifts', 'index', 'activity', 'safety', 'notes'];
  resource_groups text[] := array['0', '1', '2'];
  current_settings public.campaign_settings;
  next_titles jsonb;
  next_colors jsonb;
  next_res_titles jsonb;
  next_hidden text[];
  next_layout jsonb;
  next_tokens jsonb;
  next_panels jsonb;
  item jsonb;
  note_id uuid;
  link_id uuid;
  quest_row public.quests;
  res_id uuid;
  clock_row jsonb;
  cat_id uuid;
  chk_id uuid;
  cat_name text;
  from_uuid uuid;
  to_uuid uuid;
  ref_map jsonb := '{}'::jsonb;
  created_notes uuid[] := '{}'::uuid[];
  created_links uuid[] := '{}'::uuid[];
  created_quests uuid[] := '{}'::uuid[];
  created_resources uuid[] := '{}'::uuid[];
  created_clocks uuid[] := '{}'::uuid[];
  created_checklists uuid[] := '{}'::uuid[];
  summary_text text;
begin
  perform private.lock_campaign(p_campaign_id, 'gm');
  if p_blueprint is null or jsonb_typeof(p_blueprint) is distinct from 'object' then
    raise exception 'INVALID_BLUEPRINT';
  end if;

  select * into current_settings
  from public.campaign_settings
  where campaign_id = p_campaign_id
  for update;
  if not found then raise exception 'CAMPAIGN_SETTINGS_NOT_FOUND'; end if;

  if p_blueprint ? 'campaignName' and p_blueprint->'campaignName' <> 'null'::jsonb then
    if jsonb_typeof(p_blueprint->'campaignName') is distinct from 'string'
      or char_length(btrim(p_blueprint->>'campaignName')) not between 1 and 80 then
      raise exception 'INVALID_CAMPAIGN_SETTINGS';
    end if;
    update public.campaigns
    set name = btrim(p_blueprint->>'campaignName'), updated_at = now()
    where id = p_campaign_id;
  end if;

  if p_blueprint ? 'appearance' and p_blueprint->'appearance' <> 'null'::jsonb then
    perform public.update_board_appearance(p_campaign_id, p_blueprint->'appearance');
    select * into current_settings from public.campaign_settings where campaign_id = p_campaign_id;
  end if;

  if p_blueprint ? 'clock' and p_blueprint->'clock' <> 'null'::jsonb then
    perform public.update_campaign_clock(p_campaign_id, p_blueprint->'clock');
    select * into current_settings from public.campaign_settings where campaign_id = p_campaign_id;
  end if;

  next_titles := coalesce(p_blueprint->'sectionTitles', current_settings.section_titles);
  next_colors := coalesce(p_blueprint->'sectionColors', current_settings.section_colors);
  next_res_titles := coalesce(p_blueprint->'resourceTitles', current_settings.resource_titles);
  next_layout := coalesce(p_blueprint->'moduleLayout', current_settings.module_layout);
  next_tokens := case
    when p_blueprint ? 'styleTokens' and p_blueprint->'styleTokens' <> 'null'::jsonb
      then private.validate_style_tokens(p_blueprint->'styleTokens')
    else current_settings.style_tokens
  end;
  next_panels := case
    when p_blueprint ? 'customPanels' and p_blueprint->'customPanels' <> 'null'::jsonb
      then private.validate_custom_panels(p_blueprint->'customPanels')
    else current_settings.custom_panels
  end;

  if p_blueprint ? 'hiddenSections' and p_blueprint->'hiddenSections' <> 'null'::jsonb then
    if jsonb_typeof(p_blueprint->'hiddenSections') is distinct from 'array' then
      raise exception 'INVALID_CAMPAIGN_SETTINGS';
    end if;
    select coalesce(array_agg(distinct val), '{}'::text[])
    into next_hidden
    from jsonb_array_elements_text(p_blueprint->'hiddenSections') val;
  else
    next_hidden := current_settings.hidden_sections;
  end if;

  if jsonb_typeof(next_titles) <> 'object'
    or exists (
      select 1 from jsonb_each_text(next_titles) e
      where not (e.key = any(allowed_sections)) or char_length(btrim(e.value)) not between 1 and 32
    )
    or jsonb_typeof(next_colors) <> 'object'
    or exists (
      select 1 from jsonb_each_text(next_colors) e
      where not (e.key = any(allowed_sections)) or e.value !~ '^#[0-9a-fA-F]{6}$'
    )
    or jsonb_typeof(next_res_titles) <> 'object'
    or exists (
      select 1 from jsonb_each_text(next_res_titles) e
      where not (e.key = any(resource_groups)) or char_length(btrim(e.value)) not between 1 and 32
    )
    or exists (
      select 1 from unnest(next_hidden) h where not (h = any(allowed_sections))
    ) then
    raise exception 'INVALID_CAMPAIGN_SETTINGS';
  end if;

  perform private.validate_module_layout_json(next_layout);

  update public.campaign_settings
  set section_titles = next_titles,
      section_colors = next_colors,
      resource_titles = next_res_titles,
      hidden_sections = next_hidden,
      module_layout = next_layout,
      style_tokens = next_tokens,
      custom_panels = next_panels,
      updated_at = now()
  where campaign_id = p_campaign_id;

  -- Create notes
  if p_blueprint ? 'notes' and jsonb_typeof(p_blueprint->'notes') = 'array' then
    if jsonb_array_length(p_blueprint->'notes') > 24 then
      raise exception 'INVALID_BLUEPRINT';
    end if;
    for item in select * from jsonb_array_elements(p_blueprint->'notes') loop
      note_id := public.save_note(
        p_campaign_id,
        coalesce(item->>'title', '线索便签'),
        coalesce(item->>'body', ''),
        (coalesce(item->>'color', 'yellow'))::public.note_color,
        greatest(18, least(1850, coalesce((item->>'x')::integer, 1100))),
        greatest(18, least(980, coalesce((item->>'y')::integer, 600))),
        coalesce((item->>'rotation')::numeric, 0),
        null,
        null,
        coalesce(item->>'pinColor', 'red')
      );
      if coalesce((item->>'pinned')::boolean, false) then
        perform public.set_note_pinned(p_campaign_id, note_id, true);
      end if;
      created_notes := array_append(created_notes, note_id);
      if item ? 'refId' and btrim(coalesce(item->>'refId', '')) <> '' then
        ref_map := jsonb_set(ref_map, array[btrim(item->>'refId')], to_jsonb(note_id::text), true);
      end if;
    end loop;
  end if;

  -- Create note links
  if p_blueprint ? 'noteLinks' and jsonb_typeof(p_blueprint->'noteLinks') = 'array' then
    if jsonb_array_length(p_blueprint->'noteLinks') > 32 then
      raise exception 'INVALID_BLUEPRINT';
    end if;
    for item in select * from jsonb_array_elements(p_blueprint->'noteLinks') loop
      from_uuid := coalesce(
        nullif(ref_map->>(item->>'from'), '')::uuid,
        case when (item->>'from') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
             then (item->>'from')::uuid else null end
      );
      to_uuid := coalesce(
        nullif(ref_map->>(item->>'to'), '')::uuid,
        case when (item->>'to') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
             then (item->>'to')::uuid else null end
      );
      if from_uuid is not null and to_uuid is not null and from_uuid <> to_uuid then
        link_id := public.create_note_link(p_campaign_id, from_uuid, to_uuid);
        if item ? 'label' and nullif(btrim(coalesce(item->>'label', '')), '') is not null then
          perform public.update_note_link_label(
            p_campaign_id,
            link_id,
            left(btrim(item->>'label'), 24)
          );
        end if;
        created_links := array_append(created_links, link_id);
      end if;
    end loop;
  end if;

  -- Create quests
  if p_blueprint ? 'quests' and jsonb_typeof(p_blueprint->'quests') = 'array' then
    if jsonb_array_length(p_blueprint->'quests') > 16 then
      raise exception 'INVALID_BLUEPRINT';
    end if;
    for item in select * from jsonb_array_elements(p_blueprint->'quests') loop
      quest_row := public.create_quest(
        p_campaign_id,
        coalesce(item->>'title', '新委托'),
        coalesce(item->>'body', '待补充说明'),
        coalesce(item->>'assigneeName', '待认领'),
        null
      );
      created_quests := array_append(created_quests, quest_row.id);
    end loop;
  end if;

  -- Create resources
  if p_blueprint ? 'resources' and jsonb_typeof(p_blueprint->'resources') = 'array' then
    if jsonb_array_length(p_blueprint->'resources') > 24 then
      raise exception 'INVALID_BLUEPRINT';
    end if;
    for item in select * from jsonb_array_elements(p_blueprint->'resources') loop
      res_id := public.save_resource(
        p_campaign_id,
        coalesce(item->>'name', '未命名物资'),
        coalesce(item->>'quantity', ''),
        (coalesce(item->>'status', 'ok'))::public.resource_status,
        greatest(0, least(2, coalesce((item->>'group')::integer, 0))),
        null
      );
      created_resources := array_append(created_resources, res_id);
    end loop;
  end if;

  -- Create event clocks
  if p_blueprint ? 'eventClocks' and jsonb_typeof(p_blueprint->'eventClocks') = 'array' then
    if jsonb_array_length(p_blueprint->'eventClocks') > 12 then
      raise exception 'INVALID_BLUEPRINT';
    end if;
    for item in select * from jsonb_array_elements(p_blueprint->'eventClocks') loop
      clock_row := to_jsonb(public.save_event_clock(
        p_campaign_id,
        coalesce(item->>'name', '新事件钟'),
        greatest(2, least(24, coalesce((item->>'segments')::integer, 6))),
        greatest(0, coalesce((item->>'progress')::integer, 0)),
        coalesce(nullif(btrim(coalesce(item->>'consequence', '')), ''), '事态升级，由 GM 裁定后续影响。'),
        lower(coalesce(item->>'color', '#b24b37')),
        null,
        null
      ));
      created_clocks := array_append(created_clocks, (clock_row->>'id')::uuid);
    end loop;
  end if;

  -- Create checklist items
  if p_blueprint ? 'checklist' and jsonb_typeof(p_blueprint->'checklist') = 'array' then
    if jsonb_array_length(p_blueprint->'checklist') > 24 then
      raise exception 'INVALID_BLUEPRINT';
    end if;
    for item in select * from jsonb_array_elements(p_blueprint->'checklist') loop
      cat_id := null;
      cat_name := nullif(btrim(coalesce(item->>'categoryName', '')), '');
      if cat_name is not null then
        select id into cat_id
        from public.checklist_categories
        where campaign_id = p_campaign_id and name = left(cat_name, 40)
        limit 1;
        if cat_id is null then
          insert into public.checklist_categories(campaign_id, name)
          values (p_campaign_id, left(cat_name, 40))
          returning id into cat_id;
        end if;
      end if;
      chk_id := public.save_checklist_item(
        p_campaign_id,
        left(coalesce(item->>'label', '检查项'), 120),
        null,
        cat_id
      );
      created_checklists := array_append(created_checklists, chk_id);
    end loop;
  end if;

  summary_text := left(btrim(coalesce(p_blueprint->>'summary', '使用 AI 帷幕编排更新了公告板')), 120);
  insert into public.event_log(campaign_id, actor_id, event_type, entity_type, entity_id, payload)
  values (
    p_campaign_id,
    actor,
    'harness_blueprint_applied',
    'settings',
    p_campaign_id,
    jsonb_build_object('after', jsonb_build_object('title', summary_text))
  );

  return jsonb_build_object(
    'createdNoteIds', to_jsonb(created_notes),
    'createdLinkIds', to_jsonb(created_links),
    'createdQuestIds', to_jsonb(created_quests),
    'createdResourceIds', to_jsonb(created_resources),
    'createdClockIds', to_jsonb(created_clocks),
    'createdChecklistIds', to_jsonb(created_checklists)
  );
end;
$$;

revoke all on function public.apply_board_blueprint(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.apply_board_blueprint(uuid, jsonb)
  to authenticated;

-- Surgical rollback for the last applied AI blueprint.
create or replace function public.rollback_board_blueprint(
  p_campaign_id uuid,
  p_snapshot jsonb
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor uuid := private.require_actor();
begin
  perform private.lock_campaign(p_campaign_id, 'gm');
  if p_snapshot is null or jsonb_typeof(p_snapshot) is distinct from 'object' then
    raise exception 'INVALID_BLUEPRINT';
  end if;

  if p_snapshot ? 'createdLinkIds' and jsonb_typeof(p_snapshot->'createdLinkIds') = 'array' then
    delete from public.note_links
    where campaign_id = p_campaign_id
      and id in (select (val)::uuid from jsonb_array_elements_text(p_snapshot->'createdLinkIds') val);
  end if;

  if p_snapshot ? 'createdNoteIds' and jsonb_typeof(p_snapshot->'createdNoteIds') = 'array' then
    delete from public.notes
    where campaign_id = p_campaign_id
      and id in (select (val)::uuid from jsonb_array_elements_text(p_snapshot->'createdNoteIds') val);
  end if;

  if p_snapshot ? 'createdQuestIds' and jsonb_typeof(p_snapshot->'createdQuestIds') = 'array' then
    delete from public.quests
    where campaign_id = p_campaign_id
      and id in (select (val)::uuid from jsonb_array_elements_text(p_snapshot->'createdQuestIds') val);
  end if;

  if p_snapshot ? 'createdResourceIds' and jsonb_typeof(p_snapshot->'createdResourceIds') = 'array' then
    delete from public.resources
    where campaign_id = p_campaign_id
      and id in (select (val)::uuid from jsonb_array_elements_text(p_snapshot->'createdResourceIds') val);
  end if;

  if p_snapshot ? 'createdClockIds' and jsonb_typeof(p_snapshot->'createdClockIds') = 'array' then
    delete from public.event_clocks
    where campaign_id = p_campaign_id
      and id in (select (val)::uuid from jsonb_array_elements_text(p_snapshot->'createdClockIds') val);
  end if;

  if p_snapshot ? 'createdChecklistIds' and jsonb_typeof(p_snapshot->'createdChecklistIds') = 'array' then
    delete from public.checklist_items
    where campaign_id = p_campaign_id
      and id in (select (val)::uuid from jsonb_array_elements_text(p_snapshot->'createdChecklistIds') val);
  end if;

  if p_snapshot ? 'settings' and jsonb_typeof(p_snapshot->'settings') = 'object' then
    perform public.apply_board_blueprint(
      p_campaign_id,
      (p_snapshot->'settings') || jsonb_build_object('summary', '撤销了上一次 AI 帷幕编排')
    );
  else
    insert into public.event_log(campaign_id, actor_id, event_type, entity_type, entity_id, payload)
    values (
      p_campaign_id, actor, 'harness_blueprint_reverted', 'settings', p_campaign_id,
      jsonb_build_object('after', jsonb_build_object('title', '撤销了上一次 AI 帷幕编排'))
    );
  end if;
end;
$$;

revoke all on function public.rollback_board_blueprint(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.rollback_board_blueprint(uuid, jsonb)
  to authenticated;
