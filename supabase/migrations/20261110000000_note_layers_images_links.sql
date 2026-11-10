-- 便签增强：层叠顺序、照片、便签之间的连线。
--
-- 1) notes.layer        便签的图层顺序（与 pinned 并行，pinned 永远在最上）
-- 2) notes.image_path   便签照片，复用 campaign-media 存储桶
-- 3) note_links         便签之间的连线（红线）
--
-- 顺带放宽 storage 的写入策略：原来只允许 GM 上传，但玩家也能创建便签，
-- 所以允许房间成员上传 note- 前缀的文件，其余仍然只有 GM 能传。

alter table public.notes
  add column if not exists layer integer not null default 0,
  add column if not exists image_path text;

alter table public.notes
  drop constraint if exists notes_layer_range;
alter table public.notes
  add constraint notes_layer_range check (layer between -50 and 50);

alter table public.notes
  drop constraint if exists notes_image_path_check;
alter table public.notes
  add constraint notes_image_path_check
    check (
      image_path is null
      or (
        image_path like campaign_id::text || '/%'
        and char_length(image_path) between 1 and 300
      )
    );

-- ---------------------------------------------------------------- 连线表
create table if not exists public.note_links (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  from_note_id uuid not null references public.notes(id) on delete cascade,
  to_note_id uuid not null references public.notes(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint note_links_distinct check (from_note_id <> to_note_id),
  constraint note_links_unique unique (from_note_id, to_note_id)
);

create index if not exists note_links_campaign_idx
  on public.note_links (campaign_id);

alter table public.note_links enable row level security;
revoke all on public.note_links from anon, authenticated;
grant select on public.note_links to authenticated;
grant all on public.note_links to service_role;

drop policy if exists read_note_links on public.note_links;
create policy read_note_links on public.note_links
  for select to authenticated
  using (
    private.current_actor_id() is not null
    and private.is_member(campaign_id)
  );

-- ---------------------------------------------------------------- save_note
drop function if exists public.save_note(uuid, text, text, public.note_color, integer, integer, numeric, uuid);

create function public.save_note(
  p_campaign_id uuid,
  p_title text,
  p_body text,
  p_color public.note_color,
  p_x integer default 1098,
  p_y integer default 605,
  p_rotation numeric default 0,
  p_id uuid default null,
  p_image_path text default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare
  actor uuid := private.require_actor();
  result uuid;
begin
  perform private.lock_campaign(p_campaign_id);

  if p_image_path is not null and not starts_with(p_image_path, p_campaign_id::text || '/') then
    raise exception 'INVALID_NOTE_IMAGE';
  end if;

  if p_id is null then
    insert into public.notes(
      campaign_id, author_id, title, body, color, x, y, rotation, image_path
    ) values(
      p_campaign_id, actor, trim(p_title), p_body, p_color, p_x, p_y, p_rotation, p_image_path
    ) returning id into result;
  else
    update public.notes
      set title = trim(p_title),
          body = p_body,
          color = p_color,
          image_path = p_image_path,
          updated_at = now()
      where id = p_id
        and campaign_id = p_campaign_id
        and (author_id = actor or private.has_role(p_campaign_id, 'gm'))
      returning id into result;
  end if;

  if result is null then raise exception 'NOTE_NOT_EDITABLE'; end if;
  return result;
end;
$$;

revoke all on function public.save_note(uuid, text, text, public.note_color, integer, integer, numeric, uuid, text)
  from public, anon, authenticated;
grant execute on function public.save_note(uuid, text, text, public.note_color, integer, integer, numeric, uuid, text)
  to authenticated;

-- ---------------------------------------------------------------- 图层
create or replace function public.set_note_layer(
  p_campaign_id uuid,
  p_id uuid,
  p_layer integer
) returns integer language plpgsql security definer set search_path='' as $$
declare
  clamped integer := greatest(-50, least(50, p_layer));
begin
  perform private.lock_campaign(p_campaign_id);
  update public.notes
    set layer = clamped, updated_at = now()
    where id = p_id
      and campaign_id = p_campaign_id
      and (author_id = private.current_actor_id() or private.has_role(p_campaign_id, 'gm'));
  if not found then raise exception 'NOTE_NOT_EDITABLE'; end if;
  return clamped;
end;
$$;

revoke all on function public.set_note_layer(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.set_note_layer(uuid, uuid, integer) to authenticated;

-- ---------------------------------------------------------------- 连线 RPC
create or replace function public.get_note_links(p_campaign_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(to_jsonb(l) order by l.created_at, l.id), '[]'::jsonb)
  from public.note_links l
  where l.campaign_id = p_campaign_id
    and private.current_actor_id() is not null
    and private.is_member(p_campaign_id);
$$;

revoke all on function public.get_note_links(uuid) from public, anon, authenticated;
grant execute on function public.get_note_links(uuid) to authenticated;

create or replace function public.create_note_link(
  p_campaign_id uuid,
  p_from uuid,
  p_to uuid
) returns uuid language plpgsql security definer set search_path='' as $$
declare
  result uuid;
begin
  if p_from = p_to then raise exception 'NOTE_LINK_SELF'; end if;
  perform private.lock_campaign(p_campaign_id);
  if private.current_actor_id() is null or not private.is_member(p_campaign_id) then
    raise exception 'NOT_A_MEMBER';
  end if;
  if not exists (select 1 from public.notes where id = p_from and campaign_id = p_campaign_id)
    or not exists (select 1 from public.notes where id = p_to and campaign_id = p_campaign_id) then
    raise exception 'NOTE_NOT_FOUND';
  end if;
  insert into public.note_links(campaign_id, from_note_id, to_note_id)
    values (p_campaign_id, p_from, p_to)
    on conflict (from_note_id, to_note_id) do nothing
    returning id into result;
  if result is null then
    select id into result from public.note_links
      where from_note_id = p_from and to_note_id = p_to;
  end if;
  return result;
end;
$$;

revoke all on function public.create_note_link(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.create_note_link(uuid, uuid, uuid) to authenticated;

create or replace function public.delete_note_link(
  p_campaign_id uuid,
  p_id uuid
) returns uuid language plpgsql security definer set search_path='' as $$
begin
  perform private.lock_campaign(p_campaign_id);
  delete from public.note_links
    where id = p_id and campaign_id = p_campaign_id
      and private.is_member(p_campaign_id);
  if not found then raise exception 'NOTE_LINK_NOT_FOUND'; end if;
  return p_id;
end;
$$;

revoke all on function public.delete_note_link(uuid, uuid) from public, anon, authenticated;
grant execute on function public.delete_note_link(uuid, uuid) to authenticated;

-- ------------------------------------------------- storage：允许成员传便签照片
drop policy if exists campaign_media_insert on storage.objects;
create policy campaign_media_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'campaign-media'
    and (
      private.has_role(private.storage_campaign_id(name), 'gm')
      or (
        private.is_member(private.storage_campaign_id(name))
        and name like '%/note-%'
      )
    )
  );
