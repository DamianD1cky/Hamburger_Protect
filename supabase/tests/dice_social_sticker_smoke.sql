begin;
set local statement_timeout='20s';
do $identity$
declare identity uuid;
begin
  select p.auth_user_id into identity from public.profiles p
    join public.gm_access g on g.user_id=p.id and g.status='approved'
    join auth.users a on a.id=p.auth_user_id
    where not p.disabled and not a.is_anonymous and (a.banned_until is null or a.banned_until<now()) limit 1;
  if identity is null then raise exception 'NO_ACTIVE_GM_FOR_SMOKE'; end if;
  perform set_config('request.jwt.claim.sub',identity::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',identity,'is_anonymous',false)::text,true);
end;
$identity$;
set local role authenticated;
do $smoke$
declare room uuid; sticker jsonb; enlarged jsonb; social jsonb;
begin
  select id into room from public.create_campaign('表情与缩放事务验收','验收','店长');
  perform public.send_dice_reaction(room,'👏');
  social:=public.get_dice_social(room);
  if jsonb_array_length(social->'reactions')<>1
    or social->'reactions'->0->>'actor_id'<>private.current_actor_id()::text
    or social->'reactions'->0->>'emoji'<>'👏' then raise exception 'REACTION_SYNC_FAILED'; end if;
  begin
    perform public.send_dice_reaction(room,'🍀');
    raise exception 'RATE_LIMIT_NOT_ENFORCED';
  exception when raise_exception then
    if sqlerrm<>'DICE_REACTION_RATE_LIMIT' then raise; end if;
  end;
  sticker:=public.create_board_sticker(room,'⭐',2072,1134,0);
  enlarged:=public.resize_board_sticker(room,(sticker->>'id')::uuid,2.5);
  if (enlarged->>'scale')::numeric<>2.5 or (enlarged->>'x')::integer<>1964
    or (enlarged->>'y')::integer<>1026 then raise exception 'STICKER_SCALE_FAILED'; end if;
  if jsonb_array_length(public.get_board_stickers(room))<>1 then raise exception 'STICKER_READ_FAILED'; end if;
end;
$smoke$;
reset role;
rollback;
select 'passed; reaction, campaign and sticker data rolled back' as smoke;
