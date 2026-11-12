-- 对已授权 GM 的扩展区域进行验收，业务数据全部回滚。
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
  if room is null then raise exception 'NO_GM_FOR_WIDE_BOARD_SMOKE'; end if;
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
  settings public.campaign_settings;
  positions jsonb;
  sticker jsonb;
begin
  select * into settings from public.campaign_settings where campaign_id = room;
  select jsonb_agg(jsonb_build_array(id,x,y) order by id) into positions from public.notes where campaign_id = room;
  perform public.update_campaign_settings(
    room, settings.section_titles, settings.hidden_sections, settings.background_path,
    settings.note_texture_path, settings.section_colors, settings.resource_titles,
    coalesce(settings.module_layout, '{}') || '{"tasks":{"x":1550,"y":50}}'::jsonb
  );
  if (select module_layout->'tasks'->>'x' from public.campaign_settings where campaign_id = room) <> '1550'
    then raise exception 'WIDE_MODULE_SAVE_FAILED'; end if;
  if (select appearance from public.campaign_settings where campaign_id = room) is distinct from settings.appearance
    then raise exception 'WIDE_BOARD_CHANGED_THEME'; end if;
  sticker := public.create_board_sticker(room, '⭐', 1900, 500, 0);
  if (sticker->>'x')::integer <> 1900 then raise exception 'WIDE_STICKER_CREATE_FAILED'; end if;
  sticker := public.move_board_sticker(room, (sticker->>'id')::uuid, 2072, 1134);
  if (sticker->>'x')::integer <> 2072 or (sticker->>'y')::integer <> 1134
    then raise exception 'WIDE_STICKER_MOVE_FAILED'; end if;
  if positions is distinct from (
    select jsonb_agg(jsonb_build_array(id,x,y) order by id) from public.notes where campaign_id = room
  ) then raise exception 'WIDE_BOARD_MOVED_NOTES'; end if;
end;
$smoke$;
rollback;
select 'passed; wide board changes rolled back' as smoke;
