begin;
set local statement_timeout='20s';
select set_config('request.jwt.claim.sub',u.id::text,true),
       set_config('request.jwt.claims',jsonb_build_object('sub',u.id,'is_anonymous',false)::text,true)
from public.campaign_members m
join public.gm_access g on g.user_id=m.user_id and g.status='approved'
join public.profiles p on p.id=m.user_id and not p.disabled
join auth.users u on u.id=p.auth_user_id and not u.is_anonymous
join public.campaigns c on c.id=m.campaign_id and c.status='active'
where m.active and m.role='gm' and (u.banned_until is null or u.banned_until<=now())
limit 1;
set local role authenticated;
do $$
declare
  room uuid; id uuid:=gen_random_uuid(); receipt jsonb; state jsonb;
begin
  select campaign_id into room from public.campaign_members where user_id=private.current_actor_id() and active and role='gm' limit 1;
  if room is null then raise exception 'NO_ACTIVE_GM_FOR_SMOKE'; end if;
  receipt:=public.begin_dice_roll(room,id,'1d20','smoke','blind',null,null);
  if receipt ? 'result' then
    -- GM is authorized to see blind dice, pending result is null.
    if receipt->'result' <> 'null'::jsonb then raise exception 'INVALID_PENDING_RESULT'; end if;
  end if;
  begin
    perform public.finish_dice_roll(id,'{"total":12,"dice":[]}'::jsonb);
    raise exception 'CLIENT_COULD_WRITE_RESULT';
  exception when insufficient_privilege then null; end;
  state:=public.get_dice_state(room);
  if jsonb_typeof(state->'rolls') <> 'array' then raise exception 'STATE_QUERY_FAILED'; end if;
end;
$$;
reset role;
rollback;
select 'passed; dice changes rolled back' as smoke;
