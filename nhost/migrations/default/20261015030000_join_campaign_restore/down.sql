drop function if exists public.join_campaign(text, text, text, json);

create or replace function public.join_campaign(
  p_join_code text,
  p_character_name text,
  p_job_title text,
  hasura_session json
)
returns text
language plpgsql
volatile
security definer
set search_path = public, auth
as $$
declare
  actor uuid := public.session_user_id(hasura_session);
  target_campaign uuid;
  normalized_job_title text := trim(p_job_title);
  normalized_name text := trim(p_character_name);
begin
  if actor is null then return 'AUTH_REQUIRED'; end if;
  if normalized_job_title not in ('厨师', '维修师', '服务员', '顾客') then
    return 'INVALID_JOB_TITLE';
  end if;
  if char_length(normalized_name) not between 1 and 40 then
    return 'INVALID_CHARACTER_NAME';
  end if;
  select id into target_campaign from public.campaigns
  where join_code = upper(trim(p_join_code)) and status = 'active';
  if target_campaign is null then return 'CAMPAIGN_NOT_FOUND'; end if;
  begin
    insert into public.campaign_members(campaign_id, user_id, role, character_name, job_title)
    values (target_campaign, actor, 'player', normalized_name, normalized_job_title);
  exception
    when unique_violation then return 'ONE_ACTIVE_CAMPAIGN_PER_PLAYER';
  end;
  insert into public.event_log(campaign_id, actor_id, event_type, entity_type, entity_id, payload)
  values (
    target_campaign,
    actor,
    'member_joined',
    'campaign',
    target_campaign,
    jsonb_build_object('job_title', normalized_job_title)
  );
  return 'OK';
end;
$$;

revoke all on function public.join_campaign(text, text, text, json) from public;
