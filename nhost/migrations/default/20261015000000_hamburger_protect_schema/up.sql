create extension if not exists pgcrypto;

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
  created_by uuid not null references auth.users(id),
  started_at timestamptz not null default now(),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'active' and archived_at is null) or status = 'archived')
);

create table public.campaign_members (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
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
  created_by uuid not null references auth.users(id),
  claimed_by uuid references auth.users(id),
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
  submitted_by uuid not null references auth.users(id),
  message text not null default '' check (char_length(message) <= 1000),
  reviewed_by uuid references auth.users(id),
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
  author_id uuid not null references auth.users(id),
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
  actor_id uuid references auth.users(id),
  event_type text not null,
  entity_type text not null,
  entity_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.campaign_archives (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  snapshot jsonb not null,
  archived_by uuid not null references auth.users(id),
  archived_at timestamptz not null default now()
);

create or replace function public.session_user_id(hasura_session json)
returns uuid
language sql
stable
as $$
  select nullif(hasura_session ->> 'x-hasura-user-id', '')::uuid;
$$;

create or replace function public.is_campaign_member(target_campaign uuid, target_user uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.campaign_members
    where campaign_id = target_campaign and user_id = target_user
  );
$$;

create or replace function public.has_campaign_role(target_campaign uuid, target_user uuid, target_role public.member_role)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.campaign_members
    where campaign_id = target_campaign
      and user_id = target_user
      and role = target_role
      and active
  );
$$;

create or replace function public.create_campaign(p_name text, p_character_name text, hasura_session json)
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
  loop
    code := upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 6));
    exit when not exists (select 1 from public.campaigns where join_code = code);
  end loop;
  insert into public.campaigns(name, join_code, created_by)
  values (trim(p_name), code, actor) returning * into result;
  insert into public.campaign_members(campaign_id, user_id, role, character_name)
  values (result.id, actor, 'gm', trim(p_character_name));
  insert into public.resources(campaign_id, name, quantity, group_index, sort_order) values
    (result.id, '面包胚', '300 个', 0, 10),
    (result.id, '牛肉饼', '200 片', 0, 20),
    (result.id, '芝士片', '150 片', 0, 30),
    (result.id, '生菜', '20 斤', 0, 40),
    (result.id, '薯条', '20 斤', 1, 10),
    (result.id, '炸鸡排', '80 片', 1, 20),
    (result.id, '鸡翅', '50 对', 1, 30),
    (result.id, '洋葱', '10 斤', 1, 40),
    (result.id, '酸黄瓜', '5 斤', 1, 50),
    (result.id, '番茄酱', '10 瓶', 2, 10),
    (result.id, '沙拉酱', '8 瓶', 2, 20),
    (result.id, '黄芥末', '5 瓶', 2, 30),
    (result.id, '辣椒', '2 斤', 2, 40);
  insert into public.checklist_items(campaign_id, label, sort_order) values
    (result.id, '穿戴整洁，工服干净', 10),
    (result.id, '头发整洁，戴帽/发网', 20),
    (result.id, '指甲干净，不戴首饰', 30),
    (result.id, '班前检查，设备卫生', 40),
    (result.id, '生熟分开，避免交叉', 50),
    (result.id, '变质食材，及时处理', 60),
    (result.id, '关闭火源，下班考核', 70),
    (result.id, '食材温度，符合标准', 80),
    (result.id, '酱料密封，存放合规', 90),
    (result.id, '生菜保鲜，今日更换', 100),
    (result.id, '餐具消毒，今日完成', 110);
  insert into public.event_log(campaign_id, actor_id, event_type, entity_type, entity_id)
  values (result.id, actor, 'campaign_created', 'campaign', result.id);
  return result;
end;
$$;

create or replace function public.join_campaign(p_join_code text, p_character_name text, hasura_session json)
returns public.campaign_members
language plpgsql
volatile
security definer
set search_path = public, auth
as $$
declare
  actor uuid := public.session_user_id(hasura_session);
  target_campaign uuid;
  result public.campaign_members;
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  select id into target_campaign from public.campaigns
  where join_code = upper(trim(p_join_code)) and status = 'active';
  if target_campaign is null then raise exception 'CAMPAIGN_NOT_FOUND'; end if;
  insert into public.campaign_members(campaign_id, user_id, role, character_name)
  values (target_campaign, actor, 'player', trim(p_character_name))
  returning * into result;
  insert into public.event_log(campaign_id, actor_id, event_type, entity_type, entity_id)
  values (target_campaign, actor, 'member_joined', 'campaign', target_campaign);
  return result;
end;
$$;

create or replace function public.create_quest(
  p_campaign_id uuid,
  p_title text,
  p_body text,
  p_assignee_label text,
  p_due_at timestamptz,
  hasura_session json
)
returns public.quests
language plpgsql
volatile
security definer
set search_path = public, auth
as $$
declare
  actor uuid := public.session_user_id(hasura_session);
  result public.quests;
