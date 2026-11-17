-- VeilBoard rebrand: preserve existing Crisis Diner boards as explicit appearance
-- rows, while giving newly created campaigns neutral cork + wood defaults and
-- flexible GM role titles.

update public.campaign_settings
set appearance = jsonb_build_object(
  'room', jsonb_build_object(
    'kind', case when background_path is null then 'default' else 'image' end,
    'color', '#202523',
    'imagePath', background_path,
    'fit', 'cover',
    'positionX', 50,
    'positionY', 50,
    'dim', 0.18
  ),
  'surface', jsonb_build_object('kind', 'felt', 'imagePath', null),
  'frame', 'burger'
)
where appearance is null;

alter table public.campaign_settings
  alter column appearance set default jsonb_build_object(
    'room', jsonb_build_object(
      'kind', 'color',
      'color', '#1f2524',
      'imagePath', null,
      'fit', 'cover',
      'positionX', 50,
      'positionY', 50,
      'dim', 0.18
    ),
    'surface', jsonb_build_object('kind', 'cork', 'imagePath', null),
    'frame', 'wood'
  );

create or replace function public.create_campaign_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.campaign_settings(campaign_id, appearance)
  values (
    new.id,
    jsonb_build_object(
      'room', jsonb_build_object(
        'kind', 'color',
        'color', '#1f2524',
        'imagePath', null,
        'fit', 'cover',
        'positionX', 50,
        'positionY', 50,
        'dim', 0.18
      ),
      'surface', jsonb_build_object('kind', 'cork', 'imagePath', null),
      'frame', 'wood'
    )
  )
  on conflict (campaign_id) do nothing;
  return new;
end;
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
    if nickname = '' then nickname := '成员'; end if;
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
  normalized_name text := btrim(coalesce(p_name, ''));
  normalized_char text := btrim(coalesce(p_character_name, ''));
  normalized_job text := coalesce(nullif(btrim(p_job_title), ''), '主持人');
begin
  perform private.require_writes();
  if not exists(
    select 1 from public.gm_access g
    where g.user_id = actor and g.status = 'approved'
  ) then raise exception 'GM_APPROVAL_REQUIRED'; end if;
  if char_length(normalized_name) not between 1 and 80 then
    raise exception 'INVALID_CAMPAIGN_SETTINGS';
  end if;
  if char_length(normalized_char) not between 1 and 40 then
    raise exception 'INVALID_CHARACTER_NAME';
  end if;
  if char_length(normalized_job) not between 1 and 40 then
    raise exception 'INVALID_JOB_TITLE';
  end if;
  loop
    code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    exit when not exists(
      select 1 from public.campaigns where join_code = code
    );
  end loop;
  insert into public.campaigns(name, join_code, created_by)
  values (normalized_name, code, actor) returning * into result;
  insert into public.campaign_members(campaign_id, user_id, role, character_name, job_title)
  values (result.id, actor, 'gm', normalized_char, normalized_job);
  insert into public.event_log(campaign_id, actor_id, event_type, entity_type, entity_id, payload)
  values (result.id, actor, 'campaign_created', 'campaign', result.id,
    jsonb_build_object('job_title', normalized_job));
  return result;
end;
$$;
