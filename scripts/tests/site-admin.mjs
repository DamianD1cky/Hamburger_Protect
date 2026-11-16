import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
async function asUser(uid, run, extras = {}) {
  await db.exec("begin");
  try {
    await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",
      [uid, JSON.stringify({ sub: uid, is_anonymous: false, ...extras })]);
    await db.exec("set local role authenticated");
    const result = await run();
    await db.exec("commit");
    return result;
  } catch (error) { await db.exec("rollback"); throw error; }
}
async function deny(uid, sql, params = [], message = /SITE_ADMIN_REQUIRED/) {
  await assert.rejects(asUser(uid, () => db.query(sql, params)), message); checks++;
}
try {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key,email text,is_anonymous boolean default false,
      banned_until timestamptz,raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable
      as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.jwt() returns jsonb language sql stable
      as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
    alter table storage.objects enable row level security;
    grant usage on schema auth,storage to authenticated;
    grant execute on all functions in schema auth to authenticated;
  `);
  for (const file of (await readdir("supabase/migrations")).filter((name) => name.endsWith(".sql")).sort())
    await db.exec(await readFile(`supabase/migrations/${file}`, "utf8"));
  await db.exec("update private.runtime set business_writes=true");
  const identities = [];
  for (const [i, username] of ["owner", "gm", "qingcheng", "blocked"].entries()) {
    const auth = `10000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`;
    await db.query("insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3::jsonb)",
      [auth, `${username}@gm.local`, JSON.stringify({ displayName: username, site_admin: true })]);
    const actor = (await asUser(auth, () => db.query("select id from public.ensure_actor()"))).rows[0].id;
    identities.push({ auth, actor });
    await asUser(auth, () => db.query("select public.request_gm_access()"));
  }
  const [owner, gm, applicant, blocked] = identities;
  check((await db.query("select count(*)::int as n from private.site_admins")).rows[0].n === 0,
    "no user is automatically promoted, including the first signup and an owner username");
  for (const identity of identities)
    check((await asUser(identity.auth, () => db.query("select public.get_site_admin_access() as ok"))).rows[0].ok === false,
      "user metadata cannot establish site authority");
  await db.query("update public.gm_access set status='approved' where user_id=$1", [gm.actor]);
  await deny(gm.auth, "select public.list_gm_applications()");
  await deny(applicant.auth, "select public.review_gm_application($1,true,'',now())", [applicant.actor]);
  await deny(owner.auth, "insert into private.site_admins(user_id) values($1)", [owner.actor], /permission denied/);
  await deny(gm.auth, "select * from private.gm_access_reviews", [], /permission denied/);
  await deny(gm.auth, "update public.gm_access set status='approved' where user_id=$1", [applicant.actor], /permission denied/);
  await db.query("insert into private.site_admins(user_id) values($1)", [owner.actor]);
  check((await asUser(owner.auth, () => db.query("select public.get_site_admin_access() as ok"))).rows[0].ok,
    "only an explicit private grant enables the site administrator");
  const first = (await asUser(owner.auth, () => db.query("select public.list_gm_applications() as page"))).rows[0].page;
  check(first.applications.length === 3 && first.has_more === false, "inbox lists pending applications only");
  const target = first.applications.find((item) => item.user_id === applicant.actor);
  check(target.account_name === "qingcheng@gm.local", "approval uses the stable actor rather than a nickname");
  await deny(owner.auth, "select public.review_gm_application($1,true,'',now())", [applicant.actor], /GM_APPLICATION_ALREADY_REVIEWED/);
  await deny(owner.auth, "select public.review_gm_application($1,true,$2,$3)", [applicant.actor, "x".repeat(501), target.requested_at], /INVALID_GM_REVIEW/);
  await deny(owner.auth, "select public.review_gm_application($1,null,'',$2)", [applicant.actor, target.requested_at], /INVALID_GM_REVIEW/);
  await asUser(owner.auth, () => db.query("select public.review_gm_application($1,true,' 已核实 ',$2)",
    [applicant.actor, target.requested_at]));
  const approved = (await asUser(applicant.auth, () => db.query("select * from public.get_gm_access()"))).rows[0];
  check(approved.status === "approved" && approved.review_note === "已核实" && approved.reviewed_at,
    "the applicant sees the reviewed capability and timestamp");
  const audit = (await db.query("select * from private.gm_access_reviews where user_id=$1", [applicant.actor])).rows[0];
  check(audit.reviewer_id === owner.actor && audit.previous_status === "pending" && audit.status === "approved",
    "the review log records the real reviewer and status transition");
  const room = await asUser(applicant.auth, () => db.query("select id from public.create_campaign('新 GM','青城','店长')"));
  check(!!room.rows[0].id, "approved applicants can create campaigns");
  await deny(owner.auth, "select public.review_gm_application($1,false,'第二次',$2)",
    [applicant.actor, target.requested_at], /GM_APPLICATION_ALREADY_REVIEWED/);
  check((await db.query("select count(*)::int as n from private.gm_access_reviews")).rows[0].n === 1,
    "a stale or repeated review cannot overwrite the decision or append a second log");
  const history = (await asUser(owner.auth, () => db.query("select public.list_gm_applications('reviewed') as page"))).rows[0].page;
  check(history.applications.find((item) => item.user_id === applicant.actor).reviewer_name === "owner",
    "reviewed applications include the reviewer for the administrator");
  await db.query("update public.profiles set disabled=true where id=$1", [blocked.actor]);
  const blockedRequest = (await db.query("select requested_at from public.gm_access where user_id=$1", [blocked.actor])).rows[0];
  await deny(owner.auth, "select public.review_gm_application($1,true,'',$2)",
    [blocked.actor, blockedRequest.requested_at], /GM_APPLICANT_UNAVAILABLE/);
  await asUser(owner.auth, () => db.query("select public.review_gm_application($1,false,'停用账号',$2)",
    [blocked.actor, blockedRequest.requested_at]));
  check((await db.query("select status from public.gm_access where user_id=$1", [blocked.actor])).rows[0].status === "rejected",
    "an unavailable account can be rejected but not granted GM power");
  await db.exec("update private.runtime set business_writes=false");
  const ownerRequest = first.applications.find((item) => item.user_id === owner.actor);
  await deny(owner.auth, "select public.review_gm_application($1,true,'',$2)",
    [owner.actor, ownerRequest.requested_at], /MAINTENANCE/);
  await db.exec("update private.runtime set business_writes=true");
  await db.query("update private.site_admins set active=false where user_id=$1", [owner.actor]);
  await deny(owner.auth, "select public.list_gm_applications()");
  await deny(owner.auth, "select public.review_gm_application($1,true,'',$2)", [owner.actor, ownerRequest.requested_at]);
  await db.query("update private.site_admins set active=true where user_id=$1", [owner.actor]);
  await db.query("update auth.users set banned_until=now()+interval '1 day' where id=$1", [owner.auth]);
  check(!(await asUser(owner.auth, () => db.query("select public.get_site_admin_access() as ok"))).rows[0].ok,
    "a valid JWT cannot bypass an Auth ban");
  await deny(owner.auth, "select public.list_gm_applications()");
  await db.query("update auth.users set banned_until=null where id=$1", [owner.auth]);
  await deny(owner.auth, "select public.list_gm_applications(null)", [], /INVALID_GM_REVIEW_QUERY/);
  await deny(owner.auth, "select public.list_gm_applications('pending',now(),null)", [], /INVALID_GM_REVIEW_QUERY/);
  await db.exec(`insert into auth.users(id,email)
    select md5('page-auth-'||n)::uuid,'page-'||n||'@gm.local' from generate_series(1,35) n;
    insert into public.profiles(id,auth_user_id,account_kind,display_name)
    select md5('page-profile-'||n)::uuid,md5('page-auth-'||n)::uuid,'member','page-'||n from generate_series(1,35) n;
    insert into public.gm_access(user_id,account_name,display_name,requested_at)
    select id,'page@gm.local',display_name,'2026-11-16T12:00:00Z' from public.profiles where display_name like 'page-%';`);
  const pageOne = (await asUser(owner.auth, () => db.query("select public.list_gm_applications() as page"))).rows[0].page;
  const cursor = pageOne.applications.at(-1);
  const pageTwo = (await asUser(owner.auth, () => db.query("select public.list_gm_applications('pending',$1,$2) as page",
    [cursor.requested_at, cursor.user_id]))).rows[0].page;
  check(pageOne.applications.length === 30 && pageOne.has_more && !pageTwo.has_more,
    "bounded cursor pagination handles more than thirty applications");
  const all = [...pageOne.applications, ...pageTwo.applications].map((item) => item.user_id);
  check(new Set(all).size === all.length && all.length === 36,
    "matching timestamps do not duplicate or skip applications");
  await db.exec("begin; set local role anon");
  await assert.rejects(db.query("select public.get_site_admin_access()"), /permission denied/); checks++;
  await db.exec("rollback");
  console.log(`${checks} site administrator database assertions passed (authority, approval, audit, stale decisions, bans, pagination).`);
} finally { await db.close(); }
