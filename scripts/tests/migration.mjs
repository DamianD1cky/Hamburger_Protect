import { importSQL, syncSQL } from "../migration/cloud.mjs";
import { setSourceFrozen, isSourceFrozen } from "../migration/source.mjs";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import {
  tables,
  primaryKeys,
  digest,
  validateSnapshot,
  importSnapshot,
  verifySnapshot,
} from "../migration/snapshot.mjs";
import { createMigrationHandler } from "../../supabase/functions/migrate-identity/handler.ts";
const baseline = await readFile(
  new URL(
    "../../supabase/migrations/20261027000000_hamburger_protect.sql",
    import.meta.url,
  ),
  "utf8",
);
const auth = `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,is_anonymous boolean default false,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;`;
const source = new PGlite();
const target = new PGlite();
const rejected = new PGlite();
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const client = (db) => ({
  query: (sql, args = []) =>
    db.query(sql, args, {
      parsers: { 20: (v) => v, 1184: (v) => v, 1114: (v) => v, 1700: (v) => v },
    }),
});
let assertions = 0;
function check(v, message) {
  assert.ok(v, message);
  assertions++;
}
try {
  for (const db of [source, target, rejected]) {
    await db.exec(auth);
    await db.exec(baseline);
    await db.exec("set timezone='UTC'");
  }
  await source.query(
    "insert into public.profiles(id,account_kind,display_name,created_at) values($1,'gm','旧GM','2026-10-01 10:00:00.123456+00'),($2,'player','旧玩家','2026-10-01 10:00:00.654321+00')",
    [id(1), id(2)],
  );
  await source.query(
    "insert into public.campaigns(id,name,join_code,status,created_by,archived_at) values($1,'归档班次','ABC123','archived',$2,now())",
    [id(10), id(1)],
  );
  await source.query(
    "insert into public.campaign_members(campaign_id,user_id,role,character_name,active,job_title) values($1,$2,'gm','GM',false,'店长'),($1,$3,'player','厨师',false,'厨师')",
    [id(10), id(1), id(2)],
  );
  await source.query(
    "insert into public.gm_access(user_id,account_name,display_name,status) values($1,'gm@gm.local','旧GM','approved')",
    [id(1)],
  );
  await source.query(
    "insert into public.notes(id,campaign_id,author_id,title,body,rotation) values($1,$2,$3,'留言','历史',1.20)",
    [id(20), id(10), id(2)],
  );
  await source.query(
    "insert into public.campaign_archives(campaign_id,snapshot,archived_by) values($1,$2,$3)",
    [
      id(10),
      { submissions: [{ message: "私密历史", submitted_by: id(2) }] },
      id(1),
    ],
  );
  await source.exec(
    "alter table public.event_log disable trigger event_log_actor_snapshot",
  );
  await source.query(
    "insert into public.event_log(id,campaign_id,actor_id,event_type,entity_type,payload) overriding system value values(9007199254740993,$1,$2,'old_event','note',$3)",
    [id(10), id(2), { actor_name: "历史角色名", after: { body: "历史" } }],
  );
  await source.exec(
    "alter table public.event_log enable trigger event_log_actor_snapshot",
  );
  const sc = client(source),
    tc = client(target),
    rc = client(rejected);
  const snapshot = {
    format: 1,
    sourceFrozen: true,
    users: (
      await sc.query(
        "select id,account_kind='player' is_anonymous,display_name,disabled,created_at from public.profiles order by id",
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
      await sc.query(
        `select * from public.${table} order by ${primaryKeys[table].join(",")}`,
      )
    ).rows;
    snapshot.tables[table] = rows;
    snapshot.manifest[table] = { count: rows.length, sha256: digest(rows) };
  }
  validateSnapshot(snapshot);
  assertions++;
  const corrupt = structuredClone(snapshot);
  corrupt.tables.notes[0].body = "tampered";
  assert.throws(() => validateSnapshot(corrupt), /checksum/);
  assertions++;
  await importSnapshot(tc, snapshot);
  check(
    (await verifySnapshot(tc, snapshot)).length === 11,
    "all 11 tables match",
  );
  const historical = (
    await tc.query(
      "select payload from public.event_log where id=9007199254740993",
    )
  ).rows[0];
  check(
    historical.payload.actor_name === "历史角色名",
    "import preserves historical actor_name",
  );
  check(
    (await tc.query("select count(*) count from public.event_log")).rows[0]
      .count === String(snapshot.tables.event_log.length),
    "import creates no extra log entries",
  );
  check(
    (
      await tc.query(
        "select created_at::text time from public.profiles where id=$1",
        [id(1)],
      )
    ).rows[0].time.includes(".123456"),
    "microsecond precision preserved",
  );
  check(
    (await tc.query("select auth_user_id from public.profiles limit 1")).rows[0]
      .auth_user_id === null,
    "history imported without fake Auth users",
  );
  const next = (
    await tc.query(
      "insert into public.event_log(campaign_id,event_type,entity_type) values($1,'new','note') returning id",
      [id(10)],
    )
  ).rows[0].id;
  check(BigInt(next) > 9007199254740993n, "identity sequence calibrated");
  await assert.rejects(importSnapshot(tc, snapshot), /not empty/);
  assertions++;
  const orphan = structuredClone(snapshot);
  orphan.tables.notes[0].author_id = id(99);
  orphan.manifest.notes.sha256 = digest(orphan.tables.notes);
  await assert.rejects(importSnapshot(rc, orphan), /foreign key/);
  assertions++;
  check(
    (await rc.query("select count(*) count from public.profiles")).rows[0]
      .count === "0",
    "failed import fully rolls back",
  );
  check(
    (
      await rc.query(
        "select count(*) count from pg_trigger where tgenabled='D' and not tgisinternal",
      )
    ).rows[0].count === "0",
    "failed import restores trigger state",
  );
  const config = {
    supabaseUrl: "https://target.test",
    nhostGraphqlUrl: "https://old.test/v1",
    publicKey: "test-public",
    secretKey: "test-secret",
    allowedOrigins: ["https://site.test"],
    endsAt: "2099-01-01",
  };
  const calls = [];
  let conflict = false,
    invalidLegacy = false;
  const mock = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.endsWith("/auth/v1/user"))
      return Response.json({ id: id(91), is_anonymous: true });
    if (url.endsWith("/consume_identity_attempt"))
      return new Response(null, { status: 204 });
    if (url === config.nhostGraphqlUrl)
      return invalidLegacy
        ? new Response(null, { status: 401 })
        : Response.json({ data: { __typename: "query_root" } });
    if (url.endsWith("/complete_identity_migration"))
      return new Response(JSON.stringify(id(2)), {
        status: conflict ? 400 : 200,
      });
    throw new Error("unexpected URL");
  };
  const handler = createMigrationHandler(config, mock);
  const request = (body) =>
    new Request("https://edge.test", {
      method: "POST",
      headers: {
        origin: "https://site.test",
        authorization: "Bearer target-session",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
  const legacyToken =
    "header." +
    Buffer.from(
      JSON.stringify({
        "https://hasura.io/jwt/claims": {
          "x-hasura-user-id": id(2),
          "x-hasura-allowed-roles": ["anonymous"],
        },
      }),
    ).toString("base64url") +
    ".signature";
  const restored = await handler(
    request({
      legacyAccessToken: legacyToken,
      actorId: id(99),
      verificationUrl: "https://evil.test",
    }),
  );
  check(restored.status === 200, "valid target + old sessions bind");
  check(
    (await restored.json()).actorId === id(2),
    "caller supplied actor ID ignored",
  );
  check(
    calls.every(
      (c) => !c.url.includes(legacyToken) && !c.url.includes("evil.test"),
    ),
    "token never used in URL and caller cannot choose verifier",
  );
  const bind = JSON.parse(
    calls.find((c) => c.url.endsWith("/complete_identity_migration")).options
      .body,
  );
  check(
    bind.p_actor_id === id(2) && bind.p_auth_user_id === id(91),
    "binding uses verified server identities",
  );
  check(
    calls.find((c) => c.url === config.nhostGraphqlUrl).options.headers[
      "x-hasura-role"
    ] === "anonymous",
    "source authenticates anonymous role before claims are used",
  );
  check(
    (await handler(request({ legacyAccessToken: "not-a-jwt" }))).status === 401,
    "malformed old token cannot bind identity",
  );
  conflict = true;
  check(
    (await handler(request({ legacyAccessToken: legacyToken }))).status === 409,
    "identity conflict fails",
  );
  conflict = false;
  invalidLegacy = true;
  check(
    (await handler(request({ legacyAccessToken: legacyToken }))).status === 401,
    "invalid old session fails",
  );
  invalidLegacy = false;
  check(
    (await handler(request({ legacyAccessToken: "x".repeat(13000) })))
      .status === 413,
    "oversized input rejected",
  );
  check(
    (
      await handler(
        new Request("https://edge.test", {
          method: "POST",
          headers: { origin: "https://evil.test" },
        }),
      )
    ).status === 403,
    "unknown origins rejected",
  );
  check(
    (
      await createMigrationHandler(
        { ...config, endsAt: "2020-01-01" },
        mock,
      )(request({ legacyAccessToken: "x" }))
    ).status === 410,
    "expired migration window rejected",
  );
  check(
    (await handler(new Request("https://edge.test", { method: "POST" })))
      .status === 401,
    "missing target session rejected",
  );
  const columns = (
    await rc.query(
      "select table_name,column_name,data_type from information_schema.columns where table_schema='public' order by table_name,ordinal_position",
    )
  ).rows;
  await rejected.exec(importSQL(snapshot, columns, false, true));
  assertions++;
  const finalSnapshot = structuredClone(snapshot);
  finalSnapshot.tables.campaigns[0].name = "同步后的战役";
  finalSnapshot.tables.notes = [];
  for (const table of ["campaigns", "notes"])
    finalSnapshot.manifest[table] = {
      count: finalSnapshot.tables[table].length,
      sha256: digest(finalSnapshot.tables[table]),
    };
  await rc.query("insert into auth.users(id) values($1)", [id(101)]);
  await rc.query("update public.profiles set auth_user_id=$1 where id=$2", [
    id(101),
    id(1),
  ]);
  await rejected.exec(syncSQL(snapshot, finalSnapshot, columns));
  check(
    (await rc.query("select name from public.campaigns")).rows[0].name ===
      "同步后的战役",
    "final sync updates changed source rows",
  );
  check(
    (await rc.query("select count(*) n from public.notes")).rows[0].n === "0",
    "final sync removes rows deleted at source",
  );
  check(
    (
      await rc.query("select auth_user_id from public.profiles where id=$1", [
        id(1),
      ])
    ).rows[0].auth_user_id === id(101),
    "final sync preserves migrated auth mapping",
  );
  await assert.rejects(
    rejected.exec(syncSQL(snapshot, finalSnapshot, columns)),
    /CONTENT_MISMATCH/,
  );
  assertions++;
  await rejected.exec("rollback");
  check(
    (await rc.query("select name from public.campaigns")).rows[0].name ===
      "同步后的战役",
    "stale sync abort leaves target intact",
  );
  await setSourceFrozen(sc, true);
  check(await isSourceFrozen(sc), "source freeze state recorded");
  await assert.rejects(
    sc.query("update public.campaigns set name='changed'"),
    /MIGRATION_MAINTENANCE/,
  );
  assertions++;
  await sc.query("insert into auth.users(id) values($1)", [id(100)]);
  assertions++;
  await setSourceFrozen(sc, false);
  check(!(await isSourceFrozen(sc)), "source unfreeze reversible");
  await sc.query("update public.campaigns set name='restored'");
  assertions++;
  console.log(
    `${assertions} migration assertions passed (checksums, rollback, triggers, timestamps, bigint, identity HTTP handler).`,
  );
} finally {
  await source.close();
  await target.close();
  await rejected.close();
}
