create table public.gm_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  account_name text not null,
  display_name text not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'revoked')),
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  review_note text not null default ''
);

-- Existing accounts also require review; never promote public registrations.
insert into public.gm_access(user_id, account_name, display_name)
select id, coalesce(email, id::text), display_name
from auth.users where not is_anonymous;

create function public.is_approved_gm(target_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1 from public.gm_access g join auth.users u on u.id = g.user_id
    where g.user_id = target_user and g.status = 'approved'
      and not u.is_anonymous and not u.disabled
  );
$$;

create function public.request_gm_access(hasura_session json)
returns public.gm_access
language plpgsql
volatile
security definer
set search_path = public, auth
as $$
declare
  actor uuid := public.session_user_id(hasura_session);
  result public.gm_access;
begin
  if coalesce(hasura_session->>'x-hasura-role', '') <> 'user' or not exists (
    select 1 from auth.users where id = actor and not is_anonymous and not disabled
  ) then raise exception 'GM_ACCOUNT_REQUIRED'; end if;
  insert into public.gm_access(user_id, account_name, display_name)
    select id, coalesce(email, id::text), display_name from auth.users where id = actor
    on conflict (user_id) do nothing;
  select * into result from public.gm_access where user_id = actor;
  return result;
end;
$$;

create function public.stamp_gm_review()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status then new.reviewed_at := now(); end if;
  return new;
end;
$$;
create trigger gm_review_timestamp before update on public.gm_access
for each row execute function public.stamp_gm_review();

-- Every GM RPC uses this helper, so revocation applies to existing campaigns too.
create or replace function public.has_campaign_role(target_campaign uuid, target_user uuid, target_role public.member_role)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.campaign_members
    where campaign_id = target_campaign and user_id = target_user
      and role = target_role and active
      and (target_role <> 'gm' or public.is_approved_gm(target_user))
  );
$$;

create or replace function public.create_campaign(
  p_name text,
  p_character_name text,
  p_job_title text,
  hasura_session json
)
returns public.campaigns
language plpgsql
volatile
security definer
set search_path = public, auth
as $$
declare
  actor uuid := public.session_user_id(hasura_session);
  result public.campaigns;
  code text;
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if coalesce(hasura_session ->> 'x-hasura-role', '') <> 'user' then
    raise exception 'GM_ACCOUNT_REQUIRED';
  end if;
  if not public.is_approved_gm(actor) then raise exception 'GM_APPROVAL_REQUIRED'; end if;
  if trim(p_job_title) <> '店长' then raise exception 'GM_JOB_TITLE_REQUIRED'; end if;
  loop
    code := upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 6));
    exit when not exists (select 1 from public.campaigns where join_code = code);
  end loop;
  insert into public.campaigns(name, join_code, created_by)
  values (trim(p_name), code, actor) returning * into result;
  insert into public.campaign_members(campaign_id, user_id, role, character_name, job_title)
  values (result.id, actor, 'gm', trim(p_character_name), '店长');
  -- New campaigns begin with blank sheets; GM fills them during setup.
  insert into public.event_log(campaign_id, actor_id, event_type, entity_type, entity_id, payload)
  values (
    result.id,
    actor,
    'campaign_created',
    'campaign',
    result.id,
    jsonb_build_object('job_title', '店长')
  );
  return result;
end;
$$;


revoke all on function public.create_campaign(text, text, text, json) from public;

revoke all on function public.request_gm_access(json) from public;
revoke all on function public.is_approved_gm(uuid) from public;
revoke all on function public.stamp_gm_review() from public;
