-- Preserve the calendar format marker. Older clients still omit it, so their
-- independent year labels remain distinguishable from a canonical instant.
create or replace function public.update_campaign_clock(
  p_campaign_id uuid,
  p_config jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  mode_value text := p_config->>'mode';
  style_value text := p_config->>'style';
  era_value text := upper(p_config->>'era');
  era_year_numeric numeric;
  era_year_value integer;
  running_value boolean;
  value_ms numeric;
  initial_value_ms numeric;
  minimum_ms numeric;
  maximum_ms numeric;
  canonical jsonb;
begin
  perform private.lock_campaign(p_campaign_id, 'gm');

  if p_config is null
    or jsonb_typeof(p_config) <> 'object'
    or coalesce(mode_value, '') not in ('clock', 'countdown', 'stopwatch')
    or coalesce(style_value, '') not in ('nixie', 'quartz', 'digital')
    or coalesce(era_value, '') !~ '^[A-Z]{2}$'
    or coalesce(jsonb_typeof(p_config->'eraYear'), '') <> 'number'
    or coalesce(jsonb_typeof(p_config->'running'), '') <> 'boolean'
    or coalesce(jsonb_typeof(p_config->'valueMs'), '') <> 'number'
    or coalesce(jsonb_typeof(p_config->'initialValueMs'), '') <> 'number'
  then
    raise exception 'INVALID_CAMPAIGN_CLOCK';
  end if;

  era_year_numeric := (p_config->>'eraYear')::numeric;
  running_value := (p_config->>'running')::boolean;
  value_ms := (p_config->>'valueMs')::numeric;
  initial_value_ms := (p_config->>'initialValueMs')::numeric;
  minimum_ms := case when mode_value = 'clock' then -62167305600000 else 0 end;
  maximum_ms := case when mode_value = 'clock' then 253402387199999 else 253402300799999 end;

  if era_year_numeric <> trunc(era_year_numeric)
    or era_year_numeric not between 0 and 9999
    or value_ms not between minimum_ms and maximum_ms
    or initial_value_ms not between minimum_ms and maximum_ms
  then
    raise exception 'INVALID_CAMPAIGN_CLOCK';
  end if;
  era_year_value := era_year_numeric::integer;

  canonical := jsonb_build_object(
    'mode', mode_value,
    'style', style_value,
    'era', era_value,
    'eraYear', era_year_value,
    'running', running_value,
    'valueMs', value_ms,
    'initialValueMs', initial_value_ms,
    'referenceAt', clock_timestamp()
  );
  if p_config->'calendarVersion' = '1'::jsonb then
    canonical := canonical || '{"calendarVersion":1}'::jsonb;
  end if;

  update public.campaign_settings
  set clock_config = canonical,
      updated_at = now()
  where campaign_id = p_campaign_id;

  if not found then
    raise exception 'CAMPAIGN_SETTINGS_NOT_FOUND';
  end if;
  return canonical;
end;
$$;

revoke all on function public.update_campaign_clock(uuid,jsonb)
  from public, anon, authenticated;
grant execute on function public.update_campaign_clock(uuid,jsonb)
  to authenticated;
