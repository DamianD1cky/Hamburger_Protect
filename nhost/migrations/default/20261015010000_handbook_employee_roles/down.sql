drop function if exists public.create_campaign(text, text, text, json);
drop function if exists public.join_campaign(text, text, text, json);

alter table public.campaign_members
  drop constraint if exists campaign_members_job_title_check,
  drop column if exists job_title;

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

revoke all on function public.create_campaign(text, text, json) from public;
revoke all on function public.join_campaign(text, text, json) from public;
