-- Site authority is independent of a campaign's GM capability. No account
-- gains it from an email, display name or user-editable Auth metadata.
create table private.site_admins (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  active boolean not null default true,
  granted_at timestamptz not null default now()
);
alter table private.site_admins enable row level security;
revoke all on private.site_admins from public,anon,authenticated;
grant all on private.site_admins to service_role;

create table private.gm_access_reviews (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id),
  reviewer_id uuid not null references public.profiles(id),
  previous_status text not null,
  status text not null check (status in ('approved','rejected')),
  note text not null check (char_length(note)<=500),
  reviewed_at timestamptz not null
);
create index gm_access_reviews_user_latest on private.gm_access_reviews(user_id,id desc);
alter table private.gm_access_reviews enable row level security;
revoke all on private.gm_access_reviews from public,anon,authenticated;
grant all on private.gm_access_reviews to service_role;
grant usage,select on sequence private.gm_access_reviews_id_seq to service_role;

create function private.is_site_admin() returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from private.site_admins
    where user_id=private.current_actor_id() and active)
$$;
revoke all on function private.is_site_admin() from public,anon,authenticated;

create function public.get_site_admin_access() returns boolean
language sql stable security definer set search_path='' as $$
  select private.is_site_admin()
$$;
revoke all on function public.get_site_admin_access() from public,anon,authenticated;
grant execute on function public.get_site_admin_access() to authenticated;

create function public.list_gm_applications(
  p_view text default 'pending',
  p_before timestamptz default null,
  p_before_user_id uuid default null
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if not private.is_site_admin() then raise exception 'SITE_ADMIN_REQUIRED'; end if;
  if p_view is null or p_view not in ('pending','reviewed')
    or ((p_before is null)<>(p_before_user_id is null))
    then raise exception 'INVALID_GM_REVIEW_QUERY'; end if;
  with page as (
    select g.*,p.disabled or coalesce(u.is_anonymous,true)
      or (u.banned_until is not null and u.banned_until>now()) as unavailable,
      reviewer.display_name as reviewer_name
    from public.gm_access g
    join public.profiles p on p.id=g.user_id
    left join auth.users u on u.id=p.auth_user_id
    left join lateral (
      select reviewer_id from private.gm_access_reviews
      where user_id=g.user_id order by id desc limit 1
    ) audit on true
    left join public.profiles reviewer on reviewer.id=audit.reviewer_id
    where (case when p_view='pending' then g.status='pending' else g.status<>'pending' end)
      and (p_before is null or (g.requested_at,g.user_id)<(p_before,p_before_user_id))
    order by g.requested_at desc,g.user_id desc limit 31
  ), visible as (select * from page order by requested_at desc,user_id desc limit 30)
  select jsonb_build_object(
    'applications',coalesce((select jsonb_agg(jsonb_build_object(
      'user_id',user_id,'account_name',account_name,'display_name',display_name,
      'status',status,'requested_at',requested_at,'reviewed_at',reviewed_at,
      'review_note',review_note,'unavailable',unavailable,'reviewer_name',reviewer_name
    ) order by requested_at desc,user_id desc) from visible),'[]'::jsonb),
    'has_more',(select count(*)>30 from page)
  ) into result;
  return result;
end;
$$;
revoke all on function public.list_gm_applications(text,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.list_gm_applications(text,timestamptz,uuid) to authenticated;

create function public.review_gm_application(
  p_user_id uuid,p_approved boolean,p_note text,p_expected_requested_at timestamptz
) returns public.gm_access language plpgsql security definer set search_path='' as $$
declare
  reviewer uuid:=private.current_actor_id();
  current public.gm_access;
  result public.gm_access;
  unavailable boolean;
begin
  -- Lock the grant as well as the request: revocation cannot race a review.
  perform 1 from private.site_admins where user_id=reviewer and active for share;
  if not found then raise exception 'SITE_ADMIN_REQUIRED'; end if;
  perform private.require_writes();
  if p_user_id is null or p_approved is null or p_note is null
    or char_length(btrim(p_note))>500 or p_expected_requested_at is null
    then raise exception 'INVALID_GM_REVIEW'; end if;
  select * into current from public.gm_access where user_id=p_user_id for update;
  if not found then raise exception 'GM_APPLICATION_NOT_FOUND'; end if;
  if current.status<>'pending' or current.requested_at is distinct from p_expected_requested_at
    then raise exception 'GM_APPLICATION_ALREADY_REVIEWED'; end if;
  select p.disabled or coalesce(u.is_anonymous,true)
    or (u.banned_until is not null and u.banned_until>now()) into unavailable
    from public.profiles p left join auth.users u on u.id=p.auth_user_id where p.id=p_user_id;
  if p_approved and coalesce(unavailable,true) then raise exception 'GM_APPLICANT_UNAVAILABLE'; end if;
  update public.gm_access set status=case when p_approved then 'approved' else 'rejected' end,
    review_note=btrim(p_note) where user_id=p_user_id returning * into result;
  insert into private.gm_access_reviews(user_id,reviewer_id,previous_status,status,note,reviewed_at)
    values(p_user_id,reviewer,current.status,result.status,result.review_note,result.reviewed_at);
  return result;
end;
$$;
revoke all on function public.review_gm_application(uuid,boolean,text,timestamptz) from public,anon,authenticated;
grant execute on function public.review_gm_application(uuid,boolean,text,timestamptz) to authenticated;

-- Bootstrap private.site_admins through the trusted SQL console only.
-- Never auto-promote the first signup or an account with a special username.
