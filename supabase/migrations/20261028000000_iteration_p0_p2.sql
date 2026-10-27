-- P0-P2 iteration: task feedback, roster management, member profiles,
-- pinned notes, checklist groups, shared room settings, and private images.

alter table public.campaign_members
  drop constraint if exists campaign_members_job_title_check,
  add column profile_text text not null default ''
    check (char_length(profile_text) <= 2000),
  add constraint campaign_members_job_title_length
    check (char_length(trim(job_title)) between 1 and 40);

alter table public.campaign_join_requests
  add column profile_text text not null default ''
    check (char_length(profile_text) <= 2000),
  drop constraint if exists campaign_join_requests_job_title_check,
  add constraint campaign_join_requests_job_title_length
    check (char_length(trim(job_title)) between 1 and 40);

alter table public.notes
  add column pinned boolean not null default false,
  add column pinned_at timestamptz;

alter table public.notes
  add constraint notes_pinned_timestamp_check
  check ((pinned and pinned_at is not null) or (not pinned and pinned_at is null));

create table public.campaign_settings (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  section_titles jsonb not null default '{}'::jsonb,
  hidden_sections text[] not null default '{}'::text[],
  background_path text,
  note_texture_path text,
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(section_titles) = 'object'),
  check (cardinality(hidden_sections) <= 7),
  check (background_path is null or char_length(background_path) <= 300),
  check (note_texture_path is null or char_length(note_texture_path) <= 300)
);

insert into public.campaign_settings(campaign_id)
select id from public.campaigns
on conflict (campaign_id) do nothing;

create function public.create_campaign_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.campaign_settings(campaign_id) values (new.id)
  on conflict (campaign_id) do nothing;
  return new;
end;
$$;

create trigger create_campaign_settings
after insert on public.campaigns
for each row execute function public.create_campaign_settings();

create table public.checklist_categories (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 40),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, name)
);

alter table public.checklist_items
  add column category_id uuid references public.checklist_categories(id) on delete set null;

create index checklist_categories_campaign_order
  on public.checklist_categories(campaign_id, sort_order, created_at, id);
create index checklist_items_category
  on public.checklist_items(campaign_id, category_id, sort_order, id);
create index notes_campaign_pinned
  on public.notes(campaign_id, pinned desc, pinned_at desc, created_at desc, id);

create or replace function private.is_member(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.campaign_members m
    join public.campaigns c on c.id = m.campaign_id
    where m.campaign_id = target
      and m.user_id = private.current_actor_id()
      and (m.active or c.status = 'archived')
  );
$$;

