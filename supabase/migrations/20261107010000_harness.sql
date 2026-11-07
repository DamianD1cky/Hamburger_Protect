-- Private storage: all reads and writes go through role-aware RPCs.
create table private.harness_boards (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  revision integer not null default 0,
  blocks jsonb not null default '[]'
);
create table private.harness_commands (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  command_id uuid not null,
  actor_id uuid not null references public.profiles(id),
  base_revision integer not null,
  operations jsonb not null,
  created_at timestamptz not null default now(),
  primary key (campaign_id, command_id)
);
revoke all on private.harness_boards, private.harness_commands from public, anon, authenticated;

create function private.valid_harness_block(b jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(
    jsonb_typeof(b) = 'object'
    and b->>'id' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    and b->>'kind' in ('note','counter','clock')
    and jsonb_typeof(b->'title') = 'string'
    and char_length(trim(b->>'title')) between 1 and 80
    and b->>'visibility' in ('members','gm')
    and b->>'editable' in ('gm','players')
    and jsonb_typeof(b->'max') = 'number'
    and (b->>'max')::numeric between 1 and 1000000
    and (b->>'max')::numeric = trunc((b->>'max')::numeric)
    and jsonb_typeof(b->'value') = 'number'
    and (b->>'value')::numeric between 0 and (b->>'max')::numeric
    and (b->>'value')::numeric = trunc((b->>'value')::numeric)
    and jsonb_typeof(b->'text') = 'string'
    and char_length(b->>'text') <= 8000
    and (b - array['id','kind','title','visibility','editable','max','value','text']::text[]) = '{}'
  , false)
$$;

create function public.get_harness_board(p_campaign_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  is_gm boolean := private.has_role(p_campaign_id, 'gm');
  board private.harness_boards;
begin
  perform private.require_actor();
  if not (is_gm or private.has_role(p_campaign_id, 'player') or private.has_role(p_campaign_id, 'observer')) then
    raise exception 'CAMPAIGN_ROLE_REQUIRED';
  end if;
  select * into board from private.harness_boards where campaign_id = p_campaign_id;
  return jsonb_build_object('schema', 1, 'revision', coalesce(board.revision, 0), 'blocks',
    coalesce((select jsonb_agg(b order by n) from jsonb_array_elements(coalesce(board.blocks, '[]')) with ordinality as items(b,n)
      where is_gm or b->>'visibility' = 'members'), '[]'));
end;
$$;

create function public.apply_harness_command(
  p_campaign_id uuid, p_command_id uuid, p_revision integer, p_operations jsonb
) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  actor uuid := private.require_actor();
  is_gm boolean;
  board private.harness_boards;
  previous private.harness_commands;
  op jsonb;
  block jsonb;
  idx integer;
  delta numeric;
begin
  -- Serializes with membership changes, archive operations and other room writes.
  perform private.lock_campaign(p_campaign_id);
  is_gm := private.has_role(p_campaign_id, 'gm');
  if p_command_id is null or p_revision is null or p_revision < 0
    or jsonb_typeof(p_operations) is distinct from 'array' then
    raise exception 'HARNESS_INVALID_COMMAND';
  end if;
  if jsonb_array_length(p_operations) not between 1 and 20 or octet_length(p_operations::text) > 180000 then
    raise exception 'HARNESS_INVALID_COMMAND';
  end if;
  select * into previous from private.harness_commands
    where campaign_id = p_campaign_id and command_id = p_command_id;
  if found then
    if previous.actor_id <> actor or previous.base_revision <> p_revision or previous.operations <> p_operations then
      raise exception 'COMMAND_ID_REUSED';
    end if;
    -- Do not replay an old response that might now contain hidden information.
    return public.get_harness_board(p_campaign_id);
  end if;
  insert into private.harness_boards(campaign_id) values(p_campaign_id) on conflict do nothing;
  select * into board from private.harness_boards where campaign_id = p_campaign_id for update;
  if board.revision <> p_revision then raise exception 'HARNESS_CONFLICT'; end if;
  for op in select value from jsonb_array_elements(p_operations) loop
    if op->>'type' = 'create' then
      if not is_gm then raise exception 'CAMPAIGN_ROLE_REQUIRED'; end if;
      block := op->'block';
      if not private.valid_harness_block(block) or exists(
        select 1 from jsonb_array_elements(board.blocks) b where b->>'id' = block->>'id'
      ) then raise exception 'HARNESS_INVALID_BLOCK'; end if;
      board.blocks := board.blocks || jsonb_build_array(block);
    else
      select b, (n-1)::integer into block, idx from jsonb_array_elements(board.blocks) with ordinality items(b,n)
        where b->>'id' = op->>'id';
      if not found then raise exception 'HARNESS_BLOCK_NOT_FOUND'; end if;
      if not is_gm and (block->>'visibility' <> 'members' or block->>'editable' <> 'players') then
        raise exception 'CAMPAIGN_ROLE_REQUIRED';
      end if;
      case op->>'type'
        when 'configure' then
          if not is_gm then raise exception 'CAMPAIGN_ROLE_REQUIRED'; end if;
          -- Only configuration is replaced; existing runtime values survive.
          block := block || jsonb_build_object('title', op->'title', 'max', op->'max',
            'visibility', op->'visibility', 'editable', op->'editable');
        when 'adjust' then
          if block->>'kind' = 'note' or jsonb_typeof(op->'delta') is distinct from 'number' then
            raise exception 'HARNESS_INVALID_DELTA';
          end if;
          delta := (op->>'delta')::numeric;
          if delta <> trunc(delta) or abs(delta) > 1000000 then raise exception 'HARNESS_INVALID_DELTA'; end if;
          block := jsonb_set(block, '{value}', to_jsonb((block->>'value')::numeric + delta));
        when 'write' then
          if block->>'kind' <> 'note' then raise exception 'HARNESS_INVALID_TEXT'; end if;
          block := block || jsonb_build_object('text', op->'text');
        when 'remove' then
          if not is_gm then raise exception 'CAMPAIGN_ROLE_REQUIRED'; end if;
        else raise exception 'HARNESS_UNKNOWN_OPERATION';
      end case;
      if op->>'type' = 'remove' then
        board.blocks := board.blocks - idx;
      else
        if not private.valid_harness_block(block) then raise exception 'HARNESS_INVALID_BLOCK'; end if;
        board.blocks := jsonb_set(board.blocks, array[idx::text], block);
      end if;
    end if;
    if jsonb_array_length(board.blocks) > 100 then raise exception 'HARNESS_BLOCK_LIMIT'; end if;
  end loop;
  update private.harness_boards set blocks = board.blocks, revision = board.revision + 1 where campaign_id = p_campaign_id;
  insert into private.harness_commands(campaign_id, command_id, actor_id, base_revision, operations)
    values(p_campaign_id, p_command_id, actor, p_revision, p_operations);
  return public.get_harness_board(p_campaign_id);
end;
$$;
revoke all on function private.valid_harness_block(jsonb) from public, anon, authenticated;
revoke all on function public.get_harness_board(uuid) from public, anon, authenticated;
revoke all on function public.apply_harness_command(uuid, uuid, integer, jsonb) from public, anon, authenticated;
grant execute on function public.get_harness_board(uuid) to authenticated;
grant execute on function public.apply_harness_command(uuid, uuid, integer, jsonb) to authenticated;

create table private.harness_agent_limits (
  actor_id uuid primary key references public.profiles(id) on delete cascade,
  window_start timestamptz not null,
  requests integer not null
);
revoke all on private.harness_agent_limits from public, anon, authenticated;
create function public.reserve_harness_agent_request(p_campaign_id uuid) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare actor uuid := private.require_actor(); count integer;
begin
  perform private.lock_campaign(p_campaign_id);
  insert into private.harness_agent_limits(actor_id, window_start, requests)
    values(actor, now(), 1)
  on conflict(actor_id) do update set
    window_start = case when harness_agent_limits.window_start < now() - interval '1 minute' then now() else harness_agent_limits.window_start end,
    requests = case when harness_agent_limits.window_start < now() - interval '1 minute' then 1 else harness_agent_limits.requests + 1 end
  returning requests into count;
  if count > 6 then raise exception 'HARNESS_AGENT_RATE_LIMIT'; end if;
  return case when private.has_role(p_campaign_id, 'gm') then 'gm' else 'player' end;
end;
$$;
revoke all on function public.reserve_harness_agent_request(uuid) from public, anon, authenticated;
grant execute on function public.reserve_harness_agent_request(uuid) to authenticated;
