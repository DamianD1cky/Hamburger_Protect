-- Identity eligibility is independent of campaign roles. Check Auth bans and
-- retired anonymous identities even with an otherwise unexpired access token.
create or replace function private.current_actor_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select p.id
  from public.profiles p
  join auth.users u on u.id = p.auth_user_id
  where p.auth_user_id = auth.uid()
    and not p.disabled
    and not coalesce(u.is_anonymous, false)
    and not coalesce((auth.jwt()->>'is_anonymous')::boolean, false)
    and (u.banned_until is null or u.banned_until <= now())
$$;

create or replace function public.ensure_actor()
returns public.profiles language plpgsql security definer set search_path = '' as $$
declare
  result public.profiles;
  uid uuid := auth.uid();
  nickname text;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if coalesce((auth.jwt()->>'is_anonymous')::boolean, false) or exists(
    select 1 from auth.users where id = uid and is_anonymous
  ) then raise exception 'ANONYMOUS_IDENTITY_DISABLED'; end if;
  if not exists(select 1 from auth.users where id = uid
    and (banned_until is null or banned_until <= now())) then
    raise exception 'ACCOUNT_DISABLED';
  end if;
  select * into result from public.profiles where auth_user_id = uid;
  if result.id is null then
    perform private.require_writes();
    select btrim(coalesce(raw_user_meta_data->>'displayName', ''))
      into nickname from auth.users where id = uid;
    if nickname = '' then nickname := '员工'; end if;
    if char_length(nickname) > 32 then raise exception 'INVALID_DISPLAY_NAME'; end if;
    insert into public.profiles(auth_user_id, account_kind, display_name)
      values(uid, 'member', nickname)
      on conflict(auth_user_id) do nothing;
    select * into result from public.profiles where auth_user_id = uid;
  end if;
  if private.current_actor_id() is null then raise exception 'ACCOUNT_DISABLED'; end if;
  return result;
end;
$$;

-- Only the actor's own display name can be changed; Auth ownership, disabled
-- status, GM approval and per-campaign character names are never caller inputs.
create function public.update_account_profile(p_display_name text)
returns public.profiles language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := private.require_actor();
  nickname text := btrim(p_display_name);
  result public.profiles;
begin
  perform private.require_writes();
  if nickname is null or char_length(nickname) not between 1 and 32 then
    raise exception 'INVALID_DISPLAY_NAME';
  end if;
  update public.profiles set display_name = nickname where id = actor
    returning * into result;
  update public.gm_access set display_name = nickname where user_id = actor;
  return result;
end;
$$;
revoke all on function public.update_account_profile(text) from public, anon, authenticated;
grant execute on function public.update_account_profile(text) to authenticated;
