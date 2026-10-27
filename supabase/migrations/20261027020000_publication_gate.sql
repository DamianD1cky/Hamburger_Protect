-- Keep the website in maintenance while isolated post-import write checks run.
alter table private.runtime add column public_ready boolean not null default false;
create or replace function public.get_service_status()
returns text language sql stable security definer set search_path = ''
as $$
  select case when business_writes and public_ready then 'ready' else 'maintenance' end
  from private.runtime where singleton;
$$;
