-- One latest reaction per member: bounded, authenticated and room-scoped.
create table public.dice_reactions (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  actor_id uuid not null references public.profiles(id),
  emoji text not null check (emoji in ('👏','🔥','😂','😱','🍀','💪')),
  sent_at timestamptz not null default clock_timestamp(),
  primary key(campaign_id,actor_id)
);
alter table public.dice_reactions enable row level security;
revoke all on public.dice_reactions from public,anon,authenticated;
grant select on public.dice_reactions to authenticated;
grant all on public.dice_reactions to service_role;
create policy dice_reaction_read on public.dice_reactions for select to authenticated
  using (private.dice_member(campaign_id));

create function public.send_dice_reaction(p_campaign_id uuid,p_emoji text) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_actor(); previous timestamptz;
begin
  perform private.lock_campaign(p_campaign_id);
  if not private.dice_member(p_campaign_id) then raise exception 'DICE_ACCESS_REQUIRED'; end if;
  if coalesce(p_emoji,'') not in ('👏','🔥','😂','😱','🍀','💪') then raise exception 'INVALID_DICE_REACTION'; end if;
  if exists(select 1 from public.dice_rolls where campaign_id=p_campaign_id and actor_id=actor
    and status='pending' and created_at>now()-interval '20 seconds') then raise exception 'DICE_STILL_ROLLING'; end if;
  select sent_at into previous from public.dice_reactions where campaign_id=p_campaign_id and actor_id=actor;
  if previous>clock_timestamp()-interval '1 second' then raise exception 'DICE_REACTION_RATE_LIMIT'; end if;
  insert into public.dice_reactions(campaign_id,actor_id,emoji) values(p_campaign_id,actor,p_emoji)
    on conflict(campaign_id,actor_id) do update set emoji=excluded.emoji,sent_at=clock_timestamp();
end;
$$;
create function public.get_dice_social(p_campaign_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if not private.dice_member(p_campaign_id) then raise exception 'DICE_ACCESS_REQUIRED'; end if;
  select jsonb_build_object(
    'rolling',coalesce((select jsonb_agg(actor_id) from (
      select distinct actor_id from public.dice_rolls r where campaign_id=p_campaign_id
        and ((status='pending' and created_at>now()-interval '20 seconds')
          or (status='complete' and created_at>now()-interval '6 seconds'))
        and (actor_id=private.current_actor_id() or private.dice_visible(campaign_id,actor_id,visibility,revealed_at))
    ) active),'[]'::jsonb),
    'reactions',coalesce((select jsonb_agg(jsonb_build_object('actor_id',actor_id,'emoji',emoji,'sent_at',sent_at))
      from public.dice_reactions where campaign_id=p_campaign_id and sent_at>now()-interval '4 seconds'),'[]'::jsonb)
  ) into result;
  return result;
end;
$$;
revoke all on function public.send_dice_reaction(uuid,text),public.get_dice_social(uuid) from public,anon,authenticated;
grant execute on function public.send_dice_reaction(uuid,text),public.get_dice_social(uuid) to authenticated;
do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    alter publication supabase_realtime add table public.dice_reactions;
  end if;
end $$;

alter table public.board_stickers add column scale numeric not null default 1
  check (scale between 0.5 and 2.5);
alter table public.board_stickers drop constraint board_stickers_position_check;
alter table public.board_stickers add constraint board_stickers_position_check
  check (x>=0 and y>=0 and x+ceil(72*scale)<=2144 and y+ceil(72*scale)<=1206);
-- The reader itself enforces membership / published-room visibility.
grant execute on function public.get_board_stickers(uuid) to authenticated;

create function public.resize_board_sticker(p_campaign_id uuid,p_id uuid,p_scale numeric) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result public.board_stickers;
begin
  perform private.lock_campaign(p_campaign_id);
  if p_scale is null or p_scale not between 0.5 and 2.5 then raise exception 'INVALID_STICKER_SCALE'; end if;
  update public.board_stickers set scale=round(p_scale,2),
    x=least(x,2144-ceil(72*round(p_scale,2))::integer),
    y=least(y,1206-ceil(72*round(p_scale,2))::integer),updated_at=clock_timestamp()
    where campaign_id=p_campaign_id and id=p_id and private.is_member(p_campaign_id)
    returning * into result;
  if result.id is null then raise exception 'BOARD_STICKER_NOT_FOUND'; end if;
  return to_jsonb(result);
end;
$$;
create or replace function public.move_board_sticker(p_campaign_id uuid,p_id uuid,p_x integer,p_y integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result public.board_stickers;
begin
  perform private.lock_campaign(p_campaign_id);
  update public.board_stickers set
    x=greatest(0,least(2144-ceil(72*scale)::integer,p_x)),
    y=greatest(0,least(1206-ceil(72*scale)::integer,p_y)),updated_at=clock_timestamp()
    where campaign_id=p_campaign_id and id=p_id and private.is_member(p_campaign_id)
    returning * into result;
  if result.id is null then raise exception 'BOARD_STICKER_NOT_FOUND'; end if;
  return to_jsonb(result);
end;
$$;
revoke all on function public.resize_board_sticker(uuid,uuid,numeric) from public,anon,authenticated;
grant execute on function public.resize_board_sticker(uuid,uuid,numeric) to authenticated;
