-- Rotate only the requested sticker; moving/resizing it keeps the angle.
alter table public.board_stickers drop constraint board_stickers_rotation_check;
alter table public.board_stickers add constraint board_stickers_rotation_check
  check (rotation between -180 and 180);

create function private.sticker_overhang(p_scale numeric,p_rotation numeric) returns integer
language sql immutable set search_path='' as $$
  select ceil(72*p_scale*(abs(cos(radians(p_rotation::double precision)))+
    abs(sin(radians(p_rotation::double precision)))-1)/2-0.00000001)::integer
$$;
revoke all on function private.sticker_overhang(numeric,numeric) from public,anon,authenticated;

create function public.rotate_board_sticker(p_campaign_id uuid,p_id uuid,p_rotation numeric) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result public.board_stickers; angle numeric; overhang integer;
begin
  perform private.lock_campaign(p_campaign_id);
  if p_rotation is null or p_rotation not between -360000 and 360000 then
    raise exception 'INVALID_STICKER_ROTATION'; end if;
  angle:=round(mod(mod(p_rotation+180,360)+360,360)-180);
  select * into result from public.board_stickers
    where campaign_id=p_campaign_id and id=p_id and private.is_member(p_campaign_id) for update;
  if not found then raise exception 'BOARD_STICKER_NOT_FOUND'; end if;
  overhang:=private.sticker_overhang(result.scale,angle);
  update public.board_stickers set rotation=angle,
    x=greatest(overhang,least(2144-ceil(72*scale)::integer-overhang,x)),
    y=greatest(overhang,least(1206-ceil(72*scale)::integer-overhang,y)),updated_at=clock_timestamp()
    where id=result.id returning * into result;
  return to_jsonb(result);
end;
$$;

