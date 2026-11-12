-- 外围背景、板面和边框独立保存；不修改任何公告板物件坐标。
alter table public.campaign_settings add column if not exists appearance jsonb;
alter table public.campaign_settings add constraint campaign_settings_appearance_object
  check (appearance is null or jsonb_typeof(appearance) = 'object');

create function public.update_board_appearance(p_campaign_id uuid, p_appearance jsonb)
returns public.campaign_settings language plpgsql security definer set search_path = '' as $$
declare
  room jsonb := p_appearance->'room';
  surface jsonb := p_appearance->'surface';
  result public.campaign_settings;
  prefix text := p_campaign_id::text || '/';
begin
  perform private.lock_campaign(p_campaign_id, 'gm');
  if jsonb_typeof(p_appearance) is distinct from 'object'
    or jsonb_typeof(room) is distinct from 'object'
    or jsonb_typeof(surface) is distinct from 'object'
    or (room->>'kind') is null or room->>'kind' not in ('default','color','image')
    or (surface->>'kind') is null or surface->>'kind' not in ('felt','cork','paper','image')
    or (p_appearance->>'frame') is null or p_appearance->>'frame' not in ('burger','wood','metal','none')
    or (room->>'fit') is null or room->>'fit' not in ('cover','contain','tile')
    or (room->>'color') is null or room->>'color' !~ '^#[0-9a-fA-F]{6}$'
    or jsonb_typeof(room->'positionX') is distinct from 'number'
    or jsonb_typeof(room->'positionY') is distinct from 'number'
    or jsonb_typeof(room->'dim') is distinct from 'number'
    or (room->>'positionX')::numeric not between 0 and 100
    or (room->>'positionY')::numeric not between 0 and 100
    or (room->>'dim')::numeric not between 0 and 0.8
    or (room->>'kind' = 'image' and room->>'imagePath' is null)
    or (surface->>'kind' = 'image' and surface->>'imagePath' is null)
    or (room->>'imagePath' is not null and (
      not starts_with(room->>'imagePath', prefix)
      or char_length(room->>'imagePath') > 300
      or room->>'imagePath' like '%..%'
    ))
    or (surface->>'imagePath' is not null and (
      not starts_with(surface->>'imagePath', prefix)
      or char_length(surface->>'imagePath') > 300
      or surface->>'imagePath' like '%..%'
    )) then
    raise exception 'INVALID_BOARD_APPEARANCE';
  end if;

  insert into public.campaign_settings(campaign_id, appearance, background_path)
  values(p_campaign_id, p_appearance, room->>'imagePath')
  on conflict(campaign_id) do update set
    appearance = excluded.appearance,
    background_path = excluded.background_path,
    updated_at = now()
  returning * into result;
  return result;
end;
$$;

revoke all on function public.update_board_appearance(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.update_board_appearance(uuid,jsonb) to authenticated;
