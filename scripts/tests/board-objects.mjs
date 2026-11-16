import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const authId = "10000000-0000-4000-8000-000000000001";

async function asUser(run, uid = authId) {
  await db.exec("begin");
  try {
    await db.query(
      "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",
      [uid, JSON.stringify({ sub: uid, is_anonymous: false })],
    );
    await db.exec("set local role authenticated");
    const result = await run();
    await db.exec("commit");
    return result;
  } catch (error) {
    await db.exec("rollback");
    throw error;
  }
}

try {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create table auth.users(
      id uuid primary key,
      email text,
      is_anonymous boolean default false,
      banned_until timestamptz,
      raw_user_meta_data jsonb default '{}'
    );
    create function auth.uid() returns uuid language sql stable
      as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.jwt() returns jsonb language sql stable
      as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
    create schema storage;
    create table storage.buckets(
      id text primary key,
      name text,
      public boolean,
      file_size_limit bigint,
      allowed_mime_types text[]
    );
    create table storage.objects(
      id uuid primary key default gen_random_uuid(),
      bucket_id text,
      name text
    );
    alter table storage.objects enable row level security;
    grant usage on schema auth, storage to authenticated;
    grant execute on all functions in schema auth to authenticated;
  `);

  const migrations = (await readdir("supabase/migrations"))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  for (const migration of migrations) {
    await db.exec(await readFile(`supabase/migrations/${migration}`, "utf8"));
    // Seed one historical board immediately before the clock migration so its
    // old status value can be verified after migration, without real data.
    if (migration === "20261115010000_perspective_background.sql") {
      await db.exec(`
        insert into public.profiles(id,account_kind,display_name)
          values('99000000-0000-4000-8000-000000000001','gm','历史 GM');
        insert into public.campaigns(id,name,join_code,created_by,burger_index)
          values('99000000-0000-4000-8000-000000000002','历史指数','LEGACY',
            '99000000-0000-4000-8000-000000000001',8);
      `);
    }
  }
  const migratedIndex = (await db.query(
    "select * from public.event_clocks where campaign_id='99000000-0000-4000-8000-000000000002'",
  )).rows[0];
  assert.equal(migratedIndex.progress, 8);
  assert.equal(migratedIndex.mode, "scale");
  assert.equal(migratedIndex.stages[7].label, "绿2");
  assert.equal(migratedIndex.consequence, "", "old green index never becomes an invented threat consequence");

  await db.query(
    "insert into auth.users(id,email) values($1,'board-objects@example.test')",
    [authId],
  );
  await db.exec("update private.runtime set business_writes=true");
  await asUser(() => db.query("select public.ensure_actor()"));
  const actor = (
    await db.query("select id from public.profiles where auth_user_id=$1", [authId])
  ).rows[0].id;
  await asUser(() => db.query("select public.request_gm_access()"));
  await db.query(
    "update public.gm_access set status='approved' where user_id=$1",
    [actor],
  );
  const campaign = (
    await asUser(() =>
      db.query("select id from public.create_campaign('图层测试','GM','店长')"),
    )
  ).rows[0].id;
  const createNote = (title) =>
    asUser(() =>
      db.query(
        "select public.save_note($1,$2,'正文','yellow',100,100,0,null,null) id",
        [campaign, title],
      ),
    );
  const first = (await createNote("一")).rows[0].id;
  const second = (await createNote("二")).rows[0].id;

  const appearance = {
    room: { kind: "color", color: "#263b32", imagePath: null, fit: "cover", positionX: 50, positionY: 50, dim: 0.2 },
    surface: { kind: "cork", imagePath: null },
    frame: "wood",
  };
  await asUser(() => db.query("select public.update_board_appearance($1,$2::jsonb)", [campaign, JSON.stringify(appearance)]));
  assert.deepEqual(
    (await db.query("select appearance from public.campaign_settings where campaign_id=$1", [campaign])).rows[0].appearance,
    appearance,
  );
  await asUser(() => db.query("select public.update_campaign_settings($1,'{}','{}',null,null)", [campaign]));
  assert.deepEqual(
    (await db.query("select appearance from public.campaign_settings where campaign_id=$1", [campaign])).rows[0].appearance,
    appearance,
    "legacy settings writes preserve the layered theme",
  );
  for (const invalid of [
    { ...appearance, frame: "unknown" },
    { ...appearance, room: { ...appearance.room, dim: 0.95 } },
    { ...appearance, room: { ...appearance.room, kind: "image", imagePath: "other-room/background.jpg" } },
  ]) {
    await assert.rejects(asUser(() => db.query("select public.update_board_appearance($1,$2::jsonb)", [campaign, JSON.stringify(invalid)])), /INVALID_BOARD_APPEARANCE/);
  }
  for (const [scene, animated] of [["crossing", true], ["station", false]]) {
    const perspective = { ...appearance, room: { ...appearance.room, kind: "perspective", scene, animated } };
    await asUser(() => db.query("select public.update_board_appearance($1,$2::jsonb)", [campaign, JSON.stringify(perspective)]));
    assert.deepEqual(
      (await db.query("select appearance from public.campaign_settings where campaign_id=$1", [campaign])).rows[0].appearance,
      perspective,
      "the selected perspective scene and motion preference persist without changing board objects",
    );
    for (const patch of [{ scene: "unknown" }, { animated: "yes" }, { animated: null }, { fit: "tile" }]) {
      const invalid = { ...perspective, room: { ...perspective.room, ...patch } };
      await assert.rejects(asUser(() => db.query("select public.update_board_appearance($1,$2::jsonb)",
        [campaign, JSON.stringify(invalid)])), /INVALID_BOARD_APPEARANCE/);
    }
  }
  await asUser(() => db.query("select public.update_board_appearance($1,$2::jsonb)", [campaign, JSON.stringify(appearance)]));
  await db.query("insert into auth.users(id,email) values('10000000-0000-4000-8000-000000000099','theme-outsider@example.test')");
  await assert.rejects(db.exec(`
    begin;
    select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000099',true);
    set local role authenticated;
    select public.update_board_appearance('${campaign}','${JSON.stringify(appearance)}');
    commit;
  `), /REQUIRED/);
  await db.exec("rollback");

  // Dice privacy is tested against real SQL/RLS, including receipt projection.
  const playerAuth = "20000000-0000-4000-8000-000000000001";
  const otherAuth = "20000000-0000-4000-8000-000000000002";
  const observerAuth = "20000000-0000-4000-8000-000000000003";
  const actors = [];
  for (const uid of [playerAuth, otherAuth, observerAuth]) {
    await db.query("insert into auth.users(id,email) values($1,$2)", [uid, `${uid}@dice.test`]);
    await asUser(() => db.query("select public.ensure_actor()"), uid);
    const userId = (await db.query("select id from public.profiles where auth_user_id=$1", [uid])).rows[0].id;
    actors.push(userId);
    await db.query("insert into public.campaign_members(campaign_id,user_id,role,character_name,job_title) values($1,$2,$3,$4,'玩家')",
      [campaign, userId, uid === observerAuth ? "observer" : "player", uid.slice(-4)]);
  }
  const [playerActor] = actors;
  assert.equal((await db.query("select count(*)::int n from public.event_clocks where campaign_id=$1", [campaign])).rows[0].n,
    0, "new campaigns do not inherit rule-specific clocks");
  const createClock = (uid = authId, target = campaign, progress = 1) => asUser(() => db.query(
    "select public.save_event_clock($1,'被追捕',6,$2,'追兵发现藏身处，立即进入冲突。','#b24b37') value", [target, progress],
  ), uid);
  let clock = (await createClock()).rows[0].value;
  assert.equal(clock.progress, 1); assert.equal(clock.segments, 6);
  assert.equal(clock.revision, 1);
  for (const uid of [playerAuth, observerAuth]) {
    assert.equal((await asUser(() => db.query("select public.get_event_clocks($1) value", [campaign]), uid)).rows[0].value[0].name,
      "被追捕", "members see shared progress");
    await assert.rejects(createClock(uid), /CAMPAIGN_ROLE_REQUIRED/);
    await assert.rejects(asUser(() => db.query("select public.set_event_clock_progress($1,$2,6,1)", [campaign, clock.id]), uid),
      /CAMPAIGN_ROLE_REQUIRED/);
    await assert.rejects(asUser(() => db.query("select public.delete_event_clock($1,$2,1)", [campaign, clock.id]), uid),
      /CAMPAIGN_ROLE_REQUIRED/);
  }
  const outsideAuth = "10000000-0000-4000-8000-000000000099";
  await asUser(() => db.query("select public.ensure_actor()"), outsideAuth);
  await assert.rejects(asUser(() => db.query("select public.get_event_clocks($1)", [campaign]), outsideAuth), /ACCESS_REQUIRED/);
  await asUser(() => db.query("select public.set_campaign_public($1,true)", [campaign]));
  assert.equal((await asUser(() => db.query("select public.get_event_clocks($1) value", [campaign]), outsideAuth)).rows[0].value.length, 1);
  await assert.rejects(createClock(outsideAuth), /CAMPAIGN_ROLE_REQUIRED/);
  await asUser(() => db.query("select public.set_campaign_public($1,false)", [campaign]));
  await assert.rejects(asUser(() => db.query("update public.event_clocks set progress=6 where id=$1", [clock.id]), playerAuth),
    /permission denied/);
  for (const badProgress of [-1, 7, 100]) {
    await assert.rejects(asUser(() => db.query("select public.set_event_clock_progress($1,$2,$3,1)", [campaign, clock.id, badProgress])),
      /INVALID_EVENT_CLOCK/);
  }
  clock = (await asUser(() => db.query("select public.set_event_clock_progress($1,$2,6,1) value", [campaign, clock.id]))).rows[0].value;
  assert.equal(clock.progress, 6); assert.equal(clock.revision, 2);
  assert.equal((await db.query("select count(*)::int n from public.event_log where entity_id=$1 and event_type='event_clock_completed'",
    [clock.id])).rows[0].n, 1, "filling a clock records one consequence event");
  await asUser(() => db.query("select public.set_event_clock_progress($1,$2,6,2)", [campaign, clock.id]));
  assert.equal((await db.query("select count(*)::int n from public.event_log where entity_id=$1 and event_type='event_clock_completed'",
    [clock.id])).rows[0].n, 1, "saving full progress again does not retrigger the event");
  await assert.rejects(asUser(() => db.query("select public.set_event_clock_progress($1,$2,2,1)", [campaign, clock.id])),
    /EVENT_CLOCK_CONFLICT/);
  await assert.rejects(asUser(() => db.query("select public.save_event_clock($1,'旧草稿',6,1,'旧后果','#b24b37',$2,1)",
    [campaign, clock.id])), /EVENT_CLOCK_CONFLICT/);
  clock = (await asUser(() => db.query("select public.set_event_clock_progress($1,$2,5,2) value", [campaign, clock.id]))).rows[0].value;
  assert.equal(clock.progress, 5);
  assert.equal((await db.query("select event_type from public.event_log where entity_id=$1 order by id desc limit 1",
    [clock.id])).rows[0].event_type, "event_clock_reopened");
  await assert.rejects(asUser(() => db.query("select public.save_event_clock($1,'无后果',6,0,'','#b24b37')", [campaign])),
    /INVALID_EVENT_CLOCK/);
  const secondClock = (await createClock(authId, campaign, 0)).rows[0].value;
  await asUser(() => db.query("select public.set_event_clock_progress($1,$2,3,1)", [campaign, secondClock.id]));
  assert.equal((await db.query("select progress from public.event_clocks where id=$1", [clock.id])).rows[0].progress, 5,
    "progress writes affect only their own clock");
  await assert.rejects(asUser(() => db.query("select public.delete_event_clock($1,$2,1)", [campaign, clock.id])), /EVENT_CLOCK_CONFLICT/);
  await asUser(() => db.query("select public.delete_event_clock($1,$2,3)", [campaign, clock.id]));
  assert.equal((await db.query("select count(*)::int n from public.event_clocks where id=$1", [clock.id])).rows[0].n, 0);
  assert.equal((await db.query("select count(*)::int n from public.event_clocks where id=$1", [secondClock.id])).rows[0].n, 1);
  const fullClock = (await createClock(authId, campaign, 6)).rows[0].value;
  assert.equal((await db.query("select event_type from public.event_log where entity_id=$1 order by id desc limit 1",
    [fullClock.id])).rows[0].event_type, "event_clock_completed", "a clock started full highlights and records its consequence");
  const archivedRoom = (await asUser(() => db.query("select id from public.create_campaign('归档事件测试','GM','店长')"))).rows[0].id;
  const archivedClock = (await createClock(authId, archivedRoom)).rows[0].value;
  await db.query("update public.campaigns set status='archived',archived_at=now() where id=$1", [archivedRoom]);
  assert.equal((await asUser(() => db.query("select public.get_event_clocks($1) value", [archivedRoom]))).rows[0].value[0].id,
    archivedClock.id, "archived clocks remain readable to members");
  await assert.rejects(asUser(() => db.query("select public.set_event_clock_progress($1,$2,2,1)",
    [archivedRoom, archivedClock.id])), /CAMPAIGN_NOT_ACTIVE/);
  const limitRoom = (await asUser(() => db.query("select id from public.create_campaign('事件数量测试','GM','店长')"))).rows[0].id;
  for (let i = 0; i < 24; i++) await createClock(authId, limitRoom);
  await assert.rejects(createClock(authId, limitRoom), /EVENT_CLOCK_LIMIT/);
  const diceEventsBefore = (await db.query("select count(*)::int n from public.event_log")).rows[0].n;
  const outcome = { total: 14, output: "1d20: [14] = 14", dice: [{ value: 14, sides: 20, kept: true, flags: "" }], detail: [] };
  const beginRoll = (uid, id, visibility, check = null) => asUser(() => db.query(
    "select public.begin_dice_roll($1,$2,'1d20','检定',$3,null,$4) value",
    [campaign, id, visibility, check],
  ), uid);
  const finishRoll = async (id) => {
    await db.exec("begin; set local role service_role");
    try { await db.query("select public.finish_dice_roll($1,$2::jsonb)", [id, JSON.stringify(outcome)]); await db.exec("commit"); }
    catch (error) { await db.exec("rollback"); throw error; }
  };
  const rollIds = {};
  for (const [i, visibility] of ["public", "gm", "blind", "self"].entries()) {
    const id = `30000000-0000-4000-8000-00000000000${i + 1}`;
    rollIds[visibility] = id;
    await beginRoll(playerAuth, id, visibility);
    await assert.rejects(asUser(() => db.query("select public.finish_dice_roll($1,$2::jsonb)", [id, JSON.stringify(outcome)]), playerAuth), /permission denied/);
    await finishRoll(id);
    const receipt = (await asUser(() => db.query("select public.get_dice_roll($1) value", [id]), playerAuth)).rows[0].value;
    assert.equal("result" in receipt, visibility !== "blind");
    for (const [uid, permitted] of [
      [playerAuth, visibility !== "blind"],
      [authId, visibility !== "self"],
      [otherAuth, visibility === "public"],
      [observerAuth, false],
    ]) {
      const rows = (await asUser(() => db.query("select * from public.dice_rolls where id=$1", [id]), uid)).rows;
      assert.equal(rows.length, permitted ? 1 : 0, `${visibility} RLS for ${uid}`);
    }
    const retry = (await beginRoll(playerAuth, id, visibility)).rows[0].value;
    assert.equal(retry.id, id);
    if (visibility !== "blind") assert.deepEqual(retry.result, outcome);
  }
  await assert.rejects(beginRoll(otherAuth, rollIds.public, "public"), /DICE_REQUEST_CONFLICT/);
  await assert.rejects(beginRoll(observerAuth, "30000000-0000-4000-8000-000000000010", "public"), /REQUIRED/);
  await assert.rejects(asUser(() => db.query("select public.reveal_dice_roll($1)", [rollIds.blind]), playerAuth), /DICE_ACCESS_REQUIRED/);
  await assert.rejects(asUser(() => db.query("select public.reveal_dice_roll($1)", [rollIds.self])), /DICE_ACCESS_REQUIRED/);
  await asUser(() => db.query("select public.reveal_dice_roll($1)", [rollIds.blind]));
  assert.equal((await asUser(() => db.query("select * from public.dice_rolls where id=$1", [rollIds.blind]), otherAuth)).rows.length, 1);
  await assert.rejects(asUser(() => db.query("update public.dice_rolls set result='{}' where id=$1", [rollIds.public]), playerAuth), /permission denied/);
  await assert.rejects(asUser(() => db.query("select public.save_dice_preset($1,'预设','1d20','public',true)", [campaign]), playerAuth), /CAMPAIGN_ROLE_REQUIRED/);
  await asUser(() => db.query("select public.save_dice_preset($1,'预设','1d20','public',true)", [campaign]));
  const checkId = (await asUser(() => db.query(
    "select public.create_dice_check($1,'潜行','1d20','blind',$2::uuid[]) value", [campaign, [playerActor]],
  ))).rows[0].value.id;
  await assert.rejects(asUser(() => db.query("select public.create_dice_check($1,'潜行','1d20','blind',null)", [campaign]), playerAuth), /REQUIRED/);
  const responseId = "30000000-0000-4000-8000-000000000020";
  await beginRoll(playerAuth, responseId, "blind", checkId);
  await finishRoll(responseId);
  const duplicate = (await beginRoll(playerAuth, "30000000-0000-4000-8000-000000000021", "blind", checkId)).rows[0].value;
  assert.equal(duplicate.id, responseId);
  assert.equal("result" in duplicate, false);
  const playerState = (await asUser(() => db.query("select public.get_dice_state($1) value", [campaign]), playerAuth)).rows[0].value;
  assert.equal(playerState.checks[0].responses[playerActor], true);
  assert.equal(playerState.rolls.find((r) => r.id === responseId).result, undefined);
  await assert.rejects(asUser(() => db.query("select public.begin_dice_roll($1,$2,'1d6','检定','public',null,$3)",
    [campaign, "30000000-0000-4000-8000-000000000022", checkId]), playerAuth), /RULE_MISMATCH/);
  assert.equal((await db.query("select count(*)::int n from public.event_log")).rows[0].n, diceEventsBefore, "private dice never leak through activity");
  const failedId = "30000000-0000-4000-8000-000000000030";
  await beginRoll(playerAuth, failedId, "self");
  await assert.rejects(asUser(() => db.query("select public.fail_dice_roll($1)", [failedId]), playerAuth), /permission denied/);
  await db.exec("begin; set local role service_role");
  await db.query("select public.fail_dice_roll($1)", [failedId]);
  await db.exec("commit");
  const failedReceipt = (await asUser(() => db.query("select public.get_dice_roll($1) value", [failedId]), playerAuth)).rows[0].value;
  assert.equal(failedReceipt.status, "failed");
  assert.equal(failedReceipt.result, null);
  await db.query("update public.campaign_members set active=false,left_at=now() where campaign_id=$1 and user_id=$2", [campaign, playerActor]);
  await assert.rejects(asUser(() => db.query("select public.get_dice_state($1)", [campaign]), playerAuth), /DICE_ACCESS_REQUIRED/);
  await db.query("update public.campaign_members set active=true,left_at=null where campaign_id=$1 and user_id=$2", [campaign, playerActor]);
  // Social projection never returns dice notation/results, including secret activity.
  await db.query("update public.dice_rolls set created_at=now()-interval '1 minute' where campaign_id=$1", [campaign]);
  const social = async (uid) => (await asUser(() => db.query("select public.get_dice_social($1) value", [campaign]), uid)).rows[0].value;
  const socialRollId = "30000000-0000-4000-8000-000000000040";
  await beginRoll(playerAuth, socialRollId, "self");
  assert.deepEqual((await social(authId)).rolling, [], "GM cannot infer private roll activity");
  assert.deepEqual((await social(playerAuth)).rolling, [playerActor]);
  await assert.rejects(asUser(() => db.query("select public.send_dice_reaction($1,'👏')", [campaign]), playerAuth), /DICE_STILL_ROLLING/);
  await finishRoll(socialRollId);
  await asUser(() => db.query("select public.send_dice_reaction($1,'👏')", [campaign]), otherAuth);
  const feedback = await social(authId);
  assert.deepEqual(Object.keys(feedback).sort(), ["reactions", "rolling", "rolling_until", "server_time"]);
  assert.deepEqual(feedback.rolling_until, [], "expiration metadata does not expose private dice activity");
  const ownPresence = await social(playerAuth);
  assert.equal(ownPresence.rolling_until[0].actor_id, playerActor);
  assert.ok(Date.parse(ownPresence.rolling_until[0].expires_at) > Date.parse(ownPresence.server_time));
  assert.ok(Date.parse(ownPresence.rolling_until[0].expires_at) - Date.parse(ownPresence.server_time) <= 6000);
  assert.equal(feedback.reactions[0].actor_id, actors[1], "reaction author comes from authenticated identity");
  assert.equal(feedback.reactions[0].emoji, "👏");
  assert.equal(JSON.stringify(feedback).includes("1d20"), false);
  await assert.rejects(asUser(() => db.query("select public.send_dice_reaction($1,'🔥')", [campaign]), otherAuth), /RATE_LIMIT/);
  await assert.rejects(asUser(() => db.query("select public.send_dice_reaction($1,'invalid')", [campaign]), otherAuth), /INVALID_DICE_REACTION/);
  await assert.rejects(asUser(() => db.query("select public.send_dice_reaction($1,'👏')", [campaign]), observerAuth), /REQUIRED/);
  await assert.rejects(asUser(() => db.query("select public.get_dice_social($1)", [campaign]), observerAuth), /REQUIRED/);
  await assert.rejects(asUser(() => db.query("update public.dice_reactions set actor_id=$1", [actor]), otherAuth), /permission denied/);
  await db.query("update public.dice_reactions set sent_at=now()-interval '5 seconds' where campaign_id=$1", [campaign]);
  assert.deepEqual((await social(playerAuth)).reactions, [], "old reactions expire from the room feed");
  await asUser(() => db.query("select public.send_dice_reaction($1,'🍀')", [campaign]), otherAuth);
  assert.equal((await db.query("select count(*)::int n from public.dice_reactions where campaign_id=$1", [campaign])).rows[0].n, 1,
    "reaction storage stays bounded to one row per member");
  await asUser(() => db.query("select public.reveal_dice_roll($1)", [socialRollId]), playerAuth);
  assert.deepEqual((await social(authId)).rolling, [playerActor], "revealed recent rolls can share activity");

  let notes = (
    await db.query(
      "select id,layer from public.notes where campaign_id=$1 order by layer",
      [campaign],
    )
  ).rows;
  assert.deepEqual(notes.map((note) => note.layer), [1, 2]);

  await asUser(() =>
    db.query("select public.set_note_pin_color($1,$2,'blue')", [campaign, first]),
  );
  assert.equal(
    (await db.query("select pin_color from public.notes where id=$1", [first]))
      .rows[0].pin_color,
    "blue",
  );

  await asUser(() =>
    db.query(
      "select public.save_note($1,'编辑后','新正文','green',100,100,0,$2,null,'yellow')",
      [campaign, first],
    ),
  );
  let savedNote = (
    await db.query("select title,body,color,pin_color from public.notes where id=$1", [first])
  ).rows[0];
  assert.deepEqual(savedNote, { title: "编辑后", body: "新正文", color: "green", pin_color: "yellow" });
  await assert.rejects(
    asUser(() =>
      db.query(
        "select public.save_note($1,'不得保存','错误','pink',100,100,0,$2,null,'invalid')",
        [campaign, first],
      ),
    ),
    /INVALID_PIN_COLOR/,
  );
  savedNote = (
    await db.query("select title,pin_color from public.notes where id=$1", [first])
  ).rows[0];
  assert.deepEqual(savedNote, { title: "编辑后", pin_color: "yellow" });
  await asUser(() =>
    db.query(
      "select public.save_note($1,'旧客户端编辑','正文','green',100,100,0,$2,null)",
      [campaign, first],
    ),
  );
  assert.equal(
    (await db.query("select pin_color from public.notes where id=$1", [first])).rows[0].pin_color,
    "yellow",
  );

  await asUser(() =>
    db.query("select public.move_note_layer($1,$2,1)", [campaign, first]),
  );
  notes = (
    await db.query(
      "select id,layer from public.notes where campaign_id=$1 order by layer",
      [campaign],
    )
  ).rows;
  assert.deepEqual(notes.map((note) => note.id), [second, first]);

  const sticker = (
    await asUser(() =>
      db.query(
        "select public.create_board_sticker($1,'⭐',300,400,7) value",
        [campaign],
      ),
    )
  ).rows[0].value;
  assert.equal(sticker.emoji, "⭐");
  const moved = (
    await asUser(() =>
      db.query(
        "select public.move_board_sticker($1,$2,360,450) value",
        [campaign, sticker.id],
      ),
    )
  ).rows[0].value;
  assert.equal(moved.x, 360);
  assert.equal(moved.y, 450);
  const wideMoved = (await asUser(() => db.query(
    "select public.move_board_sticker($1,$2,1900,1100) value", [campaign, sticker.id],
  ))).rows[0].value;
  assert.equal(wideMoved.x, 1900, "stickers can use the expanded board");
  const edge = (await asUser(() => db.query(
    "select public.move_board_sticker($1,$2,9999,9999) value", [campaign, sticker.id],
  ))).rows[0].value;
  assert.deepEqual([edge.x, edge.y], [2072, 1134], "the full sticker stays inside the board");
  const enlarged = (await asUser(() => db.query(
    "select public.resize_board_sticker($1,$2,2.5) value", [campaign, sticker.id],
  ), playerAuth)).rows[0].value;
  assert.deepEqual([enlarged.scale, enlarged.x, enlarged.y], [2.5, 1964, 1026], "resizing clamps the full sticker within board bounds");
  const scaledMove = (await asUser(() => db.query(
    "select public.move_board_sticker($1,$2,9999,9999) value", [campaign, sticker.id],
  ))).rows[0].value;
  assert.equal(scaledMove.scale, 2.5, "moving preserves shared scale");
  assert.deepEqual([scaledMove.x, scaledMove.y], [1964, 1026], "moving uses the scaled bounds");
  const loaded = (await asUser(() => db.query("select public.get_board_stickers($1) value", [campaign]))).rows[0].value;
  assert.equal(loaded.find((item) => item.id === sticker.id).scale, 2.5, "shared reads include sticker scale");
  for (const scale of [0, 2.51, null]) await assert.rejects(asUser(() => db.query(
    "select public.resize_board_sticker($1,$2,$3)", [campaign, sticker.id, scale],
  )), /INVALID_STICKER_SCALE/);
  await assert.rejects(asUser(() => db.query(
    "select public.resize_board_sticker($1,$2,1)", [campaign, sticker.id],
  ), observerAuth), /REQUIRED/);
  await asUser(() => db.query(
    "select public.move_note($1,$2,1800,500)", [campaign, first],
  ));
  assert.equal((await db.query("select x from public.notes where id=$1", [first])).rows[0].x, 1800);
  const wideLayout = { tasks: { x: 1550, y: 50 } };
  await asUser(() => db.query(
    "select public.update_campaign_settings($1,'{}','{}',null,null,null,null,$2::jsonb)",
    [campaign, JSON.stringify(wideLayout)],
  ));
  assert.deepEqual(
    (await db.query("select module_layout from public.campaign_settings where campaign_id=$1", [campaign])).rows[0].module_layout,
    wideLayout,
  );
  const movedActivity = (await asUser(() => db.query(
    "select public.move_board_module($1,'activity',1500,800) layout",
    [campaign],
  ))).rows[0].layout;
  assert.deepEqual(movedActivity, {
    tasks: { x: 1550, y: 50 },
    activity: { x: 1500, y: 800 },
  });
  const movedSafety = (await asUser(() => db.query(
    "select public.move_board_module($1,'safety',600,580) layout",
    [campaign],
  ))).rows[0].layout;
  assert.deepEqual(movedSafety, {
    tasks: { x: 1550, y: 50 },
    activity: { x: 1500, y: 800 },
    safety: { x: 600, y: 580 },
  }, "atomic module moves preserve positions written by other moves");
  const clockConfig = {
    mode: "countdown",
    style: "nixie",
    era: "uc",
    eraYear: 79,
    running: true,
    valueMs: 3723000,
    initialValueMs: 3723000,
    referenceAt: "2000-01-01T00:00:00.000Z",
  };
  const savedClock = (await asUser(() => db.query(
    "select public.update_campaign_clock($1,$2::jsonb) value",
    [campaign, JSON.stringify(clockConfig)],
  ))).rows[0].value;
  assert.equal(savedClock.era, "UC");
  assert.equal(savedClock.eraYear, 79);
  assert.equal(savedClock.referenceAt === clockConfig.referenceAt, false,
    "server replaces the client reference time");
  assert.deepEqual(
    (await db.query("select clock_config from public.campaign_settings where campaign_id=$1", [campaign])).rows[0].clock_config,
    savedClock,
  );
  await assert.rejects(asUser(() => db.query(
    "select public.update_campaign_clock($1,$2::jsonb)",
    [campaign, JSON.stringify({ ...clockConfig, era: "U1" })],
  )), /INVALID_CAMPAIGN_CLOCK/);
  await assert.rejects(asUser(() => db.query(
    "select public.update_campaign_clock($1,'{}'::jsonb)",
    [campaign],
  )), /INVALID_CAMPAIGN_CLOCK/);
  await assert.rejects(db.exec(`
    begin;
    select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000099',true);
    set local role authenticated;
    select public.update_campaign_clock(
      '${campaign}',
      '${JSON.stringify(clockConfig)}'::jsonb
    );
    commit;
  `), /REQUIRED/);
  await db.exec("rollback");
  await assert.rejects(asUser(() => db.query(
    "select public.move_board_module($1,'unknown',10,10)", [campaign],
  )), /INVALID_MODULE_POSITION/);
  await assert.rejects(asUser(() => db.query(
    "select public.update_campaign_settings($1,'{}','{}',null,null,null,null,$2::jsonb)",
    [campaign, JSON.stringify({ tasks: { x: 2145, y: 50 } })],
  )), /INVALID_MODULE_LAYOUT/);
  await asUser(() =>
    db.query("select public.delete_board_sticker($1,$2)", [campaign, sticker.id]),
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::integer count from public.board_stickers where campaign_id=$1",
        [campaign],
      )
    ).rows[0].count,
    0,
  );

  await db.exec(await readFile("supabase/tests/note_pins_stickers_smoke.sql", "utf8"));
  await db.exec(await readFile("supabase/tests/board_appearance_smoke.sql", "utf8"));
  await db.exec(await readFile("supabase/tests/wide_board_smoke.sql", "utf8"));

  // Two GM drafts can merge different keys, but never overwrite the same key.
  const patchSettings = async (patch, expected, uid = authId) => (await asUser(() => db.query(
    "select public.patch_campaign_settings($1,$2::jsonb,$3::jsonb) value",
    [campaign, JSON.stringify(patch), JSON.stringify(expected)],
  ), uid)).rows[0].value;
  const readSettings = async () => (await db.query(
    "select * from public.campaign_settings where campaign_id=$1", [campaign],
  )).rows[0];
  await assert.rejects(patchSettings({ sectionTitles: { inventory: "不能保存" } },
    { sectionTitles: { inventory: null } }, playerAuth), /REQUIRED/);
  await assert.rejects(patchSettings({ hiddenSections: { inventory: true } },
    { hiddenSections: { inventory: false } }, outsideAuth), /REQUIRED/);
  const secondGmAuth = "10000000-0000-4000-8000-000000000777";
  await db.query("insert into auth.users(id,email) values($1,'second-gm@example.test')", [secondGmAuth]);
  await asUser(() => db.query("select public.ensure_actor()"), secondGmAuth);
  const secondGmActor = (await db.query("select id from public.profiles where auth_user_id=$1", [secondGmAuth])).rows[0].id;
  await asUser(() => db.query("select public.request_gm_access()"), secondGmAuth);
  await db.query("update public.gm_access set status='approved' where user_id=$1", [secondGmActor]);
  await db.query("insert into public.campaign_members(campaign_id,user_id,role,character_name,job_title) values($1,$2,'gm','第二位 GM','GM')",
    [campaign, secondGmActor]);
  const initialSettings = await readSettings();
  const nameBefore = (await db.query("select name from public.campaigns where id=$1", [campaign])).rows[0].name;
  const firstExpected = initialSettings.section_titles.inventory ?? null;
  const otherExpected = initialSettings.section_titles.tasks ?? null;
  await asUser(() => db.query("select public.move_board_module($1,'tasks',1700,50)", [campaign]), secondGmAuth);
  await patchSettings({ sectionTitles: { tasks: "另一位 GM 的任务" } }, { sectionTitles: { tasks: otherExpected } }, secondGmAuth);
  assert.deepEqual(await patchSettings({ sectionTitles: { inventory: "  补给站  " } },
    { sectionTitles: { inventory: firstExpected } }), { sectionTitles: { inventory: "补给站" } });
  let settings = await readSettings();
  assert.equal(settings.section_titles.tasks, "另一位 GM 的任务");
  assert.equal(settings.section_titles.inventory, "补给站");
  assert.deepEqual(settings.module_layout.tasks, { x: 1700, y: 50 }, "title saves never carry an old layout");
  assert.deepEqual(settings.appearance, initialSettings.appearance, "title saves never carry an old appearance");
  await assert.rejects(patchSettings({ name: "失败事务不应改名", sectionTitles: { inventory: "旧草稿" } },
    { name: nameBefore, sectionTitles: { inventory: firstExpected } }), /CAMPAIGN_SETTINGS_CONFLICT/);
  assert.equal((await db.query("select name from public.campaigns where id=$1", [campaign])).rows[0].name, nameBefore);
  assert.deepEqual(await patchSettings({ sectionTitles: { inventory: "补给站" } },
    { sectionTitles: { inventory: firstExpected } }), { sectionTitles: { inventory: "补给站" } }, "retried successful saves are idempotent");
  await patchSettings({ sectionTitles: { inventory: null } }, { sectionTitles: { inventory: "补给站" } });
  assert.equal("inventory" in (await readSettings()).section_titles, false, "null restores only the requested default");
  for (const patch of [
    { moduleLayout: {} }, { backgroundPath: null }, { sectionTitles: { unknown: "未知" } },
    { sectionTitles: { inventory: "" } }, { sectionTitles: { inventory: 1 } },
    { sectionColors: { inventory: "#xyzxyz" } }, { hiddenSections: { safety: "yes" } },
    { noteTexturePath: "other-room/image.webp" }, { sectionTitles: [] },
  ]) await assert.rejects(patchSettings(patch, patch), /INVALID_CAMPAIGN_SETTINGS/);
  await assert.rejects(patchSettings({ sectionTitles: { inventory: "缺少原值" } }, { sectionTitles: {} }),
    /INVALID_CAMPAIGN_SETTINGS/);
  await patchSettings({ hiddenSections: { inventory: true } }, { hiddenSections: { inventory: initialSettings.hidden_sections.includes("inventory") } });
  await patchSettings({ hiddenSections: { tasks: true } }, { hiddenSections: { tasks: initialSettings.hidden_sections.includes("tasks") } }, secondGmAuth);
  assert.ok((await readSettings()).hidden_sections.includes("inventory") && (await readSettings()).hidden_sections.includes("tasks"));
  await patchSettings({ hiddenSections: { inventory: false } }, { hiddenSections: { inventory: true } });
  assert.ok((await readSettings()).hidden_sections.includes("tasks"), "restoring one section preserves another GM's visibility changes");
  await patchSettings({ noteTexturePath: `${campaign}/new-paper.webp` }, { noteTexturePath: initialSettings.note_texture_path });
  settings = await readSettings();
  assert.equal(settings.note_texture_path, `${campaign}/new-paper.webp`);
  assert.deepEqual(settings.module_layout.tasks, { x: 1700, y: 50 });
  const currentAppearance = settings.appearance;
  const newAppearance = { ...currentAppearance, frame: "metal" };
  await asUser(() => db.query("select public.patch_board_appearance($1,$2::jsonb,$3::jsonb)",
    [campaign, JSON.stringify(newAppearance), JSON.stringify(currentAppearance)]), secondGmAuth);
  await assert.rejects(asUser(() => db.query("select public.patch_board_appearance($1,$2::jsonb,$3::jsonb)",
    [campaign, JSON.stringify({ ...currentAppearance, frame: "none" }), JSON.stringify(currentAppearance)])),
    /CAMPAIGN_SETTINGS_CONFLICT/);
  assert.equal((await readSettings()).appearance.frame, "metal");
  await db.exec(await readFile("supabase/tests/settings_patch_smoke.sql", "utf8"));
  console.log("Settings patches: concurrent GM keys, stale drafts, idempotency, defaults, media and permissions passed.");

  console.log(
    `${migrations.length} migrations applied; board objects, clock, dice privacy and checks passed.`,
  );
} finally {
  await db.close();
}
