-- ============================================================================
-- Global & Per-Item Font Sizes, Custom Font Family, and Campaign Archive Box
-- ============================================================================

create or replace function private.validate_clock_appearance(p_raw jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_preset text := 'auto';
  v_font text := 'mono';
  v_frame text := 'glass';
  v_glow numeric := 0.6;
  v_font_size integer := 22;
  v_custom_font text := null;
  v_scanlines boolean := false;
  v_label text := null;
  v_prompt text := null;
  v_surface text := null;
  v_border text := null;
  v_text text := null;
  v_accent text := null;
  v_glow_color text := null;
begin
  if p_raw is null or p_raw = 'null'::jsonb then
    return jsonb_build_object(
      'preset', 'auto',
      'label', null,
      'surfaceColor', null,
      'borderColor', null,
      'textColor', null,
      'accentColor', null,
      'glowColor', null,
      'fontStyle', 'mono',
      'frameStyle', 'glass',
      'scanlines', false,
      'glowStrength', 0.6,
      'fontSize', 22,
      'customFontFamily', null,
      'aiPrompt', null
    );
  end if;

  if jsonb_typeof(p_raw) is distinct from 'object' then
    raise exception 'INVALID_STYLE_TOKENS';
  end if;

  v_preset := coalesce(p_raw->>'preset', 'auto');
  if v_preset not in (
    'auto',
    'veil_cork',
    'shadow_slate',
    'parchment_study',
    'crisis_diner',
    'cyber_terminal',
    'molten_forge',
    'custom'
  ) then
    raise exception 'INVALID_STYLE_TOKENS';
  end if;

  v_font := coalesce(p_raw->>'fontStyle', 'mono');
  if v_font not in ('mono', 'serif', 'handwritten', 'display') then
    raise exception 'INVALID_STYLE_TOKENS';
  end if;

  v_frame := coalesce(p_raw->>'frameStyle', 'glass');
  if v_frame not in ('glass', 'bezel', 'parchment', 'terminal') then
    raise exception 'INVALID_STYLE_TOKENS';
  end if;

  if p_raw ? 'glowStrength' and jsonb_typeof(p_raw->'glowStrength') = 'number' then
    v_glow := least(2.0, greatest(0.0, (p_raw->>'glowStrength')::numeric));
  end if;

  if p_raw ? 'fontSize' and jsonb_typeof(p_raw->'fontSize') = 'number' then
    v_font_size := least(34, greatest(14, round((p_raw->>'fontSize')::numeric)::integer));
  end if;

  if p_raw ? 'customFontFamily' and jsonb_typeof(p_raw->'customFontFamily') = 'string' then
    v_custom_font := nullif(left(btrim(p_raw->>'customFontFamily'), 64), '');
  end if;

  if p_raw ? 'scanlines' and jsonb_typeof(p_raw->'scanlines') = 'boolean' then
    v_scanlines := (p_raw->>'scanlines')::boolean;
  end if;

  if p_raw ? 'label' and jsonb_typeof(p_raw->'label') = 'string' then
    v_label := nullif(left(btrim(p_raw->>'label'), 40), '');
  end if;

  if p_raw ? 'aiPrompt' and jsonb_typeof(p_raw->'aiPrompt') = 'string' then
    v_prompt := nullif(left(btrim(p_raw->>'aiPrompt'), 180), '');
  end if;

  if p_raw ? 'surfaceColor' and jsonb_typeof(p_raw->'surfaceColor') = 'string' and (p_raw->>'surfaceColor') ~ '^#[0-9a-fA-F]{6}$' then
    v_surface := lower(p_raw->>'surfaceColor');
  end if;
  if p_raw ? 'borderColor' and jsonb_typeof(p_raw->'borderColor') = 'string' and (p_raw->>'borderColor') ~ '^#[0-9a-fA-F]{6}$' then
    v_border := lower(p_raw->>'borderColor');
  end if;
  if p_raw ? 'textColor' and jsonb_typeof(p_raw->'textColor') = 'string' and (p_raw->>'textColor') ~ '^#[0-9a-fA-F]{6}$' then
    v_text := lower(p_raw->>'textColor');
  end if;
  if p_raw ? 'accentColor' and jsonb_typeof(p_raw->'accentColor') = 'string' and (p_raw->>'accentColor') ~ '^#[0-9a-fA-F]{6}$' then
    v_accent := lower(p_raw->>'accentColor');
  end if;
  if p_raw ? 'glowColor' and jsonb_typeof(p_raw->'glowColor') = 'string' and (p_raw->>'glowColor') ~ '^#[0-9a-fA-F]{6}$' then
    v_glow_color := lower(p_raw->>'glowColor');
  end if;

  return jsonb_build_object(
    'preset', v_preset,
    'label', to_jsonb(v_label),
    'surfaceColor', to_jsonb(v_surface),
    'borderColor', to_jsonb(v_border),
    'textColor', to_jsonb(v_text),
    'accentColor', to_jsonb(v_accent),
    'glowColor', to_jsonb(v_glow_color),
    'fontStyle', v_font,
    'frameStyle', v_frame,
    'scanlines', v_scanlines,
    'glowStrength', v_glow,
    'fontSize', v_font_size,
    'customFontFamily', to_jsonb(v_custom_font),
    'aiPrompt', to_jsonb(v_prompt)
  );
end;
$$;

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
  clock_appearance jsonb;
  font_scale numeric := 1.0;
  custom_font text := null;
  note_font_sizes jsonb := '{}'::jsonb;
  section_font_sizes jsonb := '{}'::jsonb;
  archive_entries jsonb := '[]'::jsonb;
  hidden_panel_ids jsonb := '[]'::jsonb;
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
  clock_appearance := private.validate_clock_appearance(p_tokens->'clockAppearance');

  if p_tokens ? 'fontSizeScale' and jsonb_typeof(p_tokens->'fontSizeScale') = 'number' then
    font_scale := least(1.5, greatest(0.75, (p_tokens->>'fontSizeScale')::numeric));
  end if;

  if p_tokens ? 'customFontFamily' and jsonb_typeof(p_tokens->'customFontFamily') = 'string' then
    custom_font := nullif(left(btrim(p_tokens->>'customFontFamily'), 64), '');
  end if;

  if p_tokens ? 'noteFontSizes' and jsonb_typeof(p_tokens->'noteFontSizes') = 'object' then
    note_font_sizes := p_tokens->'noteFontSizes';
  end if;

  if p_tokens ? 'sectionFontSizes' and jsonb_typeof(p_tokens->'sectionFontSizes') = 'object' then
    section_font_sizes := p_tokens->'sectionFontSizes';
  end if;

  if p_tokens ? 'archiveEntries' and jsonb_typeof(p_tokens->'archiveEntries') = 'array' then
    if jsonb_array_length(p_tokens->'archiveEntries') > 60 then
      raise exception 'INVALID_STYLE_TOKENS';
    end if;
    archive_entries := p_tokens->'archiveEntries';
  end if;

  if p_tokens ? 'hiddenPanelIds' and jsonb_typeof(p_tokens->'hiddenPanelIds') = 'array' then
    if jsonb_array_length(p_tokens->'hiddenPanelIds') > 24 then
      raise exception 'INVALID_STYLE_TOKENS';
    end if;
    hidden_panel_ids := p_tokens->'hiddenPanelIds';
  end if;

  return jsonb_build_object(
    'fontPreset', font_preset,
    'cardStyle', card_style,
    'cardBackground', to_jsonb(normalized_bg),
    'radiusPreset', radius_preset,
    'linkStyle', link_style,
    'defaultCardEffect', default_effect,
    'defaultNoteEffect', default_note_effect,
    'surfaceShader', surface_shader,
    'frameShader', frame_shader,
    'clockAppearance', clock_appearance,
    'fontSizeScale', font_scale,
    'customFontFamily', to_jsonb(custom_font),
    'noteFontSizes', note_font_sizes,
    'sectionFontSizes', section_font_sizes,
    'archiveEntries', archive_entries,
    'hiddenPanelIds', hidden_panel_ids
  );
end;
$$;
