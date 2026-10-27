import { setSourceFrozen, isSourceFrozen } from "./source.mjs";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { readFile, writeFile } from "node:fs/promises";
import { resolve, relative, isAbsolute } from "node:path";
import { parseArgs } from "node:util";
import { randomBytes } from "node:crypto";
import {
  tables,
  primaryKeys,
  digest,
  validateSnapshot,
  importSnapshot,
  verifySnapshot,
} from "./snapshot.mjs";
// Preserve PostgreSQL timestamps to all six fractional digits and bigint/numeric as text.
pg.types.setTypeParser(1184, (value) => value);
pg.types.setTypeParser(1114, (value) => value);
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    file: { type: "string" },
    output: { type: "string" },
    rehearsal: { type: "boolean" },
    actor: { type: "string" },
    auth: { type: "string" },
    username: { type: "string" },
    days: { type: "string" },
  },
});
const command = positionals[0];
const env = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment: ${name}`);
  return value;
};
const uuid = (value) => {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value ?? "",
    )
  )
    throw new Error("A valid UUID is required");
  return value;
};
async function connection(source = false) {
  const client = new pg.Client({
    connectionString: env(
      source ? "MIGRATION_SOURCE_DB_URL" : "MIGRATION_TARGET_DB_URL",
    ),
    application_name: "hamburger-migration",
    ssl: { rejectUnauthorized: true },
    connectionTimeoutMillis: 10000,
  });
  await client.connect();
  await client.query("set timezone='UTC'");
  return client;
}
async function loadSnapshot() {
  if (!values.file) throw new Error("--file is required");
  const snapshot = JSON.parse(await readFile(values.file, "utf8"));
  validateSnapshot(snapshot);
  return snapshot;
}
async function exportSource(client) {
  if (!values.output) throw new Error("--output is required");
  const output = resolve(values.output);
  const root = resolve(new URL("../../", import.meta.url).pathname);
  const rel = relative(root, output);
  if (!rel.startsWith("..") && !isAbsolute(rel))
    throw new Error("Keep private data exports outside the repository");
  await client.query("begin isolation level repeatable read read only");
  try {
    await client.query("set local timezone='UTC'");
    const sourceVersion = (await client.query("select version() version"))
      .rows[0].version;
    const snapshot = {
      format: 1,
      exportedAt: new Date().toISOString(),
      sourceVersion,
      sourceFrozen: await isSourceFrozen(client),
      users: (
        await client.query(
          "select id,email,display_name,is_anonymous,disabled,created_at from auth.users order by id",
        )
      ).rows,
      tables: {},
      manifest: {},
    };
    snapshot.manifest.users = {
      count: snapshot.users.length,
      sha256: digest(snapshot.users),
    };
    for (const table of tables) {
      const rows = (
        await client.query(
          `select * from public.${table} order by ${primaryKeys[table].join(",")}`,
        )
      ).rows;
      snapshot.tables[table] = rows;
      snapshot.manifest[table] = { count: rows.length, sha256: digest(rows) };
    }
    await client.query("commit");
    await writeFile(output, JSON.stringify(snapshot), {
      mode: 0o600,
      flag: "wx",
    });
    console.log(
      JSON.stringify(
        {
          output,
          sourceFrozen: snapshot.sourceFrozen,
          users: snapshot.users.length,
          tables: Object.fromEntries(
            tables.map((t) => [t, snapshot.manifest[t].count]),
          ),
        },
        null,
        2,
      ),
    );
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}
async function assertReady(client) {
  for (const table of ["profiles", ...tables]) {
    const row = (
      await client.query(
        "select relrowsecurity from pg_class where oid=$1::regclass",
        [`public.${table}`],
      )
    ).rows[0];
    if (!row?.relrowsecurity) throw new Error(`RLS missing: ${table}`);
    for (const role of ["anon", "authenticated"])
      for (const op of ["INSERT", "UPDATE", "DELETE", "TRUNCATE"])
        if (
          (
            await client.query("select has_table_privilege($1,$2,$3) allowed", [
              role,
              `public.${table}`,
              op,
            ])
          ).rows[0].allowed
        )
          throw new Error(`Unexpected grant: ${table} ${role} ${op}`);
  }
  const disabled = (
    await client.query(
      "select count(*) count from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal and t.tgenabled='D'",
    )
  ).rows[0].count;
  if (Number(disabled)) throw new Error("Application triggers disabled");
}
async function createGm(client) {
  const actor = uuid(values.actor);
  const username = values.username;
  if (!/^[a-z0-9_-]{3,20}$/.test(username ?? ""))
    throw new Error("--username must match the existing GM username");
  const p = (
    await client.query("select * from public.profiles where id=$1", [actor])
  ).rows[0];
  const access = (
    await client.query(
      "select account_name from public.gm_access where user_id=$1",
      [actor],
    )
  ).rows[0];
  if (
    !p ||
    p.account_kind !== "gm" ||
    p.disabled ||
    p.auth_user_id ||
    !access ||
    access.account_name.split("@")[0] !== username
  )
    throw new Error("GM identity is missing, linked or account name differs");
  const domain = process.env.MIGRATION_GM_ACCOUNT_DOMAIN || "gm.local";
  const admin = createClient(
    env("MIGRATION_SUPABASE_URL"),
    env("MIGRATION_SECRET_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  // Initial random password is deliberately not displayed. A verified owner must receive a later reset securely.
  const { data, error } = await admin.auth.admin.createUser({
    email: `${username}@${domain}`,
    password: randomBytes(48).toString("base64url"),
    email_confirm: true,
    user_metadata: { displayName: p.display_name, gmUsername: username },
  });
  if (error)
    throw new Error(
      "Target GM account creation failed; inspect the provider console without logging credentials",
    );
  try {
    await client.query("select public.complete_identity_migration($1,$2)", [
      actor,
      data.user.id,
    ]);
  } catch {
    throw new Error(
      `GM account created but binding failed. Reconcile the orphan target auth account ${data.user.id}; do not retry creating blindly.`,
    );
  }
  console.log(
    JSON.stringify({
      actorId: actor,
      authUserId: data.user.id,
      next: "Verify the owner and reset the password securely in Supabase Auth.",
    }),
  );
}
let client;
try {
  if (command === "validate") {
    const snapshot = await loadSnapshot();
    console.log(
      JSON.stringify(
        {
          valid: true,
          users: snapshot.users.length,
          tables: Object.fromEntries(
            tables.map((t) => [t, snapshot.tables[t].length]),
          ),
        },
        null,
        2,
      ),
    );
  } else {
    const source = ["export", "source-freeze", "source-thaw"].includes(command);
    client = await connection(source);
    if (command === "export") await exportSource(client);
    else if (command === "source-freeze" || command === "source-thaw")
      await setSourceFrozen(client, command === "source-freeze");
    else if (command === "import") {
      const snapshot = await loadSnapshot();
      if (!values.rehearsal && !snapshot.sourceFrozen)
        throw new Error(
          "Final import requires a source-frozen snapshot; use --rehearsal only for staging",
        );
      await importSnapshot(client, snapshot);
      console.log(
        "Snapshot imported and content verified; target writes remain disabled.",
      );
    } else if (command === "verify") {
      await assertReady(client);
      console.log(
        JSON.stringify(
          await verifySnapshot(client, await loadSnapshot()),
          null,
          2,
        ),
      );
    } else if (command === "target-close") {
      await client.query(
        "update private.runtime set business_writes=false,public_ready=false where singleton",
      );
      console.log("Target business writes disabled.");
    } else if (command === "target-open") {
      const source = await connection(true);
      try {
        if (!(await isSourceFrozen(source)))
          throw new Error("Source must still be frozen before target opens");
      } finally {
        await source.end();
      }
      const snapshot = await loadSnapshot();
      if (!snapshot.sourceFrozen)
        throw new Error("A source-frozen final snapshot is required");
      await client.query("begin");
      try {
        await assertReady(client);
        await verifySnapshot(client, snapshot);
        await client.query(
          "update private.runtime set business_writes=true where singleton",
        );
        await client.query("commit");
        console.log("Target business writes enabled. Keep source frozen.");
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
    } else if (command === "migration-window") {
      const days = Number(values.days ?? "14");
      if (!Number.isInteger(days) || days < 0 || days > 30)
        throw new Error("--days must be 0..30");
      await client.query(
        "update private.runtime set migration_until=now()+($1::integer*interval '1 day') where singleton",
        [days],
      );
      console.log(`Identity migration window set to ${days} days.`);
    } else if (command === "bind") {
      await client.query("select public.complete_identity_migration($1,$2)", [
        uuid(values.actor),
        uuid(values.auth),
      ]);
      console.log("Verified identity linked.");
    } else if (command === "create-gm") await createGm(client);
    else if (command === "status")
      console.log(
        JSON.stringify(
          (
            await client.query(
              "select business_writes,migration_until from private.runtime where singleton",
            )
          ).rows[0],
        ),
      );
    else
      throw new Error(
        "Commands: export, validate, import, verify, source-freeze, source-thaw, target-open, target-close, migration-window, create-gm, bind, status",
      );
  }
} catch (error) {
  // Database/HTTP errors can contain sensitive connection details or row values; never log the full object.
  const local =
    error.message?.startsWith("Missing environment:") ||
    /^(Invalid|Snapshot checksum|Target |Source |RLS |Unexpected grant|Application|Final import|Keep private|--|A valid|A source|Commands:|GM |Identity checksum|Duplicate source)/.test(
      error.message ?? "",
    );
  console.error(
    local
      ? error.message
      : `Migration failed (${error.code ?? "operation_error"}). No connection strings, credentials or row contents logged.`,
  );
  process.exitCode = 1;
} finally {
  if (client) await client.end();
}
