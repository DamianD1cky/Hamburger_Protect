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
  insert into public.resources(campaign_id, name, quantity, group_index, sort_order) values
    (result.id, '面包胚', '300 个', 0, 10),
    (result.id, '牛肉饼', '200 片', 0, 20),
    (result.id, '芝士片', '150 片', 0, 30),
    (result.id, '饮用水', '8 箱', 0, 40),
    (result.id, '急救用品', '1 套', 0, 50),
    (result.id, '桌椅路障', '12 组', 1, 10),
    (result.id, '木板与钉子', '24 件', 1, 20),
    (result.id, '维修工具', '2 箱', 1, 30),
    (result.id, '备用燃料', '1 桶', 1, 40),
    (result.id, '应急照明', '6 盏', 1, 50),
    (result.id, '对讲机', '6 部', 2, 10),
    (result.id, '备用电池', '18 节', 2, 20),
    (result.id, '清洁用品', '1 车', 2, 30),
    (result.id, '灭火器', '4 具', 2, 40),
    (result.id, '员工汉堡', '按需制作', 2, 50);
  insert into public.checklist_items(campaign_id, label, sort_order) values
    (result.id, '入口、窗户和员工通道已加固', 10),
    (result.id, '冷藏柜、炉具及燃气状态已检查', 20),
    (result.id, '应急电源与备用照明可用', 30),
    (result.id, '仓库工具和可替代物资已盘点', 40),
    (result.id, '通信设备保持监听', 50),
    (result.id, '异常顾客已识别并隔离', 60),
    (result.id, '员工饮水、进食与短休已安排', 70),
    (result.id, '危险行动已进行后果评估', 80),
    (result.id, '物资消耗已写入工作记录', 90),
    (result.id, '最新公司指示来源已确认', 100),
    (result.id, '无明确行动人员正在制作汉堡', 110);
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
