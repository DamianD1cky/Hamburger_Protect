-- Unified accounts: everyone signs in with a username + password account.
-- Identity kind no longer decides what an account may do:
--   * any signed-in account can act as an employee (join campaigns, visit
--     public rooms, leave visitor messages);
--   * being a GM is a capability granted by an approved gm_access row,
--     not an account type.
-- Existing profiles keep their legacy 'gm'/'player' kind values; all checks
-- below simply stop reading the column. Legacy anonymous player sessions
-- keep working through the same functions.

alter table public.profiles
  drop constraint if exists profiles_account_kind_check;
alter table public.profiles
  add constraint profiles_account_kind_check
  check (account_kind in ('gm', 'player', 'member'));

create or replace function private.current_actor_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.profiles
  where auth_user_id = auth.uid() and not disabled
$$;

create or replace function private.has_role(target uuid, wanted public.member_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists(
    select 1 from public.campaign_members m
    join public.profiles p on p.id = m.user_id
    where m.campaign_id = target
      and m.user_id = private.current_actor_id()
      and m.active
      and m.role = wanted
      and (wanted <> 'gm' or exists(
        select 1 from public.gm_access g
        where g.user_id = p.id and g.status = 'approved'
      ))
  )
$$;

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

create or replace function public.request_gm_access()
returns public.gm_access
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := private.require_actor();
  result public.gm_access;
begin
  insert into public.gm_access(user_id, account_name, display_name)
  select p.id, coalesce(u.email, p.id::text), p.display_name
  from public.profiles p
  join auth.users u on u.id = p.auth_user_id
  where p.id = actor
  on conflict(user_id) do nothing;
  select * into result from public.gm_access where user_id = actor;
  return result;
end;
$$;

-- Read-only GM status: reading it must not create an application.
create function public.get_gm_access()
returns public.gm_access
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := private.require_actor();
  result public.gm_access;
begin
  select * into result from public.gm_access where user_id = actor;
  return result;
end;
$$;

create or replace function public.create_campaign(
  p_name text, p_character_name text, p_job_title text
)
returns public.campaigns
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := private.require_actor();
  result public.campaigns;
  code text;
begin
  perform private.require_writes();
  if not exists(
    select 1 from public.gm_access g
    where g.user_id = actor and g.status = 'approved'
  ) then raise exception 'GM_APPROVAL_REQUIRED'; end if;
  if p_job_title is distinct from '店长' then
    raise exception 'GM_JOB_TITLE_REQUIRED';
  end if;
  loop
    code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    exit when not exists(
      select 1 from public.campaigns where join_code = code
    );
  end loop;
  insert into public.campaigns(name, join_code, created_by)
  values (trim(p_name), code, actor) returning * into result;
  insert into public.campaign_members(campaign_id, user_id, role, character_name, job_title)
  values (result.id, actor, 'gm', trim(p_character_name), '店长');
  insert into public.event_log(campaign_id, actor_id, event_type, entity_type, entity_id, payload)
  values (result.id, actor, 'campaign_created', 'campaign', result.id, '{}');
  return result;
end;
$$;

create or replace function public.request_campaign_join(
  p_join_code text,
  p_character_name text,
  p_job_title text,
  p_profile_text text default ''
)
returns public.campaign_join_requests
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor uuid := private.require_actor();
  target public.campaigns;
  result public.campaign_join_requests;
  normalized_name text := trim(p_character_name);
  normalized_job text := trim(p_job_title);
  normalized_profile text := trim(coalesce(p_profile_text, ''));
begin
  perform private.require_writes();
  -- Serialize requests and reviews for this account, including other tabs.
  perform 1 from public.profiles where id = actor and not disabled for update;
  if not found then raise exception 'IDENTITY_REQUIRED'; end if;
  if normalized_name is null or char_length(normalized_name) not between 1 and 40 then
    raise exception 'INVALID_CHARACTER_NAME';
  end if;
  if normalized_job is null or char_length(normalized_job) not between 1 and 40 then
    raise exception 'INVALID_JOB_TITLE';
  end if;
  if char_length(normalized_profile) > 2000 then
    raise exception 'INVALID_PROFILE_TEXT';
  end if;
  select * into target from public.campaigns
  where join_code = upper(trim(p_join_code)) and status = 'active' for update;
  if target.id is null then raise exception 'CAMPAIGN_NOT_FOUND'; end if;
  if exists (
    select 1 from public.campaign_members
    where user_id = actor and active and role = 'player' and campaign_id <> target.id
  ) then raise exception 'ONE_ACTIVE_CAMPAIGN_PER_PLAYER'; end if;
  select * into result from public.campaign_join_requests
  where campaign_id = target.id and user_id = actor for update;
  if result.id is not null and result.status <> 'cancelled' then return result; end if;
  if exists (
    select 1 from public.campaign_members
    where user_id = actor and active and role = 'player'
  ) then raise exception 'ONE_ACTIVE_CAMPAIGN_PER_PLAYER'; end if;
  if exists (
    select 1 from public.campaign_join_requests
    where user_id = actor and status = 'pending'
  ) then raise exception 'JOIN_REQUEST_PENDING'; end if;
  insert into public.campaign_join_requests(
    campaign_id, user_id, campaign_name, character_name, job_title, profile_text
  ) values (
    target.id, actor, target.name, normalized_name, normalized_job, normalized_profile
  )
  on conflict (campaign_id, user_id) do update set
    status = 'pending',
    character_name = excluded.character_name,
    job_title = excluded.job_title,
    profile_text = excluded.profile_text,
    campaign_name = excluded.campaign_name,
    requested_at = now(),
    reviewed_at = null,
    reviewed_by = null,
    review_note = ''
  where campaign_join_requests.status = 'cancelled'
  returning * into result;
  insert into public.event_log(
    campaign_id, actor_id, event_type, entity_type, entity_id, payload
  ) values (
    target.id, actor, 'join_requested', 'join_request', result.id,
    jsonb_build_object(
      'actor_name', normalized_name,
      'character_name', normalized_name,
      'job_title', normalized_job
    )
  );
  return result;
end;
$$;

create or replace function public.review_campaign_join(
  p_request_id uuid, p_approved boolean, p_note text
)
returns public.campaign_join_requests
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor uuid := private.require_actor();
  result public.campaign_join_requests;
  target public.campaigns;
  next_status text := case when p_approved then 'approved' else 'rejected' end;
begin
  perform private.require_writes();
  select * into result from public.campaign_join_requests where id = p_request_id;
  if result.id is null then raise exception 'JOIN_REQUEST_NOT_FOUND'; end if;
  -- Same lock order as request/cancel: applicant -> campaign -> request.
  perform 1 from public.profiles
  where id = result.user_id and not disabled for update;
  if not found then raise exception 'IDENTITY_REQUIRED'; end if;
  select * into target from public.campaigns where id = result.campaign_id for update;
  if not private.has_role(target.id, 'gm') then raise exception 'GM_REQUIRED'; end if;
  if target.status <> 'active' then raise exception 'CAMPAIGN_NOT_ACTIVE'; end if;
  select * into result from public.campaign_join_requests
  where id = p_request_id for update;
  if result.status = next_status then return result; end if;
  if result.status <> 'pending' then raise exception 'JOIN_REQUEST_ALREADY_REVIEWED'; end if;
  if p_approved is null or char_length(coalesce(p_note, '')) > 200 then
    raise exception 'INVALID_REVIEW';
  end if;
  if p_approved then
    if exists (
      select 1 from public.campaign_members
      where user_id = result.user_id and active and role = 'player'
    ) then raise exception 'ONE_ACTIVE_CAMPAIGN_PER_PLAYER'; end if;
    insert into public.campaign_members(
      campaign_id, user_id, role, character_name, job_title, profile_text
    ) values (
      result.campaign_id, result.user_id, 'player', result.character_name,
      result.job_title, result.profile_text
    )
    on conflict (campaign_id, user_id) do update set
      role = 'player',
      character_name = excluded.character_name,
      job_title = excluded.job_title,
      profile_text = excluded.profile_text,
      active = true,
      joined_at = now(),
      left_at = null;
  end if;
  update public.campaign_join_requests set
    status = next_status,
    reviewed_at = now(),
    reviewed_by = actor,
    review_note = trim(coalesce(p_note, ''))
  where id = result.id returning * into result;
  insert into public.event_log(
    campaign_id, actor_id, event_type, entity_type, entity_id, payload
  ) values (
    result.campaign_id, actor,
    case when p_approved then 'join_approved' else 'join_rejected' end,
    'join_request', result.id,
    jsonb_build_object(
      'character_name', result.character_name,
      'job_title', result.job_title
    )
  );
  return result;
end;
$$;

create or replace function public.cancel_campaign_join(p_request_id uuid)
returns public.campaign_join_requests
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor uuid := private.require_actor();
  result public.campaign_join_requests;
begin
  perform private.require_writes();
  perform 1 from public.profiles where id = actor and not disabled for update;
  if not found then raise exception 'IDENTITY_REQUIRED'; end if;
  select * into result from public.campaign_join_requests where id = p_request_id and user_id = actor;
  if result.id is null then raise exception 'JOIN_REQUEST_NOT_FOUND'; end if;
  perform 1 from public.campaigns where id = result.campaign_id for update;
  select * into result from public.campaign_join_requests where id = p_request_id for update;
  if result.status = 'cancelled' then return result; end if;
  if result.status <> 'pending' then raise exception 'JOIN_REQUEST_ALREADY_REVIEWED'; end if;
  update public.campaign_join_requests set status = 'cancelled', reviewed_at = now(), review_note = '申请者已撤回'
    where id = result.id returning * into result;
  insert into public.event_log(campaign_id, actor_id, event_type, entity_type, entity_id, payload)
    values (result.campaign_id, actor, 'join_cancelled', 'join_request', result.id,
      jsonb_build_object('actor_name', result.character_name, 'character_name', result.character_name));
  return result;
end;
$$;

drop policy if exists read_gm_access on public.gm_access;
create policy read_gm_access on public.gm_access
  for select to authenticated
  using (private.current_actor_id() is not null and user_id = private.current_actor_id());

revoke all on function public.get_gm_access() from public, anon, authenticated;
grant execute on function public.get_gm_access() to authenticated;
