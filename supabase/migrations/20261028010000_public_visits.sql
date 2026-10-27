-- R10: GM-controlled public rooms, read-only visitor boards, and visitor messages.

alter table public.campaign_settings
  add column is_public boolean not null default false,
  add column published_at timestamptz;

alter table public.campaign_settings
  add constraint campaign_settings_public_timestamp_check
  check (
    (is_public and published_at is not null)
    or (not is_public and published_at is null)
  );

create table public.visitor_messages (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  display_name text not null
    check (char_length(trim(display_name)) between 1 and 40),
  body text not null
    check (char_length(trim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);

create index visitor_messages_campaign_created
  on public.visitor_messages(campaign_id, created_at desc, id desc);
create index visitor_messages_author_created
  on public.visitor_messages(author_id, created_at desc);

create function private.is_campaign_public(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.campaigns c
    join public.campaign_settings s on s.campaign_id = c.id
    where c.id = target
      and c.status = 'active'
      and s.is_public
  );
$$;

create function private.can_read_campaign_media(object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target uuid;
begin
  target := split_part(object_name, '/', 1)::uuid;
  return private.is_campaign_public(target)
    or (
      private.current_actor_id() is not null
      and private.is_member(target)
    );
exception when invalid_text_representation then
  return false;
end;
$$;

create function public.set_campaign_public(
  p_campaign_id uuid,
  p_is_public boolean
)
returns public.campaign_settings
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  result public.campaign_settings;
begin
  perform private.require_writes();
  perform private.lock_campaign(p_campaign_id, 'gm');
  if p_is_public is null then raise exception 'INVALID_PUBLIC_SETTING'; end if;

  insert into public.campaign_settings(
    campaign_id, is_public, published_at, updated_at
  ) values (
    p_campaign_id,
    p_is_public,
    case when p_is_public then now() else null end,
    now()
  )
  on conflict (campaign_id) do update set
    is_public = excluded.is_public,
    published_at = excluded.published_at,
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
        'section_titles', 'hidden_sections', 'background_path',
        'note_texture_path', 'is_public'
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

create function public.list_public_campaigns()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(item order by published_at desc, id), '[]'::jsonb)
  from (
    select
      c.id,
      c.name,
      c.burger_index,
      s.published_at,
      (
        select count(*)
        from public.visitor_messages vm
        where vm.campaign_id = c.id
      ) as message_count
    from public.campaigns c
    join public.campaign_settings s on s.campaign_id = c.id
    where c.status = 'active' and s.is_public
  ) item;
$$;

create function public.get_public_campaign_board(p_campaign_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', c.id,
    'name', c.name,
    'join_code', '',
    'burger_index', c.burger_index,
    'status', c.status,
    'members', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'user_id', m.user_id,
          'role', m.role,
          'character_name', m.character_name,
          'job_title', m.job_title,
          'profile_text', '',
          'active', m.active,
          'joined_at', m.joined_at,
          'left_at', m.left_at
        ) order by m.active desc, m.joined_at, m.user_id
      )
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
        to_jsonb(q) || jsonb_build_object('submissions', '[]'::jsonb)
        order by q.sort_order, q.created_at, q.id
      )
      from public.quests q where q.campaign_id = c.id
    ), '[]'::jsonb),
    'notes', coalesce((
      select jsonb_agg(to_jsonb(n) order by n.created_at, n.id)
      from public.notes n where n.campaign_id = c.id
    ), '[]'::jsonb),
    'settings', to_jsonb(s),
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
  from public.campaigns c
  join public.campaign_settings s on s.campaign_id = c.id
  where c.id = p_campaign_id
    and c.status = 'active'
    and s.is_public;
$$;

