import { createHash } from "node:crypto";
export const tables = [
  "campaigns",
  "campaign_members",
  "gm_access",
  "campaign_join_requests",
  "quests",
  "notes",
  "resources",
  "checklist_items",
  "quest_submissions",
  "campaign_archives",
  "event_log",
];
export const primaryKeys = {
  campaigns: ["id"],
  campaign_members: ["campaign_id", "user_id"],
  gm_access: ["user_id"],
  campaign_join_requests: ["id"],
  quests: ["id"],
  notes: ["id"],
  resources: ["id"],
  checklist_items: ["id"],
  quest_submissions: ["id"],
  campaign_archives: ["campaign_id"],
  event_log: ["id"],
};
export function canonical(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  return value;
}
export const digest = (value) =>
  createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
export function validateSnapshot(snapshot) {
  if (
    snapshot.format !== 1 ||
    !snapshot.users ||
    !Array.isArray(snapshot.users) ||
    !snapshot.tables ||
    !snapshot.manifest
  )
    throw new Error("Invalid snapshot format");
  if (
    digest(snapshot.users) !== snapshot.manifest.users.sha256 ||
    snapshot.users.length !== snapshot.manifest.users.count
  )
    throw new Error("Identity checksum mismatch");
  for (const table of tables) {
    const rows = snapshot.tables[table];
    const manifest = snapshot.manifest[table];
    if (
      !Array.isArray(rows) ||
      !manifest ||
      manifest.count !== rows.length ||
      digest(rows) !== manifest.sha256
    )
      throw new Error(`Snapshot checksum mismatch: ${table}`);
    const keys = rows.map((row) =>
      primaryKeys[table].map((key) => row[key]).join(":"),
    );
    if (
      keys.some((key) => !key || key.includes("undefined")) ||
      new Set(keys).size !== keys.length
    )
      throw new Error(`Invalid primary keys: ${table}`);
  }
  if (
    new Set(snapshot.users.map((user) => user.id)).size !==
    snapshot.users.length
  )
    throw new Error("Duplicate source identities");
}
export async function importSnapshot(client, snapshot) {
  validateSnapshot(snapshot);
  await client.query("begin");
  try {
    if (
      (
        await client.query(
          "select business_writes from private.runtime where singleton",
        )
      ).rows[0]?.business_writes !== false
    )
      throw new Error("Target must be in maintenance");
    for (const table of ["profiles", ...tables])
      if (
        Number(
          (await client.query(`select count(*) count from public.${table}`))
            .rows[0].count,
        ) !== 0
      )
        throw new Error(`Target is not empty: ${table}`);
    // Disable only app-generated events and derived state. Foreign keys and Auth triggers remain enabled.
    const appTriggers = {
      campaigns: ["campaigns_activity", "close_join_requests"],
      quests: ["quests_activity"],
      notes: ["notes_activity"],
      resources: ["resources_activity"],
      checklist_items: ["checklist_activity"],
      event_log: ["event_log_actor_snapshot"],
    };
    // Discover names from the applied baseline to reject drift instead of disabling all triggers.
    const actual = (
      await client.query(
        "select c.relname table_name,t.tgname from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal",
      )
    ).rows;
    const disabled = [];
    for (const { table_name, tgname } of actual)
      if (appTriggers[table_name]?.includes(tgname)) {
        await client.query(
          `alter table public.${table_name} disable trigger ${tgname}`,
        );
        disabled.push([table_name, tgname]);
      }
    for (const user of snapshot.users)
      await client.query(
        "insert into public.profiles(id,account_kind,display_name,disabled,created_at) values($1,$2,$3,$4,$5)",
        [
          user.id,
          user.is_anonymous ? "player" : "gm",
          user.display_name ?? "",
          Boolean(user.disabled),
          user.created_at,
        ],
      );
    for (const table of tables) {
      const columns = new Set(
        (
          await client.query(
            "select column_name from information_schema.columns where table_schema='public' and table_name=$1",
            [table],
          )
        ).rows.map((row) => row.column_name),
      );
      for (const row of snapshot.tables[table]) {
        const names = Object.keys(row);
        if (
          !names.length ||
          names.some((name) => !columns.has(name) || !/^[a-z_]+$/.test(name))
        )
          throw new Error(`Unknown source columns: ${table}`);
        const values = names.map((name) =>
          row[name] && typeof row[name] === "object"
            ? JSON.stringify(row[name])
            : row[name],
        );
        await client.query(
          `insert into public.${table} (${names.map((name) => `"${name}"`).join(",")}) ${table === "event_log" ? "overriding system value " : ""}values(${names.map((_, i) => `$${i + 1}`).join(",")})`,
          values,
        );
      }
    }
    await client.query(
      "select setval(pg_get_serial_sequence('public.event_log','id'),coalesce((select max(id) from public.event_log),1),exists(select 1 from public.event_log))",
    );
    for (const [table, trigger] of disabled)
      await client.query(
        `alter table public.${table} enable trigger ${trigger}`,
      );
    // Compare before commit. Missing rows or trigger rewrites abort the entire import.
    await verifySnapshot(client, snapshot);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}
export async function verifySnapshot(client, snapshot) {
  validateSnapshot(snapshot);
  for (const table of tables) {
    const order = primaryKeys[table].join(",");
    const rows = (
      await client.query(`select * from public.${table} order by ${order}`)
    ).rows;
    if (digest(rows) !== snapshot.manifest[table].sha256)
      throw new Error(`Target content mismatch: ${table}`);
  }
  const users = (
    await client.query(
      "select id,account_kind='player' is_anonymous,display_name,disabled,created_at from public.profiles order by id",
    )
  ).rows;
  const expected = snapshot.users.map(
    ({ id, is_anonymous, display_name, disabled, created_at }) => ({
      id,
      is_anonymous,
      display_name,
      disabled,
      created_at,
    }),
  );
  if (digest(users) !== digest(expected))
    throw new Error("Target identity content mismatch");
  return tables.map((table) => ({
    table,
    count: snapshot.tables[table].length,
    sha256: snapshot.manifest[table].sha256,
  }));
}
