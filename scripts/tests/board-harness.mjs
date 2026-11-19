import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { cloneDefaultBoard } from "../../src/features/campaign/domain/defaults.ts";
import { normalizeColor } from "../../src/features/campaign/domain/campaignSettings.ts";
import { applyPanelBlockInteraction, normalizeCustomPanel, normalizeCustomPanelBlock } from "../../src/features/campaign/domain/customPanels.ts";
import { createLiveNoteDraft, mergeLiveNoteDraft } from "../../src/features/campaign/domain/liveNoteDraft.ts";
import { compileHarnessBlueprint, lintBoardLayout } from "../../src/features/harness/linter.ts";
import { HARNESS_STARTER_RECIPES, synthesizeOfflineBlueprint } from "../../src/features/harness/recipes.ts";
import { captureBoardContext } from "../../src/features/harness/eyes.ts";
import {
  extractBlueprintFromModelJson,
  resolveHarnessCredentials,
  validateModelBaseUrl,
} from "../../supabase/functions/board-harness/gateway.ts";

test("TRPG intent routes to interactive tasks, media, macros, meters and initiative", () => {
  const board = cloneDefaultBoard();
  for (const [prompt, expected] of [
    ["做一块港口通缉令与悬赏任务板", ["task_board"]],
    ["加一个带地图图片和快捷侦查检定按钮的调查面板", ["image_media", "dice_macro"]],
    ["做一块生命理智血条与先攻顺位战斗板", ["meter_counter", "initiative_track"]],
    ["创建法术位压力格和随机遭遇表", ["meter_counter", "roll_table"]],
  ]) {
    const blueprint = synthesizeOfflineBlueprint(prompt, board);
    const blocks = blueprint.customPanels.flatMap((panel) => panel.blocks);
    for (const type of expected) assert.ok(blocks.some((block) => block.type === type), `${prompt} → ${type}`);
    if (prompt.includes("通缉")) {
      const tasks = blocks.find((block) => block.type === "task_board");
      assert.equal(tasks.variant, "wanted");
      assert.ok(tasks.items.length >= 2 && tasks.items.every((item) => item.reward));
    }
    if (prompt.includes("血条")) assert.ok(blocks.some((block) => block.type === "meter_counter" && block.variant === "bar"));
    assert.deepEqual(lintBoardLayout(compileHarnessBlueprint(board, blueprint).previewBoard), []);
  }
});

test("legacy controls preserve values and aliases normalize without dropping tasks", () => {
  for (const [type, display] of [["segmented", "segmented"], ["select", "dropdown"]]) {
    const result = normalizeCustomPanelBlock({ id: "choice", type, label: "阶段", options: ["甲", "乙"], value: "乙" });
    assert.equal(result.type, "choice_selector"); assert.equal(result.display, display); assert.equal(result.value, "乙");
  }
  const meter = normalizeCustomPanelBlock({ id: "meter", type: "stepper", label: "声望", value: -2, min: -3, max: 3, step: 1 });
  assert.equal(meter.type, "meter_counter"); assert.equal(meter.value, -2);
  const tasks = normalizeCustomPanelBlock({ id: "task", type: "task_board", items: [{ name: "找人", description: "北港", bounty: "500金币" }] });
  assert.equal(tasks.items[0].title, "找人"); assert.equal(tasks.items[0].detail, "北港"); assert.equal(tasks.items[0].reward, "500金币");
});

