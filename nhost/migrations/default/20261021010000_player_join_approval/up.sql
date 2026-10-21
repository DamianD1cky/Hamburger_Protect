create table public.campaign_join_requests (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_name text not null,
  character_name text not null check (char_length(character_name) between 1 and 40),
  job_title text not null check (job_title in ('厨师', '维修师', '服务员', '顾客')),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  review_note text not null default '' check (char_length(review_note) <= 200),
  unique (campaign_id, user_id)
);
create unique index one_pending_join_request_per_player
  on public.campaign_join_requests(user_id) where status = 'pending';
create index campaign_join_inbox on public.campaign_join_requests(campaign_id, status, requested_at, id);

create function public.request_campaign_join(
  p_join_code text,
  p_character_name text,
  p_job_title text,
  hasura_session json
)
returns public.campaign_join_requests
language plpgsql
volatile
security definer
set search_path = public, auth
as $$
declare
  actor uuid := public.session_user_id(hasura_session);
  target public.campaigns;
  result public.campaign_join_requests;
  normalized_name text := trim(p_character_name);
  normalized_job text := trim(p_job_title);
begin
  -- Serialize requests and reviews for this player, including concurrent tabs.
  perform 1 from auth.users where id = actor and is_anonymous and not disabled for update;
  if not found or coalesce(hasura_session->>'x-hasura-role', '') <> 'anonymous' then
    raise exception 'PLAYER_ACCOUNT_REQUIRED';
  end if;
  if normalized_name is null or char_length(normalized_name) not between 1 and 40 then
    raise exception 'INVALID_CHARACTER_NAME';
  end if;
  if normalized_job is null or normalized_job not in ('厨师', '维修师', '服务员', '顾客') then
    raise exception 'INVALID_JOB_TITLE';
  end if;
  select * into target from public.campaigns
    where join_code = upper(trim(p_join_code)) and status = 'active' for update;
  if target.id is null then raise exception 'CAMPAIGN_NOT_FOUND'; end if;
  if exists (select 1 from public.campaign_members
    where user_id = actor and active and role = 'player' and campaign_id <> target.id) then
    raise exception 'ONE_ACTIVE_CAMPAIGN_PER_PLAYER';
  end if;
  select * into result from public.campaign_join_requests
    where campaign_id = target.id and user_id = actor for update;
  if result.id is not null and result.status <> 'cancelled' then
    return result; -- A repeat request never resets an approval or rejection.
  end if;
  if exists (select 1 from public.campaign_members where user_id = actor and active and role = 'player') then
    raise exception 'ONE_ACTIVE_CAMPAIGN_PER_PLAYER';
  end if;
  if exists (select 1 from public.campaign_join_requests where user_id = actor and status = 'pending') then
    raise exception 'JOIN_REQUEST_PENDING';
  end if;
  insert into public.campaign_join_requests(campaign_id, user_id, campaign_name, character_name, job_title)
    values (target.id, actor, target.name, normalized_name, normalized_job)
    on conflict (campaign_id, user_id) do update
      set status = 'pending', character_name = excluded.character_name, job_title = excluded.job_title,
        campaign_name = excluded.campaign_name, requested_at = now(), reviewed_at = null,
        reviewed_by = null, review_note = ''
      where campaign_join_requests.status = 'cancelled'
    returning * into result;
  insert into public.event_log(campaign_id, actor_id, event_type, entity_type, entity_id, payload)
    values (target.id, actor, 'join_requested', 'join_request', result.id,
      jsonb_build_object('actor_name', normalized_name, 'character_name', normalized_name, 'job_title', normalized_job));
  return result;
end;
$$;

-- Keep the old API shape for existing clients, but it now only creates a request.
create or replace function public.join_campaign(
  p_join_code text, p_character_name text, p_job_title text, hasura_session json
)
returns public.campaign_members
language plpgsql
volatile
security definer
set search_path = public, auth
as $$
begin
  perform public.request_campaign_join(p_join_code, p_character_name, p_job_title, hasura_session);
  return null;
