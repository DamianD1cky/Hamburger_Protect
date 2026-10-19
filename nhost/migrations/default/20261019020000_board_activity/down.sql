drop trigger campaigns_activity on public.campaigns;
drop trigger checklist_activity on public.checklist_items;
drop trigger resources_activity on public.resources;
drop trigger quests_activity on public.quests;
drop trigger notes_activity on public.notes;
drop trigger event_log_actor_snapshot on public.event_log;
drop function public.record_board_activity();
drop function public.snapshot_event_actor();
drop index public.event_log_campaign_cursor;

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