test("initiative rollover, weighted draws and note drafts preserve unrelated runtime data", () => {
  const panel = normalizeCustomPanel({ title: "战斗", blocks: [
    { id: "initiative", type: "initiative_track", round: 2, activeIndex: 1, entries: [{ id: "a", name: "甲", initiative: 10 }, { id: "b", name: "乙", initiative: 20 }] },
    { id: "table", type: "roll_table", entries: [{ id: "one", text: "甲", weight: 1 }, { id: "two", text: "乙", weight: 3 }] },
  ] });
  const sorted = applyPanelBlockInteraction(panel, "initiative", { type: "sort_initiative" });
  assert.equal(sorted.blocks[0].entries[sorted.blocks[0].activeIndex].id, "b", "sorting preserves the current actor");
  const next = applyPanelBlockInteraction(panel, "initiative", { type: "next_initiative" });
  assert.equal(next.blocks[0].round, 3); assert.equal(next.blocks[0].activeIndex, 0);
  assert.equal(applyPanelBlockInteraction(panel, "table", { type: "roll_table" }, () => .6).blocks[1].lastRolledId, "two");
  const board = cloneDefaultBoard();
  const note = { id: "edited", title: "旧", body: "证词", color: "yellow", pinColor: "red", x: 30, y: 50, rotation: 0,
    scale: 1, effect: null, createdAt: new Date().toISOString(), authorId: board.viewer.id, authorName: "GM", pinned: false,
    pinnedAt: null, layer: 1, imagePath: null };
  board.notes = [note, { ...note, id: "peer", title: "他人最新内容", x: 400 }];
  const draft = createLiveNoteDraft(note, board);
  draft.note = { ...note, title: "草稿", rotation: 35, scale: 1.5 }; draft.fontSize = 22;
  const preview = mergeLiveNoteDraft(board, draft);
  assert.equal(preview.notes[0].title, "草稿"); assert.equal(preview.notes[0].rotation, 35);
  assert.equal(preview.settings.styleTokens.noteFontSizes.edited, 22);
  assert.equal(preview.notes[1], board.notes[1]); assert.equal(board.notes[0].title, "旧");
});

test("Spatial Linter resolves overlapping modules, custom panels and clue note graphs", () => {
  const board = cloneDefaultBoard();
  const raw = {
    summary: "重叠纠偏验收",
    styleTokens: {
      fontPreset: "mono",
      cardStyle: "terminal",
      radiusPreset: "sharp",
      linkStyle: "neon_cyan",
      cardBackground: null,
    },
    // Deliberately place two modules at the exact same coordinates and oversized bounds
    modules: [
      { key: "tasks", visible: true, x: 100, y: 80, w: 600, h: 500 },
      { key: "inventory", visible: true, x: 100, y: 80, w: 500, h: 500 },
      { key: "safety", visible: false },
    ],
    customPanels: [
      {
        id: "test-panel",
        kind: "kv_stats",
        title: "飞船遥测",
        color: "#134e4a",
        body: "反应堆稳定",
        rows: [{ label: "氧气", value: "90%", tone: "good" }],
        x: 100,
        y: 80,
        w: 440,
        h: 280,
      },
    ],
    notes: [
      { refId: "a", title: "线索甲", body: "甲正文" },
      { refId: "b", title: "线索乙", body: "乙正文" },
    ],
    noteLinks: [{ from: "a", to: "b", label: "关联证据" }],
  };

  const compiled = compileHarnessBlueprint(board, raw);
  assert.equal(
    lintBoardLayout(compiled.previewBoard).length,
    0,
    "Spatial Linter resolves all overlaps across visible modules and custom panels",
  );
  assert.ok(
    compiled.lintNotes.length >= 2,
    "Spatial Linter records human-readable adjustment notes",
  );
  assert.equal(compiled.previewBoard.notes.length, 2);
  assert.equal(compiled.previewBoard.noteLinks.length, 1);
  assert.equal(compiled.previewBoard.noteLinks[0].label, "关联证据");
  assert.equal(compiled.previewBoard.settings.styleTokens.cardStyle, "terminal");
});

