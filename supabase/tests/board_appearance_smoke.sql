-- 外观写入只由 GM 执行，全部修改最终回滚。
begin;
set local statement_timeout = '20s';
do $identity$
declare
  room uuid;
  actor_auth uuid;
begin
  select m.campaign_id, p.auth_user_id into room, actor_auth
  from public.campaign_members m
  join public.campaigns c on c.id = m.campaign_id
  join public.profiles p on p.id = m.user_id
  join public.gm_access g on g.user_id = p.id
  join auth.users a on a.id = p.auth_user_id
  where m.role = 'gm' and m.active and c.status = 'active'
    and g.status = 'approved' and not p.disabled
    and not coalesce(a.is_anonymous, false)
    and (a.banned_until is null or a.banned_until < now())
  limit 1;
  if room is null then raise exception 'NO_GM_FOR_APPEARANCE_SMOKE'; end if;
  perform set_config('test.board_campaign', room::text, true);
  perform set_config('request.jwt.claim.sub', actor_auth::text, true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', actor_auth, 'role', 'authenticated', 'is_anonymous', false)::text, true);
end;
$identity$;

set local role authenticated;
do $smoke$
declare
  room uuid := current_setting('test.board_campaign')::uuid;
  before_positions jsonb;
  theme jsonb := '{
    "room":{"kind":"color","color":"#263b32","imagePath":null,"fit":"cover","positionX":50,"positionY":50,"dim":0.2},
    "surface":{"kind":"cork","imagePath":null},
    "frame":"wood"
  }';
begin
  select jsonb_agg(jsonb_build_array(id,x,y) order by id) into before_positions
  from public.notes where campaign_id = room;
  perform public.update_board_appearance(room, theme);
  if (select appearance from public.campaign_settings where campaign_id = room) <> theme then
    raise exception 'APPEARANCE_SAVE_FAILED';
  end if;
  if before_positions is distinct from (
    select jsonb_agg(jsonb_build_array(id,x,y) order by id) from public.notes where campaign_id = room
  ) then raise exception 'APPEARANCE_MOVED_NOTES'; end if;
end;
$smoke$;
rollback;
select 'passed; appearance changes rolled back' as smoke;
