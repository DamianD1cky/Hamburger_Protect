import { tables } from "./snapshot.mjs";
export async function isSourceFrozen(client) {
  if (
    !(
      await client.query(
        "select to_regclass('migration_control.runtime') present",
      )
    ).rows[0].present
  )
    return false;
  return (
    (
      await client.query(
        "select frozen from migration_control.runtime where singleton",
      )
    ).rows[0]?.frozen === true
  );
}
export async function setSourceFrozen(client, frozen) {
  if (!frozen) {
    await client.query(
      "update migration_control.runtime set frozen=false where singleton",
    );
    console.log("Source business writes restored.");
    return;
  }
  await client.query("begin");
  try {
    for (const sql of [
      "create schema if not exists migration_control",
      "revoke all on schema migration_control from public",
      "create table if not exists migration_control.runtime(singleton boolean primary key check(singleton),frozen boolean not null)",
      "insert into migration_control.runtime values(true,true) on conflict(singleton) do update set frozen=true",
      "create or replace function migration_control.reject_business_writes() returns trigger language plpgsql security definer set search_path='' as $$begin if (select frozen from migration_control.runtime where singleton) then raise exception 'MIGRATION_MAINTENANCE'; end if; return null;end;$$",
      "revoke all on function migration_control.reject_business_writes() from public",
    ])
      await client.query(sql);
    for (const table of tables) {
      const exists = (
        await client.query(
          "select 1 from pg_trigger where tgrelid=$1::regclass and tgname='migration_freeze'",
          [`public.${table}`],
        )
      ).rowCount;
      if (!exists)
        await client.query(
          `create trigger migration_freeze before insert or update or delete or truncate on public.${table} for each statement execute function migration_control.reject_business_writes()`,
        );
    }
    await client.query("commit");
    console.log("Source business writes frozen; Auth tables remain writable.");
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}
