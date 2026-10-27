-- Public maintenance state contains no user data. The private runtime table stays inaccessible.
create function public.get_service_status()
returns text language sql stable security definer set search_path = ''
as $$
  select case when business_writes then 'ready' else 'maintenance' end
  from private.runtime where singleton;
$$;
revoke all on function public.get_service_status() from public;
grant execute on function public.get_service_status() to anon, authenticated;
