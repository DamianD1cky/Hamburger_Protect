-- 使用当前具备写权限的成员验收。新增便签、贴纸与日志全部回滚。
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
  join auth.users a on a.id = p.auth_user_id
  where m.active and c.status = 'active' and not p.disabled
    and not coalesce(a.is_anonymous, false)
    and (a.banned_until is null or a.banned_until < now())
    and (
      m.role = 'player'
      or (m.role = 'gm' and exists (
        select 1 from public.gm_access g
        where g.user_id = p.id and g.status = 'approved'
      ))
    )
  limit 1;
  if room is null then raise exception 'NO_WRITABLE_MEMBER_FOR_SMOKE'; end if;
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
  first_note uuid;
  second_note uuid;
  sticker jsonb;
  moved jsonb;
  first_layer integer;
  second_layer integer;
begin
  first_note := public.save_note(room, '事务验收一', '临时正文', 'yellow', 100, 100, 0, null, null, 'blue');
  second_note := public.save_note(room, '事务验收二', '临时正文', 'yellow', 100, 100, 0, null, null, 'red');
  if (select pin_color from public.notes where id = first_note) <> 'blue' then
    raise exception 'PIN_CREATE_FAILED';
  end if;

  perform public.save_note(room, '事务验收编辑', '新正文', 'green', 100, 100, 0, first_note, null, 'yellow');
  if not exists (
    select 1 from public.notes
    where id = first_note and title = '事务验收编辑' and color = 'green' and pin_color = 'yellow'
  ) then raise exception 'ATOMIC_SAVE_FAILED'; end if;

  perform public.save_note(room, '旧客户端编辑', '正文', 'green', 100, 100, 0, first_note, null);
  if (select pin_color from public.notes where id = first_note) <> 'yellow' then
    raise exception 'OLD_CLIENT_PIN_RESET';
  end if;

  select layer into first_layer from public.notes where id = first_note;
  select layer into second_layer from public.notes where id = second_note;
  if first_layer = second_layer then raise exception 'DUPLICATE_LAYERS'; end if;
  perform public.move_note_layer(room, first_note, 1);
  if (select layer from public.notes where id = first_note) <> second_layer then
    raise exception 'LAYER_SWAP_FAILED';
  end if;

  sticker := public.create_board_sticker(room, '⭐', 300, 400, 0);
  moved := public.move_board_sticker(room, (sticker->>'id')::uuid, 360, 450);
  if (moved->>'x')::integer <> 360 or (moved->>'y')::integer <> 450 then
    raise exception 'STICKER_MOVE_FAILED';
  end if;
  perform public.delete_board_sticker(room, (sticker->>'id')::uuid);
  if exists (select 1 from public.board_stickers where id = (sticker->>'id')::uuid) then
    raise exception 'STICKER_DELETE_FAILED';
  end if;
end;
$smoke$;

rollback;
select 'passed; test data rolled back' as smoke;
