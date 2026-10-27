-- Runs against the real Supabase Auth schema. All fixtures and writes roll back.
begin;
create temporary table migration_test_state(key text primary key,value uuid);
grant all on migration_test_state to authenticated;
create function pg_temp.assert_true(p_condition boolean,p_message text) returns void language plpgsql as $$
begin if p_condition is distinct from true then raise exception 'CLOUD_TEST_FAILED: %',p_message; end if; end;
$$;
create function pg_temp.expect_denied(p_sql text) returns void language plpgsql as $$
begin
 begin execute p_sql;
 exception when insufficient_privilege then return;
 when raise_exception then
  if sqlerrm in ('GM_APPROVAL_REQUIRED','GM_REQUIRED','CAMPAIGN_ROLE_REQUIRED','CAMPAIGN_NOT_ACTIVE','QUEST_NOT_CLAIMABLE','QUEST_NOT_SUBMITTABLE') then return; end if;
  raise;
 end;
 raise exception 'CLOUD_TEST_FAILED: operation unexpectedly allowed';
end;
$$;
select pg_temp.assert_true((select count(*)=14 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity),'all app tables enable RLS');
select pg_temp.assert_true(not has_table_privilege('authenticated','public.quests','UPDATE'),'client cannot edit quest directly');
select pg_temp.assert_true(not has_function_privilege('authenticated','public.complete_identity_migration(uuid,uuid)','EXECUTE'),'identity binding is server only');
insert into auth.users(id,email,is_anonymous,raw_user_meta_data) values
 ('e1de0000-0000-4000-8000-000000000001','cloud-test-1@gm.local',false,'{}'),
 ('e1de0000-0000-4000-8000-000000000002','cloud-test-2@gm.local',false,'{}'),
 ('e1de0000-0000-4000-8000-000000000003',null,true,'{}'),
 ('e1de0000-0000-4000-8000-000000000004',null,true,'{}');
