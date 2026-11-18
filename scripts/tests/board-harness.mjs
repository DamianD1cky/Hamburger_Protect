import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { cloneDefaultBoard } from "../../src/features/campaign/domain/defaults.ts";
import { normalizeColor } from "../../src/features/campaign/domain/campaignSettings.ts";
import { applyPanelBlockInteraction, normalizeCustomPanel } from "../../src/features/campaign/domain/customPanels.ts";
import { compileHarnessBlueprint, lintBoardLayout } from "../../src/features/harness/linter.ts";
import { HARNESS_STARTER_RECIPES, synthesizeOfflineBlueprint } from "../../src/features/harness/recipes.ts";
import { captureBoardContext } from "../../src/features/harness/eyes.ts";
import {
  extractBlueprintFromModelJson,
  resolveHarnessCredentials,
  validateModelBaseUrl,
} from "../../supabase/functions/board-harness/gateway.ts";

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
  // Initial board retains ONLY shifts (成员名册), index (事件钟), activity (行动记录)
  assert.deepEqual(
    ["inventory", "tasks", "safety"].every((k) =>
      board.settings.hiddenSections.includes(k),
    ),
    true,
    "Only shifts, index, and activity are visible on initial board",
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
  assert.ok(custom.previewBoard.settings.customPanels.length >= 1);
  const generatedPanel = custom.previewBoard.settings.customPanels[0];
  assert.equal(generatedPanel.effect.shader, "burnt");
  assert.ok(generatedPanel.blocks.some((b) => b.type === "resource_list"));
  assert.ok(generatedPanel.blocks.some((b) => b.type === "task_board"));
  assert.ok(generatedPanel.blocks.some((b) => b.type === "segmented"));
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
  const segId = generatedPanel.blocks.find((b) => b.type === "segmented").id;
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
  assert.equal(genericBurntPrompt.previewBoard.settings.customPanels.length, 0);

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

    assert.equal(receipt.createdClockIds.length, 1);
    assert.equal(receipt.updatedNotesBefore.length, 1);

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
    assert.equal(afterApply.settings.custom_panels.length, 1);
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
    assert.equal(afterRollback.settings.custom_panels.length, 0);
    assert.equal(afterRollback.settings.style_tokens.fontPreset, "handwritten");
    assert.equal(
      (await db.query("select count(*)::int n from public.event_clocks where campaign_id=$1", [campaignId])).rows[0].n,
      0,
    );
  } finally {
    await db.close();
  }
});
