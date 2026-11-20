-- Canonical atomic blocks, transactional live-note saves and archive confidentiality.
-- Legacy saves remain readable; existing RPC names retain their authorization.

alter function private.validate_custom_panels(jsonb) rename to validate_custom_panels_base;

create function private.validate_atomic_block(p_block jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  b jsonb := p_block;
  kind text := b->>'type';
  item jsonb;
  items jsonb := '[]'::jsonb;
  n integer;
  lo integer;
  hi integer;
  child_id text;
  seen text[] := '{}'::text[];
begin
  if jsonb_typeof(b) is distinct from 'object'
    or char_length(coalesce(b->>'id','')) not between 1 and 48 then
    raise exception 'INVALID_CUSTOM_PANELS';
  end if;
  if kind in ('segmented','select') then
    b := b || jsonb_build_object('type','choice_selector','display',case when kind='select' then 'dropdown' else 'segmented' end);
    kind := 'choice_selector';
  elsif kind = 'stepper' then
    b := b || '{"type":"meter_counter","variant":"stepper"}'::jsonb;
    kind := 'meter_counter';
  end if;
  if kind not in ('member_roster','event_clock','activity_feed','choice_selector','meter_counter',
    'resource_list','task_board','checkbox_group','toggle','kv_list','note_text',
    'image_media','dice_macro','initiative_track','roll_table') then
    raise exception 'INVALID_CUSTOM_PANELS';
  end if;
  if kind = 'choice_selector' then
    if jsonb_typeof(b->'options') is distinct from 'array' or jsonb_array_length(b->'options') not between 2 and 8
      or coalesce(b->>'display','auto') not in ('auto','segmented','dropdown') then raise exception 'INVALID_CUSTOM_PANELS'; end if;
    if not (b->'options' ? coalesce(b->>'value','')) then b := jsonb_set(b,'{value}',b->'options'->0); end if;
  elsif kind = 'meter_counter' then
    lo := greatest(-9999,least(9998,coalesce(round((b->>'min')::numeric)::integer,0)));
    hi := greatest(lo+1,least(9999,coalesce(round((b->>'max')::numeric)::integer,10)));
    n := greatest(lo,least(hi,coalesce(round((b->>'value')::numeric)::integer,lo)));
    if coalesce(b->>'variant','stepper') not in ('stepper','bar','pips','bipolar') then raise exception 'INVALID_CUSTOM_PANELS'; end if;
    b := b || jsonb_build_object('min',lo,'max',hi,'value',n,'step',greatest(1,least(100,coalesce(round((b->>'step')::numeric)::integer,1))));
  elsif kind in ('image_media','dice_macro','initiative_track','roll_table','task_board') then
    if kind = 'image_media' then child_id := 'images'; n := 9;
    elsif kind = 'dice_macro' then child_id := 'macros'; n := 12;
    elsif kind = 'initiative_track' then child_id := 'entries'; n := 30;
    elsif kind = 'roll_table' then child_id := 'entries'; n := 50;
    else child_id := 'items'; n := 20; end if;
    if jsonb_typeof(b->child_id) is distinct from 'array' or jsonb_array_length(b->child_id)>n then raise exception 'INVALID_CUSTOM_PANELS'; end if;
    for item in select value from jsonb_array_elements(b->child_id) loop
      if jsonb_typeof(item) is distinct from 'object' then raise exception 'INVALID_CUSTOM_PANELS'; end if;
      if char_length(coalesce(item->>'id','')) not between 1 and 48 or item->>'id'=any(seen) then raise exception 'INVALID_CUSTOM_PANELS'; end if;
      seen := array_append(seen,item->>'id');
      if kind = 'image_media' then
        if coalesce(item->>'url','') !~* '^(https?://|[0-9a-f-]{36}/note-)' or char_length(item->>'url')>2000
          or coalesce(item->>'aspect','auto') not in ('auto','16:9','4:3','1:1') then raise exception 'INVALID_CUSTOM_PANELS'; end if;
      elsif kind = 'dice_macro' then
        if char_length(coalesce(item->>'name','')) not between 1 and 40 or char_length(coalesce(item->>'notation','')) not between 1 and 120
          or coalesce(item->>'visibility','public') not in ('public','gm','self') then raise exception 'INVALID_CUSTOM_PANELS'; end if;
      elsif kind = 'initiative_track' then
        if char_length(coalesce(item->>'name','')) not between 1 and 48 then raise exception 'INVALID_CUSTOM_PANELS'; end if;
        item := item || jsonb_build_object('initiative',greatest(-999,least(999,coalesce((item->>'initiative')::integer,0))));
      elsif kind = 'roll_table' then
        if char_length(coalesce(item->>'text','')) not between 1 and 400 then raise exception 'INVALID_CUSTOM_PANELS'; end if;
        item := item || jsonb_build_object('weight',greatest(1,least(1000,coalesce((item->>'weight')::integer,1))));
      else
        item := item || jsonb_build_object('title',left(coalesce(item->>'title',item->>'name',''),64),
          'detail',left(coalesce(item->>'detail',item->>'description',''),160),
          'reward',left(coalesce(item->>'reward',item->>'bounty',item->>'prize',''),80));
        if char_length(item->>'title')<1 or coalesce(item->>'status','open') not in ('open','in_progress','completed') then raise exception 'INVALID_CUSTOM_PANELS'; end if;
      end if;
      items := items || jsonb_build_array(item);
    end loop;
    b := jsonb_set(b,array[child_id],items);
    if kind = 'initiative_track' then
      b := b || jsonb_build_object('round',greatest(1,least(9999,coalesce((b->>'round')::integer,1))),
        'activeIndex',greatest(0,least(greatest(0,jsonb_array_length(items)-1),coalesce((b->>'activeIndex')::integer,0))));
    elsif kind = 'roll_table' then
      if not exists(select 1 from jsonb_array_elements(items) e where e->>'id'=b->>'lastRolledId') then b := b || '{"lastRolledId":null}'::jsonb; end if;
    elsif kind = 'task_board' and coalesce(b->>'variant','quest') not in ('quest','wanted','bounty','objective') then raise exception 'INVALID_CUSTOM_PANELS';
    elsif kind = 'image_media' and coalesce(b->>'layout','hero') not in ('hero','grid','polaroid') then raise exception 'INVALID_CUSTOM_PANELS'; end if;
  end if;
  return b;
exception when invalid_text_representation or numeric_value_out_of_range then
  raise exception 'INVALID_CUSTOM_PANELS';
end;
$$;

create function private.validate_custom_panels(p_panels jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  panel jsonb; block jsonb; blocks jsonb; compatible jsonb; checked jsonb;
  result jsonb := '[]'::jsonb; seen text[];
begin
  if jsonb_typeof(p_panels) is distinct from 'array' or jsonb_array_length(p_panels)>12 then raise exception 'INVALID_CUSTOM_PANELS'; end if;
  for panel in select value from jsonb_array_elements(p_panels) loop
    blocks := '[]'::jsonb; compatible := '[]'::jsonb; seen := '{}'::text[];
    if panel ? 'blocks' then
      if jsonb_typeof(panel->'blocks') is distinct from 'array' or jsonb_array_length(panel->'blocks')>12 then raise exception 'INVALID_CUSTOM_PANELS'; end if;
      for block in select value from jsonb_array_elements(panel->'blocks') loop
        block := private.validate_atomic_block(block);
        if block->>'id'=any(seen) then raise exception 'INVALID_CUSTOM_PANELS'; end if;
        seen := array_append(seen,block->>'id');
        blocks := blocks || jsonb_build_array(block);
        compatible := compatible || jsonb_build_array(block || jsonb_build_object('type',
          case block->>'type' when 'choice_selector' then 'segmented' when 'meter_counter' then 'stepper'
          when 'image_media' then 'note_text' when 'dice_macro' then 'note_text' when 'initiative_track' then 'note_text'
          when 'roll_table' then 'note_text' else block->>'type' end));
      end loop;
    end if;
    checked := private.validate_custom_panels_base(jsonb_build_array(panel || jsonb_build_object('blocks',compatible)))->0;
    checked := checked || jsonb_build_object('blocks',blocks);
    if panel ? 'fontSize' and jsonb_typeof(panel->'fontSize') = 'number' then
      checked := checked || jsonb_build_object('fontSize',greatest(11,least(24,round((panel->>'fontSize')::numeric)::integer)));
    end if;
    result := result || jsonb_build_array(checked);
  end loop;
  -- Preserve the base validator's cross-panel duplicate-ID check.
  if (select count(distinct p->>'id') from jsonb_array_elements(result) p) <> jsonb_array_length(result) then raise exception 'INVALID_CUSTOM_PANELS'; end if;
  return result;
end;
$$;
revoke all on function private.validate_atomic_block(jsonb), private.validate_custom_panels(jsonb), private.validate_custom_panels_base(jsonb) from public, anon, authenticated;

alter function public.interact_custom_panel(uuid,text,text,jsonb) set schema private;
alter function private.interact_custom_panel(uuid,text,text,jsonb) rename to interact_custom_panel_base;
revoke all on function private.interact_custom_panel_base(uuid,text,text,jsonb) from public, anon, authenticated;

create function public.interact_custom_panel(p_campaign_id uuid,p_panel_id text,p_block_id text,p_interaction jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  panels jsonb; panel jsonb; block jsonb; entries jsonb; entry jsonb; next_entries jsonb := '[]'::jsonb;
  action text := p_interaction->>'type'; kind text; next_value integer; active_id text;
  total_weight numeric; target numeric; selected_id text; idx integer;
begin
  perform private.lock_campaign(p_campaign_id);
  if jsonb_typeof(p_interaction) is distinct from 'object' then raise exception 'INVALID_PANEL_INTERACTION'; end if;
  select custom_panels into panels from public.campaign_settings where campaign_id=p_campaign_id for update;
  select value into panel from jsonb_array_elements(panels) where value->>'id'=p_panel_id;
  if panel is null then raise exception 'PANEL_NOT_FOUND'; end if;
  if coalesce(panel->>'interactiveFor','members')='gm' and not private.has_role(p_campaign_id,'gm') then raise exception 'GM_REQUIRED'; end if;
  select value into block from jsonb_array_elements(panel->'blocks') where value->>'id'=p_block_id;
  if block is null then raise exception 'PANEL_BLOCK_NOT_FOUND'; end if;
  block := private.validate_atomic_block(block); kind := block->>'type';
  if kind='choice_selector' and action='set_option' then
    if not (block->'options' ? coalesce(p_interaction->>'value','')) then raise exception 'INVALID_PANEL_INTERACTION'; end if;
    block := block || jsonb_build_object('value',p_interaction->>'value');
  elsif kind='meter_counter' and action in ('step_value','set_value') then
    if action='step_value' then next_value := (block->>'value')::integer + (p_interaction->>'delta')::integer * (block->>'step')::integer;
    else next_value := (block->>'min')::integer + round(((p_interaction->>'value')::numeric-(block->>'min')::integer)/(block->>'step')::integer)::integer*(block->>'step')::integer; end if;
    if next_value is null then raise exception 'INVALID_PANEL_INTERACTION'; end if;
    block := block || jsonb_build_object('value',greatest((block->>'min')::integer,least((block->>'max')::integer,next_value)));
  elsif kind='initiative_track' and action in ('sort_initiative','next_initiative','import_initiative_members') then
    entries := block->'entries'; idx := (block->>'activeIndex')::integer;
    if action='sort_initiative' then
      active_id := entries->idx->>'id';
      select coalesce(jsonb_agg(e order by (e->>'initiative')::integer desc,ord),'[]'::jsonb) into entries
        from jsonb_array_elements(entries) with ordinality t(e,ord);
      select ord-1 into idx from jsonb_array_elements(entries) with ordinality t(e,ord) where e->>'id'=active_id;
      block := block || jsonb_build_object('entries',entries,'activeIndex',coalesce(idx,0));
    elsif action='next_initiative' and jsonb_array_length(entries)>0 then
      next_value := (idx+1)%jsonb_array_length(entries);
      select jsonb_agg(e || jsonb_build_object('acted',case when next_value=0 then false else ord-1<=idx or coalesce((e->>'acted')::boolean,false) end) order by ord)
        into entries from jsonb_array_elements(entries) with ordinality t(e,ord);
      block := block || jsonb_build_object('entries',entries,'activeIndex',next_value,
        'round',least(9999,(block->>'round')::integer+case when next_value=0 then 1 else 0 end));
    elsif action='import_initiative_members' then
      -- Import authoritative room membership, never client-provided impersonations.
      for entry in select jsonb_build_object('id',m.user_id::text,'name',m.character_name,'initiative',0,'isNpc',false,'acted',false)
        from public.campaign_members m where m.campaign_id=p_campaign_id and m.active and m.role='player' order by m.joined_at,m.user_id loop
        if jsonb_array_length(entries)<30 and not exists(select 1 from jsonb_array_elements(entries) e where e->>'id'=entry->>'id') then entries := entries || jsonb_build_array(entry); end if;
      end loop;
      block := block || jsonb_build_object('entries',entries);
    end if;
  elsif kind='roll_table' and action='roll_table' then
    entries := block->'entries';
    if jsonb_array_length(entries)=0 then raise exception 'INVALID_PANEL_INTERACTION'; end if;
    select sum((e->>'weight')::integer) into total_weight from jsonb_array_elements(entries) e;
    target := random()*total_weight;
    for entry in select value from jsonb_array_elements(entries) loop
      target := target-(entry->>'weight')::integer;
      if target<0 then selected_id:=entry->>'id'; exit; end if;
    end loop;
    block := block || jsonb_build_object('lastRolledId',selected_id);
    insert into public.event_log(campaign_id,actor_id,event_type,entity_type,payload)
      values(p_campaign_id,private.current_actor_id(),'roll_table_draw','custom_panel',
        jsonb_build_object('panelId',p_panel_id,'blockId',p_block_id,'text',entry->>'text','entryId',selected_id));
  elsif kind='task_board' and action='add_task_item' and p_interaction ? 'reward' then
    entries := block->'items';
    if jsonb_array_length(entries)>=20 or btrim(coalesce(p_interaction->>'title',''))='' then raise exception 'INVALID_PANEL_INTERACTION'; end if;
    block := block || jsonb_build_object('items',entries || jsonb_build_array(jsonb_build_object('id',gen_random_uuid()::text,
      'title',left(btrim(p_interaction->>'title'),64),'detail',left(coalesce(p_interaction->>'detail',''),160),
      'due',left(coalesce(p_interaction->>'due',''),24),'reward',left(coalesce(p_interaction->>'reward',''),80),'status','open')));
  else
    return private.interact_custom_panel_base(p_campaign_id,p_panel_id,p_block_id,p_interaction);
  end if;
  select jsonb_agg(case when b->>'id'=p_block_id then block else b end order by ord) into next_entries
    from jsonb_array_elements(panel->'blocks') with ordinality t(b,ord);
  panel := jsonb_set(panel,'{blocks}',next_entries);
  select jsonb_agg(case when p->>'id'=p_panel_id then panel else p end order by ord) into panels
    from jsonb_array_elements(panels) with ordinality t(p,ord);
  update public.campaign_settings set custom_panels=panels,updated_at=now() where campaign_id=p_campaign_id;
  return panels;
end;
$$;
revoke all on function public.interact_custom_panel(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.interact_custom_panel(uuid,text,text,jsonb) to authenticated;

create function public.save_note_live(p_campaign_id uuid,p_draft jsonb,p_id uuid default null,p_expected jsonb default null)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare
  note public.notes; tokens jsonb; actual jsonb; saved_id uuid; font_size integer;
begin
  perform private.lock_campaign(p_campaign_id);
  if jsonb_typeof(p_draft) is distinct from 'object' then raise exception 'INVALID_NOTE_DRAFT'; end if;
  select style_tokens into tokens from public.campaign_settings where campaign_id=p_campaign_id for update;
  if p_id is not null then
    select * into note from public.notes where id=p_id and campaign_id=p_campaign_id for update;
    if note.id is null then raise exception 'NOTE_NOT_FOUND'; end if;
    if note.author_id<>private.current_actor_id() and not private.has_role(p_campaign_id,'gm') then raise exception 'NOTE_NOT_EDITABLE'; end if;
    if p_expected is not null then
      actual := jsonb_build_object('title',note.title,'body',note.body,'color',note.color,'pinColor',note.pin_color,
        'imagePath',note.image_path,'rotation',note.rotation,'scale',note.scale,'effect',note.effect,'pinned',note.pinned,
        'fontSize',coalesce((tokens->'noteFontSizes'->>p_id::text)::integer,15));
      if actual is distinct from p_expected then raise exception 'NOTE_CONFLICT'; end if;
    end if;
  end if;
  saved_id := public.save_note(p_campaign_id,p_draft->>'title',coalesce(p_draft->>'body',''),p_draft->>'color',
    greatest(18,least(1800,coalesce((p_draft->>'x')::integer,1098))),
    greatest(18,least(1000,coalesce((p_draft->>'y')::integer,605))),
    (p_draft->>'rotation')::numeric,p_id,p_draft->>'imagePath',p_draft->>'pinColor',
    (p_draft->>'scale')::numeric,p_draft->'effect');
  if p_draft->'effect'->>'shader'='none' then
    update public.notes set effect=private.validate_card_effect(p_draft->'effect') where id=saved_id;
  end if;
  if p_draft ? 'fontSize' then
    font_size := greatest(12,least(28,(p_draft->>'fontSize')::integer));
    update public.campaign_settings set style_tokens=style_tokens || jsonb_build_object('noteFontSizes',
      coalesce(style_tokens->'noteFontSizes','{}'::jsonb)||jsonb_build_object(saved_id::text,font_size)),updated_at=now()
      where campaign_id=p_campaign_id;
  end if;
  if p_draft ? 'pinned' and private.has_role(p_campaign_id,'gm') then
    update public.notes set pinned=(p_draft->>'pinned')::boolean,
      pinned_at=case when (p_draft->>'pinned')::boolean then coalesce(pinned_at,now()) else null end
      where id=saved_id;
  end if;
  return saved_id;
end;
$$;
revoke all on function public.save_note_live(uuid,jsonb,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.save_note_live(uuid,jsonb,uuid,jsonb) to authenticated;

-- Secrets never enter the public settings row, table reads, Realtime or event log.
create table private.campaign_archive_secrets(
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  entries jsonb not null default '[]'::jsonb check(jsonb_typeof(entries)='array')
);
revoke all on private.campaign_archive_secrets from public,anon,authenticated;

create function private.split_archive_secrets()
returns trigger language plpgsql security definer set search_path = '' as $$
declare secrets jsonb; visible jsonb;
begin
  if jsonb_typeof(new.style_tokens->'archiveEntries')='array' then
    select coalesce(jsonb_agg(e),'[]'::jsonb) into secrets from jsonb_array_elements(new.style_tokens->'archiveEntries') e where e->>'visibility'='gm_only';
    select coalesce(jsonb_agg(e),'[]'::jsonb) into visible from jsonb_array_elements(new.style_tokens->'archiveEntries') e where coalesce(e->>'visibility','public')<>'gm_only';
    if jsonb_array_length(secrets)>0 then
      insert into private.campaign_archive_secrets(campaign_id,entries) values(new.campaign_id,secrets)
        on conflict(campaign_id) do update set entries=excluded.entries;
    end if;
    new.style_tokens := jsonb_set(new.style_tokens,'{archiveEntries}',visible);
  end if;
  return new;
end;
$$;
revoke all on function private.split_archive_secrets() from public,anon,authenticated;
create trigger campaign_settings_split_archive_secrets before insert or update of style_tokens on public.campaign_settings
  for each row execute function private.split_archive_secrets();

-- Apply the split to existing campaigns without discarding any archive pages.
update public.campaign_settings set style_tokens=style_tokens
where jsonb_typeof(style_tokens->'archiveEntries')='array'
  and exists(select 1 from jsonb_array_elements(style_tokens->'archiveEntries') e where e->>'visibility'='gm_only');

create function private.archive_tokens_for_gm(p_campaign_id uuid,p_tokens jsonb)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when private.has_role(p_campaign_id,'gm') then
    p_tokens || jsonb_build_object('archiveEntries',coalesce(p_tokens->'archiveEntries','[]'::jsonb) ||
      coalesce((select entries from private.campaign_archive_secrets where campaign_id=p_campaign_id),'[]'::jsonb))
    else p_tokens end;
$$;
revoke all on function private.archive_tokens_for_gm(uuid,jsonb) from public,anon,authenticated;

alter function public.get_campaign_board(uuid) set schema private;
alter function private.get_campaign_board(uuid) rename to get_campaign_board_base;
revoke all on function private.get_campaign_board_base(uuid) from public,anon,authenticated;
create function public.get_campaign_board(p_campaign_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if private.current_actor_id() is null or not private.is_member(p_campaign_id) then return null; end if;
  result := private.get_campaign_board_base(p_campaign_id);
  if result is not null then
    result := jsonb_set(result,'{settings,style_tokens}',
      private.archive_tokens_for_gm(p_campaign_id,result->'settings'->'style_tokens'));
  end if;
  return result;
end;
$$;
revoke all on function public.get_campaign_board(uuid) from public,anon,authenticated;
grant execute on function public.get_campaign_board(uuid) to authenticated;

create or replace function public.update_board_style_tokens(p_campaign_id uuid,p_tokens jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare validated jsonb; secrets jsonb;
begin
  perform private.lock_campaign(p_campaign_id,'gm');
  validated := private.validate_style_tokens(p_tokens);
  select coalesce(jsonb_agg(e),'[]'::jsonb) into secrets from jsonb_array_elements(coalesce(validated->'archiveEntries','[]'::jsonb)) e where e->>'visibility'='gm_only';
  insert into private.campaign_archive_secrets(campaign_id,entries) values(p_campaign_id,secrets)
    on conflict(campaign_id) do update set entries=excluded.entries;
  update public.campaign_settings set style_tokens=validated,updated_at=now() where campaign_id=p_campaign_id;
  select style_tokens into validated from public.campaign_settings where campaign_id=p_campaign_id;
  return private.archive_tokens_for_gm(p_campaign_id,validated);
end;
$$;

create function private.can_read_archive_media(p_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.has_role(private.storage_campaign_id(p_name),'gm')
    or exists(select 1 from public.campaign_settings s,jsonb_array_elements(coalesce(s.style_tokens->'archiveEntries','[]'::jsonb)) e
      where s.campaign_id=private.storage_campaign_id(p_name) and e->>'imageUrl'=p_name)
    or exists(select 1 from public.notes n where n.campaign_id=private.storage_campaign_id(p_name) and n.image_path=p_name)
    or not exists(select 1 from private.campaign_archive_secrets s,jsonb_array_elements(s.entries) e
      where s.campaign_id=private.storage_campaign_id(p_name) and e->>'imageUrl'=p_name);
$$;
revoke all on function private.can_read_archive_media(text) from public,anon,authenticated;
grant execute on function private.can_read_archive_media(text) to anon,authenticated;
alter policy campaign_media_read on storage.objects using (
  bucket_id='campaign-media' and private.can_read_archive_media(name)
  and private.can_read_campaign_media(name)
);
