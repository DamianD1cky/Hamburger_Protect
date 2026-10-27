begin;

create temporary table public_visit_state(key text primary key, value uuid);
grant all on public_visit_state to authenticated;
grant select on public_visit_state to anon;

create function pg_temp.assert_true(p_condition boolean, p_message text)
returns void language plpgsql as $$
begin
  if p_condition is distinct from true then
    raise exception 'PUBLIC_VISIT_TEST_FAILED: %', p_message;
  end if;
end;
$$;

create function pg_temp.expect_denied(p_sql text)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception
    when insufficient_privilege then return;
    when raise_exception then
      if sqlerrm in (
        'GM_REQUIRED', 'CAMPAIGN_ROLE_REQUIRED', 'PUBLIC_CAMPAIGN_REQUIRED',
        'VISITOR_MESSAGE_RATE_LIMIT'
      ) then return; end if;
      raise;
  end;
  raise exception 'PUBLIC_VISIT_TEST_FAILED: operation unexpectedly allowed';
end;
$$;

select pg_temp.assert_true(
  (select relrowsecurity from pg_class
   where oid = 'public.visitor_messages'::regclass),
  'visitor messages must enable RLS'
);
select pg_temp.assert_true(
  not has_table_privilege(
    'authenticated', 'public.visitor_messages', 'INSERT,UPDATE,DELETE'
  ),
  'clients cannot write visitor messages directly'
);

insert into auth.users(id, email, is_anonymous, raw_user_meta_data) values
  ('e3de0000-0000-4000-8000-000000000001', 'public-visit-gm@gm.local', false, '{}'),
  ('e3de0000-0000-4000-8000-000000000002', null, true, '{}');

select set_config(
  'request.jwt.claim.sub', 'e3de0000-0000-4000-8000-000000000001', true
), set_config(
  'request.jwt.claims',
  '{"sub":"e3de0000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":false}',
  true
);
set local role authenticated;
insert into public_visit_state select 'gm', id from public.ensure_actor();
select public.request_gm_access();
reset role;
update public.gm_access set status = 'approved'
where user_id = (select value from public_visit_state where key = 'gm');
set local role authenticated;
insert into public_visit_state
select 'campaign', id
from public.create_campaign('public-visit-smoke', 'Public GM', '店长');
insert into public_visit_state
select 'note', public.save_note(
  (select value from public_visit_state where key = 'campaign'),
  '公开便签', '公开内容', 'yellow'
);
insert into public_visit_state
select 'quest', id from public.create_quest(
  (select value from public_visit_state where key = 'campaign'),
  '公开任务', '公开任务内容', '待认领', null
);
select public.set_campaign_public(
  (select value from public_visit_state where key = 'campaign'), true
);

reset role;
select set_config('request.jwt.claim.sub', '', true),
  set_config('request.jwt.claims', '{}', true);
set local role anon;
select pg_temp.assert_true(
  jsonb_array_length(public.list_public_campaigns()) = 1,
  'signed-out discovery lists the opted-in room'
);
select pg_temp.assert_true(
  (
    public.get_public_campaign_board(
      (select value from public_visit_state where key = 'campaign')
    )->>'join_code'
  ) = '',
  'public board does not reveal join code'
);
select pg_temp.assert_true(
  jsonb_array_length(
    public.get_public_campaign_board(
      (select value from public_visit_state where key = 'campaign')
    )->'notes'
  ) = 1,
  'signed-out visitor reads board notes'
);
select pg_temp.assert_true(
  private.can_read_campaign_media(
    (select value::text from public_visit_state where key = 'campaign')
      || '/background.webp'
  ),
  'signed-out visitor can request public room media'
);

reset role;
select set_config(
  'request.jwt.claim.sub', 'e3de0000-0000-4000-8000-000000000002', true
), set_config(
  'request.jwt.claims',
  '{"sub":"e3de0000-0000-4000-8000-000000000002","role":"authenticated","is_anonymous":true}',
  true
);
set local role authenticated;
insert into public_visit_state select 'visitor', id from public.ensure_actor();
insert into public_visit_state
select 'message', id from public.submit_visitor_message(
  (select value from public_visit_state where key = 'campaign'),
  'Smoke 访客', '生产事务留言'
);
select pg_temp.expect_denied(format(
  'select public.submit_visitor_message(%L,%L,%L)',
  (select value from public_visit_state where key = 'campaign'),
  'Smoke 访客', '连续留言'
));
select pg_temp.expect_denied(format(
  'select public.delete_visitor_message(%L,%L)',
  (select value from public_visit_state where key = 'campaign'),
  (select value from public_visit_state where key = 'message')
));

select set_config(
  'request.jwt.claim.sub', 'e3de0000-0000-4000-8000-000000000001', true
), set_config(
  'request.jwt.claims',
  '{"sub":"e3de0000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":false}',
  true
);
select public.set_campaign_public(
  (select value from public_visit_state where key = 'campaign'), false
);
select pg_temp.assert_true(
  jsonb_array_length(public.get_visitor_messages(
    (select value from public_visit_state where key = 'campaign')
  )) = 1,
  'GM can moderate messages after closing public access'
);
select public.delete_visitor_message(
  (select value from public_visit_state where key = 'campaign'),
  (select value from public_visit_state where key = 'message')
);

reset role;
select set_config('request.jwt.claim.sub', '', true),
  set_config('request.jwt.claims', '{}', true);
set local role anon;
select pg_temp.assert_true(
  public.get_public_campaign_board(
    (select value from public_visit_state where key = 'campaign')
  ) is null,
  'closing public access hides the board immediately'
);
select pg_temp.assert_true(
  not private.can_read_campaign_media(
    (select value::text from public_visit_state where key = 'campaign')
      || '/background.webp'
  ),
  'closing public access blocks new media signatures'
);

reset role;
rollback;
select 'public_visits_smoke_passed' as result;
