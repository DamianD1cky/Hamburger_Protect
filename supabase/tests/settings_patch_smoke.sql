-- Uses a temporary room; all writes and activity records are rolled back.
begin;
set local statement_timeout='20s';
do $identity$
declare identity uuid;
begin
  select p.auth_user_id into identity from public.profiles p
    join public.gm_access g on g.user_id=p.id and g.status='approved'
    join auth.users a on a.id=p.auth_user_id
    where not p.disabled and not a.is_anonymous and (a.banned_until is null or a.banned_until<now()) limit 1;
  if identity is null then raise exception 'NO_ACTIVE_GM_FOR_SMOKE'; end if;
  perform set_config('request.jwt.claim.sub',identity::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',identity,'is_anonymous',false)::text,true);
end;
$identity$;
set local role authenticated;
do $smoke$
declare room uuid; settings public.campaign_settings; social jsonb;
begin
  select id into room from public.create_campaign('配置事务验收','验收 GM','店长');
  perform public.move_board_module(room,'tasks',1600,50);
  perform public.patch_campaign_settings(room,'{"sectionTitles":{"tasks":"任务"}}','{"sectionTitles":{"tasks":null}}');
  perform public.patch_campaign_settings(room,'{"sectionTitles":{"inventory":"补给"}}','{"sectionTitles":{"inventory":null}}');
  select * into settings from public.campaign_settings where campaign_id=room;
  if settings.section_titles<>'{"tasks":"任务","inventory":"补给"}'::jsonb
    or settings.module_layout->'tasks'<>'{"x":1600,"y":50}'::jsonb then raise exception 'PATCH_OVERWROTE_OTHER_FIELDS'; end if;
  begin
    perform public.patch_campaign_settings(room,'{"sectionTitles":{"inventory":"旧草稿"}}','{"sectionTitles":{"inventory":null}}');
    raise exception 'STALE_PATCH_NOT_REJECTED';
  exception when raise_exception then
    if sqlerrm<>'CAMPAIGN_SETTINGS_CONFLICT' then raise; end if;
  end;
  perform public.patch_campaign_settings(room,'{"sectionTitles":{"inventory":null}}','{"sectionTitles":{"inventory":"补给"}}');
  if (select section_titles from public.campaign_settings where campaign_id=room)<>'{"tasks":"任务"}'::jsonb
    then raise exception 'PATCH_DEFAULT_RESET_FAILED'; end if;
  social:=public.get_dice_social(room);
  if not (social ? 'server_time' and social ? 'rolling_until') or jsonb_array_length(social->'rolling_until')<>0
    then raise exception 'SOCIAL_EXPIRY_RESPONSE_FAILED'; end if;
end;
$smoke$;
reset role;
rollback;
select 'passed; settings patch and social expiry writes rolled back' as smoke;