create function private.storage_campaign_id(object_name text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return split_part(object_name, '/', 1)::uuid;
exception when invalid_text_representation then
  return null;
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
  perform 1 from public.profiles
    where id = actor and account_kind = 'player' and not disabled for update;
  if not found or not coalesce((auth.jwt()->>'is_anonymous')::boolean, false) then
    raise exception 'PLAYER_ACCOUNT_REQUIRED';
  end if;
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
  if coalesce((auth.jwt()->>'is_anonymous')::boolean, false) then
    raise exception 'GM_REQUIRED';
  end if;
  select * into result from public.campaign_join_requests where id = p_request_id;
  if result.id is null then raise exception 'JOIN_REQUEST_NOT_FOUND'; end if;
  perform 1 from public.profiles
    where id = result.user_id and account_kind = 'player' and not disabled for update;
  if not found then raise exception 'PLAYER_ACCOUNT_REQUIRED'; end if;
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

create function public.update_member_profile(
  p_campaign_id uuid,
  p_character_name text,
  p_job_title text,
  p_profile_text text
)
returns public.campaign_members
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor uuid := private.require_actor();
  result public.campaign_members;
  before_name text;
  before_job text;
  normalized_name text := trim(p_character_name);
  normalized_job text := trim(p_job_title);
  normalized_profile text := trim(coalesce(p_profile_text, ''));
begin
  perform private.lock_campaign(p_campaign_id, null);
  if char_length(normalized_name) not between 1 and 40
    or char_length(normalized_job) not between 1 and 40
    or char_length(normalized_profile) > 2000 then
    raise exception 'INVALID_MEMBER_PROFILE';
  end if;
  select character_name, job_title into before_name, before_job
  from public.campaign_members
  where campaign_id = p_campaign_id and user_id = actor and active
  for update;
  if not found then raise exception 'MEMBER_NOT_ACTIVE'; end if;
  update public.campaign_members set
    character_name = normalized_name,
    job_title = normalized_job,
    profile_text = normalized_profile
  where campaign_id = p_campaign_id and user_id = actor
  returning * into result;
  insert into public.event_log(
    campaign_id, actor_id, event_type, entity_type, entity_id, payload
  ) values (
    p_campaign_id, actor, 'member_profile_updated', 'member', actor,
    jsonb_build_object(
      'before', jsonb_build_object(
        'character_name', before_name,
        'job_title', before_job
      ),
      'after', jsonb_build_object(
        'character_name', result.character_name,
        'job_title', result.job_title
      )
    )
  );
  return result;
end;
$$;

create function public.remove_campaign_member(
  p_campaign_id uuid,
  p_user_id uuid,
  p_note text default ''
)
returns public.campaign_members
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor uuid := private.require_actor();
  target public.campaign_members;
  released integer := 0;
begin
  perform private.lock_campaign(p_campaign_id, 'gm');
  if char_length(coalesce(p_note, '')) > 200 then
    raise exception 'INVALID_REMOVAL_NOTE';
  end if;
  select * into target from public.campaign_members
  where campaign_id = p_campaign_id and user_id = p_user_id
  for update;
  if target.user_id is null then raise exception 'MEMBER_NOT_FOUND'; end if;
  if target.role <> 'player' then raise exception 'PLAYER_MEMBER_REQUIRED'; end if;
  if not target.active then return target; end if;
  update public.quests q set
    status = 'open',
    claimed_by = null,
    assignee_label = '待认领',
    completed_at = null,
    updated_at = now()
  where q.campaign_id = p_campaign_id
    and q.claimed_by = p_user_id
    and q.status in ('claimed', 'in_progress', 'failed')
    and not exists (
      select 1 from public.quest_submissions s
      where s.quest_id = q.id and s.reviewed_at is null
    );
  get diagnostics released = row_count;
  update public.campaign_members set active = false, left_at = now()
  where campaign_id = p_campaign_id and user_id = p_user_id
  returning * into target;
  update public.campaign_join_requests set
    status = 'cancelled',
    reviewed_at = now(),
    reviewed_by = actor,
    review_note = case
      when trim(coalesce(p_note, '')) = '' then '已被移出房间，可重新申请'
      else trim(p_note)
    end
  where campaign_id = p_campaign_id and user_id = p_user_id;
  insert into public.event_log(
    campaign_id, actor_id, event_type, entity_type, entity_id, payload
  ) values (
    p_campaign_id, actor, 'member_removed', 'member', p_user_id,
    jsonb_build_object(
      'character_name', target.character_name,
      'job_title', target.job_title,
      'released_tasks', released,
      'note', trim(coalesce(p_note, ''))
    )
  );
  return target;
end;
$$;

create function public.set_note_pinned(
  p_campaign_id uuid,
  p_note_id uuid,
  p_pinned boolean
)
returns public.notes
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  result public.notes;
begin
  perform private.lock_campaign(p_campaign_id, 'gm');
  update public.notes set
    pinned = p_pinned,
    pinned_at = case when p_pinned then now() else null end,
    updated_at = now()
  where id = p_note_id and campaign_id = p_campaign_id
  returning * into result;
  if result.id is null then raise exception 'NOTE_NOT_FOUND'; end if;
  return result;
end;
$$;

create function public.save_checklist_category(
  p_campaign_id uuid,
  p_name text,
  p_id uuid default null
)
returns public.checklist_categories
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  result public.checklist_categories;
  normalized text := trim(p_name);
begin
  perform private.lock_campaign(p_campaign_id, 'gm');
  if char_length(normalized) not between 1 and 40 then
    raise exception 'INVALID_CATEGORY_NAME';
  end if;
  if p_id is null then
    insert into public.checklist_categories(campaign_id, name)
    values (p_campaign_id, normalized)
    on conflict (campaign_id, name) do update set updated_at = now()
    returning * into result;
  else
    update public.checklist_categories set name = normalized, updated_at = now()
    where id = p_id and campaign_id = p_campaign_id
    returning * into result;
  end if;
  if result.id is null then raise exception 'CATEGORY_NOT_FOUND'; end if;
  return result;
end;
$$;

create function public.delete_checklist_category(
  p_campaign_id uuid,
  p_id uuid
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.lock_campaign(p_campaign_id, 'gm');
  delete from public.checklist_categories
  where id = p_id and campaign_id = p_campaign_id;
  if not found then raise exception 'CATEGORY_NOT_FOUND'; end if;
  return p_id;
end;
$$;

drop function if exists public.save_checklist_item(uuid, text, uuid);
create function public.save_checklist_item(
  p_campaign_id uuid,
  p_label text,
  p_id uuid default null,
  p_category_id uuid default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  result uuid;
begin
  perform private.lock_campaign(p_campaign_id, 'gm');
  if p_category_id is not null and not exists (
    select 1 from public.checklist_categories
    where id = p_category_id and campaign_id = p_campaign_id
  ) then raise exception 'CATEGORY_NOT_FOUND'; end if;
  if p_id is null then
    insert into public.checklist_items(campaign_id, label, category_id)
    values (p_campaign_id, trim(p_label), p_category_id)
    returning id into result;
  else
    update public.checklist_items set
      label = trim(p_label),
      category_id = p_category_id,
      updated_at = now()
    where id = p_id and campaign_id = p_campaign_id
    returning id into result;
  end if;
  if result is null then raise exception 'CHECKLIST_NOT_FOUND'; end if;
  return result;
end;
$$;

create function public.update_campaign_settings(
  p_campaign_id uuid,
  p_section_titles jsonb,
  p_hidden_sections text[],
  p_background_path text default null,
  p_note_texture_path text default null
)
returns public.campaign_settings
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  result public.campaign_settings;
  allowed text[] := array[
    'inventory', 'tasks', 'shifts', 'index', 'activity', 'safety', 'notes'
  ];
  media_prefix text := p_campaign_id::text || '/';
begin
  perform private.lock_campaign(p_campaign_id, 'gm');
  if jsonb_typeof(coalesce(p_section_titles, '{}'::jsonb)) <> 'object'
    or exists (
      select 1 from jsonb_each_text(coalesce(p_section_titles, '{}'::jsonb)) item
      where not (item.key = any(allowed))
        or char_length(trim(item.value)) not between 1 and 32
    )
    or exists (
      select 1 from unnest(coalesce(p_hidden_sections, '{}'::text[])) item
      where not (item = any(allowed))
    )
    or cardinality(coalesce(p_hidden_sections, '{}'::text[])) > 7
    or (p_background_path is not null and not starts_with(p_background_path, media_prefix))
    or (p_note_texture_path is not null and not starts_with(p_note_texture_path, media_prefix)) then
    raise exception 'INVALID_CAMPAIGN_SETTINGS';
  end if;
  insert into public.campaign_settings(
    campaign_id, section_titles, hidden_sections,
    background_path, note_texture_path, updated_at
  ) values (
    p_campaign_id,
    coalesce(p_section_titles, '{}'::jsonb),
    array(select distinct unnest(coalesce(p_hidden_sections, '{}'::text[]))),
    p_background_path,
    p_note_texture_path,
    now()
  )
  on conflict (campaign_id) do update set
    section_titles = excluded.section_titles,
    hidden_sections = excluded.hidden_sections,
    background_path = excluded.background_path,
    note_texture_path = excluded.note_texture_path,
    updated_at = now()
  returning * into result;
  return result;
end;
$$;

create or replace function public.record_board_activity()
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
      field_names := array['title', 'body', 'color', 'x', 'y', 'rotation', 'pinned', 'pinned_at'];
    when 'quests' then
      entity := 'quest';
      field_names := array['title', 'body', 'status', 'assignee_label', 'due_at'];
    when 'resources' then
      entity := 'resource';
      field_names := array['name', 'quantity', 'status', 'group_index', 'sort_order'];
    when 'checklist_items' then
      entity := 'checklist';
      field_names := array['label', 'completed', 'sort_order', 'category_id'];
    when 'campaigns' then
      entity := 'campaign';
      field_names := array['name', 'burger_index', 'status'];
    when 'campaign_settings' then
      entity := 'settings';
      field_names := array[
        'section_titles', 'hidden_sections', 'background_path', 'note_texture_path'
      ];
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
    if entity = 'note' and before_value->'pinned' is distinct from after_value->'pinned' then
      event := case when (after_value->>'pinned')::boolean then 'note_pinned' else 'note_unpinned' end;
    elsif entity = 'note' and
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
  insert into public.event_log(
    campaign_id, actor_id, event_type, entity_type, entity_id, payload
  ) values (
    case
      when entity = 'campaign' then (target->>'id')::uuid
      else (target->>'campaign_id')::uuid
    end,
    actor,
    event,
    entity,
    case
      when entity = 'settings' then (target->>'campaign_id')::uuid
      else (target->>'id')::uuid
    end,
    jsonb_build_object('before', before_value, 'after', after_value)
  );
  return null;
end;
$$;

create trigger campaign_settings_activity
after update on public.campaign_settings
for each row execute function public.record_board_activity();

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
  perform private.lock_campaign(p_campaign_id, 'gm');
  insert into public.campaign_archives(campaign_id, snapshot, archived_by)
  select c.id, jsonb_build_object(
    'campaign', to_jsonb(c),
    'members', coalesce((select jsonb_agg(to_jsonb(m)) from public.campaign_members m where m.campaign_id = c.id), '[]'::jsonb),
    'quests', coalesce((select jsonb_agg(to_jsonb(q)) from public.quests q where q.campaign_id = c.id), '[]'::jsonb),
    'submissions', coalesce((select jsonb_agg(to_jsonb(s)) from public.quest_submissions s join public.quests q on q.id = s.quest_id where q.campaign_id = c.id), '[]'::jsonb),
    'notes', coalesce((select jsonb_agg(to_jsonb(n)) from public.notes n where n.campaign_id = c.id), '[]'::jsonb),
    'resources', coalesce((select jsonb_agg(to_jsonb(r)) from public.resources r where r.campaign_id = c.id), '[]'::jsonb),
    'checklist', coalesce((select jsonb_agg(to_jsonb(i)) from public.checklist_items i where i.campaign_id = c.id), '[]'::jsonb),
    'checklist_categories', coalesce((select jsonb_agg(to_jsonb(g)) from public.checklist_categories g where g.campaign_id = c.id), '[]'::jsonb),
    'settings', (select to_jsonb(s) from public.campaign_settings s where s.campaign_id = c.id)
  ), actor
  from public.campaigns c
  where c.id = p_campaign_id and c.status = 'active';
  update public.campaigns set
    status = 'archived', archived_at = now(), updated_at = now()
  where id = p_campaign_id and status = 'active'
  returning * into result;
  if result.id is null then raise exception 'CAMPAIGN_NOT_ACTIVE'; end if;
  update public.campaign_members set active = false, left_at = now()
  where campaign_id = p_campaign_id and active;
  return result;
end;
$$;

create or replace function public.get_campaign_board(p_campaign_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'id', c.id,
    'name', c.name,
    'join_code', c.join_code,
    'burger_index', c.burger_index,
    'status', c.status,
    'members', coalesce((
      select jsonb_agg(to_jsonb(m) order by m.active desc, m.joined_at, m.user_id)
      from public.campaign_members m where m.campaign_id = c.id
    ), '[]'::jsonb),
    'resources', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.group_index, r.sort_order, r.id)
      from public.resources r where r.campaign_id = c.id
    ), '[]'::jsonb),
    'checklist_categories', coalesce((
      select jsonb_agg(to_jsonb(g) order by g.sort_order, g.created_at, g.id)
      from public.checklist_categories g where g.campaign_id = c.id
    ), '[]'::jsonb),
    'checklist_items', coalesce((
      select jsonb_agg(to_jsonb(i) order by i.sort_order, i.id)
      from public.checklist_items i where i.campaign_id = c.id
    ), '[]'::jsonb),
    'quests', coalesce((
      select jsonb_agg(
        to_jsonb(q) || jsonb_build_object(
          'submissions', coalesce((
            select jsonb_agg(jsonb_build_object('id', s.id))
            from public.quest_submissions s
            where s.quest_id = q.id and s.reviewed_at is null
          ), '[]'::jsonb)
        ) order by q.sort_order, q.created_at, q.id
      ) from public.quests q where q.campaign_id = c.id
    ), '[]'::jsonb),
    'notes', coalesce((
      select jsonb_agg(to_jsonb(n) order by n.created_at, n.id)
      from public.notes n where n.campaign_id = c.id
    ), '[]'::jsonb),
    'settings', coalesce((
      select to_jsonb(s) from public.campaign_settings s where s.campaign_id = c.id
    ), jsonb_build_object(
      'campaign_id', c.id,
      'section_titles', '{}'::jsonb,
      'hidden_sections', '[]'::jsonb,
      'background_path', null,
      'note_texture_path', null
    )),
    'events', coalesce((
      select jsonb_agg(e.data order by e.id desc)
      from (
        select id, to_jsonb(l) || jsonb_build_object('id', l.id::text) as data
        from public.event_log l
        where l.campaign_id = c.id
        order by id desc limit 31
      ) e
    ), '[]'::jsonb)
  )
  from public.campaigns c where c.id = p_campaign_id;
