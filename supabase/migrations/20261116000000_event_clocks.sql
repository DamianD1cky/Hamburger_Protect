-- General progress clocks, with independent atomic writes and optimistic revisions.
-- The historical burger index is migrated as a named status scale, not a threat.
create table public.event_clocks (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  segments integer not null check (segments between 2 and 24),
  progress integer not null default 0,
  consequence text not null default '' check (char_length(consequence) <= 500),
  color text not null default '#b24b37' check (color ~ '^#[0-9a-fA-F]{6}$'),
  mode text not null default 'progress' check (mode in ('progress','scale')),
  stages jsonb,
  revision integer not null default 1 check (revision >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (progress between 0 and segments),
  check (
    (mode = 'progress' and stages is null and char_length(btrim(consequence)) >= 1)
    or (mode = 'scale' and stages is not null and jsonb_typeof(stages) = 'array' and jsonb_array_length(stages) = segments and progress >= 1)
  )
);
create index event_clocks_campaign_order on public.event_clocks(campaign_id,created_at,id);

-- Only existing campaigns receive the old scale. New campaigns start with no
-- rule-specific defaults; the GM chooses what to track.
insert into public.event_clocks(id,campaign_id,name,segments,progress,color,mode,stages)
select c.id,c.id,'汉堡屋指数',9,c.burger_index,'#406b50','scale',
  (select jsonb_agg(jsonb_build_object(
    'label',case when n<=3 then '红' when n<=6 then '黄' else '绿' end||((n-1)%3+1)::text,
    'color',case when n<=3 then '#ab3326' when n<=6 then '#e7a723' else '#406b50' end,
    'description',case
      when n=1 then '餐厅关闭 · 全员生存力 +1。立即败北，请由 GM 处理结局。'
      when n<=3 then '餐厅关闭 · 全员生存力 +1。餐厅严重受损或遭到破坏。'
      when n<=6 then '有限服务 · 全员无额外加值。发电机供电、停电，或食物即将耗尽。'
      else '正常服务 · 全员智力 +1。电力正常，受到的损害几乎为零。' end
  ) order by n) from generate_series(1,9) n)
from public.campaigns c;

alter table public.event_clocks enable row level security;
revoke all on public.event_clocks from public,anon,authenticated;
grant select on public.event_clocks to authenticated;
grant all on public.event_clocks to service_role;
create policy event_clock_member_read on public.event_clocks for select to authenticated
  using (private.current_actor_id() is not null and private.is_member(campaign_id));

create function public.get_event_clocks(p_campaign_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if private.current_actor_id() is null or not (
    private.is_member(p_campaign_id) or exists (
      select 1 from public.campaigns c join public.campaign_settings s on s.campaign_id=c.id
      where c.id=p_campaign_id and c.status='active' and s.is_public
    )
  ) then raise exception 'CAMPAIGN_ACCESS_REQUIRED'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',id,'name',name,'segments',segments,'progress',progress,'consequence',consequence,
    'color',color,'mode',mode,'stages',stages,'revision',revision
  ) order by created_at,id) from public.event_clocks where campaign_id=p_campaign_id),'[]'::jsonb);
end;
$$;

