-- Anonymous identities are retired. Everyone plays with a registered
-- username + password account, starting fresh:
--   * profiles linked to anonymous auth users are disabled, so any live
--     anonymous session immediately loses every permission;
--   * their active campaign seats are released and pending join requests
--     cancelled, so a new account can be approved into the room;
--   * ensure_actor refuses to create profiles for anonymous sessions.
-- Campaign content they produced (notes, reports, work log entries) stays
-- in place as history; it is not carried into any new account.

update public.campaign_members m
set active = false, left_at = now()
from public.profiles p
join auth.users u on u.id = p.auth_user_id
where m.user_id = p.id and m.active and u.is_anonymous;

update public.campaign_join_requests r
set status = 'cancelled', reviewed_at = now(),
    review_note = '匿名身份已停用，请注册账号后重新申请'
from public.profiles p
join auth.users u on u.id = p.auth_user_id
where r.user_id = p.id and r.status = 'pending' and u.is_anonymous;

update public.profiles p
set disabled = true
from auth.users u
where u.id = p.auth_user_id and u.is_anonymous and not p.disabled;

create or replace function public.ensure_actor()
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.profiles;
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'ANONYMOUS_IDENTITY_DISABLED';
  end if;
  if not exists(select 1 from public.profiles where auth_user_id = uid) then
    perform private.require_writes();
  end if;
  insert into public.profiles(auth_user_id, account_kind, display_name)
  select uid, 'member', coalesce(u.raw_user_meta_data ->> 'displayName', '')
  from auth.users u where u.id = uid
  on conflict(auth_user_id) do nothing;
  select * into result from public.profiles where auth_user_id = uid;
  if private.current_actor_id() is null then
    raise exception 'ACCOUNT_DISABLED';
  end if;
  return result;
end;
$$;
