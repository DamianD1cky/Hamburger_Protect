-- 公告牌物件增强：可换色图钉、全局唯一便签层级、Emoji 贴纸。

-- ---------------------------------------------------------------- 图钉颜色
alter table public.notes
  add column if not exists pin_color text not null default 'red';

alter table public.notes
  drop constraint if exists notes_pin_color_check;
alter table public.notes
  add constraint notes_pin_color_check
    check (pin_color in ('red', 'blue', 'green', 'yellow', 'black'));

create or replace function public.set_note_pin_color(
  p_campaign_id uuid,
  p_id uuid,
  p_color text
) returns text language plpgsql security definer set search_path='' as $$
begin
  if p_color not in ('red', 'blue', 'green', 'yellow', 'black') then
    raise exception 'INVALID_PIN_COLOR';
  end if;
  perform private.lock_campaign(p_campaign_id);
  update public.notes
    set pin_color = p_color, updated_at = now()
    where id = p_id
      and campaign_id = p_campaign_id
      and (author_id = private.current_actor_id() or private.has_role(p_campaign_id, 'gm'));
  if not found then raise exception 'NOTE_NOT_EDITABLE'; end if;
  return p_color;
end;
$$;

revoke all on function public.set_note_pin_color(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.set_note_pin_color(uuid, uuid, text)
  to authenticated;

-- ---------------------------------------------------------------- 全局便签层级
alter table public.notes drop constraint if exists notes_layer_range;
alter table public.notes drop constraint if exists notes_campaign_layer_unique;

with ranked as (
  select id, row_number() over (
    partition by campaign_id
    order by layer, created_at, id
  )::integer as next_layer
  from public.notes
)
update public.notes n
set layer = ranked.next_layer
from ranked
where ranked.id = n.id;

alter table public.notes
  add constraint notes_campaign_layer_unique
  unique (campaign_id, layer)
  deferrable initially deferred;

create or replace function private.assign_note_layer()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.layer is null or new.layer = 0 then
    select coalesce(max(layer), 0) + 1 into new.layer
    from public.notes
    where campaign_id = new.campaign_id;
  end if;
  return new;
end;
$$;

drop trigger if exists assign_note_layer on public.notes;
create trigger assign_note_layer
before insert on public.notes
for each row execute function private.assign_note_layer();

create or replace function public.move_note_layer(
  p_campaign_id uuid,
  p_id uuid,
  p_direction integer
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  current_layer integer;
  adjacent_id uuid;
  adjacent_layer integer;
begin
  if p_direction not in (-1, 1) then
    raise exception 'INVALID_LAYER_DIRECTION';
  end if;
  perform private.lock_campaign(p_campaign_id);
  select layer into current_layer
  from public.notes
  where id = p_id
    and campaign_id = p_campaign_id
    and (author_id = private.current_actor_id() or private.has_role(p_campaign_id, 'gm'));
  if current_layer is null then raise exception 'NOTE_NOT_EDITABLE'; end if;

  select id, layer into adjacent_id, adjacent_layer
  from public.notes
  where campaign_id = p_campaign_id
    and (
      (p_direction = 1 and layer > current_layer)
      or (p_direction = -1 and layer < current_layer)
    )
  order by
    case when p_direction = 1 then layer end asc,
    case when p_direction = -1 then layer end desc
  limit 1;

  if adjacent_id is null then
    return jsonb_build_array(jsonb_build_object('id', p_id, 'layer', current_layer));
  end if;

  set constraints public.notes_campaign_layer_unique deferred;
  update public.notes
  set layer = case
      when id = p_id then adjacent_layer
      when id = adjacent_id then current_layer
    end,
    updated_at = now()
  where id in (p_id, adjacent_id);

  return jsonb_build_array(
    jsonb_build_object('id', p_id, 'layer', adjacent_layer),
    jsonb_build_object('id', adjacent_id, 'layer', current_layer)
  );
end;
$$;

revoke all on function public.move_note_layer(uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.move_note_layer(uuid, uuid, integer)
  to authenticated;

drop function if exists public.set_note_layer(uuid, uuid, integer);

-- ---------------------------------------------------------------- Emoji 贴纸
create table if not exists public.board_stickers (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  emoji text not null,
  x integer not null,
  y integer not null,
  rotation numeric not null default 0,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint board_stickers_emoji_check check (char_length(emoji) between 1 and 16),
  constraint board_stickers_position_check check (x between 0 and 1467 and y between 0 and 1203),
  constraint board_stickers_rotation_check check (rotation between -20 and 20)
);

create index if not exists board_stickers_campaign_idx
  on public.board_stickers (campaign_id, created_at, id);

alter table public.board_stickers enable row level security;
revoke all on public.board_stickers from anon, authenticated;
grant select on public.board_stickers to authenticated;
grant all on public.board_stickers to service_role;

drop policy if exists read_board_stickers on public.board_stickers;
create policy read_board_stickers on public.board_stickers
  for select to authenticated
  using (
    private.current_actor_id() is not null
    and private.is_member(campaign_id)
  );

create or replace function public.get_board_stickers(p_campaign_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(to_jsonb(s) order by s.created_at, s.id), '[]'::jsonb)
  from public.board_stickers s
  where s.campaign_id = p_campaign_id
    and private.current_actor_id() is not null
    and (
      private.is_member(p_campaign_id)
      or exists (
        select 1
        from public.campaigns c
        join public.campaign_settings cs on cs.campaign_id = c.id
        where c.id = p_campaign_id
          and c.status = 'active'
          and cs.is_public
      )
    );
$$;

create or replace function public.create_board_sticker(
  p_campaign_id uuid,
  p_emoji text,
  p_x integer,
  p_y integer,
  p_rotation numeric default 0
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  result public.board_stickers;
begin
  perform private.lock_campaign(p_campaign_id);
  if private.current_actor_id() is null or not private.is_member(p_campaign_id) then
    raise exception 'NOT_A_MEMBER';
  end if;
  insert into public.board_stickers(campaign_id, emoji, x, y, rotation, created_by)
  values (
    p_campaign_id,
    p_emoji,
    greatest(0, least(1467, p_x)),
    greatest(0, least(1203, p_y)),
    greatest(-20, least(20, p_rotation)),
    private.current_actor_id()
  ) returning * into result;
  return to_jsonb(result);
end;
$$;

create or replace function public.move_board_sticker(
  p_campaign_id uuid,
  p_id uuid,
  p_x integer,
  p_y integer
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  result public.board_stickers;
begin
  perform private.lock_campaign(p_campaign_id);
  update public.board_stickers
  set x = greatest(0, least(1467, p_x)),
      y = greatest(0, least(1203, p_y)),
      updated_at = now()
  where id = p_id and campaign_id = p_campaign_id
    and private.is_member(p_campaign_id)
  returning * into result;
  if result.id is null then raise exception 'BOARD_STICKER_NOT_FOUND'; end if;
  return to_jsonb(result);
end;
$$;

create or replace function public.delete_board_sticker(
  p_campaign_id uuid,
  p_id uuid
) returns uuid language plpgsql security definer set search_path='' as $$
begin
  perform private.lock_campaign(p_campaign_id);
  delete from public.board_stickers
  where id = p_id and campaign_id = p_campaign_id
    and private.is_member(p_campaign_id);
  if not found then raise exception 'BOARD_STICKER_NOT_FOUND'; end if;
  return p_id;
end;
$$;

revoke all on function public.get_board_stickers(uuid) from public, anon, authenticated;
