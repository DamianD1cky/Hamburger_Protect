-- Run after the account-management migration. All fixtures roll back.
begin;
set local statement_timeout = '15s';
create function pg_temp.assert_account(ok boolean, detail text)
returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'ACCOUNT_SMOKE_FAILED: %', detail; end if;
end;
$$;
insert into auth.users(id, email, is_anonymous, raw_user_meta_data)
values('e4de0000-0000-4000-8000-000000000001','account-smoke@gm.local',false,'{"displayName":"账号验收"}');
update private.runtime set business_writes = true where singleton;
select set_config('request.jwt.claim.sub','e4de0000-0000-4000-8000-000000000001',true),
       set_config('request.jwt.claims','{"sub":"e4de0000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":false}',true);
set local role authenticated;
select public.ensure_actor();
select public.update_account_profile('  新昵称  ');
select pg_temp.assert_account((select display_name='新昵称' from public.profiles), 'nickname saved');
select pg_temp.assert_account(not has_table_privilege('authenticated','public.profiles','UPDATE'), 'profile table cannot be edited directly');
select pg_temp.assert_account(not has_function_privilege('anon','public.update_account_profile(text)','EXECUTE'), 'anonymous cannot edit nickname');
reset role;
update auth.users set banned_until=now()+interval '1 hour'
where id='e4de0000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.assert_account(private.current_actor_id() is null, 'existing JWT loses identity on ban');
reset role;
update auth.users set banned_until=null,is_anonymous=true
where id='e4de0000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.assert_account(private.current_actor_id() is null, 'Auth anonymous flag denies identity even with old registered JWT');
reset role;
rollback;
select 'account_management_smoke_passed' as result;
