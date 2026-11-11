-- 图钉颜色作为便签草稿的一部分，与内容、纸张颜色一起原子保存。
-- 省略新参数的旧客户端：新建使用红色，编辑保留原有图钉颜色。
drop function if exists public.save_note(uuid, text, text, public.note_color, integer, integer, numeric, uuid, text);

create function public.save_note(
  p_campaign_id uuid,
  p_title text,
  p_body text,
  p_color public.note_color,
  p_x integer default 1098,
  p_y integer default 605,
  p_rotation numeric default 0,
  p_id uuid default null,
  p_image_path text default null,
  p_pin_color text default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare
  actor uuid := private.require_actor();
  result uuid;
begin
  perform private.lock_campaign(p_campaign_id);

  if p_pin_color is not null and p_pin_color not in ('red', 'blue', 'green', 'yellow', 'black') then
    raise exception 'INVALID_PIN_COLOR';
  end if;
  if p_image_path is not null and not starts_with(p_image_path, p_campaign_id::text || '/') then
    raise exception 'INVALID_NOTE_IMAGE';
  end if;

  if p_id is null then
    insert into public.notes(
      campaign_id, author_id, title, body, color, x, y, rotation, image_path, pin_color
    ) values(
      p_campaign_id, actor, trim(p_title), p_body, p_color, p_x, p_y,
      p_rotation, p_image_path, coalesce(p_pin_color, 'red')
    ) returning id into result;
  else
    update public.notes
    set title = trim(p_title),
        body = p_body,
        color = p_color,
        image_path = p_image_path,
        pin_color = coalesce(p_pin_color, pin_color),
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

revoke all on function public.save_note(uuid, text, text, public.note_color, integer, integer, numeric, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.save_note(uuid, text, text, public.note_color, integer, integer, numeric, uuid, text, text)
  to authenticated;
