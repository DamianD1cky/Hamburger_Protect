create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;
create table public.profiles (
 id uuid primary key default gen_random_uuid(),
 auth_user_id uuid unique references auth.users(id) on delete set null,
 account_kind text not null check (account_kind in ('gm','player')),
 display_name text not null default '',
 disabled boolean not null default false,
 created_at timestamptz not null default now()
);
create table private.runtime (
 singleton boolean primary key default true check(singleton),
 business_writes boolean not null default false,
 migration_until timestamptz
);
insert into private.runtime(singleton) values(true);
create table private.identity_migrations (
 actor_id uuid primary key references public.profiles(id),
 auth_user_id uuid unique not null,
 migrated_at timestamptz not null default now()
);
create type public.campaign_status as enum ('active', 'archived');
create type public.member_role as enum ('gm', 'player', 'observer');
create type public.quest_status as enum ('open', 'claimed', 'in_progress', 'pending_review', 'completed', 'failed');
create type public.resource_status as enum ('ok', 'low', 'out');
create type public.note_color as enum ('yellow', 'pink', 'blue', 'green');

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  join_code text not null unique check (join_code ~ '^[A-Z0-9]{6}$'),
  status public.campaign_status not null default 'active',
  created_by uuid not null references public.profiles(id),
  started_at timestamptz not null default now(),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'active' and archived_at is null) or status = 'archived')
);

create table public.campaign_members (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.member_role not null,
  character_name text not null check (char_length(character_name) between 1 and 40),
  active boolean not null default true,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (campaign_id, user_id),
  check ((active and left_at is null) or not active)
);

create unique index one_active_campaign_per_player
  on public.campaign_members(user_id)
  where active and role = 'player';

create table public.quests (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  body text not null default '' check (char_length(body) <= 1000),
  status public.quest_status not null default 'open',
  created_by uuid not null references public.profiles(id),
  claimed_by uuid references public.profiles(id),
  assignee_label text not null default '待认领',
  due_at timestamptz,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.quest_submissions (
  id uuid primary key default gen_random_uuid(),
  quest_id uuid not null references public.quests(id) on delete cascade,
  submitted_by uuid not null references public.profiles(id),
  message text not null default '' check (char_length(message) <= 1000),
  reviewed_by uuid references public.profiles(id),
  approved boolean,
  review_message text check (char_length(review_message) <= 1000),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create unique index one_pending_submission_per_quest
  on public.quest_submissions(quest_id)
  where reviewed_at is null;

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  title text not null check (char_length(title) between 1 and 80),
  body text not null default '' check (char_length(body) <= 1000),
  color public.note_color not null default 'yellow',
  x integer not null default 0,
  y integer not null default 0,
  rotation numeric(5, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.resources (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  quantity text not null default '',
  status public.resource_status not null default 'ok',
  group_index smallint not null default 0,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);

create table public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 160),
  completed boolean not null default false,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);

create table public.event_log (
  id bigint generated always as identity primary key,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  actor_id uuid references public.profiles(id),
  event_type text not null,
  entity_type text not null,
  entity_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.campaign_archives (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  snapshot jsonb not null,
  archived_by uuid not null references public.profiles(id),
  archived_at timestamptz not null default now()
);

alter table public.campaign_members
  add column job_title text;

update public.campaign_members
set job_title = case when role = 'gm' then '店长' else '服务员' end;

alter table public.campaign_members
  alter column job_title set default '服务员',
  alter column job_title set not null,
  add constraint campaign_members_job_title_check
    check (job_title in ('店长', '厨师', '维修师', '服务员', '顾客'));


alter table public.campaigns
  add column burger_index integer not null default 5
  constraint campaigns_burger_index_range check (burger_index between 1 and 9);
create table public.gm_access (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  account_name text not null,
  display_name text not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'revoked')),
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  review_note text not null default ''
);

create table public.campaign_join_requests (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  campaign_name text not null,
  character_name text not null check (char_length(character_name) between 1 and 40),
  job_title text not null check (job_title in ('厨师', '维修师', '服务员', '顾客')),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id),
  review_note text not null default '' check (char_length(review_note) <= 200),
  unique (campaign_id, user_id)
);
create unique index one_pending_join_request_per_player
  on public.campaign_join_requests(user_id) where status = 'pending';
create index campaign_join_inbox on public.campaign_join_requests(campaign_id, status, requested_at, id);


create function private.current_actor_id() returns uuid language sql stable security definer set search_path='' as $$
 select id from public.profiles where auth_user_id=auth.uid() and not disabled
 and ((account_kind='player') = coalesce((auth.jwt()->>'is_anonymous')::boolean,false));
$$;
create function private.is_member(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.campaign_members where campaign_id=target and user_id=private.current_actor_id());
$$;
create function private.has_role(target uuid, wanted public.member_role) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.campaign_members m join public.profiles p on p.id=m.user_id
 where m.campaign_id=target and m.user_id=private.current_actor_id() and m.active and m.role=wanted
 and (wanted<>'gm' or (p.account_kind='gm' and exists(select 1 from public.gm_access g where g.user_id=p.id and g.status='approved'))));
