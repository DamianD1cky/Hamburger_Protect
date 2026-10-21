create or replace function public.join_campaign(
  p_join_code text,
  p_character_name text,
  p_job_title text,
  hasura_session json
)
returns public.campaign_members
language plpgsql
volatile
security definer
set search_path = public, auth
as $$
declare
  actor uuid := public.session_user_id(hasura_session);
  target_campaign uuid;
  normalized_job_title text := trim(p_job_title);
  result public.campaign_members;
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if normalized_job_title not in ('厨师', '维修师', '服务员', '顾客') then
    raise exception 'INVALID_JOB_TITLE';
  end if;
  select id into target_campaign from public.campaigns
  where join_code = upper(trim(p_join_code)) and status = 'active';
  if target_campaign is null then raise exception 'CAMPAIGN_NOT_FOUND'; end if;
  insert into public.campaign_members(campaign_id, user_id, role, character_name, job_title)
  values (target_campaign, actor, 'player', trim(p_character_name), normalized_job_title)
  returning * into result;
  insert into public.event_log(campaign_id, actor_id, event_type, entity_type, entity_id, payload)
  values (
    target_campaign,
    actor,
    'member_joined',
    'campaign',
    target_campaign,
    jsonb_build_object('job_title', normalized_job_title)
  );
  return result;
end;
$$;


drop trigger close_join_requests on public.campaigns;
drop function public.close_campaign_join_requests();
drop function public.cancel_campaign_join(uuid, json);
drop function public.review_campaign_join(uuid, boolean, text, json);
drop function public.request_campaign_join(text, text, text, json);
drop table public.campaign_join_requests;
