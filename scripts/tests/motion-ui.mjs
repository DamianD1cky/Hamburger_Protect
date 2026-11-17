// Real Chromium UI regression with isolated Auth/RPC fixtures; no production writes.
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { loadEnv } from "vite";
import { mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const env = loadEnv("supabase", process.cwd(), "VITE_");
const origin = new URL(env.VITE_SUPABASE_URL).origin;
const authKey = `sb-${new URL(origin).hostname.split(".")[0]}-auth-token`;
const preview = process.env.HP_PREVIEW_URL || "http://127.0.0.1:5174";
const authId = "10000000-0000-4000-8000-000000000010";
const actorId = "20000000-0000-4000-8000-000000000010";
const peerId = "20000000-0000-4000-8000-000000000011";
const campaignId = "30000000-0000-4000-8000-000000000010";
const deniedId = "30000000-0000-4000-8000-000000000011";
const noteId = "40000000-0000-4000-8000-000000000010";
const linkedNoteId = "40000000-0000-4000-8000-000000000011";
const newLinkedNoteId = "40000000-0000-4000-8000-000000000012";
const noteLinkId = "50000000-0000-4000-8000-000000000010";
const newNoteLinkId = "50000000-0000-4000-8000-000000000011";
const name = "动效验收战役";
const date = new Date().toISOString();
const user = {
  id: authId, aud: "authenticated", role: "authenticated",
  email: "motion_test@gm.local", is_anonymous: false,
  user_metadata: {}, app_metadata: { provider: "email", providers: ["email"] },
  created_at: date,
};
const exp = Math.floor(Date.now() / 1000) + 3600;
const claims = Buffer.from(JSON.stringify({ sub: authId, role: "authenticated", exp })).toString("base64url");
const session = {
  access_token: `e30.${claims}.test`, refresh_token: "motion-test-refresh",
  token_type: "bearer", expires_in: 3600, expires_at: exp, user,
};
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const screenshots = join(tmpdir(), "hp-motion-regression");
await mkdir(screenshots, { recursive: true });
const backgroundImage = await readFile(
  new URL("../../assets/felt.webp", import.meta.url),
);
let checks = 0;
let releaseHeldResponse = () => {};
const check = (condition, message) => { assert.ok(condition, message); checks++; };
try {
  for (const scenario of [
    { label: "desktop", width: 1440, height: 900, reduced: false, unsupported: false },
    { label: "mobile", width: 390, height: 844, reduced: false, unsupported: false },
    { label: "reduced", width: 1440, height: 900, reduced: true, unsupported: false },
    { label: "fallback", width: 1440, height: 900, reduced: false, unsupported: true },
  ].filter((scenario) => !process.env.HP_MOTION_SCENARIOS || process.env.HP_MOTION_SCENARIOS.split(",").includes(scenario.label))) {
    console.log(`Checking ${scenario.label} UI`);
    const context = await browser.newContext({
      viewport: { width: scenario.width, height: scenario.height },
      reducedMotion: scenario.reduced ? "reduce" : "no-preference",
      hasTouch: scenario.width <= 1024,
    });
    await context.addInitScript(({ authKey, session, unsupported }) => {
      localStorage.setItem(authKey, JSON.stringify(session));
      window.motionLog = [];
      window.transitionLog = [];
      const animate = Element.prototype.animate;
      Element.prototype.animate = function (frames, options) {
        window.motionLog.push({ classes: this.className, frames, duration: options?.duration });
        return animate.call(this, frames, options);
      };
      if (unsupported) document.startViewTransition = undefined;
      else if (document.startViewTransition) {
        const start = document.startViewTransition.bind(document);
        document.startViewTransition = (callback) => {
          const transition = start(callback);
          const log = { direction: document.documentElement.dataset.campaignTransition, ready: false };
          window.transitionLog.push(log);
          void transition.ready.then(() => { log.ready = true; }, () => {});
          return transition;
        };
      }
    }, { authKey, session, unsupported: scenario.unsupported });
    const page = await context.newPage();
    page.setDefaultTimeout(8000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    let releaseBoard;
    let boardGate = new Promise((resolve) => { releaseBoard = resolve; });
    let boardRequests = 0;
    let diceResponseGate = null;
    let rejectMove = false;
    let delayedMoveId = null;
    let releaseDelayedMove;
    let delayedMoveGate = null;
    let releaseCreateLink;
    let createLinkGate = null;
    let deleteLinkRequests = 0;
    let boardStickers = [];
    let rejectSticker = false;
    let rejectStickerResize = false;
    let appearanceWrites = 0;
    let clockWrites = 0;
    let rejectEventClock = false;
    let eventClockGate = null;
    let eventClocks = [{
      id: campaignId, name: "汉堡屋指数", segments: 9, progress: 5, consequence: "", color: "#406b50", mode: "scale", revision: 1,
      stages: Array.from({ length: 9 }, (_, i) => ({
        label: `${i < 3 ? "红" : i < 6 ? "黄" : "绿"}${i % 3 + 1}`,
        color: i < 3 ? "#ab3326" : i < 6 ? "#e7a723" : "#406b50",
        description: i < 3 ? "餐厅关闭 · 全员生存力 +1" : i < 6 ? "有限服务 · 全员无额外加值" : "正常服务 · 全员智力 +1",
      })),
    }];
    const diceState = { rolls: [], presets: [], checks: [], hasMore: false };
    const dicePosts = [];
    let forcedD6Value = null;
    const socialState = { rolling: [peerId], reactions: [] };
    const reactionPosts = [];
    let rejectDiceOnce = false;
    let redactBlindReceipt = false;
    let imageUploads = 0;
    let rejectAppearance = false;
    let rejectModuleSettings = false;
    const settingsPosts = [];
    const reads = {};
    let delayNextModuleMove = false;
    let delayedModuleMoveGate = null;
    let releaseDelayedModuleMove;
    let noteLinks = [
      {
        id: noteLinkId,
        from_note_id: noteId,
        to_note_id: linkedNoteId,
        label: "同伴",
      },
    ];
    let board = {
      id: campaignId, name, join_code: "TEST00", status: "active", burger_index: 5,
      members: [
        { user_id: actorId, role: "gm", character_name: "验收店长", job_title: "店长", profile_text: "", active: true, joined_at: date, left_at: null },
        { user_id: peerId, role: "player", character_name: "验收玩家", job_title: "员工", profile_text: "", active: true, joined_at: date, left_at: null },
      ],
      resources: [], checklist_categories: [], checklist_items: [],
      quests: [{ id: "test-quest", title: "验收任务", body: "提交后等待审核", assignee_label: "服务员", due_at: null, status: "pending_review", created_by: actorId, claimed_by: actorId, submissions: [{ id: "test-submission" }] }],
      notes: [
        { id: noteId, title: "验收便签", body: "直接跟手，失败回位", color: "yellow", x: 1100, y: 650, rotation: -2, created_at: date, author_id: actorId, pinned: true, pinned_at: date, layer: 1, pin_color: "red" },
        { id: linkedNoteId, title: "连线目标", body: "验证端点同步", color: "blue", x: 820, y: 480, rotation: 1, created_at: date, author_id: actorId, pinned: false, pinned_at: null, layer: 2, pin_color: "green" },
        { id: newLinkedNoteId, title: "即时连线目标", body: "请求未完成也立即显示", color: "pink", x: 520, y: 820, rotation: -1, created_at: date, author_id: actorId, pinned: false, pinned_at: null, layer: 3, pin_color: "yellow" },
      ],
      settings: {
        section_titles: {},
        hidden_sections: [],
        is_public: true,
        background_path: "fixtures/custom-background.webp",
        note_texture_path: null,
        clock_config: {
          mode: "clock",
          style: "digital",
          era: "AD",
          eraYear: 2026,
          running: true,
          valueMs: new Date(date).getTime(),
          initialValueMs: new Date(date).getTime(),
          referenceAt: date,
        },
      },
      events: [],
    };
    const channels = new Map();
    await context.routeWebSocket(/\/realtime\/v1\/websocket/, (socket) => {
      socket.onMessage((raw) => {
        if (typeof raw !== "string") return;
        const [join, ref, topic, event, payload] = JSON.parse(raw);
        if (event === "phx_join") {
          const filters = (payload.config?.postgres_changes ?? []).map((filter, i) => ({ ...filter, id: i + 1 }));
          channels.set(topic, { socket, join, filters });
          socket.send(JSON.stringify([join, ref, topic, "phx_reply", { status: "ok", response: { postgres_changes: filters } }]));
          socket.send(JSON.stringify([join, null, topic, "system", { extension: "postgres_changes", status: "ok" }]));
        } else if (event === "heartbeat" || event === "phx_leave") {
          if (event === "phx_leave") channels.delete(topic);
          socket.send(JSON.stringify([join, ref, topic, "phx_reply", { status: "ok", response: {} }]));
        }
      });
    });
    const socialChannel = () => [...channels.entries()].find(([topic]) => topic.includes("dice-social:"));
    const notifyReaction = (reaction) => {
      const channel = socialChannel();
      assert.ok(channel, "the social Realtime channel joined");
      const [topic, { socket, join, filters }] = channel;
      socket.send(JSON.stringify([join, null, topic, "postgres_changes", {
        ids: filters.filter((filter) => filter.table === "dice_reactions").map((filter) => filter.id),
        data: { schema: "public", table: "dice_reactions", type: "UPDATE", record: reaction,
          old_record: {}, columns: [], commit_timestamp: new Date().toISOString(), errors: null },
      }]));
    };
    await context.route(`${origin}/**`, async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (request.method() === "GET" || path.endsWith("/get_dice_social") || path.endsWith("/get_campaign_board") ||
        path.endsWith("/get_gm_access") || path.endsWith("/list_public_campaigns"))
        reads[path] = (reads[path] ?? 0) + 1;
      const body = request.headers()["content-type"]?.includes("application/json") ? request.postDataJSON() : null;
      let result = [];
      let status = 200;
      if (path.includes("/storage/v1/object/campaign-media/") && request.method() === "POST") {
        imageUploads++;
        result = { Key: path.split("/storage/v1/object/")[1] };
      } else if (path.includes("/storage/v1/object/sign/campaign-media/")) {
        if (request.method() === "GET") {
          if (path.includes("broken-background")) {
            await route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
            return;
          }
          await route.fulfill({ contentType: "image/webp", body: backgroundImage });
          return;
        }
        result = {
          signedURL: path.includes("broken-background")
            ? "/object/sign/campaign-media/fixtures/broken-background.webp?token=test"
            : "/object/sign/campaign-media/fixtures/custom-background.webp?token=test",
        };
      } else if (path.endsWith("/get_service_status")) result = "ready";
      else if (path.endsWith("/ensure_actor")) result = { id: actorId, display_name: "验收账号", disabled: false };
      else if (path.endsWith("/get_gm_access")) result = { user_id: actorId, account_name: user.email, display_name: "验收账号", status: "approved", requested_at: date, reviewed_at: date, review_note: "" };
      else if (path.endsWith("/get_site_admin_access")) result = false;
      else if (path === "/auth/v1/user") result = user;
      else if (path.endsWith("/campaign_members")) result = [campaignId, deniedId].map((id) => ({ campaign_id: id, role: "gm", character_name: "验收店长", job_title: "店长", joined_at: date, campaign: { name: id === campaignId ? name : "不可访问的战役", join_code: "TEST00", status: "active" } }));
      else if (path.endsWith("/list_public_campaigns")) result = [{ id: campaignId, name, burger_index: 5, published_at: date, message_count: 0 }];
      else if (path.endsWith("/get_note_links")) result = noteLinks;
      else if (path.endsWith("/get_board_stickers")) result = boardStickers;
      else if (path.endsWith("/patch_campaign_settings")) {
        settingsPosts.push(body);
        if (rejectModuleSettings) { status = 400; result = { message: "模块设置保存失败" }; }
        else {
          const fields = { sectionTitles: "section_titles", sectionColors: "section_colors", resourceTitles: "resource_titles" };
          let conflict = false;
          for (const [field, changes] of Object.entries(body.p_patch)) {
            for (const [key, value] of Object.entries(fields[field] ? changes : {})) {
              const before = board.settings[fields[field]]?.[key] ?? null;
              if (before !== body.p_expected[field]?.[key] && before !== value) conflict = true;
            }
          }
          if (conflict) { status = 400; result = { message: "CAMPAIGN_SETTINGS_CONFLICT" }; }
          else {
            for (const [field, changes] of Object.entries(body.p_patch)) {
              if (fields[field]) {
                const merged = { ...board.settings[fields[field]] };
                for (const [key, value] of Object.entries(changes)) {
                  if (value === null) delete merged[key]; else merged[key] = value;
                }
                board.settings[fields[field]] = merged;
              } else if (field === "hiddenSections") {
                const hidden = new Set(board.settings.hidden_sections);
                for (const [key, value] of Object.entries(changes)) value ? hidden.add(key) : hidden.delete(key);
                board.settings.hidden_sections = [...hidden];
              } else if (field === "name") board.name = changes;
              else if (field === "noteTexturePath") board.settings.note_texture_path = changes;
            }
            result = body.p_patch;
          }
        }
      }
      else if (path.endsWith("/move_board_module")) {
        if (delayNextModuleMove) {
          delayNextModuleMove = false;
          if (delayedModuleMoveGate) await delayedModuleMoveGate;
        }
        board.settings.module_layout = {
          ...board.settings.module_layout,
          [body.p_key]: { x: body.p_x, y: body.p_y },
        };
        result = board.settings.module_layout;
      }
      else if (path.endsWith("/update_campaign_clock")) {
        clockWrites++;
        board.settings.clock_config = {
          ...body.p_config,
          referenceAt: new Date().toISOString(),
        };
        result = board.settings.clock_config;
      }
      else if (path.endsWith("/get_dice_state")) result = diceState;
      else if (path.endsWith("/get_dice_social")) result = {
        server_time: new Date().toISOString(),
        rolling: socialState.rolling,
        rolling_until: socialState.rolling.map((actor_id) => ({ actor_id, expires_at: new Date(Date.now() + 6000).toISOString() })),
        reactions: socialState.reactions.filter((reaction) => Date.now() - Date.parse(reaction.sent_at) < 4000),
      };
      else if (path.endsWith("/send_dice_reaction")) {
        reactionPosts.push(body);
        socialState.reactions = [{ actor_id: actorId, emoji: body.p_emoji, sent_at: new Date().toISOString() }];
        result = null;
      }
      else if (path.endsWith("/functions/v1/roll-dice")) {
        dicePosts.push(body);
        if (diceResponseGate) await diceResponseGate;
        if (rejectDiceOnce) {
          rejectDiceOnce = false; status = 503; result = { error: "temporary failure" };
        } else {
          result = diceState.rolls.find((r) => r.id === body.requestId);
          if (!result) {
            const rolled = [...body.notation.matchAll(/(\d+)d(\d+)/g)].flatMap((match) => {
              const sides = Number(match[2]);
              return Array.from({ length: Number(match[1]) }, () => ({
                value: sides === 6 ? forcedD6Value ?? 4 : Math.min(12, sides), sides, kept: true, flags: "",
              }));
            });
            const bonus = Number(body.notation.match(/([+-]\d+)$/)?.[1] ?? 0);
            const total = rolled.reduce((sum, die) => sum + die.value, bonus);
            result = {
              id: body.requestId, campaign_id: campaignId, actor_id: actorId, actor_name: "验收店长",
              notation: body.notation, label: body.label, visibility: body.visibility,
              parent_id: body.parentId ?? null, check_id: body.checkId ?? null,
              revealed_at: null, status: "complete", created_at: new Date().toISOString(),
              result: { total, output: `${body.notation}: [${rolled.map((die) => die.value).join(",")}]+${bonus} = ${total}`,
                dice: rolled, detail: [] },
            };
            diceState.rolls.unshift(result);
          }
          if (body.visibility === "blind" && redactBlindReceipt) {
            diceState.rolls[0] = { ...diceState.rolls[0], result: null };
            result = { ...result, result: null };
          }
        }
      }
      else if (path.endsWith("/save_dice_preset")) {
        const preset = { id: crypto.randomUUID(), campaign_id: campaignId, owner_id: actorId,
          name: body.p_name, notation: body.p_notation, visibility: body.p_visibility, shared: body.p_shared };
        diceState.presets.push(preset); result = preset;
      }
      else if (path.endsWith("/reveal_dice_roll")) {
        result = diceState.rolls.find((r) => r.id === body.p_id);
        result.revealed_at = new Date().toISOString();
      }
      else if (path.endsWith("/create_dice_check")) {
        result = { id: crypto.randomUUID(), campaign_id: campaignId, title: body.p_title,
          notation: body.p_notation, visibility: body.p_visibility,
          targets: [{ id: actorId, name: "验收玩家" }], responses: {}, open: true, created_at: date };
        diceState.checks.unshift(result);
      }
      else if (path.endsWith("/close_dice_check")) {
        const item = diceState.checks.find((c) => c.id === body.p_id); item.open = false; result = null;
      }
      else if (path.endsWith("/patch_board_appearance")) {
        if (rejectAppearance) { status = 400; result = { message: "主题保存失败" }; }
        else {
          appearanceWrites++;
          board.settings.appearance = body.p_appearance;
          board.settings.background_path = body.p_appearance.room.imagePath;
          result = board.settings;
        }
      }
      else if (path.endsWith("/create_note_link")) {
        if (createLinkGate) await createLinkGate;
        noteLinks.push({
          id: newNoteLinkId,
          from_note_id: body.p_from,
          to_note_id: body.p_to,
          label: null,
        });
        result = newNoteLinkId;
      } else if (path.endsWith("/update_note_link_label")) {
        noteLinks = noteLinks.map((link) =>
          link.id === body.p_id ? { ...link, label: body.p_label } : link,
        );
        result = body.p_label;
      } else if (path.endsWith("/delete_note_link")) {
        deleteLinkRequests++;
        noteLinks = noteLinks.filter((link) => link.id !== body.p_id);
        result = body.p_id;
      }
      else if (path.endsWith("/save_note")) {
        board.notes = board.notes.map((note) => note.id === body.p_id
          ? { ...note, title: body.p_title, body: body.p_body, color: body.p_color, pin_color: body.p_pin_color }
          : note);
        result = body.p_id;
      }
      else if (path.endsWith("/move_note_layer")) {
        const ordered = [...board.notes].sort((left, right) => left.layer - right.layer);
        const index = ordered.findIndex((note) => note.id === body.p_id);
        const adjacent = ordered[index + body.p_direction];
        if (adjacent) {
          const current = ordered[index];
          const layer = current.layer;
          current.layer = adjacent.layer;
          adjacent.layer = layer;
        }
        result = ordered.map(({ id, layer }) => ({ id, layer }));
      }
      else if (path.endsWith("/create_board_sticker")) {
        if (rejectSticker) {
          status = 404;
          result = { code: "PGRST202", message: "Could not find the function public.create_board_sticker" };
        } else {
          const sticker = { id: `sticker-${boardStickers.length + 1}`, campaign_id: campaignId, emoji: body.p_emoji, x: body.p_x, y: body.p_y, scale: 1, rotation: body.p_rotation, created_by: actorId };
          boardStickers.push(sticker);
          result = sticker;
        }
      }
      else if (path.endsWith("/move_board_sticker")) {
        boardStickers = boardStickers.map((sticker) => sticker.id === body.p_id ? { ...sticker, x: body.p_x, y: body.p_y } : sticker);
        result = boardStickers.find((sticker) => sticker.id === body.p_id);
      }
      else if (path.endsWith("/resize_board_sticker")) {
        if (rejectStickerResize) { status = 400; result = { message: "贴纸缩放失败" }; }
        else {
          boardStickers = boardStickers.map((sticker) => sticker.id === body.p_id ? {
            ...sticker, scale: body.p_scale, x: Math.min(sticker.x, 2144 - Math.ceil(72 * body.p_scale)),
            y: Math.min(sticker.y, 1206 - Math.ceil(72 * body.p_scale)),
          } : sticker);
          result = boardStickers.find((sticker) => sticker.id === body.p_id);
        }
      }
      else if (path.endsWith("/delete_board_sticker")) {
        boardStickers = boardStickers.filter((sticker) => sticker.id !== body.p_id);
        result = body.p_id;
      }
      else if (path.endsWith("/get_event_clocks")) result = eventClocks;
      else if (path.endsWith("/save_event_clock") || path.endsWith("/set_event_clock_progress") || path.endsWith("/delete_event_clock")) {
        if (eventClockGate) await eventClockGate;
        const clock = eventClocks.find((item) => item.id === body.p_id);
        if (rejectEventClock) { status = 400; result = { message: "EVENT_CLOCK_CONFLICT" }; }
        else if (body.p_id && clock?.revision !== body.p_revision) {
          status = 400; result = { message: "EVENT_CLOCK_CONFLICT" };
        } else if (path.endsWith("/delete_event_clock")) {
          eventClocks = eventClocks.filter((item) => item.id !== body.p_id); result = body.p_id;
        } else if (path.endsWith("/set_event_clock_progress")) {
          result = { ...clock, progress: body.p_progress, revision: clock.revision + 1 };
          eventClocks = eventClocks.map((item) => item.id === result.id ? result : item);
        } else {
          result = { id: body.p_id ?? crypto.randomUUID(), name: body.p_name, segments: body.p_segments,
            progress: body.p_progress, consequence: body.p_consequence, color: body.p_color,
            mode: clock?.mode ?? "progress", stages: clock?.stages ?? null, revision: (clock?.revision ?? 0) + 1 };
          eventClocks = clock ? eventClocks.map((item) => item.id === result.id ? result : item) : [...eventClocks, result];
        }
      }
      else if (path.endsWith("/get_campaign_board") || path.endsWith("/get_public_campaign_board")) {
        boardRequests++;
        if (body.p_campaign_id === deniedId) { status = 400; result = { message: "FORBIDDEN" }; }
        else { if (boardGate) await boardGate; result = board; }
      } else if (path.endsWith("/set_burger_index")) board = { ...board, burger_index: body.p_value };
      else if (path.endsWith("/review_quest_submission")) board.quests[0].status = body.p_approved ? "completed" : "failed";
      else if (path.endsWith("/move_note")) {
        if (rejectMove) { status = 400; result = { message: "FORBIDDEN" }; }
        else {
          if (body.p_id === delayedMoveId && delayedMoveGate) await delayedMoveGate;
          board.notes = board.notes.map((note) => note.id === body.p_id ? { ...note, x: body.p_x, y: body.p_y } : note);
        }
      }
      await route.fulfill({ status, headers: { "content-range": "*/0" }, contentType: "application/json", body: JSON.stringify(result) });
    });
    await page.goto(preview);
    const entry = page.locator(`.campaign-access-rows [data-campaign-entry="${campaignId}"]`);
    await entry.click();
    check(await entry.getAttribute("aria-busy") === "true", "entry reports pending navigation");
    check(await entry.isDisabled(), "duplicate entry is blocked during data preparation");
    check(await page.locator(".access-screen").isVisible(), "list stays visible while board loads");
    releaseBoard();
    boardGate = null;
    await page.locator(".board").waitFor();
    await page.waitForFunction(() => !document.documentElement.dataset.campaignTransition);
    await page.waitForFunction(() => getComputedStyle(document.querySelector(".room-background.is-wallpaper")).backgroundImage !== "none");
    check(await page.locator('.room-background.is-wallpaper[data-background-kind="image"]').count() === 1,
      "legacy custom background becomes a screen wallpaper");
    check(await page.locator('.world > .board-frame[data-frame="burger"]').count() === 1,
      "legacy rooms keep an independent burger frame");
    check(await page.locator('.board > .board-surface[data-surface="felt"]').count() === 1,
      "legacy rooms keep their board material");
    check(boardRequests === 1, "mounted board reuses prepared query data");
    if (scenario.label === "desktop") {
      const lobbyReads = Object.fromEntries(Object.entries(reads).filter(([path]) =>
        /get_gm_access|list_public_campaigns|campaign_members|campaign_join_requests/.test(path)));
      // A board refresh proves a poll interval elapsed without sleeping.
      await page.waitForResponse((response) => new URL(response.url()).pathname.endsWith("/get_campaign_board"));
      const afterReads = Object.fromEntries(Object.entries(reads).filter(([path]) =>
        /get_gm_access|list_public_campaigns|campaign_members|campaign_join_requests/.test(path)));
      // The GM inbox remains enabled, so exclude it from the lobby projection.
      delete lobbyReads["/rest/v1/campaign_join_requests"];
      delete afterReads["/rest/v1/campaign_join_requests"];
      check(JSON.stringify(lobbyReads) === JSON.stringify(afterReads), "entering a room stops hidden lobby polling");
      check(!reads["/rest/v1/visitor_messages"], "closed visitor messages do not poll");
    }
    if (process.env.HP_MOTION_SKIP_DICE || scenario.label === "desktop") {
      await page.locator('[data-module="inventory"] .board-section-actions button').first().click();
      const moduleDialog = page.locator(".section-settings-dialog");
      const common = moduleDialog.getByRole("form", { name: "模块外观设置" });
      const categoryDraft = moduleDialog.getByLabel("食材与补给的分类标题", { exact: true });
      const beforeClocks = JSON.stringify(eventClocks);
      const beforeLayout = JSON.stringify(board.settings.module_layout ?? {});
      const beforeResources = JSON.stringify(board.resources);
      await categoryDraft.fill("未保存的分类");
      await common.getByLabel("可用物资与设施的十六进制色号", { exact: true }).fill("#123");
      rejectModuleSettings = true;
      await common.getByRole("button", { name: "保存模块外观", exact: true }).click();
      await common.getByRole("alert").waitFor();
      check(!board.settings.section_colors?.inventory && await categoryDraft.inputValue() === "未保存的分类",
        "failed appearance save preserves both stored settings and the independent category draft");
      rejectModuleSettings = false;
      const appearanceSaved = page.waitForResponse(response => new URL(response.url()).pathname.endsWith("/patch_campaign_settings"));
      await common.getByRole("button", { name: "保存模块外观", exact: true }).click(); await appearanceSaved;
      check(board.settings.section_colors.inventory === "#112233" && !board.settings.resource_titles?.["0"],
        "shared color input normalizes hex and never saves unfinished content");
      check(JSON.stringify(Object.keys(settingsPosts.at(-1).p_patch)) === JSON.stringify(["sectionColors"]) &&
        JSON.stringify(settingsPosts.at(-1).p_patch.sectionColors) === JSON.stringify({ inventory: "#112233" }),
        "an appearance save sends only the edited module key");
      check(JSON.stringify(board.resources) === beforeResources && JSON.stringify(eventClocks) === beforeClocks &&
        JSON.stringify(board.settings.module_layout ?? {}) === beforeLayout, "appearance saves preserve data types and layout");
      const defaultsSaved = page.waitForResponse(response => new URL(response.url()).pathname.endsWith("/patch_campaign_settings"));
      await common.getByRole("button", { name: "恢复默认", exact: true }).click();
      await common.getByRole("button", { name: "保存模块外观", exact: true }).click(); await defaultsSaved;
      check(await categoryDraft.inputValue() === "未保存的分类", "restoring module defaults preserves the content draft");
      board.settings.section_colors.inventory = "#445566";
      await common.getByLabel("可用物资与设施的十六进制色号", { exact: true }).fill("#123456");
      await common.getByRole("button", { name: "保存模块外观", exact: true }).click();
      await common.getByRole("alert").filter({ hasText: "其他 GM 已修改" }).waitFor();
      check(board.settings.section_colors.inventory === "#445566" &&
        await common.getByLabel("可用物资与设施的十六进制色号", { exact: true }).inputValue() === "#123456",
        "a stale editor shows a conflict without overwriting the other GM or discarding its draft");
      delete board.settings.section_colors.inventory;
      await moduleDialog.getByRole("button", { name: "关闭", exact: true }).click();
    }
    if ((["desktop", "mobile", "reduced"].includes(scenario.label) || process.env.HP_MOTION_DICE_ONLY) && !process.env.HP_MOTION_SKIP_DICE) {
      const toolButtons = await page.getByRole("navigation", { name: "公告板工具", exact: true })
        .locator(".board-tool-button").evaluateAll((buttons) => buttons.map((button) => {
          const rect = button.getBoundingClientRect(), style = getComputedStyle(button);
          return { x: rect.x, y: rect.y, width: rect.width, height: rect.height,
            background: style.backgroundColor, radius: style.borderRadius };
        }));
      check(toolButtons.length === 4 && toolButtons.every((button) => button.width === 48 && button.height === 48),
        "board tools use four fixed-size buttons");
      check(toolButtons.every((button) => button.y === toolButtons[0].y &&
        button.background === toolButtons[0].background && button.radius === toolButtons[0].radius),
        "board tools align in one row with consistent styling");
      await page.getByRole("button", { name: "打开骰盘", exact: true }).click();
      const tray = page.locator(".dice-dialog");
      await tray.waitFor();
      await tray.locator(`.dice-member[data-member-id="${peerId}"][data-rolling="true"]`).waitFor();
      check(await tray.locator(".dice-member-avatar").count() === 2, "dice layer lists GM and player avatars");
      await tray.getByRole("button", { name: "验收店长，发送表情", exact: true }).click();
      await tray.getByRole("button", { name: "发送 🍀", exact: true }).click();
      await tray.getByRole("status", { name: "验收店长：🍀", exact: true }).waitFor();
      check(reactionPosts.at(-1).p_campaign_id === campaignId && reactionPosts.at(-1).p_emoji === "🍀",
        "a non-rolling member sends a reaction to the current campaign");
      await page.screenshot({ path: join(screenshots, `${scenario.label}-dice-reaction.png`) });
      socialState.rolling = [];
      socialState.reactions = [{ actor_id: peerId, emoji: "👏", sent_at: new Date().toISOString() }];
      notifyReaction(socialState.reactions[0]);
      await tray.getByRole("status", { name: "验收玩家：👏", exact: true }).waitFor();
      check(await tray.getByRole("status", { name: "验收玩家：👏", exact: true }).isVisible(),
        "a remote member's reaction appears beside their own avatar");
      if (scenario.label === "desktop") {
        const socialPath = "/rest/v1/rpc/get_dice_social";
        const beforeExpiry = reads[socialPath];
        await tray.getByRole("status", { name: "验收玩家：👏", exact: true }).waitFor({ state: "detached" });
        check(reads[socialPath] === beforeExpiry, "connected social presence expires locally without polling");
        const [topic, channel] = socialChannel();
        const fallbackRead = page.waitForResponse((response) => new URL(response.url()).pathname === socialPath);
        channel.socket.send(JSON.stringify([channel.join, null, topic, "system", { extension: "postgres_changes", status: "error" }]));
        await fallbackRead;
        check(reads[socialPath] > beforeExpiry, "a failed Realtime subscription enables fallback polling");
        channel.socket.send(JSON.stringify([channel.join, null, topic, "system", { extension: "postgres_changes", status: "ok" }]));
      }
      const openTool = async (name) => {
        await tray.getByRole("button", { name: "骰盘更多操作", exact: true }).click();
        await tray.getByRole("dialog", { name: "骰盘更多操作", exact: true }).getByRole("button", { name, exact: true }).click();
      };
      const addFromDie = async (type = "d6") => {
        await tray.getByRole("button", { name: "选择新增骰型", exact: true }).click();
        const types = tray.getByRole("dialog", { name: "添加骰型", exact: true });
        await types.getByRole("button", { name: type, exact: true }).click();
        await types.waitFor({ state: "detached" });
      };
      check(await tray.locator(".dice-layer-header nav button:visible").count() === (scenario.label === "mobile" ? 3 : 2),
        "desktop keeps More/Close, while touch devices add a multi-select toggle");
      const rect = await tray.boundingBox();
      check(rect.x >= -1 && rect.x + rect.width <= scenario.width + 1, "dice tray fits the viewport");
      check(await tray.evaluate((el) => el.scrollWidth <= el.clientWidth), "dice tray has no horizontal overflow");
      const boardBeforeDice = await page.locator(".world").getAttribute("style");
      await tray.locator('.dice-tray-scene[data-ready="true"] canvas').waitFor();
      check(await tray.locator(".dice-scene canvas").count() === 1, "dice tray is 3D as soon as it opens");
      check(await tray.evaluate((el) => el.parentElement === document.body), "3D layer is outside the board world");
      await page.waitForFunction(() => {
        const target = document.querySelector(".dice-pick-target");
        return target?.dataset.topFace && target.style.left && target.style.top;
      });
      const pick = await tray.locator(".dice-pick-target").first().boundingBox();
      if (scenario.label === "mobile") await page.touchscreen.tap(pick.x + pick.width / 2, pick.y + pick.height / 2);
      else await page.mouse.click(pick.x + pick.width / 2, pick.y + pick.height / 2);
      await tray.getByRole("group", { name: "骰子选项", exact: true }).waitFor();
      check(await tray.getByRole("button", { name: "投掷这颗骰子", exact: true }).isVisible(), "3D die picking opens its options");
      await page.waitForFunction(() => {
        const menu = document.querySelector(".dice-fan-menu");
        return menu?.dataset.fanReady === "true" && menu.dataset.interactive === "true" &&
          menu.getAnimations({ subtree: true }).every((animation) => animation.playState === "finished");
      });
      const fanGeometry = await tray.locator(".dice-fan-action").evaluateAll((buttons) => buttons.map((button) => {
        const rect = button.getBoundingClientRect();
        return { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
      }));
      check(fanGeometry.every((r) => r.x >= 0 && r.y >= 0 && r.right <= scenario.width && r.bottom <= scenario.height),
        "fan actions stay on screen on desktop and mobile");
      check(fanGeometry.every((r) => r.width >= 44 && r.height >= 44), "fan keeps touch-sized actions");
      check(fanGeometry.some((r) => Math.abs(r.y - fanGeometry[0].y) > 20), "dice actions follow an arc");
      await page.waitForFunction(() => document.activeElement?.classList.contains("dice-fan-action"));
      await page.keyboard.press("ArrowRight");
      check(await tray.getByRole("button", { name: "选择新增骰型", exact: true }).evaluate((button) => button === document.activeElement),
        "arrow keys move between radial actions");
      await page.screenshot({ path: join(screenshots, `${scenario.label}-dice-menu.png`) });
      await tray.getByRole("button", { name: "修正与可见范围", exact: true }).click();
      const dieSettings = tray.getByRole("dialog", { name: "选中骰子设置面板", exact: true });
      await dieSettings.waitFor();
      await page.waitForFunction(() => document.querySelector(".dice-popover")?.dataset.positioned === "true" &&
        document.querySelector(".dice-popover").getAnimations().every((animation) => animation.playState === "finished"));
      const popupRect = await dieSettings.boundingBox();
      check(popupRect.x >= 0 && popupRect.y >= 0 &&
        popupRect.x + popupRect.width <= scenario.width && popupRect.y + popupRect.height <= scenario.height,
      "die submenu stays within the screen");
      check(popupRect.height < scenario.height * .8 && await tray.locator(".dice-drawer").count() === 0,
        "die settings use a compact popover rather than a full-height sidebar");
      check(await tray.locator('.dice-pick-target[aria-pressed="true"]').count() === 1,
        "die silhouette stays selected while its submenu is open");
      await page.screenshot({ path: join(screenshots, `${scenario.label}-dice-settings-popover.png`) });
      if (scenario.label === "desktop") {
        await page.setViewportSize({ width: 820, height: 420 });
        await page.waitForFunction(() => {
          const rect = document.querySelector(".dice-popover")?.getBoundingClientRect();
          return rect && rect.x >= 0 && rect.right <= innerWidth && rect.y >= 0 && rect.bottom <= innerHeight;
        });
        check(await dieSettings.evaluate((element) => element.scrollWidth <= element.clientWidth),
          "popover fits a short landscape viewport without horizontal overflow");
        await page.setViewportSize({ width: scenario.width, height: scenario.height });
      }
      await dieSettings.getByLabel("选中骰子总修正").fill("2");
      await dieSettings.getByRole("button", { name: "返回骰子菜单", exact: true }).click();
      await dieSettings.waitFor({ state: "detached" });
      await tray.getByRole("button", { name: "修正与可见范围", exact: true }).click();
      check(await dieSettings.getByLabel("选中骰子总修正").inputValue() === "2",
        "returning to a submenu keeps the current selection settings");
      await dieSettings.getByLabel("选中骰子总修正").fill("0");
      await page.keyboard.press("Escape");
      await dieSettings.waitFor({ state: "detached" });
      check(await tray.isVisible(), "Escape returns from a submenu without closing the tray");
      await page.waitForFunction(() => document.activeElement?.classList.contains("dice-fan-action"));
      await page.keyboard.press("Escape");
      await tray.locator(".dice-fan-menu").waitFor({ state: "detached" });
      check(await tray.isVisible(), "Escape dismisses the fan without closing the dice tray");
      if (scenario.label === "mobile") await page.touchscreen.tap(pick.x + pick.width / 2, pick.y + pick.height / 2);
      else await page.mouse.click(pick.x + pick.width / 2, pick.y + pick.height / 2);
      await tray.getByRole("button", { name: "选择新增骰型", exact: true }).click();
      const types = tray.getByRole("dialog", { name: "添加骰型", exact: true });
      await types.waitFor({ state: "visible" });
      await page.waitForFunction(() => document.querySelector(".dice-popover")?.getAnimations()
        .every((animation) => animation.playState === "finished"));
      await page.screenshot({ path: join(screenshots, `${scenario.label}-dice-type-submenu.png`) });
      check(await types.locator(".dice-add-menu button").count() === 8, "add submenu offers all standard dice and Fate");
      check(await types.getByRole("button", { name: "返回骰子菜单", exact: true }).isVisible(), "dice-type submenu returns to the selected die");
      await types.getByRole("button", { name: "d20", exact: true }).click();
      check(await tray.locator(".dice-pick-target").count() === 2, "add another die through its menu");
      check((await tray.locator(".dice-pick-target").last().getAttribute("aria-label")).includes("d20"),
        "add submenu can add a different die type");
      await page.waitForFunction(() => {
        const targets = [...document.querySelectorAll(".dice-pick-target")];
        const target = targets.at(-1);
        return targets.length === 2 && target?.dataset.topFace && target.style.left && target.style.top;
      });
      const secondPick = await tray.locator(".dice-pick-target").last().boundingBox();
      await page.mouse.click(secondPick.x + secondPick.width / 2, secondPick.y + secondPick.height / 2);
      await tray.getByRole("group", { name: "骰子选项", exact: true }).waitFor();
      await tray.getByRole("button", { name: "移出骰盘", exact: true }).click();
      check(await tray.locator(".dice-pick-target").count() === 1, "removing a tray object works without a roll mutation");
      if (scenario.label === "mobile") {
        for (const viewport of [{ width: 320, height: 640 }, { width: 844, height: 390 },
          { width: scenario.width, height: scenario.height }]) {
          await page.setViewportSize(viewport);
          await page.waitForFunction(() => {
            const scene = document.querySelector(".dice-tray-scene");
            return scene?.clientWidth > 0 && Number.parseFloat(scene.querySelector("canvas")?.style.width) === scene.clientWidth &&
              Number.parseFloat(scene.querySelector("canvas")?.style.height) === scene.clientHeight;
          });
          const layout = await tray.locator(".dice-tray-scene").evaluate((node) => {
            const rect = node.getBoundingClientRect(), bounds = node.dataset.trayBounds.split(",").map(Number);
            return { stage: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
              bounds, screenWidth: innerWidth, screenHeight: innerHeight };
          });
          const [left, top, right, bottom] = layout.bounds;
          check(left >= 0 && top >= 0 && right <= layout.stage.width && bottom <= layout.stage.height,
            "larger mobile tray keeps its full rim visible in narrow portrait and landscape");
          if (viewport.width < viewport.height) {
            check((right - left) / viewport.width >= .8,
              "portrait tray spans at least 80% of phone width");
            const members = await tray.locator(".dice-members").boundingBox();
            check(members.y + members.height <= layout.stage.y + 8, "portrait avatars sit above the tray");
          }
          check(await tray.getByRole("button", { name: "多选骰子", exact: true }).isVisible(),
            "touch selection remains available after rotating the phone");
        }
        for (const sides of [20, 8]) {
          await openTool("添加骰子");
          await tray.getByRole("button", { name: `d${sides}`, exact: true }).click();
        }
        await page.waitForFunction(() => document.querySelectorAll(".dice-pick-target").length === 3 &&
          [...document.querySelectorAll(".dice-pick-target")].every((target) => target.dataset.position && target.dataset.topFace));
        const phoneDice = await tray.locator(".dice-pick-target").evaluateAll((targets) => targets.map((target) => {
          const rect = target.getBoundingClientRect();
          return { id: target.dataset.dieId, x: rect.x + rect.width / 2, y: rect.y + rect.height / 2,
            pose: target.dataset.position, face: target.dataset.faceValue };
        }));
        const touchDie = async (index) => page.touchscreen.tap(phoneDice[index].x, phoneDice[index].y);
        const beforeSelection = dicePosts.length;
        await tray.getByRole("button", { name: "多选骰子", exact: true }).click();
        check(await tray.getByRole("button", { name: "投掷选中（0）", exact: true }).isDisabled(),
          "empty touch selection cannot accidentally roll the whole tray");
        await touchDie(0); await touchDie(1);
        check(await tray.locator('.dice-pick-target[aria-pressed="true"]').count() === 2,
          "separate fingertip taps select a mixed pool without a modifier key");
        check(await tray.locator(".dice-fan-menu").count() === 0, "radial actions stay out of the way during touch multi-select");
        await touchDie(1);
        check(await tray.locator('.dice-pick-target[aria-pressed="true"]').count() === 1,
          "tapping a selected die deselects only that die");
        await touchDie(1);
        const phoneStage = await tray.locator(".dice-stage").boundingBox();
        await page.touchscreen.tap(phoneStage.x + 6, phoneStage.y + 6);
        check(await tray.locator('.dice-pick-target[aria-pressed="true"]').count() === 2,
          "tapping empty space preserves the mobile selection");
        await tray.getByRole("button", { name: "全选", exact: true }).click();
        check(await tray.locator('.dice-pick-target[aria-pressed="true"]').count() === 3, "mobile can select all dice explicitly");
        await tray.getByRole("button", { name: "清除选择", exact: true }).click();
        check(await tray.locator('.dice-pick-target[aria-pressed="true"]').count() === 0, "mobile can clear a group explicitly");
        await touchDie(0); await touchDie(1);
        check(dicePosts.length === beforeSelection, "touch selection does not submit or precompute a roll");
        await page.screenshot({ path: join(screenshots, "mobile-dice-multiselect.png") });
        await tray.getByRole("button", { name: "完成骰子多选", exact: true }).click();
        await tray.getByRole("button", { name: "统一设置选中骰子", exact: true }).click();
        const selectedPanel = tray.getByRole("dialog", { name: "选中骰子设置面板", exact: true });
        await selectedPanel.getByLabel("选中骰子总修正").fill("2");
        check(await selectedPanel.getByLabel("选中骰子公式").textContent() === "1d6+1d20+2",
          "phone mixed selection supports the same shared settings as desktop");
        await selectedPanel.getByRole("button", { name: "返回骰子菜单", exact: true }).click();
        await selectedPanel.waitFor({ state: "detached" });
        await tray.getByRole("button", { name: "多选骰子", exact: true }).click();
        const mobileSaved = page.waitForResponse((response) => new URL(response.url()).pathname.endsWith("/functions/v1/roll-dice"));
        await tray.getByRole("button", { name: "投掷选中（2）", exact: true }).click();
        await mobileSaved;
        await tray.locator('.dice-tray-scene[data-phase="idle"][data-rolling="false"]').waitFor();
        check(dicePosts.length === beforeSelection + 1 && dicePosts.at(-1).notation === "1d6+1d20+2",
          "phone button rolls only the selected mixed dice with one total modifier");
        const phoneStationary = tray.locator(`[data-die-id="${phoneDice[2].id}"]`);
        check(await phoneStationary.getAttribute("data-position") === phoneDice[2].pose &&
          await phoneStationary.getAttribute("data-face-value") === phoneDice[2].face,
          "unselected mobile dice keep their exact position and value");
        check(await tray.getByRole("button", { name: "多选骰子", exact: true }).getAttribute("aria-pressed") === "false",
          "a completed roll exits mobile multi-select mode");
        await page.screenshot({ path: join(screenshots, "mobile-dice-selected-result.png") });
        await openTool("公式与预设");
        await tray.getByLabel("骰子公式", { exact: true }).fill("1d6");
        await tray.locator(".dice-roll-button").click();
        await page.waitForFunction(() => document.querySelectorAll(".dice-pick-target").length === 1);
        await tray.locator('.dice-tray-scene[data-phase="idle"][data-rolling="false"]').waitFor();
      }
      if (scenario.label === "desktop") {
        for (const sides of [20, 8]) {
          await openTool("添加骰子");
          await tray.getByRole("button", { name: `d${sides}`, exact: true }).click();
        }
        await page.waitForFunction(() => {
          const targets = [...document.querySelectorAll(".dice-pick-target")];
          return targets.length === 3 && targets.every((target) => target.style.left && target.dataset.topFace);
        });
        const footprints = await tray.locator(".dice-pick-target").evaluateAll((targets) => targets.map((target) => target.dataset.footprint.split(",").map(Number)));
        check(footprints.every((a, i) => footprints.slice(i + 1).every((b) =>
          a[1] <= b[0] || a[0] >= b[1] || a[3] <= b[2] || a[2] >= b[3])),
        "new mixed dice occupy separate free floor areas");
        let staged = await tray.locator(".dice-pick-target").evaluateAll((targets) => targets.map((target) => {
          const rect = target.getBoundingClientRect();
          return { id: target.dataset.dieId, x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
        }));
        const drawBox = async (points) => {
          await page.mouse.move(Math.min(...points.map((point) => point.x)) - 35,
            Math.max(...points.map((point) => point.y)) + 45);
          await page.mouse.down();
          await page.mouse.move(Math.max(...points.map((point) => point.x)) + 35,
            Math.min(...points.map((point) => point.y)) - 45, { steps: 12 });
        };
        await drawBox(staged.slice(0, 2));
        check(await tray.locator(".dice-selection-box").isVisible(), "mouse drag displays a selection rectangle");
        check(await tray.locator('.dice-pick-target[aria-pressed="true"]').count() === 2,
          "marquee highlights only dice with enclosed centers");
        check(await tray.locator(".dice-fan-menu").count() === 0, "batch menu waits until the drag finishes");
        await page.screenshot({ path: join(screenshots, "desktop-dice-marquee.png") });
        await page.mouse.up();
        await tray.getByRole("button", { name: "统一设置选中骰子", exact: true }).waitFor();
        check(await tray.locator(".dice-selection-box").isHidden(), "selection rectangle disappears on release");
        await page.waitForFunction(() => document.querySelector(".dice-fan-menu")?.dataset.interactive === "true");
        const beforeDrag = dicePosts.length;
        const beforePoses = await tray.locator(".dice-pick-target").evaluateAll((targets) => targets.map((target) => target.dataset.position));
        await page.mouse.move(staged[0].x, staged[0].y);
        await page.mouse.down();
        await tray.locator('.dice-tray-scene[data-gesture="lift"]').waitFor();
        check(await tray.locator(".dice-fan-menu").count() === 0, "long press lifts the selected group and hides its menu");
        await page.mouse.move(staged[0].x + 70, staged[0].y - 35, { steps: 10 });
        const duringPoses = await tray.locator(".dice-pick-target").evaluateAll((targets) => targets.map((target) => target.dataset.position));
        check(duringPoses[0] !== beforePoses[0] && duringPoses[1] !== beforePoses[1] && duringPoses[2] === beforePoses[2],
          "long-press dragging moves only selected dice");
        await page.screenshot({ path: join(screenshots, "desktop-dice-dragging.png") });
        await page.keyboard.press("Escape");
        await page.mouse.up();
        check(dicePosts.length === beforeDrag + 1, "grabbing prepares exactly one roll before release");
        check(JSON.stringify(await tray.locator(".dice-pick-target").evaluateAll((targets) => targets.map((target) => target.dataset.position))) === JSON.stringify(beforePoses),
          "Escape restores every dragged die to its original pose");
        const preparedId = dicePosts.at(-1).requestId;
        await tray.getByRole("button", { name: "关闭", exact: true }).click();
        await page.getByRole("button", { name: /^打开骰盘/ }).click();
        await tray.locator('.dice-tray-scene[data-ready="true"]').waitFor();
        check(dicePosts.length === beforeDrag + 1, "closing and reopening the tray preserves the prepared request");
        await tray.locator(".dice-stage-roll").click();
        await page.waitForFunction((id) => document.querySelector(".dice-pick-target")?.dataset.dieId.startsWith(id), preparedId);
        await tray.locator('.dice-tray-scene[data-phase="idle"][data-rolling="false"]').waitFor();
        check(dicePosts.length === beforeDrag + 1, "continuing a cancelled prepared roll does not generate a second result");
        staged = await tray.locator(".dice-pick-target").evaluateAll((targets) => targets.map((target) => {
          const rect = target.getBoundingClientRect();
          return { id: target.dataset.dieId, x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
        }));
        await drawBox(staged.slice(0, 2));
        await page.mouse.up();
        await page.waitForFunction(() => document.querySelector(".dice-fan-menu")?.dataset.interactive === "true");
        await page.keyboard.down("Shift");
        await drawBox([staged[2]]);
        await page.mouse.up();
        await page.keyboard.up("Shift");
        check(await tray.locator('.dice-pick-target[aria-pressed="true"]').count() === 3,
          "Shift marquee adds to the existing selection");
        await page.waitForFunction(() => document.querySelector(".dice-fan-menu")?.dataset.interactive === "true");
        await page.keyboard.press("Escape");
        await tray.locator(".dice-fan-menu").waitFor({ state: "detached" });
        check(await tray.locator('.dice-pick-target[aria-pressed="true"]').count() === 0, "Escape clears the batch selection");
        await drawBox(staged.slice(0, 2));
        await page.mouse.up();
        await tray.getByRole("button", { name: "统一设置选中骰子", exact: true }).click();
        const selectedPanel = tray.getByRole("dialog", { name: "选中骰子设置面板", exact: true });
        await selectedPanel.getByLabel("选中骰子总修正").fill("3");
        await selectedPanel.getByLabel("选中骰子用途").fill("批量检定");
        await selectedPanel.getByLabel("选中骰子可见性").selectOption("self");
        check(await selectedPanel.getByLabel("选中骰子公式").textContent() === "1d6+1d20+3",
          "mixed selected dice share one total modifier");
        check(await tray.locator('.dice-pick-target[aria-pressed="true"]').count() === 2,
          "opening settings preserves the selected dice");
        await page.waitForFunction(() => document.querySelector(".dice-popover")?.getAnimations()
          .every((animation) => animation.playState === "finished"));
        await page.screenshot({ path: join(screenshots, "desktop-dice-selection-settings.png") });
        const beforeBatch = dicePosts.length;
        const resultsBeforeBatch = diceState.rolls.length;
        rejectDiceOnce = true;
        await selectedPanel.getByRole("button", { name: "投掷选中（2）", exact: true }).click();
        await tray.getByRole("alert").waitFor();
        const batchRequest = dicePosts.at(-1).requestId;
        check(await selectedPanel.getByLabel("选中骰子总修正").isDisabled(),
          "uncertain retries keep their original settings");
        await tray.getByRole("button", { name: "收起面板", exact: true }).click();
        await page.waitForFunction(() => document.querySelector(".dice-fan-menu")?.dataset.interactive === "true");
        await page.keyboard.press("Escape");
        await tray.locator(".dice-fan-menu").waitFor({ state: "detached" });
        await page.mouse.click(staged[2].x, staged[2].y);
        check(await tray.locator('.dice-pick-target[aria-pressed="true"]').count() === 0,
          "a pending roll cannot switch to a different selected pool");
        await tray.locator(".dice-stage-roll").click();
        await page.waitForFunction((id) => document.querySelector(`[data-die-id="${id}:1"]`)?.dataset.faceValue === "12", batchRequest);
        await tray.locator('.dice-tray-scene[data-phase="idle"][data-rolling="false"]').waitFor();
        check(dicePosts.length === beforeBatch + 2 && dicePosts.at(-1).requestId === batchRequest,
          "batch retry remains one idempotent request after selection changes");
        check(dicePosts.at(-1).notation === "1d6+1d20+3" &&
          dicePosts.at(-1).label === "批量检定" && dicePosts.at(-1).visibility === "self",
        "batch throw submits the selected mixed pool and shared settings");
        const stationary = tray.locator(`[data-die-id="${staged[2].id}"]`);
        const stationaryAfter = await stationary.boundingBox();
        check(Math.abs(stationaryAfter.x + stationaryAfter.width / 2 - staged[2].x) < 1 &&
          Math.abs(stationaryAfter.y + stationaryAfter.height / 2 - staged[2].y) < 1 &&
          await stationary.getAttribute("data-face-value") === "",
        "batch throw preserves the unselected die position and value");
        check(await tray.locator(".dice-pick-target").count() === 3 && diceState.rolls.length === resultsBeforeBatch + 1,
          "selected dice are replaced together without replacing the whole tray");
        for (const [index, value] of [4, 12].entries()) {
          check(await tray.locator(`[data-die-id="${batchRequest}:${index}"]`).getAttribute("data-top-face") === String(value),
            "each selected die lands on its server face");
        }
        check(diceState.rolls[0].result.total === 19, "batch total applies the modifier once");
        check(await tray.locator(".dice-result-die").allTextContents().then((values) => values.length === 2 &&
          values[0].includes("d6") && values[0].includes("4") && values[1].includes("d20") && values[1].includes("12")),
        "bottom equation identifies the type and value of every die");
        check(await tray.locator(".dice-result-modifier b").textContent() === "3", "bottom equation shows the total modifier separately");
        const tossTargets = tray.locator(".dice-pick-target");
        await tossTargets.nth(0).focus();
        await page.keyboard.press("Enter");
        await page.waitForFunction(() => document.querySelector(".dice-fan-menu")?.dataset.interactive === "true");
        await tossTargets.nth(1).focus();
        await page.keyboard.press("Shift+Enter");
        await page.waitForFunction(() => document.querySelectorAll('.dice-pick-target[aria-pressed="true"]').length === 2);
        await page.waitForFunction(() => document.querySelector(".dice-fan-menu")?.dataset.interactive === "true");
        const throwPick = await tossTargets.nth(0).boundingBox();
        const postsBeforeToss = dicePosts.length;
        const resultsBeforeToss = diceState.rolls.length;
        const stationaryPose = await stationary.getAttribute("data-position");
        const posesBeforeToss = await tossTargets.evaluateAll((targets) => targets.map((target) => target.dataset.position));
        let releaseTossResponse;
        diceResponseGate = new Promise((resolve) => { releaseTossResponse = resolve; releaseHeldResponse = resolve; });
        rejectDiceOnce = true;
        const tossSaved = page.waitForResponse((response) => new URL(response.url()).pathname.endsWith("/functions/v1/roll-dice"))
          .catch(() => null);
        await page.mouse.move(throwPick.x + throwPick.width / 2, throwPick.y + throwPick.height / 2);
        await page.mouse.down();
        await tray.locator('.dice-tray-scene[data-gesture="lift"]').waitFor();
        await page.mouse.move(throwPick.x + throwPick.width / 2 + 110, throwPick.y + throwPick.height / 2 - 50, { steps: 12 });
        const releasePoses = await tossTargets.evaluateAll((targets) => targets.slice(0, 2).map((target) => target.dataset.position.split(",").map(Number)));
        await page.mouse.up();
        await tray.locator('.dice-tray-scene[data-phase="request"]').waitFor();
        const flightFrames = await page.evaluate(() => new Promise((resolve) => {
          const start = performance.now(), frames = [];
          const sample = (now) => {
            frames.push([...document.querySelectorAll(".dice-pick-target")].slice(0, 2)
              .map((target) => target.dataset.position.split(",").map(Number)));
            if (now - start < 350) requestAnimationFrame(sample);
            else resolve(frames);
          };
          requestAnimationFrame(sample);
        }));
        check(flightFrames.length > 2 && flightFrames.every((frame) => JSON.stringify(frame) === JSON.stringify(releasePoses)),
          "released dice stay held while the authoritative result is unavailable");
        check(await tossTargets.evaluateAll((targets) => targets.slice(0, 2).every((target) =>
          target.dataset.appearance === "numbered")),
        "preparation keeps the existing numbered dice visible");
        check(diceState.rolls.length === resultsBeforeToss &&
          await tray.locator(".dice-tray-scene").getAttribute("data-rolling") === "false",
        "neither local physics nor local results start ahead of the server");
        await page.screenshot({ path: join(screenshots, "desktop-dice-unconfirmed-flight.png") });
        releaseTossResponse(); diceResponseGate = null;
        await tossSaved;
        const tossId = dicePosts.at(-1).requestId;
        await tray.getByRole("alert").waitFor();
        await page.waitForFunction(() => document.querySelector(".dice-tray-scene")?.dataset.gesture === "");
        check(JSON.stringify(await tossTargets.evaluateAll((targets) => targets.map((target) => target.dataset.position))) === JSON.stringify(posesBeforeToss),
          "a failed gesture request restores original dice positions");
        check(dicePosts.length === postsBeforeToss + 1, "grabbing and releasing the held group share one request");
        await tray.locator(".dice-stage-roll").click();
        await page.waitForFunction((id) => !!document.querySelector(`[data-die-id="${id}:1"]`), tossId);
        await tray.locator('.dice-tray-scene[data-phase="idle"][data-rolling="false"]').waitFor();
        check(dicePosts.length === postsBeforeToss + 2 && dicePosts.at(-1).requestId === tossId && dicePosts.at(-1).notation === "1d6+1d20",
          "a dragged selection retries the same grouped roll");
        check(dicePosts.at(-1).result === undefined && dicePosts.at(-1).velocity === undefined,
          "drag gestures affect presentation, never client-supplied results");
        check(await stationary.getAttribute("data-position") === stationaryPose,
        "unselected die stays stationary during a gesture throw");
        check(await tray.locator(`[data-die-id="${tossId}:0"]`).getAttribute("data-top-face") === "4" &&
          await tray.locator(`[data-die-id="${tossId}:1"]`).getAttribute("data-top-face") === "12",
        "dragged dice settle on the server's faces");
        await page.screenshot({ path: join(screenshots, "desktop-dice-toss-result.png") });
        await openTool("公式与预设");
        check(await tray.getByLabel("投掷可见性").inputValue() === "public" &&
          await tray.getByLabel("修正", { exact: true }).inputValue() === "0",
        "selection settings do not overwrite the whole-tray formula settings");
        await tray.getByLabel("骰子公式").fill("1d6");
        await tray.locator(".dice-roll-button").click();
        await page.waitForFunction(() => document.querySelectorAll(".dice-pick-target").length === 1 &&
          document.querySelector(".dice-pick-target")?.dataset.faceValue === "4");
        await tray.locator('.dice-tray-scene[data-phase="idle"][data-rolling="false"]').waitFor();
      }
      const d6Pick = await tray.locator(".dice-pick-target").first().boundingBox();
      const d6Before = await tray.locator(".dice-pick-target").first().getAttribute("data-die-id");
      await page.mouse.click(d6Pick.x + d6Pick.width / 2, d6Pick.y + d6Pick.height / 2);
      await tray.getByRole("button", { name: /^(投掷|重投)这颗骰子$/ }).click();
      await page.waitForFunction((oldId) => {
        const target = document.querySelector(".dice-pick-target");
        return target?.dataset.dieId !== oldId && target?.dataset.faceValue === "4";
      }, d6Before);
      await tray.locator('.dice-tray-scene[data-phase="idle"][data-rolling="false"]').waitFor();
      check(await tray.locator(".dice-pick-target").first().getAttribute("data-top-face") === "4",
        "default d6 lands with the server's four pips facing up");
      const landedPick = await tray.locator(".dice-pick-target").first().boundingBox();
      const oldDieId = await tray.locator(".dice-pick-target").first().getAttribute("data-die-id");
      await page.mouse.click(landedPick.x + landedPick.width / 2, landedPick.y + landedPick.height / 2);
      const rerollSaved = page.waitForResponse((response) => new URL(response.url()).pathname.endsWith("/functions/v1/roll-dice"));
      await tray.getByRole("button", { name: "重投这颗骰子", exact: true }).click();
      await rerollSaved;
      await page.waitForFunction((oldId) => document.querySelector(".dice-pick-target")?.dataset.dieId !== oldId, oldDieId);
      await tray.locator('.dice-tray-scene[data-phase="idle"][data-rolling="false"]').waitFor();
      check(dicePosts.at(-1).parentId !== undefined, "single-die reroll links to its original record");
      const retainedId = await tray.locator(".dice-pick-target").first().getAttribute("data-die-id");
      const retainedBefore = await tray.locator(".dice-pick-target").first().boundingBox();
      await page.mouse.click(retainedBefore.x + retainedBefore.width / 2, retainedBefore.y + retainedBefore.height / 2);
      await addFromDie();
      await page.waitForFunction(() => [...document.querySelectorAll(".dice-pick-target")].at(-1)?.dataset.topFace);
      const occupiedAfterAdd = await tray.locator(".dice-pick-target").evaluateAll((targets) => targets.map((target) => target.dataset.footprint.split(",").map(Number)));
      check(occupiedAfterAdd[0][1] <= occupiedAfterAdd[1][0] || occupiedAfterAdd[0][0] >= occupiedAfterAdd[1][1] ||
        occupiedAfterAdd[0][3] <= occupiedAfterAdd[1][2] || occupiedAfterAdd[0][2] >= occupiedAfterAdd[1][3],
      "adding beside a settled die uses free floor space");
      const extraPick = await tray.locator(".dice-pick-target").last().boundingBox();
      await page.mouse.click(extraPick.x + extraPick.width / 2, extraPick.y + extraPick.height / 2);
      const extraSaved = page.waitForResponse((response) => new URL(response.url()).pathname.endsWith("/functions/v1/roll-dice"));
      await tray.getByRole("button", { name: "投掷这颗骰子", exact: true }).click();
      await extraSaved;
      await page.waitForFunction(() => [...document.querySelectorAll(".dice-pick-target")].every((target) => target.dataset.faceValue === "4"));
      await tray.locator('.dice-tray-scene[data-phase="idle"][data-rolling="false"]').waitFor();
      const retainedAfter = await tray.locator(`[data-die-id="${retainedId}"]`).boundingBox();
      check(Math.abs(retainedAfter.x - retainedBefore.x) < 1 && Math.abs(retainedAfter.y - retainedBefore.y) < 1,
        "single-die throw preserves other dice positions");
      await openTool("公式与预设");
      await tray.getByLabel("骰子公式", { exact: true }).fill("1d20+5");
      await tray.getByLabel("投掷用途", { exact: true }).fill("潜行检定");
      await tray.getByLabel("投掷可见性").selectOption("self");
      rejectDiceOnce = true;
      await tray.locator(".dice-roll-button").click();
      await tray.getByRole("alert").waitFor();
      const firstRequest = dicePosts.at(-1).requestId;
      await tray.locator(".dice-popover").getByRole("button", { name: "重试这次投掷", exact: true }).click();
      await page.waitForFunction(() => document.querySelector(".dice-pick-target")?.dataset.faceValue === "12");
      check(dicePosts.at(-1).requestId === firstRequest, "failed roll retries preserve request identity");
      check(dicePosts.at(-1).result === undefined, "client never submits a random result");
      await tray.locator('.dice-tray-scene[data-phase="idle"][data-rolling="false"]').waitFor();
      check(await tray.locator(".dice-pick-target").first().getAttribute("data-top-face") === "12",
        "3D top face matches the server die result");
      check(await tray.locator(".dice-pick-target").first().getAttribute("data-face-value") === "12",
        "result is attached to the picked die");
      const privatePick = await tray.locator(".dice-pick-target").first().boundingBox();
      await page.mouse.click(privatePick.x + privatePick.width / 2, privatePick.y + privatePick.height / 2);
      await tray.locator('.dice-fan-menu[data-fan-ready="true"]').waitFor();
      check(await tray.locator(".dice-fan-action").count() === 6, "private result fan includes detail and reveal actions");
      await page.waitForFunction(() => document.querySelector(".dice-fan-menu")
        ?.getAnimations({ subtree: true }).every((animation) => animation.playState === "finished"));
      await page.screenshot({ path: join(screenshots, `${scenario.label}-dice-result-menu.png`) });
      await tray.getByRole("button", { name: "关闭骰子选项", exact: true }).click();
      await tray.locator(".dice-fan-menu").waitFor({ state: "detached" });
      await openTool("投掷记录");
      await page.waitForFunction(() => document.querySelector(".dice-popover")?.dataset.positioned === "true" &&
        document.querySelector(".dice-popover").getAnimations().every((animation) => animation.playState === "finished"));
      await page.screenshot({ path: join(screenshots, `${scenario.label}-dice-history-popover.png`) });
      check(await tray.locator(".dice-record summary strong").first().textContent() === "17", "server total is shown");
      await tray.locator(".dice-record summary").first().click();
      check(await tray.locator(".dice-breakdown").first().isVisible(), "per-die result details expand");
      await tray.locator(".dice-record").first().getByRole("button", { name: "公开结果", exact: true }).click();
      await tray.locator(".dice-record").first().getByText("已公开", { exact: true }).waitFor();
      check(diceState.rolls[0].revealed_at !== null, "private roll reveal persists");
      await openTool("公式与预设");
      await tray.getByRole("button", { name: "保存为预设", exact: true }).click();
      await tray.getByLabel("预设名称").fill("潜行");
      await tray.getByLabel("房间共享").check();
      await tray.getByRole("button", { name: "保存", exact: true }).click();
      await tray.locator(".dice-preset-list").getByText("潜行", { exact: true }).waitFor();
      check(diceState.presets[0].shared, "GM can create a shared roll preset");
      await tray.getByRole("button", { name: "收起面板", exact: true }).click();
      await tray.locator(".dice-popover").waitFor({ state: "detached" });
      await page.screenshot({ path: join(screenshots, `${scenario.label}-dice.png`) });
      await openTool("全员检定");
      const checkPopover = tray.getByRole("dialog", { name: "检定面板", exact: true });
      await checkPopover.locator(".dice-check-form").waitFor({ state: "visible" });
      check(await checkPopover.locator(".dice-check-form").isVisible(), "group checks use the same floating menu");
      await page.mouse.click(8, scenario.height - 24);
      await checkPopover.waitFor({ state: "detached" });
      check(await tray.isVisible(), "clicking outside dismisses only the popover");
      await openTool("公式与预设");
      await tray.getByLabel("投掷可见性").selectOption("blind");
      redactBlindReceipt = true;
      await tray.locator(".dice-roll-button").click();
      await page.waitForFunction(() => document.querySelector(".dice-pick-target")?.getAttribute("aria-label")?.includes("暗骰"));
      await tray.locator('.dice-tray-scene[data-phase="idle"][data-rolling="false"]').waitFor();
      check(await tray.locator(".dice-pick-target").first().getAttribute("data-face-value") === "",
        "blind receipt does not expose a result on its 3D die");
      check(await tray.locator(".dice-pick-target").first().getAttribute("data-top-face") === "",
        "blind die does not publish a numeric top face");
      const blindPick = await tray.locator(".dice-pick-target").first().boundingBox();
      await page.mouse.click(blindPick.x + blindPick.width / 2, blindPick.y + blindPick.height / 2);
      await tray.getByRole("button", { name: "移出骰盘", exact: true }).click();
      check(await tray.locator(".dice-pick-target").count() === 0, "tray can be emptied");
      await openTool("添加骰子");
      await tray.getByRole("dialog", { name: "添加骰型", exact: true }).getByRole("button", { name: "d100", exact: true }).click();
      await page.waitForFunction(() => document.querySelectorAll(".dice-pick-target").length === 2 &&
        [...document.querySelectorAll(".dice-pick-target")].every((target) => target.dataset.position));
      check(await tray.locator(".dice-pick-target").count() === 2, "empty tray can add a percentile pair through More");
      if (scenario.label === "mobile") {
        await tray.getByRole("button", { name: "多选骰子", exact: true }).click();
        const units = await tray.locator(".dice-pick-target").last().boundingBox();
        await page.touchscreen.tap(units.x + units.width / 2, units.y + units.height / 2);
        check(await tray.locator('.dice-pick-target[aria-pressed="true"]').count() === 2,
          "touching either percentile die selects both halves of one d100");
        await page.touchscreen.tap(units.x + units.width / 2, units.y + units.height / 2);
        check(await tray.locator('.dice-pick-target[aria-pressed="true"]').count() === 0,
          "touching a selected percentile die deselects the whole pair");
        await tray.getByRole("button", { name: "完成骰子多选", exact: true }).click();
      }
      if (!scenario.reduced) {
        await openTool("公式与预设");
        await tray.getByLabel("投掷可见性").selectOption("public");
        await tray.getByRole("button", { name: "收起面板", exact: true }).click();
        await tray.locator(".dice-popover").waitFor({ state: "detached" });
        let releaseResponse;
        diceResponseGate = new Promise((resolve) => { releaseResponse = resolve; releaseHeldResponse = resolve; });
        const beforeResponse = diceState.rolls.length;
        await tray.locator(".dice-stage-roll").click();
        await tray.locator('.dice-tray-scene[data-phase="request"]').waitFor();
        const waitingFrames = await page.evaluate(() => new Promise((resolve) => {
          const started = performance.now(), frames = [];
          const sample = () => {
            frames.push([...document.querySelectorAll(".dice-pick-target")].map((target) =>
              [target.dataset.position, target.dataset.orientation]));
            if (performance.now() - started < 350) setTimeout(sample, 16);
            else resolve(frames);
          };
          sample();
        }));
        check(waitingFrames.every((frame) => JSON.stringify(frame) === JSON.stringify(waitingFrames[0])) &&
          diceState.rolls.length === beforeResponse,
          "button rolls remain at rest while the server response is pending");
        check(await tray.locator(".dice-tray-scene").getAttribute("data-rolling") === "false",
          "the player never starts a provisional roll");
        check(await tray.locator(".dice-pick-target").evaluateAll((targets) =>
          targets.every((target) => target.dataset.appearance === "numbered" && target.dataset.faceTransform === "0,0,0,1")),
          "waiting uses the original numbered models without blank faces");
        await page.screenshot({ path: join(screenshots, `${scenario.label}-dice-result-first-wait.png`) });
        releaseResponse(); diceResponseGate = null;
        await tray.locator('.dice-tray-scene[data-rolling="true"]').waitFor();
        await tray.locator('.dice-tray-scene[data-phase="idle"][data-rolling="false"]').waitFor();
        check(await tray.locator(".dice-pick-target").count() === 2, "one prepared replay includes both percentile dice");
        check(await tray.locator(".dice-pick-target").evaluateAll((targets) => targets.every((target) =>
          target.dataset.topFace === target.dataset.faceValue && Number(target.dataset.faceAlignment) > .9999)),
          "delayed percentile results settle with an unambiguous face");
      }
      if (scenario.label === "desktop") {
        // A previous 4 must not remain visible as an unconfirmed 4, then turn
        // into 2 after the server replies. Exercise real numbered geometry.
        await openTool("公式与预设");
        await tray.getByLabel("骰子公式", { exact: true }).fill("1d6");
        await tray.locator(".dice-roll-button").click();
        await tray.locator('.dice-tray-scene[data-phase="idle"][data-rolling="false"]').waitFor();
        await page.waitForFunction(() => document.querySelectorAll(".dice-pick-target").length === 1 &&
          document.querySelector(".dice-pick-target")?.dataset.topFace === "4");
        const readyD6 = tray.locator(".dice-pick-target");
        await readyD6.focus(); await page.keyboard.press("Enter");
        await page.waitForFunction(() => document.querySelector(".dice-fan-menu")?.dataset.interactive === "true");
        const previousFour = await readyD6.getAttribute("data-die-id");
        const originalModel = await readyD6.getAttribute("data-model-instance");
        const location = await readyD6.boundingBox();
        forcedD6Value = 2;
        const postsBeforePreparation = dicePosts.length;
        const preparedResponse = page.waitForResponse((response) => new URL(response.url()).pathname.endsWith("/functions/v1/roll-dice"));
        await page.mouse.move(location.x + location.width / 2, location.y + location.height / 2);
        await page.mouse.down();
        await tray.locator('.dice-tray-scene[data-gesture="lift"]').waitFor();
        await preparedResponse;
        await page.mouse.move(location.x + location.width / 2 - 70, location.y + location.height / 2 + 30, { steps: 8 });
        await tray.locator('.dice-tray-scene[data-hand-preparation="ready"]').waitFor();
        check(await readyD6.getAttribute("data-die-id") === previousFour &&
          await readyD6.getAttribute("data-appearance") === "numbered",
          "a result arriving while held does not replace or roll the selected die");
        check(dicePosts.length === postsBeforePreparation + 1, "long press starts result preparation before release");
        const heldPose = await readyD6.evaluate((target) => ({
          position: target.dataset.position.split(",").map(Number),
          orientation: target.dataset.orientation.split(",").map(Number),
        }));
        const releasedAt = await page.evaluate(() => performance.now());
        await page.mouse.up();
        await tray.locator('.dice-tray-scene[data-phase="replay"][data-rolling="true"]').waitFor();
        const firstFlight = await readyD6.evaluate((target) => ({
          time: performance.now(), y: Number(target.dataset.position.split(",")[1]),
        }));
        check(firstFlight.time - releasedAt < 200,
          "a prepared hand throw starts flying without replaying the stationary preparation prefix");
        check(firstFlight.y <= heldPose.position[1] + .08, "release follows the prepared pose instead of lifting again");
        await page.bringToFront();
        const handoffFrames = await page.evaluate(() => new Promise((resolve) => {
          const started = performance.now(), frames = [];
          let idleAt = null;
          const collect = (now) => {
            const target = document.querySelector(".dice-pick-target");
            const phase = document.querySelector(".dice-tray-scene")?.dataset.phase;
            frames.push({
              time: Number(document.querySelector(".dice-tray-scene")?.dataset.frameTime ?? now), phase, face: target?.dataset.visibleFace,
              model: target?.dataset.modelInstance, body: target?.dataset.faceTransform,
              marks: target?.dataset.marksTransform, rotation: target?.dataset.orientation.split(",").map(Number),
            });
            if (phase === "idle" && idleAt === null) idleAt = now;
            if (now - started < 8000 && (idleAt === null || now - idleAt < 350))
              setTimeout(() => collect(performance.now()), 16);
            else resolve(frames);
          };
          collect(performance.now());
        }));
        check(handoffFrames.every((frame) => frame.model === originalModel && frame.body === "0,0,0,1" && frame.marks === "0,0,0,1"),
          "response handoff never replaces the d6 model or rotates its pips separately from its body");
        const jumps = handoffFrames.flatMap((frame, i) => {
          if (!i) return [];
          const previous = handoffFrames[i - 1];
          const dot = Math.abs(frame.rotation.reduce((sum, value, axis) => sum + value * previous.rotation[axis], 0));
          const angle = 2 * Math.acos(Math.min(1, dot));
          return angle <= Math.max(.18, 26 * (frame.time - previous.time) / 1000) ? [] :
            [{ phase: frame.phase, angle, deltaMs: frame.time - previous.time }];
        });
        check(jumps.length === 0, `preparation and replay have no orientation snaps: ${JSON.stringify(jumps.slice(0, 3))}`);
        check(handoffFrames.filter((frame) => frame.phase === "idle").every((frame) => frame.face === "2"),
          "the first and every subsequent settled face is the server's two");
        check(dicePosts.length === postsBeforePreparation + 1, "release plays the prepared result without another network roll");
        await page.waitForFunction((id) => {
          const target = document.querySelector(".dice-pick-target");
          return target?.dataset.dieId !== id && target?.dataset.appearance === "numbered" && target?.dataset.topFace === "2" &&
            document.querySelector(".dice-tray-scene")?.dataset.phase === "idle";
        }, previousFour);
        const finalPose = await readyD6.evaluate((target) => [target.dataset.position, target.dataset.visualOrientation]);
        const stableFaces = await page.evaluate(() => new Promise((resolve) => {
          const start = performance.now(), faces = [];
          const collect = (now) => {
            const target = document.querySelector(".dice-pick-target");
            faces.push([target?.dataset.topFace, target?.dataset.position, target?.dataset.visualOrientation]);
            if (now - start < 350) requestAnimationFrame(collect);
            else resolve(faces);
          };
          requestAnimationFrame(collect);
        }));
        check(stableFaces.every(([face, position, rotation]) => face === "2" &&
          position === finalPose[0] && rotation === finalPose[1]),
        "after first settling on two, both visible pips and pose remain unchanged on every later frame");
        await page.screenshot({ path: join(screenshots, "desktop-d6-confirmed-two.png") });
        // A new move immediately before release must finish the newest
        // preparation, retain this request, and still arrive at its own face.
        await readyD6.focus(); await page.keyboard.press("Enter");
        await tray.locator('.dice-fan-menu[data-interactive="true"]').waitFor();
        const quickLocation = await readyD6.boundingBox();
        const postsBeforeQuick = dicePosts.length;
        forcedD6Value = 5;
        await page.mouse.move(quickLocation.x + quickLocation.width / 2, quickLocation.y + quickLocation.height / 2);
        await page.mouse.down();
        await tray.locator('.dice-tray-scene[data-gesture="lift"]').waitFor();
        await page.mouse.move(quickLocation.x + quickLocation.width / 2 + 60, quickLocation.y + quickLocation.height / 2 - 25, { steps: 2 });
        await page.mouse.up();
        await page.waitForFunction(() => document.querySelector(".dice-tray-scene")?.dataset.phase === "idle" &&
          document.querySelector(".dice-pick-target")?.dataset.topFace === "5");
        check(dicePosts.length === postsBeforeQuick + 1, "quick release uses the same prepared request and never a stale trajectory");
        await page.screenshot({ path: join(screenshots, "desktop-d6-quick-release.png") });
        forcedD6Value = null;
        await openTool("公式与预设");
        const beforeInvalid = dicePosts.length;
        await tray.getByLabel("骰子公式", { exact: true }).fill("1d1");
        await tray.locator(".dice-roll-button").click();
        await tray.getByRole("alert").waitFor();
        check(await tray.getByLabel("骰子公式", { exact: true }).isEditable() && dicePosts.length === beforeInvalid,
          "a definitively invalid formula unlocks editing without a server roll");
        await tray.getByLabel("骰子公式", { exact: true }).fill("1d6");
        await tray.getByRole("button", { name: "收起面板", exact: true }).click();
      }
      await tray.getByRole("button", { name: "关闭", exact: true }).click();
      check(await page.locator(".world").getAttribute("style") === boardBeforeDice,
        "closing independent dice layer preserves the board camera");
    }
    if (process.env.HP_MOTION_DICE_ONLY) {
      check(errors.length === 0, `no dice browser errors: ${errors.join("; ")}`);
      await context.close();
      continue;
    }
    check(await page.locator('.board-clock[data-clock-style="digital"]').count() === 1,
      "shared clock style is rendered");
    check((await page.locator(".clock-zone").textContent()) === "AD.2026",
      "shared clock era and year are rendered");
    const transitions = await page.evaluate(() => window.transitionLog);
    check(scenario.reduced || scenario.unsupported ? transitions.length === 0 : transitions[0]?.ready, "native transition is ready or safely bypassed");

    const settleView = async () => {
      await page.waitForFunction(() => !document.querySelector(".world").getAnimations().length);
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    };
    const cameraGeometry = () => page.evaluate(() => {
      const world = document.querySelector(".world");
      const viewport = document.querySelector(".viewport").getBoundingClientRect();
      const board = document.querySelector(".board").getBoundingClientRect();
      const frame = document.querySelector(".world > .board-frame").getBoundingClientRect();
      const matrix = new DOMMatrixReadOnly(getComputedStyle(world).transform);
      return {
        scale: matrix.a,
        cx: (viewport.width / 2 - matrix.e) / matrix.a,
        cy: (viewport.height / 2 - matrix.f) / matrix.a,
        board: { x: board.x, y: board.y, width: board.width, height: board.height },
        frameFits: frame.left >= viewport.left - 1 && frame.right <= viewport.right + 1 &&
          frame.top >= viewport.top - 1 && frame.bottom <= viewport.bottom + 1,
        area: board.width * board.height / (innerWidth * innerHeight) * 100,
        notes: [...document.querySelectorAll(".user-note")].map((note) => [note.dataset.noteId, note.style.left, note.style.top]),
      };
    });
    await settleView();
    const originalView = await cameraGeometry();
    check(Math.abs(originalView.board.width / originalView.board.height - 16 / 9) < 0.0001, "board is exactly 16:9");
    check(originalView.frameFits, "overview fits the real frame inside the usable viewport");
    if (scenario.label === "desktop") {
      await page.getByRole("button", { name: "设置战役时钟" }).click();
      await page.locator(".clock-settings-dialog").waitFor();
      await page.getByRole("tab", { name: "倒计时" }).click();
      const clockDialog = page.locator(".clock-settings-dialog");
      await clockDialog.getByLabel("纪元", { exact: true }).fill("uc");
      await clockDialog.locator('input[type="number"]').nth(0).fill("79");
      await clockDialog.locator(".clock-duration-fields input").nth(0).fill("1");
      await clockDialog.locator(".clock-duration-fields input").nth(1).fill("2");
      await clockDialog.locator(".clock-duration-fields input").nth(2).fill("3");
      await clockDialog.getByText("辉光管", { exact: true }).click();
      await clockDialog.getByRole("button", { name: "开始" }).click();
      await page.screenshot({
        path: join(screenshots, "desktop-clock-settings.png"),
      });
      const clockSaved = page.waitForResponse((response) =>
        new URL(response.url()).pathname.endsWith("/update_campaign_clock"));
      await clockDialog.getByRole("button", { name: "保存共享时钟" }).click();
      await clockSaved;
      check(clockWrites === 1, "GM saves the shared clock through its own RPC");
      check(board.settings.clock_config.mode === "countdown", "countdown mode is persisted");
      check(board.settings.clock_config.style === "nixie", "nixie style is persisted");
      check(board.settings.clock_config.era === "UC" && board.settings.clock_config.eraYear === 79,
        "custom era and year are persisted");
      check(await page.locator('.board-clock[data-clock-style="nixie"][data-clock-mode="countdown"]').count() === 1,
        "saved clock mode and style update immediately");
      check((await page.locator(".clock-zone").textContent()) === "UC.0079",
        "custom science-fiction era is displayed with four-digit year");
      const quartzSaved = page.waitForResponse((response) =>
        new URL(response.url()).pathname.endsWith("/update_campaign_clock"));
      await page.getByRole("button", { name: "设置战役时钟" }).click();
      await page.locator(".clock-settings-dialog").waitFor();
      await page.locator(".clock-settings-dialog").getByText("石英", { exact: true }).click();
      await page.locator(".clock-settings-dialog").getByRole("button", { name: "保存共享时钟" }).click();
      await quartzSaved;
      check(clockWrites === 2, "clock style changes use the same isolated RPC");
      check(await page.locator('.board-clock[data-clock-style="quartz"] .quartz-dial').count() === 1,
        "quartz preset renders its physical dial");
      for (const [width, height] of [[1366, 768], [1920, 1080], [2560, 1080], [900, 1300], [768, 1024]]) {
        await page.setViewportSize({ width, height });
        await settleView();
        const measured = await cameraGeometry();
        check(measured.frameFits, `whole frame is visible at ${width}x${height}`);
        check(JSON.stringify(measured.notes) === JSON.stringify(originalView.notes), "window resizing never rewrites note coordinates");
        if (width === 1920) check(measured.area > 68, "desktop board uses more than 68% of page area");
        if (width === 900) check(measured.scale > 0.38, "tablet overview has no artificial 38% cap");
        console.log(`Board ${width}x${height}: ${measured.board.width.toFixed(1)}x${measured.board.height.toFixed(1)}, ${measured.area.toFixed(1)}% page area`);
      }
      await page.setViewportSize({ width: scenario.width, height: scenario.height });
      await settleView();
    }
    if (scenario.label === "mobile") {
      await page.getByRole("button", { name: "设置战役时钟" }).click();
      const mobileClockDialog = page.locator(".clock-settings-dialog");
      await mobileClockDialog.waitFor();
      const dialogGeometry = await mobileClockDialog.evaluate((element) => ({
        width: element.getBoundingClientRect().width,
        viewport: innerWidth,
        overflow: element.scrollWidth > element.clientWidth,
      }));
      check(Math.abs(dialogGeometry.width - dialogGeometry.viewport) < 1,
        "clock settings use the full phone width");
      check(!dialogGeometry.overflow,
        "clock settings have no horizontal overflow on phones");
      await page.screenshot({
        path: join(screenshots, "mobile-clock-settings.png"),
      });
      await mobileClockDialog.getByRole("button", { name: "关闭" }).click();
    }
    check(await page.locator(".board-view-controls").count() === 0,
      "manual board view controls are absent");
    const boardPoint = async (x, y) => page.locator(".board").evaluate((element, point) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x + point.x / element.offsetWidth * rect.width, y: rect.y + point.y / element.offsetHeight * rect.height };
    }, { x, y });
    const blank = await boardPoint(1800, 500);
    const fixedTransform = await page.locator(".world").evaluate((element) => element.style.transform);
    await page.mouse.move(blank.x, blank.y);
    await page.mouse.down();
    await page.mouse.move(blank.x + 30, blank.y + 20, { steps: 3 });
    await page.mouse.up();
    check(await page.locator(".world").evaluate((element) => element.style.transform) === fixedTransform,
      "dragging blank board space does not pan the board");
    await page.mouse.move(blank.x, blank.y);
    await page.mouse.wheel(0, -100);
    check(await page.locator(".world").evaluate((element) => element.style.transform) === fixedTransform,
      "mouse wheel does not zoom the board");
    if (scenario.label === "mobile") {
      const cdp = await context.newCDPSession(page);
      const firstFinger = await boardPoint(1680, 450);
      const secondFinger = await boardPoint(1960, 450);
      const middle = { x: (firstFinger.x + secondFinger.x) / 2, y: firstFinger.y };
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [
        { id: 1, ...firstFinger }, { id: 2, ...secondFinger },
      ] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [
        { id: 1, x: middle.x + (firstFinger.x - middle.x) * 1.5, y: middle.y },
        { id: 2, x: middle.x + (secondFinger.x - middle.x) * 1.5, y: middle.y },
      ] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      check(await page.locator(".world").evaluate((element) => element.style.transform) === fixedTransform,
        "two-finger gesture does not zoom or pan the board");
      await cdp.detach();
    }
    if (scenario.label === "desktop") {
      const moveNoteTo = async (x) => {
        const note = page.locator(`[data-note-id="${noteId}"]`);
        const originX = await note.evaluate((element) => Number.parseFloat(element.style.left));
        const box = await note.boundingBox();
        const scale = (await cameraGeometry()).scale;
        const saved = page.waitForResponse((response) => response.url().endsWith("/move_note"));
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width / 2 + (x - originX) * scale, box.y + box.height / 2, { steps: 6 });
        await page.mouse.up();
        await saved;
        await page.waitForFunction(({ id, x }) => Number.parseFloat(document.querySelector(`[data-note-id="${id}"]`).style.left) === x, { id: noteId, x });
      };
      await moveNoteTo(1800);
      check(board.notes.find((note) => note.id === noteId).x === 1800, "note saves in the new right-hand area");
      check(await page.locator(`.note-link-line[data-from-note-id="${noteId}"]`).getAttribute("x1") === "1938", "note link uses expanded world coordinates");
      await moveNoteTo(1100);
      const moveTasksTo = async (x) => {
        const module = page.locator('[data-module="tasks"]');
        const sign = module.locator(".sign");
        await sign.hover();
        const box = await sign.boundingBox();
        const originX = await module.evaluate((element) => Number.parseFloat(element.style.left));
        const scale = (await cameraGeometry()).scale;
        const saved = page.waitForResponse((response) => response.url().endsWith("/move_board_module"));
        await page.mouse.move(box.x + 35, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + 35 + (x - originX) * scale, box.y + box.height / 2, { steps: 6 });
        await page.mouse.up();
        await saved;
      };
      await moveTasksTo(1550);
      check(board.settings.module_layout.tasks.x === 1550, "module saves in the expanded board area");
      await page.setViewportSize({ width: 390, height: 844 });
      await page.locator(".focus-dock").getByRole("button", { name: "工作指示", exact: true }).click();
      await settleView();
      const focused = await page.locator('[data-module="tasks"]').evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const viewport = document.querySelector(".viewport").getBoundingClientRect();
        return Math.abs((rect.left + rect.right) / 2 - (viewport.left + viewport.right) / 2) < 1 &&
          Math.abs((rect.top + rect.bottom) / 2 - (viewport.top + viewport.bottom) / 2) < 1;
      });
      check(focused, "mobile focus follows the moved module instead of old hardcoded coordinates");
      await page.locator(".focus-dock").getByRole("button", { name: "公告板全览", exact: true }).click();
      await settleView();
      await page.setViewportSize({ width: scenario.width, height: scenario.height });
      await settleView();
      await moveTasksTo(490);
      check(board.settings.module_layout.tasks.x === 490, "module can move back without changing other objects");
    }

    if (scenario.width < 761) {
      const dock = page.locator(".focus-dock");
      await dock.getByRole("button", { name: "工作指示", exact: true }).click();
      await page.waitForFunction(() => {
        const mark = document.querySelector(".focus-dock-indicator").getBoundingClientRect();
        const active = document.querySelector(".focus-dock .is-active").getBoundingClientRect();
        return Math.abs(mark.left - active.left) < 2;
      });
      check(await dock.getByRole("button", { name: "工作指示" }).getAttribute("aria-current") === "location", "mobile dock follows current region");
      await dock.getByRole("button", { name: "队员排班", exact: true }).click();
    }

    const clockSection = page.locator(".event-clock-section");
    const clockDialog = page.getByRole("dialog", { name: "设置「事件钟」", exact: true });
    const openClockManager = async () => {
      await clockSection.getByRole("button", { name: "编辑事件钟模块", exact: true }).click();
      await clockDialog.waitFor();
    };
    check(await clockSection.getByRole("button", { name: "发起事件钟", exact: true }).count() === 0 &&
      await clockSection.getByRole("button", { name: "查看所有事件钟", exact: true }).count() === 0,
      "clock settings and creation are absent from the module header");
    await openClockManager();
    await clockDialog.getByLabel("事件钟当前进度", { exact: true }).selectOption("7");
    await clockDialog.getByRole("button", { name: "保存事件钟", exact: true }).click();
    await clockDialog.locator(".event-clock-list").getByRole("button", { name: /汉堡屋指数/ })
      .filter({ hasText: "绿1" }).waitFor();
    await clockDialog.getByRole("button", { name: "关闭", exact: true }).click();
    await clockDialog.waitFor({ state: "hidden" });
    await page.waitForFunction(() => document.querySelector(".event-clock-name strong .motion-text-value")?.textContent === "绿1");
    check(await clockSection.getByRole("progressbar").getAttribute("aria-valuenow") === "7",
      "legacy index keeps its named status stages inside the generic module");
    check(await clockSection.getAttribute("data-complete") === "false", "status scales do not trigger at the end");
    await openClockManager();
    await clockDialog.getByRole("button", { name: "新建事件钟", exact: true }).click();
    await clockDialog.getByLabel("事件名称", { exact: true }).fill("被追捕");
    await clockDialog.getByLabel("事件钟总格数", { exact: true }).fill("6");
    await clockDialog.getByLabel("事件钟起始进度", { exact: true }).fill("1");
    await clockDialog.getByLabel("事件后果", { exact: true }).fill("追兵发现藏身处，立即进入冲突。");
    const moduleBeforeClock = await page.locator('[data-module="index"]').getAttribute("style");
    await clockDialog.getByRole("button", { name: "发起事件钟", exact: true }).click();
    await clockDialog.locator(".event-clock-list").getByRole("button", { name: /被追捕/ }).waitFor();
    await clockDialog.getByRole("button", { name: "关闭", exact: true }).click();
    await clockDialog.waitFor({ state: "hidden" });
    await clockSection.getByRole("progressbar", { name: "被追捕进度", exact: true }).waitFor();
    check(await clockSection.getByRole("progressbar").getAttribute("aria-valuenow") === "1",
      "GM starts a named six-segment event clock at one");
    check(await page.locator('[data-module="index"]').getAttribute("style") === moduleBeforeClock,
      "creating a clock preserves the existing board module position");
    // Delayed save: optimistic progress should be visible before the RPC ends.
    let releaseClock;
    eventClockGate = new Promise((resolve) => { releaseClock = resolve; });
    await clockSection.getByRole("button", { name: "被追捕进度加一", exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.event-clock-section [role="progressbar"]')?.getAttribute("aria-valuenow") === "2");
    check(eventClocks.find((clock) => clock.name === "被追捕").progress === 1, "progress displays before network confirmation");
    releaseClock(); eventClockGate = null;
    await clockSection.getByRole("button", { name: "被追捕进度加一", exact: true }).waitFor();
    await page.waitForFunction(() => !document.querySelector('[aria-label="被追捕进度加一"]').disabled);
    rejectEventClock = true;
    await clockSection.getByRole("button", { name: "被追捕进度加一", exact: true }).click();
    await clockSection.getByRole("alert").waitFor();
    await page.waitForFunction(() => document.querySelector('.event-clock-section [role="progressbar"]')?.getAttribute("aria-valuenow") === "2");
    check(eventClocks.find((clock) => clock.name === "被追捕").progress === 2, "failed progress updates restore the saved value");
    rejectEventClock = false;
    await openClockManager();
    await clockDialog.locator(".event-clock-list").getByRole("button", { name: /被追捕/ }).click();
    await clockDialog.getByLabel("事件钟当前进度", { exact: true }).fill("5");
    await clockDialog.getByRole("button", { name: "保存事件钟", exact: true }).click();
    await clockDialog.locator(".event-clock-list").getByRole("button", { name: /被追捕/ })
      .filter({ hasText: "5/6" }).waitFor();
    await clockDialog.getByRole("button", { name: "关闭", exact: true }).click();
    await clockDialog.waitFor({ state: "hidden" });
    await clockSection.getByRole("button", { name: "被追捕进度加一", exact: true }).click();
    await page.waitForFunction(() => document.querySelector(".event-clock-section")?.dataset.complete === "true");
    check(await clockSection.getByRole("status").textContent() === "事件已满",
      "full progress highlights a compact completion signal");
    await clockSection.getByRole("button", { name: "查看被追捕的后果", exact: true }).click();
    const clockDetails = page.locator(".event-clock-details-dialog");
    await clockDetails.waitFor();
    check(await clockDetails.locator(".event-clock-readonly > p").textContent() === "追兵发现藏身处，立即进入冲突。",
      "the details view preserves the full actual consequence");
    await clockDetails.getByRole("button", { name: "关闭", exact: true }).click();
    check(await clockSection.getByRole("button", { name: "被追捕进度加一", exact: true }).isDisabled(),
      "clock progress cannot overflow");
    await page.waitForFunction(() => document.querySelector(".event-clock-name strong .motion-text-value")?.textContent === "6/6" &&
      [...document.querySelectorAll(".event-clock-section .motion-text-value")].every((element) => !element.getAnimations().length));
    await page.screenshot({ path: join(screenshots, `${scenario.label}-event-clock.png`) });
    await clockSection.getByRole("button", { name: "被追捕进度减一", exact: true }).click();
    await page.waitForFunction(() => document.querySelector(".event-clock-section")?.dataset.complete === "false");
    check(await clockSection.getByRole("progressbar").getAttribute("aria-valuenow") === "5",
      "progress can be rolled back and clears the consequence highlight");
    const swapLog = await page.evaluate(() => window.motionLog.filter((item) => item.classes === "motion-text-value"));
    check(scenario.reduced ? swapLog.length === 0 : swapLog.some((item) => item.duration === 120) && swapLog.some((item) => item.duration === 220), "status uses short swaps or reduced-motion bypass");

    if (scenario.width < 761) {
      await page.locator(".focus-dock").getByRole("button", { name: "工作指示", exact: true }).click();
    }
    await page.getByRole("button", { name: "审核通过", exact: true }).click();
    await page.waitForFunction(() => document.querySelector(".done-paper [data-task-id='test-quest']") && document.querySelector(".done-paper .task-count .motion-text-value")?.textContent === "1");
    check(await page.locator(".todo-paper .task-count .motion-text-accessible").textContent() === "0", "active task count follows server transition");
    check(await page.locator(".done-paper .task-count .motion-text-accessible").textContent() === "1", "completed count follows server transition");

    if (scenario.width > 1024) {
      const note = page.locator(`[data-note-id="${noteId}"]`);
      const linkedNote = page.locator(`[data-note-id="${linkedNoteId}"]`);
      const link = page.locator(`.note-link-line[data-from-note-id="${noteId}"]`);
      const linkLabel = page.locator(`.note-link-label[data-link-id="${noteLinkId}"]`);
      const position = () => note.evaluate((element) => [Number.parseFloat(element.style.left), Number.parseFloat(element.style.top)]);
      const linkedPosition = () => linkedNote.evaluate((element) => [Number.parseFloat(element.style.left), Number.parseFloat(element.style.top)]);
      if (scenario.label === "desktop") {
        const dragModule = async (key, x) => {
          const module = page.locator(`[data-module="${key}"]`);
          const sign = module.locator(".sign");
          const box = await sign.boundingBox();
          const originX = await module.evaluate((element) => Number.parseFloat(element.style.left));
          const scale = (await cameraGeometry()).scale;
          await page.mouse.move(box.x + 35, box.y + box.height / 2);
          await page.mouse.down();
          await page.mouse.move(box.x + 35 + (x - originX) * scale, box.y + box.height / 2, { steps: 6 });
          await page.mouse.up();
        };
        delayNextModuleMove = true;
        delayedModuleMoveGate = new Promise((resolve) => { releaseDelayedModuleMove = resolve; });
        const activitySaved = page.waitForResponse((response) =>
          new URL(response.url()).pathname.endsWith("/move_board_module"));
        await dragModule("activity", 1500);
        const safetySaved = page.waitForResponse((response) =>
          new URL(response.url()).pathname.endsWith("/move_board_module"));
        await dragModule("safety", 600);
        await safetySaved;
        const noteSaved = page.waitForResponse((response) =>
          new URL(response.url()).pathname.endsWith("/move_note"));
        const noteBox = await note.boundingBox();
        await page.mouse.move(noteBox.x + noteBox.width / 2, noteBox.y + noteBox.height / 2);
        await page.mouse.down();
        await page.mouse.move(noteBox.x + noteBox.width / 2 + 35, noteBox.y + noteBox.height / 2 - 25, { steps: 4 });
        await page.mouse.up();
        await noteSaved;
        releaseDelayedModuleMove();
        await activitySaved;
        delayedModuleMoveGate = null;
        await page.evaluate(() => new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ));
        const modulePositions = await page.evaluate(() => Object.fromEntries(
          ["activity", "safety"].map((key) => {
            const element = document.querySelector(`[data-module="${key}"]`);
            return [key, Number.parseFloat(element.style.left)];
          }),
        ));
        check(modulePositions.activity === 1500 && modulePositions.safety === 600,
          "moving a note cannot roll back either recently moved module");
      }
      const initial = await position();
      const box = await note.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      check(await note.evaluate((element) => element.classList.contains("is-dragging")), "note lifts during direct manipulation");
      await page.mouse.move(box.x + box.width / 2 - 40, box.y + box.height / 2 - 30, { steps: 3 });
      const dragged = await position();
      const linkStart = await link.evaluate((element) => [Number(element.getAttribute("x1")), Number(element.getAttribute("y1"))]);
      const pinCap = page.locator(`.note-pin-cap[data-pin-note-id="${noteId}"]`);
      const capPosition = await pinCap.evaluate((element) => [Number(element.getAttribute("cx")), Number(element.getAttribute("cy"))]);
      check(
        Math.abs(linkStart[0] - (dragged[0] + 138)) < 0.1 && Math.abs(linkStart[1] - (dragged[1] + 16.5)) < 0.1,
        "linked line follows the note before pointer release",
      );
      check(
        JSON.stringify(capPosition) === JSON.stringify(linkStart),
        "pin cap follows the same live endpoint as the line",
      );
      check(
        await page.locator(".note-pin-caps").evaluate((element) => Number(getComputedStyle(element).zIndex)) >
          await page.locator(".note-links").evaluate((element) => Number(getComputedStyle(element).zIndex)),
        "pin caps render above the red string",
      );
      rejectMove = true;
      await page.mouse.up();
      await page.waitForFunction(({ noteId, initial }) => {
        const note = document.querySelector(`[data-note-id="${noteId}"]`);
        return Number.parseFloat(note.style.left) === initial[0] && Number.parseFloat(note.style.top) === initial[1] && !note.getAnimations().length;
      }, { noteId, initial });
      check(JSON.stringify(await position()) === JSON.stringify(initial), "failed move restores server position");
      const rolledBackLink = await link.evaluate((element) => [Number(element.getAttribute("x1")), Number(element.getAttribute("y1"))]);
      check(
        rolledBackLink[0] === initial[0] + 138 && rolledBackLink[1] === initial[1] + 16.5,
        "failed move restores the linked line endpoint",
      );
      check(await note.evaluate((element) => getComputedStyle(element).zIndex) === "101", "failed move restores the global note layer");
      rejectMove = false;

      const moveInventoryTo = async (x) => {
        const module = page.locator('[data-module="inventory"]');
        const sign = module.locator(".sign");
        const box = await sign.boundingBox();
        const originX = await module.evaluate((element) => Number.parseFloat(element.style.left));
        const scale = (await cameraGeometry()).scale;
        const settingsSaved = page.waitForResponse((response) =>
          new URL(response.url()).pathname.endsWith("/move_board_module"),
        );
        await page.mouse.move(box.x + 35, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(
          box.x + 35 + (x - originX) * scale,
          box.y + box.height / 2,
          { steps: 6 },
        );
        await page.mouse.up();
        await settingsSaved;
        await page.evaluate(() => new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ));
      };

      delayedMoveId = noteId;
      delayedMoveGate = new Promise((resolve) => { releaseDelayedMove = resolve; });
      const firstBox = await note.boundingBox();
      await page.mouse.move(firstBox.x + firstBox.width / 2, firstBox.y + firstBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(firstBox.x + firstBox.width / 2 + 55, firstBox.y + firstBox.height / 2 - 35, { steps: 3 });
      await page.mouse.up();
      const firstMoved = await position();

      await moveInventoryTo(1500);
      check(
        JSON.stringify(await position()) === JSON.stringify(firstMoved),
        "moving the inventory title preserves a note whose save is still pending",
      );

      const secondBox = await linkedNote.boundingBox();
      await page.mouse.move(secondBox.x + secondBox.width / 2, secondBox.y + secondBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(secondBox.x + secondBox.width / 2 + 45, secondBox.y + secondBox.height / 2 + 30, { steps: 3 });
      const secondMoved = await linkedPosition();
      const liveLine = await link.evaluate((element) => ["x1", "y1", "x2", "y2"].map((name) => Number(element.getAttribute(name))));
      const liveLabel = await linkLabel.evaluate((element) => [Number.parseFloat(element.style.left), Number.parseFloat(element.style.top)]);
      check(JSON.stringify(await position()) === JSON.stringify(firstMoved), "moving a linked note does not reset the previous note");
      check(
        Math.abs(liveLine[0] - (firstMoved[0] + 138)) < 0.1 &&
          Math.abs(liveLine[1] - (firstMoved[1] + 16.5)) < 0.1 &&
          Math.abs(liveLine[2] - (secondMoved[0] + 138)) < 0.1 &&
          Math.abs(liveLine[3] - (secondMoved[1] + 16.5)) < 0.1,
        "both line endpoints retain their live note positions",
      );
      check(
        Math.abs(liveLabel[0] - (liveLine[0] + liveLine[2]) / 2) < 0.1 &&
          Math.abs(liveLabel[1] - (liveLine[1] + liveLine[3]) / 2) < 0.1,
        "link label follows the live line midpoint",
      );
      const linkedBoardResponse = page.waitForResponse((response) =>
        new URL(response.url()).pathname.endsWith("/get_campaign_board"),
      );
      await page.mouse.up();
      const secondSettled = secondMoved.map(Math.round);
      await linkedBoardResponse;
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve())));
      check(JSON.stringify(await position()) === JSON.stringify(firstMoved), "a completed linked-note save preserves the previous note position");
      check(JSON.stringify(await linkedPosition()) === JSON.stringify(secondSettled), "the second note settles at its rounded saved position");
      releaseDelayedMove();
      delayedMoveGate = null;
      delayedMoveId = null;
      await page.waitForFunction(({ noteId, linkedNoteId, firstMoved, secondSettled }) => {
        const first = document.querySelector(`[data-note-id="${noteId}"]`);
        const second = document.querySelector(`[data-note-id="${linkedNoteId}"]`);
        return Number.parseFloat(first.style.left) === firstMoved[0] &&
          Number.parseFloat(first.style.top) === firstMoved[1] &&
          Number.parseFloat(second.style.left) === secondSettled[0] &&
          Number.parseFloat(second.style.top) === secondSettled[1];
      }, { noteId, linkedNoteId, firstMoved, secondSettled });
      await moveInventoryTo(40);
      check(
        JSON.stringify(await position()) === JSON.stringify(firstMoved),
        "moving the inventory title again preserves the saved note position",
      );

      await note.getByRole("button", { name: "上移一层", exact: true }).click();
      await page.waitForFunction(({ noteId, linkedNoteId }) =>
        getComputedStyle(document.querySelector(`[data-note-id="${noteId}"]`)).zIndex === "102" &&
        getComputedStyle(document.querySelector(`[data-note-id="${linkedNoteId}"]`)).zIndex === "101",
      { noteId, linkedNoteId });
      check(
        board.notes.find((item) => item.id === noteId).layer === 2 && board.notes.find((item) => item.id === linkedNoteId).layer === 1,
        "global layer controls swap adjacent notes without duplicate levels",
      );
      await note.getByRole("button", { name: "下移一层", exact: true }).click();
      await page.waitForFunction((noteId) => getComputedStyle(document.querySelector(`[data-note-id="${noteId}"]`)).zIndex === "101", noteId);

      await note.focus();
      await page.keyboard.press("Enter");
      const colorEditor = page.getByRole("dialog", { name: "编辑便签", exact: true });
      await colorEditor.waitFor();
      check(await colorEditor.getByRole("group", { name: "便签颜色", exact: true }).isVisible(), "note color and pin color share the note editor");
      await colorEditor.getByRole("radio", { name: "图钉蓝色", exact: true }).locator("..").click();
      check(await note.getAttribute("data-pin-color") === "red", "unsaved pin color remains in the draft");
      await colorEditor.getByRole("button", { name: "取消", exact: true }).click();
      await colorEditor.waitFor({ state: "hidden" });
      check(await note.getAttribute("data-pin-color") === "red", "cancelling the editor does not change the pin");
      await note.focus();
      await page.keyboard.press("Enter");
      await colorEditor.waitFor();
      check(await colorEditor.getByRole("radio", { name: "图钉红色", exact: true }).isChecked(), "reopening the editor restores the persisted pin color");
      await colorEditor.getByRole("radio", { name: "图钉蓝色", exact: true }).locator("..").click();
      if (scenario.label === "desktop") {
        await colorEditor.screenshot({ path: join(screenshots, "desktop-note-colors.png") });
      }
      await colorEditor.getByRole("button", { name: "保存", exact: true }).click();
      await colorEditor.waitFor({ state: "hidden" });
      await page.waitForFunction((noteId) => document.querySelector(`[data-note-id="${noteId}"]`)?.dataset.pinColor === "blue", noteId);
      check(await pinCap.getAttribute("fill") === "#2785d8", "pin color updates the cap above the connection");

      await page.getByRole("button", { name: "添加 Emoji 贴纸", exact: true }).click();
      await page.getByRole("button", { name: "添加贴纸 ⭐", exact: true }).click();
      check(boardStickers.length === 0, "choosing an emoji waits for a board placement");
      check(await page.getByText("点击公告板放置，Esc 取消", { exact: true }).isVisible(), "sticker placement explains the next action");
      const boardBox = await page.locator(".board").boundingBox();
      await page.mouse.click(boardBox.x + boardBox.width * 0.48, boardBox.y + boardBox.height * 0.65);
      const emojiSticker = page.locator('[data-sticker-id="sticker-1"]');
      await emojiSticker.waitFor();
      const stickerInitial = await emojiSticker.evaluate((element) => [Number.parseFloat(element.style.left), Number.parseFloat(element.style.top)]);
      const stickerBox = await emojiSticker.boundingBox();
      await page.mouse.move(stickerBox.x + stickerBox.width / 2, stickerBox.y + stickerBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(stickerBox.x + stickerBox.width / 2 + 45, stickerBox.y + stickerBox.height / 2 + 35, { steps: 3 });
      await page.mouse.up();
      await page.waitForFunction(({ stickerInitial }) => {
        const sticker = document.querySelector('[data-sticker-id="sticker-1"]');
        return Number.parseFloat(sticker.style.left) !== stickerInitial[0] &&
          Number.parseFloat(sticker.style.top) !== stickerInitial[1];
      }, { stickerInitial });
      check(boardStickers[0].x !== stickerInitial[0] && boardStickers[0].y !== stickerInitial[1], "emoji sticker drag persists its board position");
      await emojiSticker.hover();
      await page.getByRole("button", { name: "放大贴纸 ⭐", exact: true }).click();
      await page.waitForFunction(() => document.querySelector('[data-sticker-id="sticker-1"]')?.dataset.scale === "1.25");
      await page.getByRole("button", { name: "放大贴纸 ⭐", exact: true }).waitFor();
      check(boardStickers[0].scale === 1.25 && await emojiSticker.evaluate((element) => element.style.width) === "90px",
        "sticker enlargement persists and changes its board-space size");
      rejectStickerResize = true;
      await page.getByRole("button", { name: "放大贴纸 ⭐", exact: true }).click();
      await page.waitForFunction(() => document.querySelector('[data-sticker-id="sticker-1"]')?.dataset.scale === "1.25" &&
        !document.querySelector('[aria-label="放大贴纸 ⭐"]')?.disabled);
      check(boardStickers[0].scale === 1.25, "failed sticker resize rolls back without losing saved scale");
      rejectStickerResize = false;
      await page.getByRole("button", { name: "缩小贴纸 ⭐", exact: true }).click();
      await page.waitForFunction(() => document.querySelector('[data-sticker-id="sticker-1"]')?.dataset.scale === "1");
      if (scenario.label === "desktop") {
        await page.screenshot({ path: join(screenshots, "desktop-sticker.png") });
      }
      await emojiSticker.hover();
      await page.getByRole("button", { name: "删除贴纸 ⭐", exact: true }).click();
      await emojiSticker.waitFor({ state: "hidden" });
      check(boardStickers.length === 0, "emoji sticker can be explicitly removed");

      rejectSticker = true;
      await page.getByRole("button", { name: "添加 Emoji 贴纸", exact: true }).click();
      await page.getByRole("button", { name: "添加贴纸 ⭐", exact: true }).click();
      await page.mouse.click(boardBox.x + boardBox.width * 0.48, boardBox.y + boardBox.height * 0.65);
      await page.locator(".sticker-error").waitFor();
      check(await page.locator(".sticker-error").textContent() === "服务器尚未部署此功能所需的数据库更新，请更新后重试。", "missing cloud migration surfaces an actionable sticker error");
      check(boardStickers.length === 0 && await emojiSticker.count() === 0, "a rejected sticker never appears as a saved sticker");
      rejectSticker = false;
      await page.getByRole("button", { name: "添加 Emoji 贴纸", exact: true }).click();

      const linkHit = page.locator(`.note-link-hit[data-link-id="${noteLinkId}"]`);
      await linkHit.click({ force: true });
      check(deleteLinkRequests === 0, "a single line click never deletes the connection");
      check(await link.isVisible(), "the clicked connection remains visible");
      check(await page.getByRole("button", { name: "删除连线", exact: true }).isVisible(), "line editing exposes an explicit delete button");
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "删除连线", exact: true }).waitFor({ state: "hidden" });

      await note.getByRole("button", { name: "上移一层", exact: true }).click();
      await page.waitForFunction((noteId) => getComputedStyle(document.querySelector(`[data-note-id="${noteId}"]`)).zIndex === "102", noteId);
      createLinkGate = new Promise((resolve) => { releaseCreateLink = resolve; });
      const newLinkedNote = page.locator(`[data-note-id="${newLinkedNoteId}"]`);
      await note.locator(".note-pin").click();
      await newLinkedNote.locator(".note-pin").click();
      const pendingLine = page.locator('.note-link-line[data-link-id^="pending-"]');
      await pendingLine.waitFor();
      check(await pendingLine.isVisible(), "a new connection appears before its request completes");
      check(await page.getByRole("textbox", { name: "连线说明", exact: true }).isVisible(), "the relation card appears with the pending connection");
      check(await page.locator(`.note-link-line[data-link-id="${newNoteLinkId}"]`).count() === 0, "the optimistic connection does not wait for a server id");
      releaseCreateLink();
      createLinkGate = null;
      await page.waitForFunction(({ newNoteLinkId }) =>
        document.querySelector(`.note-link-line[data-link-id="${newNoteLinkId}"]`) &&
        !document.querySelector('.note-link-line[data-link-id^="pending-"]'),
      { newNoteLinkId });
      check(await page.getByRole("textbox", { name: "连线说明", exact: true }).isVisible(), "the relation card stays open after server confirmation");
      const deletesBeforeExplicitAction = deleteLinkRequests;
      await page.getByRole("button", { name: "删除连线", exact: true }).click();
      await page.locator(`.note-link-line[data-link-id="${newNoteLinkId}"]`).waitFor({ state: "hidden" });
      check(deleteLinkRequests === deletesBeforeExplicitAction + 1, "only the explicit delete button removes a connection");

      await note.focus();
      await page.keyboard.press("Enter");
      const composer = page.getByRole("dialog", { name: "编辑便签", exact: true });
      await composer.waitFor();
      check(await composer.evaluate((element) => element.classList.contains("has-origin-motion")) !== scenario.reduced, "origin animation respects reduced motion");
      await page.keyboard.press("Escape");
      await composer.waitFor({ state: "hidden" });
      check(await note.evaluate((element) => document.activeElement === element), "origin dialog restores keyboard focus");
    } else {
      await page.locator(`[data-note-id="${noteId}"]`).focus();
      await page.keyboard.press("Enter");
      const mobileEditor = page.getByRole("dialog", { name: "编辑便签", exact: true });
      await mobileEditor.waitFor();
      check(await mobileEditor.getByRole("group", { name: "图钉颜色", exact: true }).isVisible(), "mobile note editor exposes pin colors");
      const colorBox = await mobileEditor.locator(".pin-color-field").boundingBox();
      check(colorBox.x >= 0 && colorBox.x + colorBox.width <= scenario.width, "mobile pin colors fit within the viewport");
      await mobileEditor.screenshot({ path: join(screenshots, "mobile-note-colors.png") });
      await mobileEditor.getByRole("button", { name: "取消", exact: true }).click();
      await mobileEditor.waitFor({ state: "hidden" });
    }
    const initialNotePositions = board.notes.map(({ id, x, y }) => ({ id, x, y }));
    await page.getByRole("button", { name: "打开房间配置", exact: true }).click();
    const appearanceDialog = page.getByRole("dialog", { name: "房间配置", exact: true });
    await appearanceDialog.waitFor();
    await appearanceDialog.getByRole("tab", { name: "外观", exact: true }).click();
    await appearanceDialog.getByRole("group", { name: "房间背景", exact: true }).getByRole("button", { name: "纯色", exact: true }).click();
    await appearanceDialog.getByRole("group", { name: "板面材质", exact: true }).getByRole("button", { name: "软木", exact: true }).click();
    await appearanceDialog.getByRole("group", { name: "边框样式", exact: true }).getByRole("button", { name: "木框", exact: true }).click();
    check(await appearanceDialog.locator('.board-surface[data-surface="cork"]').count() === 1, "material changes immediately in the preview");
    check(await page.locator('.board > .board-surface[data-surface="felt"]').count() === 1, "draft appearance does not change the shared board");
    await appearanceDialog.getByRole("button", { name: "取消", exact: true }).click();
    await appearanceDialog.waitFor({ state: "hidden" });
    check(appearanceWrites === 0, "cancel discards the entire appearance draft");

    await page.getByRole("button", { name: "打开房间配置", exact: true }).click();
    await appearanceDialog.waitFor();
    await appearanceDialog.getByRole("tab", { name: "外观", exact: true }).click();
    await appearanceDialog.getByRole("group", { name: "房间背景", exact: true }).getByRole("button", { name: "纯色", exact: true }).click();
    await appearanceDialog.getByRole("group", { name: "板面材质", exact: true }).getByRole("button", { name: "软木", exact: true }).click();
    await appearanceDialog.getByRole("group", { name: "边框样式", exact: true }).getByRole("button", { name: "木框", exact: true }).click();
    rejectAppearance = true;
    await appearanceDialog.getByRole("button", { name: "保存共享配置", exact: true }).click();
    await appearanceDialog.getByRole("alert").waitFor();
    check(await appearanceDialog.locator('.board-frame[data-frame="wood"]').count() === 1, "failed saves keep the theme draft for retry");
    rejectAppearance = false;
    await appearanceDialog.getByRole("button", { name: "保存共享配置", exact: true }).click();
    await appearanceDialog.waitFor({ state: "hidden" });
    check(await page.locator('.world > .board-frame[data-frame="wood"]').count() === 1, "saved frame updates independently of the wallpaper");
    check(await page.locator('.board > .board-surface[data-surface="cork"]').count() === 1, "saved board material updates");
    check(JSON.stringify(board.notes.map(({ id, x, y }) => ({ id, x, y }))) === JSON.stringify(initialNotePositions), "theme changes never move existing notes");

    await page.getByRole("button", { name: "打开房间配置", exact: true }).click();
    await appearanceDialog.waitFor();
    await appearanceDialog.getByRole("tab", { name: "外观", exact: true }).click();
    check(await appearanceDialog.getByRole("group", { name: "板面材质", exact: true }).getByRole("button", { name: "软木", exact: true }).getAttribute("aria-pressed") === "true", "saved theme is restored when reopening settings");
    await appearanceDialog.getByLabel("选择背景图片", { exact: true }).setInputFiles({
      name: "room.webp", mimeType: "image/webp", buffer: backgroundImage,
    });
    await appearanceDialog.getByLabel("选择板面纹理", { exact: true }).setInputFiles({
      name: "surface.webp", mimeType: "image/webp", buffer: backgroundImage,
    });
    await appearanceDialog.locator('.board-surface[data-surface="image"]').waitFor();
    check(imageUploads === 0, "image selection stays local until Save");
    await appearanceDialog.getByLabel("背景适配方式", { exact: true }).selectOption("contain");
    await appearanceDialog.getByRole("group", { name: "边框样式", exact: true }).getByRole("button", { name: "金属", exact: true }).click();
    if (scenario.label === "desktop" || scenario.label === "mobile") {
      await appearanceDialog.screenshot({ path: join(screenshots, `${scenario.label}-appearance.png`) });
    }
    await appearanceDialog.getByRole("button", { name: "保存共享配置", exact: true }).click();
    await appearanceDialog.waitFor({ state: "hidden" });
    check(imageUploads === 2, "both media uploads occur on save");
    check(board.settings.appearance.room.imagePath.startsWith(`${campaignId}/background-`) &&
      board.settings.appearance.surface.imagePath.startsWith(`${campaignId}/boardTexture-`), "saved image paths belong to this campaign");
    check(await page.locator(".room-background.is-wallpaper").evaluate((e) => getComputedStyle(e).backgroundSize) === "contain", "wallpaper fit is shared with all viewers");
    check(await page.locator('.world > .board-frame[data-frame="metal"]').count() === 1, "metal frame is independent of image uploads");
    await page.waitForFunction(() => getComputedStyle(document.querySelector(".room-background.is-wallpaper")).backgroundImage !== "none");
    if (scenario.label === "desktop") {
      const savedBackground = await page.locator(".room-background.is-wallpaper").evaluate((e) => getComputedStyle(e).backgroundImage);
      const workingPath = board.settings.appearance.room.imagePath;
      await page.getByRole("button", { name: "打开房间配置", exact: true }).click();
      await appearanceDialog.waitFor();
      await appearanceDialog.getByRole("tab", { name: "外观", exact: true }).click();
      board.settings.appearance.room.imagePath = `${campaignId}/broken-background.webp`;
      await appearanceDialog.getByRole("button", { name: "保存共享配置", exact: true }).click();
      await appearanceDialog.waitFor({ state: "hidden" });
      await page.waitForFunction(() => document.querySelector(".room-background.is-wallpaper")?.dataset.backgroundError === "true");
      check(await page.locator(".room-background.is-wallpaper").evaluate((e) => getComputedStyle(e).backgroundImage) === savedBackground,
        "image load failure retains the last successfully displayed wallpaper");
      board.settings.appearance.room.imagePath = workingPath;

      for (const viewport of [
        { width: 2560, height: 1080 },
        { width: 1200, height: 700 },
        { width: 900, height: 1300 },
      ]) {
        await page.setViewportSize(viewport);
        const coverage = await page.locator(".room-background.is-wallpaper").boundingBox();
        check(Math.abs(coverage.x) < 1 && Math.abs(coverage.y) < 1 &&
          Math.abs(coverage.width - viewport.width) < 1 && Math.abs(coverage.height - viewport.height) < 1,
        `wallpaper covers ${viewport.width}x${viewport.height} independently of board zoom`);
      }
      await page.setViewportSize({ width: scenario.width, height: scenario.height });
      await page.getByRole("button", { name: "打开房间配置", exact: true }).click();
      await appearanceDialog.waitFor();
      await appearanceDialog.getByRole("tab", { name: "外观", exact: true }).click();
      await appearanceDialog.getByRole("group", { name: "房间背景", exact: true }).getByRole("button", { name: "门店", exact: true }).click();
      await appearanceDialog.getByRole("group", { name: "板面材质", exact: true }).getByRole("button", { name: "黑板", exact: true }).click();
      await appearanceDialog.getByRole("group", { name: "边框样式", exact: true }).getByRole("button", { name: "汉堡店", exact: true }).click();
      await appearanceDialog.getByRole("button", { name: "保存共享配置", exact: true }).click();
      await appearanceDialog.waitFor({ state: "hidden" });
      await page.waitForFunction(() => getComputedStyle(document.querySelector(".room-background.is-wallpaper")).backgroundImage.includes("room-kitchen"));
      await page.screenshot({ path: join(screenshots, "desktop-default-theme.png") });
    }
    const worldBeforePerspective = await page.locator(".world").getAttribute("style");
    await page.getByRole("button", { name: "打开房间配置", exact: true }).click();
    await appearanceDialog.waitFor();
    await appearanceDialog.getByRole("tab", { name: "外观", exact: true }).click();
    await appearanceDialog.getByRole("group", { name: "房间背景", exact: true }).getByRole("button", { name: "路口", exact: true }).click();
    await appearanceDialog.locator('canvas[data-perspective-scene="crossing"][data-ready="true"]').waitFor();
    check(await appearanceDialog.locator("canvas").getAttribute("data-playing") === "false",
      "perspective settings preview is static even when motion is enabled");
    check(await appearanceDialog.getByLabel("动态透视", { exact: true }).isChecked(), "perspective animation is selectable");
    await appearanceDialog.getByRole("button", { name: "保存共享配置", exact: true }).click();
    await appearanceDialog.waitFor({ state: "hidden" });
    const perspectiveCanvas = page.locator('.room-background.is-wallpaper canvas');
    await page.locator('.room-background.is-wallpaper canvas[data-ready="true"]').waitFor();
    check(await perspectiveCanvas.getAttribute("data-perspective-scene") === "crossing", "saved crossing scene renders as wallpaper");
    check(await perspectiveCanvas.getAttribute("data-playing") === String(!scenario.reduced),
      "system reduced motion disables wallpaper animation");
    check(await page.locator(".world").getAttribute("style") === worldBeforePerspective,
      "perspective background does not change board geometry or zoom");
    if (!scenario.reduced) {
      await page.waitForFunction(() => Number(document.querySelector(".room-background.is-wallpaper canvas")?.dataset.time) > 1.2);
      await page.getByRole("button", { name: "打开骰盘", exact: true }).click();
      await page.locator('.dice-dialog[open]').waitFor();
      await page.waitForFunction(() => document.querySelector(".room-background.is-wallpaper canvas")?.dataset.playing === "false");
      check(await perspectiveCanvas.getAttribute("data-playing") === "false", "wallpaper pauses while WebGL dice tray is open");
      await page.locator(".dice-dialog .dice-layer-header").getByRole("button", { name: "关闭", exact: true }).click();
      await page.waitForFunction(() => document.querySelector(".room-background.is-wallpaper canvas")?.dataset.playing === "true");
    }
    await page.getByRole("button", { name: "打开房间配置", exact: true }).click();
    await appearanceDialog.waitFor();
    await appearanceDialog.getByRole("tab", { name: "外观", exact: true }).click();
    check(await appearanceDialog.getByRole("button", { name: "路口", exact: true }).getAttribute("aria-pressed") === "true",
      "the chosen perspective scene restores when settings reopen");
    await appearanceDialog.getByRole("button", { name: "车站", exact: true }).click();
    await appearanceDialog.getByLabel("动态透视", { exact: true }).uncheck();
    await appearanceDialog.getByRole("button", { name: "保存共享配置", exact: true }).click();
    await appearanceDialog.waitFor({ state: "hidden" });
    await page.locator('.room-background.is-wallpaper canvas[data-perspective-scene="station"][data-ready="true"]').waitFor();
    check(await perspectiveCanvas.getAttribute("data-playing") === "false", "static station has no continuous animation");
    check(board.settings.appearance.room.scene === "station" && board.settings.appearance.room.animated === false,
      "scene selection and motion preference are saved together");
    check(!await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), "viewport has no horizontal overflow");
    await page.waitForFunction(() => [...document.querySelectorAll(".motion-text-value")].every((element) => !element.getAnimations().length));
    await page.screenshot({ path: join(screenshots, `${scenario.label}-board.png`) });
    await page.getByRole("button", { name: "返回账号与战役", exact: true }).click();
    await page.locator(".campaign-access-rows").waitFor();
    await page.waitForFunction(() => !document.documentElement.dataset.campaignTransition);
    const returned = await page.evaluate(() => window.transitionLog);
    check(scenario.reduced || scenario.unsupported ? returned.length === 0 : returned.some((item) => item.direction === "exit" && item.ready), "return transition works or bypasses");
    // A failed fetch cannot strand the user in a covered loading screen.
    await page.locator(`[data-campaign-entry="${deniedId}"]`).click();
    await page.getByRole("alert").waitFor();
    check(await page.locator(".campaign-access-rows").isVisible(), "failed entry preserves campaign list");
    check(await entry.isEnabled(), "failed entry restores retry control");

    // The earlier drag tests deliberately leave notes on top of modules.
    // Give the public-view fixture a clear clock without changing note contents.
    board.notes = board.notes.map((note, index) => ({ ...note, x: 1780, y: 70 + index * 250 }));
    await page.locator(`.public-room-list [data-campaign-entry="${campaignId}"]`).click();
    await page.locator(".board").waitFor();
    await page.waitForFunction(() => !document.documentElement.dataset.campaignTransition);
    check(new URL(page.url()).searchParams.get("visit") === campaignId, "public visit updates URL after success");
    check(await page.getByText("访客 / 只读参观", { exact: true }).isVisible(), "public view keeps observer role");
    check(await page.locator(".dice-launcher").count() === 0, "public visitors never receive the dice tool");
    check(await page.getByRole("button", { name: "编辑事件钟模块", exact: true }).count() === 0 &&
      await page.locator(".event-clock-progress-actions").count() === 0, "visitors cannot manage or adjust shared clocks");
    await page.locator(".event-clock-section").getByRole("button", { name: "下一个事件钟", exact: true }).click();
    check(await page.getByRole("progressbar", { name: "被追捕进度", exact: true }).getAttribute("aria-valuenow") === "5",
      "visitors see the persisted clock progress and consequence");
    check(await page.locator(`.board > .board-surface[data-surface="${board.settings.appearance.surface.kind}"]`).count() === 1, "visitors read the saved appearance");
    check(await page.getByRole("button", { name: "打开房间配置", exact: true }).count() === 0, "visitors cannot edit the appearance");
    await page.getByRole("button", { name: "返回签到处", exact: true }).click();
    await page.locator(".access-screen").waitFor();
    await page.waitForFunction(() => !document.documentElement.dataset.campaignTransition);
    check(!new URL(page.url()).searchParams.has("visit"), "public return clears visit target");
    check(errors.length === 0, `no browser errors: ${errors.join("; ")}`);
    await context.close();
  }
  console.log(`${checks} motion/navigation assertions passed (Auth/RPC fixtures, desktop/mobile, reduced motion, unsupported API). Screenshots: ${screenshots}`);
} finally {
  releaseHeldResponse();
  await browser.close();
}
