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
const check = (condition, message) => { assert.ok(condition, message); checks++; };
try {
  for (const scenario of [
    { label: "desktop", width: 1440, height: 900, reduced: false, unsupported: false },
    { label: "mobile", width: 390, height: 844, reduced: false, unsupported: false },
    { label: "reduced", width: 1440, height: 900, reduced: true, unsupported: false },
    { label: "fallback", width: 1440, height: 900, reduced: false, unsupported: true },
  ]) {
    const context = await browser.newContext({
      viewport: { width: scenario.width, height: scenario.height },
      reducedMotion: scenario.reduced ? "reduce" : "no-preference",
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
    let rejectMove = false;
    let delayedMoveId = null;
    let releaseDelayedMove;
    let delayedMoveGate = null;
    let releaseCreateLink;
    let createLinkGate = null;
    let deleteLinkRequests = 0;
    let boardStickers = [];
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
      members: [{ user_id: actorId, role: "gm", character_name: "验收店长", job_title: "店长", profile_text: "", active: true, joined_at: date, left_at: null }],
      resources: [], checklist_categories: [], checklist_items: [],
      quests: [{ id: "test-quest", title: "验收任务", body: "提交后等待审核", assignee_label: "服务员", due_at: null, status: "pending_review", created_by: actorId, claimed_by: actorId, submissions: [{ id: "test-submission" }] }],
      notes: [
        { id: noteId, title: "验收便签", body: "直接跟手，失败回位", color: "yellow", x: 1100, y: 650, rotation: -2, created_at: date, author_id: actorId, pinned: true, pinned_at: date, layer: 1, pin_color: "red" },
        { id: linkedNoteId, title: "连线目标", body: "验证端点同步", color: "blue", x: 820, y: 480, rotation: 1, created_at: date, author_id: actorId, pinned: false, pinned_at: null, layer: 2, pin_color: "green" },
        { id: newLinkedNoteId, title: "即时连线目标", body: "请求未完成也立即显示", color: "pink", x: 520, y: 820, rotation: -1, created_at: date, author_id: actorId, pinned: false, pinned_at: null, layer: 3, pin_color: "yellow" },
      ],
      settings: { section_titles: {}, hidden_sections: [], is_public: true, background_path: "fixtures/custom-background.webp", note_texture_path: null }, events: [],
    };
    await context.route(`${origin}/**`, async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const body = request.postDataJSON();
      let result = [];
      let status = 200;
      if (path.includes("/storage/v1/object/sign/campaign-media/")) {
        if (request.method() === "GET") {
          await route.fulfill({ contentType: "image/webp", body: backgroundImage });
          return;
        }
        result = {
          signedURL: "/object/sign/campaign-media/fixtures/custom-background.webp?token=test",
        };
      } else if (path.endsWith("/get_service_status")) result = "ready";
      else if (path.endsWith("/ensure_actor")) result = { id: actorId, display_name: "验收账号", disabled: false };
      else if (path.endsWith("/get_gm_access")) result = { user_id: actorId, account_name: user.email, display_name: "验收账号", status: "approved", requested_at: date, reviewed_at: date, review_note: "" };
      else if (path === "/auth/v1/user") result = user;
      else if (path.endsWith("/campaign_members")) result = [campaignId, deniedId].map((id) => ({ campaign_id: id, role: "gm", character_name: "验收店长", job_title: "店长", joined_at: date, campaign: { name: id === campaignId ? name : "不可访问的战役", join_code: "TEST00", status: "active" } }));
      else if (path.endsWith("/list_public_campaigns")) result = [{ id: campaignId, name, burger_index: 5, published_at: date, message_count: 0 }];
      else if (path.endsWith("/get_note_links")) result = noteLinks;
      else if (path.endsWith("/get_board_stickers")) result = boardStickers;
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
      else if (path.endsWith("/set_note_pin_color")) {
        board.notes = board.notes.map((note) => note.id === body.p_id ? { ...note, pin_color: body.p_color } : note);
        result = body.p_color;
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
        const sticker = { id: `sticker-${boardStickers.length + 1}`, campaign_id: campaignId, emoji: body.p_emoji, x: body.p_x, y: body.p_y, rotation: body.p_rotation, created_by: actorId };
        boardStickers.push(sticker);
        result = sticker;
      }
      else if (path.endsWith("/move_board_sticker")) {
        boardStickers = boardStickers.map((sticker) => sticker.id === body.p_id ? { ...sticker, x: body.p_x, y: body.p_y } : sticker);
        result = boardStickers.find((sticker) => sticker.id === body.p_id);
      }
      else if (path.endsWith("/delete_board_sticker")) {
        boardStickers = boardStickers.filter((sticker) => sticker.id !== body.p_id);
        result = body.p_id;
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
    check(
      await page.locator('.world[data-has-custom-background="true"]').isVisible(),
      "custom scene is marked after its signed image resolves",
    );
    const frameEdges = page.locator(".scene-frame > span");
    check(await frameEdges.count() === 4, "custom scene preserves all four default frame edges");
    check(
      await frameEdges.evaluateAll((elements) =>
        elements.every((element) => getComputedStyle(element).backgroundImage.includes("scene")),
      ),
      "preserved frame edges reuse the default scene artwork",
    );
    const transitions = await page.evaluate(() => window.transitionLog);
    check(scenario.reduced || scenario.unsupported ? transitions.length === 0 : transitions[0]?.ready, "native transition is ready or safely bypassed");
    check(boardRequests === 1, "mounted board reuses prepared query data");

    if (scenario.width < 761) {
      const dock = page.locator(".focus-dock");
      await dock.getByRole("button", { name: "工作指示", exact: true }).click();
      await page.waitForFunction(() => {
        const mark = document.querySelector(".focus-dock-indicator").getBoundingClientRect();
        const active = document.querySelector(".focus-dock .is-active").getBoundingClientRect();
        return Math.abs(mark.left - active.left) < 2;
      });
      check(await dock.getByRole("button", { name: "工作指示" }).getAttribute("aria-current") === "location", "mobile dock follows current region");
    }

    await page.getByRole("button", { name: "调整汉堡屋指数", exact: true }).click();
    const index = page.getByRole("dialog", { name: "调整汉堡屋指数", exact: true });
    await index.getByRole("radio", { name: "绿1", exact: true }).check();
    await index.getByRole("button", { name: "保存", exact: true }).click();
    await index.waitFor({ state: "hidden" });
    await page.waitForFunction(() => document.querySelector(".index-current strong .motion-text-value")?.textContent === "绿1");
    check(await page.locator(".index-current strong .motion-text-accessible").textContent() === "绿1", "accessible index is current");
    const swapLog = await page.evaluate(() => window.motionLog.filter((item) => item.classes === "motion-text-value"));
    check(scenario.reduced ? swapLog.length === 0 : swapLog.some((item) => item.duration === 120) && swapLog.some((item) => item.duration === 220), "status uses short swaps or reduced-motion bypass");

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

      delayedMoveId = noteId;
      delayedMoveGate = new Promise((resolve) => { releaseDelayedMove = resolve; });
      const firstBox = await note.boundingBox();
      await page.mouse.move(firstBox.x + firstBox.width / 2, firstBox.y + firstBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(firstBox.x + firstBox.width / 2 - 55, firstBox.y + firstBox.height / 2 - 35, { steps: 3 });
      await page.mouse.up();
      const firstMoved = await position();

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

      await note.getByRole("button", { name: "更改图钉颜色", exact: true }).click();
      await note.getByRole("button", { name: "图钉颜色：blue", exact: true }).click();
      await page.waitForFunction((noteId) => document.querySelector(`[data-note-id="${noteId}"]`)?.dataset.pinColor === "blue", noteId);
      check(await pinCap.getAttribute("fill") === "#2785d8", "pin color updates the cap above the connection");

      await page.getByRole("button", { name: "添加 Emoji 贴纸", exact: true }).click();
      await page.getByRole("button", { name: "添加贴纸 ⭐", exact: true }).click();
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
      if (scenario.label === "desktop") {
        await page.screenshot({ path: join(screenshots, "desktop-sticker.png") });
      }
      await emojiSticker.hover();
      await page.getByRole("button", { name: "删除贴纸 ⭐", exact: true }).click();
      await emojiSticker.waitFor({ state: "hidden" });
      check(boardStickers.length === 0, "emoji sticker can be explicitly removed");

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
    }
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

    await page.locator(`.public-room-list [data-campaign-entry="${campaignId}"]`).click();
    await page.locator(".board").waitFor();
    await page.waitForFunction(() => !document.documentElement.dataset.campaignTransition);
    check(new URL(page.url()).searchParams.get("visit") === campaignId, "public visit updates URL after success");
    check(await page.getByText("访客 / 只读参观", { exact: true }).isVisible(), "public view keeps observer role");
    await page.getByRole("button", { name: "返回签到处", exact: true }).click();
    await page.locator(".access-screen").waitFor();
    await page.waitForFunction(() => !document.documentElement.dataset.campaignTransition);
    check(!new URL(page.url()).searchParams.has("visit"), "public return clears visit target");
    check(errors.length === 0, `no browser errors: ${errors.join("; ")}`);
    await context.close();
  }
  console.log(`${checks} motion/navigation assertions passed (Auth/RPC fixtures, desktop/mobile, reduced motion, unsupported API). Screenshots: ${screenshots}`);
} finally {
  await browser.close();
}
