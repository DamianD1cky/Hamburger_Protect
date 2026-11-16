-- Temporary grant and request only. Never review a real applicant.
begin;
set local statement_timeout='20s';
do $identity$
declare identity uuid; actor uuid;
begin
  select p.auth_user_id,p.id into identity,actor from public.profiles p
    join auth.users u on u.id=p.auth_user_id
    where not p.disabled and not coalesce(u.is_anonymous,false)
      and (u.banned_until is null or u.banned_until<now()) limit 1;
  if identity is null then raise exception 'NO_ACTIVE_ACCOUNT_FOR_SMOKE'; end if;
  insert into private.site_admins(user_id,active) values(actor,true)
    on conflict(user_id) do update set active=true;
  perform set_config('request.jwt.claim.sub',identity::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',identity,'is_anonymous',false)::text,true);
end;
$identity$;
insert into public.profiles(id,account_kind,display_name)
  values('99000000-0000-4000-8000-000000000099','member','站长接口验收');
insert into public.gm_access(user_id,account_name,display_name)
  values('99000000-0000-4000-8000-000000000099','site-admin-smoke@gm.local','站长接口验收');
set local role authenticated;
do $smoke$
declare request_at timestamptz; receipt public.gm_access; page jsonb;
begin
  if not public.get_site_admin_access() then raise exception 'SITE_ADMIN_GRANT_NOT_READ'; end if;
  page:=public.list_gm_applications();
  if not (page ? 'applications' and page ? 'has_more') then raise exception 'INVALID_GM_INBOX'; end if;
  -- This synthetic profile has no Auth identity: granting it must fail.
  select g.requested_at into request_at from public.list_gm_applications() p,
    jsonb_to_recordset(p->'applications') as g(user_id uuid,requested_at timestamptz)
    where g.user_id='99000000-0000-4000-8000-000000000099';
  if request_at is null then raise exception 'SMOKE_REQUEST_NOT_LISTED'; end if;
  begin
    perform public.review_gm_application('99000000-0000-4000-8000-000000000099',true,'',request_at);
    raise exception 'INACTIVE_APPLICANT_APPROVED';
  exception when raise_exception then
    if sqlerrm<>'GM_APPLICANT_UNAVAILABLE' then raise; end if;
  end;
  select * into receipt from public.review_gm_application(
    '99000000-0000-4000-8000-000000000099',false,'事务验收，回滚',request_at);
  if receipt.status<>'rejected' or receipt.reviewed_at is null then raise exception 'GM_REVIEW_FAILED'; end if;
  begin
    perform public.review_gm_application('99000000-0000-4000-8000-000000000099',false,'',request_at);
    raise exception 'DOUBLE_REVIEW_ACCEPTED';
  exception when raise_exception then
    if sqlerrm<>'GM_APPLICATION_ALREADY_REVIEWED' then raise; end if;
  end;
end;
$smoke$;
reset role;
do $audit$
begin
  if (select count(*) from private.gm_access_reviews where user_id='99000000-0000-4000-8000-000000000099')<>1
    then raise exception 'GM_REVIEW_AUDIT_FAILED'; end if;
end;
$audit$;
rollback;
select 'passed; temporary grant, applicant and audit rolled back' as smoke;
