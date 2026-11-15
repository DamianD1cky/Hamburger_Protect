alter table public.dice_rolls drop constraint dice_rolls_status_check;
alter table public.dice_rolls add constraint dice_rolls_status_check
  check(status in ('pending','complete','failed'));

create function public.fail_dice_roll(p_id uuid) returns void
language sql security definer set search_path='' as $$
  update public.dice_rolls set status='failed' where id=p_id and status='pending';
$$;
revoke all on function public.fail_dice_roll(uuid) from public,anon,authenticated;
grant execute on function public.fail_dice_roll(uuid) to service_role;