create or replace function public.move_board_sticker(p_campaign_id uuid,p_id uuid,p_x integer,p_y integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result public.board_stickers;
begin
  perform private.lock_campaign(p_campaign_id);
  if p_x is null or p_y is null then raise exception 'INVALID_STICKER_POSITION'; end if;
  update public.board_stickers set
    x=greatest(private.sticker_overhang(scale,rotation),
      least(2144-ceil(72*scale)::integer-private.sticker_overhang(scale,rotation),p_x)),
    y=greatest(private.sticker_overhang(scale,rotation),
      least(1206-ceil(72*scale)::integer-private.sticker_overhang(scale,rotation),p_y)),updated_at=clock_timestamp()
    where campaign_id=p_campaign_id and id=p_id and private.is_member(p_campaign_id) returning * into result;
  if result.id is null then raise exception 'BOARD_STICKER_NOT_FOUND'; end if;
  return to_jsonb(result);
end;
$$;
create or replace function public.resize_board_sticker(p_campaign_id uuid,p_id uuid,p_scale numeric) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result public.board_stickers; size numeric;
begin
  perform private.lock_campaign(p_campaign_id);
  if p_scale is null or p_scale not between .5 and 2.5 then raise exception 'INVALID_STICKER_SCALE'; end if;
  size:=round(p_scale,2);
  update public.board_stickers set scale=size,
    x=greatest(private.sticker_overhang(size,rotation),
      least(2144-ceil(72*size)::integer-private.sticker_overhang(size,rotation),x)),
    y=greatest(private.sticker_overhang(size,rotation),
      least(1206-ceil(72*size)::integer-private.sticker_overhang(size,rotation),y)),updated_at=clock_timestamp()
    where campaign_id=p_campaign_id and id=p_id and private.is_member(p_campaign_id) returning * into result;
  if result.id is null then raise exception 'BOARD_STICKER_NOT_FOUND'; end if;
  return to_jsonb(result);
end;
$$;
revoke all on function public.rotate_board_sticker(uuid,uuid,numeric) from public,anon,authenticated;
grant execute on function public.rotate_board_sticker(uuid,uuid,numeric) to authenticated;

-- Each event clock owns its card position; changing one never replaces another.
alter table public.event_clocks add column position jsonb;
alter table public.event_clocks add constraint event_clock_position_check check (
  position is null or coalesce(
    jsonb_typeof(position)='object' and jsonb_typeof(position->'x')='number'
    and jsonb_typeof(position->'y')='number'
    and (position->>'x')::numeric between 8 and 1796
    and (position->>'y')::numeric between 8 and 977
    and (position->>'x')::numeric=trunc((position->>'x')::numeric)
    and (position->>'y')::numeric=trunc((position->>'y')::numeric),false)
);

create function private.allocate_event_clock_position(p_campaign_id uuid,p_id uuid) returns jsonb
language sql volatile set search_path='' as $$
  with settings as (
    select module_layout,hidden_sections from public.campaign_settings where campaign_id=p_campaign_id
  ), anchor as (
    select greatest(8,least(1796,coalesce((module_layout->'index'->>'x')::integer,1081))) x,
      greatest(8,least(977,coalesce((module_layout->'index'->>'y')::integer,357))) y from settings
  ), occupied as (
    select coalesce((s.module_layout->m.key->>'x')::integer,m.x) x,
      coalesce((s.module_layout->m.key->>'y')::integer,m.y) y,m.w,m.h
    from settings s cross join (values
      ('inventory',42,48,410,751),('tasks',491,48,564,525),('shifts',1081,50,340,291),
      ('activity',58,802,395,350),('safety',545,578,540,575)
    ) m(key,x,y,w,h) where not (m.key=any(s.hidden_sections))
    union all select (position->>'x')::integer,(position->>'y')::integer,340,221
      from public.event_clocks where campaign_id=p_campaign_id and id<>p_id and position is not null
  ), candidates as (
    select x,y from anchor
    union select x,y from generate_series(10,1796,10) x cross join generate_series(10,977,10) y
  ), ranked as (
    select c.x,c.y,
      coalesce((select sum(
        greatest(0,least(c.x+340+8,o.x+o.w)-greatest(c.x-8,o.x))::bigint*
        greatest(0,least(c.y+221+8,o.y+o.h)-greatest(c.y-8,o.y))
      ) from occupied o where c.x<o.x+o.w+8 and o.x<c.x+340+8
        and c.y<o.y+o.h+8 and o.y<c.y+221+8),0) overlap,
      (c.x-a.x)::bigint*(c.x-a.x)+(c.y-a.y)::bigint*(c.y-a.y) distance
    from candidates c cross join anchor a
  )
  select jsonb_build_object('x',x,'y',y) from ranked
  order by case when distance=0 and not exists(
    select 1 from public.event_clocks where campaign_id=p_campaign_id and id<>p_id and position is not null
  ) then 0 else 1 end,overlap,distance,y,x limit 1
$$;
revoke all on function private.allocate_event_clock_position(uuid,uuid) from public,anon,authenticated;

-- Backfill in creation order, preserving the first card's former module location.
-- This presentation migration must not invent user actions in the activity log.
alter table public.event_clocks disable trigger event_clock_activity;
do $$
declare item record;
begin
  for item in select id,campaign_id from public.event_clocks order by campaign_id,created_at,id loop
    update public.event_clocks set position=private.allocate_event_clock_position(item.campaign_id,item.id)
      where id=item.id;
  end loop;
end;
$$;
alter table public.event_clocks enable trigger event_clock_activity;
create function private.place_event_clock() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.position is null then
    new.position:=private.allocate_event_clock_position(new.campaign_id,new.id);
  end if;
  return new;
end;
$$;
revoke all on function private.place_event_clock() from public,anon,authenticated;
create trigger place_event_clock before insert on public.event_clocks
  for each row execute function private.place_event_clock();

create or replace function public.get_event_clocks(p_campaign_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if private.current_actor_id() is null or not (
    private.is_member(p_campaign_id) or exists (
      select 1 from public.campaigns c join public.campaign_settings s on s.campaign_id=c.id
      where c.id=p_campaign_id and c.status='active' and s.is_public
    )
  ) then raise exception 'CAMPAIGN_ACCESS_REQUIRED'; end if;
  return coalesce((select jsonb_agg(to_jsonb(c)-array['campaign_id','created_at','updated_at']
    order by created_at,id) from public.event_clocks c where campaign_id=p_campaign_id),'[]'::jsonb);
end;
$$;
create function public.move_event_clock(p_campaign_id uuid,p_id uuid,p_x integer,p_y integer,p_revision integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result public.event_clocks;
begin
  perform private.lock_campaign(p_campaign_id,'gm');
  select * into result from public.event_clocks where id=p_id and campaign_id=p_campaign_id for update;
  if not found then raise exception 'EVENT_CLOCK_NOT_FOUND'; end if;
  if p_revision is distinct from result.revision then raise exception 'EVENT_CLOCK_CONFLICT'; end if;
  if p_x is null or p_y is null or p_x not between 8 and 1796 or p_y not between 8 and 977
    then raise exception 'INVALID_EVENT_CLOCK_POSITION'; end if;
  if result.position is distinct from jsonb_build_object('x',p_x,'y',p_y) then
    update public.event_clocks set position=jsonb_build_object('x',p_x,'y',p_y),
      revision=revision+1,updated_at=clock_timestamp() where id=p_id returning * into result;
  end if;
  return to_jsonb(result)-array['campaign_id','created_at','updated_at'];
end;
$$;
revoke all on function public.move_event_clock(uuid,uuid,integer,integer,integer) from public,anon,authenticated;
grant execute on function public.move_event_clock(uuid,uuid,integer,integer,integer) to authenticated;