test("All starter recipes and offline synthesizer produce zero-overlap boards with atomic blocks & burnt/AI shaders", () => {
  const board = cloneDefaultBoard();
  // Initial board composes the 3 core panels (成员名册 / 事件钟 / 工作记录) from atomic capabilities!
  assert.equal(board.settings.customPanels.length, 3);
  assert.ok(board.settings.customPanels.some((p) => p.blocks.some((b) => b.type === "member_roster")));
  assert.ok(board.settings.customPanels.some((p) => p.blocks.some((b) => b.type === "event_clock")));
  assert.ok(board.settings.customPanels.some((p) => p.blocks.some((b) => b.type === "activity_feed")));
  assert.deepEqual(
    ["inventory", "tasks", "safety", "shifts", "index", "activity"].every((k) =>
      board.settings.hiddenSections.includes(k),
    ),
    true,
    "All legacy rigid containers are hidden; initial panels are 100% atomic",
  );

  for (const recipe of HARNESS_STARTER_RECIPES) {
    const compiled = compileHarnessBlueprint(board, recipe.build(board));
    assert.deepEqual(
      lintBoardLayout(compiled.previewBoard),
      [],
      `Recipe ${recipe.id} produces a collision-free layout`,
    );
  }

  const custom = compileHarnessBlueprint(
    board,
    synthesizeOfflineBlueprint(
      "拼装一块烧焦过的物资补给和委托任务控制台，带选项块和检查清单",
      board,
    ),
  );
  assert.deepEqual(lintBoardLayout(custom.previewBoard), []);
  assert.equal(custom.previewBoard.settings.customPanels.length, 4);
  const generatedPanel = custom.previewBoard.settings.customPanels.at(-1);
  assert.equal(generatedPanel.effect.shader, "burnt");
  assert.ok(generatedPanel.blocks.some((b) => b.type === "resource_list"));
  assert.ok(generatedPanel.blocks.some((b) => b.type === "task_board"));
  assert.ok(generatedPanel.blocks.some((b) => b.type === "choice_selector"));
  assert.ok(generatedPanel.blocks.some((b) => b.type === "checkbox_group"));

  // Legacy Markdown panel migrates to clean interactive blocks without raw syntax
  const migrated = normalizeCustomPanel({
    title: "旧版展板",
    body: "# 现场须知\n- **检查门锁**\n- 记录异响",
  });
  assert.ok(migrated.blocks.some((b) => b.type === "note_text" && b.heading === "现场须知"));
  assert.ok(
    migrated.blocks.some(
      (b) => b.type === "checkbox_group" && b.items[0].label === "检查门锁",
    ),
  );

  // Pure direct-manipulation state transitions across atomic blocks
  const segId = generatedPanel.blocks.find((b) => b.type === "choice_selector").id;
  const afterSeg = applyPanelBlockInteraction(generatedPanel, segId, {
    type: "set_option",
    value: "紧急撤离",
  });
  assert.equal(
    afterSeg.blocks.find((b) => b.id === segId).value,
    "紧急撤离",
  );

  const resBlock = generatedPanel.blocks.find((b) => b.type === "resource_list");
  const afterRes = applyPanelBlockInteraction(afterSeg, resBlock.id, {
    type: "step_resource_qty",
    itemId: resBlock.items[0].id,
    delta: -2,
  });
  assert.equal(
    afterRes.blocks.find((b) => b.id === resBlock.id).items[0].quantity,
    0,
  );
  assert.equal(
    afterRes.blocks.find((b) => b.id === resBlock.id).items[0].status,
    "out",
  );

  const taskBlock = generatedPanel.blocks.find((b) => b.type === "task_board");
  const afterTask = applyPanelBlockInteraction(afterRes, taskBlock.id, {
    type: "advance_task_status",
    itemId: taskBlock.items[0].id,
    actorName: "青城调查员",
  });
  assert.equal(
    afterTask.blocks.find((b) => b.id === taskBlock.id).items[0].status,
    "in_progress",
  );
  assert.equal(
    afterTask.blocks.find((b) => b.id === taskBlock.id).items[0].assignee,
    "青城调查员",
  );

  // Natural language prompt for AI-generated custom GLSL shader
  const aiShaderPrompt = compileHarnessBlueprint(
    board,
    synthesizeOfflineBlueprint("帮我给这个卡片生成一段熔金裂纹燃烧 shader", board),
  );
  assert.equal(
    aiShaderPrompt.previewBoard.settings.styleTokens.defaultCardEffect.shader,
    "ai_glsl",
  );
  assert.ok(
    (aiShaderPrompt.previewBoard.settings.styleTokens.defaultCardEffect.customGlsl?.length ?? 0) > 40,
  );

  // Natural language prompt "这个卡片是被烧焦过的"
  const genericBurntPrompt = compileHarnessBlueprint(
    board,
    synthesizeOfflineBlueprint("这个卡片是被烧焦过的", board),
  );
  assert.equal(
    genericBurntPrompt.previewBoard.settings.styleTokens.defaultCardEffect.shader,
    "burnt",
  );
  assert.equal(genericBurntPrompt.previewBoard.settings.customPanels.length, 3);

  // Unified RGB + Hex color parser
  assert.equal(normalizeColor("rgb(43, 228, 220)"), "#2be4dc");
  assert.equal(normalizeColor("234, 214, 177"), "#ead6b1");
  assert.equal(normalizeColor("#123"), "#112233");
  assert.equal(normalizeColor("#xyzxyz"), null);

  // AI prompt modifying board background shader, border shader, and hologram sticky notes
  const holoPrompt = compileHarnessBlueprint(
    board,
    synthesizeOfflineBlueprint(
      "把公告板背景和边框改成全息网格流光 shader，便签改成全息投影便签",
      board,
    ),
  );
  assert.equal(
    holoPrompt.previewBoard.settings.styleTokens.surfaceShader.shader,
    "hologram_grid",
  );
  assert.equal(
    holoPrompt.previewBoard.settings.styleTokens.frameShader.shader,
    "hologram_grid",
  );
  assert.equal(
    holoPrompt.previewBoard.settings.styleTokens.defaultNoteEffect.shader,
    "hologram",
  );
  assert.equal(holoPrompt.previewBoard.notes[0].effect.shader, "hologram");
});

