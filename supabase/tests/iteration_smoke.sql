begin;

create temporary table iteration_state(key text primary key, value uuid);
grant all on iteration_state to authenticated;

create function pg_temp.assert_true(p_condition boolean, p_message text)
returns void language plpgsql as $$
begin
  if p_condition is distinct from true then
    raise exception 'ITERATION_TEST_FAILED: %', p_message;
  end if;
end;
$$;

create function pg_temp.expect_denied(p_sql text)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when insufficient_privilege then return;
  when raise_exception then
    if sqlerrm in (
      'GM_REQUIRED', 'CAMPAIGN_ROLE_REQUIRED', 'INVALID_CAMPAIGN_SETTINGS',
      'PLAYER_MEMBER_REQUIRED', 'MEMBER_NOT_ACTIVE'
    ) then return; end if;
    raise;
  end;
  raise exception 'ITERATION_TEST_FAILED: operation unexpectedly allowed';
end;
$$;

select pg_temp.assert_true(
  (select not public and file_size_limit = 5242880
   from storage.buckets where id = 'campaign-media'),
  'campaign media bucket is private and bounded'
);
select pg_temp.assert_true(
  not has_table_privilege('authenticated', 'public.campaign_settings', 'INSERT,UPDATE,DELETE'),
  'clients cannot write room settings directly'
);

insert into auth.users(id, email, is_anonymous, raw_user_meta_data) values
  ('e2de0000-0000-4000-8000-000000000001', 'iteration-gm@gm.local', false, '{}'),
  ('e2de0000-0000-4000-8000-000000000002', null, true, '{}');

select set_config(
  'request.jwt.claim.sub', 'e2de0000-0000-4000-8000-000000000001', true
), set_config(
  'request.jwt.claims',
  '{"sub":"e2de0000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":false}',
  true
);
set local role authenticated;
insert into iteration_state select 'gm', id from public.ensure_actor();
select public.request_gm_access();
reset role;
update public.gm_access set status = 'approved'
where user_id = (select value from iteration_state where key = 'gm');
set local role authenticated;
insert into iteration_state
select 'campaign', id from public.create_campaign('iteration-room', 'Test GM', '店长');
select pg_temp.assert_true(
  exists(select 1 from public.campaign_settings
         where campaign_id = (select value from iteration_state where key = 'campaign')),
  'new room receives settings row'
);

select set_config(
  'request.jwt.claim.sub', 'e2de0000-0000-4000-8000-000000000002', true
), set_config(
  'request.jwt.claims',
  '{"sub":"e2de0000-0000-4000-8000-000000000002","role":"authenticated","is_anonymous":true}',
  true
);
insert into iteration_state select 'player', id from public.ensure_actor();
create temporary table iteration_code(code text);
reset role;
insert into iteration_code
select join_code from public.campaigns
where id = (select value from iteration_state where key = 'campaign');
grant select on iteration_code to authenticated;
set local role authenticated;
insert into iteration_state
select 'request', id from public.request_campaign_join(
  (select code from iteration_code), '自由角色', '流浪记者', '公开角色资料'
);
select set_config(
  'request.jwt.claim.sub', 'e2de0000-0000-4000-8000-000000000001', true
), set_config(
  'request.jwt.claims',
  '{"sub":"e2de0000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":false}',
  true
);
select public.review_campaign_join(
  (select value from iteration_state where key = 'request'), true, ''
);
select pg_temp.assert_true(
  exists(select 1 from public.campaign_members
         where user_id = (select value from iteration_state where key = 'player')
           and job_title = '流浪记者' and profile_text = '公开角色资料'),
  'free title and profile survive approval'
);

insert into iteration_state
select 'category', id from public.save_checklist_category(
  (select value from iteration_state where key = 'campaign'), '开店准备'
);
select public.save_checklist_item(
  (select value from iteration_state where key = 'campaign'),
  '检查冷柜', null,
  (select value from iteration_state where key = 'category')
);
insert into iteration_state
select 'note', public.save_note(
  (select value from iteration_state where key = 'campaign'),
  '重要便签', '内容', 'yellow'
);
select public.set_note_pinned(
  (select value from iteration_state where key = 'campaign'),
  (select value from iteration_state where key = 'note'), true
);
select public.update_campaign_settings(
  (select value from iteration_state where key = 'campaign'),
  '{"tasks":"今晚任务"}', array['activity'],
  (select value::text from iteration_state where key = 'campaign') || '/background.webp',
  null
);
select pg_temp.expect_denied(format(
  'select public.update_campaign_settings(%L,%L,%L,%L,null)',
  (select value from iteration_state where key = 'campaign'), '{}', '{}',
  '00000000-0000-4000-8000-000000000099/background.webp'
));

select set_config(
  'request.jwt.claim.sub', 'e2de0000-0000-4000-8000-000000000002', true
), set_config(
  'request.jwt.claims',
  '{"sub":"e2de0000-0000-4000-8000-000000000002","role":"authenticated","is_anonymous":true}',
  true
);
select public.update_member_profile(
  (select value from iteration_state where key = 'campaign'),
  '自由角色改名', '摄影记者', '更新后的资料'
);
insert into iteration_state
select 'quest', id from (
  select null::uuid id
) empty where false;
reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub', 'e2de0000-0000-4000-8000-000000000001', true
), set_config(
  'request.jwt.claims',
  '{"sub":"e2de0000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":false}',
  true
);
insert into iteration_state
select 'quest', id from public.create_quest(
  (select value from iteration_state where key = 'campaign'),
  '待释放任务', '内容', '待认领', null
);
select set_config(
  'request.jwt.claim.sub', 'e2de0000-0000-4000-8000-000000000002', true
), set_config(
  'request.jwt.claims',
  '{"sub":"e2de0000-0000-4000-8000-000000000002","role":"authenticated","is_anonymous":true}',
  true
);
select public.claim_quest((select value from iteration_state where key = 'quest'));
insert into iteration_state
select 'submission', id from public.submit_quest(
  (select value from iteration_state where key = 'quest'), '待退回报告'
);
select set_config(
  'request.jwt.claim.sub', 'e2de0000-0000-4000-8000-000000000001', true
), set_config(
  'request.jwt.claims',
  '{"sub":"e2de0000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":false}',
  true
);
select public.review_quest_submission(
  (select value from iteration_state where key = 'submission'), false, '请重试'
);
select pg_temp.assert_true(
  (select status = 'failed' from public.quests
   where id = (select value from iteration_state where key = 'quest')),
  'GM can return a submitted task for retry'
);
select public.remove_campaign_member(
  (select value from iteration_state where key = 'campaign'),
  (select value from iteration_state where key = 'player'),
  'iteration test'
);
select pg_temp.assert_true(
  (select status = 'open' and claimed_by is null from public.quests
   where id = (select value from iteration_state where key = 'quest')),
  'removal releases unsubmitted quest'
);
select set_config(
  'request.jwt.claim.sub', 'e2de0000-0000-4000-8000-000000000002', true
), set_config(
  'request.jwt.claims',
  '{"sub":"e2de0000-0000-4000-8000-000000000002","role":"authenticated","is_anonymous":true}',
  true
);
select pg_temp.assert_true(
  public.get_campaign_board((select value from iteration_state where key = 'campaign')) is null,
  'removed player loses board access'
);

reset role;
rollback;
select 'iteration_smoke_passed' as result;
