// Real Chromium UI regression with isolated Auth/RPC fixtures; no production writes.
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { loadEnv } from "vite";
import { mkdir } from "node:fs/promises";
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
    let board = {
      id: campaignId, name, join_code: "TEST00", status: "active", burger_index: 5,
      members: [{ user_id: actorId, role: "gm", character_name: "验收店长", job_title: "店长", profile_text: "", active: true, joined_at: date, left_at: null }],
      resources: [], checklist_categories: [], checklist_items: [],
      quests: [{ id: "test-quest", title: "验收任务", body: "提交后等待审核", assignee_label: "服务员", due_at: null, status: "pending_review", created_by: actorId, claimed_by: actorId, submissions: [{ id: "test-submission" }] }],
      notes: [{ id: noteId, title: "验收便签", body: "直接跟手，失败回位", color: "yellow", x: 1100, y: 650, rotation: -2, created_at: date, author_id: actorId, pinned: true, pinned_at: date }],
      settings: { section_titles: {}, hidden_sections: [], is_public: true, background_path: null, note_texture_path: null }, events: [],
    };
    await context.route(`${origin}/**`, async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const body = request.postDataJSON();
      let result = [];
      let status = 200;
      if (path.endsWith("/get_service_status")) result = "ready";
      else if (path.endsWith("/ensure_actor")) result = { id: actorId, display_name: "验收账号", disabled: false };
      else if (path.endsWith("/get_gm_access")) result = { user_id: actorId, account_name: user.email, display_name: "验收账号", status: "approved", requested_at: date, reviewed_at: date, review_note: "" };
      else if (path === "/auth/v1/user") result = user;
      else if (path.endsWith("/campaign_members")) result = [campaignId, deniedId].map((id) => ({ campaign_id: id, role: "gm", character_name: "验收店长", job_title: "店长", joined_at: date, campaign: { name: id === campaignId ? name : "不可访问的战役", join_code: "TEST00", status: "active" } }));
      else if (path.endsWith("/list_public_campaigns")) result = [{ id: campaignId, name, burger_index: 5, published_at: date, message_count: 0 }];
      else if (path.endsWith("/get_campaign_board") || path.endsWith("/get_public_campaign_board")) {
        boardRequests++;
        if (body.p_campaign_id === deniedId) { status = 400; result = { message: "FORBIDDEN" }; }
        else { if (boardGate) await boardGate; result = board; }
      } else if (path.endsWith("/set_burger_index")) board = { ...board, burger_index: body.p_value };
      else if (path.endsWith("/review_quest_submission")) board.quests[0].status = body.p_approved ? "completed" : "failed";
      else if (path.endsWith("/move_note")) {
        if (rejectMove) { status = 400; result = { message: "FORBIDDEN" }; }
        else board.notes[0] = { ...board.notes[0], x: body.p_x, y: body.p_y };
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
      const position = () => note.evaluate((element) => [Number.parseFloat(element.style.left), Number.parseFloat(element.style.top)]);
      const initial = await position();
      const box = await note.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      check(await note.evaluate((element) => element.classList.contains("is-dragging")), "note lifts during direct manipulation");
      await page.mouse.move(box.x + box.width / 2 - 40, box.y + box.height / 2 - 30, { steps: 3 });
      rejectMove = true;
      await page.mouse.up();
      await page.waitForFunction(({ noteId, initial }) => {
        const note = document.querySelector(`[data-note-id="${noteId}"]`);
        return Number.parseFloat(note.style.left) === initial[0] && Number.parseFloat(note.style.top) === initial[1] && !note.getAnimations().length;
      }, { noteId, initial });
      check(JSON.stringify(await position()) === JSON.stringify(initial), "failed move restores server position");
      check(await note.evaluate((element) => getComputedStyle(element).zIndex) === "10", "failed move restores pinned layer");
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