$$;
create function private.is_campaign_gm(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.campaign_members m join public.gm_access g on g.user_id=m.user_id
 where m.campaign_id=target and m.user_id=private.current_actor_id() and m.role='gm' and g.status='approved');
$$;
create function private.require_actor() returns uuid language plpgsql stable security definer set search_path='' as $$
 declare actor uuid:=private.current_actor_id(); begin
 if actor is null then raise exception 'IDENTITY_REQUIRED'; end if; return actor; end;
$$;
create function private.require_writes() returns void language plpgsql security definer set search_path='' as $$
 begin if not (select business_writes from private.runtime where singleton) then raise exception 'MAINTENANCE'; end if; end;
$$;
create function private.lock_campaign(target uuid, wanted public.member_role default null) returns void language plpgsql security definer set search_path='' as $$
 begin
 perform private.require_actor(); perform private.require_writes();
 perform 1 from public.campaigns where id=target and status='active' for update;
 if not found then raise exception 'CAMPAIGN_NOT_ACTIVE'; end if;
 if wanted is not null then
  if not private.has_role(target,wanted) then raise exception 'CAMPAIGN_ROLE_REQUIRED'; end if;
 elsif not (private.has_role(target,'gm') or private.has_role(target,'player')) then raise exception 'CAMPAIGN_ROLE_REQUIRED'; end if;
 end;
$$;
create function public.ensure_actor() returns public.profiles language plpgsql security definer set search_path='' as $$
 declare result public.profiles; uid uuid:=auth.uid(); anonymous boolean:=coalesce((auth.jwt()->>'is_anonymous')::boolean,false);
 begin
 if uid is null then raise exception 'AUTH_REQUIRED'; end if;
 if not exists(select 1 from public.profiles where auth_user_id=uid) then perform private.require_writes(); end if;
 insert into public.profiles(auth_user_id,account_kind,display_name)
 select uid,case when anonymous then 'player' else 'gm' end,coalesce(u.raw_user_meta_data->>'displayName','') from auth.users u where u.id=uid
 on conflict(auth_user_id) do nothing;
 select * into result from public.profiles where auth_user_id=uid;
 if private.current_actor_id() is null then raise exception 'ACCOUNT_DISABLED'; end if;
 return result; end;