test("Edge Function gateway blocks SSRF hosts and supports hybrid BYOK + managed credentials", () => {
  assert.equal(
    validateModelBaseUrl("https://openrouter.ai/api/v1/"),
    "https://openrouter.ai/api/v1",
  );
  for (const bad of [
    "http://api.openai.com/v1",
    "https://localhost:11434/v1",
    "https://127.0.0.1:8080/v1",
    "https://169.254.169.254/latest/meta-data",
    "https://10.0.0.8/v1",
    "https://192.168.1.2/v1",
    "https://172.16.0.5/v1",
    "https://[::1]/v1",
    "https://model.internal/v1",
    "https://user:pass@api.openai.com/v1",
  ]) {
    assert.throws(() => validateModelBaseUrl(bad), /HTTPS|FORBIDDEN|INVALID/);
  }

  // Managed fallback when BYOK key is empty
  const managed = resolveHarnessCredentials(null, {
    apiKey: "managed-secret",
    baseUrl: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
  });
  assert.equal(managed.apiKey, "managed-secret");
  assert.equal(managed.baseUrl, "https://api.deepseek.com/v1");

  // BYOK overrides managed
  const byok = resolveHarnessCredentials(
    {
      provider: "anthropic",
      apiKey: "sk-ant-user",
      baseUrl: "https://api.anthropic.com/v1",
      model: "claude-sonnet-4-20250514",
    },
    { apiKey: "managed-secret" },
  );
  assert.equal(byok.provider, "anthropic");
  assert.equal(byok.apiKey, "sk-ant-user");

  // Neither present throws HARNESS_KEY_REQUIRED
  assert.throws(() => resolveHarnessCredentials(null, {}), /HARNESS_KEY_REQUIRED/);

  // Tool call extraction for OpenAI & Anthropic
  assert.deepEqual(
    extractBlueprintFromModelJson("openai_compat", {
      choices: [
        {
          message: {
            tool_calls: [
              { function: { arguments: '{"summary":"OpenAI 蓝图"}' } },
            ],
          },
        },
      ],
    }),
    { summary: "OpenAI 蓝图" },
  );
  assert.deepEqual(
    extractBlueprintFromModelJson("anthropic", {
      content: [{ type: "tool_use", input: { summary: "Claude 蓝图" } }],
    }),
    { summary: "Claude 蓝图" },
  );
});

