-- 连线上可以写关系说明，例如「情侣」「同伙」。
-- 为空时不显示纸片，只保留一条红线。

alter table public.note_links
  add column if not exists label text;

alter table public.note_links
  drop constraint if exists note_links_label_check;
alter table public.note_links
  add constraint note_links_label_check
    check (label is null or char_length(trim(label)) between 1 and 24);

create or replace function public.update_note_link_label(
  p_campaign_id uuid,
  p_id uuid,
  p_label text
) returns text language plpgsql security definer set search_path='' as $$
declare
  cleaned text := nullif(btrim(coalesce(p_label, '')), '');
begin
  if cleaned is not null and char_length(cleaned) > 24 then
    raise exception 'INVALID_LINK_LABEL';
  end if;
  perform private.lock_campaign(p_campaign_id);
  update public.note_links
    set label = cleaned
    where id = p_id and campaign_id = p_campaign_id
      and private.is_member(p_campaign_id);
  if not found then raise exception 'NOTE_LINK_NOT_FOUND'; end if;
  return cleaned;
end;
$$;

revoke all on function public.update_note_link_label(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.update_note_link_label(uuid, uuid, text)
  to authenticated;

-- get_note_links 用 to_jsonb(l) 输出，新列自动带到前端。
