import { spawnSync } from "node:child_process";
import {
  mkdtemp,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const migrationsDirectory = new URL(
  "../supabase/migrations/",
  import.meta.url,
);
const dryRun = process.argv.includes("--dry-run");

function quoteLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function runSupabase(args) {
  const result = spawnSync(
    "node_modules/.bin/supabase",
    args,
    {
      encoding: "utf8",
      timeout: 180_000,
      maxBuffer: 25 * 1024 * 1024,
    },
  );
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    throw new Error(
      `Supabase CLI failed with exit code ${result.status ?? "unknown"}.`,
    );
  }
  return result.stdout;
}

function queryJson(sql) {
  const output = runSupabase([
    "db",
    "query",
    "--linked",
    "--output",
    "json",
    sql,
  ]);
  return JSON.parse(output || "[]");
}

async function localMigrations() {
  const entries = await readdir(migrationsDirectory);
  const migrations = [];
  const versions = new Set();
  for (const filename of entries.sort()) {
    const match = /^(\d{14})_(.+)\.sql$/.exec(filename);
    if (!match) continue;
    const [, version, name] = match;
    if (versions.has(version)) {
      throw new Error(`Duplicate migration version: ${version}`);
    }
    versions.add(version);
    const sql = await readFile(
      new URL(filename, migrationsDirectory),
      "utf8",
    );
    if (/^\s*(begin|commit|rollback)\s*;/im.test(sql)) {
      throw new Error(
        `${filename} contains an explicit transaction boundary.`,
      );
    }
    migrations.push({ filename, version, name, sql });
  }
  return migrations;
}

function deploymentSql(migration) {
  const { version, name, sql } = migration;
  return `begin;
select pg_advisory_xact_lock(hashtextextended('hamburger-protect-migrations', 0));
do $migration_guard$
begin
  if exists (
    select 1
    from supabase_migrations.schema_migrations
    where version = ${quoteLiteral(version)}
  ) then
    raise exception 'MIGRATION_ALREADY_APPLIED:${version}';
  end if;
end
$migration_guard$;

${sql.trim()}

insert into supabase_migrations.schema_migrations(
  version,
  statements,
  name
)
values (
  ${quoteLiteral(version)},
  array['applied via Supabase Management API'],
  ${quoteLiteral(name)}
);
commit;
`;
}

async function applyMigration(migration) {
  const folder = await mkdtemp(
    join(tmpdir(), "hamburger-supabase-push-"),
  );
  const file = join(folder, `${migration.version}.sql`);
  await writeFile(file, deploymentSql(migration), { mode: 0o600 });
  runSupabase([
    "db",
    "query",
    "--linked",
    "--file",
    file,
    "--output",
    "json",
  ]);
}

const local = await localMigrations();
const remote = queryJson(
  "select version from supabase_migrations.schema_migrations order by version",
);
const localVersions = new Set(local.map(({ version }) => version));
const remoteVersions = new Set(remote.map(({ version }) => version));
const unknownRemote = [...remoteVersions].filter(
  (version) => !localVersions.has(version),
);
if (unknownRemote.length) {
  throw new Error(
    `Remote migrations are missing locally: ${unknownRemote.join(", ")}`,
  );
}

const pending = local.filter(
  ({ version }) => !remoteVersions.has(version),
);
if (!pending.length) {
  console.log("Remote database is up to date.");
  process.exit(0);
}

console.log(
  `${dryRun ? "Pending" : "Applying"} ${pending.length} migration(s):`,
);
for (const migration of pending) {
  console.log(`- ${migration.filename}`);
}

if (!dryRun) {
  for (const migration of pending) {
    await applyMigration(migration);
    console.log(`Applied ${migration.filename}`);
  }
  console.log("Remote migrations are up to date.");
}
