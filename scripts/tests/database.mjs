import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const db = new PGlite();
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
let assertions = 0;
function check(value, message) {
  assert.ok(value, message);
  assertions++;
}
const first = async (sql, args = []) => (await db.query(sql, args)).rows[0];
async function asUser(n, fn, anonymous = n > 2) {
  await db.exec("begin");
  try {
    await db.query(
      "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",
      [id(n), JSON.stringify({ sub: id(n), is_anonymous: anonymous })],
    );
    await db.exec("set local role authenticated");
    const result = await fn();
    await db.exec("commit");
    return result;
  } catch (error) {
    await db.exec("rollback");
    throw error;
  }
}
async function denied(
  n,
  sql,
  args = [],
  pattern = /permission denied|REQUIRED|NOT_|APPROVAL|LINKED/,
) {
  await assert.rejects(
    asUser(n, () => db.query(sql, args)),
    pattern,
  );
  assertions++;
}
try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth;
 create table auth.users(id uuid primary key,email text,is_anonymous boolean default false,raw_user_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]); create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text); alter table storage.objects enable row level security;
 grant usage on schema auth,storage to authenticated; grant execute on all functions in schema auth to authenticated;`);
  await db.exec(
    await readFile(
      new URL(
        "../../supabase/migrations/20261027000000_hamburger_protect.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(
    await readFile(
      new URL(
        "../../supabase/migrations/20261027010000_runtime_status.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(
    await readFile(
      new URL(
        "../../supabase/migrations/20261027020000_publication_gate.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(
    await readFile(
      new URL(
        "../../supabase/migrations/20261028000000_iteration_p0_p2.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );

  await db.exec("begin;set local role anon");
  check(
    (await first("select public.get_service_status() status")).status ===
      "maintenance",
    "signed-out users can see maintenance status",
  );
  await db.exec("rollback");
  console.log("Baseline applied to PostgreSQL (PGlite).");
  await db.exec("update private.runtime set business_writes=true");
  for (let n = 1; n <= 6; n++) {
    await db.query(
      "insert into auth.users(id,email,is_anonymous) values($1,$2,$3)",
      [id(n), `${n}@gm.local`, n > 2],
    );
    await asUser(n, () => db.query("select public.ensure_actor()"));
  }
  const actors = {};
  for (let n = 1; n <= 6; n++)
    actors[n] = (
      await first("select id from public.profiles where auth_user_id=$1", [
        id(n),
      ])
    ).id;
  await asUser(1, () => db.query("select public.request_gm_access()"));
  await db.exec("update private.runtime set business_writes=false");
  await denied(
    1,
    "select public.create_campaign('店','GM','店长')",
    [],
    /MAINTENANCE/,
  );
  await db.exec("update private.runtime set business_writes=true");
  await denied(1, "select public.create_campaign('店','GM','店长')");
  await db.query(
    "update public.gm_access set status='approved' where user_id=$1",
    [actors[1]],
  );
  await asUser(2, () => db.query("select public.request_gm_access()"));
  await db.query(
    "update public.gm_access set status='approved' where user_id=$1",
    [actors[2]],
  );
  const c = await asUser(1, () =>
    first("select * from public.create_campaign('店一','GM一','店长')"),
  );
  const other = await asUser(2, () =>
    first("select * from public.create_campaign('店二','GM二','店长')"),
  );
  // Until approved, even a player knowing the campaign ID cannot read the board.
  check(
    (
      await asUser(3, () =>
        first("select public.get_campaign_board($1) board", [c.id]),
      )
    ).board === null,
    "unapproved player cannot read board",
  );
  const req = await asUser(3, () =>
    first("select * from public.request_campaign_join($1,'厨师三','厨师')", [
      c.join_code,
    ]),
  );
  check(
    (
      await asUser(3, () =>
        first("select * from public.request_campaign_join($1,'改名','厨师')", [
          c.join_code,
        ]),
      )
    ).id === req.id,
    "repeat request is idempotent",
  );
  await denied(3, "select public.review_campaign_join($1,true,'')", [req.id]);
  await denied(2, "select public.review_campaign_join($1,true,'')", [req.id]);
  await asUser(1, () =>
    db.query("select public.review_campaign_join($1,true,'')", [req.id]),
  );
  const r4 = await asUser(4, () =>
    first("select * from public.request_campaign_join($1,'玩家四','服务员')", [
      c.join_code,
    ]),
  );
  await asUser(1, () =>
    db.query("select public.review_campaign_join($1,true,'')", [r4.id]),
  );
  const r5 = await asUser(5, () =>
    first("select * from public.request_campaign_join($1,'玩家五','服务员')", [
      other.join_code,
    ]),
  );
  await asUser(2, () =>
    db.query("select public.review_campaign_join($1,true,'')", [r5.id]),
  );
  await denied(
    3,
    "select public.request_campaign_join($1,'厨师三','厨师')",
    [other.join_code],
    /ONE_ACTIVE/,
  );
  check(
    (
      await asUser(3, () =>
        first("select public.get_campaign_board($1) board", [c.id]),
      )
    ).board.members.length === 3,
    "approved player sees roster",
  );
  check(
    (
      await asUser(5, () =>
        first("select public.get_campaign_board($1) board", [c.id]),
      )
    ).board === null,
    "other campaign cannot read board",
  );
  for (const table of [
    "profiles",
    "campaigns",
    "campaign_members",
    "quests",
    "quest_submissions",
    "notes",
    "resources",
    "checklist_items",
    "event_log",
    "campaign_archives",
    "gm_access",
    "campaign_join_requests",
    "campaign_settings",
    "checklist_categories",
  ]) {
    check(
      (
        await first(
          "select relrowsecurity from pg_class where oid=$1::regclass",
          [`public.${table}`],
        )
      ).relrowsecurity,
      `${table}: RLS enabled`,
    );
    for (const op of ["INSERT", "UPDATE", "DELETE"])
      check(
        !(
          await first("select has_table_privilege($1,$2,$3) allowed", [
            "authenticated",
            `public.${table}`,
            op,
          ])
        ).allowed,
        `${table}: no direct ${op}`,
      );
    check(
      !(
        await first("select has_table_privilege('anon',$1,'SELECT') allowed", [
          `public.${table}`,
        ])
      ).allowed,
      `${table}: anon has no read grant`,
    );
  }
  const checklist = await asUser(1, () =>
    first("select public.save_checklist_item($1,'检查') id", [c.id]),
  );
  await denied(3, "select public.save_checklist_item($1,'改写')", [c.id]);
  check(
    (
      await asUser(3, () =>
        first("select public.toggle_checklist($1,$2) done", [
          c.id,
          checklist.id,
        ]),
      )
    ).done === true,
    "player can toggle",
  );
  check(
    (
      await asUser(4, () =>
        first("select public.toggle_checklist($1,$2) done", [
          c.id,
          checklist.id,
        ]),
      )
    ).done === false,
    "atomic toggle applies to current value",
  );
  const resource = await asUser(3, () =>
    first("select public.save_resource($1,'水','2','ok',0) id", [c.id]),
  );
  await denied(5, "select public.save_resource($1,'水','99','ok',0,$2)", [
    c.id,
    resource.id,
  ]);
  const note = await asUser(3, () =>
    first("select public.save_note($1,'留言','内容','yellow') id", [c.id]),
  );
  await denied(4, "select public.move_note($1,$2,1,2)", [c.id, note.id]);
  await asUser(1, () =>
    db.query("select public.move_note($1,$2,1,2)", [c.id, note.id]),
  );
  const q = await asUser(1, () =>
    first("select * from public.create_quest($1,'任务','内容','待认领',null)", [
      c.id,
    ]),
  );
  await denied(3, "select public.create_quest($1,'任务','内容','',null)", [
    c.id,
  ]);
  await asUser(3, () => db.query("select public.claim_quest($1)", [q.id]));
  await denied(4, "select public.claim_quest($1)", [q.id]);
  await denied(4, "select public.submit_quest($1,'冒名')", [q.id]);
  const submission = await asUser(3, () =>
    first("select * from public.submit_quest($1,'私密报告')", [q.id]),
  );
  await denied(3, "select public.submit_quest($1,'重复')", [q.id]);
  check(
    (await asUser(4, () => db.query("select * from public.quest_submissions")))
      .rows.length === 0,
    "player cannot read another report",
  );
  check(
    (await asUser(3, () => db.query("select * from public.quest_submissions")))
      .rows.length === 1,
    "player reads own report",
  );
  check(
    (
      await asUser(4, () =>
        first("select public.get_campaign_board($1) board", [c.id]),
      )
    ).board.quests[0].submissions.length === 0,
    "nested board does not leak report ID",
  );
  await denied(2, "select public.review_quest_submission($1,true,'')", [
    submission.id,
  ]);
  await asUser(1, () =>
    db.query("select public.review_quest_submission($1,true,'通过')", [
      submission.id,
    ]),
  );
  const category = await asUser(1, () =>
    first("select (public.save_checklist_category($1,'开店准备')).id", [c.id]),
  );
  await asUser(1, () =>
    db.query("select public.save_checklist_item($1,'检查冷柜',null,$2)", [
      c.id,
      category.id,
    ]),
  );
  const groupedBoard = await asUser(3, () =>
    first("select public.get_campaign_board($1) board", [c.id]),
  );
  check(
    groupedBoard.board.checklist_categories[0].name === "开店准备" &&
      groupedBoard.board.checklist_items.some(
        (item) => item.category_id === category.id,
      ),
    "checklist category groups are returned with items",
  );
  await asUser(3, () =>
    db.query(
      "select public.update_member_profile($1,'厨师三改名','夜班幸存者','公开资料')",
      [c.id],
    ),
  );
  const profileBoard = await asUser(4, () =>
    first("select public.get_campaign_board($1) board", [c.id]),
  );
  check(
    profileBoard.board.members.find((member) => member.user_id === actors[3])
      .profile_text === "公开资料",
    "members can read room profile details",
  );
  const profileEvents = await asUser(4, () =>
    first("select public.get_activities($1) events", [c.id]),
  );
  check(
    !JSON.stringify(profileEvents.events).includes("公开资料"),
    "profile body is not copied into shared activity logs",
  );
  await asUser(1, () =>
    db.query("select public.set_note_pinned($1,$2,true)", [c.id, note.id]),
  );
  check(
    (
      await asUser(3, () =>
        first("select public.get_campaign_board($1) board", [c.id]),
      )
    ).board.notes.find((item) => item.id === note.id).pinned === true,
    "GM can pin a shared note",
  );
  await asUser(1, () =>
    db.query("select public.update_campaign_settings($1,$2,$3,null,null)", [
      c.id,
      { tasks: "今晚任务" },
      ["activity"],
    ]),
  );
  const configured = await asUser(3, () =>
    first("select public.get_campaign_board($1) board", [c.id]),
  );
  check(
    configured.board.settings.section_titles.tasks === "今晚任务" &&
      configured.board.settings.hidden_sections.includes("activity"),
    "room titles and hidden sections are shared",
  );
  await denied(
    1,
    "select public.update_campaign_settings($1,'{}','{}',$2,null)",
    [c.id, `${other.id}/background.webp`],
    /INVALID_CAMPAIGN_SETTINGS/,
  );
  const releaseQuest = await asUser(1, () =>
    first(
      "select * from public.create_quest($1,'待释放任务','内容','待认领',null)",
      [c.id],
    ),
  );
  await asUser(4, () =>
    db.query("select public.claim_quest($1)", [releaseQuest.id]),
  );
  await asUser(1, () =>
    db.query("select public.remove_campaign_member($1,$2,'重复身份')", [
      c.id,
      actors[4],
    ]),
  );
  check(
    (
      await first("select status,claimed_by from public.quests where id=$1", [
        releaseQuest.id,
      ])
    ).status === "open",
    "removing a player releases unsubmitted work",
  );
  check(
    (
      await asUser(4, () =>
        first("select public.get_campaign_board($1) board", [c.id]),
      )
    ).board === null,
    "removed player immediately loses active room access",
  );
  const reapplied = await asUser(4, () =>
    first(
      "select * from public.request_campaign_join($1,'玩家四','自由岗位','再次申请')",
      [c.join_code],
    ),
  );
  check(reapplied.status === "pending", "removed player can apply again");
  await db.query(
    "update public.gm_access set status='revoked' where user_id=$1",
    [actors[1]],
  );
  await denied(1, "select public.set_burger_index($1,8)", [c.id]);
  await db.query(
    "update public.gm_access set status='approved' where user_id=$1",
    [actors[1]],
  );
  await asUser(1, () => db.query("select public.archive_campaign($1)", [c.id]));
  check(
    (
      await asUser(3, () =>
        db.query("select snapshot from public.campaign_archives"),
      )
    ).rows.length === 0,
    "player cannot read full archive",
  );
  check(
    (
      await asUser(2, () =>
        db.query("select snapshot from public.campaign_archives"),
      )
    ).rows.length === 0,
    "other GM cannot read full archive",
  );
  check(
    (
      await asUser(1, () =>
        db.query("select snapshot from public.campaign_archives"),
      )
    ).rows.length === 1,
    "approved campaign GM reads archive",
  );
  const summary = (
    await asUser(3, () =>
      first("select public.get_archive_summary($1) summary", [c.id]),
    )
  ).summary;
  check(
    summary && !("snapshot" in summary),
    "player archive summary has no snapshot",
  );
  await denied(3, "select public.toggle_checklist($1,$2)", [
    c.id,
    checklist.id,
  ]);
  await denied(3, "select public.submit_quest($1,'归档后提交')", [q.id]);
  const events = (
    await asUser(3, () =>
      first("select public.get_activities($1) events", [c.id]),
    )
  ).events;
  check(
    events.every((e) => typeof e.id === "string"),
    "event IDs are strings",
  );
  check(
    !JSON.stringify(events).includes("私密报告"),
    "shared events do not leak report body",
  );
  await db.query("update public.profiles set disabled=true where id=$1", [
    actors[3],
  ]);
  check(
    (await asUser(3, () => db.query("select * from public.campaigns"))).rows
      .length === 0,
    "disabled actor loses read access with existing JWT",
  );
  await denied(4, "select public.complete_identity_migration($1,$2)", [
    actors[3],
    id(4),
  ]);
  // Server-side binding supports imported, unlinked historical identities.
  const legacy = id(90);
  await db.query(
    "insert into public.profiles(id,account_kind) values($1,'player')",
    [legacy],
  );
  const target = id(91);
  await db.query("insert into auth.users(id,is_anonymous) values($1,true)", [
    target,
  ]);
  await assert.rejects(
    db.query("select public.complete_identity_migration($1,$2)", [
      legacy,
      target,
    ]),
    /MIGRATION_CLOSED/,
  );
  assertions++;
  await db.exec(
    "update private.runtime set migration_until=now()+interval '14 days'",
  );
  check(
    (
      await first("select public.complete_identity_migration($1,$2) id", [
        legacy,
        target,
      ])
    ).id === legacy,
    "legacy ID preserved",
  );
  check(
    (
      await first("select public.complete_identity_migration($1,$2) id", [
        legacy,
        target,
      ])
    ).id === legacy,
    "binding idempotent",
  );
  await assert.rejects(
    db.query("select public.complete_identity_migration($1,$2)", [
      legacy,
      id(6),
    ]),
    /IDENTITY_ALREADY_LINKED/,
  );
  assertions++;
  // Bigint pagination deliberately exercises values beyond Number.MAX_SAFE_INTEGER.
  await db.query(
    "insert into public.event_log(id,campaign_id,event_type,entity_type,payload) overriding system value values(9007199254740993,$1,'test','campaign','{}')",
    [other.id],
  );
  const page = (
    await asUser(5, () =>
      first("select public.get_activities($1) events", [other.id]),
    )
  ).events;
  check(
    page[0].id === "9007199254740993",
    "bigint exact value preserved in JSON",
  );
  await db.query("delete from auth.users where id=$1", [target]);
  check(
    (
      await first("select auth_user_id from public.profiles where id=$1", [
        legacy,
      ])
    ).auth_user_id === null,
    "auth deletion unlinks and preserves historical business identity",
  );
  console.log(
    `${assertions} database assertions passed (authorization, state transitions, archives, identity and bigint).`,
  );
} finally {
  await db.close();
}
