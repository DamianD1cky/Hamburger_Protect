import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const authId = "10000000-0000-4000-8000-000000000001";

async function asUser(run) {
  await db.exec("begin");
  try {
    await db.query(
      "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",
      [authId, JSON.stringify({ sub: authId, is_anonymous: false })],
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
  }

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
  await db.query("insert into auth.users(id,email) values('10000000-0000-4000-8000-000000000099','theme-outsider@example.test')");
  await assert.rejects(db.exec(`
    begin;
    select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000099',true);
    set local role authenticated;
    select public.update_board_appearance('${campaign}','${JSON.stringify(appearance)}');
    commit;
  `), /REQUIRED/);
  await db.exec("rollback");

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

  console.log(
    `${migrations.length} migrations applied; board objects and shared clock passed.`,
  );
} finally {
  await db.close();
}
