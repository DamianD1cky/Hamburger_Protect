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

drop function public.request_gm_access(json);
drop trigger gm_review_timestamp on public.gm_access;
drop function public.stamp_gm_review();
drop function public.is_approved_gm(uuid);
drop table public.gm_access;