$$;

alter table public.campaign_settings enable row level security;
alter table public.checklist_categories enable row level security;
revoke all on public.campaign_settings from anon, authenticated;
revoke all on public.checklist_categories from anon, authenticated;
grant select on public.campaign_settings to authenticated;
grant select on public.checklist_categories to authenticated;
grant all on public.campaign_settings to service_role;
grant all on public.checklist_categories to service_role;

create policy read_campaign_settings on public.campaign_settings
for select to authenticated
using (private.current_actor_id() is not null and private.is_member(campaign_id));
create policy read_checklist_categories on public.checklist_categories
for select to authenticated
using (private.current_actor_id() is not null and private.is_member(campaign_id));

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'campaign-media', 'campaign-media', false, 5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy campaign_media_read on storage.objects
for select to authenticated
using (
  bucket_id = 'campaign-media'
  and private.is_member(private.storage_campaign_id(name))
);
create policy campaign_media_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'campaign-media'
  and private.has_role(private.storage_campaign_id(name), 'gm')
);
create policy campaign_media_update on storage.objects
for update to authenticated
using (
  bucket_id = 'campaign-media'
  and private.has_role(private.storage_campaign_id(name), 'gm')
)
with check (
  bucket_id = 'campaign-media'
  and private.has_role(private.storage_campaign_id(name), 'gm')
);
create policy campaign_media_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'campaign-media'
  and private.has_role(private.storage_campaign_id(name), 'gm')
);

