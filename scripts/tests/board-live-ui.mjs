// Chromium integration checks against isolated local boards; no cloud writes.
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { cloneDefaultBoard } from "../../src/features/campaign/domain/defaults.ts";
import { createStarterArchiveEntries } from "../../src/features/campaign/domain/archiveBox.ts";
import { createExtendedPanelBlock, normalizeCustomPanel } from "../../src/features/campaign/domain/customPanels.ts";

const preview = process.env.HP_PREVIEW_URL || "http://127.0.0.1:5173";
const output = process.env.HP_SCREENSHOT_DIR || join(tmpdir(), "veilboard-live-ui");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
let checks = 0;
const check = (condition, label) => { assert.ok(condition, label); checks++; };
function fixture(role = "gm") {
  const board = cloneDefaultBoard();
  const now = new Date().toISOString();
  board.viewer.role = role;
  board.settings.hiddenSections = ["inventory", "tasks", "safety", "shifts", "index", "activity"];
  board.notes = ["甲", "乙"].map((title, i) => ({
    id: `note-${i}`, title: `便签${title}`, body: "原始证词", color: "yellow", pinColor: "red", x: 970 + i * 335,
    y: 420, rotation: 0, scale: 1, effect: null, createdAt: now, authorId: board.viewer.id,
    authorName: "测试成员", pinned: false, pinnedAt: null, layer: i + 1, imagePath: null,
  }));
  board.noteLinks = [{ id: "link", fromNoteId: "note-0", toNoteId: "note-1", label: "线索关系" }];
  board.settings.customPanels = [normalizeCustomPanel({
    id: "rich", title: "战术检定", x: 30, y: 30, w: 580, h: 900, blocks: [
      { id: "meter", type: "meter_counter", label: "生命", value: 8, min: 0, max: 12, step: 1, variant: "bar" },
      { id: "tasks", type: "task_board", label: "通缉令", variant: "wanted", items: [
        { id: "target", title: "走私头目", reward: "500 金币", badge: "活捉", status: "open" },
      ] },
      createExtendedPanelBlock("dice_macro", "macros"),
      createExtendedPanelBlock("initiative_track", "order"),
      createExtendedPanelBlock("roll_table", "random"),
    ],
  })];
  board.settings.styleTokens.archiveEntries = createStarterArchiveEntries();
  board.settings.styleTokens.archiveEntries.push({ ...board.settings.styleTokens.archiveEntries[0], id: "second-clue", title: "第二份线索" },
    { ...board.settings.styleTokens.archiveEntries[2], id: "secret", title: "机密真实身份", visibility: "gm_only" });
  return board;
}
try {
  for (const scenario of [{ name: "desktop", width: 1440, height: 900 }, { name: "mobile", width: 390, height: 844 }, { name: "reduced", width: 1440, height: 900, reduced: true }]) {
    const context = await browser.newContext({ viewport: scenario, reducedMotion: scenario.reduced ? "reduce" : "no-preference", hasTouch: scenario.name === "mobile" });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await context.addInitScript((board) => {
      localStorage.setItem("veilboard-board-v3", JSON.stringify(board));
      window.notePointerEvidence = [];
      for (const type of ["pointerdown", "pointermove", "pointerup", "pointercancel"]) window.addEventListener(type, (event) => {
        if (event.target.closest?.("[data-note-id]")) window.notePointerEvidence.push({
          type, id: event.pointerId, x: event.clientX, y: event.clientY, buttons: event.buttons,
          target: event.target.className,
        });
      }, true);
    }, fixture());
    await page.goto(preview);
    await page.locator('[data-note-id="note-0"]').waitFor();
    await page.locator('[data-note-id="note-0"]').click();
    const inspector = page.getByRole("dialog", { name: "便签实时编辑" });
    await inspector.waitFor();
    check(await page.locator("dialog[open]").count() === 0, `${scenario.name}: inspector is nonmodal`);
    await page.locator('[data-note-id="note-0"]').dblclick();
    await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "便签正文");
    check(true, "double-click focuses the inspector body");
    await page.locator('[data-note-id="note-0"] .user-note-content').hover();
    const origin = await page.locator('[data-note-id="note-0"] .user-note-content').boundingBox();
    const beforeDrag = await page.locator('[data-note-id="note-0"]').evaluate((element) => ({ x: element.style.left, y: element.style.top }));
    await page.mouse.down();
    await page.mouse.move(origin.x + origin.width / 2 + 40, origin.y + origin.height / 2 + 25, { steps: 5 });
    try {
      await page.waitForFunction(() => document.querySelector(".note-live-inspector")?.getAttribute("data-dragging") === "true", undefined, { timeout: 2000 });
    } catch (error) {
      console.log(await page.evaluate(({ x, y }) => ({
        hit: document.elementFromPoint(x, y)?.outerHTML.slice(0, 400),
        note: document.querySelector('[data-note-id="note-0"]')?.className,
        selected: document.querySelector('[data-note-id="note-0"]')?.getAttribute("data-selected"),
        inspector: document.querySelector(".note-live-inspector")?.getAttribute("data-dragging"),
        gestures: window.notePointerEvidence.slice(-15),
      }), { x: origin.x + origin.width / 2, y: origin.y + origin.height / 2 }));
      throw error;
    }
    check(await inspector.getAttribute("data-dragging") === "true", "dragging dims and disables the inspector");
    await page.keyboard.press("Escape");
    await page.mouse.up();
    check(await inspector.count() === 1, "Escape cancels dragging without closing the inspector");
    check(JSON.stringify(await page.locator('[data-note-id="note-0"]').evaluate((element) => ({ x: element.style.left, y: element.style.top }))) === JSON.stringify(beforeDrag), "Escape restores the original note position");
    const grip = page.locator('[data-note-id="note-0"] .note-resize-handle');
    await grip.hover();
    const gripBox = await grip.boundingBox();
    await page.mouse.down();
    await page.mouse.move(gripBox.x + gripBox.width / 2 + 50, gripBox.y + gripBox.height / 2 + 25, { steps: 6 });
    await page.mouse.up();
    await page.waitForFunction(() => Number(document.querySelector('[data-note-id="note-0"]')?.style.getPropertyValue("--note-scale")) > 1);
    check(await inspector.count() === 1, "resize keeps the same inspector open");
    await page.getByRole("textbox", { name: "便签标题", exact: true }).fill("现场证词修订");
    await page.getByRole("textbox", { name: "便签正文", exact: true }).fill("中文输入实时保留\n第二行");
    await page.waitForFunction(() => document.querySelector('[data-note-id="note-0"] h3')?.textContent === "现场证词修订");
    check((await page.evaluate(() => JSON.parse(localStorage.getItem("veilboard-board-v3")).notes[0].title)) === "便签甲", "typing only changes the local draft");
    await inspector.getByRole("tab", { name: "外观与材质" }).click();
    await page.getByRole("textbox", { name: "便签底色的十六进制色号", exact: true }).fill("#2a5268");
    await page.getByRole("textbox", { name: "图钉颜色的十六进制色号", exact: true }).fill("#df9236");
    await page.getByRole("slider", { name: "便签缩放", exact: true }).press("Home");
    await page.getByRole("slider", { name: "便签缩放", exact: true }).press("ArrowRight");
    check(await page.locator('[data-note-id="note-0"]').getAttribute("data-color") === "#2a5268", "RGB edits reach the real note");
    check(await page.locator('[data-note-id="note-0"]').getAttribute("data-pin-color") === "#df9236", "pin edits reach the real anchor");
    await inspector.getByRole("button", { name: "全息投影便签", exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-note-id="note-0"]')?.getAttribute("data-note-shader") === "hologram");
    check(true, "hologram material previews on the actual note");
    await inspector.getByRole("button", { name: "烈焰烧焦便签", exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-note-id="note-0"]')?.getAttribute("data-note-shader") === "burnt");
    check(true, "burnt material previews on the actual note");
    await inspector.getByRole("button", { name: "经典便利贴", exact: true }).click();
    await page.screenshot({ path: join(output, `${scenario.name}-便签实时编辑.png`) });
    const bounds = await page.evaluate(() => {
      const r = document.querySelector(".note-live-inspector").getBoundingClientRect();
      const n = document.querySelector('[data-note-id="note-0"]').getBoundingClientRect();
      return { panel: { x: r.x, y: r.y, right: r.right, bottom: r.bottom }, note: { x: n.x, y: n.y, right: n.right, bottom: n.bottom } };
    });
    check(bounds.panel.x >= 0 && bounds.panel.right <= scenario.width + 1 && bounds.panel.bottom <= scenario.height + 1, "inspector fits the viewport");
    if (scenario.name === "mobile") {
      check(bounds.note.bottom < bounds.panel.y + 2, "mobile note stays above the drawer");
      check(bounds.note.right - bounds.note.x >= 180, "mobile note remains readable while editing");
    }
    else check(bounds.panel.x >= bounds.note.right || bounds.panel.right <= bounds.note.x, "desktop inspector leaves the note visible");
    await inspector.getByRole("button", { name: "还原", exact: true }).click();
    check(await page.locator('[data-note-id="note-0"] h3').textContent() === "便签甲", "restore reverts the unsaved note");
    await inspector.getByRole("tab", { name: "内容", exact: true }).click();
    await page.getByRole("textbox", { name: "便签标题", exact: true }).fill("切签自动保存");
    await inspector.getByRole("tab", { name: "全部", exact: true }).click();
    await inspector.locator(".note-inspector-directory button").filter({ hasText: "便签乙" }).click();
    await page.waitForFunction(() => document.querySelector('[aria-label="便签标题"]')?.value === "便签乙");
    check((await page.evaluate(() => JSON.parse(localStorage.getItem("veilboard-board-v3")).notes.find((n) => n.id === "note-0").title)) === "切签自动保存", "switching notes commits the preceding draft");
    await inspector.getByRole("button", { name: "关闭便签编辑" }).click();
    await page.getByRole("button", { name: /^打开档案盒/ }).click();
    const archive = page.getByRole("dialog", { name: "档案盒", exact: true });
    await archive.waitFor();
    check(await archive.getByRole("tab").count() === 4, "archive has exactly four physical categories");
    await archive.getByRole("button", { name: "下一页", exact: true }).click();
    await page.waitForFunction(() => document.querySelector(".manila-page-number")?.textContent.includes("第 2"));
    await archive.getByRole("button", { name: "上一页", exact: true }).click();
    await archive.getByRole("tab", { name: /^人物/ }).click();
    check(await archive.locator(".manila-character-card").count() === 1, "character pages use the structured dossier card");
    await page.screenshot({ path: join(output, `${scenario.name}-人物档案.png`) });
    await archive.getByRole("tab", { name: /^新闻/ }).click();
    check(await archive.locator(".manila-news-clipping").count() === 1, "news uses the newspaper layout");
    await archive.getByRole("button", { name: "编辑本页", exact: true }).click();
    await archive.getByRole("textbox", { name: "新闻标题", exact: true }).fill("测试剪报标题");
    await archive.getByRole("button", { name: "保存本页", exact: true }).click();
    await page.waitForFunction(() => document.querySelector(".manila-news-clipping h2")?.textContent === "测试剪报标题");
    check(await archive.locator(".manila-editor").count() === 0, "saving returns to the same folder page");
    await archive.getByRole("button", { name: "关闭档案盒" }).click();
    check(errors.length === 0, `${scenario.name}: no uncaught browser errors: ${errors.join(",")}`);
    await context.close();
    console.log(`${scenario.name} passed`);
  }
  const widgetContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const gameBoard = fixture();
  gameBoard.settings.customPanels.push(normalizeCustomPanel({ id: "media", title: "现场地图", x: 680, y: 30, w: 420, h: 350,
    blocks: [createExtendedPanelBlock("image_media", "map")] }));
  await widgetContext.addInitScript((board) => localStorage.setItem("veilboard-board-v3", JSON.stringify(board)), gameBoard);
  const widgetPage = await widgetContext.newPage(); await widgetPage.goto(preview);
  await widgetPage.getByRole("button", { name: "放大港口与旧灯塔", exact: true }).click();
  check(await widgetPage.locator(".atomic-image-lightbox").count() === 1, "map images open a fullscreen lightbox");
  await widgetPage.getByRole("button", { name: "关闭图片", exact: true }).click();
  await widgetPage.locator(".hig-task-trigger").click();
  await widgetPage.waitForFunction(() => document.querySelector(".hig-task-trigger")?.getAttribute("data-status") === "in_progress");
  check(await widgetPage.locator(".hig-task-meta").textContent().then((text) => text.includes("追捕中")), "wanted tasks use the chase status labels");
  await widgetPage.getByRole("button", { name: "下一位 →", exact: true }).click();
  await widgetPage.waitForFunction(() => document.querySelector(".atomic-initiative-list li[data-active=true]")?.textContent.includes("码头守卫"));
  check(await widgetPage.locator(".atomic-initiative-list li[data-active=true]").textContent().then((text) => text.includes("码头守卫")), "initiative advances the active actor");
  await widgetPage.getByRole("button", { name: "随机抽取", exact: true }).click();
  await widgetPage.waitForFunction(() => !!document.querySelector(".atomic-roll-table [data-picked=true]"));
  check(await widgetPage.locator(".atomic-roll-table [data-picked=true]").count() === 1, "weighted table highlights one authoritative draw");
  await widgetPage.getByRole("button", { name: "贴成便签", exact: true }).click();
  await widgetPage.waitForFunction(() => document.querySelectorAll(".user-note").length === 3);
  check(true, "drawn table entries can be saved as notes");
  await widgetPage.locator(".atomic-macro-buttons button").filter({ hasText: "侦查" }).click();
  await widgetPage.locator(".dice-layer-header").waitFor();
  await widgetPage.waitForFunction((campaignId) => {
    const state = JSON.parse(localStorage.getItem(`hp-dice:${campaignId}`) ?? "{}");
    return state.rolls?.some((roll) => roll.label === "侦查" && roll.notation === "1d100" && roll.visibility === "public" && roll.result);
  }, gameBoard.campaign.id);
  check(true, "macro launches the dice workspace and rolls the requested formula and visibility");
  await widgetContext.close();
  for (const role of ["player", "observer"]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addInitScript((board) => localStorage.setItem("veilboard-board-v3", JSON.stringify(board)), fixture(role));
    const page = await context.newPage(); await page.goto(preview);
    await page.getByRole("button", { name: /^打开档案盒/ }).click();
    const archive = page.getByRole("dialog", { name: "档案盒", exact: true });
    await archive.getByRole("tab", { name: /^人物/ }).click();
    check(await archive.getByRole("button", { name: "编辑本页", exact: true }).count() === 0, `${role}: no editing controls`);
    await archive.getByRole("button", { name: "搜索档案", exact: true }).click();
    await archive.getByRole("searchbox", { name: "搜索档案", exact: true }).fill("机密");
    check(await archive.locator(".manila-directory strong").count() === 0, `${role}: secret pages excluded from search`);
    await context.close();
  }
  console.log(`${checks} live-note and archive Chromium checks passed. Screenshots: ${output}`);
} finally { await browser.close(); }
