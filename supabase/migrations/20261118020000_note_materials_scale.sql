-- Finalize note materials for databases which already applied the earlier Harness migration.
-- Replacing validators and RPCs preserves existing notes and runtime data.
create or replace function private.validate_card_effect(p_effect jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  shader text;
  topology text;
  progress numeric;
  glow_intensity numeric;
  spread_width numeric;
  noise_amount numeric;
  seed_val integer;
  ox numeric := 0.88;
  oy numeric := 0.10;
  placement text;
  intensity text;
  accent_raw jsonb;
  accent text := null;
  custom_glsl text := null;
  shader_name text := null;
begin
  if p_effect is null or p_effect = 'null'::jsonb then
    return jsonb_build_object(
      'shader', 'none',
      'topology', 'corner',
      'progress', 0,
      'origin', jsonb_build_array(0.88, 0.10),
      'glowIntensity', 2.3,
      'spreadWidth', 0.22,
      'noiseAmount', 0.45,
      'seed', 7,
      'accentColor', null,
      'customGlsl', null,
      'shaderName', null,
      'ornament', 'none',
      'placement', 'bottom',
      'edgeWear', 'clean',
      'intensity', 'medium'
    );
  end if;
  if jsonb_typeof(p_effect) is distinct from 'object' then
    raise exception 'INVALID_CARD_EFFECT';
  end if;

  shader := coalesce(
    p_effect->>'shader',
    case
      when coalesce(p_effect->>'ornament', '') = 'inferno'
        or coalesce(p_effect->>'edgeWear', '') = 'scorched' then 'burnt'
      else 'none'
    end
  );
  if shader not in ('none', 'burnt', 'parchment', 'hologram', 'ai_glsl') then
    raise exception 'INVALID_CARD_EFFECT';
  end if;

  if p_effect ? 'customGlsl' and p_effect->'customGlsl' <> 'null'::jsonb then
    if jsonb_typeof(p_effect->'customGlsl') is distinct from 'string'
      or char_length(p_effect->>'customGlsl') > 3000 then
      raise exception 'INVALID_CARD_EFFECT';
    end if;
    custom_glsl := btrim(p_effect->>'customGlsl');
    if char_length(custom_glsl) < 12 then
      custom_glsl := null;
    end if;
  end if;

  if shader = 'ai_glsl' and custom_glsl is null then
    shader := 'burnt';
  end if;

  if shader = 'none' then
    return jsonb_build_object(
      'shader', 'none',
      'topology', 'corner',
      'progress', 0,
      'origin', jsonb_build_array(0.88, 0.10),
      'glowIntensity', 2.3,
      'spreadWidth', 0.22,
      'noiseAmount', 0.45,
      'seed', 7,
      'accentColor', null,
      'customGlsl', null,
      'shaderName', null,
      'ornament', 'none',
      'placement', 'bottom',
      'edgeWear', 'clean',
      'intensity', 'medium'
    );
  end if;

  topology := coalesce(p_effect->>'topology', 'corner');
  if topology not in ('corner', 'bottom', 'perimeter', 'point') then
    raise exception 'INVALID_CARD_EFFECT';
  end if;

  progress := greatest(0, least(0.95, coalesce((p_effect->>'progress')::numeric, 0.34)));
  glow_intensity := greatest(0, least(5.0, coalesce((p_effect->>'glowIntensity')::numeric, 2.3)));
  spread_width := greatest(0.02, least(0.5, coalesce((p_effect->>'spreadWidth')::numeric, 0.22)));
  noise_amount := greatest(0.05, least(0.9, coalesce((p_effect->>'noiseAmount')::numeric, 0.45)));
  seed_val := greatest(1, least(999, round(coalesce((p_effect->>'seed')::numeric, 7))::integer));

  if p_effect ? 'origin' and jsonb_typeof(p_effect->'origin') = 'array'
    and jsonb_array_length(p_effect->'origin') >= 2 then
    ox := greatest(0, least(1, coalesce((p_effect->'origin'->>0)::numeric, 0.88)));
    oy := greatest(0, least(1, coalesce((p_effect->'origin'->>1)::numeric, 0.10)));
  end if;

  accent_raw := p_effect->'accentColor';
  if accent_raw is not null and accent_raw <> 'null'::jsonb then
    if jsonb_typeof(accent_raw) is distinct from 'string'
      or (accent_raw#>>'{}') !~ '^#[0-9a-fA-F]{6}$' then
      raise exception 'INVALID_CARD_EFFECT';
    end if;
    accent := lower(accent_raw#>>'{}');
  end if;

  if p_effect ? 'shaderName' and p_effect->'shaderName' <> 'null'::jsonb then
    shader_name := left(btrim(coalesce(p_effect->>'shaderName', '')), 48);
    if shader_name = '' then shader_name := null; end if;
  end if;

  placement := case
    when topology = 'perimeter' then 'around'
    when topology = 'bottom' then 'bottom'
    else 'corners'
  end;
  intensity := case
    when progress >= 0.35 then 'lush'
    when progress <= 0.2 then 'subtle'
    else 'medium'
  end;

  return jsonb_build_object(
    'shader', shader,
    'topology', topology,
    'progress', round(progress, 3),
    'origin', jsonb_build_array(round(ox, 3), round(oy, 3)),
    'glowIntensity', round(glow_intensity, 2),
    'spreadWidth', round(spread_width, 3),
    'noiseAmount', round(noise_amount, 3),
    'seed', seed_val,
    'accentColor', to_jsonb(accent),
    'customGlsl', to_jsonb(case when shader = 'ai_glsl' then custom_glsl else null end),
    'shaderName', to_jsonb(shader_name),
    'ornament', 'inferno',
    'placement', placement,
    'edgeWear', 'scorched',
    'intensity', intensity
  );
end;
$$;

revoke all on function private.validate_card_effect(jsonb) from public, anon, authenticated;

create or replace function private.validate_ambient_shader(p_shader jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  kind text;
  intensity numeric;
  speed numeric;
  pri text;
  sec text;
  custom_glsl text := null;
  shader_name text := null;
begin
  if p_shader is null or p_shader = 'null'::jsonb then
    return jsonb_build_object(
      'shader', 'none',
      'intensity', 1,
      'speed', 1,
      'primaryColor', '#243b42',
      'secondaryColor', '#2ee6d6',
      'customGlsl', null,
      'shaderName', null
    );
  end if;
  if jsonb_typeof(p_shader) is distinct from 'object' then
    raise exception 'INVALID_STYLE_TOKENS';
  end if;

  kind := coalesce(p_shader->>'shader', 'none');
  if kind not in ('none', 'ember_ash', 'hologram_grid', 'ancient_vellum', 'abyssal_mist', 'ai_glsl') then
    raise exception 'INVALID_STYLE_TOKENS';
  end if;

  if p_shader ? 'customGlsl' and p_shader->'customGlsl' <> 'null'::jsonb then
    if jsonb_typeof(p_shader->'customGlsl') is distinct from 'string'
      or char_length(p_shader->>'customGlsl') > 3000 then
      raise exception 'INVALID_STYLE_TOKENS';
    end if;
    custom_glsl := nullif(btrim(p_shader->>'customGlsl'), '');
  end if;
  if kind = 'ai_glsl' and custom_glsl is null then
    kind := 'ember_ash';
  end if;

  if kind = 'none' then
    return jsonb_build_object(
      'shader', 'none',
      'intensity', 1,
      'speed', 1,
      'primaryColor', '#243b42',
      'secondaryColor', '#2ee6d6',
      'customGlsl', null,
      'shaderName', null
    );
  end if;

  intensity := greatest(0.1, least(2.5, coalesce((p_shader->>'intensity')::numeric, 1.0)));
  speed := greatest(0, least(3.0, coalesce((p_shader->>'speed')::numeric, 1.0)));
  pri := lower(coalesce(p_shader->>'primaryColor', '#1b2429'));
  sec := lower(coalesce(p_shader->>'secondaryColor', '#2be4dc'));
  if pri !~ '^#[0-9a-f]{6}$' or sec !~ '^#[0-9a-f]{6}$' then
    raise exception 'INVALID_STYLE_TOKENS';
  end if;

  if p_shader ? 'shaderName' and p_shader->'shaderName' <> 'null'::jsonb then
    shader_name := nullif(left(btrim(coalesce(p_shader->>'shaderName', '')), 48), '');
  end if;

  return jsonb_build_object(
    'shader', kind,
    'intensity', round(intensity, 2),
    'speed', round(speed, 2),
    'primaryColor', pri,
    'secondaryColor', sec,
    'customGlsl', to_jsonb(case when kind = 'ai_glsl' then custom_glsl else null end),
    'shaderName', to_jsonb(shader_name)
  );
end;
$$;

revoke all on function private.validate_ambient_shader(jsonb) from public, anon, authenticated;

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
  default_effect jsonb;
  default_note_effect jsonb;
  surface_shader jsonb;
  frame_shader jsonb;
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

  default_effect := private.validate_card_effect(p_tokens->'defaultCardEffect');
  default_note_effect := private.validate_card_effect(p_tokens->'defaultNoteEffect');
  surface_shader := private.validate_ambient_shader(p_tokens->'surfaceShader');
  frame_shader := private.validate_ambient_shader(p_tokens->'frameShader');

  return jsonb_build_object(
    'fontPreset', font_preset,
    'cardStyle', card_style,
    'cardBackground', to_jsonb(normalized_bg),
    'radiusPreset', radius_preset,
    'linkStyle', link_style,
    'defaultCardEffect', default_effect,
    'defaultNoteEffect', default_note_effect,
    'surfaceShader', surface_shader,
    'frameShader', frame_shader
  );
end;
$$;

alter table public.notes
  alter column color drop default,
  alter column color type text using color::text,
  alter column color set default 'yellow';

alter table public.notes
  drop constraint if exists notes_color_hex_or_named_check,
  add constraint notes_color_hex_or_named_check
    check (color in ('yellow', 'pink', 'blue', 'green') or color ~ '^#[0-9a-f]{6}$');

alter table public.notes
  drop constraint if exists notes_pin_color_check,
  add constraint notes_pin_color_check
    check (pin_color in ('red', 'blue', 'green', 'yellow', 'black') or pin_color ~ '^#[0-9a-f]{6}$');

alter table public.notes
  alter column rotation type numeric(6, 2);

alter table public.notes
  add column if not exists scale numeric(4, 2) not null default 1
    check (scale between 0.5 and 2.5);

alter table public.notes
  add column if not exists effect jsonb;

create or replace function public.set_note_pin_color(
  p_campaign_id uuid,
  p_id uuid,
  p_color text
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_pin text := lower(btrim(coalesce(p_color, '')));
begin
  if clean_pin not in ('red', 'blue', 'green', 'yellow', 'black')
    and clean_pin !~ '^#[0-9a-f]{6}$' then
    raise exception 'INVALID_PIN_COLOR';
  end if;
  perform private.lock_campaign(p_campaign_id);
  update public.notes
  set pin_color = clean_pin, updated_at = now()
  where id = p_id
    and campaign_id = p_campaign_id
    and (author_id = private.current_actor_id() or private.has_role(p_campaign_id, 'gm'));
  if not found then raise exception 'NOTE_NOT_EDITABLE'; end if;
  return clean_pin;
end;
$$;

drop function if exists public.save_note(uuid, text, text, public.note_color, integer, integer, numeric, uuid, text, text);

create or replace function public.save_note(
  p_campaign_id uuid,
  p_title text,
  p_body text,
  p_color text,
  p_x integer default 1098,
  p_y integer default 605,
  p_rotation numeric default null,
  p_id uuid default null,
  p_image_path text default null,
  p_pin_color text default null,
  p_scale numeric default null,
  p_effect jsonb default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := private.require_actor();
  clean_color text := lower(btrim(coalesce(p_color, '')));
  clean_pin text := case when p_pin_color is null then null else lower(btrim(p_pin_color)) end;
  clean_scale numeric := case when p_scale is null then null else round(greatest(0.5, least(2.5, p_scale)), 2) end;
  clean_rot numeric := case when p_rotation is null then null else round(greatest(-180, least(180, p_rotation)), 2) end;
  clean_effect jsonb := case when p_effect is null then null else private.validate_card_effect(p_effect) end;
  result uuid;
begin
  perform private.lock_campaign(p_campaign_id);

  if clean_color not in ('yellow', 'pink', 'blue', 'green')
    and clean_color !~ '^#[0-9a-f]{6}$' then
    raise exception 'INVALID_NOTE_COLOR';
  end if;
  if clean_pin is not null
    and clean_pin not in ('red', 'blue', 'green', 'yellow', 'black')
    and clean_pin !~ '^#[0-9a-f]{6}$' then
    raise exception 'INVALID_PIN_COLOR';
  end if;
  if p_image_path is not null and not starts_with(p_image_path, p_campaign_id::text || '/') then
    raise exception 'INVALID_NOTE_IMAGE';
  end if;

  if clean_effect is not null and (clean_effect->>'shader') = 'none' then
    clean_effect := null;
  end if;

  if p_id is null then
    insert into public.notes(
      campaign_id, author_id, title, body, color, x, y, rotation, image_path, pin_color, scale, effect
    ) values (
      p_campaign_id, actor, trim(p_title), p_body, clean_color, p_x, p_y,
      coalesce(clean_rot, 0), p_image_path, coalesce(clean_pin, 'red'), coalesce(clean_scale, 1), clean_effect
    ) returning id into result;
  else
    update public.notes
    set title = trim(p_title),
        body = p_body,
        color = clean_color,
        image_path = p_image_path,
        pin_color = coalesce(clean_pin, pin_color),
        rotation = coalesce(clean_rot, rotation),
        scale = coalesce(clean_scale, scale),
        effect = case when p_effect is null then effect else clean_effect end,
        updated_at = now()
    where id = p_id
      and campaign_id = p_campaign_id
      and (author_id = actor or private.has_role(p_campaign_id, 'gm'))
    returning id into result;
  end if;

  if result is null then raise exception 'NOTE_NOT_EDITABLE'; end if;
  return result;
end;
$$;

revoke all on function public.save_note(uuid, text, text, text, integer, integer, numeric, uuid, text, text, numeric, jsonb)
  from public, anon, authenticated;
grant execute on function public.save_note(uuid, text, text, text, integer, integer, numeric, uuid, text, text, numeric, jsonb)
  to authenticated;

create or replace function public.resize_note(
  p_campaign_id uuid,
  p_id uuid,
  p_scale numeric
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := private.require_actor();
  updated public.notes;
begin
  perform private.lock_campaign(p_campaign_id);
  if p_scale is null or p_scale not between 0.5 and 2.5 then
    raise exception 'INVALID_NOTE_SCALE';
  end if;
  update public.notes
  set scale = round(p_scale, 2), updated_at = now()
  where id = p_id
    and campaign_id = p_campaign_id
    and (author_id = actor or private.has_role(p_campaign_id, 'gm'))
  returning * into updated;
  if updated.id is null then raise exception 'NOTE_NOT_EDITABLE'; end if;
  return to_jsonb(updated);
end;
$$;

revoke all on function public.resize_note(uuid, uuid, numeric) from public, anon, authenticated;
grant execute on function public.resize_note(uuid, uuid, numeric) to authenticated;

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
  note_row public.notes;
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
  updated_notes_before jsonb := '[]'::jsonb;
  next_note_eff jsonb;
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

  -- Update existing notes (AI note shader / RGB color / scale / rotation patches)
  if p_blueprint ? 'noteUpdates' and jsonb_typeof(p_blueprint->'noteUpdates') = 'array' then
    for item in select * from jsonb_array_elements(p_blueprint->'noteUpdates') loop
      if (item->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        select * into note_row
        from public.notes
        where campaign_id = p_campaign_id and id = (item->>'id')::uuid
        for update;
        if found then
          updated_notes_before := updated_notes_before || jsonb_build_array(jsonb_build_object(
            'id', note_row.id,
            'color', note_row.color,
            'pinColor', note_row.pin_color,
            'rotation', note_row.rotation,
            'scale', note_row.scale,
            'effect', note_row.effect
          ));
          next_note_eff := case
            when item ? 'effect' then private.validate_card_effect(item->'effect')
            else note_row.effect
          end;
          if next_note_eff is not null and (next_note_eff->>'shader') = 'none' then
            next_note_eff := null;
          end if;
          update public.notes
          set color = coalesce(lower(nullif(btrim(coalesce(item->>'color', '')), '')), color),
              pin_color = coalesce(lower(nullif(btrim(coalesce(item->>'pinColor', '')), '')), pin_color),
              rotation = case when item ? 'rotation' and jsonb_typeof(item->'rotation') = 'number'
                              then round(greatest(-180, least(180, (item->>'rotation')::numeric)), 2)
                              else rotation end,
              scale = case when item ? 'scale' and jsonb_typeof(item->'scale') = 'number'
                           then round(greatest(0.5, least(2.5, (item->>'scale')::numeric)), 2)
                           else scale end,
              effect = next_note_eff,
              updated_at = now()
          where id = note_row.id;
        end if;
      end if;
    end loop;
  end if;

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
        lower(coalesce(item->>'color', 'yellow')),
        greatest(18, least(1850, coalesce((item->>'x')::integer, 1100))),
        greatest(18, least(980, coalesce((item->>'y')::integer, 600))),
        coalesce((item->>'rotation')::numeric, 0),
        null,
        null,
        lower(coalesce(item->>'pinColor', 'red')),
        coalesce((item->>'scale')::numeric, 1),
        item->'effect'
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
    'createdChecklistIds', to_jsonb(created_checklists),
    'updatedNotesBefore', updated_notes_before
  );
end;
$$;

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
  prev_note jsonb;
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

  if p_snapshot ? 'updatedNotesBefore' and jsonb_typeof(p_snapshot->'updatedNotesBefore') = 'array' then
    for prev_note in select * from jsonb_array_elements(p_snapshot->'updatedNotesBefore') loop
      if (prev_note->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        update public.notes
        set color = coalesce(prev_note->>'color', color),
            pin_color = coalesce(prev_note->>'pinColor', pin_color),
            rotation = coalesce((prev_note->>'rotation')::numeric, rotation),
            scale = coalesce((prev_note->>'scale')::numeric, scale),
            effect = case when prev_note->'effect' is null or prev_note->'effect' = 'null'::jsonb
                          then null else prev_note->'effect' end,
            updated_at = now()
        where campaign_id = p_campaign_id and id = (prev_note->>'id')::uuid;
      end if;
    end loop;
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