end;
$$;

create function public.review_campaign_join(
  p_request_id uuid, p_approved boolean, p_note text, hasura_session json
)
returns public.campaign_join_requests
language plpgsql
volatile
security definer
set search_path = public, auth
as $$
declare
  actor uuid := public.session_user_id(hasura_session);
  result public.campaign_join_requests;
  target public.campaigns;
  next_status text := case when p_approved then 'approved' else 'rejected' end;
begin
  if coalesce(hasura_session->>'x-hasura-role', '') <> 'user' then raise exception 'GM_REQUIRED'; end if;
  select * into result from public.campaign_join_requests where id = p_request_id;
  if result.id is null then raise exception 'JOIN_REQUEST_NOT_FOUND'; end if;
  -- Same lock order as request/cancel: player -> campaign -> request.
  perform 1 from auth.users where id = result.user_id and is_anonymous and not disabled for update;
  if not found then raise exception 'PLAYER_ACCOUNT_REQUIRED'; end if;
  select * into target from public.campaigns where id = result.campaign_id for update;
  if not public.has_campaign_role(target.id, actor, 'gm') then raise exception 'GM_REQUIRED'; end if;
  if target.status <> 'active' then raise exception 'CAMPAIGN_NOT_ACTIVE'; end if;
  select * into result from public.campaign_join_requests where id = p_request_id for update;
  if result.status = next_status then return result; end if;
  if result.status <> 'pending' then raise exception 'JOIN_REQUEST_ALREADY_REVIEWED'; end if;
  if p_approved is null or char_length(coalesce(p_note, '')) > 200 then raise exception 'INVALID_REVIEW'; end if;
  if p_approved then
    if exists (select 1 from public.campaign_members where user_id = result.user_id and active and role = 'player') then
      raise exception 'ONE_ACTIVE_CAMPAIGN_PER_PLAYER';
    end if;
    insert into public.campaign_members(campaign_id, user_id, role, character_name, job_title)
      values (result.campaign_id, result.user_id, 'player', result.character_name, result.job_title);
  end if;
  update public.campaign_join_requests set status = next_status, reviewed_at = now(), reviewed_by = actor,
    review_note = trim(coalesce(p_note, '')) where id = result.id returning * into result;
  insert into public.event_log(campaign_id, actor_id, event_type, entity_type, entity_id, payload)
    values (result.campaign_id, actor, case when p_approved then 'join_approved' else 'join_rejected' end,
      'join_request', result.id, jsonb_build_object('character_name', result.character_name, 'job_title', result.job_title));
  return result;
end;
$$;

create function public.cancel_campaign_join(p_request_id uuid, hasura_session json)
returns public.campaign_join_requests
language plpgsql
volatile
security definer
set search_path = public, auth
as $$
declare
  actor uuid := public.session_user_id(hasura_session);
  result public.campaign_join_requests;
begin
  perform 1 from auth.users where id = actor and is_anonymous and not disabled for update;
  if not found or coalesce(hasura_session->>'x-hasura-role', '') <> 'anonymous' then raise exception 'PLAYER_ACCOUNT_REQUIRED'; end if;
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

create function public.close_campaign_join_requests()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if new.status = 'archived' and old.status <> 'archived' then
    update public.campaign_join_requests set status = 'cancelled', reviewed_at = now(), review_note = '班次已结束'
      where campaign_id = new.id and status = 'pending';
  end if;
  return null;
end;
$$;
create trigger close_join_requests after update of status on public.campaigns
for each row execute function public.close_campaign_join_requests();

revoke all on function public.request_campaign_join(text, text, text, json) from public;
revoke all on function public.review_campaign_join(uuid, boolean, text, json) from public;
revoke all on function public.cancel_campaign_join(uuid, json) from public;
revoke all on function public.close_campaign_join_requests() from public;