-- Metadata save uses the revision that was visible when the editor opened.
-- It cannot overwrite a different GM's progress change silently.
create function public.save_event_clock(
  p_campaign_id uuid,p_name text,p_segments integer,p_progress integer,
  p_consequence text,p_color text,p_id uuid default null,p_revision integer default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare result public.event_clocks; current public.event_clocks;
begin
  perform private.lock_campaign(p_campaign_id,'gm');
  if p_id is not null then
    select * into current from public.event_clocks where campaign_id=p_campaign_id and id=p_id for update;
    if not found then raise exception 'EVENT_CLOCK_NOT_FOUND'; end if;
    if p_revision is distinct from current.revision then raise exception 'EVENT_CLOCK_CONFLICT'; end if;
  elsif (select count(*) from public.event_clocks where campaign_id=p_campaign_id)>=24 then
    raise exception 'EVENT_CLOCK_LIMIT';
  end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 80
    or p_segments is null or p_segments not between 2 and 24
    or p_progress is null or p_progress not between 0 and p_segments
    or p_consequence is null or char_length(btrim(p_consequence))>500
    or (coalesce(current.mode,'progress')='progress' and btrim(p_consequence)='')
    or coalesce(p_color,'') !~ '^#[0-9a-fA-F]{6}$'
    or (current.mode='scale' and (p_segments<>current.segments or p_progress<1))
    then raise exception 'INVALID_EVENT_CLOCK'; end if;
  if p_id is null then
    insert into public.event_clocks(campaign_id,name,segments,progress,consequence,color)
    values(p_campaign_id,btrim(p_name),p_segments,p_progress,btrim(p_consequence),lower(p_color))
    returning * into result;
  else
    update public.event_clocks set name=btrim(p_name),segments=p_segments,progress=p_progress,
      consequence=btrim(p_consequence),color=lower(p_color),revision=revision+1,updated_at=clock_timestamp()
      where id=p_id and campaign_id=p_campaign_id returning * into result;
  end if;
  return to_jsonb(result)-array['campaign_id','created_at','updated_at'];
end;
$$;
create function public.set_event_clock_progress(p_campaign_id uuid,p_id uuid,p_progress integer,p_revision integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result public.event_clocks;
begin
  perform private.lock_campaign(p_campaign_id,'gm');
  select * into result from public.event_clocks where id=p_id and campaign_id=p_campaign_id for update;
  if not found then raise exception 'EVENT_CLOCK_NOT_FOUND'; end if;
  if p_revision is distinct from result.revision then raise exception 'EVENT_CLOCK_CONFLICT'; end if;
  if p_progress is null or p_progress not between 0 and result.segments
    or (result.mode='scale' and p_progress<1) then raise exception 'INVALID_EVENT_CLOCK'; end if;
  if p_progress<>result.progress then
    update public.event_clocks set progress=p_progress,revision=revision+1,updated_at=clock_timestamp()
      where id=p_id and campaign_id=p_campaign_id returning * into result;
  end if;
  return to_jsonb(result)-array['campaign_id','created_at','updated_at'];
end;
$$;
create function public.delete_event_clock(p_campaign_id uuid,p_id uuid,p_revision integer)
returns uuid language plpgsql security definer set search_path='' as $$
declare current public.event_clocks;
begin
  perform private.lock_campaign(p_campaign_id,'gm');
  select * into current from public.event_clocks where id=p_id and campaign_id=p_campaign_id for update;
  if not found then raise exception 'EVENT_CLOCK_NOT_FOUND'; end if;
  if p_revision is distinct from current.revision then raise exception 'EVENT_CLOCK_CONFLICT'; end if;
  delete from public.event_clocks where id=p_id and campaign_id=p_campaign_id;
  return p_id;
end;
$$;

create function private.record_event_clock_activity()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  before_value jsonb:=case when tg_op<>'INSERT' then to_jsonb(old)-array['campaign_id','created_at','updated_at','revision','stages'] end;
  after_value jsonb:=case when tg_op<>'DELETE' then to_jsonb(new)-array['campaign_id','created_at','updated_at','revision','stages'] end;
  target jsonb:=coalesce(after_value,before_value);
  event text;
begin
  if before_value is not distinct from after_value then return null; end if;
  event:=case when tg_op='DELETE' then 'event_clock_deleted'
    when new.mode='progress' and new.progress=new.segments and
      (tg_op='INSERT' or old.progress<old.segments) then 'event_clock_completed'
    when tg_op='INSERT' then 'event_clock_created'
    when new.mode='progress' and old.progress=old.segments and new.progress<new.segments then 'event_clock_reopened'
    when old.progress<>new.progress then 'event_clock_progress_changed'
    else 'event_clock_updated' end;
  insert into public.event_log(campaign_id,actor_id,event_type,entity_type,entity_id,payload)
    values(coalesce(new.campaign_id,old.campaign_id),private.current_actor_id(),event,'event_clock',
      (target->>'id')::uuid,jsonb_build_object('before',before_value,'after',after_value));
  return null;
end;
$$;
revoke all on function private.record_event_clock_activity() from public,anon,authenticated;
create trigger event_clock_activity after insert or update or delete on public.event_clocks
  for each row execute function private.record_event_clock_activity();

revoke all on function public.get_event_clocks(uuid),
  public.save_event_clock(uuid,text,integer,integer,text,text,uuid,integer),
  public.set_event_clock_progress(uuid,uuid,integer,integer),public.delete_event_clock(uuid,uuid,integer)
  from public,anon,authenticated;
grant execute on function public.get_event_clocks(uuid),
  public.save_event_clock(uuid,text,integer,integer,text,text,uuid,integer),
  public.set_event_clock_progress(uuid,uuid,integer,integer),public.delete_event_clock(uuid,uuid,integer)
  to authenticated;
