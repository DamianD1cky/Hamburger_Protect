-- Campaign roles belong to memberships, not accounts. An account may be a GM
-- in any number of campaigns and a player in one other active campaign, but a
-- single campaign membership cannot be rewritten into a different role.

create function private.reject_existing_campaign_membership()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'pending' then
    if tg_op = 'INSERT' or (
      tg_op = 'UPDATE'
      and old.status is distinct from 'pending'
    ) then
      if exists(
        select 1
        from public.campaign_members m
        where m.campaign_id = new.campaign_id
          and m.user_id = new.user_id
          and m.active
      ) then
        raise exception 'ALREADY_CAMPAIGN_MEMBER';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists reject_existing_campaign_membership
  on public.campaign_join_requests;
create trigger reject_existing_campaign_membership
before insert or update of status on public.campaign_join_requests
for each row execute function private.reject_existing_campaign_membership();

create function private.keep_campaign_membership_role()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.role is distinct from old.role then
    raise exception 'CAMPAIGN_ROLE_CONFLICT';
  end if;
  return new;
end;
$$;

drop trigger if exists keep_campaign_membership_role
  on public.campaign_members;
create trigger keep_campaign_membership_role
before update of role on public.campaign_members
for each row execute function private.keep_campaign_membership_role();

revoke all on function private.reject_existing_campaign_membership()
  from public, anon, authenticated;
revoke all on function private.keep_campaign_membership_role()
  from public, anon, authenticated;
