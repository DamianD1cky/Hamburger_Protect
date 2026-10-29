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
async function asUser(n, fn, anonymous = false) {
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
async function asAnon(fn) {
  await db.exec("begin");
  try {
    await db.exec("set local role anon");
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
 create table auth.users(id uuid primary key,email text,is_anonymous boolean default false,banned_until timestamptz,raw_user_meta_data jsonb default '{}');
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
  await db.exec(
    await readFile(
      new URL(
        "../../supabase/migrations/20261028010000_public_visits.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(
    await readFile(
      new URL(
        "../../supabase/migrations/20261029000000_campaign_rename.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(
    await readFile(
      new URL(
        "../../supabase/migrations/20261029010000_unified_accounts.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(
    await readFile(
      new URL(
        "../../supabase/migrations/20261029020000_anonymous_cutoff.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(
    await readFile(
      new URL(
        "../../supabase/migrations/20261029030000_campaign_roles.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );

  await db.exec(await readFile(new URL(
    "../../supabase/migrations/20261029040000_account_management.sql", import.meta.url,
  ), "utf8"));

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
      [id(n), `${n}@gm.local`, false],
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
  await denied(
    1,
    "select public.request_campaign_join($1,'自我降级','服务员')",
    [c.join_code],
    /ALREADY_CAMPAIGN_MEMBER/,
  );
  const gmAsPlayerRequest = await asUser(1, () =>
    first(
      "select * from public.request_campaign_join($1,'跨店支援','服务员')",
      [other.join_code],
    ),
  );
  await asUser(2, () =>
    db.query("select public.review_campaign_join($1,true,'')", [
      gmAsPlayerRequest.id,
    ]),
  );
  const mixedRoles = await first(
    `select
       count(*)::integer membership_count,
       count(*) filter (where role = 'gm')::integer gm_count,
       count(*) filter (where role = 'player')::integer player_count
     from public.campaign_members where user_id=$1 and active`,
    [actors[1]],
  );
  check(
    mixedRoles.membership_count === 2 &&
      mixedRoles.gm_count === 1 &&
      mixedRoles.player_count === 1,
    "approved GM can play as an employee in another active campaign",
  );
  check(
    (
      await asUser(1, () =>
        first("select public.get_campaign_board($1) board", [other.id]),
      )
    ).board !== null,
    "mixed-role account can open its employee campaign",
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
    "visitor_messages",
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
  await asUser(1, () =>
    db.query("select public.rename_campaign($1,$2)", [c.id, "新店名测试"]),
  );
  check(
    (await asUser(3, () =>
      first("select public.get_campaign_board($1) board", [c.id]),
    )).board.name === "新店名测试",
    "gm can rename the campaign for everyone",
  );
  await denied(3, "select public.rename_campaign($1,$2)", [c.id, "玩家改名"]);
  await denied(
    1,
    "select public.rename_campaign($1,$2)",
    [c.id, "   "],
    /INVALID_CAMPAIGN_NAME/,
  );
  check(
    (await asAnon(() => first("select public.list_public_campaigns() rooms")))
      .rooms.length === 0,
    "rooms are private by default",
  );
  check(
    (
      await asAnon(() =>
        first("select public.get_public_campaign_board($1) board", [c.id]),
      )
    ).board === null,
    "private board is hidden from signed-out visitors",
  );
  await denied(3, "select public.set_campaign_public($1,true)", [c.id]);
  await asUser(1, () =>
    db.query("select public.set_campaign_public($1,true)", [c.id]),
  );
  const publicRooms = (
    await asAnon(() => first("select public.list_public_campaigns() rooms"))
  ).rooms;
  check(
    publicRooms.length === 1 &&
      publicRooms[0].id === c.id &&
      !("join_code" in publicRooms[0]),
    "public discovery lists only opted-in rooms without join codes",
  );
  const publicBoard = (
    await asAnon(() =>
      first("select public.get_public_campaign_board($1) board", [c.id]),
    )
  ).board;
  check(
    publicBoard.join_code === "" &&
      publicBoard.members.length === 3 &&
      publicBoard.members.every((member) => member.profile_text === "") &&
      publicBoard.quests.length > 0 &&
      publicBoard.notes.length > 0 &&
      publicBoard.resources.length > 0 &&
      publicBoard.checklist_items.length > 0 &&
      publicBoard.events.length > 0,
    "public snapshot contains the visible board without join codes or profiles",
  );
  check(
    publicBoard.quests.every((quest) => quest.submissions.length === 0),
    "public snapshot never exposes task submission identifiers",
  );
  check(
    await asAnon(() =>
      first(
        "select private.can_read_campaign_media($1) allowed",
        [`${c.id}/background.webp`],
      ),
    ).then((row) => row.allowed),
    "public room media is readable to signed-out visitors",
  );
  const visitorMessage = await asUser(6, () =>
    first(
      "select * from public.submit_visitor_message($1,'路过顾客','装修很有危机感')",
      [c.id],
    ),
  );
  check(
    visitorMessage.display_name === "路过顾客",
    "registered visitor can leave a message",
  );
  await denied(
    6,
    "select public.submit_visitor_message($1,'路过顾客','连续留言')",
    [c.id],
    /RATE_LIMIT/,
  );
  check(
    (
      await asAnon(() =>
        first("select public.get_visitor_messages($1) messages", [c.id]),
      )
    ).messages[0].body === "装修很有危机感",
    "signed-out visitors can read public messages",
  );
  await denied(
    3,
    "select public.delete_visitor_message($1,$2)",
    [c.id, visitorMessage.id],
  );
  await asUser(1, () =>
    db.query("select public.set_campaign_public($1,false)", [c.id]),
  );
  check(
    (
      await asAnon(() =>
        first("select public.get_public_campaign_board($1) board", [c.id]),
      )
    ).board === null,
    "closing a room immediately revokes public board access",
  );
  await assert.rejects(
    asAnon(() =>
      db.query("select public.get_visitor_messages($1)", [c.id]),
    ),
    /PUBLIC_CAMPAIGN_REQUIRED/,
  );
  assertions++;
  check(
    !(await asAnon(() =>
      first(
        "select private.can_read_campaign_media($1) allowed",
        [`${c.id}/background.webp`],
      ),
    )).allowed,
    "closing a room immediately revokes public media access",
  );
  check(
    (
      await asUser(1, () =>
        first("select public.get_visitor_messages($1) messages", [c.id]),
      )
    ).messages.length === 1,
    "GM can moderate messages after closing public access",
  );
  await asUser(1, () =>
    db.query("select public.delete_visitor_message($1,$2)", [
      c.id,
      visitorMessage.id,
    ]),
  );
  check(
    (
      await first(
        "select count(*)::integer count from public.visitor_messages where campaign_id=$1",
        [c.id],
      )
    ).count === 0,
    "GM can delete visitor messages",
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
  await db.query("insert into auth.users(id,is_anonymous) values($1,true)", [
    id(92),
  ]);
  await db.query(
    "insert into public.profiles(id,account_kind,auth_user_id) values($1,'player',$2)",
    [id(93), id(92)],
  );
  await assert.rejects(
    db.query("select public.complete_identity_migration($1,$2)", [
      legacy,
      id(92),
    ]),
    /IDENTITY_ALREADY_LINKED/,
  );
  assertions++;
  // Unified accounts: a password account is a member first. It can play as
  // an employee, merely reading GM status creates no application, and the
  // same account can then apply for the GM capability.
  await db.query(
    "insert into auth.users(id,email,is_anonymous) values($1,'7@gm.local',false)",
    [id(7)],
  );
  const member7 = await asUser(
    7,
    () => first("select * from public.ensure_actor()"),
    false,
  );
  check(
    member7.account_kind === "member",
    "password account gets a member profile",
  );
  const gmStatus7 = await asUser(
    7,
    () => first("select * from public.get_gm_access()"),
    false,
  );
  check(
    !gmStatus7 || gmStatus7.user_id === null,
    "reading GM status does not create an application",
  );
  const r7 = await asUser(
    7,
    () =>
      first("select * from public.request_campaign_join($1,'账号玩家','厨师','账号资料')", [
        other.join_code,
      ]),
    false,
  );
  await asUser(2, () =>
    db.query("select public.review_campaign_join($1,true,'')", [r7.id]),
  );
  check(
    (
      await asUser(
        7,
        () => first("select public.get_campaign_board($1) board", [other.id]),
        false,
      )
    ).board.members.some((member) => member.user_id === member7.id),
    "password account can join a campaign as a player",
  );
  check(
    (
      await asUser(
        7,
        () => first("select * from public.request_gm_access()"),
        false,
      )
    ).status === "pending",
    "the same account can apply for the GM capability",
  );
  await db.query(
    "update public.gm_access set status='approved' where user_id=$1",
    [member7.id],
  );
  const memberCampaign = await asUser(
    7,
    () =>
      first(
        "select * from public.create_campaign('账号店长战役','账号店长','店长')",
      ),
    false,
  );
  check(
    (
      await asUser(
        7,
        () => first("select public.get_campaign_board($1) board", [other.id]),
        false,
      )
    ).board !== null &&
      (
        await asUser(
          7,
          () =>
            first("select public.get_campaign_board($1) board", [
              memberCampaign.id,
            ]),
          false,
        )
      ).board !== null,
    "active employee can also create and manage another campaign as GM",
  );
  const member7Roles = await first(
    "select array_agg(role order by role)::text roles from public.campaign_members where user_id=$1 and active",
    [member7.id],
  );
  check(
    member7Roles.roles === "{gm,player}",
    "campaign memberships retain both roles without changing the account",
  );

  // Account settings are self-only and independent of campaign profiles.
  await asUser(7, () => db.query("select public.update_account_profile('  新账号昵称  ')"));
  const updatedAccount = await first("select display_name,disabled from public.profiles where id=$1", [member7.id]);
  check(updatedAccount.display_name === '新账号昵称' && !updatedAccount.disabled,
    "nickname is trimmed without changing account status");
  check((await first("select display_name,status from public.gm_access where user_id=$1", [member7.id])).status === 'approved',
    "editing nickname cannot change GM approval");
  check((await first("select character_name from public.campaign_members where user_id=$1 and campaign_id=$2", [member7.id, other.id])).character_name === '账号玩家',
    "account nickname does not overwrite campaign character name");
  await denied(7, "select public.update_account_profile('   ')", [], /INVALID_DISPLAY_NAME/);
  await denied(7, "select public.update_account_profile(repeat('名',33))", [], /INVALID_DISPLAY_NAME/);
  await denied(7, "update public.profiles set disabled=false where id=$1", [actors[3]], /permission denied/);
  await assert.rejects(asAnon(() => db.query("select public.update_account_profile('冒名')")), /permission denied/);
  assertions++;
  await db.query("update auth.users set banned_until=now()+interval '1 hour' where id=$1", [id(7)]);
  await denied(7, "select public.update_account_profile('封禁绕过')", [], /IDENTITY_REQUIRED/);
  await denied(7, "select public.ensure_actor()", [], /ACCOUNT_DISABLED/);
  check((await asUser(7, () => db.query("select * from public.campaigns"))).rows.length === 0,
    "Auth ban removes business read permissions with an existing JWT");
  await db.query("update auth.users set banned_until=null where id=$1", [id(7)]);
  check((await asUser(7, () => first("select private.current_actor_id() id"))).id === member7.id,
    "unbanning restores the same account and memberships");
  // Legacy binding must not revive the retired anonymous authorization path.
  check((await asUser(91, () => first("select private.current_actor_id() id"), true)).id === null,
    "bound legacy anonymous profile still has no business identity");
  await denied(91, "select public.request_gm_access()", [], /IDENTITY_REQUIRED/);

  // Anonymous identities are retired: they cannot create a profile at all.
  await db.query("insert into auth.users(id,is_anonymous) values($1,true)", [
    id(8),
  ]);
  await assert.rejects(
    asUser(8, () => db.query("select public.ensure_actor()"), true),
    /ANONYMOUS_IDENTITY_DISABLED/,
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
  await db.exec(await readFile(new URL(
    "../../supabase/tests/account_management_smoke.sql", import.meta.url,
  ), "utf8"));
  console.log("Account management deployment smoke passed locally (rolled back).");
  console.log(
    `${assertions} database assertions passed (authorization, state transitions, archives, identity and bigint).`,
  );
} finally {
  await db.close();
}