create function public.get_public_activities(
  p_campaign_id uuid,
  p_before bigint default null
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when private.is_campaign_public(p_campaign_id) then coalesce((
      select jsonb_agg(e.data order by e.id desc)
      from (
        select id, to_jsonb(l) || jsonb_build_object('id', l.id::text) as data
        from public.event_log l
        where l.campaign_id = p_campaign_id
          and (p_before is null or l.id < p_before)
        order by l.id desc
        limit 31
      ) e
    ), '[]'::jsonb)
    else '[]'::jsonb
  end;
$$;

create function public.get_visitor_messages(p_campaign_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_campaign_public(p_campaign_id)
    and not private.has_role(p_campaign_id, 'gm') then
    raise exception 'PUBLIC_CAMPAIGN_REQUIRED';
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(item) order by item.created_at desc, item.id desc)
    from (
      select
        vm.id,
        vm.display_name,
        vm.body,
        vm.created_at,
        vm.author_id = private.current_actor_id() as is_own
      from public.visitor_messages vm
      where vm.campaign_id = p_campaign_id
      order by vm.created_at desc, vm.id desc
      limit 100
    ) item
  ), '[]'::jsonb);
end;
$$;

create function public.submit_visitor_message(
  p_campaign_id uuid,
  p_display_name text,
  p_body text
)
returns public.visitor_messages
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor uuid := private.require_actor();
  normalized_name text := trim(coalesce(p_display_name, ''));
  normalized_body text := trim(coalesce(p_body, ''));
  result public.visitor_messages;
begin
  perform private.require_writes();
  perform 1 from public.profiles
    where id = actor and not disabled for update;
  if not found then raise exception 'ACTOR_REQUIRED'; end if;
  if not private.is_campaign_public(p_campaign_id) then
    raise exception 'PUBLIC_CAMPAIGN_REQUIRED';
  end if;
  if char_length(normalized_name) not between 1 and 40
    or char_length(normalized_body) not between 1 and 500 then
    raise exception 'INVALID_VISITOR_MESSAGE';
  end if;
  if exists (
    select 1 from public.visitor_messages
    where author_id = actor and created_at > now() - interval '30 seconds'
  ) then
    raise exception 'VISITOR_MESSAGE_RATE_LIMIT';
  end if;
  insert into public.visitor_messages(
    campaign_id, author_id, display_name, body
  ) values (
    p_campaign_id, actor, normalized_name, normalized_body
  ) returning * into result;
  return result;
end;
$$;

create function public.delete_visitor_message(
  p_campaign_id uuid,
  p_message_id uuid
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.require_writes();
  perform private.lock_campaign(p_campaign_id, 'gm');
  delete from public.visitor_messages
  where id = p_message_id and campaign_id = p_campaign_id;
  if not found then raise exception 'VISITOR_MESSAGE_NOT_FOUND'; end if;
  return p_message_id;
end;
$$;

alter table public.visitor_messages enable row level security;
revoke all on public.visitor_messages from anon, authenticated;
grant all on public.visitor_messages to service_role;

drop policy campaign_media_read on storage.objects;
create policy campaign_media_read on storage.objects
for select to anon, authenticated
using (
  bucket_id = 'campaign-media'
  and private.can_read_campaign_media(name)
);

grant usage on schema private to anon;
revoke all on function private.is_campaign_public(uuid) from public, anon, authenticated;
revoke all on function private.can_read_campaign_media(text) from public, anon, authenticated;
grant execute on function private.can_read_campaign_media(text) to anon, authenticated;

revoke all on function public.set_campaign_public(uuid, boolean) from public, anon, authenticated;
grant execute on function public.set_campaign_public(uuid, boolean) to authenticated;
revoke all on function public.list_public_campaigns() from public, anon, authenticated;
grant execute on function public.list_public_campaigns() to anon, authenticated;
revoke all on function public.get_public_campaign_board(uuid) from public, anon, authenticated;
grant execute on function public.get_public_campaign_board(uuid) to anon, authenticated;
revoke all on function public.get_public_activities(uuid, bigint) from public, anon, authenticated;
grant execute on function public.get_public_activities(uuid, bigint) to anon, authenticated;
revoke all on function public.get_visitor_messages(uuid) from public, anon, authenticated;
grant execute on function public.get_visitor_messages(uuid) to anon, authenticated;
revoke all on function public.submit_visitor_message(uuid, text, text) from public, anon, authenticated;
grant execute on function public.submit_visitor_message(uuid, text, text) to authenticated;
revoke all on function public.delete_visitor_message(uuid, uuid) from public, anon, authenticated;
grant execute on function public.delete_visitor_message(uuid, uuid) to authenticated;