begin
  if not public.has_campaign_role(p_campaign_id, actor, 'gm') then raise exception 'GM_REQUIRED'; end if;
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
  p_due_at timestamptz,
  hasura_session json
)
returns public.quests
language plpgsql
volatile
security definer
set search_path = public, auth
as $$
declare
  actor uuid := public.session_user_id(hasura_session);
  result public.quests;
begin
  update public.quests q set title = trim(p_title), body = coalesce(p_body, ''), assignee_label = coalesce(nullif(trim(p_assignee_label), ''), '待认领'), due_at = p_due_at, updated_at = now()
  where q.id = p_quest_id
    and public.has_campaign_role(q.campaign_id, actor, 'gm')
    and exists (select 1 from public.campaigns c where c.id = q.campaign_id and c.status = 'active')
  returning q.* into result;
  if result.id is null then raise exception 'QUEST_NOT_EDITABLE'; end if;
  return result;
end;
$$;

create or replace function public.delete_quest(p_quest_id uuid, hasura_session json)
returns public.quests
language plpgsql
volatile
security definer
set search_path = public, auth
as $$
declare
  actor uuid := public.session_user_id(hasura_session);
  result public.quests;
begin
  delete from public.quests q
  where q.id = p_quest_id
    and public.has_campaign_role(q.campaign_id, actor, 'gm')
    and exists (select 1 from public.campaigns c where c.id = q.campaign_id and c.status = 'active')
  returning q.* into result;
  if result.id is null then raise exception 'QUEST_NOT_DELETABLE'; end if;
  return result;
end;
$$;

create or replace function public.claim_quest(p_quest_id uuid, hasura_session json)
returns public.quests
language plpgsql
volatile
security definer
set search_path = public, auth
as $$
declare
  actor uuid := public.session_user_id(hasura_session);
  result public.quests;
begin
  update public.quests q set status = 'claimed', claimed_by = actor, assignee_label = coalesce((select nullif(display_name, '') from auth.users where id = actor), '玩家'), updated_at = now()
  where q.id = p_quest_id and q.status = 'open'
    and public.has_campaign_role(q.campaign_id, actor, 'player')
    and exists (select 1 from public.campaigns c where c.id = q.campaign_id and c.status = 'active')
  returning q.* into result;
  if result.id is null then raise exception 'QUEST_NOT_CLAIMABLE'; end if;
  return result;
end;
$$;

create or replace function public.reopen_quest(p_quest_id uuid, hasura_session json)
returns public.quests
language plpgsql
volatile
security definer
set search_path = public, auth
as $$
declare
  actor uuid := public.session_user_id(hasura_session);
  result public.quests;
begin
  update public.quests q set status = 'open', claimed_by = null, assignee_label = '待认领', completed_at = null, updated_at = now()
  where q.id = p_quest_id
    and public.has_campaign_role(q.campaign_id, actor, 'gm')
    and exists (select 1 from public.campaigns c where c.id = q.campaign_id and c.status = 'active')
  returning q.* into result;
  if result.id is null then raise exception 'QUEST_NOT_REOPENABLE'; end if;
  return result;
end;
$$;

create or replace function public.submit_quest(p_quest_id uuid, p_message text, hasura_session json)
returns public.quest_submissions
language plpgsql
volatile
security definer
set search_path = public, auth
as $$
declare
  actor uuid := public.session_user_id(hasura_session);
  target public.quests;
  result public.quest_submissions;
begin
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
  p_message text,
  hasura_session json
)
returns public.quests
language plpgsql
volatile
security definer
set search_path = public, auth
as $$
declare
  actor uuid := public.session_user_id(hasura_session);
  submission public.quest_submissions;
  result public.quests;
begin
  select s.* into submission from public.quest_submissions s
  join public.quests q on q.id = s.quest_id
  where s.id = p_submission_id and s.reviewed_at is null
    and public.has_campaign_role(q.campaign_id, actor, 'gm')
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

create or replace function public.archive_campaign(p_campaign_id uuid, hasura_session json)
returns public.campaigns
language plpgsql
volatile
security definer
set search_path = public, auth
as $$
declare
  actor uuid := public.session_user_id(hasura_session);
  result public.campaigns;
begin
  if not public.has_campaign_role(p_campaign_id, actor, 'gm') then raise exception 'GM_REQUIRED'; end if;
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

revoke all on function public.create_campaign(text, text, json) from public;
revoke all on function public.join_campaign(text, text, json) from public;
revoke all on function public.create_quest(uuid, text, text, text, timestamptz, json) from public;
revoke all on function public.update_quest(uuid, text, text, text, timestamptz, json) from public;
revoke all on function public.delete_quest(uuid, json) from public;
revoke all on function public.claim_quest(uuid, json) from public;
revoke all on function public.reopen_quest(uuid, json) from public;
revoke all on function public.submit_quest(uuid, text, json) from public;
revoke all on function public.review_quest_submission(uuid, boolean, text, json) from public;
revoke all on function public.archive_campaign(uuid, json) from public;