update private.runtime set business_writes=true where singleton;
select set_config('request.jwt.claim.sub','e1de0000-0000-4000-8000-000000000001',true),set_config('request.jwt.claims','{"sub":"e1de0000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":false}',true);
set local role authenticated;
select public.ensure_actor();
select public.request_gm_access();
insert into migration_test_state select 'gm1',id from public.profiles;
select pg_temp.expect_denied($q$select public.create_campaign('test','GM','店长')$q$);
reset role;
update public.gm_access set status='approved' where user_id=(select value from migration_test_state where key='gm1');
set local role authenticated;
insert into migration_test_state select 'campaign1',id from public.create_campaign('cloud-test-1','GM','店长');
select set_config('request.jwt.claim.sub','e1de0000-0000-4000-8000-000000000002',true),set_config('request.jwt.claims','{"sub":"e1de0000-0000-4000-8000-000000000002","role":"authenticated","is_anonymous":false}',true);
select public.ensure_actor();select public.request_gm_access();
insert into migration_test_state select 'gm2',id from public.profiles;
reset role;
update public.gm_access set status='approved' where user_id=(select value from migration_test_state where key='gm2');
set local role authenticated;
insert into migration_test_state select 'campaign2',id from public.create_campaign('cloud-test-2','GM','店长');
select pg_temp.assert_true(public.get_campaign_board((select value from migration_test_state where key='campaign1')) is null,'other GM cannot read board');
select set_config('request.jwt.claim.sub','e1de0000-0000-4000-8000-000000000003',true),set_config('request.jwt.claims','{"sub":"e1de0000-0000-4000-8000-000000000003","role":"authenticated","is_anonymous":true}',true);
select public.ensure_actor();
insert into migration_test_state select 'player1',id from public.profiles;
select pg_temp.assert_true(public.get_campaign_board((select value from migration_test_state where key='campaign1')) is null,'unapproved player cannot read board');
-- Test setup obtains join code with owner privileges, then switches back to caller.
reset role;
insert into migration_test_state select 'code1',id from public.campaigns where id=(select value from migration_test_state where key='campaign1');
create temporary table migration_test_code(code text);
insert into migration_test_code select join_code from public.campaigns where id=(select value from migration_test_state where key='campaign1');
grant select on migration_test_code to authenticated;
set local role authenticated;
insert into migration_test_state select 'request1',id from public.request_campaign_join((select code from migration_test_code),'player1','厨师');
select pg_temp.expect_denied(format('select public.review_campaign_join(%L,true,%L)',(select value from migration_test_state where key='request1'),''));
select set_config('request.jwt.claim.sub','e1de0000-0000-4000-8000-000000000004',true),set_config('request.jwt.claims','{"sub":"e1de0000-0000-4000-8000-000000000004","role":"authenticated","is_anonymous":true}',true);
select public.ensure_actor();
insert into migration_test_state select 'player2',id from public.profiles;
insert into migration_test_state select 'request2',id from public.request_campaign_join((select code from migration_test_code),'player2','服务员');
select set_config('request.jwt.claim.sub','e1de0000-0000-4000-8000-000000000001',true),set_config('request.jwt.claims','{"sub":"e1de0000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":false}',true);
select public.review_campaign_join((select value from migration_test_state where key='request1'),true,'');
select public.review_campaign_join((select value from migration_test_state where key='request2'),true,'');
insert into migration_test_state select 'quest',id from public.create_quest((select value from migration_test_state where key='campaign1'),'task','body','待认领',null);
select set_config('request.jwt.claim.sub','e1de0000-0000-4000-8000-000000000003',true),set_config('request.jwt.claims','{"sub":"e1de0000-0000-4000-8000-000000000003","role":"authenticated","is_anonymous":true}',true);
select pg_temp.assert_true(jsonb_array_length(public.get_campaign_board((select value from migration_test_state where key='campaign1'))->'members')=3,'approved player sees members');
select public.claim_quest((select value from migration_test_state where key='quest'));
insert into migration_test_state select 'submission',id from public.submit_quest((select value from migration_test_state where key='quest'),'cloud-private-report');
select pg_temp.assert_true((select count(*)=1 from public.quest_submissions),'player sees own report');
select set_config('request.jwt.claim.sub','e1de0000-0000-4000-8000-000000000004',true),set_config('request.jwt.claims','{"sub":"e1de0000-0000-4000-8000-000000000004","role":"authenticated","is_anonymous":true}',true);
select pg_temp.assert_true((select count(*)=0 from public.quest_submissions),'other player cannot read report');
select pg_temp.expect_denied(format('select public.claim_quest(%L)',(select value from migration_test_state where key='quest')));
select pg_temp.assert_true(public.get_activities((select value from migration_test_state where key='campaign1'))::text not like '%cloud-private-report%','shared log hides report');
select set_config('request.jwt.claim.sub','e1de0000-0000-4000-8000-000000000001',true),set_config('request.jwt.claims','{"sub":"e1de0000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":false}',true);
select public.review_quest_submission((select value from migration_test_state where key='submission'),true,'');
select public.archive_campaign((select value from migration_test_state where key='campaign1'));
select pg_temp.assert_true((select count(*)=1 from public.campaign_archives),'GM retains archive access after active membership ends');
reset role;
update public.gm_access set status='revoked' where user_id=(select value from migration_test_state where key='gm1');
set local role authenticated;
select pg_temp.assert_true((select count(*)=0 from public.campaign_archives),'revoked GM loses archive access');
select set_config('request.jwt.claim.sub','e1de0000-0000-4000-8000-000000000003',true),set_config('request.jwt.claims','{"sub":"e1de0000-0000-4000-8000-000000000003","role":"authenticated","is_anonymous":true}',true);
select pg_temp.assert_true((select count(*)=0 from public.campaign_archives),'player cannot read full archive');
select pg_temp.assert_true(not(public.get_archive_summary((select value from migration_test_state where key='campaign1'))?'snapshot'),'player summary contains no snapshot');
select pg_temp.expect_denied(format('select public.submit_quest(%L,%L)',(select value from migration_test_state where key='quest'),'archived'));
reset role;
rollback;
select 'cloud_smoke_passed' as result;
