alter table public.campaigns
  add column burger_index integer not null default 5
  constraint campaigns_burger_index_range check (burger_index between 1 and 9);
