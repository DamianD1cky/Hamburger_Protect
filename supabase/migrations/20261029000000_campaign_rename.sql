-- Allow the room GM to rename the campaign (1-80 chars, same rule as create).
-- The campaigns activity trigger already watches `name`, so a rename is
-- recorded in the work log as a campaign update with before/after values.
create function public.rename_campaign(p_campaign_id uuid, p_name text)
returns public.campaigns
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  result public.campaigns;
  normalized text := trim(coalesce(p_name, ''));
begin
  perform private.lock_campaign(p_campaign_id, 'gm');
  if char_length(normalized) not between 1 and 80 then
    raise exception 'INVALID_CAMPAIGN_NAME';
  end if;
  update public.campaigns
  set name = normalized
  where id = p_campaign_id
  returning * into result;
  if result is null then raise exception 'CAMPAIGN_NOT_FOUND'; end if;
  return result;
end;
$$;

revoke all on function public.rename_campaign(uuid, text) from public, anon, authenticated;
grant execute on function public.rename_campaign(uuid, text) to authenticated;