$$;
create function public.complete_identity_migration(p_actor_id uuid,p_auth_user_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
 declare p public.profiles; anonymous boolean;
 begin
 if not exists(select 1 from private.runtime where singleton and migration_until>now()) then raise exception 'MIGRATION_CLOSED'; end if;
 select * into p from public.profiles where id=p_actor_id for update;
 if not found or p.disabled then raise exception 'LEGACY_IDENTITY_INVALID'; end if;
 select is_anonymous into anonymous from auth.users where id=p_auth_user_id;
 if not found or (p.account_kind='player') is distinct from coalesce(anonymous,false) then raise exception 'IDENTITY_KIND_MISMATCH'; end if;
 if p.auth_user_id is not null and p.auth_user_id<>p_auth_user_id then raise exception 'IDENTITY_ALREADY_LINKED'; end if;
 if exists(select 1 from public.profiles where auth_user_id=p_auth_user_id and id<>p_actor_id) then raise exception 'TARGET_ALREADY_LINKED'; end if;
 update public.profiles set auth_user_id=p_auth_user_id where id=p_actor_id;
 insert into private.identity_migrations(actor_id,auth_user_id) values(p_actor_id,p_auth_user_id) on conflict(actor_id) do nothing;
 return p_actor_id; end;
$$;
create function public.request_gm_access() returns public.gm_access language plpgsql security definer set search_path='' as $$
 declare actor uuid:=private.require_actor(); result public.gm_access;
 begin
 if not exists(select 1 from public.profiles where id=actor and account_kind='gm') then raise exception 'GM_ACCOUNT_REQUIRED'; end if;
 insert into public.gm_access(user_id,account_name,display_name)
 select p.id,coalesce(u.email,p.id::text),p.display_name from public.profiles p join auth.users u on u.id=p.auth_user_id where p.id=actor on conflict(user_id) do nothing;
 select * into result from public.gm_access where user_id=actor; return result; end;
$$;
create function public.create_campaign(p_name text,p_character_name text,p_job_title text) returns public.campaigns language plpgsql security definer set search_path='' as $$
 declare actor uuid:=private.require_actor(); result public.campaigns; code text;
 begin
 perform private.require_writes();
 if not exists(select 1 from public.gm_access g join public.profiles p on p.id=g.user_id where g.user_id=actor and p.account_kind='gm' and g.status='approved') then raise exception 'GM_APPROVAL_REQUIRED'; end if;
 if p_job_title is distinct from '店长' then raise exception 'GM_JOB_TITLE_REQUIRED'; end if;
 loop code:=upper(substr(replace(gen_random_uuid()::text,'-',''),1,6)); exit when not exists(select 1 from public.campaigns where join_code=code); end loop;
 insert into public.campaigns(name,join_code,created_by) values(trim(p_name),code,actor) returning * into result;
 insert into public.campaign_members(campaign_id,user_id,role,character_name,job_title) values(result.id,actor,'gm',trim(p_character_name),'店长');
 insert into public.event_log(campaign_id,actor_id,event_type,entity_type,entity_id,payload) values(result.id,actor,'campaign_created','campaign',result.id,'{}');
 return result; end;
$$;
create function public.request_campaign_join(
  p_join_code text,
  p_character_name text,
  p_job_title text
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
begin
  perform private.require_writes();
  -- Serialize requests and reviews for this player, including concurrent tabs.
  perform 1 from public.profiles where id = actor and account_kind='player' and not disabled for update;
  if not found or not coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then
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
create function public.review_campaign_join(
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
  if coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'GM_REQUIRED'; end if;
  select * into result from public.campaign_join_requests where id = p_request_id;
  if result.id is null then raise exception 'JOIN_REQUEST_NOT_FOUND'; end if;
  -- Same lock order as request/cancel: player -> campaign -> request.
  perform 1 from public.profiles where id = result.user_id and account_kind='player' and not disabled for update;
  if not found then raise exception 'PLAYER_ACCOUNT_REQUIRED'; end if;
  select * into target from public.campaigns where id = result.campaign_id for update;
  if not private.has_role(target.id, 'gm') then raise exception 'GM_REQUIRED'; end if;
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
create function public.cancel_campaign_join(p_request_id uuid)
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
  perform 1 from public.profiles where id = actor and account_kind='player' and not disabled for update;
  if not found or not coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'PLAYER_ACCOUNT_REQUIRED'; end if;
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
set search_path = ''
as $$
begin
  if new.status = 'archived' and old.status <> 'archived' then
    update public.campaign_join_requests set status = 'cancelled', reviewed_at = now(), review_note = '班次已结束'
      where campaign_id = new.id and status = 'pending';
  end if;
  return null;
end;
$$;
create trigger close_join_requests after update of status on public.campaigns for each row execute function public.close_campaign_join_requests();
create or replace function public.create_quest(
  p_campaign_id uuid,
  p_title text,
  p_body text,
  p_assignee_label text,
  p_due_at timestamptz
)
returns public.quests
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor uuid := private.require_actor();
  result public.quests;
begin
 perform private.lock_campaign(p_campaign_id,'gm');

  if not private.has_role(p_campaign_id, 'gm') then raise exception 'GM_REQUIRED'; end if;
  insert into public.quests(campaign_id, title, body, assignee_label, due_at, created_by)
  select p_campaign_id, trim(p_title), coalesce(p_body, ''), coalesce(nullif(trim(p_assignee_label), ''), '待认领'), p_due_at, actor
  from public.campaigns where id = p_campaign_id and status = 'active'
  returning * into result;
  if result.id is null then raise exception 'CAMPAIGN_NOT_ACTIVE'; end if;
  return result;
end;
$$;
create or replace function public.update_quest(
  p_quest_id uuid,
  p_title text,
  p_body text,
  p_assignee_label text,
  p_due_at timestamptz
)
returns public.quests
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor uuid := private.require_actor();
  result public.quests;
begin
 perform private.lock_campaign((select campaign_id from public.quests where id=p_quest_id),'gm');

  update public.quests q set title = trim(p_title), body = coalesce(p_body, ''), assignee_label = coalesce(nullif(trim(p_assignee_label), ''), '待认领'), due_at = p_due_at, updated_at = now()
  where q.id = p_quest_id
    and private.has_role(q.campaign_id, 'gm')
    and exists (select 1 from public.campaigns c where c.id = q.campaign_id and c.status = 'active')
  returning q.* into result;
  if result.id is null then raise exception 'QUEST_NOT_EDITABLE'; end if;
  return result;
end;
$$;
create or replace function public.delete_quest(p_quest_id uuid)
returns public.quests
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor uuid := private.require_actor();
  result public.quests;
begin
 perform private.lock_campaign((select campaign_id from public.quests where id=p_quest_id),'gm');

  delete from public.quests q
  where q.id = p_quest_id
    and private.has_role(q.campaign_id, 'gm')
    and exists (select 1 from public.campaigns c where c.id = q.campaign_id and c.status = 'active')
  returning q.* into result;
  if result.id is null then raise exception 'QUEST_NOT_DELETABLE'; end if;
  return result;
end;
$$;
create or replace function public.claim_quest(p_quest_id uuid)
returns public.quests
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor uuid := private.require_actor();
  result public.quests;
begin
 perform private.lock_campaign((select campaign_id from public.quests where id=p_quest_id),'player');

  update public.quests q set status = 'claimed', claimed_by = actor, assignee_label = coalesce((select character_name from public.campaign_members where user_id=actor and campaign_id=q.campaign_id), '玩家'), updated_at = now()
  where q.id = p_quest_id and q.status = 'open'
    and private.has_role(q.campaign_id, 'player')
    and exists (select 1 from public.campaigns c where c.id = q.campaign_id and c.status = 'active')
  returning q.* into result;
  if result.id is null then raise exception 'QUEST_NOT_CLAIMABLE'; end if;
  return result;
end;
$$;
create or replace function public.reopen_quest(p_quest_id uuid)
returns public.quests
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor uuid := private.require_actor();
  result public.quests;
begin
 perform private.lock_campaign((select campaign_id from public.quests where id=p_quest_id),'gm');

  update public.quests q set status = 'open', claimed_by = null, assignee_label = '待认领', completed_at = null, updated_at = now()
  where q.id = p_quest_id
    and private.has_role(q.campaign_id, 'gm')
    and exists (select 1 from public.campaigns c where c.id = q.campaign_id and c.status = 'active')
  returning q.* into result;
  if result.id is null then raise exception 'QUEST_NOT_REOPENABLE'; end if;
  return result;
end;
$$;
create or replace function public.submit_quest(p_quest_id uuid, p_message text)
returns public.quest_submissions
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor uuid := private.require_actor();
  target public.quests;
  result public.quest_submissions;
begin
 perform private.lock_campaign((select campaign_id from public.quests where id=p_quest_id),'player');

  select * into target from public.quests where id = p_quest_id for update;
  if target.claimed_by is distinct from actor or target.status not in ('claimed', 'in_progress', 'failed') then
    raise exception 'QUEST_NOT_SUBMITTABLE';
  end if;
  insert into public.quest_submissions(quest_id, submitted_by, message)
  values (p_quest_id, actor, coalesce(p_message, '')) returning * into result;
  update public.quests set status = 'pending_review', updated_at = now() where id = p_quest_id;
  return result;
end;
$$;
create or replace function public.review_quest_submission(
  p_submission_id uuid,
  p_approved boolean,
  p_message text
)
returns public.quests
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor uuid := private.require_actor();
  submission public.quest_submissions;
  result public.quests;
begin
 if p_approved is null then raise exception 'INVALID_REVIEW'; end if;
 perform private.lock_campaign((select q.campaign_id from public.quests q join public.quest_submissions s on s.quest_id=q.id where s.id=p_submission_id),'gm');

  select s.* into submission from public.quest_submissions s
  join public.quests q on q.id = s.quest_id
  where s.id = p_submission_id and s.reviewed_at is null
    and private.has_role(q.campaign_id, 'gm')
  for update of s;
  if submission.id is null then raise exception 'SUBMISSION_NOT_REVIEWABLE'; end if;
  update public.quest_submissions set approved = p_approved, review_message = coalesce(p_message, ''), reviewed_by = actor, reviewed_at = now()
  where id = p_submission_id;
  update public.quests set
    status = case when p_approved then 'completed'::public.quest_status else 'failed'::public.quest_status end,
    completed_at = case when p_approved then now() else null end,
    updated_at = now()
  where id = submission.quest_id returning * into result;
  return result;
end;
$$;
create or replace function public.archive_campaign(p_campaign_id uuid)
returns public.campaigns
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor uuid := private.require_actor();
  result public.campaigns;
begin
 perform private.lock_campaign(p_campaign_id,'gm');

  if not private.has_role(p_campaign_id, 'gm') then raise exception 'GM_REQUIRED'; end if;
  insert into public.campaign_archives(campaign_id, snapshot, archived_by)
  select c.id, jsonb_build_object(
    'campaign', to_jsonb(c),
    'members', coalesce((select jsonb_agg(to_jsonb(m)) from public.campaign_members m where m.campaign_id = c.id), '[]'::jsonb),
    'quests', coalesce((select jsonb_agg(to_jsonb(q)) from public.quests q where q.campaign_id = c.id), '[]'::jsonb),
    'submissions', coalesce((select jsonb_agg(to_jsonb(s)) from public.quest_submissions s join public.quests q on q.id = s.quest_id where q.campaign_id = c.id), '[]'::jsonb),
    'notes', coalesce((select jsonb_agg(to_jsonb(n)) from public.notes n where n.campaign_id = c.id), '[]'::jsonb),
    'resources', coalesce((select jsonb_agg(to_jsonb(r)) from public.resources r where r.campaign_id = c.id), '[]'::jsonb),
    'checklist', coalesce((select jsonb_agg(to_jsonb(i)) from public.checklist_items i where i.campaign_id = c.id), '[]'::jsonb)
  ), actor from public.campaigns c where c.id = p_campaign_id and c.status = 'active';
  update public.campaigns set status = 'archived', archived_at = now(), updated_at = now()
  where id = p_campaign_id and status = 'active' returning * into result;
  if result.id is null then raise exception 'CAMPAIGN_NOT_ACTIVE'; end if;
  update public.campaign_members set active = false, left_at = now()
  where campaign_id = p_campaign_id and active;
  return result;
end;
$$;
create index event_log_campaign_cursor on public.event_log(campaign_id, id desc);

create function public.snapshot_event_actor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.payload := new.payload || jsonb_build_object('actor_name', coalesce(
    (select character_name from public.campaign_members
      where campaign_id = new.campaign_id and user_id = new.actor_id),
    (select nullif(display_name, '') from public.profiles where id = new.actor_id),
    '系统'
  ));
  return new;
end;
$$;

create trigger event_log_actor_snapshot before insert on public.event_log
for each row execute function public.snapshot_event_actor();

create function public.record_board_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  before_row jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) else null end;
  after_row jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) else null end;
  target jsonb := coalesce(after_row, before_row);
  before_value jsonb;
  after_value jsonb;
  field_names text[];
  entity text;
  event text;
  actor uuid := private.current_actor_id();
begin
  case tg_table_name
    when 'notes' then
      entity := 'note';
      field_names := array['title', 'body', 'color', 'x', 'y', 'rotation'];
    when 'quests' then
      entity := 'quest';
      field_names := array['title', 'body', 'status', 'assignee_label', 'due_at'];
    when 'resources' then
      entity := 'resource';
      field_names := array['name', 'quantity', 'status', 'group_index', 'sort_order'];
    when 'checklist_items' then
      entity := 'checklist';
      field_names := array['label', 'completed', 'sort_order'];
    when 'campaigns' then
      entity := 'campaign';
      field_names := array['name', 'burger_index', 'status'];
  end case;
  select jsonb_object_agg(key, value) into before_value
    from jsonb_each(before_row) where key = any(field_names);
  select jsonb_object_agg(key, value) into after_value
    from jsonb_each(after_row) where key = any(field_names);
  if before_value is not distinct from after_value then return null; end if;

  event := entity || case tg_op
    when 'INSERT' then '_created'
    when 'DELETE' then '_deleted'
    else '_updated' end;
  if tg_op = 'UPDATE' then
    if entity = 'note' and
      (before_value - array['x', 'y', 'rotation']) = (after_value - array['x', 'y', 'rotation']) then
      event := 'note_moved';
    elsif entity = 'quest' and before_value->'status' is distinct from after_value->'status' then
      event := 'quest_status_changed';
    elsif entity = 'checklist' and before_value->'completed' is distinct from after_value->'completed' then
      event := 'checklist_status_changed';
    elsif entity = 'campaign' and before_value->'status' is distinct from after_value->'status' then
      event := 'campaign_archived';
    elsif entity = 'campaign' and before_value->'burger_index' is distinct from after_value->'burger_index' then
      event := 'burger_index_changed';
    end if;
  end if;

  insert into public.event_log(campaign_id, actor_id, event_type, entity_type, entity_id, payload)
    values (
      case when entity = 'campaign' then (target->>'id')::uuid else (target->>'campaign_id')::uuid end,
      actor, event, entity, (target->>'id')::uuid,
      jsonb_build_object('before', before_value, 'after', after_value)
    );
  return null;
end;
$$;

create trigger notes_activity after insert or update or delete on public.notes
for each row execute function public.record_board_activity();
create trigger quests_activity after insert or update or delete on public.quests
for each row execute function public.record_board_activity();
create trigger resources_activity after insert or update or delete on public.resources
for each row execute function public.record_board_activity();
create trigger checklist_activity after insert or update or delete on public.checklist_items
for each row execute function public.record_board_activity();
create trigger campaigns_activity after update on public.campaigns
for each row execute function public.record_board_activity();

revoke all on function public.record_board_activity() from public;
revoke all on function public.snapshot_event_actor() from public;

-- Trigger actors come from the verified Supabase identity mapping.

create function public.stamp_gm_review() returns trigger language plpgsql set search_path='' as $$
 begin if new.status is distinct from old.status then new.reviewed_at:=now(); end if; return new; end;
$$;
create trigger gm_review_timestamp before update on public.gm_access for each row execute function public.stamp_gm_review();

create function public.save_resource(p_campaign_id uuid,p_name text,p_quantity text,p_status public.resource_status,p_group integer,p_id uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
 declare result uuid; begin perform private.lock_campaign(p_campaign_id);
 if p_group not between 0 and 4 or p_group is null then raise exception 'INVALID_GROUP'; end if;
 if p_id is null then insert into public.resources(campaign_id,name,quantity,status,group_index) values(p_campaign_id,trim(p_name),p_quantity,p_status,p_group) returning id into result;
 else update public.resources set name=trim(p_name),quantity=p_quantity,status=p_status,group_index=p_group,updated_at=now() where id=p_id and campaign_id=p_campaign_id returning id into result; end if;
 if result is null then raise exception 'RESOURCE_NOT_FOUND'; end if; return result; end;
$$;
create function public.delete_resource(p_campaign_id uuid,p_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
 begin perform private.lock_campaign(p_campaign_id); delete from public.resources where id=p_id and campaign_id=p_campaign_id;
 if not found then raise exception 'RESOURCE_NOT_FOUND'; end if; return p_id; end;
$$;
create function public.save_checklist_item(p_campaign_id uuid,p_label text,p_id uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
 declare result uuid; begin perform private.lock_campaign(p_campaign_id,'gm');
 if p_id is null then insert into public.checklist_items(campaign_id,label) values(p_campaign_id,trim(p_label)) returning id into result;
 else update public.checklist_items set label=trim(p_label),updated_at=now() where id=p_id and campaign_id=p_campaign_id returning id into result; end if;
 if result is null then raise exception 'CHECKLIST_NOT_FOUND'; end if; return result; end;
$$;
create function public.delete_checklist_item(p_campaign_id uuid,p_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
 begin perform private.lock_campaign(p_campaign_id,'gm'); delete from public.checklist_items where id=p_id and campaign_id=p_campaign_id;
 if not found then raise exception 'CHECKLIST_NOT_FOUND'; end if; return p_id; end;
$$;
create function public.toggle_checklist(p_campaign_id uuid,p_id uuid) returns boolean language plpgsql security definer set search_path='' as $$
 declare result boolean; begin perform private.lock_campaign(p_campaign_id); update public.checklist_items set completed=not completed,updated_at=now() where id=p_id and campaign_id=p_campaign_id returning completed into result;
 if result is null then raise exception 'CHECKLIST_NOT_FOUND'; end if; return result; end;
$$;
create function public.set_burger_index(p_campaign_id uuid,p_value integer) returns integer language plpgsql security definer set search_path='' as $$
 begin perform private.lock_campaign(p_campaign_id,'gm'); update public.campaigns set burger_index=p_value,updated_at=now() where id=p_campaign_id; return p_value; end;
$$;
create function public.save_note(p_campaign_id uuid,p_title text,p_body text,p_color public.note_color,p_x integer default 1098,p_y integer default 605,p_rotation numeric default 0,p_id uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
 declare actor uuid:=private.require_actor(); result uuid;
 begin perform private.lock_campaign(p_campaign_id);
 if p_id is null then insert into public.notes(campaign_id,author_id,title,body,color,x,y,rotation) values(p_campaign_id,actor,trim(p_title),p_body,p_color,p_x,p_y,p_rotation) returning id into result;
 else update public.notes set title=trim(p_title),body=p_body,color=p_color,updated_at=now() where id=p_id and campaign_id=p_campaign_id and (author_id=actor or private.has_role(p_campaign_id,'gm')) returning id into result; end if;
 if result is null then raise exception 'NOTE_NOT_EDITABLE'; end if; return result; end;
$$;
create function public.move_note(p_campaign_id uuid,p_id uuid,p_x integer,p_y integer) returns uuid language plpgsql security definer set search_path='' as $$
 begin perform private.lock_campaign(p_campaign_id); update public.notes set x=p_x,y=p_y,updated_at=now() where id=p_id and campaign_id=p_campaign_id and (author_id=private.current_actor_id() or private.has_role(p_campaign_id,'gm'));
 if not found then raise exception 'NOTE_NOT_EDITABLE'; end if; return p_id; end;
$$;
create function public.delete_note(p_campaign_id uuid,p_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
 begin perform private.lock_campaign(p_campaign_id); delete from public.notes where id=p_id and campaign_id=p_campaign_id and (author_id=private.current_actor_id() or private.has_role(p_campaign_id,'gm'));
 if not found then raise exception 'NOTE_NOT_EDITABLE'; end if; return p_id; end;
$$;
alter table public.profiles enable row level security;
revoke all on public.profiles from anon,authenticated;
grant select on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.campaigns enable row level security;
revoke all on public.campaigns from anon,authenticated;
grant select on public.campaigns to authenticated;
grant all on public.campaigns to service_role;
alter table public.campaign_members enable row level security;
revoke all on public.campaign_members from anon,authenticated;
grant select on public.campaign_members to authenticated;
grant all on public.campaign_members to service_role;
alter table public.quests enable row level security;
revoke all on public.quests from anon,authenticated;
grant select on public.quests to authenticated;
grant all on public.quests to service_role;
alter table public.quest_submissions enable row level security;
revoke all on public.quest_submissions from anon,authenticated;
grant select on public.quest_submissions to authenticated;
grant all on public.quest_submissions to service_role;
alter table public.notes enable row level security;
revoke all on public.notes from anon,authenticated;
grant select on public.notes to authenticated;
grant all on public.notes to service_role;
alter table public.resources enable row level security;
revoke all on public.resources from anon,authenticated;
grant select on public.resources to authenticated;
grant all on public.resources to service_role;
alter table public.checklist_items enable row level security;
revoke all on public.checklist_items from anon,authenticated;
grant select on public.checklist_items to authenticated;
grant all on public.checklist_items to service_role;
alter table public.event_log enable row level security;
revoke all on public.event_log from anon,authenticated;
grant select on public.event_log to authenticated;
grant all on public.event_log to service_role;
alter table public.campaign_archives enable row level security;
revoke all on public.campaign_archives from anon,authenticated;
grant select on public.campaign_archives to authenticated;
grant all on public.campaign_archives to service_role;
alter table public.gm_access enable row level security;
revoke all on public.gm_access from anon,authenticated;
grant select on public.gm_access to authenticated;
grant all on public.gm_access to service_role;
alter table public.campaign_join_requests enable row level security;
revoke all on public.campaign_join_requests from anon,authenticated;
grant select on public.campaign_join_requests to authenticated;
grant all on public.campaign_join_requests to service_role;
create policy read_profiles on public.profiles for select to authenticated using(private.current_actor_id() is not null and (id=private.current_actor_id()));
create policy read_campaigns on public.campaigns for select to authenticated using(private.current_actor_id() is not null and (private.is_member(id)));
create policy read_campaign_members on public.campaign_members for select to authenticated using(private.current_actor_id() is not null and (private.is_member(campaign_id)));
create policy read_quests on public.quests for select to authenticated using(private.current_actor_id() is not null and (private.is_member(campaign_id)));
create policy read_quest_submissions on public.quest_submissions for select to authenticated using(private.current_actor_id() is not null and (submitted_by=private.current_actor_id() or private.is_campaign_gm((select campaign_id from public.quests where id=quest_id))));
create policy read_notes on public.notes for select to authenticated using(private.current_actor_id() is not null and (private.is_member(campaign_id)));
create policy read_resources on public.resources for select to authenticated using(private.current_actor_id() is not null and (private.is_member(campaign_id)));
create policy read_checklist_items on public.checklist_items for select to authenticated using(private.current_actor_id() is not null and (private.is_member(campaign_id)));
create policy read_event_log on public.event_log for select to authenticated using(private.current_actor_id() is not null and (private.is_member(campaign_id)));
create policy read_campaign_archives on public.campaign_archives for select to authenticated using(private.current_actor_id() is not null and (private.is_campaign_gm(campaign_id)));
create policy read_gm_access on public.gm_access for select to authenticated using(private.current_actor_id() is not null and (user_id=private.current_actor_id() and not coalesce((auth.jwt()->>'is_anonymous')::boolean,false)));
create policy read_campaign_join_requests on public.campaign_join_requests for select to authenticated using(private.current_actor_id() is not null and (user_id=private.current_actor_id() or private.has_role(campaign_id,'gm')));

create function public.get_archive_summary(p_campaign_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
 begin if not private.is_member(p_campaign_id) then raise exception 'CAMPAIGN_ROLE_REQUIRED'; end if;
 return (select jsonb_build_object('campaign_id',campaign_id,'archived_by',archived_by,'archived_at',archived_at) from public.campaign_archives where campaign_id=p_campaign_id); end;
$$;
create function public.get_campaign_board(p_campaign_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
 'id',c.id,'name',c.name,'join_code',c.join_code,'burger_index',c.burger_index,'status',c.status,
 'members',coalesce((select jsonb_agg(to_jsonb(m) order by m.joined_at,m.user_id) from public.campaign_members m where m.campaign_id=c.id),'[]'),
 'resources',coalesce((select jsonb_agg(to_jsonb(r) order by r.group_index,r.sort_order,r.id) from public.resources r where r.campaign_id=c.id),'[]'),
 'checklist_items',coalesce((select jsonb_agg(to_jsonb(i) order by i.sort_order,i.id) from public.checklist_items i where i.campaign_id=c.id),'[]'),
 'quests',coalesce((select jsonb_agg(to_jsonb(q)||jsonb_build_object('submissions',coalesce((select jsonb_agg(jsonb_build_object('id',s.id)) from public.quest_submissions s where s.quest_id=q.id and s.reviewed_at is null),'[]')) order by q.sort_order,q.created_at,q.id) from public.quests q where q.campaign_id=c.id),'[]'),
 'notes',coalesce((select jsonb_agg(to_jsonb(n) order by n.created_at,n.id) from public.notes n where n.campaign_id=c.id),'[]'),
 'events',coalesce((select jsonb_agg(e.data order by e.id desc) from (select id,to_jsonb(l)||jsonb_build_object('id',l.id::text) as data from public.event_log l where l.campaign_id=c.id order by id desc limit 31) e),'[]'))
 from public.campaigns c where c.id=p_campaign_id;
$$;
create function public.get_activities(p_campaign_id uuid,p_before bigint default null) returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(e.data order by e.id desc),'[]') from (select id,to_jsonb(l)||jsonb_build_object('id',l.id::text) data from public.event_log l where campaign_id=p_campaign_id and (p_before is null or id<p_before) order by id desc limit 31) e;
$$;

revoke all on function private.current_actor_id() from public,anon,authenticated;
grant execute on function private.current_actor_id() to authenticated;
revoke all on function private.is_member(uuid) from public,anon,authenticated;
grant execute on function private.is_member(uuid) to authenticated;
revoke all on function private.has_role(uuid,public.member_role) from public,anon,authenticated;
grant execute on function private.has_role(uuid,public.member_role) to authenticated;
revoke all on function private.require_actor() from public,anon,authenticated;
revoke all on function private.require_writes() from public,anon,authenticated;
revoke all on function private.lock_campaign(uuid,public.member_role) from public,anon,authenticated;
revoke all on function public.ensure_actor() from public,anon,authenticated;
grant execute on function public.ensure_actor() to authenticated;
revoke all on function public.complete_identity_migration(uuid,uuid) from public,anon,authenticated;
grant execute on function public.complete_identity_migration(uuid,uuid) to service_role;
revoke all on function public.request_gm_access() from public,anon,authenticated;
grant execute on function public.request_gm_access() to authenticated;
revoke all on function public.create_campaign(text,text,text) from public,anon,authenticated;
grant execute on function public.create_campaign(text,text,text) to authenticated;
revoke all on function public.request_campaign_join(text,text,text) from public,anon,authenticated;
grant execute on function public.request_campaign_join(text,text,text) to authenticated;
revoke all on function public.review_campaign_join(uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.review_campaign_join(uuid,boolean,text) to authenticated;
revoke all on function public.cancel_campaign_join(uuid) from public,anon,authenticated;
grant execute on function public.cancel_campaign_join(uuid) to authenticated;
revoke all on function public.close_campaign_join_requests() from public,anon,authenticated;
revoke all on function public.create_quest(uuid,text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.create_quest(uuid,text,text,text,timestamptz) to authenticated;
revoke all on function public.update_quest(uuid,text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.update_quest(uuid,text,text,text,timestamptz) to authenticated;
revoke all on function public.delete_quest(uuid) from public,anon,authenticated;
grant execute on function public.delete_quest(uuid) to authenticated;
revoke all on function public.claim_quest(uuid) from public,anon,authenticated;
grant execute on function public.claim_quest(uuid) to authenticated;
revoke all on function public.reopen_quest(uuid) from public,anon,authenticated;
grant execute on function public.reopen_quest(uuid) to authenticated;
revoke all on function public.submit_quest(uuid,text) from public,anon,authenticated;
grant execute on function public.submit_quest(uuid,text) to authenticated;
revoke all on function public.review_quest_submission(uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.review_quest_submission(uuid,boolean,text) to authenticated;
revoke all on function public.archive_campaign(uuid) from public,anon,authenticated;
grant execute on function public.archive_campaign(uuid) to authenticated;
revoke all on function public.snapshot_event_actor() from public,anon,authenticated;
revoke all on function public.record_board_activity() from public,anon,authenticated;
revoke all on function public.stamp_gm_review() from public,anon,authenticated;
revoke all on function public.save_resource(uuid,text,text,public.resource_status,integer,uuid) from public,anon,authenticated;
grant execute on function public.save_resource(uuid,text,text,public.resource_status,integer,uuid) to authenticated;
revoke all on function public.delete_resource(uuid,uuid) from public,anon,authenticated;
grant execute on function public.delete_resource(uuid,uuid) to authenticated;
revoke all on function public.save_checklist_item(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.save_checklist_item(uuid,text,uuid) to authenticated;
revoke all on function public.delete_checklist_item(uuid,uuid) from public,anon,authenticated;
grant execute on function public.delete_checklist_item(uuid,uuid) to authenticated;
revoke all on function public.toggle_checklist(uuid,uuid) from public,anon,authenticated;
grant execute on function public.toggle_checklist(uuid,uuid) to authenticated;
revoke all on function public.set_burger_index(uuid,integer) from public,anon,authenticated;
grant execute on function public.set_burger_index(uuid,integer) to authenticated;
revoke all on function public.save_note(uuid,text,text,public.note_color,integer,integer,numeric,uuid) from public,anon,authenticated;
grant execute on function public.save_note(uuid,text,text,public.note_color,integer,integer,numeric,uuid) to authenticated;
revoke all on function public.move_note(uuid,uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.move_note(uuid,uuid,integer,integer) to authenticated;
revoke all on function public.delete_note(uuid,uuid) from public,anon,authenticated;
grant execute on function public.delete_note(uuid,uuid) to authenticated;
revoke all on function public.get_archive_summary(uuid) from public,anon,authenticated;
grant execute on function public.get_archive_summary(uuid) to authenticated;
revoke all on function public.get_campaign_board(uuid) from public,anon,authenticated;
grant execute on function public.get_campaign_board(uuid) to authenticated;
revoke all on function public.get_activities(uuid,bigint) from public,anon,authenticated;
grant execute on function public.get_activities(uuid,bigint) to authenticated;

revoke all on function private.is_campaign_gm(uuid) from public,anon,authenticated;
grant execute on function private.is_campaign_gm(uuid) to authenticated;

create table private.migration_attempts(auth_user_id uuid primary key references auth.users(id) on delete cascade,window_start timestamptz not null,attempts integer not null);
create function public.consume_identity_attempt(p_auth_user_id uuid) returns void language plpgsql security definer set search_path='' as $$
 declare tries integer; begin
 if not exists(select 1 from private.runtime where singleton and migration_until>now()) then raise exception 'MIGRATION_CLOSED'; end if;
 insert into private.migration_attempts(auth_user_id,window_start,attempts) values(p_auth_user_id,now(),1)
 on conflict(auth_user_id) do update set window_start=case when private.migration_attempts.window_start<now()-interval '1 hour' then now() else private.migration_attempts.window_start end,
 attempts=case when private.migration_attempts.window_start<now()-interval '1 hour' then 1 else private.migration_attempts.attempts+1 end returning attempts into tries;
 if tries>20 then raise exception 'MIGRATION_RATE_LIMIT'; end if; end;
$$;
revoke all on function public.consume_identity_attempt(uuid) from public,anon,authenticated;
grant execute on function public.consume_identity_attempt(uuid) to service_role;
