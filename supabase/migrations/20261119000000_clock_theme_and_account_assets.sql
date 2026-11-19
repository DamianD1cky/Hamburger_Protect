-- ============================================================================
-- Clock Theme Appearance in style_tokens + Account-Scoped AI Design Assets
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
    'aiPrompt', to_jsonb(v_prompt)
  );
end;
$$;

revoke all on function private.validate_clock_appearance(jsonb) from public, anon, authenticated;

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
    'clockAppearance', clock_appearance
  );
end;
$$;

create table if not exists public.user_design_assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('card_shader', 'ambient_shader', 'board_style', 'clock_style', 'dice_material')),
  name text not null check (char_length(name) between 1 and 60),
  description text not null default '' check (char_length(description) <= 200),
  source text not null default 'ai' check (source in ('ai', 'custom')),
  prompt text check (prompt is null or char_length(prompt) <= 240),
  preview_colors jsonb not null default '[]'::jsonb,
  payload jsonb not null,
  favorite boolean not null default false,
  fingerprint text not null check (char_length(fingerprint) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, fingerprint)
);

alter table public.user_design_assets enable row level security;

create policy user_design_assets_owner_all
  on public.user_design_assets
  for all
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
