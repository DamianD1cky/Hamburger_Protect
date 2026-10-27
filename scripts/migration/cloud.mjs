import { readFile, writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import pg from "pg";
import { tables, primaryKeys, validateSnapshot } from "./snapshot.mjs";
import { isSourceFrozen } from "./source.mjs";
const project = "wnutyroweeipsxyhlocx";
const quote = (value) => "'" + String(value).replaceAll("'", "''") + "'";
const statement = (value) => quote(JSON.stringify(value)) + "::jsonb";
const query = async (sql) => {
  const folder = await mkdtemp(join(tmpdir(), "hamburger-cloud-"));
  const file = join(folder, "query.sql");
  await writeFile(file, sql, { mode: 0o600 });
  const result = spawnSync(
    "node_modules/.bin/supabase",
    [
      "db",
      "query",
      "--project-ref",
      project,
      "--linked",
      "--file",
      file,
      "--output",
      "json",
    ],
    { encoding: "utf8", timeout: 60000, maxBuffer: 25 * 1024 * 1024 },
  );
  if (result.status !== 0)
    throw new Error("CLOUD_SQL_FAILED:" + String(result.status));
  return JSON.parse(result.stdout);
};
export async function tableColumns() {
  const c = new pg.Client({
    connectionString: process.env.MIGRATION_SOURCE_DB_URL,
    ssl: { rejectUnauthorized: true },
    connectionTimeoutMillis: 10000,
  });
  c.on("error", () => {});
  try {
    await c.connect();
    return (
      await c.query(
        "select table_name,column_name,data_type from information_schema.columns where table_schema='public' and table_name=any($1) order by table_name,ordinal_position",
        [tables],
      )
    ).rows;
  } finally {
    await c.end().catch(() => {});
  }
}
function normalized(table, columns, alias = "r") {
  const overrides = columns.filter(
    (c) =>
      c.table_name === table &&
      [
        "bigint",
        "numeric",
        "timestamp with time zone",
        "timestamp without time zone",
      ].includes(c.data_type),
  );
  return (
    `to_jsonb(${alias})` +
    (overrides.length
      ? " || jsonb_build_object(" +
        overrides
          .flatMap((c) => [
            quote(c.column_name),
            `${alias}."${c.column_name}"::text`,
          ])
          .join(",") +
        ")"
      : "")
  );
}
function orderedRows(table, columns) {
  return `(select coalesce(jsonb_agg(data order by ${primaryKeys[table].map((k) => '"' + k + '"').join(",")}),'[]'::jsonb) from (select ${normalized(table, columns)} data,${primaryKeys[table].map((k) => 'r."' + k + '"').join(",")} from public.${table} r) rows)`;
}
export function importSQL(
  snapshot,
  columns,
  rehearsal = false,
  staging = false,
) {
  validateSnapshot(snapshot);
  if (!rehearsal && !staging && !snapshot.sourceFrozen)
    throw new Error("SOURCE_NOT_FROZEN");
  const guards = ["profiles", ...tables]
    .map(
      (t) =>
        `if exists(select 1 from public.${t}) then raise exception 'TARGET_NOT_EMPTY:${t}';end if;`,
    )
    .join("\n");
  let sql = `begin;set local timezone='UTC';do $guard$ begin if (select business_writes from private.runtime where singleton) then raise exception 'TARGET_OPEN';end if;${guards} end $guard$;\n`;
  const triggers = {
    campaigns: ["campaigns_activity", "close_join_requests"],
    quests: ["quests_activity"],
    notes: ["notes_activity"],
    resources: ["resources_activity"],
    checklist_items: ["checklist_activity"],
    event_log: ["event_log_actor_snapshot"],
  };
  for (const [t, names] of Object.entries(triggers))
    for (const name of names)
      sql += `alter table public.${t} disable trigger ${name};\n`;
  const users = snapshot.users.map((u) => ({
    id: u.id,
    account_kind: u.is_anonymous ? "player" : "gm",
    display_name: u.display_name ?? "",
    disabled: Boolean(u.disabled),
    created_at: u.created_at,
  }));
  sql += `insert into public.profiles(id,account_kind,display_name,disabled,created_at) select id,account_kind,display_name,disabled,created_at from jsonb_populate_recordset(null::public.profiles,${statement(users)});\n`;
  for (const t of tables) {
    const rows = snapshot.tables[t];
    if (!rows.length) continue;
    const names = Object.keys(rows[0]);
    const allowed = new Set(
      columns.filter((c) => c.table_name === t).map((c) => c.column_name),
    );
    if (names.some((n) => !allowed.has(n) || !/^[a-z_]+$/.test(n)))
      throw new Error("UNEXPECTED_COLUMN");
    const fields = names.map((n) => '"' + n + '"').join(",");
    sql += `insert into public.${t}(${fields}) ${t === "event_log" ? "overriding system value " : ""}select ${fields} from jsonb_populate_recordset(null::public.${t},${statement(rows)});\n`;
  }
  // ALTER SEQUENCE is transactional, avoiding setval changes that survive a rehearsal rollback.
  sql += `do $sequence$ declare seq text;next_id bigint;begin select pg_get_serial_sequence('public.event_log','id'),coalesce(max(id),0)+1 into seq,next_id from public.event_log;execute format('alter sequence %s restart with %s',seq,next_id);end $sequence$;\n`;
  for (const [t, names] of Object.entries(triggers))
    for (const name of names)
      sql += `alter table public.${t} enable trigger ${name};\n`;
  sql += verifySQL(snapshot, columns);
  sql += rehearsal
    ? "rollback;select 'rehearsal_verified_and_rolled_back' result;"
    : staging
      ? "commit;select 'staging_import_verified_and_committed' result;"
      : "commit;select 'final_import_verified_and_committed' result;";
  return sql;
}
export function verifySQL(snapshot, columns) {
  const users = snapshot.users.map((u) => ({
    id: u.id,
    is_anonymous: u.is_anonymous,
    display_name: u.display_name,
    disabled: u.disabled,
    created_at: u.created_at,
  }));
  const conditions = tables
    .map(
      (t) =>
        `if ${orderedRows(t, columns)} is distinct from ${statement(snapshot.tables[t])} then raise exception 'CONTENT_MISMATCH:${t}';end if;`,
    )
    .join("\n");
  return `do $verify$ begin ${conditions}\nif (select coalesce(jsonb_agg(jsonb_build_object('id',id,'is_anonymous',account_kind='player','display_name',display_name,'disabled',disabled,'created_at',created_at::text) order by id),'[]'::jsonb) from public.profiles) is distinct from ${statement(users)} then raise exception 'IDENTITY_CONTENT_MISMATCH';end if;end $verify$;\n`;
}
export function syncSQL(previous, current, columns) {
  validateSnapshot(previous);
  validateSnapshot(current);
  if (!current.sourceFrozen) throw new Error("SOURCE_NOT_FROZEN");
  // Prove target still matches its staged snapshot before accepting final source changes.
  let sql = importSQL(current, columns, false, true);
  const end = sql.indexOf("alter table public.");
  sql =
    `begin;set local timezone='UTC';do $guard$ begin if (select business_writes from private.runtime where singleton) then raise exception 'TARGET_OPEN';end if;end $guard$;\n${verifySQL(previous, columns)}` +
    sql.slice(end);
  const profileInsert =
    /insert into public\.profiles\(id,account_kind,display_name,disabled,created_at\)([^;]+);/;
  sql = sql.replace(
    profileInsert,
    (match) =>
      match.slice(0, -1) +
      " on conflict(id) do update set account_kind=excluded.account_kind,display_name=excluded.display_name,disabled=excluded.disabled,created_at=excluded.created_at;",
  );
  for (const table of tables) {
    const names = Object.keys(current.tables[table][0] ?? {});
    if (!names.length) continue;
    const key = primaryKeys[table];
    const fields = names.filter((n) => !key.includes(n));
    const pattern = new RegExp("insert into public\\." + table + "\\([^;]+;");
    sql = sql.replace(
      pattern,
      (match) =>
        match.slice(0, -1) +
        " on conflict(" +
        key.join(",") +
        ") do update set " +
        fields.map((n) => '"' + n + '"=excluded."' + n + '"').join(",") +
        ";",
    );
  }
  // Missing source rows are handled only after dependency updates, while generated-event triggers are paused.
  const remove = tables
    .slice()
    .reverse()
    .map((table) => {
      const keys = primaryKeys[table];
      const rows = current.tables[table].map((r) =>
        Object.fromEntries(keys.map((k) => [k, r[k]])),
      );
      return `delete from public.${table} target where not exists(select 1 from jsonb_populate_recordset(null::public.${table},${statement(rows)}) source where ${keys.map((k) => `source."${k}"=target."${k}"`).join(" and ")});`;
    })
    .join("\n");
  const restore = sql.indexOf("alter table public.campaigns enable trigger");
  sql = sql.slice(0, restore) + remove + "\n" + sql.slice(restore);
  return sql.replace(
    "staging_import_verified_and_committed",
    "final_sync_verified_and_committed",
  );
}
if (
  process.argv[1] &&
  import.meta.url === new URL(process.argv[1], "file://").href
) {
  try {
    const command = process.argv[2];
    if (!["verify", "rehearsal", "stage", "final", "sync", "publish"].includes(command))
      throw new Error("UNKNOWN_COMMAND");
    const file = process.argv[3];
    const snapshot = JSON.parse(await readFile(file, "utf8"));
    const columns = await tableColumns();
    const start = Date.now();
    if (command === "publish") {
      if (!snapshot.sourceFrozen) throw new Error("SOURCE_NOT_FROZEN");
      const source = new pg.Client({connectionString:process.env.MIGRATION_SOURCE_DB_URL,ssl:{rejectUnauthorized:true},connectionTimeoutMillis:10000});
      source.on("error",()=>{});
      try {await source.connect();if(!await isSourceFrozen(source))throw new Error("SOURCE_IS_WRITABLE");}
      finally {await source.end().catch(()=>{});}
      const result = await query(`begin;set local timezone='UTC';select singleton from private.runtime where singleton for update;${verifySQL(snapshot,columns)}update private.runtime set business_writes=true,public_ready=true,migration_until=now()+interval '14 days' where singleton;commit;select business_writes,public_ready,migration_until from private.runtime where singleton;`);
      console.log(JSON.stringify({published:true,state:result.at(-1)}));
      process.exit(0);
    }
    const sql =
      command === "sync"
        ? syncSQL(
            JSON.parse(await readFile(process.argv[4], "utf8")),
            snapshot,
            columns,
          )
        : command === "verify"
          ? `begin;set local timezone='UTC';${verifySQL(snapshot, columns)}commit;select 'verified' result;`
          : importSQL(
              snapshot,
              columns,
              command === "rehearsal",
              command === "stage",
            );
    const result = await query(sql);
    console.log(
      JSON.stringify({
        command,
        result: result.at(-1),
        milliseconds: Date.now() - start,
        counts: Object.fromEntries(
          tables.map((t) => [t, snapshot.tables[t].length]),
        ),
      }),
    );
  } catch (e) {
    console.error("Cloud migration failed: " + e.message);
    process.exitCode = 1;
  }
}
export { query };
