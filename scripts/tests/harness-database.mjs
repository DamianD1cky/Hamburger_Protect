import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const db = new PGlite();
const users = Array.from({ length: 4 }, () => randomUUID());
const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
async function asUser(user, action) {
  await db.exec("begin");
  try {
    await db.query("select set_config('request.jwt.claim.sub',$1,true), set_config('request.jwt.claims',$2,true)",
      [user, JSON.stringify({ sub: user, is_anonymous: false })]);
    await db.exec("set local role authenticated");
    const result = await action();
    await db.exec("commit");
    return result;
  } catch (error) { await db.exec("rollback"); throw error; }
}
let assertions = 0;
function check(value) { assert.ok(value); assertions++; }
async function denied(fn, pattern = /REQUIRED|HARNESS|permission denied|COMMAND_ID/) {
  await assert.rejects(fn, pattern); assertions++;
}
try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key,email text,is_anonymous boolean default false,banned_until timestamptz,raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
    create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
    alter table storage.objects enable row level security;
    grant usage on schema auth,storage to authenticated; grant execute on all functions in schema auth to authenticated;`);
  const migrations = new URL("../../supabase/migrations/", import.meta.url);
  for (const file of (await readdir(migrations)).filter(f => f.endsWith(".sql")).sort())
    await db.exec(await readFile(new URL(file, migrations), "utf8"));
  await db.exec("update private.runtime set business_writes=true");
  const actors = [];
  for (const user of users) {
    await db.query("insert into auth.users(id,email) values($1,$2)", [user, `${user}@test.local`]);
    actors.push((await asUser(user, () => one("select * from public.ensure_actor()"))).id);
  }
  await asUser(users[0], () => db.query("select public.request_gm_access()"));
  await db.query("update public.gm_access set status='approved' where user_id=$1", [actors[0]]);
  const room = await asUser(users[0], () => one("select * from public.create_campaign('测试工作台','主持人','店长')"));
  const join = await asUser(users[1], () => one("select * from public.request_campaign_join($1,'调查员','服务员')", [room.join_code]));
  await asUser(users[0], () => db.query("select public.review_campaign_join($1,true,'')", [join.id]));
  await db.query("insert into public.campaign_members(campaign_id,user_id,role,character_name,job_title) values($1,$2,'observer','旁观者','旁观者')", [room.id, actors[2]]);
  const read = user => asUser(user, async () => (await one("select public.get_harness_board($1) board", [room.id])).board);
  const commit = (user, revision, ops, commandId = randomUUID()) => asUser(user, async () =>
    (await one("select public.apply_harness_command($1,$2,$3,$4) board", [room.id, commandId, revision, JSON.stringify(ops)])).board);
  const block = (kind, visibility = "members", editable = "gm") => ({
    id: randomUUID(), kind, title: kind, visibility, editable, max: 10, value: 5, text: kind === "note" ? "私密真相" : "",
  });
  const resource = block("counter", "members", "players");
  const secret = block("note", "gm");
  const clock = block("clock");
  let state = await commit(users[0], 0, [resource, secret, clock].map(b => ({ type: "create", block: b })));
  check(state.blocks.length === 3);
  check((await read(users[1])).blocks.length === 2);
  check(!(JSON.stringify(await read(users[1]))).includes("私密真相"));
  check((await read(users[2])).blocks.length === 2);
  await denied(() => read(users[3]));
  await denied(() => asUser(users[1], () => db.query("select * from private.harness_boards")));
  await denied(() => asUser(users[1], () => db.query("select * from private.harness_commands")));
  await denied(() => commit(users[1], 1, [{ type: "create", block: block("clock") }]));
  await denied(() => commit(users[1], 1, [{ type: "write", id: secret.id, text: "越权" }]));
  await denied(() => commit(users[1], 1, [{ type: "adjust", id: clock.id, delta: 1 }]));
  await denied(() => commit(users[2], 1, [{ type: "adjust", id: resource.id, delta: 1 }]));
  const change = [{ type: "adjust", id: resource.id, delta: -1 }];
  const commandId = randomUUID();
  state = await commit(users[1], 1, change, commandId);
  check(state.blocks[0].value === 4 && state.revision === 2);
  check((await commit(users[1], 1, change, commandId)).blocks[0].value === 4);
  await denied(() => commit(users[0], 1, change, commandId));
  await denied(() => commit(users[1], 1, [{ ...change[0], delta: 2 }], commandId));
  await denied(() => commit(users[0], 1, change), /HARNESS_CONFLICT/);
  check((await read(users[0])).blocks[0].value === 4);
  // Whole batch rolls back if its second operation fails.
  await denied(() => commit(users[0], 2, [change[0], { type: "adjust", id: resource.id, delta: -100 }]));
  check((await read(users[0])).blocks[0].value === 4);
  state = await commit(users[0], 2, [{ type: "configure", id: resource.id, title: "氧气", max: 20, visibility: "members", editable: "players" }]);
  check(state.blocks[0].value === 4 && state.blocks[0].max === 20);
  for (const invalid of [
    { ...block("note"), title: null },
    { ...block("counter"), value: 0.5 },
    { ...block("clock"), max: 0 },
    { ...block("note"), visibility: "public" },
    { ...block("note"), script: "alert(1)" },
  ]) await denied(() => commit(users[0], 3, [{ type: "create", block: invalid }]));
  await denied(() => commit(users[0], 3, [{ type: "configure", id: resource.id, title: "氧气", max: 3, visibility: "members", editable: "players" }]));
  for (let i = 0; i < 6; i++) check((await asUser(users[1], () => one("select public.reserve_harness_agent_request($1) role", [room.id]))).role === "player");
  await denied(() => asUser(users[1], () => db.query("select public.reserve_harness_agent_request($1)", [room.id])), /RATE_LIMIT/);
  await denied(() => asUser(users[2], () => db.query("select public.reserve_harness_agent_request($1)", [room.id])));
  await db.query("update public.campaign_members set active=false where campaign_id=$1 and user_id=$2", [room.id, actors[1]]);
  await denied(() => read(users[1]));
  await denied(() => commit(users[1], 1, change, commandId)); // Replays also recheck membership.
  await db.exec("begin; set local role anon");
  await assert.rejects(db.query("select public.get_harness_board($1)", [room.id]), /permission denied/);
  await db.exec("rollback"); assertions++;
  await db.query("update public.campaigns set status='archived' where id=$1", [room.id]);
  await denied(() => commit(users[0], 3, change), /CAMPAIGN_NOT_ACTIVE/);
  console.log(`Harness PostgreSQL: ${assertions} assertions passed; all migrations applied.`);
} catch (error) {
  console.error(error.message, error.where ?? "", error.query ?? "");
  process.exitCode = 1;
} finally { await db.close(); }