test("PostgreSQL apply_board_blueprint, module resize preservation and surgical rollback", async () => {
  const db = new PGlite();
  const gmAuth = "10000000-0000-4000-8000-000000000101";
  const playerAuth = "10000000-0000-4000-8000-000000000102";

  const asUser = async (uid, run) => {
    await db.exec("begin");
    try {
      await db.query(
        "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",
        [uid, JSON.stringify({ sub: uid, is_anonymous: false })],
      );
      await db.exec("set local role authenticated");
      const res = await run();
      await db.exec("commit");
      return res;
    } catch (err) {
      await db.exec("rollback");
      throw err;
    }
  };

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
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
      alter table storage.objects enable row level security;
      grant usage on schema auth, storage to authenticated;
      grant execute on all functions in schema auth to authenticated;
    `);

    const migrations = (await readdir("supabase/migrations"))
      .filter((name) => name.endsWith(".sql"))
      .sort();
    for (const file of migrations) {
      await db.exec(await readFile(`supabase/migrations/${file}`, "utf8"));
    }
    await db.exec("update private.runtime set business_writes=true");

    for (const uid of [gmAuth, playerAuth]) {
      await db.query("insert into auth.users(id,email) values($1,$2)", [
        uid,
        `${uid}@harness.test`,
      ]);
      await asUser(uid, () => db.query("select public.ensure_actor()"));
    }
    const gmActor = (
      await db.query("select id from public.profiles where auth_user_id=$1", [gmAuth])
    ).rows[0].id;
    const playerActor = (
      await db.query("select id from public.profiles where auth_user_id=$1", [playerAuth])
    ).rows[0].id;

    await asUser(gmAuth, () => db.query("select public.request_gm_access()"));
    await db.query("update public.gm_access set status='approved' where user_id=$1", [gmActor]);

    const campaignId = (
      await asUser(gmAuth, () =>
        db.query("select id from public.create_campaign('编排测试团','守秘人','主持人')"),
      )
    ).rows[0].id;
    await db.query(
      "insert into public.campaign_members(campaign_id,user_id,role,character_name,job_title) values($1,$2,'player','调查员甲','侦探')",
      [campaignId, playerActor],
    );

    // Player creates a personal note before AI blueprint runs
    const playerNoteId = (
      await asUser(playerAuth, () =>
        db.query("select public.save_note($1,'玩家手写笔记','重要证词','green',1600,800,0,null,null,'blue') id", [
          campaignId,
        ]),
      )
    ).rows[0].id;

    // Non-GM cannot invoke Harness RPCs
    await assert.rejects(
      asUser(playerAuth, () =>
        db.query("select public.apply_board_blueprint($1,'{}'::jsonb)", [campaignId]),
      ),
      /REQUIRED/,
    );
    await assert.rejects(
      asUser(playerAuth, () =>
        db.query("select public.resize_board_module($1,'tasks',400,50,650,500)", [campaignId]),
      ),
      /REQUIRED/,
    );

    // Resize module, apply per-module scorched inferno effect, and verify move preserves both w/h and effect
    await asUser(gmAuth, () =>
      db.query("select public.resize_board_module($1,'tasks',450,50,700,560)", [campaignId]),
    );
    await asUser(gmAuth, () =>
      db.query(
        "select public.set_board_module_effect($1,'tasks',$2::jsonb)",
        [
          campaignId,
          JSON.stringify({
            ornament: "inferno",
            placement: "around",
            edgeWear: "scorched",
            intensity: "lush",
            accentColor: null,
          }),
        ],
      ),
    );
    const movedLayout = (
      await asUser(gmAuth, () =>
        db.query("select public.move_board_module($1,'tasks',480,60) layout", [campaignId]),
      )
    ).rows[0].layout;
    assert.equal(movedLayout.tasks.x, 480);
    assert.equal(movedLayout.tasks.w, 700);
    assert.equal(movedLayout.tasks.effect.shader, "burnt");

    // Deleted shaders (overgrown/frost/holo) are rejected by PostgreSQL
    await assert.rejects(
      asUser(gmAuth, () =>
        db.query(
          "select public.set_board_module_effect($1,'shifts',$2::jsonb)",
          [campaignId, JSON.stringify({ shader: "frost", progress: 0.3 })],
        ),
      ),
      /INVALID_CARD_EFFECT/,
    );

    // Player saves a note with custom RGB/#hex colors, rotation, scale, and parchment shader, then resizes via bottom-right handle
    const rgbParchmentNoteId = (
      await asUser(playerAuth, () =>
        db.query(
          "select public.save_note($1,'羊皮线索','定制RGB与羊皮纸着色器','#ead6b1',1500,720,-18,null,null,'#8c5a2b',1.2,$2::jsonb) id",
          [
            campaignId,
            JSON.stringify({ shader: "parchment", progress: 0.36 }),
          ],
        ),
      )
    ).rows[0].id;
    const resizedNote = (
      await asUser(playerAuth, () =>
        db.query("select public.resize_note($1,$2,1.45) n", [
          campaignId,
          rgbParchmentNoteId,
        ]),
      )
    ).rows[0].n;
    assert.equal(Number(resizedNote.scale), 1.45);
    assert.equal(resizedNote.color, "#ead6b1");
    assert.equal(resizedNote.pin_color, "#8c5a2b");
    assert.equal(resizedNote.effect.shader, "parchment");

    // Capture pre-apply settings and apply an AI blueprint (Burnt Furnace Crisis + AI noteUpdates patching existing note to hologram!)
    const baseBoard = cloneDefaultBoard();
    const rawRecipe = HARNESS_STARTER_RECIPES[1].build(baseBoard);
    const compiled = compileHarnessBlueprint(baseBoard, rawRecipe);
    compiled.commitPayload.noteUpdates = [
      {
        id: rgbParchmentNoteId,
        color: "#0b2530",
        pinColor: "#2be4dc",
        effect: { shader: "hologram", progress: 0.38 },
      },
    ];
    const receipt = (
      await asUser(gmAuth, () =>
        db.query("select public.apply_board_blueprint($1,$2::jsonb) receipt", [
          campaignId,
          JSON.stringify(compiled.commitPayload),
        ]),
      )
    ).rows[0].receipt;

    assert.equal(receipt.updatedNotesBefore.length, 1);

    // GM can step the extracted atomic event_clock block directly via interact_custom_panel!
    await asUser(gmAuth, () =>
      db.query(
        "select public.interact_custom_panel($1,'furnace-core-command','fc-clock',$2::jsonb)",
        [campaignId, JSON.stringify({ type: "step_event_clock", delta: 2 })],
      ),
    );

    // Active player can directly manipulate new atomic capabilities (task_board, resource_list) in PostgreSQL!
    await asUser(playerAuth, () =>
      db.query(
        "select public.interact_custom_panel($1,'furnace-atomic-tasks','f-tasks',$2::jsonb)",
        [
          campaignId,
          JSON.stringify({
            type: "advance_task_status",
            itemId: "ft-2",
            actorName: "灰雾调查员",
          }),
        ],
      ),
    );
    const updatedPanels = (
      await asUser(playerAuth, () =>
        db.query(
          "select public.interact_custom_panel($1,'furnace-atomic-tasks','f-gear',$2::jsonb) panels",
          [
            campaignId,
            JSON.stringify({
              type: "step_resource_qty",
              itemId: "fg-1",
              delta: -1,
            }),
          ],
        ),
      )
    ).rows[0].panels;
    const coreCommandPanel = updatedPanels.find((p) => p.id === "furnace-core-command");
    assert.equal(
      coreCommandPanel.blocks.find((b) => b.id === "fc-clock").progress,
      5,
    );
    const furnacePanel = updatedPanels.find((p) => p.id === "furnace-atomic-tasks");
    const claimedTask = furnacePanel.blocks
      .find((b) => b.id === "f-tasks")
      .items.find((t) => t.id === "ft-2");
    assert.equal(claimedTask.status, "in_progress");
    assert.equal(claimedTask.assignee, "灰雾调查员");
    assert.equal(
      furnacePanel.blocks.find((b) => b.id === "f-gear").items[0].quantity,
      2,
    );

    const afterApply = (
      await asUser(gmAuth, () =>
        db.query("select public.get_campaign_board($1) board", [campaignId]),
      )
    ).rows[0].board;
    assert.equal(afterApply.settings.style_tokens.fontPreset, "serif");
    assert.equal(afterApply.settings.style_tokens.surfaceShader.shader, "ember_ash");
    assert.equal(afterApply.settings.style_tokens.frameShader.shader, "ember_ash");
    assert.equal(afterApply.settings.custom_panels.length, 3);
    assert.equal(afterApply.settings.custom_panels[0].effect.shader, "burnt");
    assert.equal(
      afterApply.notes.find((n) => n.id === rgbParchmentNoteId).effect.shader,
      "hologram",
    );
    assert.equal(afterApply.notes.length, 4, "2 player notes + 2 AI notes");

    // Surgical rollback removes AI notes/clocks/panels and restores settings while preserving player note!
    await asUser(gmAuth, () =>
      db.query("select public.rollback_board_blueprint($1,$2::jsonb)", [
        campaignId,
        JSON.stringify({
          summary: compiled.summary,
          settings: compiled.preApplySettings,
          ...receipt,
        }),
      ]),
    );

    const afterRollback = (
      await asUser(gmAuth, () =>
        db.query("select public.get_campaign_board($1) board", [campaignId]),
      )
    ).rows[0].board;
    assert.equal(afterRollback.notes.length, 2);
    assert.equal(
      afterRollback.notes.find((n) => n.id === rgbParchmentNoteId).effect.shader,
      "parchment",
      "surgical rollback restores original note shader & RGB color",
    );
    assert.equal(
      afterRollback.settings.custom_panels.length,
      3,
      "surgical rollback restores the 3 initial atomic core panels",
    );
    assert.equal(afterRollback.settings.style_tokens.fontPreset, "handwritten");
    assert.equal(
      (await db.query("select count(*)::int n from public.event_clocks where campaign_id=$1", [campaignId])).rows[0].n,
      0,
    );
    const richPanel = normalizeCustomPanel({ id: "extensions", title: "战术", x: 880, y: 50, blocks: [
      { id: "choice", type: "choice_selector", label: "阶段", options: ["甲", "乙"], value: "甲", display: "auto" },
      { id: "hp", type: "meter_counter", label: "生命", min: 0, max: 12, value: 8, step: 1, variant: "bar" },
      { id: "order", type: "initiative_track", round: 1, activeIndex: 0, entries: [{ id: "npc", name: "守卫", initiative: 10 }] },
      { id: "table", type: "roll_table", label: "传闻", entries: [{ id: "r1", text: "秘密船期", weight: 3 }], lastRolledId: null },
    ] });
    await asUser(gmAuth, () => db.query("select public.update_custom_panels($1,$2::jsonb)", [campaignId, JSON.stringify([richPanel])]));
    const interact = async (blockId, action) => (await asUser(playerAuth, () => db.query("select public.interact_custom_panel($1,'extensions',$2,$3::jsonb) panels", [campaignId, blockId, JSON.stringify(action)]))).rows[0].panels[0];
    assert.equal((await interact("choice", { type: "set_option", value: "乙" })).blocks[0].value, "乙");
    assert.equal((await interact("hp", { type: "set_value", value: 50 })).blocks[1].value, 12);
    const imported = await interact("order", { type: "import_initiative_members", entries: [{ id: "fake", name: "冒充", initiative: 99 }] });
    assert.ok(imported.blocks[2].entries.some((entry) => entry.id === playerActor));
    assert.ok(!imported.blocks[2].entries.some((entry) => entry.id === "fake"));
    assert.equal((await interact("table", { type: "roll_table" })).blocks[3].lastRolledId, "r1");

    const oldNote = (await db.query("select * from public.notes where id=$1", [playerNoteId])).rows[0];
    const fontSize = (await db.query("select coalesce((style_tokens->'noteFontSizes'->>$2)::int,15) size from public.campaign_settings where campaign_id=$1", [campaignId, playerNoteId])).rows[0].size;
    const expected = { title: oldNote.title, body: oldNote.body, color: oldNote.color, pinColor: oldNote.pin_color,
      imagePath: oldNote.image_path, rotation: Number(oldNote.rotation), scale: Number(oldNote.scale), effect: oldNote.effect, pinned: oldNote.pinned, fontSize };
    const liveInput = { title: "实时编辑保存", body: "保留原有证词", color: "#e8d3a2", pinColor: "#6b4020", imagePath: null, rotation: 15, scale: 1.4, fontSize: 22 };
    await asUser(playerAuth, () => db.query("select public.save_note_live($1,$2::jsonb,$3,$4::jsonb)", [campaignId, JSON.stringify(liveInput), playerNoteId, JSON.stringify(expected)]));
    assert.equal((await db.query("select style_tokens->'noteFontSizes'->>$2 size from public.campaign_settings where campaign_id=$1", [campaignId, playerNoteId])).rows[0].size, "22");
    await assert.rejects(asUser(playerAuth, () => db.query("select public.save_note_live($1,$2::jsonb,$3,$4::jsonb)", [campaignId, JSON.stringify({ ...liveInput, title: "过期覆盖" }), playerNoteId, JSON.stringify(expected)])), /NOTE_CONFLICT/);
    assert.equal((await db.query("select title from public.notes where id=$1", [playerNoteId])).rows[0].title, "实时编辑保存");

    const archiveEntries = [
      { id: "public-page", category: "clue", title: "公开", visibility: "public" },
      { id: "secret-page", category: "character", title: "机密身份不可泄露", body: "不可泄露的真相", visibility: "gm_only", imageUrl: `${campaignId}/note-secret.jpg` },
    ];
    await asUser(gmAuth, () => db.query("select public.update_board_style_tokens($1,$2::jsonb)", [campaignId, JSON.stringify({ archiveEntries })]));
    const gmBoard = (await asUser(gmAuth, () => db.query("select public.get_campaign_board($1) board", [campaignId]))).rows[0].board;
    const plBoard = (await asUser(playerAuth, () => db.query("select public.get_campaign_board($1) board", [campaignId]))).rows[0].board;
    assert.equal(gmBoard.settings.style_tokens.archiveEntries.length, 2);
    assert.equal(plBoard.settings.style_tokens.archiveEntries.length, 1);
    assert.ok(!JSON.stringify(plBoard).includes("不可泄露"), "player RPC never contains secret archive text");
    const directSettings = (await asUser(playerAuth, () => db.query("select style_tokens from public.campaign_settings where campaign_id=$1", [campaignId]))).rows[0].style_tokens;
    assert.equal(directSettings.archiveEntries.length, 1, "direct table and Realtime contain only public pages");
    assert.equal((await asUser(playerAuth, () => db.query("select private.can_read_archive_media($1) allowed", [`${campaignId}/note-secret.jpg`]))).rows[0].allowed, false);
    await assert.rejects(asUser(playerAuth, () => db.query("select * from private.campaign_archive_secrets")), /permission denied/);
    await asUser(gmAuth, () => db.query("select public.set_campaign_public($1,true)", [campaignId]));
    const visitorBoard = (await db.query("select public.get_public_campaign_board($1) board", [campaignId])).rows[0].board;
    assert.ok(!JSON.stringify(visitorBoard).includes("不可泄露"), "public visitors never receive secret text");
    await asUser(gmAuth, () => db.query("select public.update_board_style_tokens($1,$2::jsonb)", [campaignId, JSON.stringify({ archiveEntries: [archiveEntries[0]] })]));
    assert.equal((await db.query("select entries from private.campaign_archive_secrets where campaign_id=$1", [campaignId])).rows[0].entries.length, 0, "deleting a secret page removes its private copy");
  } finally {
    await db.close();
  }
});