drop function if exists public.request_campaign_join(text, text, text);
revoke all on function public.create_campaign_settings() from public, anon, authenticated;
revoke all on function private.storage_campaign_id(text) from public, anon, authenticated;
grant execute on function private.storage_campaign_id(text) to authenticated;
revoke all on function public.request_campaign_join(text, text, text, text) from public, anon, authenticated;
grant execute on function public.request_campaign_join(text, text, text, text) to authenticated;
revoke all on function public.update_member_profile(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.update_member_profile(uuid, text, text, text) to authenticated;
revoke all on function public.remove_campaign_member(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.remove_campaign_member(uuid, uuid, text) to authenticated;
revoke all on function public.set_note_pinned(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.set_note_pinned(uuid, uuid, boolean) to authenticated;
revoke all on function public.save_checklist_category(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.save_checklist_category(uuid, text, uuid) to authenticated;
revoke all on function public.delete_checklist_category(uuid, uuid) from public, anon, authenticated;
grant execute on function public.delete_checklist_category(uuid, uuid) to authenticated;
revoke all on function public.save_checklist_item(uuid, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.save_checklist_item(uuid, text, uuid, uuid) to authenticated;
revoke all on function public.update_campaign_settings(uuid, jsonb, text[], text, text) from public, anon, authenticated;
grant execute on function public.update_campaign_settings(uuid, jsonb, text[], text, text) to authenticated;
