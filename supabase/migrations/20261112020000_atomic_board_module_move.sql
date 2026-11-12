-- 模块拖动按模块键原子更新，避免并发请求携带旧整板布局互相覆盖。
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
        jsonb_build_object('x', p_x, 'y', p_y),
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

revoke all on function public.move_board_module(uuid,text,integer,integer)
  from public, anon, authenticated;
grant execute on function public.move_board_module(uuid,text,integer,integer)
  to authenticated;
