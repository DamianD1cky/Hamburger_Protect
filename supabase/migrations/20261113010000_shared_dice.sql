-- Rolls are immutable server results, never ordinary board events.
create table public.dice_checks (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  created_by uuid not null references public.profiles(id),
  title text not null check (char_length(title) between 1 and 80),
  notation text not null check (char_length(notation) between 1 and 160),
  visibility text not null check (visibility in ('public','gm','blind','self')),
  targets jsonb not null check (jsonb_typeof(targets) = 'array'),
  responses jsonb not null default '{}',
  open boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.dice_rolls (
  id uuid primary key,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  actor_id uuid not null references public.profiles(id),
  actor_name text not null,
  notation text not null check (char_length(notation) between 1 and 160),
  label text not null default '' check (char_length(label) <= 80),
  visibility text not null check (visibility in ('public','gm','blind','self')),
  status text not null default 'pending' check (status in ('pending','complete')),
  result jsonb,
  parent_id uuid references public.dice_rolls(id),
  check_id uuid references public.dice_checks(id),
  revealed_at timestamptz,
  created_at timestamptz not null default now(),
  check ((status = 'complete') = (result is not null))
);
create unique index one_dice_response on public.dice_rolls(check_id,actor_id)
  where check_id is not null;
create index dice_rolls_cursor on public.dice_rolls(campaign_id,created_at desc,id desc);
create index dice_rate_limit on public.dice_rolls(actor_id,created_at desc);
create table public.dice_presets (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  owner_id uuid not null references public.profiles(id),
  name text not null check (char_length(name) between 1 and 40),
  notation text not null check (char_length(notation) between 1 and 160),
  visibility text not null check (visibility in ('public','gm','blind','self')),
  shared boolean not null default false,
  unique(campaign_id,owner_id,name)
);

create function private.dice_member(target uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select private.has_role(target,'gm') or private.has_role(target,'player')
$$;
create function private.dice_visible(target uuid,actor uuid,visibility text,revealed timestamptz)
returns boolean language sql stable security definer set search_path='' as $$
  select private.dice_member(target) and (
    visibility='public' or revealed is not null
    or (visibility='self' and actor=private.current_actor_id())
    or (visibility='gm' and (actor=private.current_actor_id() or private.has_role(target,'gm')))
    or (visibility='blind' and private.has_role(target,'gm'))
  )
$$;
revoke all on function private.dice_member(uuid),private.dice_visible(uuid,uuid,text,timestamptz)
  from public,anon,authenticated;
grant execute on function private.dice_member(uuid),private.dice_visible(uuid,uuid,text,timestamptz)
  to authenticated;

alter table public.dice_rolls enable row level security;
alter table public.dice_checks enable row level security;
alter table public.dice_presets enable row level security;
revoke all on public.dice_rolls,public.dice_checks,public.dice_presets from public,anon,authenticated;
grant select on public.dice_rolls,public.dice_checks,public.dice_presets to authenticated;
grant all on public.dice_rolls,public.dice_checks,public.dice_presets to service_role;
create policy dice_roll_read on public.dice_rolls for select to authenticated using (
  status='complete' and private.dice_visible(campaign_id,actor_id,visibility,revealed_at)
);
create policy dice_check_read on public.dice_checks for select to authenticated
  using (private.dice_member(campaign_id));
create policy dice_preset_read on public.dice_presets for select to authenticated
  using (private.dice_member(campaign_id) and (shared or owner_id=private.current_actor_id()));

create function public.get_dice_roll(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r public.dice_rolls; actor uuid:=private.require_actor();
begin
  select * into r from public.dice_rolls where id=p_id;
  if not found or not private.dice_member(r.campaign_id) then raise exception 'DICE_ACCESS_REQUIRED'; end if;
  if private.dice_visible(r.campaign_id,r.actor_id,r.visibility,r.revealed_at) then return to_jsonb(r); end if;
  if r.actor_id=actor then return to_jsonb(r)-'result'; end if;
  raise exception 'DICE_ACCESS_REQUIRED';
end;
$$;

create function public.get_dice_state(p_campaign_id uuid,p_before timestamptz default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=private.require_actor(); rolls jsonb; presets jsonb; checks jsonb;
begin
  if not private.dice_member(p_campaign_id) then raise exception 'DICE_ACCESS_REQUIRED'; end if;
  select coalesce(jsonb_agg(value order by created_at desc,id desc),'[]') into rolls from (
    select id,created_at,
      case when private.dice_visible(campaign_id,actor_id,visibility,revealed_at)
        then to_jsonb(r) else to_jsonb(r)-'result' end value
    from public.dice_rolls r where campaign_id=p_campaign_id
      and (p_before is null or created_at<p_before)
      and (actor_id=actor or private.dice_visible(campaign_id,actor_id,visibility,revealed_at))
    order by created_at desc,id desc limit 51
  ) items;
  select coalesce(jsonb_agg(to_jsonb(p) order by name),'[]') into presets
    from public.dice_presets p where campaign_id=p_campaign_id and (shared or owner_id=actor);
  select coalesce(jsonb_agg(to_jsonb(c) order by created_at desc),'[]') into checks
    from (select * from public.dice_checks where campaign_id=p_campaign_id order by created_at desc limit 30) c;
  return jsonb_build_object('rolls',rolls,'presets',presets,'checks',checks,'hasMore',jsonb_array_length(rolls)>50);
end;
$$;

create function public.begin_dice_roll(
  p_campaign_id uuid,p_id uuid,p_notation text,p_label text,p_visibility text,
  p_parent_id uuid default null,p_check_id uuid default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_actor(); existing public.dice_rolls; chk public.dice_checks; name_value text;
begin
  perform private.lock_campaign(p_campaign_id);
  perform pg_advisory_xact_lock(hashtextextended(actor::text,1));
  if p_id is null or p_notation is null or char_length(p_notation) not between 1 and 160
    or p_label is null or char_length(p_label)>80
    or coalesce(p_visibility,'') not in ('public','gm','blind','self') then raise exception 'INVALID_DICE_INPUT'; end if;
  select * into existing from public.dice_rolls where id=p_id;
  if found then
    if existing.actor_id<>actor or existing.campaign_id<>p_campaign_id
      or existing.notation<>p_notation or existing.label<>p_label or existing.visibility<>p_visibility
      or existing.check_id is distinct from p_check_id or existing.parent_id is distinct from p_parent_id
      then raise exception 'DICE_REQUEST_CONFLICT'; end if;
    return public.get_dice_roll(existing.id);
  end if;
  if p_check_id is not null then
    select * into chk from public.dice_checks where id=p_check_id and campaign_id=p_campaign_id for update;
    if not found or not chk.open or not exists(
      select 1 from jsonb_array_elements(chk.targets) t where t->>'id'=actor::text
    ) then raise exception 'DICE_CHECK_NOT_AVAILABLE'; end if;
    if p_notation<>chk.notation or p_visibility<>chk.visibility then raise exception 'DICE_CHECK_RULE_MISMATCH'; end if;
    select * into existing from public.dice_rolls where check_id=p_check_id and actor_id=actor;
    if found then return public.get_dice_roll(existing.id); end if;
  end if;
  if p_parent_id is not null and not exists(
    select 1 from public.dice_rolls r where r.id=p_parent_id and r.campaign_id=p_campaign_id
      and private.dice_visible(r.campaign_id,r.actor_id,r.visibility,r.revealed_at)
  ) then raise exception 'DICE_ACCESS_REQUIRED'; end if;
  if (select count(*) from public.dice_rolls where actor_id=actor and created_at>now()-interval '1 minute')>=30
    then raise exception 'DICE_RATE_LIMIT'; end if;
  select character_name into name_value from public.campaign_members where campaign_id=p_campaign_id and user_id=actor;
  insert into public.dice_rolls(id,campaign_id,actor_id,actor_name,notation,label,visibility,parent_id,check_id)
    values(p_id,p_campaign_id,actor,name_value,p_notation,p_label,p_visibility,p_parent_id,p_check_id);
  return public.get_dice_roll(p_id);
end;
$$;

-- Only the Edge Function's service role may finalize a result.
create function public.finish_dice_roll(p_id uuid,p_result jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare r public.dice_rolls;
begin
  select * into r from public.dice_rolls where id=p_id for update;
  if not found then raise exception 'DICE_NOT_FOUND'; end if;
  if r.status='complete' then return; end if;
  if not exists(select 1 from public.campaigns where id=r.campaign_id and status='active')
    or not exists(select 1 from public.campaign_members where campaign_id=r.campaign_id and user_id=r.actor_id and active and role in ('gm','player'))
    then raise exception 'DICE_ACCESS_REQUIRED'; end if;
  if p_result is null or jsonb_typeof(p_result->'total') is distinct from 'number'
    or jsonb_typeof(p_result->'dice') is distinct from 'array'
    or jsonb_array_length(p_result->'dice')>1000 then raise exception 'INVALID_DICE_RESULT'; end if;
  update public.dice_rolls set result=p_result,status='complete' where id=p_id;
  if r.check_id is not null then
    update public.dice_checks set responses=responses||jsonb_build_object(r.actor_id::text,true) where id=r.check_id;
  end if;
end;
$$;

create function public.reveal_dice_roll(p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.dice_rolls; actor uuid:=private.require_actor();
begin
  select * into r from public.dice_rolls where id=p_id for update;
  if not found then raise exception 'DICE_NOT_FOUND'; end if;
  perform private.lock_campaign(r.campaign_id);
  if not ((r.visibility='self' and r.actor_id=actor)
    or (r.visibility='blind' and private.has_role(r.campaign_id,'gm'))
    or (r.visibility in ('public','gm') and (r.actor_id=actor or private.has_role(r.campaign_id,'gm'))))
    then raise exception 'DICE_ACCESS_REQUIRED'; end if;
  update public.dice_rolls set revealed_at=coalesce(revealed_at,now()) where id=p_id;
  return public.get_dice_roll(p_id);
end;
$$;

create function public.save_dice_preset(p_campaign_id uuid,p_name text,p_notation text,p_visibility text,p_shared boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result public.dice_presets; actor uuid:=private.require_actor();
begin
  perform private.lock_campaign(p_campaign_id);
  if p_shared and not private.has_role(p_campaign_id,'gm') then raise exception 'CAMPAIGN_ROLE_REQUIRED'; end if;
  if (select count(*) from public.dice_presets where campaign_id=p_campaign_id and owner_id=actor)>=30
    and not exists(select 1 from public.dice_presets where campaign_id=p_campaign_id and owner_id=actor and name=p_name)
    then raise exception 'DICE_PRESET_LIMIT'; end if;
  insert into public.dice_presets(campaign_id,owner_id,name,notation,visibility,shared)
  values(p_campaign_id,actor,p_name,p_notation,p_visibility,p_shared)
  on conflict(campaign_id,owner_id,name) do update set notation=excluded.notation,visibility=excluded.visibility,shared=excluded.shared
  returning * into result;
  return to_jsonb(result);
end;
$$;
create function public.delete_dice_preset(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare p public.dice_presets;
begin
  select * into p from public.dice_presets where id=p_id;
  perform private.lock_campaign(p.campaign_id);
  if p.owner_id<>private.current_actor_id() then raise exception 'DICE_ACCESS_REQUIRED'; end if;
  delete from public.dice_presets where id=p_id;
end;
$$;
create function public.create_dice_check(p_campaign_id uuid,p_title text,p_notation text,p_visibility text,p_targets uuid[] default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare targets_value jsonb; result public.dice_checks;
begin
  perform private.lock_campaign(p_campaign_id,'gm');
  if (select count(*) from public.dice_checks where campaign_id=p_campaign_id and open)>=10 then raise exception 'DICE_CHECK_LIMIT'; end if;
  select jsonb_agg(jsonb_build_object('id',user_id,'name',character_name) order by character_name) into targets_value
    from public.campaign_members where campaign_id=p_campaign_id and active and role='player'
    and (p_targets is null or user_id=any(p_targets));
  if targets_value is null or jsonb_array_length(targets_value)>64 then raise exception 'DICE_CHECK_TARGETS_REQUIRED'; end if;
  insert into public.dice_checks(campaign_id,created_by,title,notation,visibility,targets)
  values(p_campaign_id,private.current_actor_id(),p_title,p_notation,p_visibility,targets_value) returning * into result;
  return to_jsonb(result);
end;
$$;
create function public.close_dice_check(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform private.lock_campaign((select campaign_id from public.dice_checks where id=p_id),'gm');
  update public.dice_checks set open=false where id=p_id;
end;
$$;

revoke all on function public.get_dice_roll(uuid),public.get_dice_state(uuid,timestamptz),
  public.begin_dice_roll(uuid,uuid,text,text,text,uuid,uuid),public.finish_dice_roll(uuid,jsonb),
  public.reveal_dice_roll(uuid),public.save_dice_preset(uuid,text,text,text,boolean),
  public.delete_dice_preset(uuid),public.create_dice_check(uuid,text,text,text,uuid[]),public.close_dice_check(uuid)
  from public,anon,authenticated;
grant execute on function public.get_dice_roll(uuid),public.get_dice_state(uuid,timestamptz),
  public.begin_dice_roll(uuid,uuid,text,text,text,uuid,uuid),public.reveal_dice_roll(uuid),
  public.save_dice_preset(uuid,text,text,text,boolean),public.delete_dice_preset(uuid),
  public.create_dice_check(uuid,text,text,text,uuid[]),public.close_dice_check(uuid) to authenticated;
grant execute on function public.finish_dice_roll(uuid,jsonb) to service_role;

-- PGlite has no replication publication; production Realtime is enabled here.
do $$
begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    alter publication supabase_realtime add table public.dice_rolls,public.dice_checks,public.dice_presets;
  end if;
end;
$$;
